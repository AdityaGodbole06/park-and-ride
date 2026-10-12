import json
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

from planner.carparks import Carpark
from planner.nearby import PRIVATE_LAND_WARNING, NearbyParking, SpotError
from planner.osm_parking import max_stay_hours, spot_from_osm
from tests.test_plan import NOW, PlanTest

STATION = (-33.7306, 150.9440)  # Bella Vista
CHURCH = ("Emmanuel Baptist Church", (-33.7312, 150.9470))
BELLA_VISTA = Carpark("31", "Bella Vista", None, -33.7302, 150.9441, 774, 774, NOW)


def osm(tags, lat=-33.7313, lon=150.9471):
    return {"type": "way", "id": 1, "center": {"lat": lat, "lon": lon}, "tags": {"amenity": "parking", **tags}}


def spot(**overrides):
    return {
        "id": "osm:way/1", "name": "Council car park", "kind": "council", "source": "osm",
        "lat": -33.7341, "lon": 150.9502, "walk_minutes": 11, "capacity": 245, "access": "public",
        "fee": None, "max_stay": None, "notes": None, "confirmations": 0, **overrides,
    }


class OsmSpotTest(unittest.TestCase):
    def test_unnamed_lot_is_named_after_landmark(self):
        result = spot_from_osm(osm({"parking": "surface"}), STATION, [CHURCH])
        self.assertEqual(result["name"], "Emmanuel Baptist Church car park")
        self.assertEqual(result["access"], "unknown")

    def test_skips_unusable_spots(self):
        for tags in ({"access": "private"}, {"name": "Kiss and Ride"}, {"name": "Bays", "maxstay": "2 hours"},
                     {"name": "Bays", "maxstay": "load-unload"}, {}):
            self.assertIsNone(spot_from_osm(osm(tags), STATION, []), tags)

    def test_all_day_council_car_park(self):
        result = spot_from_osm(osm({"operator": "The Hills Shire Council", "access": "yes",
                                    "capacity": "245", "maxstay": "12 hours"}), STATION, [])
        self.assertEqual((result["kind"], result["access"], result["capacity"]), ("council", "public", 245))

    def test_max_stay_parsing(self):
        self.assertEqual(max_stay_hours("30 minutes"), 0.5)
        self.assertEqual(max_stay_hours("12 hours"), 12)
        self.assertEqual(max_stay_hours("2"), 2)
        self.assertIsNone(max_stay_hours("unlimited"))


class NearbyParkingTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        osm_file = Path(self.tmp.name) / "nearby.json"
        osm_file.write_text(json.dumps({"carparks": {"31": {
            "station": {"name": "Bella Vista", "lat": STATION[0], "lon": STATION[1]},
            "spots": [spot(), spot(id="osm:way/2", name="Shop", access="customers", walk_minutes=4, lat=-33.7290, lon=150.9420)],
        }}}))
        self.nearby = NearbyParking(osm_file, ":memory:")

    def tearDown(self):
        self.tmp.cleanup()

    def test_community_spot_is_listed_with_walk_time(self):
        added = self.nearby.add(BELLA_VISTA, " Emmanuel Baptist Church ", *CHURCH[1], "Weekdays OK")
        self.assertEqual(added["name"], "Emmanuel Baptist Church")
        self.assertEqual(added["confirmations"], 1)
        self.assertEqual(added["warning"], PRIVATE_LAND_WARNING)
        names = [s["name"] for s in self.nearby.for_carpark(BELLA_VISTA)]
        self.assertEqual(names, ["Shop", "Emmanuel Baptist Church", "Council car park"])

    def test_community_spot_hides_osm_entry_for_same_lot(self):
        self.nearby.add(BELLA_VISTA, "Council lot, all day", -33.7342, 150.9503)
        names = [s["name"] for s in self.nearby.for_carpark(BELLA_VISTA)]
        self.assertEqual(names, ["Shop", "Council lot, all day"])

    def test_rejects_far_away_or_bad_spots(self):
        with self.assertRaises(SpotError):
            self.nearby.add(BELLA_VISTA, "Somewhere", -33.80, 150.90)
        with self.assertRaises(SpotError):
            self.nearby.add(BELLA_VISTA, "", *CHURCH[1])

    def test_unconfirmed_spots_go_stale(self):
        long_ago = datetime.now(timezone.utc) - timedelta(days=120)
        added = self.nearby.add(BELLA_VISTA, "Old tip", *CHURCH[1], now=long_ago)
        self.assertNotIn("Old tip", [s["name"] for s in self.nearby.for_carpark(BELLA_VISTA)])
        self.nearby.confirm(int(added["id"].removeprefix("community:")))
        self.assertIn("Old tip", [s["name"] for s in self.nearby.for_carpark(BELLA_VISTA)])

    def test_suggests_public_or_community_never_customers_only(self):
        spots = self.nearby.for_carpark(BELLA_VISTA)
        self.assertEqual(self.nearby.suggest(spots)["name"], "Council car park")
        self.nearby.add(BELLA_VISTA, "Church", *CHURCH[1])
        self.assertEqual(self.nearby.suggest(self.nearby.for_carpark(BELLA_VISTA))["name"], "Church")


class FakeNearby:
    def __init__(self, spots):
        self.spots = spots

    def for_carpark(self, carpark):
        return self.spots.get(carpark.id, [])

    def suggest(self, spots):
        return spots[0] if spots else None


class PlanWithNearbyTest(PlanTest):
    async def test_full_carpark_with_alternative_stays_in_contention(self):
        self.near.occupied = self.near.capacity
        self.drives[(-33.72, 150.97)] = 1800  # the open car park is a 30 min drive
        without = await self.run_plan([self.near, self.other])
        self.assertEqual([o.carpark.name for o in without], ["Other", "Near"])

        nearby = FakeNearby({"1": [spot(walk_minutes=9)]})
        options = await self.run_plan([self.near, self.other], nearby=nearby)
        self.assertEqual(options[0].carpark.name, "Near")  # 10 min penalty beats 20 min more driving
        self.assertEqual(options[0].suggested_spot["extra_walk_minutes"], 5)  # 9 min vs the 4 min official walk

    async def test_no_suggestion_when_parking_is_available(self):
        nearby = FakeNearby({"1": [spot()]})
        [best, _] = await self.run_plan([self.near, self.other], nearby=nearby)
        self.assertIsNone(best.suggested_spot)
        self.assertEqual(len(best.nearby), 1)


if __name__ == "__main__":
    unittest.main()
