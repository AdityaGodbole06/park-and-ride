# Park & Ride Planner

Tells commuters which station to drive to, and when to leave, by combining
traffic, predicted car park availability and live public transport.

## Status

Stage 1: collecting car park occupancy history from the Transport for NSW
Car Park API. That history will train the fill-up predictions.

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

Readings go to `data/carparks.db` (SQLite). There are no dependencies beyond
the Python 3.11 standard library.

## Tests

```sh
python3 -m unittest discover -s tests -t .
```
