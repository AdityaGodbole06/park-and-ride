import sqlite3
import unittest

from logger.collect import SCHEMA, parse_facility, save

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


class ParseFacilityTest(unittest.TestCase):
    def test_converts_string_numbers(self):
        row = parse_facility(SAMPLE)
        self.assertEqual(row["capacity"], 1374)
        self.assertEqual(row["occupied"], 912)
        self.assertAlmostEqual(row["latitude"], -33.7139)

    def test_missing_occupancy_becomes_none(self):
        row = parse_facility({**SAMPLE, "occupancy": {"total": None}})
        self.assertIsNone(row["occupied"])


class SaveTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.db.executescript(SCHEMA)

    def test_repeat_reading_is_ignored(self):
        self.assertTrue(save(self.db, SAMPLE, "2026-10-13T07:46:00+00:00"))
        self.assertFalse(save(self.db, SAMPLE, "2026-10-13T07:51:00+00:00"))
        newer = {**SAMPLE, "MessageDate": "2026-10-13T07:50:00"}
        self.assertTrue(save(self.db, newer, "2026-10-13T07:51:00+00:00"))
        count = self.db.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0]
        self.assertEqual(count, 2)


if __name__ == "__main__":
    unittest.main()
