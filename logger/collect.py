"""Poll the Transport for NSW Car Park API and log occupancy snapshots to CSV.

Usage:
    python3 -m logger.collect                            # poll every facility once
    python3 -m logger.collect --loop 300                 # poll every 5 minutes until stopped
    python3 -m logger.collect --loop 300 --duration 3300 # ...for 55 minutes (used by CI)

Needs TFNSW_API_KEY in the environment or in a .env file at the project root.

Output (kept small and append-only so it can be committed to git):
    data/facilities.csv             one row per car park: name, location, capacity
    data/snapshots/YYYY-MM-DD.csv   one row per new reading, dated in Sydney time
"""

import argparse
import csv
import json
import os
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

API_BASE = "https://api.transport.nsw.gov.au/v1/carpark"
ROOT = Path(__file__).resolve().parent.parent
DEFAULT_DATA_DIR = ROOT / "data"
SYDNEY = ZoneInfo("Australia/Sydney")
REQUEST_GAP_SECONDS = 0.25  # API allows 5 req/s; stay well under it

FACILITY_FIELDS = ["facility_id", "name", "suburb", "latitude", "longitude", "capacity"]
SNAPSHOT_FIELDS = ["message_date", "polled_at", "facility_id", "capacity", "occupied"]


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


class Store:
    """Appends readings to today's CSV, skipping ones already recorded."""

    def __init__(self, data_dir):
        self.data_dir = Path(data_dir)
        self.snapshot_dir = self.data_dir / "snapshots"
        self.snapshot_dir.mkdir(parents=True, exist_ok=True)

    def snapshot_path(self, now):
        return self.snapshot_dir / f"{now.astimezone(SYDNEY).date()}.csv"

    def seen(self, path):
        if not path.exists():
            return set()
        with path.open(newline="") as f:
            return {(row["facility_id"], row["message_date"]) for row in csv.DictReader(f)}

    def append(self, rows, now):
        """Write readings not already in today's file. Returns how many were new."""
        path = self.snapshot_path(now)
        seen = self.seen(path)
        # The feed only changes every few minutes, so most polls repeat the last reading.
        new_rows = [r for r in rows if (r["facility_id"], r["message_date"]) not in seen]
        is_new_file = not path.exists()
        with path.open("a", newline="") as f:
            writer = csv.DictWriter(f, SNAPSHOT_FIELDS, extrasaction="ignore")
            if is_new_file:
                writer.writeheader()
            writer.writerows(new_rows)
        return len(new_rows)

    def update_facilities(self, rows):
        path = self.data_dir / "facilities.csv"
        facilities = {}
        if path.exists():
            with path.open(newline="") as f:
                facilities = {row["facility_id"]: row for row in csv.DictReader(f)}
        for row in rows:
            facilities[row["facility_id"]] = row
        with path.open("w", newline="") as f:
            writer = csv.DictWriter(f, FACILITY_FIELDS, extrasaction="ignore")
            writer.writeheader()
            writer.writerows(sorted(facilities.values(), key=lambda r: r["facility_id"]))


def poll_once(store, api_key):
    facility_ids = fetch_json(API_BASE, api_key)  # {facility_id: name}
    now = datetime.now(timezone.utc)
    polled_at = now.isoformat(timespec="seconds")
    rows, failed = [], 0
    for facility_id in facility_ids:
        time.sleep(REQUEST_GAP_SECONDS)
        try:
            row = parse_facility(fetch_json(f"{API_BASE}?facility={facility_id}", api_key))
        except (urllib.error.URLError, KeyError, ValueError) as error:
            failed += 1
            print(f"  facility {facility_id}: {error}", file=sys.stderr)
            continue
        row["polled_at"] = polled_at
        row["message_date"] = row["message_date"] or polled_at
        rows.append(row)
    store.update_facilities(rows)
    new = store.append(rows, now)
    print(f"{polled_at}  {len(facility_ids)} facilities, {new} new readings, {failed} failed")


def main():
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--loop", type=int, metavar="SECONDS", help="keep polling at this interval")
    parser.add_argument("--duration", type=int, metavar="SECONDS", help="stop looping after this long")
    parser.add_argument("--data-dir", type=Path, default=DEFAULT_DATA_DIR)
    args = parser.parse_args()

    api_key = load_api_key()
    store = Store(args.data_dir)
    deadline = time.monotonic() + args.duration if args.duration else None
    while True:
        try:
            poll_once(store, api_key)
        except urllib.error.URLError as error:
            # Keep the loop alive through network drops and API outages.
            print(f"poll failed: {error}", file=sys.stderr)
            if not args.loop:
                sys.exit(1)
        if not args.loop:
            break
        if deadline and time.monotonic() + args.loop > deadline:
            break
        time.sleep(args.loop)


if __name__ == "__main__":
    main()
