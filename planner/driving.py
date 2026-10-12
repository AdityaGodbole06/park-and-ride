"""Drive times between two points.

Uses the public OSRM server, which needs no key but has no live traffic.
A traffic-aware provider (TomTom, Google Routes) can replace it later by
implementing the same `drive_seconds` method.
"""

import httpx

OSRM_URL = "https://router.project-osrm.org/route/v1/driving"


class OsrmDriving:
    source = "osrm (no live traffic)"

    def __init__(self, http=None):
        self.http = http or httpx.AsyncClient(timeout=20)

    async def drive_seconds(self, origin, destination, depart_at=None):
        """Seconds to drive between (lat, lon) points. `depart_at` is ignored: no traffic data."""
        (lat1, lon1), (lat2, lon2) = origin, destination
        response = await self.http.get(
            f"{OSRM_URL}/{lon1},{lat1};{lon2},{lat2}", params={"overview": "false"}
        )
        response.raise_for_status()
        payload = response.json()
        if payload.get("code") != "Ok" or not payload.get("routes"):
            raise ValueError(f"no driving route: {payload.get('code')}")
        return payload["routes"][0]["duration"]
