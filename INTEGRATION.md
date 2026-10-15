# Integrating the 3D ride view into TrainerLab (`ped`)

## How TrainerLab works today (relevant parts)
- **Stack:** Vue 3 + TypeScript + Vite frontend (`frontend/src`), .NET 10 ASP.NET minimal-API backend (`backend/`),
  Bluetooth FTMS port in-process (`bluetooth/`, Windows-only). The browser never talks Bluetooth itself.
- **Ride state lives on the server.** `backend/Trainer.cs` loop: every tick
  `DistanceM += speedKph/3.6 * dt` (speed from the trainer's FTMS packets), then
  `ratio = route.Ratio(DistanceM)`, `Grade = route.Grade(ratio)`, grade sent to the KICKR when it changes ≥0.2 %.
  On `ratio >= 1` the lap counter increments and `DistanceM` resets to 0.
- **Exposed via** `GET /api/events` WebSocket: `{type:"state", state: Snapshot}` every **500 ms**
  (also `GET /api/state`). Fields used here: `state.workout.distanceM`, `state.workout.running`,
  `state.workout.route` (id, lengthKm, mode, points), `state.metrics.speedKph`.
- **Frontend:** `App.vue` keeps `state` (ref<Snapshot>) from the socket; computed `workoutRoute`,
  `workoutDistance` (= `state.workout.distanceM` when the workout has progress) are passed to
  `WorkoutWizard.vue` as `:distance-m`, `:grade`, `:metrics`.
- **Routes have no coordinates.** `Route` = normalized profile `points[{x: 0..1 distance share, y: 0..1 inverted height}]`
  + `lengthKm`, `elevationSpanM`, `mode` ("profile" | "section"). Stored in `data/trainer-library.json` via `/api/library/*`.
  The Komoot route in `routes/komoot-3190822911` was built from a coordinates endpoint that *does* contain
  lat/lng — they were simply dropped (only `d`, `alt` kept in `elevation.csv`).

## What to add

### 1. Geo track on the route (data)
Add an optional field to the frontend `Route` type (`frontend/src/lib/routes.ts`):
```ts
geo?: [number, number, number?][]; // [lon, lat, ele] along the route, GeoJSON order
```
- Backend: nothing required. `LibraryStore` keeps routes as raw `JsonElement`, so `geo` is persisted untouched.
  `Ped.Route` (used for `/api/workout/start` and echoed in `state.workout.route`) ignores unknown JSON props,
  so the 2 Hz state stream does **not** carry the geo array (good — keep it that way).
- Limit: Kestrel `MaxRequestBodySize = 256 KB` (`ServerApp.cs`). ~900 points ≈ 25 KB is fine; for long GPX
  tracks, decimate to ~5–10 m spacing or raise the limit.
- Import: extend the Routes tab import to accept GPX (`lib/gpx.ts` here) and build both `points` (profile, as now)
  and `geo` from the same track. For the Komoot route, rerun its conversion keeping `lat/lng`
  (see `public/routes/komoot-3190822911.geo.json` in this PoC — same tour, 892 points).
- When a route has `geo`, it is best to derive `lengthKm` from the geo track length so the two match exactly.

### 2. Component
Copy into the prototype:
- `src/components/RideView3D.vue` → `frontend/src/components/RideView3D.vue`
- `src/lib/geoTrack.ts`, `src/lib/rideClock.ts`, `src/lib/gpx.ts`, `src/config.ts` → `frontend/src/lib/`
  (fix the import paths: the component imports `../lib/...` and `../config`)
- `yarn add maplibre-gl` (v6). The `?url` worker import is Vite-specific and already matches the prototype's Vite setup.

### 3. Wiring — exactly which state goes to `distanceM`
In `App.vue` (or inside `WorkoutWizard.vue`'s ride board, behind a "3D" toggle):
```ts
import { distanceToRouteRatio } from "./lib/routes";
import { buildGeoTrack } from "./lib/geoTrack";

// geo comes from the LIBRARY copy of the route (state.workout.route has no geo)
const rideGeo = computed(() => routes.value.find((r) => r.id === workoutRoute.value?.id)?.geo ?? null);
const rideGeoLengthM = computed(() => (rideGeo.value ? buildGeoTrack(rideGeo.value).lengthM : 0));

// TrainerLab distance → route ratio (handles "section" mode, where distance is surface length) → metres on the geo track
const ride3dDistance = computed(() =>
  workoutRoute.value && rideGeo.value
    ? distanceToRouteRatio(workoutRoute.value, workoutDistance.value) * rideGeoLengthM.value
    : 0,
);
const ride3dSpeed = computed(() => (state.value.workout.running ? state.value.metrics.speedKph ?? 0 : 0));
```
```vue
<RideView3D v-if="rideGeo" :points="rideGeo" :distance-m="ride3dDistance" :speed-kph="ride3dSpeed" />
```
- `workoutDistance` = `state.workout.distanceM` (server-integrated, resets to 0 each lap; the component snaps on jumps > 60 m).
- `speedKph` is only used for dead-reckoning between the 500 ms updates (RideClock) — the server distance stays the source of truth.
- The component is `position:absolute; inset:0` — put it in a positioned container behind the ride HUD
  (the existing fullscreen ride mode `workoutFullscreen.ts` is a natural place).

### 4. Optional: grade from the geo track
Today grade comes from the 256-point profile. With `geo` present, the backend could compute grade from the real
elevations (smoothed over ~50–100 m — DEM/GPS elevation on switchbacks is noisy) so what you see and what the KICKR
feels match even better.
