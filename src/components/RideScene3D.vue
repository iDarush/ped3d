<template>
  <div ref="container" class="ride-scene-3d">
    <div v-if="outside" class="outside">Procedural scene covers {{ (seg.from / 1000).toFixed(1) }}–{{ (seg.to / 1000).toFixed(1) }} km of this route</div>
    <div class="attrib">{{ attribution }}</div>
  </div>
</template>

<script setup lang="ts">
// Procedurally generated first-person ride scene (three.js). Same interface as RideView3D, so it is a drop-in alternative:
//   <RideScene3D scene="scenes/muritz-3k/" :points="geo" :distance-m="trackDistance" :speed-kph="speed" camera-mode="eye" />
import * as THREE from "three";
import { HDRLoader } from "three/examples/jsm/loaders/HDRLoader.js";
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import { angleDelta, buildGeoTrack, lookAheadBearing, sampleTrack, trackGrade, type GeoPoint, type GeoTrack } from "../lib/geoTrack";
import { RideClock } from "../lib/rideClock";
import { loadProcScene, SUN_DIR, type BuiltScene } from "../lib/procScene";
import { QUALITY, type Quality } from "../lib/quality";

const props = withDefaults(
  defineProps<{
    /** base URL of a built scene folder (tools/build-scene.mjs output) */
    scene: string;
    points: GeoPoint[];
    distanceM: number;
    speedKph?: number;
    eyeHeightM?: number;
    lookAheadM?: number;
    fovDeg?: number;
    cameraMode?: "eye" | "chase";
    /** quality preset: low | med (integrated GPUs) | high */
    quality?: Quality;
    /** set false to force shadows off regardless of the preset */
    shadows?: boolean;
    testMode?: boolean;
    /** foliage wind animation */
    wind?: boolean;
    /** opt-in local asset evaluation, disabled in production */
    birchPreview?: boolean;
    /** test mode: fixed animation time [s] (for reproducible frames / wind sequences) */
    timeS?: number;
  }>(),
  { wind: true, timeS: 3, speedKph: 0, eyeHeightM: 1.6, lookAheadM: 30, fovDeg: 60, cameraMode: "eye", quality: "med", shadows: true, testMode: false },
);
const emit = defineEmits<{
  ready: [info: { from: number; to: number; triangles: number; trees: number }];
  frame: [info: { distanceM: number; bearing: number; groundM: number; gradePct: number; fps: number; calls: number; triangles: number; forest: number }];
}>();

const container = ref<HTMLDivElement | null>(null);
const outside = ref(false);
const seg = ref({ from: 0, to: 0 });
const attribution = ref("");
let track: GeoTrack = buildGeoTrack(props.points);
const clock = new RideClock();
let renderer: THREE.WebGLRenderer | null = null;
let built: BuiltScene | null = null;
let raf = 0,
  disposed = false,
  bearing = NaN,
  tilt = -2;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(props.fovDeg, 1, 0.3, 8000);
const sun = new THREE.DirectionalLight(0xfff1dc, 2.6);
const sunDir = SUN_DIR; // afternoon sun from the south-west
const preset = { ...QUALITY[props.quality] };
preset.shadows = preset.shadows && props.shadows;
// fog: the scene fog is always the open-country haze. The dark green forest fog is direction-aware and lives
// in the materials (lib/forestFog.ts): its density per view direction comes from how much forest the ray crosses.
const OPEN_FOG = { color: new THREE.Color(0xb9c9d8), near: 250, far: 5200 };
const fog = new THREE.Fog(OPEN_FOG.color.clone(), OPEN_FOG.near, OPEN_FOG.far);
let forestF = -1;
// "forest wall": an open cylinder just inside the forest-fog distance. Its opacity per direction is the forest fog
// at that distance, so it only hides sky between trunks where the forest really is that deep, never over open land.
let wallMat: THREE.MeshBasicMaterial | null = null;
const wall = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 1, 64, 1, true));
wall.renderOrder = 10;
wall.frustumCulled = false;
let lastNow = 0;
let fps = 0,
  frames = 0,
  fpsT0 = 0;

watch(
  () => props.points,
  (p) => {
    track = buildGeoTrack(p);
    bearing = NaN;
  },
);
watch(
  () => [props.distanceM, props.speedKph] as const,
  ([d, v]) => clock.update(d, v ?? 0),
  { immediate: true },
);

