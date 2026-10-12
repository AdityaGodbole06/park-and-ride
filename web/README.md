# Park & Ride web

Vite + React + TypeScript + Tailwind v4 frontend for the planner API.

```sh
# 1. backend (from the repo root), wait ~15s for car parks to load
.venv/bin/uvicorn planner.api:app --port 8000 --reload

# 2. frontend
cd web
npm install
npm run dev        # http://localhost:5173, /api/* is proxied to :8000
npm run build      # type-check + production build
```

The dev proxy strips `/api` (`/api/plan` -> `http://localhost:8000/plan`).
A production deploy needs the same rewrite in front of the API.

## Layout

- `src/App.tsx`: plan screen state machine (idle, loading, success, error), desktop split view
- `src/lib/`: API client, types (mirror `docs/API.md`), formatting, hooks, spots context
- `src/components/`: plan form, autocomplete, decision card, backups, timeline, nearby parking, add-spot sheet
- `src/components/map/`: Leaflet maps (lazy-loaded), OSM tiles with attribution
- `src/components/ui/`: Button, Sheet (modal), Segmented, StatusPill, LineBadge

See `DESIGN_DECISIONS.md` for the visual direction.
