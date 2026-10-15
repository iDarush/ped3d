# Procedural ride scene (three.js) — proof of concept

Instead of drawing a map, generate a "believable", not 1:1, 3D world around the route from free data and CC0 assets.
Demo: `npm run build && npm run preview`, then open `http://localhost:4173/?view=proc` (Müritz route, km 2.9–5.9; a village and then a forest).
URL options: `&q=low|med|high` (quality preset, default `med`), `&d=4300` (position, metres along the whole route), `&cam=chase`, `&shadows=0`, `&speed=25`. The panel has Ride/Pause, speed and position sliders, a quality selector (reloads the page), chase cam, and a live readout: `fps · draw calls · triangles · q=` (from `renderer.info`).

## Pieces
| File | Role |
|---|---|
| `tools/prepare-assets.py` | One-off. Downloads CC0 textures (TextureCan 1K PBR sets and ambientCG) and a sky HDRI (Poly Haven), and writes web-sized textures to `public/scene-assets/`. Facade tiles with painted windows, the leaf-crown card (composited from ~1,300 real leaf photos), the needle/branch cards and grass blades are generated here. |
| `tools/build-scene.mjs` | Offline build step (Node + `sharp`). `node tools/build-scene.mjs --route komoot-3190822911 --from 2900 --to 5900 --name muritz-3k [--corridor 400 --far 2500 --treeRange 1500]`. Downloads go to `tools/.cache` (re-runs are offline). |
| `public/scenes/<name>/` | Output: `scene.json` (buildings, roads, water, metadata, attribution), `scene.bin` (heightfields, tree instances, track), `landcover.png` (splat weights), `far.jpg` (satellite texture for the far ring). About 6 MB in total. |
| `src/lib/procScene.ts` | Runtime: turns the built files into three.js meshes (terrain shader, roads, buildings, water, instanced trees with LOD, grass tufts). |
| `src/components/RideScene3D.vue` | Drop-in alternative to `RideView3D.vue`: same `points` / `distanceM` / `speedKph` / `cameraMode` props. Reuses `geoTrack.ts` and `rideClock.ts`, with the same eye/chase camera logic. |
| `shoot-proc.mjs` | Headless screenshots: `../shots/proc-<d>m-<eye/chase>.png`. |

## What the build step does
1. **Segment.** Cuts the route between `--from` and `--to` (plus 150 m look-ahead each side) and projects it to local metres (x east, z south, origin at the segment centre).
2. **Terrain.**
   - Downloads Mapterhorn Terrarium tiles: z15 (~1.4 m/px; this part of Germany uses GeoBasis-DE lidar) for a 4 m grid inside a ±400 m corridor, and z12 for a 25 m "far ring" extending 2.5 km beyond it.
   - Flattens a road bed along the track: the height is the track's own DEM profile smoothed over 30 m, blended back into the terrain over 9 m.
   - Pushes terrain under lakes down, and dips the corridor edge under the far mesh to hide the seam.
3. **OSM** (Overpass; tries overpass-api.de, then the mail.ru and kumi mirrors). Fetches landuse/natural/leisure polygons (multipolygon relations assembled), buildings, highways, `natural=tree` and tree rows.
4. **Land cover.** Polygons are rasterised at 2 m into grass / field-soil / forest floor / stubble weights, blurred slightly, and saved as `landcover.png`. Each farmland polygon gets a seeded random state: ploughed, green or stubble.
5. **Roads.**
   - The ridden road's width and surface come from the nearest OSM highway.
   - Other OSM roads become ribbons, except stretches that duplicate the track.
6. **Buildings.**
   - Footprints come from OSM. Levels come from `building:levels` (default 2; sheds and garages 1; barns are one 4.5 m storey); `height` and `roof:shape` are respected.
   - Gabled roofs sit on the oriented bounding box when the footprint is close to rectangular; otherwise the roof is flat.
   - Material (brick or plaster) and roof colour are chosen at random, seeded by the OSM id.
