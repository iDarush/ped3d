<template>
  <div ref="container" class="ride-view-3d" />
</template>

<script setup lang="ts">
// First-person 3D view of a route, driven by distance travelled.
// Drop-in for TrainerLab: <RideView3D :points="geo" :distance-m="workoutDistance" :speed-kph="state.metrics.speedKph" />
import { LngLat, Map as MlMap, setWorkerUrl, type GeoJSONSource, type StyleSpecification } from "maplibre-gl";
// MapLibre v6 ships its worker as a separate ES module; let Vite emit it as an asset.
import workerUrl from "maplibre-gl/dist/maplibre-gl-worker.mjs?url";
import "maplibre-gl/dist/maplibre-gl.css";
import { onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { angleDelta, buildGeoTrack, lookAheadBearing, sampleTrack, trackGrade, type GeoPoint, type GeoTrack } from "../lib/geoTrack";
import { RideClock } from "../lib/rideClock";
import { BASE_STYLE, DEM, SATELLITE } from "../config";

const props = withDefaults(
  defineProps<{
    /** [lon, lat, ele?] along the route */
    points: GeoPoint[];
    /** distance along the geo track, metres (already mapped from the trainer's route ratio) */
    distanceM: number;
    /** current speed, used to interpolate between 2 Hz server updates */
    speedKph?: number;
    imagery?: "vector" | "satellite";
    forests?: boolean;
    labels?: boolean;
    eyeHeightM?: number;
    lookAheadM?: number;
    fovDeg?: number;
    /** "eye": rider's eyes; "chase": a few metres behind and above (reads better on steep terrain) */
    cameraMode?: "eye" | "chase";
    /** render faster for screenshots/tests: preserveDrawingBuffer */
    testMode?: boolean;
  }>(),
  { speedKph: 0, imagery: "vector", forests: true, labels: false, eyeHeightM: 1.6, lookAheadM: 30, fovDeg: 60, cameraMode: "eye", testMode: false },
);
const emit = defineEmits<{ ready: []; frame: [info: { distanceM: number; bearing: number; groundM: number; gradePct: number }] }>();

setWorkerUrl(workerUrl);

const container = ref<HTMLDivElement | null>(null);
const map = shallowRef<MlMap | null>(null);
let track: GeoTrack = buildGeoTrack(props.points);
const clock = new RideClock();
let bearing = NaN;
let tilt = -2; // degrees above (+) / below (-) the horizon
let raf = 0;
let disposed = false;

watch(
  () => props.points,
  (pts) => {
    track = buildGeoTrack(pts);
    bearing = NaN;
    setRouteLine();
  },
);
watch(
  () => [props.distanceM, props.speedKph] as const,
  ([d, v]) => clock.update(d, v ?? 0),
  { immediate: true },
);
watch(
  () => [props.imagery, props.forests, props.labels] as const,
  () => applyLayerToggles(),
);

function routeGeoJSON() {
  const coords: number[][] = [];
  for (let i = 0; i < track.lon.length; i++) coords.push([track.lon[i], track.lat[i]]);
  return { type: "Feature" as const, properties: {}, geometry: { type: "LineString" as const, coordinates: coords } };
}

function setRouteLine() {
  const m = map.value;
  const src = m?.getSource("ride-route") as GeoJSONSource | undefined;
  src?.setData(routeGeoJSON());
}

function firstSymbolLayer(m: MlMap): string | undefined {
  return m.getStyle().layers.find((l) => l.type === "symbol")?.id;
}

function addRideLayers(m: MlMap) {
  m.addSource("terrain-dem", { type: "raster-dem", tiles: DEM.tiles, encoding: "terrarium", tileSize: DEM.tileSize, maxzoom: DEM.maxzoom, attribution: DEM.attribution });
  m.setTerrain({ source: "terrain-dem", exaggeration: 1 });
  m.setSky({
    "sky-color": "#6fa7e8",
    "horizon-color": "#d8e8f5",
    "fog-color": "#e3edf3",
    "sky-horizon-blend": 0.6,
    "horizon-fog-blend": 0.8,
    "fog-ground-blend": 0.4,
    "atmosphere-blend": 0,
  });
  const beforeId = firstSymbolLayer(m);

  // optional satellite imagery, under roads/buildings
  m.addSource("imagery", { type: "raster", tiles: SATELLITE.tiles, tileSize: 256, maxzoom: SATELLITE.maxzoom, attribution: SATELLITE.attribution });
  const firstRoad = m.getStyle().layers.find((l) => l.id.startsWith("road") || l.id.startsWith("tunnel") || l.id.startsWith("bridge"))?.id;
  m.addLayer({ id: "imagery", type: "raster", source: "imagery", layout: { visibility: "none" } }, firstRoad);

  // poor man's forests: extrude wooded land cover so the horizon is not flat at eye level
  m.addLayer(
    {
      id: "forest-3d",
      type: "fill-extrusion",
      source: "openmaptiles",
      "source-layer": "landcover",
      filter: ["in", ["get", "class"], ["literal", ["wood", "forest"]]],
      minzoom: 12,
      paint: { "fill-extrusion-color": "#3c5e2f", "fill-extrusion-height": 16, "fill-extrusion-base": 0, "fill-extrusion-opacity": 0.92 },
    },
    "building-3d",
  );

  m.addSource("ride-route", { type: "geojson", data: routeGeoJSON() });
  m.addLayer(
    {
      id: "ride-route",
      type: "line",
      source: "ride-route",
      layout: { "line-join": "round", "line-cap": "round" },
      paint: { "line-color": "#ff7a1a", "line-opacity": 0.35, "line-width": ["interpolate", ["exponential", 2], ["zoom"], 12, 1, 18, 2, 22, 16] },
    },
    beforeId,
  );
  applyLayerToggles();
}

function applyLayerToggles() {
  const m = map.value;
  if (!m || !m.getLayer("imagery")) return;
  const sat = props.imagery === "satellite";
  m.setLayoutProperty("imagery", "visibility", sat ? "visible" : "none");
  m.setLayoutProperty("forest-3d", "visibility", props.forests ? "visible" : "none");
  for (const layer of m.getStyle().layers) {
    if (layer.type === "symbol") m.setLayoutProperty(layer.id, "visibility", props.labels ? "visible" : "none");
    // in satellite mode hide flat land-cover fills that would cover the photo
    if (layer.type === "fill" && /^(landcover|landuse|park|wood|grass|sand|ice)/.test(layer.id))
      m.setLayoutProperty(layer.id, "visibility", sat ? "none" : "visible");
  }
}

function offsetLngLat(lon: number, lat: number, bearingDeg: number, metres: number): LngLat {
  const b = (bearingDeg * Math.PI) / 180;
  const dLat = (metres * Math.cos(b)) / 111320;
  const dLon = (metres * Math.sin(b)) / (111320 * Math.cos((lat * Math.PI) / 180));
  return new LngLat(lon + dLon, lat + dLat);
}

function groundElevation(lon: number, lat: number, trackEle: number): number {
  // queryTerrainElevation returns 0 for DEM tiles that are not loaded yet;
  // trust the track's own elevation until the terrain agrees with it roughly.
  const e = map.value?.queryTerrainElevation([lon, lat]);
  const hasTrack = Number.isFinite(trackEle);
  if (e != null && Number.isFinite(e) && (!hasTrack || Math.abs(e - trackEle) < 40)) return e;
  return hasTrack ? trackEle : (e ?? 0);
}

function frame() {
  if (disposed) return;
  raf = requestAnimationFrame(frame);
  const m = map.value;
  if (!m) return;
  const d = Math.min(track.lengthM, Math.max(0, clock.tick()));
  const p = sampleTrack(track, d);
  const targetBearing = lookAheadBearing(track, d, props.lookAheadM);
  if (!Number.isFinite(bearing)) bearing = targetBearing;
  bearing = (bearing + angleDelta(bearing, targetBearing) * 0.08 + 360) % 360; // ~0.2 s smoothing at 60 fps

  // ground under the rider; never below the terrain slightly ahead
  const ahead = sampleTrack(track, d + 3);
  const ground = Math.max(groundElevation(p.lon, p.lat, p.ele), groundElevation(ahead.lon, ahead.lat, ahead.ele) - 0.5);
  // look along the slope (pitch 90 = horizon); use a long window so DEM noise does not shake the view
  const g = trackGrade(track, d + 20, 80);
  const slopeDeg = Number.isFinite(g) ? (Math.atan(g / 100) * 180) / Math.PI : 0;

  // Aim the camera at a point ahead along the smoothed heading. Passing an explicit target
  // (instead of only pitch) keeps MapLibre's "center" close to the rider, so tile LOD and
  // center elevation stay sane in the mountains.
  const targetTilt = Math.min(8, Math.max(-12, slopeDeg * 0.6 - 2));
  tilt += (targetTilt - tilt) * 0.05;
  let cam;
  if (props.cameraMode === "chase") {
    const back = 10,
      up = 4;
    const behind = sampleTrack(track, d - back);
    const camAlt = Math.max(groundElevation(behind.lon, behind.lat, behind.ele), ground) + up;
    const to = offsetLngLat(p.lon, p.lat, bearing, 40);
    cam = m.calculateCameraOptionsFromTo(new LngLat(behind.lon, behind.lat), camAlt, to, ground + 40 * Math.tan((tilt * Math.PI) / 180) + 1);
  } else {
    const camAlt = ground + props.eyeHeightM;
    const lookM = 60;
    const to = offsetLngLat(p.lon, p.lat, bearing, lookM);
    cam = m.calculateCameraOptionsFromTo(new LngLat(p.lon, p.lat), camAlt, to, camAlt + lookM * Math.tan((tilt * Math.PI) / 180));
  }
  m.jumpTo(cam);
  emit("frame", { distanceM: d, bearing, groundM: ground, gradePct: trackGrade(track, d) });
}

onMounted(() => {
  const start = sampleTrack(track, props.distanceM);
  const m = new MlMap({
    container: container.value!,
    style: BASE_STYLE as unknown as StyleSpecification,
    center: [start.lon, start.lat],
    zoom: 16,
    pitch: 80,
    maxPitch: 95,
    maxZoom: 24,
    centerClampedToGround: false,
    interactive: false,
    attributionControl: { compact: true },
    canvasContextAttributes: { antialias: true, preserveDrawingBuffer: props.testMode },
  });
  m.setVerticalFieldOfView?.(props.fovDeg);
  map.value = m;
  // OpenFreeMap's sprite lacks a few POI icons; labels are hidden anyway, so silence the warnings
  m.setMissingStyleImageResolver((id) => {
    if (!m.hasImage(id)) m.addImage(id, { width: 1, height: 1, data: new Uint8Array(4) });
  });
  m.on("load", () => {
    addRideLayers(m);
    emit("ready");
    raf = requestAnimationFrame(frame);
  });
});

onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(raf);
  map.value?.remove();
});

defineExpose({ map });
</script>

<style scoped>
.ride-view-3d {
  position: absolute;
  inset: 0;
}
</style>
