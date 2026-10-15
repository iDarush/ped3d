#!/usr/bin/env node
// Offline build step for the procedural ride scene.
//   node tools/build-scene.mjs --route komoot-3190822911 --from 2900 --to 5900 --name muritz-3k
// Fetches (and caches in tools/.cache): Mapterhorn terrain tiles, OSM data via Overpass, EOX Sentinel-2 tiles.
// Writes public/scenes/<name>/{scene.json, scene.bin, landcover.png, far.jpg}.
// All coordinates in the output are local metres: x = east, y = up, z = south (three.js convention), origin at the segment centre.
import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";

const ROOT = path.dirname(path.dirname(new URL(import.meta.url).pathname));
const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, arr) => (v.startsWith("--") ? [...a, [v.slice(2), arr[i + 1]]] : a), []));
const ROUTE = args.route ?? "komoot-3190822911";
const D0 = Number(args.from ?? 2900), D1 = Number(args.to ?? 5900);
const NAME = args.name ?? "muritz-3k";
const CORRIDOR = Number(args.corridor ?? 400); // half-width of the detailed zone, m
const FAR_MARGIN = Number(args.far ?? 2500); // low-res terrain beyond the corridor, m
const NEAR_STEP = 4, FAR_STEP = 25, LC_STEP = 2; // grid spacings, m
const CACHE = path.join(ROOT, "tools", ".cache");
const OUT = path.join(ROOT, "public", "scenes", NAME);
fs.mkdirSync(CACHE, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.kumi.systems/api/interpreter", "https://maps.mail.ru/osm/tools/overpass/api/interpreter", "https://overpass.private.coffee/api/interpreter"];
const UA = { "User-Agent": "ride3d-poc scene builder (personal prototype)" };

// ---------- seeded random ----------
let seed = 12345;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const hash01 = (n) => { let h = (n * 2654435761) >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; };

// ---------- route (same maths as src/lib/geoTrack.ts) ----------
const R = 6371008.8, rad = Math.PI / 180;
const hav = (lo1, la1, lo2, la2) => { const a = Math.sin(((la2 - la1) * rad) / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin(((lo2 - lo1) * rad) / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(a))); };
const route = JSON.parse(fs.readFileSync(path.join(ROOT, "public", "routes", ROUTE + ".geo.json"), "utf8"));
const pts = [];
for (const p of route.points) { const l = pts[pts.length - 1]; if (l && hav(l[0], l[1], p[0], p[1]) < 0.05) continue; pts.push(p); }
const cum = [0];
for (let i = 1; i < pts.length; i++) cum.push(cum[i - 1] + hav(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
const routeLen = cum[cum.length - 1];
function sampleRoute(d) {
  d = Math.min(Math.max(d, 0), routeLen);
  let i = 0; while (i < cum.length - 2 && cum[i + 1] <= d) i++;
  const f = cum[i + 1] > cum[i] ? (d - cum[i]) / (cum[i + 1] - cum[i]) : 0;
  return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * f, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * f];
}
const TRACK_MARGIN = 150; // render the road a bit beyond the ride segment (look-ahead)
const T0 = Math.max(0, D0 - TRACK_MARGIN), T1 = Math.min(routeLen, D1 + TRACK_MARGIN);
const mid = sampleRoute((D0 + D1) / 2);
const lon0 = mid[0], lat0 = mid[1];
const KX = R * rad * Math.cos(lat0 * rad), KY = R * rad;
const toLocal = (lon, lat) => [(lon - lon0) * KX, -(lat - lat0) * KY];
const toLonLat = (x, z) => [lon0 + x / KX, lat0 - z / KY];

const track = []; // {x,z,d}
for (let d = T0; d <= T1 + 1e-6; d += 2) { const [lo, la] = sampleRoute(d); const [x, z] = toLocal(lo, la); track.push({ x, z, d }); }
let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
for (const p of track) { minX = Math.min(minX, p.x); maxX = Math.max(maxX, p.x); minZ = Math.min(minZ, p.z); maxZ = Math.max(maxZ, p.z); }
const near = { x0: Math.floor((minX - CORRIDOR) / NEAR_STEP) * NEAR_STEP, z0: Math.floor((minZ - CORRIDOR) / NEAR_STEP) * NEAR_STEP };
near.nx = Math.ceil((maxX + CORRIDOR - near.x0) / NEAR_STEP) + 1; near.nz = Math.ceil((maxZ + CORRIDOR - near.z0) / NEAR_STEP) + 1; near.step = NEAR_STEP;
const far = { x0: Math.floor((near.x0 - FAR_MARGIN) / FAR_STEP) * FAR_STEP, z0: Math.floor((near.z0 - FAR_MARGIN) / FAR_STEP) * FAR_STEP, step: FAR_STEP };
far.nx = Math.ceil((near.x0 + (near.nx - 1) * NEAR_STEP + FAR_MARGIN - far.x0) / FAR_STEP) + 1; far.nz = Math.ceil((near.z0 + (near.nz - 1) * NEAR_STEP + FAR_MARGIN - far.z0) / FAR_STEP) + 1;
const farBBox = { w: toLonLat(far.x0, 0)[0], e: toLonLat(far.x0 + (far.nx - 1) * FAR_STEP, 0)[0], n: toLonLat(0, far.z0)[1], s: toLonLat(0, far.z0 + (far.nz - 1) * FAR_STEP)[1] };
console.log(`segment ${D0}-${D1} m of ${routeLen.toFixed(0)} m; near grid ${near.nx}x${near.nz} @${NEAR_STEP} m, far grid ${far.nx}x${far.nz} @${FAR_STEP} m`);

// ---------- spatial hash over the track for distance queries ----------
const HC = 25, thash = new Map();
track.forEach((p, i) => { const k = `${Math.floor(p.x / HC)},${Math.floor(p.z / HC)}`; (thash.get(k) ?? thash.set(k, []).get(k)).push(i); });
function nearestTrack(x, z, maxR = 50) {
  let best = -1, bd = maxR * maxR; const r = Math.ceil(maxR / HC), cx = Math.floor(x / HC), cz = Math.floor(z / HC);
  for (let a = -r; a <= r; a++) for (let b = -r; b <= r; b++) { const l = thash.get(`${cx + a},${cz + b}`); if (l) for (const i of l) { const dx = track[i].x - x, dz = track[i].z - z, dd = dx * dx + dz * dz; if (dd < bd) { bd = dd; best = i; } } }
  return { i: best, d: Math.sqrt(bd) };
}
// coarse distance field for corridor tests (exact enough at 10 m sampling)
const coarse = track.filter((_, i) => i % 5 === 0);
function trackDist(x, z) { const n = nearestTrack(x, z, 60); if (n.i >= 0) return n.d; let b = Infinity; for (const p of coarse) b = Math.min(b, Math.hypot(p.x - x, p.z - z)); return b; }

// ---------- terrain tiles (Mapterhorn, Terrarium-encoded 512 px WebP) ----------
const tileCache = new Map();
async function fetchCached(url, file, opts = {}) {
  const f = path.join(CACHE, file);
  if (fs.existsSync(f)) return fs.readFileSync(f);
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: UA, ...opts });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(r.status + " " + url);
      const b = Buffer.from(await r.arrayBuffer()); fs.writeFileSync(f, b); return b;
    } catch (e) { if (attempt === 2) throw e; await new Promise((s) => setTimeout(s, 1500)); }
  }
}
const lon2x = (lon, z) => ((lon + 180) / 360) * 2 ** z;
const lat2y = (lat, z) => ((1 - Math.log(Math.tan(lat * rad) + 1 / Math.cos(lat * rad)) / Math.PI) / 2) * 2 ** z;
async function loadDem(z, bb) {
  const xs = [Math.floor(lon2x(bb.w, z)), Math.floor(lon2x(bb.e, z))], ys = [Math.floor(lat2y(bb.n, z)), Math.floor(lat2y(bb.s, z))];
  const jobs = [];
  for (let x = xs[0]; x <= xs[1]; x++) for (let y = ys[0]; y <= ys[1]; y++) jobs.push((async () => {
    const buf = await fetchCached(`https://tiles.mapterhorn.com/${z}/${x}/${y}.webp`, `mt-${z}-${x}-${y}.webp`);
    if (!buf) return;
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const n = info.width, h = new Float32Array(n * n);
    for (let i = 0; i < n * n; i++) h[i] = data[i * info.channels] * 256 + data[i * info.channels + 1] + data[i * info.channels + 2] / 256 - 32768;
    tileCache.set(`${z}/${x}/${y}`, { n, h });
  })());
  for (let i = 0; i < jobs.length; i += 8) await Promise.all(jobs.slice(i, i + 8));
  console.log(`DEM z${z}: ${jobs.length} tiles`);
}
function demAt(lon, lat, z) {
  const n = 512, gx = lon2x(lon, z) * n - 0.5, gy = lat2y(lat, z) * n - 0.5;
  const px = (X, Y) => { const t = tileCache.get(`${z}/${Math.floor(X / n)}/${Math.floor(Y / n)}`); return t ? t.h[(Y % n) * n + (X % n)] : NaN; };
  const x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0;
  const a = px(x0, y0), b = px(x0 + 1, y0), c = px(x0, y0 + 1), d = px(x0 + 1, y0 + 1);
  return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy;
}