7. **Trees.**
   - Forests get a jittered grid: about 5 m spacing near the road, 6.5 m in the corridor, 9 m out to 1.5 km.
   - Species come from `leaf_type`, defaulting to the local mix of broadleaf, Scots pine and spruce. There is understory near the road.
   - Outside forests there are garden trees and bushes in villages, scrub, orchards, single meadow trees, and OSM tree nodes and rows.
   - Trees are kept off roads, verges and buildings.
8. **Far texture.** EOX Sentinel‑2 cloudless tiles (z14) are stitched into `far.jpg`.

## Runtime
- **Terrain:** `MeshStandardMaterial` patched in `onBeforeCompile`.
  - Splat-blends tiling CC0 textures, sampled at two scales with rotation to hide repetition.
  - Tints them with the Sentinel‑2 colour so that the field patterns are real.
  - Fades to the satellite texture with distance and at the corridor edge.
- **PBR maps (TextureCan):** roads, gravel shoulders, bark, roofs, brick and plaster walls use a normal map plus a packed AO/roughness map (`*_orm.jpg`: R = AO, G = roughness; used as both `aoMap` and `roughnessMap`). On `med`/`high` the terrain also gets normal maps (grass, soil, forest floor), blended with the same splat weights, in a world-space tangent frame (`GROUND_NORMALS` define).
- **Terrain tiles:** both terrain meshes are split into tiles (200 m near, 800 m far) that share vertex buffers. Tiles outside the view frustum, beyond the haze distance, or fully hidden by forest fog in their direction are skipped.
- **Trees:** one `InstancedMesh` per tree type and LOD (about 12 draw calls for all 54k trees). Every 4 m of travel or 10° of turn, the visible set is rebuilt on the CPU from a 25 m grid, using distance and a ±75° view cone.
  - Detailed trees (alpha-tested leaf, needle-clump or branch cards with bent "crown" normals, bark trunk; the only tree shadow casters) appear within `detailR`.
  - Cheap crossed cards appear out to `cardR`. Cells that are fully hidden by forest fog in their direction are skipped, so deep inside a forest almost nothing beyond ~150 m is drawn, while across an open field distant tree lines stay.
  - Crowns of trees right next to the ridden road are narrowed so branches never hang over the road into the eye camera.
- **Forest fog (direction-aware, `src/lib/forestFog.ts`):** the scene fog is always the open-country haze (250–5200 m). Forest fog is separate and depends on the view direction.
  - Whenever the camera moves 0.5 m, 128 rays (one per 2.8°) are marched over the land-cover map out to 256 m, in 4 m steps. For each direction and distance they record the "forest path": how many metres of the ray run through forest. The result is softened over ±2 directions and uploaded as a small 64×128 texture.
  - Every material's fog chunk is patched to look this up per pixel. Forest fog opacity = smoothstep(12 m, `forestFogFar`, forest path), in dark green, with the normal haze applied on top.
  - Looking into a forest gives dense green fog. Looking out of a forest edge over a field gives clear air and haze, as in open country. A distant forest across a field is outside the 256 m march, or only a thin strip, so it gets aerial haze only and shows as a tree line with a real card silhouette. The fog follows the camera position continuously, with no global switch and no time smoothing, so there are no jumps.
  - "Forest wall": an open cylinder just inside `forestFogFar`, centred on the camera. Its opacity per direction is the forest fog at that distance, faded out 8–22 m above the eye. It only hides sky between distant trunks where the forest really is that deep, and never stands over open land.
  - Sun and sky light are dimmed under the canopy, using the land cover around the camera, smoothed over about 1.5 s.
- **Canopy shade (`src/lib/canopyShade.ts`):** a cheap fake with no extra shadow casters and no extra draw calls. At load time one RG texture is baked over the 2 m land-cover grid:
  - R = canopy density: forest weight, pulled about 6 m away from the sun (a penumbra just outside the forest edge on the shadow side), then blurred.
  - G = contact AO: a soft radial blob at every tree base (radius about 0.75 × crown radius, max 7 m).
  - Ground: albedo down to about 0.45 in dense forest, slightly desaturated and warmed so the blue sky fill does not turn it grey. Static noise "sun flecks" brighten patches (up to 1.25), and contact AO adds up to −50 % at tree bases. Roads through the forest get the same shade.
  - Trunks: canopy shade plus darker bases (height AO over the lowest ~12 % of the trunk). Crowns and bushes: lower parts shaded, tops lit. Vegetation reads the texture once per instance in the vertex shader.
  - Grass blades in the forest: sparse, short and shaded (see the grass field below).
  - Open land has density 0, so it is unchanged.
