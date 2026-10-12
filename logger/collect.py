"""Poll the Transport for NSW Car Park API and log occupancy snapshots to SQLite.

Usage:
    python3 -m logger.collect            # poll every facility once
    python3 -m logger.collect --loop 300 # poll every 5 minutes until stopped

Needs TFNSW_API_KEY in the environment or in a .env file at the project root.
"""

import argparse
import json
import os
import sqlite3
import sys
import time
import urllib.error
import urllib.request
import zlib
from datetime import datetime, timezone
from pathlib import Path

API_BASE = "https://api.transport.nsw.gov.au/v1/carpark"
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DB = ROOT / "data" / "carparks.db"
REQUEST_GAP_SECONDS = 0.25  # API allows 5 req/s; stay well under it

SCHEMA = """
CREATE TABLE IF NOT EXISTS facilities (
    facility_id   TEXT PRIMARY KEY,
    name          TEXT,
    suburb        TEXT,
    latitude      REAL,
    longitude     REAL,
    capacity      INTEGER,
    updated_at    TEXT
);

CREATE TABLE IF NOT EXISTS snapshots (
    facility_id   TEXT NOT NULL,
    message_date  TEXT NOT NULL,  -- when TfNSW says the reading was taken
    polled_at     TEXT NOT NULL,  -- when we fetched it (UTC)
    capacity      INTEGER,
    occupied      INTEGER,
    raw           BLOB,           -- zlib-compressed JSON, so we can re-parse later
    PRIMARY KEY (facility_id, message_date)
);
"""


def load_api_key():
    key = os.environ.get("TFNSW_API_KEY")
    env_file = ROOT / ".env"
    if not key and env_file.exists():
        for line in env_file.read_text().splitlines():
            name, _, value = line.partition("=")
            if name.strip() == "TFNSW_API_KEY":
                key = value.strip().strip("'\"")
    if not key:
        sys.exit("TFNSW_API_KEY not set. Add it to .env (see .env.example).")
    return key


def fetch_json(url, api_key):
    request = urllib.request.Request(url, headers={"Authorization": f"apikey {api_key}"})
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.load(response)


def to_int(value):
    """The API returns numbers as strings, and sometimes as null."""
    try:
        return int(value)
    except (TypeError, ValueError):
        return None


def to_float(value):
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def parse_facility(payload):
    """Pull the fields we care about out of one facility response."""
    location = payload.get("location") or {}
    occupancy = payload.get("occupancy") or {}
    return {
        "facility_id": str(payload["facility_id"]),
        "name": payload.get("facility_name"),
        "suburb": location.get("suburb"),
        "latitude": to_float(location.get("latitude")),
        "longitude": to_float(location.get("longitude")),
        "capacity": to_int(payload.get("spots")),
        "occupied": to_int(occupancy.get("total")),
        "message_date": payload.get("MessageDate") or payload.get("time"),
    }


def save(db, payload, polled_at):
    """Store one facility reading. Returns True if it was new."""
    row = parse_facility(payload)
    db.execute(
        """INSERT INTO facilities (facility_id, name, suburb, latitude, longitude, capacity, updated_at)
           VALUES (:facility_id, :name, :suburb, :latitude, :longitude, :capacity, :polled_at)
           ON CONFLICT(facility_id) DO UPDATE SET
               name=excluded.name, suburb=excluded.suburb, latitude=excluded.latitude,
               longitude=excluded.longitude, capacity=excluded.capacity, updated_at=excluded.updated_at""",
        {**row, "polled_at": polled_at},
    )
    # The feed only changes every few minutes; the primary key drops repeat readings.
    cursor = db.execute(
        """INSERT OR IGNORE INTO snapshots (facility_id, message_date, polled_at, capacity, occupied, raw)
           VALUES (?, ?, ?, ?, ?, ?)""",
        (
            row["facility_id"],
            row["message_date"] or polled_at,
            polled_at,
            row["capacity"],
            row["occupied"],
            zlib.compress(json.dumps(payload).encode()),
        ),
    )
    return cursor.rowcount == 1


def poll_once(db, api_key):
    facilities = fetch_json(API_BASE, api_key)  # {facility_id: name}
    polled_at = datetime.now(timezone.utc).isoformat(timespec="seconds")
    new, failed = 0, 0
    for facility_id in facilities:
        time.sleep(REQUEST_GAP_SECONDS)
        try:
            payload = fetch_json(f"{API_BASE}?facility={facility_id}", api_key)
            new += save(db, payload, polled_at)
        except (urllib.error.URLError, KeyError, ValueError) as error:
            failed += 1
            print(f"  facility {facility_id}: {error}", file=sys.stderr)
    db.commit()
    print(f"{polled_at}  {len(facilities)} facilities, {new} new readings, {failed} failed")


def connect(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.executescript(SCHEMA)
    return db


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--loop", type=int, metavar="SECONDS", help="keep polling at this interval")
    parser.add_argument("--db", type=Path, default=DEFAULT_DB)
    args = parser.parse_args()

    api_key = load_api_key()
    db = connect(args.db)
    while True:
        try:
            poll_once(db, api_key)
        except urllib.error.URLError as error:
            # Keep the loop alive through network drops and API outages.
            print(f"poll failed: {error}", file=sys.stderr)
            if not args.loop:
                sys.exit(1)
        if not args.loop:
            break
        time.sleep(args.loop)


if __name__ == "__main__":
    main()
