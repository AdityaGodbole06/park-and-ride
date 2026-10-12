# Design Decisions

## Visual Direction
A black-and-white transport utility (Uber-inspired: ink pills, grey input rows, 16px cards) where one large "Leave by" time is the answer and colour is reserved for parking status and real Sydney line colours.

## Color Palette
- Primary: #111113 (ink; primary buttons, decision banner). Dark mode flips to #f4f4f5
- Secondary: #f0f0f1 (soft grey for chips, inputs, subtle buttons)
- Background: #fafafa (dark #0c0c0d)
- Surface: #ffffff (dark #161618)
- Text: #111113 body #55555c, muted #75757d (dark #f4f4f5 / #b4b4bb / #8d8d95)
- Accent: none as decoration. Semantic only: available #11743c, filling #9a5300, full #b4232b, plus TfNSW line colours (M1 #168388, T1 #f99d1c, ...)

## Layout
- Navigation: none beyond a 64px header (wordmark + theme toggle). It is a single-task app; anything more slows the morning check.
- Content: mobile is one column (form, then the decision card, then backups). After planning, the form collapses to a two-line trip summary so the answer sits above the fold. Desktop (>=1024px) is a 500px planner column plus a full-height map: live occupancy for every car park before planning, the chosen car park and nearby spots after.

## Typography
- Geist Variable (self-hosted). Leave-by time 64-72px bold, tracking tight; section titles 18-20px bold; body 15-17px; captions 12-14px.
- Geist Mono for clock times in the timeline and backups so columns line up.

## Key Components Needed
PlaceInput (ARIA combobox, debounced /places, my location), PlanForm (from/to/swap, Leave now / Leave at / Arrive by, time), SavedCommute, LoadingPlan (skeleton plus step list), DecisionCard (suggested-spot banner, leave by, sentence, journey bar, parking line, warnings, timeline), BackupOption, LegTimeline, JourneyBar, NearbyParking (+ SpotMap), AddSpotSheet, OverviewMap, StateMessage.

## Inspiration Sources
- `~/github/awesome-design-md/design-md/uber/DESIGN.md`: black/white duet, pill controls, ride-request form card with stacked inputs and a connector line, polarity-flipped black band (used for "X is full, park here instead").
- `design-taste-frontend` rules: no decorative accent, labels above inputs, skeleton loaders, full empty/error states, reduced motion, dark mode from the start.
- 3D gradients were considered and rejected: it is a fast utility for people in a hurry.
