// Runtime half of the procedural ride scene: turns the output of tools/build-scene.mjs
// (scene.json + scene.bin + landcover.png + far.jpg) into three.js objects.
import * as THREE from "three";
import { createForestFog, type ForestFog } from "./forestFog";
import { bakeCanopyShade } from "./canopyShade";
import { createFoliage, type Foliage } from "./foliage";
import { createGrassField } from "./grassField";
import type { QualityPreset } from "./quality";

export interface SceneData {
  name: string;
  from: number;
  to: number;
  routeLengthM: number;
  origin: { lon: number; lat: number; kx: number; ky: number };
  near: { x0: number; z0: number; nx: number; nz: number; step: number; corridor: number };
  far: { x0: number; z0: number; nx: number; nz: number; step: number };
  landcover: { x0: number; z0: number; s: number; nx: number; nz: number };
  layout: Record<string, { offset: number; length: number; type: string }>;
  buildings: { r: [number, number][]; b: number; h: number; roof: { t: "gable"; ridge: number; obb: [number, number][] } | { t: "flat" }; m: number; win: boolean; rt: number }[];
  roads: { w: number; s: number; p: [number, number][] }[];
  waters: { level: number; rings: [number, number][][] }[];
  attribution: string[];
  stats: Record<string, number>;
}

export interface BuiltScene {
  data: SceneData;
  root: THREE.Group;
  heightAt: (x: number, z: number) => number;
  toLocal: (lon: number, lat: number) => [number, number];
  /** per-frame: tree LOD/culling and grass, given camera position, view direction and radii */
  update: (camPos: THREE.Vector3, fwd: THREE.Vector3, lod: { detailR: number; cardR: number; grassR: number; fogFar: number }) => void;
  /** 0 = open terrain, 1 = inside forest (from the land-cover map, averaged over ~35 m); used for canopy shade */
  forestFactor: (x: number, z: number) => number;
  /** direction-aware forest fog (all scene materials are patched to use it) */
  forestFog: ForestFog;
  /** foliage shader uniforms: uTime (s), uWind (0/1), uGlow (back-light strength) */
  foliage: Foliage;
  stats: { triangles: number; treeInstances: number };
  /** blades currently in the grass field */
  grassStats: () => { blades: number; triangles: number };
  dispose: () => void;
}

const ASSETS = "scene-assets/";
/** direction towards the sun (afternoon, south-west); RideScene3D uses the same */
export const SUN_DIR = new THREE.Vector3(-0.55, 0.62, 0.56).normalize();
export const FOREST_FOG_COLOR = 0x4b5845;

function typed(buf: ArrayBuffer, l: { offset: number; length: number; type: string }) {
  const C = l.type === "Uint8Array" ? Uint8Array : Float32Array;
  return new C(buf, l.offset, l.length);
}

/** Double-sided foliage: keep the authored normals on back faces (three flips them, which turns half of every card black). */
function noBackfaceFlip<M extends THREE.Material>(m: M): M {
  m.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      "#include <normal_fragment_begin>",
      THREE.ShaderChunk.normal_fragment_begin.replace("float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;", "float faceDirection = 1.0;"),
    );
  };
  return m;
}

// seeded rng for geometry generation (stable between reloads)
function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