// ---------- OSM via Overpass ----------
async function loadOsm() {
  const f = path.join(CACHE, `osm-${NAME}.json`);
  if (fs.existsSync(f)) return JSON.parse(fs.readFileSync(f, "utf8"));
  const b = `${farBBox.s},${farBBox.w},${farBBox.n},${farBBox.e}`;
  const q = `[out:json][timeout:180];(way["landuse"](${b});rel["landuse"](${b});way["natural"](${b});rel["natural"](${b});way["leisure"](${b});way["building"](${b});way["highway"](${b});way["waterway"="riverbank"](${b});rel["water"](${b});node["natural"="tree"](${b}););out geom;`;
  for (const url of OVERPASS) {
    try {
      console.log("overpass", url);
      const r = await fetch(url, { method: "POST", headers: { ...UA, "Content-Type": "application/x-www-form-urlencoded" }, body: "data=" + encodeURIComponent(q), signal: AbortSignal.timeout(200000) });
      if (!r.ok) throw new Error(String(r.status));
      const j = await r.json(); fs.writeFileSync(f, JSON.stringify(j)); return j;
    } catch (e) { console.warn("  failed:", e.message); }
  }
  throw new Error("all Overpass endpoints failed");
}

// join relation member ways into closed rings
function assembleRings(members, role) {
  const segs = members.filter((m) => m.type === "way" && (m.role || "outer") === role && m.geometry).map((m) => m.geometry.map((p) => [p.lon, p.lat]));
  const rings = [];
  while (segs.length) {
    let ring = segs.shift();
    let guard = 0;
    while (guard++ < 10000) {
      const a = ring[0], b = ring[ring.length - 1];
      if (a[0] === b[0] && a[1] === b[1]) break;
      const k = segs.findIndex((s) => (s[0][0] === b[0] && s[0][1] === b[1]) || (s[s.length - 1][0] === b[0] && s[s.length - 1][1] === b[1]));
      if (k < 0) break;
      let s = segs.splice(k, 1)[0];
      if (!(s[0][0] === b[0] && s[0][1] === b[1])) s = s.slice().reverse();
      ring = ring.concat(s.slice(1));
    }
    if (ring.length >= 4) rings.push(ring);
  }
  return rings;
}

