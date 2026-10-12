"""Build data/nearby_parking.json: other places to park near each TfNSW car park.

Pulls car parks from OpenStreetMap (via the Overpass API) within walking
distance of each station. Run occasionally, not per request:

    python3 -m planner.osm_parking

OSM data is © OpenStreetMap contributors, licensed under the ODbL.
"""

import json
import math
import re
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

from logger.collect import API_BASE, ROOT, fetch_json, load_api_key, parse_facility

OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
]
USER_AGENT = "park-and-ride/0.1 (https://github.com/AdityaGodbole06/park-and-ride)"
OUTPUT = ROOT / "data" / "nearby_parking.json"
SEARCH_METRES = 1200
LANDMARK_METRES = 80  # an unnamed car park this close to a named place is named after it
WALK_METRES_PER_MINUTE = 80
WALK_DETOUR = 1.3  # streets are longer than a straight line

MIN_STAY_HOURS = 8  # commuters are gone all day; shorter limits are no use to them

PUBLIC = {"yes", "public", "permissive", "destination"}
EXCLUDED = {"private", "no", "delivery", "permit", "residents", "employees", "staff"}
TFNSW_OPERATORS = ("transport for nsw", "sydney metro", "sydney trains")


def distance_m(a, b):
    lat1, lon1, lat2, lon2 = map(math.radians, (*a, *b))
    h = math.sin((lat2 - lat1) / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin((lon2 - lon1) / 2) ** 2
    return 6371000 * 2 * math.asin(math.sqrt(h))


def walk_minutes(a, b):
    return max(1, math.ceil(distance_m(a, b) * WALK_DETOUR / WALK_METRES_PER_MINUTE))


def overpass_query(points):
    parts = []
    for lat, lon in points:
        around = f"(around:{SEARCH_METRES},{lat},{lon})"
        parts += [
            f'nwr{around}["amenity"="parking"];',
            f'nwr{around}["name"]["amenity"~"^(place_of_worship|school|community_centre|library|townhall|hospital)$"];',
            f'nwr{around}["name"]["shop"~"^(mall|supermarket|department_store)$"];',
            f'nwr(around:1500,{lat},{lon})["name"]["railway"="station"];',
        ]
    return "[out:json][timeout:180];(" + "".join(parts) + ");out center tags;"


def run_overpass(query):
    body = urllib.parse.urlencode({"data": query}).encode()
    for url in OVERPASS_URLS:
        request = urllib.request.Request(url, data=body, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(request, timeout=240) as response:
                return json.load(response)["elements"]
        except Exception as error:  # try the next mirror
            print(f"{url}: {error}", file=sys.stderr)
    sys.exit("all Overpass servers failed")


def centre(element):
    if "lat" in element:
        return element["lat"], element["lon"]
    return element["center"]["lat"], element["center"]["lon"]


def max_stay_hours(value):
    """Parse OSM maxstay ("2 hours", "30 minutes", "unlimited"). None if unknown or unlimited."""
    if not value or value == "unlimited":
        return None
    if value == "load-unload":
        return 0
    match = re.match(r"\s*(\d+(?:\.\d+)?)\s*(\w*)", value)
    if not match:
        return None
    amount, unit = float(match[1]), match[2].lower()
    if unit.startswith("min"):
        return amount / 60
    if unit.startswith("day"):
        return amount * 24
    return amount  # hours, or a bare number, which is almost always hours


def is_official(tags, carpark_name):
    operator = tags.get("operator", "").lower()
    return any(o in operator for o in TFNSW_OPERATORS) or tags.get("name", "").endswith(carpark_name)


def spot_from_osm(element, station, landmarks):
    """Turn an OSM parking element into a NearbySpot dict, or None to skip it."""
    tags = element.get("tags", {})
    access = tags.get("access")
    if access in EXCLUDED or "kiss" in tags.get("name", "").lower():
        return None
    stay = max_stay_hours(tags.get("maxstay"))
    if stay is not None and stay < MIN_STAY_HOURS:
        return None
    point = centre(element)
    landmark = min(landmarks, key=lambda l: distance_m(point, l[1]), default=None)
    near_landmark = landmark and distance_m(point, landmark[1]) <= LANDMARK_METRES
    operator = tags.get("operator")
    has_info = tags.get("name") or near_landmark or access or tags.get("capacity") or operator
    if not has_info:
        return None  # untagged lots are often private or tiny; not worth suggesting

    if tags.get("park_ride") == "yes":
        kind = "park & ride"
    elif tags.get("parking") in ("street_side", "lane", "on_kerb"):
        kind = "street"
    elif operator and "council" in operator.lower():
        kind = "council"
    elif access == "customers":
        kind = "customers"
    else:
        kind = "car park"

    if tags.get("name"):
        name = tags["name"]
    elif near_landmark:
        name = f"{landmark[0]} car park"
    elif operator:
        name = f"{operator} car park"
    elif access in PUBLIC:
        name = "Public car park"
    elif access == "customers":
        name = "Customer car park"
    else:
        name = "Unnamed car park"

    fee = {"no": "free", "yes": "paid"}.get(tags.get("fee"))
    return {
        "id": f"osm:{element['type']}/{element['id']}",
        "name": name,
        "kind": kind,
        "source": "osm",
        "lat": round(point[0], 6),
        "lon": round(point[1], 6),
        "walk_minutes": walk_minutes(point, station),
        "capacity": int(tags["capacity"]) if tags.get("capacity", "").isdigit() else None,
        "access": "public" if access in PUBLIC else "customers" if access == "customers" else "unknown",
        "fee": fee,
        "max_stay": tags.get("maxstay"),
        "notes": None,
        "confirmations": 0,
    }


def build(facilities, elements):
    stations = [(e["tags"]["name"], centre(e)) for e in elements if e.get("tags", {}).get("railway") == "station"]
    landmarks = [
        (e["tags"]["name"], centre(e)) for e in elements
        if e.get("tags", {}).get("name") and ("shop" in e["tags"] or e["tags"].get("amenity") not in (None, "parking"))
    ]
    parking = [e for e in elements if e.get("tags", {}).get("amenity") == "parking"]

    result = {}
    for facility in facilities:
        here = (facility["latitude"], facility["longitude"])
        station_name, station = min(stations, key=lambda s: distance_m(here, s[1]), default=(None, here))
        nearby_landmarks = [l for l in landmarks if distance_m(here, l[1]) <= SEARCH_METRES + LANDMARK_METRES]
        spots = []
        for element in parking:
            if distance_m(here, centre(element)) > SEARCH_METRES:
                continue
            if is_official(element.get("tags", {}), facility["name"].removeprefix("Park&Ride - ")):
                continue
            spot = spot_from_osm(element, station, nearby_landmarks)
            if spot:
                spots.append(spot)
        spots.sort(key=lambda s: s["walk_minutes"])
        result[facility["facility_id"]] = {
            "station": {"name": station_name, "lat": station[0], "lon": station[1]},
            "spots": spots,
        }
    return result


def main():
    api_key = load_api_key()
    facilities = []
    for facility_id in fetch_json(API_BASE, api_key):
        time.sleep(0.25)
        try:
            row = parse_facility(fetch_json(f"{API_BASE}?facility={facility_id}", api_key))
        except Exception as error:
            print(f"facility {facility_id}: {error}", file=sys.stderr)
            continue
        if row["latitude"] is not None:
            facilities.append(row)

    elements = run_overpass(overpass_query([(f["latitude"], f["longitude"]) for f in facilities]))
    carparks = build(facilities, elements)
    OUTPUT.parent.mkdir(exist_ok=True)
    OUTPUT.write_text(json.dumps({
        "generated_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        "attribution": "© OpenStreetMap contributors (ODbL)",
        "carparks": carparks,
    }, indent=1))
    total = sum(len(c["spots"]) for c in carparks.values())
    print(f"wrote {total} spots near {len(carparks)} car parks to {OUTPUT.relative_to(ROOT)}")


if __name__ == "__main__":
    main()
