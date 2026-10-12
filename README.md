# Park & Ride Planner

Tells commuters which station to drive to, and when to leave, by combining
traffic, predicted car park availability and live public transport.

## Status

Stage 1: collecting car park occupancy history from the Transport for NSW
Car Park API. That history will train the fill-up predictions.

See [docs/PRODUCT.md](docs/PRODUCT.md) for the full product plan.

## Data collection

A GitHub Actions workflow (`.github/workflows/collect.yml`) runs every hour.
Each run polls every car park every 5 minutes for 55 minutes, then commits
the new readings:

- `data/facilities.csv`: one row per car park (name, location, capacity)
- `data/snapshots/YYYY-MM-DD.csv`: occupancy readings, dated in Sydney time

It needs the API key stored as a repository secret named `TFNSW_API_KEY`.
Until that's set, runs skip without failing.

## Setup

1. Get a free API key at https://opendata.transport.nsw.gov.au and subscribe
   the app to the **Car Park API**.
2. `cp .env.example .env` and paste the key in.
3. Poll once to check it works:

   ```sh
   python3 -m logger.collect
   ```

4. Keep it running:

   ```sh
   python3 -m logger.collect --loop 300
   ```

Readings go to `data/` as CSV. There are no dependencies beyond
the Python 3.11 standard library.

## Trip planner API

Ranks park & ride options using live car park occupancy, the TfNSW Trip
Planner (with live delays) and drive times. Drive times come from the public
OSRM server for now, so they don't include traffic.

```sh
python3 -m venv .venv && .venv/bin/pip install -r requirements.txt
.venv/bin/uvicorn planner.api:app --reload
```

| Endpoint | What it does |
|---|---|
| `GET /places?q=martin place` | Search addresses, stops and landmarks |
| `GET /plan?from=LAT,LON&to=LAT,LON&arrive_by=08:30` | Best options to arrive by a time |
| `GET /plan?from=LAT,LON&to=LAT,LON` | Best options leaving now (or `depart_at=HH:MM`) |
| `GET /carparks` | Live status of every car park |

Interactive docs are at http://localhost:8000/docs while the server runs.

## Nearby parking

When a commuter car park is full, the planner suggests other places to park
within walking distance of the station:

- **OpenStreetMap car parks** (council, shopping centre, bus park & ride...),
  precomputed into `data/nearby_parking.json` by `python3 -m planner.osm_parking`.
  A weekly workflow (`.github/workflows/nearby.yml`) refreshes it. Spots with
  time limits under 8 hours, drop-off zones and private lots are left out.
- **Community known spots**: places locals know about, such as a church that
  lets commuters park. Users add them through `POST /spots` and confirm them
  later. Spots nobody confirms for 90 days are hidden. They're stored
  separately from the OSM data, in `var/community.db`.

Anything not known to be public carries a private-land warning.

Map data © [OpenStreetMap contributors](https://www.openstreetmap.org/copyright),
available under the Open Database License.

## Tests

```sh
.venv/bin/python -m unittest discover -s tests -t .
```