// ---------- landcover classes ----------
// 0 grass, 1 field-soil, 2 forest, 3 stubble/dry grass, 4 water, 5 urban(lawn+soil), 6 scrub, 7 wetland
function classify(t, id) {
  if (t.natural === "water" || t.water || t.waterway === "riverbank" || ["reservoir", "basin"].includes(t.landuse)) return { cls: 4, prio: 9 };
  if (t.landuse === "forest" || t.natural === "wood") return { cls: 2, prio: 6, leaf: t.leaf_type };
  if (t.natural === "scrub" || t.natural === "heath") return { cls: 6, prio: 5 };
  if (t.natural === "wetland") return { cls: 7, prio: 5 };
  if (t.landuse === "farmland") { const v = hash01(id); return { cls: v < 0.5 ? 1 : v < 0.75 ? 0 : 3, prio: 3 }; }
  if (["meadow", "grass", "village_green", "recreation_ground", "orchard", "allotments", "cemetery"].includes(t.landuse) || ["grassland"].includes(t.natural) || ["park", "garden", "pitch", "golf_course"].includes(t.leisure)) return { cls: 0, prio: 4, orchard: t.landuse === "orchard" };
  if (["residential", "farmyard", "industrial", "commercial", "retail", "construction"].includes(t.landuse)) return { cls: 5, prio: 2, urban: true };
  return null;
}

// scanline polygon fill (even-odd, multiple rings) on a raster with cell size s and origin (x0,z0)
function fillRings(ringsLocal, nx, nz, x0, z0, s, cb) {
  let zmin = Infinity, zmax = -Infinity;
  for (const r of ringsLocal) for (const p of r) { zmin = Math.min(zmin, p[1]); zmax = Math.max(zmax, p[1]); }
  const j0 = Math.max(0, Math.floor((zmin - z0) / s)), j1 = Math.min(nz - 1, Math.ceil((zmax - z0) / s));
  for (let j = j0; j <= j1; j++) {
    const zc = z0 + (j + 0.5) * s, xs = [];
    for (const r of ringsLocal) for (let k = 0, l = r.length - 1; k < r.length; l = k++) {
      const [ax, az] = r[k], [bx, bz] = r[l];
      if ((az > zc) !== (bz > zc)) xs.push(ax + ((zc - az) * (bx - ax)) / (bz - az));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const i0 = Math.max(0, Math.ceil((xs[k] - x0) / s - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[k + 1] - x0) / s - 0.5));
      for (let i = i0; i <= i1; i++) cb(i, j);
    }
  }
}

const pointInRings = (x, z, rings) => { let c = false; for (const r of rings) for (let k = 0, l = r.length - 1; k < r.length; l = k++) { const [ax, az] = r[k], [bx, bz] = r[l]; if ((az > z) !== (bz > z) && x < ax + ((z - az) * (bx - ax)) / (bz - az)) c = !c; } return c; };
const ringArea = (r) => { let a = 0; for (let k = 0, l = r.length - 1; k < r.length; l = k++) a += (r[l][0] - r[k][0]) * (r[l][1] + r[k][1]); return a / 2; };

// clip a ring to an axis-aligned rectangle (Sutherland–Hodgman)
function clipRing(ring, x0, z0, x1, z1) {
  const edges = [[(p) => p[0] >= x0, (a, b) => [x0, a[1] + ((x0 - a[0]) * (b[1] - a[1])) / (b[0] - a[0])]], [(p) => p[0] <= x1, (a, b) => [x1, a[1] + ((x1 - a[0]) * (b[1] - a[1])) / (b[0] - a[0])]], [(p) => p[1] >= z0, (a, b) => [a[0] + ((z0 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]), z0]], [(p) => p[1] <= z1, (a, b) => [a[0] + ((z1 - a[1]) * (b[0] - a[0])) / (b[1] - a[1]), z1]]];
  let out = ring;
  for (const [inside, cut] of edges) {
    const inp = out; out = [];
    for (let k = 0; k < inp.length; k++) { const a = inp[(k + inp.length - 1) % inp.length], b = inp[k]; if (inside(b)) { if (!inside(a)) out.push(cut(a, b)); out.push(b); } else if (inside(a)) out.push(cut(a, b)); }
    if (!out.length) break;
  }
  return out;
}

// =====================================================================
await loadDem(15, { w: toLonLat(near.x0, 0)[0], e: toLonLat(near.x0 + near.nx * NEAR_STEP, 0)[0], n: toLonLat(0, near.z0)[1], s: toLonLat(0, near.z0 + near.nz * NEAR_STEP)[1] });
await loadDem(12, farBBox);
const osm = await loadOsm();
console.log("OSM elements", osm.elements.length);