export async function loadProcScene(base: string, renderer: THREE.WebGLRenderer, opts: { quality: QualityPreset }): Promise<BuiltScene> {
  const [data, bin] = await Promise.all([
    fetch(base + "scene.json").then((r) => r.json() as Promise<SceneData>),
    fetch(base + "scene.bin").then((r) => r.arrayBuffer()),
  ]);
  const tl = new THREE.TextureLoader();
  const maxAniso = renderer.capabilities.getMaxAnisotropy();
  const tex = (url: string, srgb = true, repeat = true) =>
    tl.loadAsync(url).then((t) => {
      t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
      if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = Math.min(8, maxAniso);
      return t;
    });
  const T = Object.fromEntries(
    await Promise.all(
      ["grass", "soil", "forestfloor", "moss", "asphalt", "gravel", "bark", "roof", "facade_brick", "facade_plaster", "wall_brick", "wall_plaster"].map(async (n) => [n, await tex(ASSETS + n + ".jpg")] as const),
    ),
  ) as Record<string, THREE.Texture>;
  // PBR companions (TextureCan / ambientCG): normal maps and packed AO (R) + roughness (G)
  const N = Object.fromEntries(
    await Promise.all(
      ["grass_n", "soil_n", "forestfloor_n", "asphalt_n", "asphalt_orm", "gravel_n", "gravel_orm", "bark_n", "bark_orm", "roof_n", "roof_orm", "facade_brick_n", "facade_brick_orm", "facade_plaster_n", "facade_plaster_orm", "wall_brick_n", "wall_brick_orm", "wall_plaster_n", "wall_plaster_orm"].map(async (n) => [n, await tex(ASSETS + n + ".jpg", false)] as const),
    ),
  ) as Record<string, THREE.Texture>;
  const pbr = (role: string, normalScale = 1) => ({ normalMap: N[role + "_n"], normalScale: new THREE.Vector2(normalScale, normalScale), aoMap: N[role + "_orm"], roughnessMap: N[role + "_orm"], roughness: 1 });
  const leaves = await tex(ASSETS + "leaves_broad.png", true, false);
  const needles = await tex(ASSETS + "needles.png", true, false);
  const needleClump = await tex(ASSETS + "needles_clump.png", true, false);
  const grassBlades = await tex(ASSETS + "grass_blades.png", true, false);
  const splat = await tex(base + "landcover.png", false, false);
  splat.flipY = false;
  splat.anisotropy = 1;
  const farTex = await tex(base + "far.jpg", true, false);
  farTex.flipY = false;

  const nearH = typed(bin, data.layout.nearH) as Float32Array;
  const nearEdge = typed(bin, data.layout.nearEdge) as Uint8Array;
  const farH = typed(bin, data.layout.farH) as Float32Array;
  const treesArr = typed(bin, data.layout.trees) as Float32Array;

  const { near, far, landcover: lc, origin } = data;
  // land-cover pixels (R grass, G soil/field, B forest) for CPU-side use: grass placement, forest fog, canopy shade
  const lcPx = (() => {
    const img = splat.image as HTMLImageElement;
    const cv = document.createElement("canvas");
    cv.width = img.width;
    cv.height = img.height;
    const c2 = cv.getContext("2d", { willReadFrequently: true })!;
    c2.drawImage(img, 0, 0);
    return c2.getImageData(0, 0, img.width, img.height).data;
  })();
  const CROWN_R = [0.42, 0.29, 0.3, 0.62]; // crown radius per unit height and unit width, per tree type
  const foliage = createFoliage(SUN_DIR);
  const a2c = opts.quality.antialias; // alpha-to-coverage needs MSAA; plain alpha test on "low"
  const shade = bakeCanopyShade({ lc, px: lcPx, trees: treesArr, crownR: CROWN_R, sunDir: SUN_DIR });
  const root = new THREE.Group();
  let triangles = 0;
  const disposables: { dispose(): void }[] = [];
  const track = <T extends { dispose(): void }>(o: T) => (disposables.push(o), o);

  const gridH = (g: SceneData["far"], H: Float32Array, x: number, z: number) => {
    const fi = (x - g.x0) / g.step,
      fj = (z - g.z0) / g.step;
    const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fi))),
      j = Math.max(0, Math.min(g.nz - 2, Math.floor(fj)));
    const u = Math.min(1, Math.max(0, fi - i)),
      v = Math.min(1, Math.max(0, fj - j));
    const a = H[j * g.nx + i],
      b = H[j * g.nx + i + 1],
      c = H[(j + 1) * g.nx + i],
      d = H[(j + 1) * g.nx + i + 1];
    return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
  };
  const inNear = (x: number, z: number) => x >= near.x0 && z >= near.z0 && x <= near.x0 + (near.nx - 1) * near.step && z <= near.z0 + (near.nz - 1) * near.step;
  const heightAt = (x: number, z: number) => (inNear(x, z) ? gridH(near, nearH, x, z) : gridH(far, farH, x, z));
  const toLocal = (lon: number, lat: number): [number, number] => [(lon - origin.lon) * origin.kx, -(lat - origin.lat) * origin.ky];

  // Terrain is split into square tiles (shared vertex buffers, one index range each) so that three's frustum
  // culling and our fog-distance culling can drop most of it, e.g. inside a forest with 140 m visibility.
  const terrainTiles: { mesh: THREE.Mesh; box: THREE.Box3 }[] = [];
  const addTiled = (g: THREE.BufferGeometry, m: THREE.Material, size: number, name: string, receiveShadow: boolean) => {
    const pos = g.attributes.position as THREE.BufferAttribute,
      idx = g.index!.array;
    const buckets = new Map<string, number[]>();
    for (let t = 0; t < idx.length; t += 3) {
      const a = idx[t],
        cx = (pos.getX(a) + pos.getX(idx[t + 1]) + pos.getX(idx[t + 2])) / 3,
        cz = (pos.getZ(a) + pos.getZ(idx[t + 1]) + pos.getZ(idx[t + 2])) / 3;
      const k = `${Math.floor(cx / size)},${Math.floor(cz / size)}`;
      let b = buckets.get(k);
      if (!b) buckets.set(k, (b = []));
      b.push(a, idx[t + 1], idx[t + 2]);
    }
    for (const [k, list] of buckets) {
      const tg = track(new THREE.BufferGeometry());
      for (const [n, attr] of Object.entries(g.attributes)) tg.setAttribute(n, attr);
      tg.setIndex(list);
      const box = new THREE.Box3();
      const v = new THREE.Vector3();
      for (const i of list) box.expandByPoint(v.fromBufferAttribute(pos, i));
      tg.boundingBox = box.clone();
      tg.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
      const mesh = new THREE.Mesh(tg, m);
      mesh.receiveShadow = receiveShadow;
      mesh.name = `${name}-${k}`;
      root.add(mesh);
      terrainTiles.push({ mesh, box });
    }
  };

  // ---------------- terrain: detailed corridor ----------------
  {
    const n = near.nx * near.nz;
    const pos = new Float32Array(n * 3),
      uv = new Float32Array(n * 2),
      edge = new Float32Array(n);
    const lcW = lc.nx * lc.s,
      lcH = lc.nz * lc.s,
      fW = (far.nx - 1) * far.step,
      fH = (far.nz - 1) * far.step;
    const farUv = new Float32Array(n * 2);
    for (let j = 0; j < near.nz; j++)
      for (let i = 0; i < near.nx; i++) {
        const k = j * near.nx + i,
          x = near.x0 + i * near.step,
          z = near.z0 + j * near.step;
        pos.set([x, nearH[k], z], k * 3);
        uv.set([(x - lc.x0) / lcW, (z - lc.z0) / lcH], k * 2);
        farUv.set([(x - far.x0) / fW, (z - far.z0) / fH], k * 2);
        edge[k] = nearEdge[k] / 255;
      }
    const idx: number[] = [];
    for (let j = 0; j < near.nz - 1; j++)
      for (let i = 0; i < near.nx - 1; i++) {
        const a = j * near.nx + i,
          b = a + 1,
          c = a + near.nx,
          d = c + 1;
        if (nearEdge[a] === 255 && nearEdge[b] === 255 && nearEdge[c] === 255 && nearEdge[d] === 255) continue;
        idx.push(a, c, b, b, c, d);
      }
    const g = track(new THREE.BufferGeometry());
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
    g.setAttribute("uv1", new THREE.BufferAttribute(farUv, 2));
    g.setAttribute("aEdge", new THREE.BufferAttribute(edge, 1));
    g.setIndex(idx);
    g.computeVertexNormals();
    triangles += idx.length / 3;
    const m = track(new THREE.MeshStandardMaterial({ roughness: 0.95, metalness: 0 }));
    if (opts.quality.groundNormals) m.defines = { GROUND_NORMALS: "" };
    m.onBeforeCompile = (sh) => {
      Object.assign(sh.uniforms, {
        uSplat: { value: splat },
        uGrass: { value: T.grass },
        uSoil: { value: T.soil },
        uForest: { value: T.forestfloor },
        uMoss: { value: T.moss },
        uFar: { value: farTex },
        uGrassN: { value: N.grass_n },
        uSoilN: { value: N.soil_n },
        uForestN: { value: N.forestfloor_n },
        ...shade.uniforms,
      });
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nattribute float aEdge;\nattribute vec2 uv1;\nvarying float vEdge;\nvarying vec2 vSplatUv;\nvarying vec2 vFarUv;\nvarying vec3 vWPos;\nvarying vec3 vWN;")
        .replace("#include <begin_vertex>", "#include <begin_vertex>\nvEdge = aEdge; vSplatUv = uv; vFarUv = uv1; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWN = normalize(mat3(modelMatrix) * objectNormal);");
      sh.fragmentShader = sh.fragmentShader
        .replace(
          "#include <common>",
          `#include <common>
uniform sampler2D uSplat, uGrass, uSoil, uForest, uMoss, uFar, uGrassN, uSoilN, uForestN;
varying float vEdge; varying vec2 vSplatUv; varying vec2 vFarUv; varying vec3 vWPos; varying vec3 vWN;
${shade.groundPars}
vec3 tileTex(sampler2D t, vec2 p) {
  // two scales + rotation to hide tiling
  vec3 a = texture2D(t, p / 2.2).rgb;
  vec2 q = mat2(0.8, -0.6, 0.6, 0.8) * p / 29.0;
  vec3 b = texture2D(t, q).rgb;
  float lb = dot(b, vec3(0.33));
  return a * (0.65 + 0.9 * lb / max(0.05, dot(a, vec3(0.33)) * 0.5 + 0.5 * lb));
}`,
        )
        .replace(
          "#include <map_fragment>",
          `vec3 sp = texture2D(uSplat, vSplatUv).rgb;
float wStub = max(0.0, 1.0 - sp.r - sp.g - sp.b);
vec3 grass = tileTex(uGrass, vWPos.xz);
vec3 col = grass * sp.r
  + tileTex(uSoil, vWPos.xz) * sp.g
  + mix(tileTex(uForest, vWPos.xz), tileTex(uMoss, vWPos.xz * 0.7), 0.6) * 0.55 * sp.b
  + grass * vec3(1.35, 1.15, 0.55) * wStub;
col /= max(0.001, sp.r + sp.g + sp.b + wStub);
vec3 farc = texture2D(uFar, vFarUv).rgb * 1.6;
// macro variation: tint the tiled textures with the real (10 m) Sentinel-2 colour
float lc = max(0.04, dot(col, vec3(0.333)));
col = mix(col, col * clamp(farc / max(0.04, dot(farc, vec3(0.333))), 0.75, 1.3) * clamp(dot(farc, vec3(0.333)) / lc, 0.7, 1.4), 0.35);
// canopy shade, sun flecks and contact AO under trees (canopyShade.ts)
{ vec2 wp = vWPos.xz;
${shade.groundGlsl} }
// pull the tiled textures towards the real satellite colour in the distance and at the corridor edge
float dist = length(vWPos - cameraPosition);
float blendFar = clamp(max(vEdge, (dist - 250.0) / 600.0), 0.0, 1.0);
col = mix(col, farc, blendFar * 0.85);
diffuseColor.rgb *= col;`,
        )
        .replace(
          "#include <aomap_fragment>",
          // meadow: little sheen. The grazing-angle env reflection made grass land look pale grey-blue, which
          // neither real meadows (you see blade sides) nor the grass blade field near the camera do.
          `reflectedLight.indirectSpecular *= mix(1.0, 0.3, clamp(sp.r + wStub, 0.0, 1.0));
reflectedLight.directSpecular *= mix(1.0, 0.5, clamp(sp.r + wStub, 0.0, 1.0));
#include <aomap_fragment>`,
        )
        .replace(
          "#include <normal_fragment_maps>",
          `#include <normal_fragment_maps>
#ifdef GROUND_NORMALS
{
  // splat-blended tangent-space normals; tangent frame from world axes (terrain is near-horizontal)
  vec2 nuv = vWPos.xz / 2.2;
  vec3 nG = texture2D(uGrassN, nuv).xyz * 2.0 - 1.0;
  vec3 nS = texture2D(uSoilN, nuv).xyz * 2.0 - 1.0;
  vec3 nF = texture2D(uForestN, nuv).xyz * 2.0 - 1.0;
  vec3 nt = nG * (sp.r + wStub) + nS * sp.g + nF * sp.b;
  nt.xy *= 0.9 * (1.0 - blendFar);
  nt = normalize(nt);
  vec3 Nw = normalize(vWN);
  vec3 Tw = normalize(cross(Nw, vec3(0.0, 0.0, 1.0)));
  vec3 Bw = cross(Tw, Nw);
  normal = normalize((viewMatrix * vec4(normalize(Tw * nt.x + Bw * nt.y + Nw * nt.z), 0.0)).xyz);
}
#endif`,
        );
    };
    addTiled(g, m, 200, "terrain-near", true);
  }

  // ---------------- terrain: far ring, satellite textured ----------------
  {
    const g = track(new THREE.PlaneGeometry((far.nx - 1) * far.step, (far.nz - 1) * far.step, far.nx - 1, far.nz - 1));
    g.rotateX(-Math.PI / 2); // plane now in XZ, row 0 at z = -H/2 (north)
    g.translate(far.x0 + ((far.nx - 1) * far.step) / 2, 0, far.z0 + ((far.nz - 1) * far.step) / 2);
    const p = g.attributes.position as THREE.BufferAttribute;
    const uvA = g.attributes.uv as THREE.BufferAttribute;
    for (let k = 0; k < p.count; k++) {
      const i = k % far.nx,
        j = Math.floor(k / far.nx);
      p.setY(k, farH[j * far.nx + i] - 0.3);
      uvA.setXY(k, i / (far.nx - 1), j / (far.nz - 1));
    }
    g.computeVertexNormals();
    triangles += (far.nx - 1) * (far.nz - 1) * 2;
    const m = track(new THREE.MeshStandardMaterial({ map: farTex, roughness: 1, color: new THREE.Color(1.5, 1.5, 1.5) }));
    addTiled(g, m, 800, "terrain-far", false);
  }

  // ---------------- roads ----------------
  const trackArr = typed(bin, data.layout.track) as Float32Array;
  {
    const groups: Record<number, { pos: number[]; uv: number[] }> = {};
    const shoulder = { pos: [] as number[], uv: [] as number[] };
    const ribbon = (pts: { x: number; z: number; w: number; y?: number }[], out: { pos: number[]; uv: number[] }, lift: number, extra = 0) => {
      let s = 0;
      for (let k = 0; k < pts.length - 1; k++) {
        const quad: number[][] = [];
        for (const kk of [k, k + 1]) {
          const a = pts[Math.max(0, kk - 1)],
            b = pts[Math.min(pts.length - 1, kk + 1)];
          let tx = b.x - a.x,
            tz = b.z - a.z;
          const L = Math.hypot(tx, tz) || 1;
          tx /= L;
          tz /= L;
          const hw = pts[kk].w / 2 + extra,
            p = pts[kk];
          for (const side of [-1, 1]) {
            const x = p.x - tz * hw * side,
              z = p.z + tx * hw * side;
            const y = (p.y ?? heightAt(x, z)) + lift;
            quad.push([x, y, z, side * hw]);
          }
        }
        const seg = Math.hypot(pts[k + 1].x - pts[k].x, pts[k + 1].z - pts[k].z);
        const v0 = s / 4,
          v1 = (s + seg) / 4;
        s += seg;
        const [l0, r0, l1, r1] = quad;
        for (const [q, v] of [
          [l0, v0],
          [r0, v0],
          [l1, v1],
          [r0, v0],
          [r1, v1],
          [l1, v1],
        ] as [number[], number][]) {
          out.pos.push(q[0], q[1], q[2]);
          out.uv.push(q[3] / 4, v);
        }
      }
    };
    for (const r of data.roads) {
      const pts = r.p.map(([x, z]) => ({ x, z, w: r.w }));
      ribbon(pts, (groups[r.s] ??= { pos: [], uv: [] }), 0.08);
      ribbon(pts, shoulder, 0.05, 0.35);
    }
    // the ridden road: from the track samples, flat across, split where the surface changes
    let run: { x: number; z: number; w: number; y: number }[] = [];
    let runS = -1;
    const flush = () => {
      if (run.length > 1) {
        ribbon(run, (groups[runS] ??= { pos: [], uv: [] }), 0.1);
        ribbon(run, shoulder, 0.06, 0.4);
      }
    };
    for (let i = 0; i < trackArr.length / 6; i++) {
      const [x, y, z, , w, s] = trackArr.subarray(i * 6, i * 6 + 6);
      if (s !== runS) {
        const last = run[run.length - 1];
        flush();
        run = last ? [last] : [];
        runS = s;
      }
      run.push({ x, z, w, y });
    }
    flush();
    const mats: Record<number, THREE.Material> = {
      0: new THREE.MeshStandardMaterial({ map: T.asphalt, ...pbr("asphalt", 0.7), color: 0xd0d0d0, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      1: new THREE.MeshStandardMaterial({ map: T.gravel, ...pbr("gravel"), color: 0xd8c8a8, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
      2: new THREE.MeshStandardMaterial({ map: T.gravel, ...pbr("gravel"), color: 0xa8a29a, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 }),
    };
    const add = (g: { pos: number[]; uv: number[] }, m: THREE.Material, name: string) => {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
      geo.computeVertexNormals();
      triangles += g.pos.length / 9;
      shade.patch(m, 1); // canopy shade on roads through the forest
      const mesh = new THREE.Mesh(geo, track(m));
      mesh.receiveShadow = true;
      mesh.name = name;
      root.add(mesh);
    };
    for (const [s, g] of Object.entries(groups)) add(g, mats[Number(s)], "road-" + s);
    add(shoulder, new THREE.MeshStandardMaterial({ map: T.gravel, ...pbr("gravel"), color: 0x8a877c, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }), "road-shoulder");
  }

  // ---------------- buildings ----------------
  {
    type Acc = { pos: number[]; uv: number[]; col: number[] };
    const acc = (): Acc => ({ pos: [], uv: [], col: [] });
    const facade = [acc(), acc()],
      plain = [acc(), acc()],
      roofs = acc(),
      flats = acc();
    const R = rng(99);
    const roofCols = [new THREE.Color(0xffffff), new THREE.Color(0xb08070), new THREE.Color(0x6a6a70)]; // multiply the clay-tile texture
    const tri = (a: Acc, p: number[][], uv: number[][], c: THREE.Color) => {
      for (let k = 0; k < 3; k++) {
        a.pos.push(...p[k]);
        a.uv.push(...uv[k]);
        a.col.push(c.r, c.g, c.b);
      }
    };
    const quad = (a: Acc, p: number[][], uv: number[][], c: THREE.Color) => {
      tri(a, [p[0], p[1], p[2]], [uv[0], uv[1], uv[2]], c);
      tri(a, [p[0], p[2], p[3]], [uv[0], uv[2], uv[3]], c);
    };
    for (const b of data.buildings) {
      const top = b.b + b.h,
        bot = b.b - 1.5;
      const tint = new THREE.Color().setHSL(0, 0, 0.85 + R() * 0.2);
      const target = b.win && b.h > 2.5 ? facade[b.m] : plain[b.m];
      const ring = b.r;
      for (let k = 0; k < ring.length; k++) {
        const [x0, z0] = ring[k],
          [x1, z1] = ring[(k + 1) % ring.length];
        const L = Math.hypot(x1 - x0, z1 - z0);
        if (L < 0.05) continue;
        const bays = Math.max(1, Math.round(L / 3));
        const bayW = L < 2 ? 0.3 : bays; // very short walls: no window
        const v0 = (bot - b.b) / 3,
          v1 = b.h / 3;
        quad(
          L < 2 ? plain[b.m] : target,
          [
            [x0, bot, z0],
            [x1, bot, z1],
            [x1, top, z1],
            [x0, top, z0],
          ],
          [
            [0, v0],
            [bayW, v0],
            [bayW, v1],
            [0, v1],
          ],
          tint,
        );
      }
      const rc = roofCols[b.rt % roofCols.length];
      if (b.roof.t === "gable") {
        const o = b.roof.obb.map(([x, z]) => new THREE.Vector2(x, z));
        const ctr = o.reduce((s, p) => s.add(p), new THREE.Vector2()).multiplyScalar(0.25);
        const ov = o.map((p) => p.clone().sub(ctr).multiplyScalar(1).add(p.clone().sub(ctr).normalize().multiplyScalar(0.5)).add(ctr));
        const r0 = ov[0].clone().add(ov[3]).multiplyScalar(0.5),
          r1 = ov[1].clone().add(ov[2]).multiplyScalar(0.5);
        const ry = top + b.roof.ridge,
          ey = top - 0.15;
        const wid = ov[0].distanceTo(ov[3]),
          len = ov[0].distanceTo(ov[1]);
        const slope = Math.hypot(wid / 2, b.roof.ridge);
        const P = (v: THREE.Vector2, y: number) => [v.x, y, v.y];
        quad(roofs, [P(ov[0], ey), P(ov[1], ey), P(r1, ry), P(r0, ry)], [[0, 0], [len / 2.5, 0], [len / 2.5, slope / 2.5], [0, slope / 2.5]], rc);
        quad(roofs, [P(ov[2], ey), P(ov[3], ey), P(r0, ry), P(r1, ry)], [[0, 0], [len / 2.5, 0], [len / 2.5, slope / 2.5], [0, slope / 2.5]], rc);
        // gable triangles on the real (non-overhang) rectangle
        const g0 = o[0].clone().add(o[3]).multiplyScalar(0.5),
          g1 = o[1].clone().add(o[2]).multiplyScalar(0.5);
        const w2 = o[0].distanceTo(o[3]) / 3;
        tri(plain[b.m], [P(o[0], top), P(o[3], top), P(g0, ry)], [[0, b.h / 3], [w2, b.h / 3], [w2 / 2, (b.h + b.roof.ridge) / 3]], tint);
        tri(plain[b.m], [P(o[1], top), P(o[2], top), P(g1, ry)], [[0, b.h / 3], [w2, b.h / 3], [w2 / 2, (b.h + b.roof.ridge) / 3]], tint);
      } else {
        const contour = ring.map(([x, z]) => new THREE.Vector2(x, z));
        const faces = THREE.ShapeUtils.triangulateShape(contour, []);
        for (const f of faces) tri(flats, f.map((i) => [ring[i][0], top, ring[i][1]]), f.map((i) => [ring[i][0] / 4, ring[i][1] / 4]), new THREE.Color(0x8c8c8c));
      }
    }
    const mk = (a: Acc, map: THREE.Texture, name: string, extra: Partial<THREE.MeshStandardMaterialParameters> = {}) => {
      if (!a.pos.length) return;
      const g = track(new THREE.BufferGeometry());
      g.setAttribute("position", new THREE.Float32BufferAttribute(a.pos, 3));
      g.setAttribute("uv", new THREE.Float32BufferAttribute(a.uv, 2));
      g.setAttribute("color", new THREE.Float32BufferAttribute(a.col, 3));
      g.computeVertexNormals();
      triangles += a.pos.length / 9;
      const m = track(new THREE.MeshStandardMaterial({ map, vertexColors: true, roughness: 0.9, side: THREE.DoubleSide, ...extra }));
      const mesh = new THREE.Mesh(g, m);
      mesh.castShadow = mesh.receiveShadow = true;
      mesh.name = name;
      root.add(mesh);
    };
    mk(facade[0], T.facade_brick, "walls-brick-windows", pbr("facade_brick"));
    mk(facade[1], T.facade_plaster, "walls-plaster-windows", pbr("facade_plaster"));
    mk(plain[0], T.wall_brick, "walls-brick", pbr("wall_brick"));
    mk(plain[1], T.wall_plaster, "walls-plaster", pbr("wall_plaster"));
    mk(roofs, T.roof, "roofs", pbr("roof"));
    mk(flats, T.asphalt, "roofs-flat");
  }

  // ---------------- water ----------------
  {
    // procedural ripple normal map
    const N = 128,
      d = new Uint8Array(N * N * 4);
    const hgt = (x: number, y: number) =>
      Math.sin((x / N) * Math.PI * 2 * 3 + Math.sin((y / N) * Math.PI * 2 * 2) * 1.5) * 0.5 + Math.sin((y / N) * Math.PI * 2 * 5 + (x / N) * Math.PI * 2 * 2) * 0.35 + Math.sin(((x + y) / N) * Math.PI * 2 * 7) * 0.15;
    for (let y = 0; y < N; y++)
      for (let x = 0; x < N; x++) {
        const dx = hgt(x + 1, y) - hgt(x - 1, y),
          dy = hgt(x, y + 1) - hgt(x, y - 1);
        const v = new THREE.Vector3(-dx * 2, -dy * 2, 1).normalize();
        d.set([(v.x * 0.5 + 0.5) * 255, (v.y * 0.5 + 0.5) * 255, (v.z * 0.5 + 0.5) * 255, 255], (y * N + x) * 4);
      }
    const nrm = track(new THREE.DataTexture(d, N, N));
    nrm.wrapS = nrm.wrapT = THREE.RepeatWrapping;
    nrm.needsUpdate = true;
    const m = track(new THREE.MeshStandardMaterial({ color: 0x1d3a48, roughness: 0.06, metalness: 0.15, normalMap: nrm, normalScale: new THREE.Vector2(0.25, 0.25), envMapIntensity: 1.1, side: THREE.DoubleSide }));
    for (const w of data.waters) {
      const rings = w.rings.map((r) => r.map(([x, z]) => new THREE.Vector2(x, z)));
      const isInside = (p: THREE.Vector2, r: THREE.Vector2[]) => {
        let c = false;
        for (let a = 0, b = r.length - 1; a < r.length; b = a++) if (r[a].y > p.y !== r[b].y > p.y && p.x < r[a].x + ((p.y - r[a].y) * (r[b].x - r[a].x)) / (r[b].y - r[a].y)) c = !c;
        return c;
      };
      const outers = rings.filter((r, i) => !rings.some((o, j) => j !== i && isInside(r[0], o)));
      for (const o of outers) {
        const shape = new THREE.Shape(o);
        for (const h of rings) if (h !== o && isInside(h[0], o)) shape.holes.push(new THREE.Path(h));
        const g = track(new THREE.ShapeGeometry(shape));
        g.rotateX(Math.PI / 2);
        g.translate(0, w.level, 0);
        const uvA = g.attributes.uv as THREE.BufferAttribute,
          pA = g.attributes.position as THREE.BufferAttribute;
        for (let k = 0; k < uvA.count; k++) uvA.setXY(k, pA.getX(k) / 12, pA.getZ(k) / 12);
        triangles += (g.index?.count ?? 0) / 3;
        const mesh = new THREE.Mesh(g, m);
        mesh.receiveShadow = true;
        mesh.name = "water";
        root.add(mesh);
      }
    }
  }

  // distance [m] from the ridden road's edge, via a 16 m hash of the track samples
  const roadFree = (() => {
    const TH = 16,
      key = (i: number, j: number) => (i + 4096) * 8192 + (j + 4096),
      tHash = new Map<number, number[]>();
    for (let k = 0; k < trackArr.length / 6; k++) {
      const hk = key(Math.floor(trackArr[k * 6] / TH), Math.floor(trackArr[k * 6 + 2] / TH));
      (tHash.get(hk) ?? tHash.set(hk, []).get(hk)!).push(k);
    }
    return (x: number, z: number) => {
      let best = Infinity;
      const ci = Math.floor(x / TH),
        cj = Math.floor(z / TH);
      for (let a = -1; a <= 1; a++)
        for (let b = -1; b <= 1; b++)
          for (const k of tHash.get(key(ci + a, cj + b)) ?? []) {
            const f = Math.hypot(trackArr[k * 6] - x, trackArr[k * 6 + 2] - z) - trackArr[k * 6 + 4] / 2;
            if (f < best) best = f;
          }
      return best;
    };
  })();

  // ---------------- trees ----------------
  let refillTrees: (cam: THREE.Vector3, fwd: THREE.Vector3, detailR: number, cardR: number, force?: boolean) => void = () => {};
  let splatWeights: (x: number, z: number) => number[] = () => [1, 0, 0, 0];
  let forestW: (x: number, z: number) => number = () => 0;
  // forest-fog culling hook (set once the fog exists): true if an object of radius r at camera offset (dx, dz) is fully fogged
  let fogged: (dx: number, dz: number, r: number) => boolean = () => false;
  {
    const R = rng(4242);
    type Geo = { pos: number[]; nrm: number[]; uv: number[] };
    const G = (): Geo => ({ pos: [], nrm: [], uv: [] });
    const toGeom = (g: Geo) => {
      const geo = track(new THREE.BufferGeometry());
      geo.setAttribute("position", new THREE.Float32BufferAttribute(g.pos, 3));
      geo.setAttribute("normal", new THREE.Float32BufferAttribute(g.nrm, 3));
      geo.setAttribute("uv", new THREE.Float32BufferAttribute(g.uv, 2));
      return geo;
    };
    // a card: centre c, axes u (width) and v (height), normals bent outwards from crown centre cc
    const card = (g: Geo, c: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3, cc: THREE.Vector3 | null, uvRect = [0, 0, 1, 1]) => {
      const P = [c.clone().sub(u).sub(v), c.clone().add(u).sub(v), c.clone().add(u).add(v), c.clone().sub(u).add(v)];
      const UV = [
        [uvRect[0], uvRect[1]],
        [uvRect[2], uvRect[1]],
        [uvRect[2], uvRect[3]],
        [uvRect[0], uvRect[3]],
      ];
      const fn = new THREE.Vector3().crossVectors(u, v).normalize();
      for (const k of [0, 1, 2, 0, 2, 3]) {
        g.pos.push(P[k].x, P[k].y, P[k].z);
        const n = cc ? P[k].clone().sub(cc).normalize().add(new THREE.Vector3(0, 0.35, 0)).normalize() : fn;
        g.nrm.push(n.x, n.y, n.z);
        g.uv.push(UV[k][0], UV[k][1]);
      }
    };
    const trunk = (g: Geo, h0: number, h1: number, r0: number, r1: number, seg = 6) => {
      for (let s = 0; s < seg; s++) {
        const a0 = (s / seg) * Math.PI * 2,
          a1 = ((s + 1) / seg) * Math.PI * 2;
        const p = (a: number, h: number, r: number) => [Math.cos(a) * r, h, Math.sin(a) * r];
        const q = [p(a0, h0, r0), p(a1, h0, r0), p(a1, h1, r1), p(a0, h1, r1)];
        const uvs = [
          [s / seg, 0],
          [(s + 1) / seg, 0],
          [(s + 1) / seg, (h1 - h0) * 8],
          [s / seg, (h1 - h0) * 8],
        ];
        for (const k of [0, 2, 1, 0, 3, 2]) {
          g.pos.push(...q[k]);
          const a = k === 0 || k === 3 ? a0 : a1;
          g.nrm.push(Math.cos(a), 0, Math.sin(a));
          g.uv.push(...uvs[k]);
        }
      }
    };
    const randDir = () => new THREE.Vector3(R() - 0.5, R() - 0.5, R() - 0.5).normalize();
    const crownCards = (g: Geo, cc: THREE.Vector3, rx: number, ry: number, n: number, size: number) => {
      for (let k = 0; k < n; k++) {
        const d = randDir();
        const c = new THREE.Vector3(d.x * rx * 0.55, d.y * ry * 0.55, d.z * rx * 0.55).add(cc);
        const nrm = randDir();
        const u = new THREE.Vector3().crossVectors(nrm, new THREE.Vector3(0, 1, 0)).normalize().multiplyScalar(size);
        const v = new THREE.Vector3().crossVectors(u, nrm).normalize().multiplyScalar(size);
        card(g, c, u, v, cc);
      }
    };
    const crossCards = (g: Geo, cc: THREE.Vector3, w: number, h: number, n = 3, cen: THREE.Vector3 | null = cc) => {
      for (let k = 0; k < n; k++) {
        const a = (k / n) * Math.PI;
        card(g, cc, new THREE.Vector3(Math.cos(a) * w, 0, Math.sin(a) * w), new THREE.Vector3(0, h, 0), cen);
      }
    };
    // type 0 broadleaf, 1 Scots pine, 2 spruce, 3 bush. Unit height 1.
    const hiTrunk = [G(), G(), G(), null],
      hiCrown = [G(), G(), G(), G()],
      loCrown = [G(), G(), G(), G()],
      loTrunk = [G(), G(), G(), null];
    trunk(hiTrunk[0]!, 0, 0.62, 0.016, 0.008);
    const lite = opts.quality.liteTrees;
    crownCards(hiCrown[0], new THREE.Vector3(0, 0.64, 0), 0.32, 0.36, lite ? 11 : 18, lite ? 0.24 : 0.2);
    crossCards(loCrown[0], new THREE.Vector3(0, 0.64, 0), 0.34, 0.36, 3);
    trunk(loTrunk[0]!, 0, 0.5, 0.016, 0.01, 3);
    // Scots pine: long bare trunk, flat-topped crown of branch cards
    trunk(hiTrunk[1]!, 0, 0.97, 0.011, 0.005);
    // Scots pine: a few twisted limbs and an irregular, flat-topped crown of needle clumps
    for (let k = 0; k < (lite ? 3 : 4); k++) {
      const cx = (R() - 0.5) * 0.16, cz = (R() - 0.5) * 0.16;
      crownCards(hiCrown[1], new THREE.Vector3(cx, 0.8 + R() * 0.1, cz), 0.16, 0.09, lite ? 4 : 6, lite ? 0.12 : 0.1);
    }
    trunk(loTrunk[1]!, 0, 0.9, 0.011, 0.006, 3);
    crossCards(loCrown[1], new THREE.Vector3(0, 0.84, 0), 0.2, 0.12, 3);
    card(loCrown[1], new THREE.Vector3(0, 0.86, 0), new THREE.Vector3(0.2, 0, 0), new THREE.Vector3(0, 0, 0.2), new THREE.Vector3(0, 0.8, 0));
    // spruce: whorls of drooping branch cards forming a cone
    trunk(hiTrunk[2]!, 0, 1.0, 0.012, 0.003);
    const whorls = lite ? 8 : 12;
    for (let w = 0; w < whorls; w++) {
      const y = 0.18 + (w / whorls) * 0.8,
        len = 0.2 * (1 - (y - 0.18) / 0.85) + 0.03;
      for (let k = 0; k < (lite ? 4 : 5); k++) {
        const a = (k / (lite ? 4 : 5)) * Math.PI * 2 + w * 0.7;
        const dir = new THREE.Vector3(Math.cos(a), -0.35, Math.sin(a)).normalize();
        const side = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)).multiplyScalar(len * 0.7);
        card(hiCrown[2], new THREE.Vector3(0, y, 0).add(dir.clone().multiplyScalar(len)), dir.clone().multiplyScalar(len), side, new THREE.Vector3(0, y + 0.05, 0));
      }
    }
    trunk(loTrunk[2]!, 0, 1, 0.012, 0.004, 3);
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI;
      // cone silhouette: needle card stretched vertically, rotated so the branch points up
      card(loCrown[2], new THREE.Vector3(0, 0.57, 0), new THREE.Vector3(Math.cos(a) * 0.22, 0, Math.sin(a) * 0.22), new THREE.Vector3(0, 0.42, 0), new THREE.Vector3(0, 0.5, 0), [0, 0.15, 1, 0.85]);
    }
    // bush
    crownCards(hiCrown[3], new THREE.Vector3(0, 0.5, 0), 0.5, 0.45, lite ? 6 : 9, 0.35);
    crossCards(loCrown[3], new THREE.Vector3(0, 0.5, 0), 0.5, 0.45, 2);
    // spruce lo: rotate UVs so the branch runs vertically — simpler: reuse needles texture as is

    const foliageMat = (map: THREE.Texture, alphaTest: number, roughness: number, color: number) =>
      track(noBackfaceFlip(new THREE.MeshStandardMaterial({ map, alphaTest, alphaToCoverage: a2c, side: THREE.DoubleSide, roughness, color })));
    const leafMat = foliageMat(leaves, 0.45, 0.85, 0xd8e0c8);
    const bushMat = foliageMat(leaves, 0.45, 0.85, 0xc8d4b8);
    const needleMat = foliageMat(needles, 0.4, 0.9, 0xc8d2c0);
    const clumpMat = foliageMat(needleClump, 0.4, 0.9, 0xc8d2c0);
    const barkMat = track(new THREE.MeshStandardMaterial({ map: T.bark, ...pbr("bark"), color: 0xc0b0a0 }));
    const pineBarkMat = track(new THREE.MeshStandardMaterial({ map: T.bark, ...pbr("bark"), color: 0xe0a080 }));
    const depth = (map: THREE.Texture) => track(new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map, alphaTest: 0.45 }));
    const leafDepth = depth(leaves),
      needleDepth = depth(needles),
      clumpDepth = depth(needleClump);
    for (const m of [leafMat, bushMat, needleMat, clumpMat]) shade.patch(m, 3);
    for (const m of [barkMat, pineBarkMat]) shade.patch(m, 2);
    // crown centre / radii in the unit-height tree space, per type (broadleaf, pine, spruce, bush)
    const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
    foliage.patch(leafMat, 1, { c: V(0, 0.64, 0), r: V(0.45, 0.45, 0.45) });
    foliage.patch(clumpMat, 1, { c: V(0, 0.85, 0), r: V(0.26, 0.16, 0.26) });
    foliage.patch(needleMat, 1, { c: V(0, 0.55, 0), r: V(0.26, 0.45, 0.26) });
    foliage.patch(bushMat, 1, { c: V(0, 0.5, 0), r: V(0.65, 0.5, 0.65) });
    for (const m of [barkMat, pineBarkMat]) foliage.patch(m, 2);
    for (const m of [leafDepth, needleDepth, clumpDepth]) foliage.patch(m, 1); // shadows sway with the crowns
    const crownMat = [leafMat, clumpMat, needleMat, bushMat],
      crownDepth = [leafDepth, clumpDepth, needleDepth, leafDepth];
    const trunkMat = [barkMat, pineBarkMat, barkMat, barkMat];
    const geos = {
      hiT: hiTrunk.map((g) => (g ? toGeom(g) : null)),
      hiC: hiCrown.map(toGeom),
      loT: loTrunk.map((g) => (g ? toGeom(g) : null)),
      loC: loCrown.map(toGeom),
    };
    const triCount = (g: THREE.BufferGeometry | null) => (g ? g.attributes.position.count / 3 : 0);

    // All trees of one type/LOD share ONE InstancedMesh (8–12 draw calls in total). Every few metres of travel
    // the visible set is rebuilt on the CPU from a 25 m grid: distance + view-cone culling, detailed vs card LOD.
    const nTrees = treesArr.length / 6;
    const tMat = new Float32Array(nTrees * 16),
      tCol = new Float32Array(nTrees * 3),
      tType = new Uint8Array(nTrees);
    const mtx = new THREE.Matrix4(),
      q = new THREE.Quaternion(),
      sc = new THREE.Vector3(),
      ps = new THREE.Vector3(),
      col = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    const CELL = 25;
    const cellKey = (ci: number, cj: number) => (ci + 4096) * 8192 + (cj + 4096);
    const cells = new Map<number, number[]>();
    const perType = [0, 0, 0, 0];
    for (let i = 0; i < nTrees; i++) {
      const type = treesArr[i * 6 + 5];
      tType[i] = type;
      perType[type]++;
      const h = treesArr[i * 6 + 3];
      let wide = type === 0 ? 0.8 + R() * 0.45 : type === 3 ? 1.2 + R() * 0.6 : 0.85 + R() * 0.3;
      ps.set(treesArr[i * 6], treesArr[i * 6 + 1] - 0.2, treesArr[i * 6 + 2]);
      const free = roadFree(ps.x, ps.z) - 0.5;
      if (CROWN_R[type] * h * wide > free) wide = Math.max(0.4, free / (CROWN_R[type] * h));
      q.setFromAxisAngle(up, treesArr[i * 6 + 4]);
      sc.set(h * wide, h, h * wide);
      mtx.compose(ps, q, sc).toArray(tMat, i * 16);
      const hueShift = type === 0 ? (R() - 0.5) * 0.06 : (R() - 0.5) * 0.03;
      col.setHSL(0, 0, 1).offsetHSL(hueShift, 0, (R() - 0.5) * 0.25).toArray(tCol, i * 3);
      const k = cellKey(Math.floor(ps.x / CELL), Math.floor(ps.z / CELL));
      let c = cells.get(k);
      if (!c) cells.set(k, (c = []));
      c.push(i);
    }
    type Slot = { mesh: THREE.InstancedMesh; n: number };
    const slots: { hiT: (Slot | null)[]; hiC: Slot[]; loT: (Slot | null)[]; loC: Slot[] } = { hiT: [], hiC: [], loT: [], loC: [] };
    const mkInst = (geo: THREE.BufferGeometry | null, mat: THREE.Material, type: number, crown: boolean, hi: boolean): Slot | null => {
      if (!geo || !perType[type]) return null;
      const im = new THREE.InstancedMesh(geo, mat, perType[type]);
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      if (crown) {
        im.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(perType[type] * 3), 3);
        im.instanceColor.setUsage(THREE.DynamicDrawUsage);
      }
      im.count = 0;
      im.frustumCulled = false; // culled per grid cell on the CPU
      im.castShadow = hi && opts.quality.shadows;
      im.receiveShadow = hi && crown && opts.quality.shadows;
      if (crown && hi) im.customDepthMaterial = crownDepth[type];
      im.name = `trees-${type}-${hi ? "hi" : "lo"}-${crown ? "crown" : "trunk"}`;
      root.add(im);
      track({ dispose: () => im.dispose() });
      return { mesh: im, n: 0 };
    };
    for (let t = 0; t < 4; t++) {
      slots.hiT.push(mkInst(geos.hiT[t], trunkMat[t], t, false, true));
      slots.hiC.push(mkInst(geos.hiC[t], crownMat[t], t, true, true)!);
      slots.loT.push(mkInst(geos.loT[t], trunkMat[t], t, false, false));
      slots.loC.push(mkInst(geos.loC[t], crownMat[t], t, true, false)!);
    }
    const put = (sl: Slot | null, i: number) => {
      if (!sl) return;
      (sl.mesh.instanceMatrix.array as Float32Array).set(tMat.subarray(i * 16, i * 16 + 16), sl.n * 16);
      if (sl.mesh.instanceColor) (sl.mesh.instanceColor.array as Float32Array).set(tCol.subarray(i * 3, i * 3 + 3), sl.n * 3);
      sl.n++;
    };
    const all = () => [...slots.hiT, ...slots.hiC, ...slots.loT, ...slots.loC].filter((x): x is Slot => !!x);
    let last = { x: NaN, z: NaN, fx: 0, fz: 0, d: 0, c: 0 };
    refillTrees = (cam, fwd, detailR, cardR, force) => {
      const moved = Math.hypot(cam.x - last.x, cam.z - last.z);
      const turned = fwd.x * last.fx + fwd.z * last.fz;
      if (!force && moved < 4 && turned > 0.985 && Math.abs(detailR - last.d) < 3 && Math.abs(cardR - last.c) < 6) return;
      last = { x: cam.x, z: cam.z, fx: fwd.x, fz: fwd.z, d: detailR, c: cardR };
      for (const sl of all()) sl.n = 0;
      const fl = Math.hypot(fwd.x, fwd.z) || 1,
        fx = fwd.x / fl,
        fz = fwd.z / fl;
      const r = Math.ceil(cardR / CELL) + 1,
        ci0 = Math.floor(cam.x / CELL),
        cj0 = Math.floor(cam.z / CELL);
      const d2hi = detailR * detailR,
        d2lo = cardR * cardR;
      for (let a = -r; a <= r; a++)
        for (let b = -r; b <= r; b++) {
          const ids = cells.get(cellKey(ci0 + a, cj0 + b));
          if (!ids) continue;
          const cx = (ci0 + a + 0.5) * CELL - cam.x,
            cz = (cj0 + b + 0.5) * CELL - cam.z,
            cd = Math.hypot(cx, cz);
          if (cd - CELL * 0.71 > cardR) continue;
          // view cone: ±75° around the heading (the horizontal FOV is ~±50°), generous so turning does not pop
          if (cd > 45 && (cx * fx + cz * fz + CELL * 0.71) / cd < 0.26) continue;
          // fully hidden by forest fog in this direction (deep inside a forest)
          if (fogged(cx, cz, CELL * 0.71)) continue;
          for (const i of ids) {
            const dx = tMat[i * 16 + 12] - cam.x,
              dz = tMat[i * 16 + 14] - cam.z,
              dd = dx * dx + dz * dz;
            if (dd > d2lo) continue;
            const t = tType[i];
            if (dd < d2hi) {
              put(slots.hiT[t], i);
              put(slots.hiC[t], i);
            } else {
              put(slots.loT[t], i);
              put(slots.loC[t], i);
            }
          }
        }
      for (const sl of all()) {
        const m = sl.mesh;
        m.count = sl.n;
        m.instanceMatrix.clearUpdateRanges();
        m.instanceMatrix.addUpdateRange(0, sl.n * 16);
        m.instanceMatrix.needsUpdate = true;
        if (m.instanceColor) {
          m.instanceColor.clearUpdateRanges();
          m.instanceColor.addUpdateRange(0, sl.n * 3);
          m.instanceColor.needsUpdate = true;
        }
        m.visible = sl.n > 0;
      }
    };
  }

  // ---------------- land-cover lookups (grass placement, forest fog) ----------------
  {
    const px = lcPx;
    const weights = (splatWeights = (x: number, z: number) => {
      const i = Math.floor((x - lc.x0) / lc.s),
        j = Math.floor((z - lc.z0) / lc.s);
      if (i < 0 || j < 0 || i >= lc.nx || j >= lc.nz) return [0, 0, 0, 0];
      const k = (j * lc.nx + i) * 4;
      const r = px[k] / 255,
        g = px[k + 1] / 255,
        b = px[k + 2] / 255;
      return [r, g, b, Math.max(0, 1 - r - g - b)];
    });
    // forest weight for the fog ray march: bilinear over the 2 m land-cover grid, soft threshold on the B channel
    const fw = new Float32Array(lc.nx * lc.nz);
    for (let k = 0; k < fw.length; k++) fw[k] = Math.min(1, Math.max(0, (px[k * 4 + 2] / 255 - 0.2) / 0.5));
    forestW = (x: number, z: number) => {
      const fi = (x - lc.x0) / lc.s - 0.5,
        fj = (z - lc.z0) / lc.s - 0.5;
      const i = Math.floor(fi),
        j = Math.floor(fj);
      if (i < 0 || j < 0 || i >= lc.nx - 1 || j >= lc.nz - 1) return 0;
      const u = fi - i,
        v = fj - j,
        k = j * lc.nx + i;
      return (fw[k] * (1 - u) + fw[k + 1] * u) * (1 - v) + (fw[k + lc.nx] * (1 - u) + fw[k + lc.nx + 1] * u) * v;
    };
  }

  // ---------------- direction-aware forest fog ----------------
  const qp = opts.quality;
  const forestFog = createForestFog({ weight: forestW, color: new THREE.Color(FOREST_FOG_COLOR), near: 12, far: qp.forestFogFar, maxDist: 256 });
  disposables.push(forestFog);
  // cull only well past full opacity: the field is re-marched every 0.5 m but trees are refilled every 4 m
  fogged = (dx, dz, r) => forestFog.pathMin(dx, dz, r) > qp.forestFogFar + 10;
  root.traverse((o) => {
    const mm = (o as THREE.Mesh).material;
    if (mm) (Array.isArray(mm) ? mm : [mm]).forEach(forestFog.patch);
  });
  // ---------------- grass blade field (one draw call, camera-following) ----------------
  const grass = createGrassField({
    radius: qp.grassR,
    density: qp.grassDensity,
    heightAt,
    weights: splatWeights,
    roadFree,
    grassTex: T.grass,
    farTex,
    farRect: { x0: far.x0, z0: far.z0, w: (far.nx - 1) * far.step, h: (far.nz - 1) * far.step },
    shadeUniforms: shade.uniforms,
    windUniforms: foliage.uniforms,
    receiveShadow: qp.shadows,
  });
  disposables.push(grass);
  forestFog.patch(grass.mesh.material as THREE.Material);
  root.add(grass.mesh);
  const tileC = terrainTiles.map((t) => ({ c: t.box.getCenter(new THREE.Vector3()), r: Math.hypot(t.box.max.x - t.box.min.x, t.box.max.z - t.box.min.z) / 2 }));

  const update = (cam: THREE.Vector3, fwd: THREE.Vector3, lod: { detailR: number; cardR: number; grassR: number; fogFar: number }) => {
    forestFog.update(cam.x, cam.z);
    refillTrees(cam, fwd, lod.detailR, lod.cardR);
    terrainTiles.forEach((t, k) => {
      t.mesh.visible = t.box.distanceToPoint(cam) < lod.fogFar && !fogged(tileC[k].c.x - cam.x, tileC[k].c.z - cam.z, tileC[k].r);
    });
    grass.update(cam, fwd);
  };
  const forestFactor = (x: number, z: number) => {
    let s = 0;
    for (let k = 0; k < 9; k++) {
      const a = (k / 8) * Math.PI * 2,
        r = k === 8 ? 0 : 35;
      s += splatWeights(x + Math.cos(a) * r, z + Math.sin(a) * r)[2] * (k === 8 ? 2 : 1);
    }
    const v = s / 10;
    const t = Math.min(1, Math.max(0, (v - 0.3) / 0.45));
    return t * t * (3 - 2 * t);
  };

  return {
    data,
    root,
    heightAt,
    toLocal,
    update,
    forestFactor,
    forestFog,
    foliage,
    stats: { triangles: Math.round(triangles), treeInstances: treesArr.length / 6 },
    grassStats: () => grass.stats(),
    dispose: () => disposables.forEach((d) => d.dispose()),
  };
}