- **Foliage shaders (`src/lib/foliage.ts`):** applied with `onBeforeCompile` to the existing instanced tree and grass materials. Instancing, shadows, forest fog and canopy shade keep working, and no draw calls are added. The ideas follow card-foliage "realistic tree" shaders, reimplemented from scratch.
  - Volumetric crown light: per vertex, the distance from the crown centre (per tree type, in unit tree space) and the side facing the sun set a light factor (0.3–1.3). Outer and sun-facing cards are bright; the inside and underside are dark.
  - Translucency: looking towards the sun, crowns get a warm yellow-green emissive glow, stronger at the crown edge and weaker under the canopy. Leaf sheen (environment and sun specular) is reduced, because it washed back-lit crowns out to grey.
  - Wind: whole-tree sway ∝ height² (sum of sines on the instance position, slow gusts), leaf flutter along the card normal on crowns, and trunks sway with the same function so they stay attached. Crown shadow-depth materials use the same sway. `&wind=0` turns it off.
  - Per-tree tint and brightness variation from a hash of the position, on top of the existing random colour and scale.
  - Alpha-to-coverage on foliage only when MSAA is on (med/high); plain alpha test on low.
  - Cost: no texture lookups, no extra draw calls. At km 4.53 med: 67 calls / 92,817 triangles, the same as before. Headless frame time is unchanged within noise.
- **Grass blade field (`src/lib/grassField.ts`), replacing the old alpha-tested tufts:** one draw call. It is an `InstancedBufferGeometry` of an opaque, double-sided, 5-triangle blade, so there is no alpha test and no transparency overdraw. The ideas follow blade-mesh grass shaders, reimplemented.
  - Blades are generated once per 8 m tile from the land cover and cached: dense on grass/meadow, short and sparse stubble on stubble fields, very sparse and short in forest, none on ploughed fields or the ridden road, half density on the gravel shoulder. Each blade gets a random rotation, height, lean and colour variation.
  - Every 2 m of travel or 10° of turn, the blades of a camera-following patch are copied into the instance buffer. The patch is forward-biased: behind the camera only the first ~12 m are kept, for the chase camera and turning. Density is full within 0.15 × `grassR`, then falls off as (R0/d)^1.3, with wider blades where they are sparser. Blades above the local density, by their random rank, and all blades in the outer 20 % shrink smoothly into the ground, so there is no border and no popping.
  - Colour: the ground's own grass colour (the grass texture's mean, with the same Sentinel-2 tint as the terrain shader), plus canopy shade and contact AO, with a dark base and a lighter, slightly yellow tip. The terrain's grazing-angle sheen on grass land is reduced so the ground beyond the patch has the same green.
  - Wind: a scrolling tileable noise texture gives gusts rolling across the field, plus a small flutter. Bend ∝ height², and roughness drops in gusts (sheen). It shares `uTime`/`uWind` with the trees, so `&wind=0` stops both.
  - `&eye=0.35` gives a low camera, e.g. for checking the grass close up.
- **Lighting and sky:**
  - Sky and image-based lighting come from the Poly Haven HDRI.
  - A sun with a 220 m shadow frustum follows the rider. Fog and ACES tone mapping are applied.
  - Water uses a low-roughness PBR material that reflects the environment map, with a procedural ripple normal map.