// --- features to local coordinates ---
const areas = [], buildingsRaw = [], highways = [], treeNodes = [], treeRows = [];
for (const e of osm.elements) {
  const t = e.tags ?? {};
  if (e.type === "node") { if (t.natural === "tree") treeNodes.push(toLocal(e.lon, e.lat)); continue; }
  if (e.type === "way" && e.geometry) {
    const line = e.geometry.map((p) => toLocal(p.lon, p.lat));
    const closed = e.nodes && e.nodes[0] === e.nodes[e.nodes.length - 1];
    if (t.building && closed) { buildingsRaw.push({ id: e.id, t, ring: line.slice(0, -1) }); continue; }
    if (t.highway) { highways.push({ id: e.id, t, line }); continue; }
    if (t.natural === "tree_row") { treeRows.push(line); continue; }
    const c = closed ? classify(t, e.id) : null;
    if (c) areas.push({ ...c, id: e.id, rings: [line.slice(0, -1)] });
  } else if (e.type === "relation" && e.members && t.type === "multipolygon") {
    const c = classify(t, e.id);
    if (!c) continue;
    const outer = assembleRings(e.members, "outer"), inner = assembleRings(e.members, "inner");
    if (outer.length) areas.push({ ...c, id: e.id, rings: [...outer, ...inner].map((r) => r.map((p) => toLocal(p[0], p[1])).slice(0, -1)) });
  }
}
areas.sort((a, b) => a.prio - b.prio);
console.log(`areas ${areas.length}, buildings ${buildingsRaw.length}, highways ${highways.length}, tree nodes ${treeNodes.length}, tree rows ${treeRows.length}`);

// --- landcover raster (2 m) over the near grid, and a coarse one (far grid) ---
const lc = { x0: near.x0, z0: near.z0, s: LC_STEP, nx: Math.ceil(((near.nx - 1) * NEAR_STEP) / LC_STEP), nz: Math.ceil(((near.nz - 1) * NEAR_STEP) / LC_STEP) };
const lcClass = new Uint8Array(lc.nx * lc.nz); // default 0 grass
const lcArea = new Int32Array(lc.nx * lc.nz).fill(-1);
const farClass = new Uint8Array(far.nx * far.nz), farArea = new Int32Array(far.nx * far.nz).fill(-1);
areas.forEach((a, ai) => {
  fillRings(a.rings, lc.nx, lc.nz, lc.x0, lc.z0, lc.s, (i, j) => { lcClass[j * lc.nx + i] = a.cls; lcArea[j * lc.nx + i] = ai; });
  fillRings(a.rings, far.nx, far.nz, far.x0 - FAR_STEP / 2, far.z0 - FAR_STEP / 2, FAR_STEP, (i, j) => { farClass[j * far.nx + i] = a.cls; farArea[j * far.nx + i] = ai; });
});
const lcAt = (x, z) => { const i = Math.floor((x - lc.x0) / lc.s), j = Math.floor((z - lc.z0) / lc.s); return i >= 0 && j >= 0 && i < lc.nx && j < lc.nz ? j * lc.nx + i : -1; };

// --- highways: width/surface ---
const W = { motorway: 10, trunk: 8, primary: 7, secondary: 6.5, tertiary: 6, unclassified: 5, residential: 5, living_street: 4.5, service: 3.5, track: 3, cycleway: 2.5, footway: 1.6, path: 1.4, bridleway: 2, pedestrian: 4 };
const PAVED = new Set(["asphalt", "paved", "concrete", "concrete:plates", "concrete:lanes", "chipseal"]);
const SETT = new Set(["paving_stones", "sett", "cobblestone", "unhewn_cobblestone", "bricks"]);
function roadStyle(t) {
  const w = Number.parseFloat(t.width) || W[t.highway];
  if (!w) return null;
  let surf = t.surface;
  const s = surf ? (PAVED.has(surf) ? 0 : SETT.has(surf) ? 2 : 1) : ["track", "path", "footway", "bridleway"].includes(t.highway) ? 1 : 0;
  return { w: Math.min(w, 9), s }; // s: 0 asphalt, 1 gravel/dirt, 2 sett
}
// resample polylines at 2 m
function resample(line, step = 2) {
  const out = [line[0]];
  for (let k = 1; k < line.length; k++) {
    const [ax, az] = line[k - 1], [bx, bz] = line[k], L = Math.hypot(bx - ax, bz - az), n = Math.max(1, Math.ceil(L / step));
    for (let q = 1; q <= n; q++) out.push([ax + ((bx - ax) * q) / n, az + ((bz - az) * q) / n]);
  }
  return out;
}

