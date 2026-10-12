import json
import unittest
from dataclasses import replace
from datetime import datetime, timedelta
from pathlib import Path

from planner.carparks import SYDNEY, Carpark
from planner.plan import PARKING_TIME, pick_candidates, plan
from planner.tfnsw import Journey, parse_journeys

FIXTURES = Path(__file__).parent / "fixtures"
# Real Trip Planner response: Kellyville car park to Central, arriving by 08:30 on 14 Oct.
KELLYVILLE_TRIPS = parse_journeys(json.loads((FIXTURES / "trip_kellyville_arrive_0830.json").read_text()))

HOME = (-33.70, 150.95)  # Kellyville area
CITY = (-33.8832, 151.2070)  # Central
NOW = datetime(2026, 10, 14, 7, 0, tzinfo=SYDNEY)
ARRIVE_BY = datetime(2026, 10, 14, 8, 30, tzinfo=SYDNEY)


def carpark(id, name, lat, lon, capacity=1000, occupied=500, reading_at=NOW):
    return Carpark(id, name, None, lat, lon, capacity, occupied, reading_at)


class FakeDirectory:
    def __init__(self, carparks):
        self.carparks = carparks

    async def all(self):
        return self.carparks

    async def refresh(self, carparks):
        return carparks


class FakeTfnsw:
    """Every car park gets the Kellyville journeys, shifted by a per-car-park offset."""

    def __init__(self, offsets):
        self.offsets = offsets

    async def journeys(self, origin, destination, when, arrive_by):
        shift = self.offsets[origin]
        return [
            Journey([replace(leg, depart=leg.depart + shift, arrive=leg.arrive + shift) for leg in j.legs])
            for j in KELLYVILLE_TRIPS
        ]


class FakeDriving:
    source = "fake"

    def __init__(self, seconds):
        self.seconds = seconds

    async def drive_seconds(self, origin, destination, depart_at=None):
        return self.seconds[destination]


class ParseJourneysTest(unittest.TestCase):
    def test_reads_real_response(self):
        first = KELLYVILLE_TRIPS[0]
        self.assertEqual([leg.mode for leg in first.legs], ["walk", "metro"])
        self.assertEqual(first.legs[1].line, "M1")
        self.assertEqual(first.arrive.astimezone(SYDNEY).strftime("%H:%M"), "08:28")
        self.assertLessEqual(max(j.arrive for j in KELLYVILLE_TRIPS), ARRIVE_BY)


class CarparkStatusTest(unittest.TestCase):
    def test_statuses(self):
        self.assertEqual(carpark("1", "A", 0, 0, 1000, 500).status(NOW), "available")
        self.assertEqual(carpark("1", "A", 0, 0, 1000, 950).status(NOW), "filling")
        self.assertEqual(carpark("1", "A", 0, 0, 228, 229).status(NOW), "full")
        stale = carpark("1", "A", 0, 0, reading_at=NOW - timedelta(days=900))
        self.assertEqual(stale.status(NOW), "unknown")

    def test_overfull_reports_zero_free(self):
        self.assertEqual(carpark("1", "A", 0, 0, 228, 229).free, 0)


class PickCandidatesTest(unittest.TestCase):
    def test_skips_far_and_wrong_direction(self):
        near = carpark("1", "Near", -33.71, 150.96)
        backwards = carpark("2", "Backwards", -33.60, 150.80)  # further from the city
        far = carpark("3", "Far", -34.40, 150.90)
        names = [c.name for c in pick_candidates([near, backwards, far], HOME, CITY)]
        self.assertEqual(names, ["Near"])


class PlanTest(unittest.IsolatedAsyncioTestCase):
    def setUp(self):
        self.near = carpark("1", "Near", -33.71, 150.96)
        self.other = carpark("2", "Other", -33.72, 150.97)
        self.offsets = {(-33.71, 150.96): timedelta(0), (-33.72, 150.97): timedelta(0)}
        self.drives = {(-33.71, 150.96): 600, (-33.72, 150.97): 900}

    async def run_plan(self, carparks, arrive_by=True, when=ARRIVE_BY):
        _, options = await plan(
            HOME, CITY, when, arrive_by,
            FakeDirectory(carparks), FakeTfnsw(self.offsets), FakeDriving(self.drives), NOW,
        )
        return options

    async def test_leave_time_counts_drive_and_parking(self):
        [best, _] = await self.run_plan([self.near, self.other])
        self.assertEqual(best.carpark.name, "Near")
        latest = max(KELLYVILLE_TRIPS, key=lambda j: j.depart)
        self.assertEqual(best.leave_at, latest.depart - PARKING_TIME - timedelta(seconds=600))

    async def test_full_carpark_ranks_last(self):
        self.near.occupied = self.near.capacity
        options = await self.run_plan([self.near, self.other])
        self.assertEqual([o.carpark.name for o in options], ["Other", "Near"])
        self.assertIn("Car park is full right now", options[1].warnings)

    async def test_live_status_ignored_for_trips_far_ahead(self):
        self.near.occupied = self.near.capacity  # full now, but the trip is tomorrow
        self.offsets[(-33.71, 150.96)] = timedelta(days=1)
        [option] = await self.run_plan([self.near], when=ARRIVE_BY + timedelta(days=1))
        self.assertEqual(option.parking_status, "unknown")
        self.assertTrue(option.warnings[0].startswith("Full right now"))

    async def test_options_you_cant_make_are_dropped(self):
        late_now = datetime(2026, 10, 14, 8, 0, tzinfo=SYDNEY)
        _, options = await plan(
            HOME, CITY, ARRIVE_BY, True,
            FakeDirectory([self.near]), FakeTfnsw(self.offsets), FakeDriving(self.drives), late_now,
        )
        self.assertEqual(options, [])

    async def test_depart_at_picks_earliest_arrival_after_parking(self):
        depart = datetime(2026, 10, 14, 7, 10, tzinfo=SYDNEY)
        [best, _] = await self.run_plan([self.near, self.other], arrive_by=False, when=depart)
        self.assertEqual(best.carpark.name, "Near")
        self.assertGreaterEqual(best.journey.depart, depart + timedelta(seconds=600) + PARKING_TIME)


if __name__ == "__main__":
    unittest.main()
