"""Async client for the Transport for NSW Open Data APIs we use:
Car Park API, Trip Planner trip search and stop finder."""

import asyncio
import time
from dataclasses import dataclass
from datetime import datetime

import httpx

from logger.collect import parse_facility

API_BASE = "https://api.transport.nsw.gov.au/v1"
WALK_PRODUCT_CLASSES = {99, 100}  # 99 = walk, 100 = footpath
MODES = {1: "train", 2: "metro", 4: "light rail", 5: "bus", 7: "coach", 9: "ferry", 11: "school bus"}


@dataclass
class Place:
    name: str
    type: str
    lat: float
    lon: float


@dataclass
class Leg:
    mode: str  # "walk", "train", "metro", "bus", ...
    line: str | None
    origin: str
    destination: str
    depart: datetime
    arrive: datetime


@dataclass
class Journey:
    legs: list[Leg]

    @property
    def depart(self):
        return self.legs[0].depart

    @property
    def arrive(self):
        return self.legs[-1].arrive


class RateLimiter:
    """Spaces requests out so we stay under the API's 5 requests/second limit."""

    def __init__(self, per_second):
        self.gap = 1 / per_second
        self.lock = asyncio.Lock()
        self.last = 0.0

    async def wait(self):
        async with self.lock:
            delay = self.last + self.gap - time.monotonic()
            if delay > 0:
                await asyncio.sleep(delay)
            self.last = time.monotonic()


def parse_time(value):
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def parse_leg(raw):
    transport = raw.get("transportation") or {}
    product = transport.get("product") or {}
    origin, destination = raw["origin"], raw["destination"]
    is_walk = product.get("class") in WALK_PRODUCT_CLASSES
    return Leg(
        mode="walk" if is_walk else MODES.get(product.get("class"), "transport"),
        line=None if is_walk else transport.get("disassembledName") or transport.get("number"),
        origin=origin.get("name", ""),
        destination=destination.get("name", ""),
        # Estimated times include live delays; planned times are the fallback.
        depart=parse_time(origin.get("departureTimeEstimated") or origin["departureTimePlanned"]),
        arrive=parse_time(destination.get("arrivalTimeEstimated") or destination["arrivalTimePlanned"]),
    )


def parse_journeys(payload):
    return [Journey([parse_leg(leg) for leg in j["legs"]]) for j in payload.get("journeys", [])]


def parse_places(payload):
    places = []
    for loc in sorted(payload.get("locations", []), key=lambda l: -l.get("matchQuality", 0)):
        coord = loc.get("coord")
        if coord and len(coord) == 2:
            places.append(Place(loc.get("name", ""), loc.get("type", ""), coord[0], coord[1]))
    return places


def coord_param(lat, lon):
    return f"{lon}:{lat}:EPSG:4326"


class TfnswClient:
    def __init__(self, api_key, http=None):
        self.http = http or httpx.AsyncClient(timeout=20)
        self.headers = {"Authorization": f"apikey {api_key}"}
        self.limiter = RateLimiter(per_second=4)

    async def get(self, path, params=None):
        await self.limiter.wait()
        response = await self.http.get(f"{API_BASE}{path}", params=params, headers=self.headers)
        response.raise_for_status()
        return response.json()

    async def carpark_ids(self):
        return list(await self.get("/carpark"))

    async def carpark(self, facility_id):
        return parse_facility(await self.get("/carpark", {"facility": facility_id}))

    async def find_places(self, query):
        payload = await self.get("/tp/stop_finder", {
            "outputFormat": "rapidJSON",
            "coordOutputFormat": "EPSG:4326",
            "type_sf": "any",
            "name_sf": query,
            "TfNSWSF": "true",
        })
        return parse_places(payload)

    async def journeys(self, origin, destination, when, arrive_by):
        """Public transport journeys between two (lat, lon) points.

        `when` is a timezone-aware datetime in Sydney time."""
        payload = await self.get("/tp/trip", {
            "outputFormat": "rapidJSON",
            "coordOutputFormat": "EPSG:4326",
            "depArrMacro": "arr" if arrive_by else "dep",
            "itdDate": when.strftime("%Y%m%d"),
            "itdTime": when.strftime("%H%M"),
            "type_origin": "coord",
            "name_origin": coord_param(*origin),
            "type_destination": "coord",
            "name_destination": coord_param(*destination),
            "calcNumberOfTrips": 4,
            "TfNSWTR": "true",
        })
        return parse_journeys(payload)