// track surface/width: nearest OSM highway to every track sample
const roadSamples = []; // for nearest-road queries: {x,z,w,s,dx,dz}
for (const h of highways) { const st = roadStyle(h.t); if (!st) continue; const r = resample(h.line, 3); for (let k = 0; k < r.length; k++) { const a = r[Math.max(0, k - 1)], b = r[Math.min(r.length - 1, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; roadSamples.push({ x: r[k][0], z: r[k][1], ...st, dx: (b[0] - a[0]) / L, dz: (b[1] - a[1]) / L }); } }
const rhash = new Map();
roadSamples.forEach((p, i) => { const k = `${Math.floor(p.x / HC)},${Math.floor(p.z / HC)}`; (rhash.get(k) ?? rhash.set(k, []).get(k)).push(i); });
function nearestRoad(x, z, maxR) { let best = null, bd = maxR * maxR; const cx = Math.floor(x / HC), cz = Math.floor(z / HC); for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) for (const i of rhash.get(`${cx + a},${cz + b}`) ?? []) { const p = roadSamples[i], dd = (p.x - x) ** 2 + (p.z - z) ** 2; if (dd < bd) { bd = dd; best = p; } } return best; }
for (const p of track) { const r = nearestRoad(p.x, p.z, 12); p.w = r ? Math.max(3, r.w) : 4; p.s = r ? r.s : 0; }
// smooth width; majority filter on surface (window 40 m)
for (let pass = 0; pass < 3; pass++) for (let i = 1; i < track.length - 1; i++) track[i].w = (track[i - 1].w + 2 * track[i].w + track[i + 1].w) / 4;
const surf0 = track.map((p) => p.s);
for (let i = 0; i < track.length; i++) { const c = [0, 0, 0]; for (let k = Math.max(0, i - 10); k <= Math.min(track.length - 1, i + 10); k++) c[surf0[k]]++; track[i].s = c.indexOf(Math.max(...c)); }

// --- near heightfield (Mapterhorn z15, ~1.4 m/px) ---
const nearH = new Float32Array(near.nx * near.nz), nearEdge = new Uint8Array(near.nx * near.nz), nearDist = new Float32Array(near.nx * near.nz);
for (let j = 0; j < near.nz; j++) for (let i = 0; i < near.nx; i++) {
  const x = near.x0 + i * NEAR_STEP, z = near.z0 + j * NEAR_STEP, [lo, la] = toLonLat(x, z);
  let h = demAt(lo, la, 15); if (!Number.isFinite(h)) h = demAt(lo, la, 12);
  nearH[j * near.nx + i] = h;
  nearDist[j * near.nx + i] = trackDist(x, z);
}
// track elevation: DEM along the track, smoothed over ~30 m so the road has no lidar bumps
for (const p of track) { const [lo, la] = toLonLat(p.x, p.z); p.h0 = demAt(lo, la, 15); }
for (let i = 0; i < track.length; i++) { let s = 0, n = 0; for (let k = Math.max(0, i - 8); k <= Math.min(track.length - 1, i + 8); k++) if (Number.isFinite(track[k].h0)) { s += track[k].h0; n++; } track[i].h = n ? s / n : 0; }
// flatten / blend a road bed along the track
const smooth = (t) => t * t * (3 - 2 * t);
for (let j = 0; j < near.nz; j++) for (let i = 0; i < near.nx; i++) {
  const k = j * near.nx + i, x = near.x0 + i * NEAR_STEP, z = near.z0 + j * NEAR_STEP;
  const n = nearestTrack(x, z, 25); if (n.i < 0) continue;
  const tp = track[n.i], inner = tp.w / 2 + 1.5, outer = inner + 9;
  if (n.d < outer) { const t = n.d <= inner ? 0 : smooth((n.d - inner) / (outer - inner)); nearH[k] = tp.h * (1 - t) + nearH[k] * t - (n.d <= inner ? 0.05 : 0); }
}
// water: water polygons for the meshes, terrain below them pushed down
const waters = [];
for (const a of areas) if (a.cls === 4) {
  const rings = a.rings.map((r) => clipRing(r, far.x0, far.z0, far.x0 + (far.nx - 1) * FAR_STEP, far.z0 + (far.nz - 1) * FAR_STEP)).filter((r) => r.length >= 3);
  if (!rings.length || Math.abs(ringArea(rings[0])) < 50) continue;
  const hs = [];
  for (const r of rings) for (const p of resample(r.concat([r[0]]), 20)) { const [lo, la] = toLonLat(p[0], p[1]); const h = demAt(lo, la, 15); hs.push(Number.isFinite(h) ? h : demAt(lo, la, 12)); }
  const v = hs.filter(Number.isFinite).sort((p, q) => p - q);
  const level = v.length ? v[Math.floor(v.length * 0.1)] - 0.3 : 0;
  waters.push({ level, rings: rings.map((r) => r.map((p) => [Math.round(p[0] * 10) / 10, Math.round(p[1] * 10) / 10])) });
}
for (const w of waters) {
  fillRings(w.rings, near.nx, near.nz, near.x0 - NEAR_STEP / 2, near.z0 - NEAR_STEP / 2, NEAR_STEP, (i, j) => { const k = j * near.nx + i; nearH[k] = Math.min(nearH[k], w.level - 1.2); });
}
// corridor edge: dip the near mesh below the far mesh so the seam is hidden
for (let k = 0; k < nearH.length; k++) { const d = nearDist[k]; if (d > CORRIDOR - 30) nearH[k] -= Math.min(1, (d - (CORRIDOR - 30)) / 30) * 2.5; nearEdge[k] = Math.max(0, Math.min(255, Math.round(((d - (CORRIDOR - 150)) / 150) * 255))); }

// --- far heightfield (z12, ~19 m/px) ---
const farH = new Float32Array(far.nx * far.nz);
for (let j = 0; j < far.nz; j++) for (let i = 0; i < far.nx; i++) {
  const x = far.x0 + i * FAR_STEP, z = far.z0 + j * FAR_STEP, [lo, la] = toLonLat(x, z);
  let h = demAt(lo, la, 12);
  if (farClass[j * far.nx + i] === 4) { const w = waters.find((q) => pointInRings(x, z, q.rings)); if (w) h = Math.min(h, w.level - 2); }
  const inNear = x > near.x0 && x < near.x0 + (near.nx - 1) * NEAR_STEP && z > near.z0 && z < near.z0 + (near.nz - 1) * NEAR_STEP;
  if (inNear && trackDist(x, z) < CORRIDOR - 40) h -= 4; // hidden under the detailed mesh
  farH[j * far.nx + i] = h;
}

// --- landcover splat texture: RGB = grass, soil, forest-floor weights (stubble = 1 - sum) ---
const wts = new Float32Array(lc.nx * lc.nz * 3);
const CW = { 0: [1, 0, 0], 1: [0, 1, 0], 2: [0, 0, 1], 3: [0, 0.15, 0], 4: [0, 0.8, 0], 5: [0.65, 0.3, 0], 6: [0.55, 0.1, 0.35], 7: [0.6, 0.2, 0] };
for (let k = 0; k < lcClass.length; k++) wts.set(CW[lcClass[k]], k * 3);
// lane of worn grass/soil along every road edge
for (let k = 0; k < lcClass.length; k++) { /* kept simple */ }
function boxBlur(a, nx, nz, ch, r) {
  const tmp = new Float32Array(a.length);
  for (let pass = 0; pass < 2; pass++) {
    for (let j = 0; j < nz; j++) for (let c = 0; c < ch; c++) { let s = 0; for (let i = -r; i <= r; i++) s += a[(j * nx + Math.min(nx - 1, Math.max(0, i))) * ch + c]; for (let i = 0; i < nx; i++) { tmp[(j * nx + i) * ch + c] = s / (2 * r + 1); s += a[(j * nx + Math.min(nx - 1, i + r + 1)) * ch + c] - a[(j * nx + Math.max(0, i - r)) * ch + c]; } }
    for (let i = 0; i < nx; i++) for (let c = 0; c < ch; c++) { let s = 0; for (let j = -r; j <= r; j++) s += tmp[(Math.min(nz - 1, Math.max(0, j)) * nx + i) * ch + c]; for (let j = 0; j < nz; j++) { a[(j * nx + i) * ch + c] = s / (2 * r + 1); s += tmp[(Math.min(nz - 1, j + r + 1) * nx + i) * ch + c] - tmp[(Math.max(0, j - r) * nx + i) * ch + c]; } }
  }
}
boxBlur(wts, lc.nx, lc.nz, 3, 1);
const px = Buffer.alloc(lc.nx * lc.nz * 3);
for (let k = 0; k < wts.length; k++) px[k] = Math.round(Math.min(1, wts[k]) * 255);
await sharp(px, { raw: { width: lc.nx, height: lc.nz, channels: 3 } }).png({ compressionLevel: 9 }).toFile(path.join(OUT, "landcover.png"));

// --- roads (OSM highways), excluding the parts that duplicate the ridden track ---
const roads = [];
for (const h of highways) {
  const st = roadStyle(h.t); if (!st) continue;
  const r = resample(h.line, 2);
  let cur = [];
  const flush = () => { if (cur.length >= 2) roads.push({ w: st.w, s: st.s, p: cur }); cur = []; };
  for (let k = 0; k < r.length; k++) {
    const [x, z] = r[k];
    const inNear = x > near.x0 + 4 && x < near.x0 + (near.nx - 2) * NEAR_STEP && z > near.z0 + 4 && z < near.z0 + (near.nz - 2) * NEAR_STEP;
    const n = nearestTrack(x, z, 10);
    let dup = false;
    if (n.i >= 0) {
      const tp = track[n.i], tq = track[Math.min(track.length - 1, n.i + 1)], tl = Math.hypot(tq.x - tp.x, tq.z - tp.z) || 1;
      const a = r[Math.max(0, k - 1)], b = r[Math.min(r.length - 1, k + 1)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const par = Math.abs(((b[0] - a[0]) * (tq.x - tp.x) + (b[1] - a[1]) * (tq.z - tp.z)) / (L * tl));
      dup = n.d < tp.w / 2 || (n.d < 8 && par > 0.8);
    }
    if (!inNear || dup || trackDist(x, z) > CORRIDOR - 10) flush(); else cur.push([Math.round(x * 100) / 100, Math.round(z * 100) / 100]);
  }
  flush();
}
// no-tree mask from roads + track (2 m raster)
const noTree = new Uint8Array(lc.nx * lc.nz);
const stamp = (x, z, r) => { const ri = Math.ceil(r / lc.s), ci = Math.floor((x - lc.x0) / lc.s), cj = Math.floor((z - lc.z0) / lc.s); for (let a = -ri; a <= ri; a++) for (let b = -ri; b <= ri; b++) { const i = ci + a, j = cj + b; if (i >= 0 && j >= 0 && i < lc.nx && j < lc.nz && (a * a + b * b) * lc.s * lc.s <= r * r) noTree[j * lc.nx + i] = 1; } };
for (const rd of roads) for (const p of rd.p) stamp(p[0], p[1], rd.w / 2 + 2);
for (const p of track) stamp(p.x, p.z, p.w / 2 + 3);

// --- buildings ---
function convexHull(P) { const p = P.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); const lo = [], up = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); } for (const q of p.reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); } return lo.slice(0, -1).concat(up.slice(0, -1)); }
function obb(ring) {
  const h = convexHull(ring); let best = null;
  for (let k = 0; k < h.length; k++) {
    const a = h[k], b = h[(k + 1) % h.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
    const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
    let mnu = Infinity, mxu = -Infinity, mnv = Infinity, mxv = -Infinity;
    for (const p of h) { const u = p[0] * ux + p[1] * uz, v = -p[0] * uz + p[1] * ux; mnu = Math.min(mnu, u); mxu = Math.max(mxu, u); mnv = Math.min(mnv, v); mxv = Math.max(mxv, v); }
    const area = (mxu - mnu) * (mxv - mnv);
    if (!best || area < best.area) best = { area, ux, uz, mnu, mxu, mnv, mxv };
  }
  let { ux, uz, mnu, mxu, mnv, mxv } = best;
  if (mxv - mnv > mxu - mnu) { [ux, uz] = [-uz, ux]; [mnu, mxu, mnv, mxv] = [mnv, mxv, -mxu, -mnu]; } // u = long axis
  const P = (u, v) => [u * ux - v * uz, u * uz + v * ux];
  return { area: best.area, len: mxu - mnu, wid: mxv - mnv, c: [P(mnu, mnv), P(mxu, mnv), P(mxu, mxv), P(mnu, mxv)] };
}
const nearHAt = (x, z) => { const fi = (x - near.x0) / NEAR_STEP, fj = (z - near.z0) / NEAR_STEP, i = Math.max(0, Math.min(near.nx - 2, Math.floor(fi))), j = Math.max(0, Math.min(near.nz - 2, Math.floor(fj))), u = fi - i, v = fj - j, H = (a, b) => nearH[b * near.nx + a]; return (H(i, j) * (1 - u) + H(i + 1, j) * u) * (1 - v) + (H(i, j + 1) * (1 - u) + H(i + 1, j + 1) * u) * v; };
const buildings = [];
const SMALL = new Set(["garage", "garages", "shed", "carport", "hut", "kiosk", "roof", "greenhouse"]);
const BARN = new Set(["barn", "farm_auxiliary", "agricultural", "stable", "cowshed", "warehouse", "industrial"]);
const FLAT = new Set(["apartments", "commercial", "retail", "industrial", "warehouse", "school", "supermarket", "office"]);
for (const b of buildingsRaw) {
  let ring = b.ring;
  if (ring.length < 3) continue;
  const cx = ring.reduce((s, p) => s + p[0], 0) / ring.length, cz = ring.reduce((s, p) => s + p[1], 0) / ring.length;
  if (trackDist(cx, cz) > CORRIDOR - 20) continue;
  if (ringArea(ring) < 0) ring = ring.slice().reverse(); // consistent winding
  const area = Math.abs(ringArea(ring)); if (area < 6) continue;
  const t = b.t, kind = t.building;
  const levels = Number.parseFloat(t["building:levels"]) || (SMALL.has(kind) ? 1 : BARN.has(kind) ? 1 : 2);
  const o = obb(ring);
  let roofShape = t["roof:shape"] ?? (FLAT.has(kind) || area > 700 || o.wid > 22 ? "flat" : area / o.area > 0.8 && !SMALL.has(kind) ? "gabled" : SMALL.has(kind) ? "flat" : "hipped_flat");
  if (!["flat", "gabled"].includes(roofShape)) roofShape = area / o.area > 0.75 && o.wid < 22 ? "gabled" : "flat";
  const storey = BARN.has(kind) ? 4.5 : SMALL.has(kind) ? 2.6 : 2.9;
  let wallH = Number.parseFloat(t.height) ? Number.parseFloat(t.height) : levels * storey + 0.4;
  const pitch = (o.wid > 13 ? 28 : 42) * rad;
  let ridge = roofShape === "gabled" ? Math.min(9, (o.wid / 2) * Math.tan(pitch)) : 0;
  if (Number.parseFloat(t.height) && roofShape === "gabled") { wallH = Math.max(2.5, wallH - ridge); }
  let base = Infinity; for (const p of ring) base = Math.min(base, nearHAt(p[0], p[1]));
  const mat = t["building:material"] === "brick" ? 0 : t["building:material"] === "plaster" ? 1 : BARN.has(kind) ? 0 : hash01(b.id) < 0.55 ? 0 : 1;
  buildings.push({ r: ring.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]), b: Math.round(base * 100) / 100, h: Math.round(wallH * 100) / 100, roof: roofShape === "gabled" ? { t: "gable", ridge: Math.round(ridge * 100) / 100, obb: o.c.map((p) => [Math.round(p[0] * 100) / 100, Math.round(p[1] * 100) / 100]) } : { t: "flat" }, m: mat, win: !SMALL.has(kind) && !BARN.has(kind), rt: Math.floor(hash01(b.id + 7) * 3) });
  for (const p of resample(ring.concat([ring[0]]), 1.5)) stamp(p[0], p[1], 2.5);
  fillRings([ring], lc.nx, lc.nz, lc.x0, lc.z0, lc.s, (i, j) => (noTree[j * lc.nx + i] = 1));
}

