"""Live car park directory: locations and capacity, plus current occupancy."""

import asyncio
import logging
import time
from dataclasses import dataclass
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

import httpx

SYDNEY = ZoneInfo("Australia/Sydney")
OCCUPANCY_MAX_AGE_SECONDS = 120  # refetch a car park's occupancy after this
STALE_READING = timedelta(hours=1)  # older readings mean the sensor isn't reporting

log = logging.getLogger(__name__)


@dataclass
class Carpark:
    id: str
    name: str
    suburb: str | None
    lat: float
    lon: float
    capacity: int | None
    occupied: int | None
    reading_at: datetime | None
    fetched_at: float = 0.0  # time.monotonic() of the last fetch

    @classmethod
    def from_row(cls, row):
        reading_at = None
        if row.get("message_date"):
            # The API reports Sydney local time without an offset.
            reading_at = datetime.fromisoformat(row["message_date"]).replace(tzinfo=SYDNEY)
        return cls(
            id=row["facility_id"],
            name=(row["name"] or "").removeprefix("Park&Ride - "),
            suburb=row.get("suburb"),
            lat=row["latitude"],
            lon=row["longitude"],
            capacity=row["capacity"],
            occupied=row["occupied"],
            reading_at=reading_at,
            fetched_at=time.monotonic(),
        )

    @property
    def free(self):
        if self.capacity is None or self.occupied is None:
            return None
        # Full car parks can report more cars than spaces (overflow, sensor drift).
        return max(self.capacity - self.occupied, 0)

    def status(self, now):
        """'available', 'filling', 'full' or 'unknown' based on the live reading."""
        if self.free is None or self.reading_at is None or now - self.reading_at > STALE_READING:
            return "unknown"
        if self.free <= 0 or self.occupied >= 0.98 * self.capacity:
            return "full"
        if self.free < max(10, 0.1 * self.capacity):
            return "filling"
        return "available"


class CarparkDirectory:
    def __init__(self, tfnsw):
        self.tfnsw = tfnsw
        self.carparks: dict[str, Carpark] = {}
        self.loaded = asyncio.Event()

    async def fetch(self, facility_id):
        try:
            row = await self.tfnsw.carpark(facility_id)
            if row["latitude"] is None or row["longitude"] is None:
                return
            self.carparks[facility_id] = Carpark.from_row(row)
        except (httpx.HTTPError, KeyError, ValueError) as error:
            # Some listed facilities 404 (decommissioned); skip them.
            log.info("car park %s unavailable: %s", facility_id, error)

    async def load(self):
        """Fetch every car park once. Takes ~15s because of the API rate limit."""
        ids = await self.tfnsw.carpark_ids()
        await asyncio.gather(*(self.fetch(i) for i in ids))
        self.loaded.set()
        log.info("loaded %d car parks", len(self.carparks))

    async def all(self):
        await self.loaded.wait()
        return list(self.carparks.values())

    async def refresh(self, carparks):
        """Refetch occupancy for these car parks if it's older than a couple of minutes."""
        cutoff = time.monotonic() - OCCUPANCY_MAX_AGE_SECONDS
        stale = [c.id for c in carparks if c.fetched_at < cutoff]
        await asyncio.gather(*(self.fetch(i) for i in stale))
        return [self.carparks.get(c.id, c) for c in carparks]