## Quality presets (`src/lib/quality.ts`)
| | low | med (default, integrated GPUs) | high |
|---|---|---|---|
| pixel ratio cap | 1 | 1.25 | 2 |
| MSAA | off | on | on |
| sun shadows | off | 1024², ±45 m box | 2048², ±90 m box |
| detailed trees (`detailR`) | 45 m | 70 m | 120 m |
| card trees, open country (`cardR`) | 900 m | 1600 m | 2600 m |
| forest fog fully opaque after this much forest along the ray (`forestFogFar`) | 110 m | 140 m | 190 m |
| grass field radius (`grassR`) / blades per m² near the camera | 25 m / 35 | 40 m / 40 | 60 m / 55 |
| crown cards (broadleaf / pine / spruce) | 11 / 12 / 32 | 11 / 12 / 32 | 18 / 24 / 60 |
| terrain normal maps | off | on | on |

**Measured with `renderer.info`** (1280×720 headless; includes the shadow pass). In forest at km 4.53 (`shoot-proc.mjs`, eye camera):

| | draw calls | triangles |
|---|---|---|
| before (one preset, 200 m chunks, LOD 260 m) | 448 | 1,612,243 |
| low | 60 | 60,155 |
| med | 67 | 89,741 |
| high | 68 | 187,991 |

After the direction-aware forest fog (eye camera):

| | km 4.53 (forest) | km 5.05 (forest edge, field on the right) | km 5.51 (forest edge) |
|---|---|---|---|
| low | 60 calls / 65,011 tris | 95 / 174,499 | — |
| med | 67 / 95,919 (with canopy shade: 67 / 92,817) | 103 / 277,883 (old fog: 72 / 178,017) | 105 / 309,666 (old fog: 72 / 117,322) |
| high | 69 / 200,899 | 105 / 432,417 | — |

At the forest edges the count goes up because the open side is now really drawn (field, distant tree lines). Before, it was hidden behind the wall. That is still below the open-field numbers.

Open field, km 3.7: before 397 calls / 947,788 triangles; after: low 99 / 364,814, med 108 / 598,634, high 109 / 672,188. Most triangles there are terrain out to the 5 km horizon.

The TextureCan maps did not change draw calls or triangles (same numbers after the change). They add about 63 MB of GPU texture memory (11 normal maps, 9 at 1024² and 2 at 512², plus 9 ORM maps at 512², RGBA8 with mipmaps). Colour maps are 1024² as before. Nothing is 2K.

What is left on a weak GPU is fill rate: alpha-tested foliage overdraw and the 10-sample terrain shader. If `med` is still slow, try `low` (no shadows or MSAA, pixel ratio 1).

**Grass field** (headless, eye camera; blades × 5 = grass triangles):

| | km 3.7 open field: calls / tris / blades | km 4.53 forest: calls / tris / blades |
|---|---|---|
| before (tufts), med | 109 / 598,762 / – | 67 / 92,817 / – |
| low | 99 / 430,069 / 17,109 | 59 / 64,736 / 965 |
| med | 107 / 768,470 / 40,088 | 66 / 102,684 / 2,373 |
| high | 107 / 1,157,917 / 105,399 | – |

Draw calls go down slightly, because the old tufts were several chunk meshes. The blades are opaque and tiny, so on a real GPU they should cost less per triangle than the alpha-tested tuft cards (no overdraw), but this is unmeasured. If the open field is slow on `med`, `low` halves the grass.