// --- trees: [x, y, z, height, rotation, type] type 0 broadleaf, 1 pine, 2 spruce, 3 bush ---
const trees = [];
const groundAt = (x, z) => { const k = lcAt(x, z); if (k >= 0) return nearHAt(x, z); const [lo, la] = toLonLat(x, z); return demAt(lo, la, 12); };
function speciesFor(area, u) { const lt = area?.leaf; if (lt === "needleleaved") return u < 0.85 ? 1 : 2; if (lt === "broadleaved") return u < 0.9 ? 0 : 1; return u < 0.45 ? 0 : u < 0.9 ? 1 : 2; }
function addTree(x, z, type, hmin, hmax) {
  const k = lcAt(x, z); if (k >= 0 && noTree[k]) return;
  const y = groundAt(x, z); if (!Number.isFinite(y)) return;
  trees.push([x, y, z, hmin + rnd() * (hmax - hmin), rnd() * Math.PI * 2, type]);
}
const HMAX = Number(args.treeRange ?? 1500);
// forests: jittered grid, denser close to the track
for (let z = far.z0; z < far.z0 + far.nz * FAR_STEP; z += 4) for (let x = far.x0; x < far.x0 + far.nx * FAR_STEP; x += 4) {
  const fi = Math.round((x - far.x0) / FAR_STEP), fj = Math.round((z - far.z0) / FAR_STEP);
  if (fi < 0 || fj < 0 || fi >= far.nx || fj >= far.nz || farClass[fj * far.nx + fi] !== 2) continue;
  const td = trackDist(x, z);
  if (td > HMAX) continue;
  const spacing = td < 150 ? 5 : td < CORRIDOR ? 6.5 : 9;
  if (rnd() > (4 * 4) / (spacing * spacing)) continue;
  const jx = x + (rnd() - 0.5) * 4, jz = z + (rnd() - 0.5) * 4;
  const k = lcAt(jx, jz); let ai;
  if (k >= 0) { if (lcClass[k] !== 2) continue; ai = lcArea[k]; } else ai = farArea[fj * far.nx + fi];
  const type = speciesFor(areas[ai], rnd());
  addTree(jx, jz, type, type === 0 ? 17 : 19, type === 0 ? 26 : 28);
  // understory / young trees near the road
  if (td < 120 && rnd() < 0.25) addTree(jx + (rnd() - 0.5) * 3, jz + (rnd() - 0.5) * 3, rnd() < 0.6 ? 3 : 0, 2, rnd() < 0.6 ? 4 : 9);
}
// meadows, gardens, scrub, orchards inside the corridor
for (let z = lc.z0; z < lc.z0 + lc.nz * lc.s; z += 6) for (let x = lc.x0; x < lc.x0 + lc.nx * lc.s; x += 6) {
  const k = lcAt(x, z); if (k < 0) continue;
  const c = lcClass[k], a = areas[lcArea[k]], u = rnd();
  if (trackDist(x, z) > CORRIDOR - 10) continue;
  const jx = x + (rnd() - 0.5) * 6, jz = z + (rnd() - 0.5) * 6;
  if (c === 5 && u < 0.09) addTree(jx, jz, rnd() < 0.75 ? 0 : 2, 6, 16);
  else if (c === 5 && u < 0.16) addTree(jx, jz, 3, 1.2, 2.5);
  else if (c === 6 && u < 0.45) addTree(jx, jz, rnd() < 0.8 ? 3 : 0, 1.5, 6);
  else if (c === 0 && a?.orchard && u < 0.5) addTree(jx, jz, 0, 4, 7);
  else if ((c === 0 || c === 7) && u < 0.006) addTree(jx, jz, 0, 10, 22);
}
for (const [x, z] of treeNodes) if (trackDist(x, z) < HMAX) addTree(x, z, 0, 12, 22);
for (const row of treeRows) for (const p of resample(row, 9)) if (trackDist(p[0], p[1]) < HMAX) addTree(p[0], p[1], 0, 12, 22);
console.log(`buildings ${buildings.length}, roads ${roads.length}, waters ${waters.length}, trees ${trees.length}`);

