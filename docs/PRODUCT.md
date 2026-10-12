# Park & Ride Planner: product breakdown

## The problem

Thousands of Sydney commuters drive to a station, park, and catch a train or
metro. Every morning they make the same decision with incomplete information:

- **Will the car park still have spaces when I get there?** Popular car parks
  fill before 8am. Arriving to a full one costs 10–20 minutes.
- **Which station should I use?** The closest one isn't always the fastest
  once traffic, parking and train frequency are counted.
- **When do I need to leave?**

Today the answer is spread across three apps: Google Maps for traffic, the
Transport for NSW app for current car park numbers, and a timetable app for
trains. None of them says what parking will look like when you arrive, and
none combines the three into one recommendation.

## The product

One recommendation for the whole trip:

> **Leave by 7:25.** Drive to Kellyville (14 min), 78% chance of a spot.
> Catch the 7:46 Metro, arrive Martin Place 8:31.
>
> Backup: Rouse Hill. 6 min longer, but parking is almost guaranteed.

### Who it's for

| User | Need |
|---|---|
| Daily park & ride commuter | A reliable "leave by" time, and a warning on days the car park fills early |
| Occasional rider (event, airport, appointment) | Which station to drive to, and whether parking is realistic at that time |
| Commuter whose car park has gone full | A good fallback station, fast |

### Core features

1. **Trip planner.** Enter where you're starting, where you're going and when
   you need to arrive. You get the top 2–3 station options, each with leave
   time, drive time, chance of a park, train and arrival time.
2. **Saved commute and morning alert.** Save your usual trip. Each morning a
   push notification tells you when to leave, and warns you when today looks
   worse than usual ("Kellyville is filling 10 min early, leave by 7:15").
3. **Car park insights.** A page per car park showing its typical fill-up
   curve by weekday ("usually full by 7:52 on Tuesdays"), live occupancy, and
   how today compares to normal.
4. **Live rerouting (later).** While you're driving, if your car park is
   about to fill, it suggests switching stations.

## How it works

```
 TfNSW Car Park API ──► Collector ──► Occupancy history ──► Fill-up model ─┐
                                                                            │
 Traffic API (drive times) ───────────────────────────────────────────────┤
                                                                            ├─► Trip ranker ─► API ─► Web app / push alerts
 TfNSW Trip Planner API (trains, live delays) ────────────────────────────┘
```

### 1. Data

| Source | Gives us | Cost |
|---|---|---|
| TfNSW Car Park API | Live occupancy and capacity for commuter car parks | Free |
| TfNSW Trip Planner API | Public transport journeys from a station, with live delays | Free |
| TfNSW GTFS / GTFS-Realtime | Timetables and delays, if we need more control than Trip Planner | Free |
| Traffic: Google Routes, Mapbox or TomTom | Drive time with traffic, at a given departure time | Free tier |
| NSW school and public holidays, BOM weather | Features for the prediction model | Free |

The **collector** (built, `logger/collect.py`) polls every car park every 5
minutes and stores each new reading. The history it builds is what nobody
else has, and the prediction model depends on it.

### 2. Fill-up prediction

The question is: *what's the probability there's a free space at car park X
when I arrive at time T today?*

Built in steps, each one measured against the previous:

1. **Baseline:** the typical occupancy curve for that car park, weekday and
   time, from history. "On Tuesdays, Kellyville is 95% full at 7:45."
2. **Adjust using today's live data.** If at 7:10 it's 8% fuller than a
   normal Tuesday, shift the curve earlier. This catches unusual days.
3. **Learned model:** gradient-boosted trees with features such as time,
   weekday, school and public holidays, rain, and the live occupancy so far
   today. Predict occupancy at the arrival time with a spread, and turn that
   into a probability of finding a space.

Accuracy is measured on held-out days:
- error in predicted fill-up time, in minutes
- calibration of the parking probability (when it says 80%, are there spaces
  about 80% of the time?)

### 3. Trip ranking

For a request (start, destination, arrive-by):

1. Pick candidate car parks within a sensible driving radius of the start.
2. For each one, get the drive time for the departure time, from the traffic
   API.
3. Predict the chance of a space at the arrival time.
4. Add the walk from the car park to the platform, then get the next suitable
   services to the destination from the Trip Planner API.
5. Score each option by expected arrival time, **including the risk of
   failing to park**: an option with a 60% chance of parking is charged for
   the 40% chance you'll have to drive on to the backup station.
6. Return the best 2–3 options, with the backup spelled out.

### 4. System

| Part | Tech |
|---|---|
| Collector | Python, scheduled on GitHub Actions; data committed as daily CSVs |
| Database (from the MVP on) | Postgres (Neon or Supabase free tier), loaded from the CSVs |
| Model training | Python (pandas, scikit-learn / LightGBM), retrained weekly |
| API | FastAPI: `/plan`, `/carparks/{id}`, `/commutes` |
| Frontend | Next.js as an installable web app (PWA), so it can send push notifications without an app store |
| Alerts | Scheduled job that checks each saved commute before its usual leave time and sends web push |
| Analytics | PostHog, to get real usage numbers |

## What makes it different

The Transport for NSW apps already show **current** car park availability,
and Google Maps handles driving and transit separately. This product does two
things neither does:

1. **Predicts** availability at your arrival time, not now.
2. **Decides** for you across driving, parking and the train, with a backup
   plan built in.

## Scope

**MVP:** Sydney TfNSW commuter car parks only, trip planner, car park
insight pages, saved commute with morning alert.

**Not in the MVP:** private or council car parks, other states, live
rerouting while driving, native mobile apps.

## Roadmap

| Phase | Weeks | Outcome |
|---|---|---|
| 0. Collect | Now, keeps running | Occupancy history building up |
| 1. Explore | 1–2 | Notebook of fill-up curves per car park; first interesting finding to post |
| 2. Planner with live data | 2–4 | Working `/plan` using current occupancy, traffic and Trip Planner |
| 3. Prediction | 4–6 | Baseline and live-adjusted model, accuracy measured |
| 4. Product | 6–8 | Accounts, saved commutes, push alerts, analytics, deploy |
| 5. Launch | 8+ | Share with commuters (r/sydney, local Facebook groups for the Hills and Northwest Metro line) and iterate on feedback |

The model needs a few weeks of history before predictions are meaningful,
which is why the collector runs first.

## Success metrics

- **Model:** fill-up time error in minutes; calibration of the parking
  probability.
- **Product:** weekly active commuters, saved commutes, alert open rate,
  and how many come back the following week.

## Risks

| Risk | Mitigation |
|---|---|
| Car park sensor data has gaps or miscounts | Keep raw readings, detect impossible values, show confidence |
| Traffic API free tier runs out | Cache drive times per area and time slot; only call for real requests |
| Not enough history at launch | Launch planner on live data first; turn predictions on per car park once it has enough data |
| Only a few dozen car parks covered | Fine for an MVP: it's focused, and these are the busiest commuter car parks |
| Getting users | Target one corridor first (Northwest Metro) where car parks fill early and commuters feel the problem |

## Resume line

> Built a park & ride planner that predicts Sydney commuter car park
> availability from N months of occupancy data (fill-time error ±X min),
> combining traffic and live train data into one recommendation. Used by N
> commuters.
