# API contract

Base URL in development: `http://localhost:8000`. All times are ISO 8601 in
Sydney time, e.g. `2026-10-14T08:25+11:00`. Coordinates are decimal degrees.

## `GET /places?q=martin place`

Search addresses, stops and landmarks (for the address boxes).

```json
[{ "name": "Martin Place Station, Sydney", "type": "stop", "lat": -33.867648, "lon": 151.210583 }]
```

`type` is one of `stop`, `street`, `poi`, `suburb`, `singlehouse` (an address), and others.

## `GET /plan`

| Param | Example | Notes |
|---|---|---|
| `from` | `-33.696,150.955` | `lat,lon` |
| `to` | `-33.8676,151.2106` | `lat,lon` |
| `arrive_by` | `08:30` or ISO datetime | optional |
| `depart_at` | `07:45` or ISO datetime | optional; default is now. Not both. |

```json
{
  "mode": "depart_at",
  "time": "2026-10-13T09:50+11:00",
  "drive_times": "osrm (no live traffic)",
  "carparks_considered": ["Kellyville (north)", "Bella Vista", "..."],
  "options": [
    {
      "carpark": {
        "id": "31", "name": "Bella Vista", "suburb": "Bella Vista",
        "lat": -33.7302, "lon": 150.9441,
        "capacity": 774, "free": 0, "status": "full",
        "reading_at": "2026-10-13T09:44+11:00"
      },
      "parking_status": "full",
      "leave_at": "2026-10-13T09:51+11:00",
      "drive_minutes": 8,
      "arrive_carpark_at": "2026-10-13T09:59+11:00",
      "depart_carpark_at": "2026-10-13T10:03+11:00",
      "arrive_at": "2026-10-13T10:52+11:00",
      "total_minutes": 61,
      "legs": [
        { "mode": "walk", "line": null, "from": "1 Byles Pl, Bella Vista", "to": "Bella Vista Station", "depart": "...", "arrive": "..." },
        { "mode": "metro", "line": "M1", "from": "Bella Vista Station, Platform 1", "to": "Martin Place Station, Platform 3", "depart": "...", "arrive": "..." }
      ],
      "warnings": ["Car park is full right now"],
      "nearby_parking": [ "<NearbySpot>", "..." ],
      "suggested_spot": "<NearbySpot or null>"
    }
  ]
}
```

- `status` / `parking_status`: `available`, `filling`, `full` or `unknown`.
  `parking_status` is what applies to *this trip*: it's `unknown` when you'd
  arrive more than 45 min from now (live data says little that far ahead).
- `mode` in legs: `walk`, `train`, `metro`, `light rail`, `bus`, `coach`, `ferry`, `school bus`, `transport`.
- `nearby_parking`: other places to park within walking distance of the
  station, closest first (up to 5).
- `suggested_spot`: set when the official car park is full or filling and
  there's a reasonable alternative nearby (public, or a community spot,
  within 15 min walk); the UI should lead with it. It's a NearbySpot plus
  `extra_walk_minutes`: how much longer the walk is than from the official
  car park, so the user should allow that much extra time.

### NearbySpot

```json
{
  "id": "osm:way/123456",
  "name": "Hills Shire Council car park",
  "kind": "public",
  "source": "osm",
  "lat": -33.7341, "lon": 150.9502,
  "walk_minutes": 11,
  "capacity": 245,
  "access": "public",
  "fee": "free",
  "max_stay": null,
  "notes": null,
  "confirmations": 0,
  "warning": null
}
```

| Field | Values |
|---|---|
| `source` | `osm` (OpenStreetMap) or `community` (added by a user) |
| `kind` | `park & ride`, `council`, `customers`, `street`, `car park`, `community` |
| `access` | `public`, `customers` (customers only, check signs) or `unknown` |
| `fee` | `free`, `paid` or `null` (unknown) |
| `max_stay` | text such as `"2 hours"`, or `null` |
| `walk_minutes` | estimated walk to the station |
| `notes` | community tip, e.g. "Church lets commuters park weekdays, fills by 8:15" |
| `confirmations` | how many users have said the tip is still right (community spots start at 1: the person who added it) |
| `warning` | text to show when the spot isn't known to be public, e.g. "Private land: check the signs. You may get a parking notice or be towed." `null` for public spots |
| `last_confirmed_at` | community spots only; spots not confirmed for 90 days are hidden |

OpenStreetMap data must be credited in the UI: "© OpenStreetMap contributors".

## `GET /carparks`

Every TfNSW car park with live status (same shape as `carpark` above).

## `GET /carparks/{id}/nearby`

`NearbySpot[]` for one car park, closest first (all of them, not just 5).

## `POST /spots`

Add a community known spot.

```json
{ "carpark_id": "31", "name": "Emmanuel Baptist Church", "lat": -33.7310, "lon": 150.9470,
  "notes": "Weekday parking OK for commuters, fills by 8:15" }
```

Returns the created `NearbySpot` (201). `name` 1–80 chars, `notes` up to
280, and the location must be within 1.5 km of the station; otherwise 422
with `{"detail": "<reason>"}`.

## `POST /spots/{id}/confirm`

"This tip is still right." Returns the updated `NearbySpot`.
