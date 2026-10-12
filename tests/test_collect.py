import csv
import tempfile
import unittest
from datetime import datetime, timezone
from pathlib import Path

from logger.collect import Store, parse_facility

# Shape of a TfNSW Car Park API facility response (numbers arrive as strings).
SAMPLE = {
    "facility_id": "486",
    "facility_name": "Park&Ride - Kellyville",
    "spots": "1374",
    "occupancy": {"loop": None, "total": "912", "monthlies": None, "open_gate": None, "transients": None},
    "location": {"suburb": "Kellyville", "latitude": "-33.7139", "longitude": "150.9353"},
    "MessageDate": "2026-10-13T07:45:00",
    "zones": [],
}

# 21:00 UTC on the 12th is 08:00 on the 13th in Sydney (AEDT).
NOW = datetime(2026, 10, 12, 21, 0, tzinfo=timezone.utc)


def reading(**overrides):
    return {**parse_facility(SAMPLE), "polled_at": NOW.isoformat(), **overrides}


class ParseFacilityTest(unittest.TestCase):
    def test_converts_string_numbers(self):
        row = parse_facility(SAMPLE)
        self.assertEqual(row["capacity"], 1374)
        self.assertEqual(row["occupied"], 912)
        self.assertAlmostEqual(row["latitude"], -33.7139)

    def test_missing_occupancy_becomes_none(self):
        row = parse_facility({**SAMPLE, "occupancy": {"total": None}})
        self.assertIsNone(row["occupied"])


class StoreTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(self.tmp.name)

    def tearDown(self):
        self.tmp.cleanup()

    def test_files_are_named_by_sydney_date(self):
        self.store.append([reading()], NOW)
        self.assertTrue((Path(self.tmp.name) / "snapshots" / "2026-10-13.csv").exists())

    def test_repeat_reading_is_skipped(self):
        self.assertEqual(self.store.append([reading()], NOW), 1)
        self.assertEqual(self.store.append([reading()], NOW), 0)
        self.assertEqual(self.store.append([reading(message_date="2026-10-13T07:50:00")], NOW), 1)
        with self.store.snapshot_path(NOW).open() as f:
            self.assertEqual(len(list(csv.DictReader(f))), 2)

    def test_facilities_are_upserted(self):
        self.store.update_facilities([reading()])
        self.store.update_facilities([reading(capacity=1400)])
        with (Path(self.tmp.name) / "facilities.csv").open() as f:
            rows = list(csv.DictReader(f))
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["capacity"], "1400")


if __name__ == "__main__":
    unittest.main()