function resize() {
  const el = container.value;
  if (!el || !renderer) return;
  renderer.setSize(el.clientWidth, el.clientHeight, false);
  camera.aspect = el.clientWidth / Math.max(1, el.clientHeight);
  camera.updateProjectionMatrix();
}

function localAt(d: number) {
  const p = sampleTrack(track, d);
  const [x, z] = built!.toLocal(p.lon, p.lat);
  return { x, z, ele: p.ele };
}

function frame(now: number) {
  if (disposed) return;
  raf = requestAnimationFrame(frame);
  if (!built || !renderer) return;
  const s = built.data;
  const raw = Math.min(track.lengthM, Math.max(0, clock.tick(now)));
  outside.value = raw < s.from - 1 || raw > s.to + 1;
  const d = Math.min(s.to, Math.max(s.from, raw));
  const p = localAt(d);
  const target = lookAheadBearing(track, d, props.lookAheadM);
  if (!Number.isFinite(bearing) || props.testMode) bearing = target;
  bearing = (bearing + angleDelta(bearing, target) * 0.08 + 360) % 360;
  const b = (bearing * Math.PI) / 180;
  const fwd = new THREE.Vector3(Math.sin(b), 0, -Math.cos(b)); // north = -z
  const ground = built.heightAt(p.x, p.z);
  const g = trackGrade(track, d + 20, 80);
  const slopeDeg = Number.isFinite(g) ? (Math.atan(g / 100) * 180) / Math.PI : 0;
  const targetTilt = Math.min(8, Math.max(-12, slopeDeg * 0.6 - 2));
  tilt = props.testMode ? targetTilt : tilt + (targetTilt - tilt) * 0.05;
  if (props.cameraMode === "chase") {
    const bk = localAt(d - 10);
    const camY = Math.max(built.heightAt(bk.x, bk.z), ground) + 4;
    camera.position.set(bk.x, camY, bk.z);
    const to = new THREE.Vector3(p.x, 0, p.z).addScaledVector(fwd, 40);
    to.y = ground + 40 * Math.tan((tilt * Math.PI) / 180) + 1;
    camera.lookAt(to);
  } else {
    const camY = ground + props.eyeHeightM;
    camera.position.set(p.x, camY, p.z);
    const to = new THREE.Vector3(p.x, 0, p.z).addScaledVector(fwd, 60);
    to.y = camY + 60 * Math.tan((tilt * Math.PI) / 180);
    camera.lookAt(to);
  }
  // shadow frustum follows the rider, snapped to texels to avoid shimmering
  const c = camera.position.clone().addScaledVector(fwd, preset.shadowHalf * 0.6);
  const snap = 0.25;
  c.set(Math.round(c.x / snap) * snap, ground, Math.round(c.z / snap) * snap);
  sun.position.copy(c).addScaledVector(sunDir, 400);
  sun.target.position.copy(c);
  sun.target.updateMatrixWorld();
  // canopy shade (smoothed over ~1.5 s); the fog itself is per direction, see forestFog.ts
  const fTarget = built.forestFactor(p.x, p.z);
  const dt = lastNow ? Math.min(0.2, (now - lastNow) / 1000) : 0;
  lastNow = now;
  forestF = forestF < 0 || props.testMode ? fTarget : forestF + (fTarget - forestF) * Math.min(1, dt * 0.7);
  const f = forestF;
  // canopy shade: less direct sun and sky light under trees (cheap stand-in for shadows on "low")
  sun.intensity = 2.6 * (1 - (preset.shadows ? 0.2 : 0.5) * f);
  scene.environmentIntensity = 0.55 * (1 - 0.35 * f);
  // foliage: wind time, back-light glow follows the (canopy-dimmed) sun
  const fu = built.foliage.uniforms;
  fu.uTime.value = props.testMode ? props.timeS : now / 1000;
  fu.uWind.value = props.wind ? 1 : 0;
  fu.uGlow.value = 2.2 * (sun.intensity / 2.6);
  const wallR = preset.forestFogFar * 0.98;
  wall.scale.set(wallR, 60, wallR);
  wall.position.set(camera.position.x, camera.position.y + 18, camera.position.z);
  // detailed trees only near the rider; trees/terrain fully hidden by forest fog are culled per direction in update()
  const cardR = preset.cardR;
  built.update(camera.position, fwd, { detailR: Math.min(preset.detailR, cardR), cardR, grassR: preset.grassR, fogFar: fog.far });
  const t0 = performance.now();
  renderer.render(scene, camera);
  (window as unknown as { __rideInfo: object }).__rideInfo = { calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, blades: built.grassStats().blades, birches: built.birchStats() };
  if (props.testMode) {
    // headless (software GL) is far too slow for a continuous loop: render a few frames, report the cost, stop
    renderer.getContext().readPixels(0, 0, 1, 1, renderer.getContext().RGBA, renderer.getContext().UNSIGNED_BYTE, new Uint8Array(4)); // wait for the GPU
    const w = window as unknown as { __rideFrameMs: number[]; __rideDone: boolean };
    (w.__rideFrameMs ??= []).push(performance.now() - t0);
    if (w.__rideFrameMs.length >= 3) {
      w.__rideDone = true;
      cancelAnimationFrame(raf);
    }
  }
  frames++;
  if (now - fpsT0 > 1000) {
    fps = (frames * 1000) / (now - fpsT0);
    frames = 0;
    fpsT0 = now;
    (window as unknown as { __rideFps: number }).__rideFps = fps;
  }
  emit("frame", { distanceM: d, bearing, groundM: ground, gradePct: trackGrade(track, d), fps, calls: renderer.info.render.calls, triangles: renderer.info.render.triangles, forest: f });
}

