# TrainerLab 3D ride view — proof of concept

First-person (or chase-cam) 3D view of a route, driven by distance travelled. Vue 3 + TypeScript + Vite + MapLibre GL JS v6,
same stack as the TrainerLab frontend so `RideView3D.vue` can be dropped in (see `INTEGRATION.md`).

```bash
npm install
npm run dev            # http://localhost:5180  (simulated rider: speed slider, position slider, Ride/Pause)
npm run build && npm run preview   # http://localhost:4173
npx vitest run         # track math + interpolation tests
node tools/mock-trainerlab.mjs     # fake TrainerLab /api/events on :8767, then open /?live=1
```
URL params: `route=komoot-3190822911|stelvio-bormio`, `d=<metres>`, `speed=<km/h>`, `imagery=satellite`, `cam=chase`,
`forests=0`, `labels=1`, `live=1` (connect to TrainerLab via the /api proxy), `test=1` (no controls, static frame).

## Files
- `src/components/RideView3D.vue` — the view. Props: `points` ([lon,lat,ele]), `distanceM`, `speedKph`, `imagery`, `forests`, `labels`, `eyeHeightM` (1.6), `lookAheadM` (30), `fovDeg` (60), `cameraMode` (`eye`|`chase`).
- `src/lib/geoTrack.ts` — cumulative distance, interpolation, look-ahead heading, grade.
- `src/lib/rideClock.ts` — smooths the 2 Hz server distance to 60 fps (dead reckoning + soft correction, snaps on lap reset).
- `src/lib/gpx.ts` — minimal GPX parser. `src/config.ts` — tile URLs / optional key.
- `public/routes/*.geo.json` — sample tracks: the prototype's Komoot Müritz tour (real lat/lon from komoot) and Bormio→Stelvio (OSRM over OSM, elevation sampled from the Terrarium DEM).
- `shoot.mjs`, `shoot-motion.mjs` — headless Chrome screenshot / console-error checks.

## Data sources (no key needed)
- Terrain: AWS Terrain Tiles (Terrarium encoding, open data, ~5–30 m effective resolution).
- Map: OpenFreeMap "liberty" style (OpenMapTiles/OSM) incl. 3D building extrusions.
- Satellite (toggle): Esri World Imagery (keyless; check Esri terms before distributing). `VITE_MAPTILER_KEY` switches it to MapTiler satellite.

## Experimental keyless data-source switches
- `&terrain=mapterhorn` — Mapterhorn DEM (30 m global, sub-metre to few-metre lidar across much of Europe). Default is `aws`.
- `&sat=eox` — EOxCloudless Sentinel-2 2024 (10 m, CC BY-NC-SA, non-commercial). `&sat=swissimage` — swisstopo SWISSIMAGE (Switzerland only).
- Default `esri` imagery is for dev/testing only: Esri requires an ArcGIS licence for the keyless World Imagery endpoint.

## Procedural scene (three.js), alternative to the map view
`?view=proc` renders a generated 3D world (terrain, roads, OSM buildings, instanced forests, grass, water, HDRI sky) for km 2.9–5.9 of the Müritz route.
See [PROCEDURAL.md](PROCEDURAL.md). Rebuild data with `npm run scene:build`; textures with `npm run scene:assets`.