## Data sources and licences
| What | Source | Licence / terms |
|---|---|---|
| Elevation | Mapterhorn tiles (`tiles.mapterhorn.com`). Underlying: GeoBasis-DE / Copernicus DEM | Open data; credit "© Mapterhorn" + sources (https://mapterhorn.com/attribution) |
| Land use, buildings, roads, water, trees | OpenStreetMap via Overpass API | ODbL 1.0, "© OpenStreetMap contributors". The built `scene.json`/`scene.bin` are a Derived Database, so share-alike applies if they are distributed. |
| Far-ring texture | EOxCloudless 2024 (EOX IT Services) | CC BY-NC-SA 4.0: **non-commercial only**. Swap for 2016 (CC BY) or national orthophotos for commercial use. |
| Grass, soil (colour + normal), moss; leaf photos | ambientCG: Grass001, Ground048, Ground037, LeafSet009 | CC0 1.0 (https://docs.ambientcg.com/license/) |
| Forest floor, asphalt, gravel, bark, brick, plaster, roof (colour, normal, AO, roughness; 1K) | TextureCan: [ground_0006 Forest Ground with Twigs](https://www.texturecan.com/details/92/), [asphalt_0001 Grey Asphalt](https://www.texturecan.com/details/5/) (blotches flattened, brightened), [ground_0020 Ground Covered with Gravel](https://www.texturecan.com/details/194/), [wood_0025 Tree Bark](https://www.texturecan.com/details/214/), [bricks_0008 Red Brick with Trowel Marks](https://www.texturecan.com/details/81/), [concrete_0012 Stucco Plaster](https://www.texturecan.com/details/199/) (tinted), [rooftop_0008 Orange Clay Rooftop Tiles](https://www.texturecan.com/details/556/). Exact zip URLs are in `public/scene-assets/sources.json`. | CC0 1.0, commercial use OK, no attribution required (https://www.texturecan.com/terms/) |
| Sky HDRI | Poly Haven "Kloofendal 48d Partly Cloudy (Pure Sky)" | CC0 |
| Facade windows, crown cards, needle cards, grass blades, water ripples | Generated by `prepare-assets.py` / at runtime | Ours (derived from the CC0 inputs above) |

No ready-made 3D models are used. Quaternius and Kenney packs are CC0 but stylised (low-poly), and Poly Haven's photoscanned trees are 0.3–17 M triangles each. "Cards + real photo textures" gives a more realistic look per triangle at this scale.

## Limitations (honest)
- **Generic, not 1:1.** House shapes are boxes with gabled or flat roofs and a window grid: no doors, no chimneys, no shops. Tree positions are random within the right polygons.
- **Vegetation is the weakest part up close.** Card trees look good from a distance and in silhouette. Under the canopy, the needle/branch cards can look streaky, and the grass tufts are clumpy.
- **Data gaps flow straight through.** Where OSM has no landuse polygon the ground defaults to grass; untagged fields get a random state.
- **Missing details:**
  - Road surfaces have no lane markings, kerbs, potholes or banking.
  - Junctions are overlapping ribbons.
  - The flattened road bed follows the track, which can be a few metres off the OSM centreline.
- **Only one segment is built** (about 3 km, 4 MB). A whole route would be built in tiles/chunks and streamed.
- **Performance.** Darya measured about 10 fps in the forest on the original version (integrated GPU). The rework above cuts forest draw calls about 7× and triangles 9–27×; the new fps on her machine has not been measured yet. The headless box only has SwiftShader (CPU), where a frame takes about 1–3 s in the open and 2–5 s inside the forest depending on the preset (was about 9 s before the rework; 1280×720; `shoot-proc.mjs` prints the timing), so fps there is not meaningful. The live fps readout in the panel is the number to check on a real machine. Levers if needed: `&shadows=0`, a smaller LOD radius, and fewer forest cards.

## Next steps
1. **Asset quality.**
   - Proper tree impostors: render a few high-poly CC0 trees (e.g. Poly Haven pine/fir) into octahedral impostor atlases offline, and use real low-poly models near the camera.
   - Wind sway in the vertex shader.
2. **Ground.**
   - Normal and roughness maps.
   - Height-based blending.
   - Field furrows aligned with the polygon's long axis.
   - Road markings from OSM `lanes`, kerbs in villages.
3. **Buildings.**
   - Hipped roofs via a straight skeleton.
   - Doors on the facade facing the street.
   - A few CC0 props: fences, street lamps, signs, parked cars.
4. **Streaming.** Build the whole route in 500 m tiles along the track and load them in a worker ahead of the rider. Cache built tiles on the .NET backend.
5. **Data upgrades.**
   - ESA WorldCover / canopy height (Meta/WRI, 1 m) for tree heights and density.
   - National orthophotos instead of EOX for the far ring.
   - Mapillary/Panoramax for per-place styling (e.g. brick vs plaster).