onMounted(async () => {
  const el = container.value!;
  renderer = new THREE.WebGLRenderer({ antialias: preset.antialias, preserveDrawingBuffer: props.testMode, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, preset.pixelRatio));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  renderer.shadowMap.enabled = preset.shadows;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  el.prepend(renderer.domElement);
  resize();
  window.addEventListener("resize", resize);

  const base = props.scene.endsWith("/") ? props.scene : props.scene + "/";
  const [hdr, b] = await Promise.all([new HDRLoader().loadAsync("scene-assets/sky.hdr"), loadProcScene(base, renderer, { quality: preset, birchPreview: props.birchPreview })]);
  if (disposed) return;
  built = b;
  hdr.mapping = THREE.EquirectangularReflectionMapping;
  scene.background = hdr;
  scene.backgroundIntensity = 0.9;
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromEquirectangular(hdr).texture;
  scene.environmentIntensity = 0.55;
  pmrem.dispose();
  scene.fog = fog;
  wallMat = built.forestFog.wallMaterial();
  wall.material = wallMat;
  scene.add(wall);
  scene.add(new THREE.HemisphereLight(0xcfe0ff, 0x4a5a35, 0.35));
  sun.castShadow = preset.shadows;
  sun.shadow.mapSize.set(preset.shadowMap, preset.shadowMap);
  const sh = preset.shadowHalf;
  Object.assign(sun.shadow.camera, { left: -sh, right: sh, top: sh, bottom: -sh, near: 1, far: 900 });
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.6;
  scene.add(sun, sun.target);
  scene.add(built.root);
  seg.value = { from: built.data.from, to: built.data.to };
  attribution.value = built.data.attribution.join(" · ");
  emit("ready", { from: built.data.from, to: built.data.to, triangles: built.stats.triangles, trees: built.stats.treeInstances });
  raf = requestAnimationFrame(frame);
});

onBeforeUnmount(() => {
  disposed = true;
  cancelAnimationFrame(raf);
  window.removeEventListener("resize", resize);
  built?.dispose();
  wall.geometry.dispose();
  wallMat?.dispose();
  renderer?.dispose();
  renderer?.domElement.remove();
});

defineExpose({ scene, camera });
</script>

<style scoped>
.ride-scene-3d {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.ride-scene-3d :deep(canvas) {
  width: 100%;
  height: 100%;
  display: block;
}
.outside {
  position: absolute;
  top: 12px;
  right: 12px;
  background: rgba(0, 0, 0, 0.55);
  color: #fff;
  font: 13px system-ui;
  padding: 6px 10px;
  border-radius: 6px;
}
.attrib {
  position: absolute;
  right: 6px;
  bottom: 4px;
  max-width: 70%;
  color: rgba(255, 255, 255, 0.85);
  text-shadow: 0 0 3px #000;
  font: 10px system-ui;
  text-align: right;
}
</style>
