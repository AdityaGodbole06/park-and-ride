"""Rank park & ride options for a trip.

For each nearby car park: drive there, park, then take public transport to the
destination. Options are ranked by when you need to leave (arrive-by trips) or
when you arrive (depart-at trips), with a penalty for car parks that are full
or nearly full when you'd get there.
"""

import asyncio
import logging
import math
from dataclasses import dataclass, field, replace
from datetime import datetime, timedelta

from planner.carparks import SYDNEY

PARKING_TIME = timedelta(minutes=4)  # find a space and get out of the car
MAX_DRIVE_KM = 35  # straight-line radius for candidate car parks
BACKTRACK_KM = 3  # allow car parks slightly further from the destination than home is
MAX_CANDIDATES = 6
MAX_OPTIONS = 3
LIVE_STATUS_HORIZON = timedelta(minutes=45)  # beyond this, current occupancy says little
PENALTY = {"filling": timedelta(minutes=10), "full": timedelta(hours=3)}
SUGGESTED_SPOT_RISK = timedelta(minutes=5)  # a spot with no live data is a little less certain
NEARBY_LIMIT = 5

log = logging.getLogger(__name__)


def distance_km(a, b):
    """Great-circle distance between two (lat, lon) points."""
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def pick_candidates(carparks, start, destination):
    """Nearby car parks that don't take you much further from the destination."""
    trip_km = distance_km(start, destination)
    nearby = [
        c for c in carparks
        if distance_km(start, (c.lat, c.lon)) <= MAX_DRIVE_KM
        and distance_km((c.lat, c.lon), destination) < trip_km + BACKTRACK_KM
    ]
    nearby.sort(key=lambda c: distance_km(start, (c.lat, c.lon)))
    return nearby[:MAX_CANDIDATES]


@dataclass
class Option:
    carpark: object
    leave_at: datetime
    drive_seconds: float
    arrive_carpark_at: datetime
    journey: object
    parking_status: str = "unknown"
    warnings: list[str] = field(default_factory=list)
    nearby: list[dict] = field(default_factory=list)
    suggested_spot: dict | None = None

    @property
    def arrive_at(self):
        return self.journey.arrive

    def penalty(self):
        if self.suggested_spot:
            return SUGGESTED_SPOT_RISK  # the times already include the longer walk
        return PENALTY.get(self.parking_status, timedelta(0))


def assess_parking(option, now):
    """Use live occupancy if we'll arrive soon enough for it to mean something."""
    status = option.carpark.status(now)
    if option.arrive_carpark_at - now > LIVE_STATUS_HORIZON:
        option.parking_status = "unknown"
        if status in ("full", "filling"):
            option.warnings.append(f"{status.capitalize()} right now, but you arrive later; predictions coming soon")
        return
    option.parking_status = status
    if status == "full":
        option.warnings.append("Car park is full right now")
    elif status == "filling":
        option.warnings.append(f"Only {option.carpark.free} spaces left right now")
    elif status == "unknown":
        option.warnings.append("No live occupancy data for this car park")


def attach_nearby(option, nearby):
    """List other places to park, and pick one to suggest if the car park is full or filling."""
    spots = nearby.for_carpark(option.carpark)
    option.nearby = spots[:NEARBY_LIMIT]
    if option.parking_status not in ("full", "filling"):
        return
    spot = nearby.suggest(spots)
    if not spot:
        return
    first = option.journey.legs[0]
    official_walk = (first.arrive - first.depart).total_seconds() / 60 if first.mode == "walk" else 0
    extra = max(0, round(spot["walk_minutes"] - official_walk))
    option.suggested_spot = {**spot, "extra_walk_minutes": extra}


async def replan_from_spot(option, start, destination, when, build, tfnsw, driving, now):
    """Redo the drive and journey from the suggested spot so every time shown is real.

    Parking further away can mean a different train, so the official car park's
    times don't carry over. If no journey works from the spot, drop the suggestion."""
    spot = option.suggested_spot
    try:
        rebuilt = await build(replace(option.carpark, lat=spot["lat"], lon=spot["lon"]),
                              start, destination, when, tfnsw, driving)
    except Exception as error:
        log.warning("couldn't plan from %s: %s", spot["name"], error)
        rebuilt = None
    if rebuilt is None or rebuilt.leave_at < now - timedelta(minutes=1):
        option.suggested_spot = None
        return
    option.leave_at, option.drive_seconds = rebuilt.leave_at, rebuilt.drive_seconds
    option.arrive_carpark_at, option.journey = rebuilt.arrive_carpark_at, rebuilt.journey
    option.warnings.append(f"Try {spot['name']} instead, {spot['walk_minutes']} min walk to the station")


async def option_arriving_by(carpark, start, destination, arrive_by, tfnsw, driving):
    spot = (carpark.lat, carpark.lon)
    journeys, drive = await asyncio.gather(
        tfnsw.journeys(spot, destination, arrive_by, arrive_by=True),
        driving.drive_seconds(start, spot),
    )
    on_time = [j for j in journeys if j.arrive <= arrive_by]
    if not on_time:
        return None
    journey = max(on_time, key=lambda j: j.depart)  # latest one that still gets there
    arrive_carpark = journey.depart - PARKING_TIME
    return Option(carpark, arrive_carpark - timedelta(seconds=drive), drive, arrive_carpark, journey)


async def option_departing_at(carpark, start, destination, depart_at, tfnsw, driving):
    spot = (carpark.lat, carpark.lon)
    drive = await driving.drive_seconds(start, spot, depart_at)
    arrive_carpark = depart_at + timedelta(seconds=drive)
    ready = arrive_carpark + PARKING_TIME
    journeys = [j for j in await tfnsw.journeys(spot, destination, ready, arrive_by=False) if j.depart >= ready]
    if not journeys:
        return None
    journey = min(journeys, key=lambda j: j.arrive)
    return Option(carpark, depart_at, drive, arrive_carpark, journey)


async def plan(start, destination, when, arrive_by, directory, tfnsw, driving, nearby=None, now=None):
    """Return up to MAX_OPTIONS ranked options, best first."""
    now = now or datetime.now(SYDNEY)
    candidates = await directory.refresh(pick_candidates(await directory.all(), start, destination))
    build = option_arriving_by if arrive_by else option_departing_at
    results = await asyncio.gather(
        *(build(c, start, destination, when, tfnsw, driving) for c in candidates),
        return_exceptions=True,
    )
    options = []
    for carpark, result in zip(candidates, results):
        if isinstance(result, Exception):
            log.warning("skipping %s: %s", carpark.name, result)
        elif result is not None and result.leave_at >= now - timedelta(minutes=1):
            assess_parking(result, now)
            if nearby:
                attach_nearby(result, nearby)
            options.append(result)
    await asyncio.gather(*(
        replan_from_spot(o, start, destination, when, build, tfnsw, driving, now)
        for o in options if o.suggested_spot
    ))

    if arrive_by:
        options.sort(key=lambda o: (o.leave_at - o.penalty()), reverse=True)
    else:
        options.sort(key=lambda o: o.arrive_at + o.penalty())
    return candidates, options[:MAX_OPTIONS]
