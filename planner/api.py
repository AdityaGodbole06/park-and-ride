"""HTTP API for the park & ride planner.

Run locally:
    .venv/bin/uvicorn planner.api:app --reload
"""

import asyncio
import logging
from contextlib import asynccontextmanager
from datetime import datetime, time, timedelta

import httpx
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

from logger.collect import load_api_key
from planner.carparks import SYDNEY, CarparkDirectory
from planner.driving import OsrmDriving
from planner.nearby import NearbyParking, SpotError
from planner.plan import plan
from planner.tfnsw import TfnswClient

logging.basicConfig(level=logging.INFO)
services = {}


@asynccontextmanager
async def lifespan(app):
    http = httpx.AsyncClient(timeout=20)
    tfnsw = TfnswClient(load_api_key(), http)
    directory = CarparkDirectory(tfnsw)
    services.update(tfnsw=tfnsw, directory=directory, driving=OsrmDriving(http), nearby=NearbyParking())
    loading = asyncio.create_task(directory.load())  # warm the cache without blocking startup
    yield
    loading.cancel()
    await http.aclose()


app = FastAPI(title="Park & Ride Planner", lifespan=lifespan)


def parse_point(value):
    try:
        lat, lon = (float(part) for part in value.split(","))
    except ValueError:
        raise HTTPException(400, f"expected 'lat,lon', got {value!r}")
    return lat, lon


def parse_when(value, now):
    """Accept 'HH:MM' (next occurrence, Sydney time) or a full ISO datetime."""
    try:
        if len(value) <= 5:
            when = datetime.combine(now.date(), time.fromisoformat(value), SYDNEY)
            return when if when >= now else when + timedelta(days=1)
        when = datetime.fromisoformat(value)
    except ValueError:
        raise HTTPException(400, f"can't read time {value!r}; use HH:MM or ISO 8601")
    return when.replace(tzinfo=SYDNEY) if when.tzinfo is None else when.astimezone(SYDNEY)


def iso(dt):
    return dt.astimezone(SYDNEY).isoformat(timespec="minutes")


PARK_AND_RIDE_TIP = "Tap on and off with the same Opal or contactless card to park free for up to 18 hours."


def carpark_json(carpark, now):
    return {
        "id": carpark.id,
        "name": carpark.name,
        "suburb": carpark.suburb,
        "lat": carpark.lat,
        "lon": carpark.lon,
        "capacity": carpark.capacity,
        "free": carpark.free,
        "status": carpark.status(now),
        "reading_at": iso(carpark.reading_at) if carpark.reading_at else None,
        "tip": PARK_AND_RIDE_TIP,
    }


def option_json(option, now):
    return {
        "carpark": carpark_json(option.carpark, now),
        "parking_status": option.parking_status,
        "leave_at": iso(option.leave_at),
        "drive_minutes": round(option.drive_seconds / 60),
        "arrive_carpark_at": iso(option.arrive_carpark_at),
        "depart_carpark_at": iso(option.journey.depart),
        "arrive_at": iso(option.arrive_at),
        "total_minutes": round((option.arrive_at - option.leave_at).total_seconds() / 60),
        "legs": [
            {
                "mode": leg.mode,
                "line": leg.line,
                "from": leg.origin,
                "to": leg.destination,
                "depart": iso(leg.depart),
                "arrive": iso(leg.arrive),
            }
            for leg in option.journey.legs
        ],
        "warnings": option.warnings,
        "nearby_parking": option.nearby,
        "suggested_spot": option.suggested_spot,
    }


@app.get("/health")
async def health():
    directory = services["directory"]
    return {"ok": True, "carparks_loaded": directory.loaded.is_set(), "carparks": len(directory.carparks)}


@app.get("/places")
async def places(q: str = Query(min_length=2)):
    """Search addresses, stops and landmarks."""
    results = await services["tfnsw"].find_places(q)
    return [vars(p) for p in results[:8]]


@app.get("/carparks")
async def carparks():
    now = datetime.now(SYDNEY)
    return [carpark_json(c, now) for c in await services["directory"].all()]


@app.get("/plan")
async def plan_trip(
    origin: str = Query(alias="from", description="lat,lon"),
    destination: str = Query(alias="to", description="lat,lon"),
    arrive_by: str | None = Query(None, description="HH:MM or ISO datetime"),
    depart_at: str | None = Query(None, description="HH:MM or ISO datetime; default now"),
):
    if arrive_by and depart_at:
        raise HTTPException(400, "give arrive_by or depart_at, not both")
    now = datetime.now(SYDNEY)
    when = parse_when(arrive_by or depart_at, now) if (arrive_by or depart_at) else now
    start, end = parse_point(origin), parse_point(destination)
    candidates, options = await plan(
        start, end, when, bool(arrive_by),
        services["directory"], services["tfnsw"], services["driving"], services["nearby"], now,
    )
    return {
        "mode": "arrive_by" if arrive_by else "depart_at",
        "time": iso(when),
        "drive_times": services["driving"].source,
        "carparks_considered": [c.name for c in candidates],
        "options": [option_json(o, now) for o in options],
    }


async def find_carpark(carpark_id):
    for carpark in await services["directory"].all():
        if carpark.id == carpark_id:
            return carpark
    raise HTTPException(404, f"no car park {carpark_id!r}")


@app.get("/carparks/{carpark_id}/nearby")
async def nearby_parking(carpark_id: str):
    """Other places to park near this car park's station, closest first."""
    return services["nearby"].for_carpark(await find_carpark(carpark_id))


class NewSpot(BaseModel):
    carpark_id: str
    name: str
    lat: float
    lon: float
    notes: str | None = None


def community_id(spot_id):
    try:
        return int(spot_id.removeprefix("community:"))
    except ValueError:
        raise HTTPException(400, "only community spots can be confirmed or reported")


@app.post("/spots", status_code=201)
async def add_spot(spot: NewSpot):
    """Add a community known spot near a car park."""
    carpark = await find_carpark(spot.carpark_id)
    try:
        return services["nearby"].add(carpark, spot.name, spot.lat, spot.lon, spot.notes)
    except SpotError as error:
        raise HTTPException(422, str(error))


@app.post("/spots/{spot_id}/confirm")
async def confirm_spot(spot_id: str):
    """Someone says this community tip is still right."""
    nearby, number = services["nearby"], community_id(spot_id)
    try:
        nearby.confirm(number)
        carpark = await find_carpark(nearby.carpark_id_of(number))
        return nearby.get(number, nearby.station(carpark))
    except KeyError:
        raise HTTPException(404, f"no spot {spot_id!r}")


class Report(BaseModel):
    reason: str
    details: str | None = None


@app.post("/spots/{spot_id}/report", status_code=202)
async def report_spot(spot_id: str, report: Report):
    """Flag a community spot as wrong, not allowed, or one the owner wants removed."""
    try:
        services["nearby"].report(community_id(spot_id), report.reason, report.details)
    except SpotError as error:
        raise HTTPException(422, str(error))
    except KeyError:
        raise HTTPException(404, f"no spot {spot_id!r}")
    return {"ok": True}
