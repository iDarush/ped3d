<template>
  <div class="poc">
    <RideScene3D
      v-if="points && proc"
      :scene="procScene"
      :points="points"
      :distance-m="trackDistance"
      :speed-kph="speedKph"
      :shadows="shadows"
      :quality="quality"
      :wind="wind"
      :birch-preview="birchPreview"
      :birch-cards="birchCards"
      :all-birches="allBirches"
      :forest-mix="forestMix"
      :forest-stage="forestStage"
      :tree-grounding="treeGrounding"
      :forest-floor="forestFloor"
      :field-verge="fieldVerge"
      :eye-height-m="eyeH"
      :time-s="timeS"
      :test-mode="testMode"
      :camera-mode="chase ? 'chase' : 'eye'"
      @ready="onProcReady"
      @frame="onFrame"
    />
    <RideView3D
      v-else-if="points"
      :points="points"
      :distance-m="trackDistance"
      :speed-kph="speedKph"
      :imagery="imagery"
      :forests="forests"
      :labels="labels"
      :test-mode="testMode"
      :camera-mode="chase ? 'chase' : 'eye'"
      @ready="ready = true"
      @frame="onFrame"
    />
    <div class="hud">
      <div class="big">{{ (shownDistance / 1000).toFixed(2) }} <small>km</small></div>
      <div>{{ speedKph.toFixed(1) }} km/h · grade {{ grade.toFixed(1) }}% · elev {{ elev.toFixed(0) }} m</div>
      <div class="muted">{{ routeName }} · {{ (lengthM / 1000).toFixed(2) }} km{{ live ? " · LIVE " + liveStatus : "" }}</div>
    </div>
    <div v-if="!testMode" class="panel">
      <label>Route
        <select v-model="routeId" :disabled="live">
          <option v-for="r in ROUTES" :key="r.id" :value="r.id">{{ r.name }}</option>
        </select>
      </label>
      <template v-if="!live">
        <label>Speed {{ simSpeed }} km/h <input v-model.number="simSpeed" type="range" min="0" max="80" step="1" /></label>
        <label>Position <input v-model.number="simDistance" type="range" :min="segFrom" :max="segTo" step="1" @input="playing = false" /></label>
        <button @click="playing = !playing">{{ playing ? "Pause" : "Ride" }}</button>
      </template>
      <label><input v-model="proc" type="checkbox" :disabled="routeId !== 'komoot-3190822911'" /> Procedural scene</label>
      <label v-if="proc">Quality
        <select :value="quality" @change="setQuality(($event.target as HTMLSelectElement).value)">
          <option value="low">low</option><option value="med">med</option><option value="high">high</option>
        </select>
      </label>
      <label v-if="proc"><input v-model="shadows" type="checkbox" /> Shadows</label>
      <button v-if="proc && forestMix && forestStage !== 'full'" @click="restoreFullForest">Полный лес (сейчас {{ forestStage }})</button>
      <span v-if="proc" class="muted">{{ fpsText }}</span>
      <label v-if="!proc"><input v-model="satellite" type="checkbox" /> Satellite</label>
      <label><input v-model="chase" type="checkbox" /> Chase cam</label>
      <label v-if="!proc"><input v-model="forests" type="checkbox" /> 3D forests</label>
      <label v-if="!proc"><input v-model="labels" type="checkbox" /> Labels</label>
    </div>
    <div v-if="!ready" class="loading">{{ proc ? "Building procedural scene…" : "Loading terrain…" }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import RideView3D from "./components/RideView3D.vue";
import RideScene3D from "./components/RideScene3D.vue";
import { parseQuality } from "./lib/quality";
import { parseForestFloor } from './lib/forestFloor';
import { buildGeoTrack, type GeoPoint } from "./lib/geoTrack";

const ROUTES = [
  { id: "komoot-3190822911", name: "Müritz-Tour (komoot, 18.9 km)" },
  { id: "stelvio-bormio", name: "Bormio → Stelvio (21.3 km)" },
];
const q = new URLSearchParams(location.search);
const testMode = q.has("test");
const live = q.has("live");
const routeId = ref(q.get("route") ?? ROUTES[0].id);
const satellite = ref(q.get("imagery") === "satellite");
const chase = ref(q.get("cam") === "chase");
const forests = ref(q.get("forests") !== "0");
const labels = ref(q.get("labels") === "1");
// procedural three.js scene (?view=proc): only built for a segment of the Müritz route so far
const proc = ref(q.get("view") === "proc");
const procScene = "scenes/" + (q.get("scene") ?? "muritz-3k") + "/";
const shadows = ref(q.get("shadows") !== "0");
const quality = parseQuality(q.get("q"));
const wind = q.get("wind") !== "0";
const treeGrounding = q.get("grounding") === "off" ? "off" : q.get("grounding") === "shade" ? "shade" : "full";
const forestMix = q.get("forest") === "mix";
const fieldVerge = forestMix && q.get('fieldVerge') !== '0';
const forestFloor = parseForestFloor(q.get('floor'),forestMix);
const forestStage = ["cards","trees","shrubs","grass","full"].includes(q.get("forestStage") ?? "") ? q.get("forestStage")! : "full";
const allBirches = !forestMix && q.get("birch") === "all";
const birchPreview = !forestMix && (allBirches || q.get("birch") === "1");
const birchCards = allBirches || (birchPreview && q.get("cards") !== "0");
const eyeH = Number(q.get("eye") ?? 1.6); // eye height [m], e.g. &eye=0.4 for a low view
const timeS = Number(q.get("t") ?? 3);
function restoreFullForest() {
  const u = new URL(location.href);
  u.searchParams.delete("forestStage");
  u.searchParams.set("d", String(Math.round(simDistance.value)));
  location.href = u.toString();
}
function setQuality(v: string) {
  // presets change geometry and renderer settings, so reload with the new parameter
  const u = new URL(location.href);
  u.searchParams.set("q", v);
  u.searchParams.set("view", "proc");
  u.searchParams.set("d", String(Math.round(simDistance.value)));
  location.href = u.toString();
}
const procSeg = ref<{ from: number; to: number } | null>(null);
const fpsText = ref("");
function onProcReady(info: { from: number; to: number; triangles: number; trees: number }) {
  procSeg.value = info;
  if (!q.has("d") || simDistance.value < info.from || simDistance.value > info.to) simDistance.value = info.from;
  ready.value = true;
  console.info(`procedural scene ready: ${info.trees} trees, ~${info.triangles} triangles`);
}
watch(proc, () => {
  ready.value = false;
  procSeg.value = null;
});
const imagery = computed(() => (satellite.value ? "satellite" : "vector"));

const points = ref<GeoPoint[] | null>(null);
const routeName = ref("");
const lengthM = computed(() => (points.value ? buildGeoTrack(points.value).lengthM : 0));
const ready = ref(false);

// --- simulated rider (no trainer needed) ---
const simSpeed = ref(Number(q.get("speed") ?? 25));
const simDistance = ref(Number(q.get("d") ?? 0));
const playing = ref(!testMode);

// --- live TrainerLab state (?live=1, via vite proxy to :8767) ---
const liveDistance = ref(0),
  liveSpeed = ref(0),
  liveRatio = ref(0),
  liveStatus = ref("connecting");

const speedKph = computed(() => (live ? liveSpeed.value : playing.value ? simSpeed.value : 0));
const trackDistance = computed(() => (live ? liveRatio.value * lengthM.value : simDistance.value));

const segFrom = computed(() => (proc.value && procSeg.value ? procSeg.value.from : 0));
const segTo = computed(() => (proc.value && procSeg.value ? procSeg.value.to : lengthM.value));
const shownDistance = ref(0),
  grade = ref(0),
  elev = ref(0);
function onFrame(f: { distanceM: number; gradePct: number; groundM: number; fps?: number; calls?: number; triangles?: number; birches?: { lod0: number; lod1: number; cards?: number }; vegetation?: { cards: number; lod0: number; lod1: number; shrubs: number; grass: number; rootTufts?: number }; render?: { width: number; height: number } }) {
  if (f.fps != null) fpsText.value = `${f.fps.toFixed(0)} fps · ${f.calls} draw calls · ${((f.triangles ?? 0) / 1000).toFixed(0)}k tris · q=${quality}`;
  if (forestMix && f.vegetation) fpsText.value += ` · forest ${f.vegetation.lod0}+${f.vegetation.lod1} · cards ${f.vegetation.cards} · shrubs ${f.vegetation.shrubs} · tufts ${f.vegetation.grass} · roots ${f.vegetation.rootTufts ?? 0}`;
  if (allBirches) fpsText.value += " · all birch";
  if (birchPreview && f.birches) fpsText.value += ` · birch ${f.birches.lod0}+${f.birches.lod1}`;
  if (birchCards && f.birches?.cards != null) fpsText.value += ` · cards ${f.birches.cards}`;
  if (f.render) fpsText.value += ` · render ${f.render.width}×${f.render.height}`;
  shownDistance.value = live ? liveDistance.value : f.distanceM;
  grade.value = Number.isFinite(f.gradePct) ? f.gradePct : 0;
  elev.value = f.groundM;
}

async function loadRoute(id: string) {
  const r = await fetch(`/routes/${id}.geo.json`);
  if (!r.ok) throw new Error(`No geo track for route ${id}`);
  const data = (await r.json()) as { name: string; points: GeoPoint[] };
  routeName.value = data.name;
  points.value = data.points;
}
watch(routeId, (id) => {
  simDistance.value = 0;
  void loadRoute(id);
});

let timer = 0,
  last = performance.now(),
  socket: WebSocket | null = null;
function simulate() {
  const now = performance.now();
  const dt = (now - last) / 1000;
  last = now;
  // emulate TrainerLab: the server integrates speed and publishes distance (here at the full timer rate)
  if (!playing.value) return;
  const a = segFrom.value,
    b = segTo.value;
  const next = simDistance.value + (simSpeed.value / 3.6) * dt;
  simDistance.value = next > b ? a : next; // loop the segment (whole route in map mode)
}

type Snapshot = { metrics: Record<string, number>; workout: { running: boolean; distanceM?: number; route?: { id: string; lengthKm: number } } };
function connectLive() {
  socket = new WebSocket(`${location.protocol === "https:" ? "wss:" : "ws:"}//${location.host}/api/events`);
  socket.onopen = () => (liveStatus.value = "online");
  socket.onclose = () => {
    liveStatus.value = "offline";
    setTimeout(connectLive, 1500);
  };
  socket.onmessage = (ev) => {
    const msg = JSON.parse(ev.data) as { type: string; state: Snapshot };
    if (msg.type !== "state") return;
    const w = msg.state.workout;
    liveDistance.value = w.distanceM ?? 0;
    liveSpeed.value = w.running ? (msg.state.metrics.speedKph ?? 0) : 0;
    // profile mode: ratio = distance / lengthKm. (section mode: use distanceToRouteRatio from lib/routes.ts)
    liveRatio.value = w.route ? (w.distanceM ?? 0) / (w.route.lengthKm * 1000) : 0;
    if (w.route && w.route.id !== routeId.value && ROUTES.some((r) => r.id === w.route!.id)) routeId.value = w.route.id;
  };
}

onMounted(async () => {
  await loadRoute(routeId.value);
  if (live) connectLive();
  else timer = window.setInterval(simulate, 500); // same 2 Hz cadence as TrainerLab's WebSocket
});
onBeforeUnmount(() => {
  clearInterval(timer);
  socket?.close();
});
</script>

<style>
html, body, #app { margin: 0; height: 100%; background: #111; font-family: system-ui, sans-serif; }
.poc { position: relative; width: 100%; height: 100%; overflow: hidden; }
.hud { position: absolute; left: 16px; top: 16px; color: #fff; text-shadow: 0 1px 3px #000a; background: #0006; padding: 10px 14px; border-radius: 10px; }
.hud .big { font-size: 34px; font-weight: 700; }
.hud .muted { opacity: 0.75; font-size: 12px; }
.panel { position: absolute; left: 16px; bottom: 16px; right: 16px; display: flex; flex-wrap: wrap; gap: 14px; align-items: center; color: #fff; background: #000a; padding: 10px 14px; border-radius: 10px; font-size: 13px; }
.panel input[type="range"] { width: 220px; vertical-align: middle; }
.loading { position: absolute; inset: 0; display: grid; place-items: center; color: #fff; }
</style>
