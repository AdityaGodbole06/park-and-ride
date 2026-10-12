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

from logger.collect import load_api_key
from planner.carparks import SYDNEY, CarparkDirectory
from planner.driving import OsrmDriving
from planner.plan import plan
from planner.tfnsw import TfnswClient

logging.basicConfig(level=logging.INFO)
services = {}


@asynccontextmanager
async def lifespan(app):
    http = httpx.AsyncClient(timeout=20)
    tfnsw = TfnswClient(load_api_key(), http)
    directory = CarparkDirectory(tfnsw)
    services.update(tfnsw=tfnsw, directory=directory, driving=OsrmDriving(http))
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
        services["directory"], services["tfnsw"], services["driving"], now,
    )
    return {
        "mode": "arrive_by" if arrive_by else "depart_at",
        "time": iso(when),
        "drive_times": services["driving"].source,
        "carparks_considered": [c.name for c in candidates],
        "options": [option_json(o, now) for o in options],
    }