// --- EOX Sentinel-2 cloudless texture for the far terrain ---
{
  const z = 14, x0 = Math.floor(lon2x(farBBox.w, z)), x1 = Math.floor(lon2x(farBBox.e, z)), y0 = Math.floor(lat2y(farBBox.n, z)), y1 = Math.floor(lat2y(farBBox.s, z));
  const comps = [];
  for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
    const b = await fetchCached(`https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/${z}/${y}/${x}.jpg`, `eox-${z}-${x}-${y}.jpg`);
    if (b) comps.push({ input: b, left: (x - x0) * 256, top: (y - y0) * 256 });
  }
  const W2 = (x1 - x0 + 1) * 256, H2 = (y1 - y0 + 1) * 256;
  const big = await sharp({ create: { width: W2, height: H2, channels: 3, background: "#4a5a3a" } }).composite(comps).png().toBuffer();
  const L = Math.round((lon2x(farBBox.w, z) - x0) * 256), T = Math.round((lat2y(farBBox.n, z) - y0) * 256), Rr = Math.round((lon2x(farBBox.e, z) - x0) * 256), B = Math.round((lat2y(farBBox.s, z) - y0) * 256);
  await sharp(big).extract({ left: L, top: T, width: Rr - L, height: B - T }).resize(2048, 2048, { fit: "fill" }).modulate({ saturation: 1.1 }).jpeg({ quality: 82 }).toFile(path.join(OUT, "far.jpg"));
  console.log(`EOX: ${comps.length} tiles`);
}

