"""Other places to park near a station: OpenStreetMap car parks plus community known spots.

The two sources are kept separate (OSM in data/nearby_parking.json, community
spots in their own SQLite database) so user contributions don't become part of
the ODbL-licensed OSM data.
"""

import json
import sqlite3
from datetime import datetime, timedelta, timezone
from pathlib import Path

from logger.collect import ROOT
from planner.osm_parking import OUTPUT as OSM_FILE, distance_m, walk_minutes

COMMUNITY_DB = ROOT / "var" / "community.db"
MAX_SPOT_METRES = 1500  # community spots must be within walking distance of the station
STALE_AFTER = timedelta(days=90)  # hide community spots nobody has confirmed lately
MAX_SUGGEST_WALK = 15  # minutes
DUPLICATE_METRES = 60
REPORT_REASONS = {"wrong_info", "not_allowed", "owner_request", "other"}
REPORTS_TO_HIDE = 2  # reports since the last confirmation before a spot is hidden
PRIVATE_LAND_WARNING = "Private land: check the signs. You may get a parking notice or be towed."

SCHEMA = """
CREATE TABLE IF NOT EXISTS spots (
    id                 INTEGER PRIMARY KEY,
    carpark_id         TEXT NOT NULL,
    name               TEXT NOT NULL,
    lat                REAL NOT NULL,
    lon                REAL NOT NULL,
    notes              TEXT,
    created_at         TEXT NOT NULL,
    last_confirmed_at  TEXT NOT NULL,
    confirmations      INTEGER NOT NULL DEFAULT 1,  -- the person who added it counts
    hidden             INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS spots_carpark ON spots (carpark_id);

CREATE TABLE IF NOT EXISTS reports (
    spot_id     INTEGER NOT NULL REFERENCES spots (id),
    reason      TEXT NOT NULL,
    details     TEXT,
    created_at  TEXT NOT NULL
);
"""


class SpotError(ValueError):
    pass


def with_warning(spot):
    """Add the private-land warning to anything that isn't known to be public."""
    warning = None if spot["access"] == "public" else PRIVATE_LAND_WARNING
    return {**spot, "warning": warning}


class NearbyParking:
    def __init__(self, osm_file=OSM_FILE, db_path=COMMUNITY_DB):
        osm_file = Path(osm_file)
        self.osm = json.loads(osm_file.read_text())["carparks"] if osm_file.exists() else {}
        if str(db_path) != ":memory:":
            Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(db_path, check_same_thread=False)
        self.db.row_factory = sqlite3.Row
        self.db.executescript(SCHEMA)

    def station(self, carpark):
        """(lat, lon) of the station a car park serves, or the car park itself if unknown."""
        station = self.osm.get(carpark.id, {}).get("station")
        return (station["lat"], station["lon"]) if station else (carpark.lat, carpark.lon)

    def community_json(self, row, station):
        return with_warning({
            "id": f"community:{row['id']}",
            "name": row["name"],
            "kind": "community",
            "source": "community",
            "lat": row["lat"],
            "lon": row["lon"],
            "walk_minutes": walk_minutes((row["lat"], row["lon"]), station),
            "capacity": None,
            "access": "unknown",
            "fee": None,
            "max_stay": None,
            "notes": row["notes"],
            "confirmations": row["confirmations"],
            "last_confirmed_at": row["last_confirmed_at"],
        })

    def for_carpark(self, carpark, now=None):
        """All nearby spots for a car park, closest first."""
        now = now or datetime.now(timezone.utc)
        station = self.station(carpark)
        rows = self.db.execute(
            "SELECT * FROM spots WHERE carpark_id = ? AND last_confirmed_at >= ? AND NOT hidden",
            (carpark.id, (now - STALE_AFTER).isoformat(timespec="seconds")),
        ).fetchall()
        spots = [self.community_json(r, station) for r in rows]
        spots += [
            with_warning(s) for s in self.osm.get(carpark.id, {}).get("spots", [])
            # A community spot usually describes the same lot as the OSM entry under it.
            if not any(distance_m((s["lat"], s["lon"]), (c["lat"], c["lon"])) <= DUPLICATE_METRES for c in spots)
        ]
        # Community tips first when the walk is the same; they carry local knowledge.
        return sorted(spots, key=lambda s: (s["walk_minutes"], s["source"] != "community"))

    def suggest(self, spots):
        """Best alternative when the official car park is full: public or community-known, short walk."""
        usable = [
            s for s in spots
            if s["walk_minutes"] <= MAX_SUGGEST_WALK and (s["access"] == "public" or s["source"] == "community")
        ]
        return usable[0] if usable else None

    def add(self, carpark, name, lat, lon, notes=None, now=None):
        name, notes = name.strip(), (notes or "").strip() or None
        if not 1 <= len(name) <= 80:
            raise SpotError("name must be 1–80 characters")
        if notes and len(notes) > 280:
            raise SpotError("notes must be at most 280 characters")
        station = self.station(carpark)
        if distance_m((lat, lon), station) > MAX_SPOT_METRES:
            raise SpotError(f"spot must be within {MAX_SPOT_METRES} m of the station")
        stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
        cursor = self.db.execute(
            """INSERT INTO spots (carpark_id, name, lat, lon, notes, created_at, last_confirmed_at)
               VALUES (?, ?, ?, ?, ?, ?, ?)""",
            (carpark.id, name, lat, lon, notes, stamp, stamp),
        )
        self.db.commit()
        return self.get(cursor.lastrowid, station)

    def confirm(self, spot_id, now=None):
        stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
        cursor = self.db.execute(
            "UPDATE spots SET confirmations = confirmations + 1, last_confirmed_at = ? WHERE id = ?",
            (stamp, spot_id),
        )
        self.db.commit()
        if cursor.rowcount == 0:
            raise KeyError(spot_id)

    def report(self, spot_id, reason, details=None, now=None):
        """Flag a community spot. Owner requests hide it at once; otherwise it takes a few reports."""
        if reason not in REPORT_REASONS:
            raise SpotError(f"reason must be one of: {', '.join(sorted(REPORT_REASONS))}")
        if details and len(details) > 280:
            raise SpotError("details must be at most 280 characters")
        row = self.db.execute("SELECT last_confirmed_at FROM spots WHERE id = ?", (spot_id,)).fetchone()
        if row is None:
            raise KeyError(spot_id)
        stamp = (now or datetime.now(timezone.utc)).isoformat(timespec="seconds")
        self.db.execute(
            "INSERT INTO reports (spot_id, reason, details, created_at) VALUES (?, ?, ?, ?)",
            (spot_id, reason, details, stamp),
        )
        # Confirming a spot resets the count: only reports since then matter.
        recent = self.db.execute(
            "SELECT COUNT(*) FROM reports WHERE spot_id = ? AND created_at >= ?",
            (spot_id, row["last_confirmed_at"]),
        ).fetchone()[0]
        if reason == "owner_request" or recent >= REPORTS_TO_HIDE:
            self.db.execute("UPDATE spots SET hidden = 1 WHERE id = ?", (spot_id,))
        self.db.commit()

    def carpark_id_of(self, spot_id):
        row = self.db.execute("SELECT carpark_id FROM spots WHERE id = ?", (spot_id,)).fetchone()
        if row is None:
            raise KeyError(spot_id)
        return row["carpark_id"]

    def get(self, spot_id, station):
        row = self.db.execute("SELECT * FROM spots WHERE id = ?", (spot_id,)).fetchone()
        if row is None:
            raise KeyError(spot_id)
        return self.community_json(row, station)