// --- write binary + json ---
const treeArr = new Float32Array(trees.length * 6); trees.forEach((t, i) => treeArr.set(t, i * 6));
const trackArr = new Float32Array(track.length * 6); track.forEach((p, i) => trackArr.set([p.x, p.h, p.z, p.d, p.w, p.s], i * 6));
const chunks = [["nearH", nearH], ["nearEdge", nearEdge], ["farH", farH], ["trees", treeArr], ["track", trackArr]];
const layout = {}; let off = 0; const bufs = [];
for (const [k, a] of chunks) { const pad = (4 - (off % 4)) % 4; if (pad) { bufs.push(Buffer.alloc(pad)); off += pad; } layout[k] = { offset: off, length: a.length, type: a.constructor.name }; const b = Buffer.from(a.buffer, a.byteOffset, a.byteLength); bufs.push(b); off += b.length; }
fs.writeFileSync(path.join(OUT, "scene.bin"), Buffer.concat(bufs));
const scene = {
  version: 1, name: NAME, route: ROUTE, from: D0, to: D1, routeLengthM: routeLen,
  origin: { lon: lon0, lat: lat0, kx: KX, ky: KY },
  near: { ...near, edgeFadeM: 150, corridor: CORRIDOR }, far: { ...far }, landcover: { x0: lc.x0, z0: lc.z0, s: lc.s, nx: lc.nx, nz: lc.nz },
  layout, buildings, roads, waters,
  attribution: ["Terrain © Mapterhorn (Copernicus DEM / GeoBasis-DE)", "Map data © OpenStreetMap contributors (ODbL)", "EOxCloudless https://cloudless.eox.at by EOX IT Services GmbH (Contains modified Copernicus Sentinel data 2024)", "Textures: ambientCG (CC0), TextureCan (CC0), Poly Haven (CC0)"],
  stats: { trees: trees.length, buildings: buildings.length, roads: roads.length, waters: waters.length },
};
fs.writeFileSync(path.join(OUT, "scene.json"), JSON.stringify(scene));
console.log("wrote", OUT, (fs.statSync(path.join(OUT, "scene.bin")).size / 1e6).toFixed(1) + " MB bin,", (fs.statSync(path.join(OUT, "scene.json")).size / 1e6).toFixed(1) + " MB json");
