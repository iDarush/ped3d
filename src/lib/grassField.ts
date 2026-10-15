import * as THREE from "three";

/**
 * Dense grass blade field around the camera (ideas after blade-mesh grass shaders, reimplemented):
 *  - ONE draw call: an InstancedBufferGeometry of a 5-triangle opaque blade (no alpha test, no transparency)
 *  - blades are generated once per 8 m tile (cached) from the land cover: dense on grass/meadow, a little stubble
 *    on stubble fields, sparse in forest, none on ploughed fields or the ridden road
 *  - every couple of metres the visible blades (forward-biased disc around the camera, density falling off with
 *    distance) are copied into the instance buffer; blades shrink smoothly into the ground towards the edge and
 *    by their own random rank, so neither the patch border nor the density falloff pops
 *  - colour: the ground's own grass colour (grass texture mean × the same satellite tint as the terrain shader)
 *    with a dark base → light tip gradient and canopy shade, so the field melts into the ground texture
 *  - wind: a scrolling tileable noise texture → gusts rolling across the field; bend ∝ height²; roughness
 *    drops in gusts (sheen). Shares uTime/uWind with the trees.
 */
export interface GrassField {
  mesh: THREE.Mesh;
  update: (cam: THREE.Vector3, fwd: THREE.Vector3) => void;
  stats: () => { blades: number; triangles: number };
  dispose: () => void;
}

const TILE = 8;
const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const STRIDE = 8; // x, y, z, rot | height, lean, rank, var

export function createGrassField(opts: {
  radius: number; // full patch radius (blades fade out towards it)
  density: number; // blades per m² at full density
  heightAt: (x: number, z: number) => number;
  weights: (x: number, z: number) => number[]; // land cover [grass, soil, forest, stubble]
  roadFree: (x: number, z: number) => number; // metres from the ridden road edge
  grassTex: THREE.Texture; // ground grass colour (its smallest mip = mean colour)
  farTex: THREE.Texture; // satellite colour (terrain-far UVs)
  farRect: { x0: number; z0: number; w: number; h: number };
  shadeUniforms: Record<string, THREE.IUniform>; // canopy shade (uShade, uShadeO, uShadeS)
  windUniforms: { uTime: THREE.IUniform<number>; uWind: THREE.IUniform<number> };
  receiveShadow: boolean;
}): GrassField {
  const R = opts.radius,
    R0 = R * 0.15;
  // density: full within R0, then ~ (R0/d)^1.3 (blades get wider to keep the coverage), zero at R
  const densAt = (d: number) => Math.min(1, Math.pow(R0 / Math.max(d, R0), 1.3)) * (1 - smooth(R * 0.75, R, d));
  // blade: 3 segments, tapering; 5 triangles, 7 vertices; unit height, base width 1 (scaled in the shader)
  const ys = [0, 0.45, 0.8, 1];
  const ws = [0.5, 0.42, 0.25, 0];
  const pos: number[] = [];
  for (let k = 0; k < 3; k++) pos.push(-ws[k], ys[k], 0, ws[k], ys[k], 0);
  pos.push(0, 1, 0);
  const idx = [0, 1, 2, 2, 1, 3, 2, 3, 4, 4, 3, 5, 4, 5, 6];
  const geo = new THREE.InstancedBufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute("normal", new THREE.Float32BufferAttribute(new Array(7).fill([0, 0, 1]).flat(), 3));
  geo.setIndex(idx);
  let area = 0; // expected area-equivalent of the patch (full disc, upper bound)
  for (let d = 0.25; d < R; d += 0.5) area += densAt(d) * 2 * Math.PI * d * 0.5;
  const maxBlades = Math.ceil(area * opts.density * 1.6); // + the 4 m refill margin; buffer only, not drawn
  const data = new Float32Array(maxBlades * STRIDE);
  const ib = new THREE.InstancedInterleavedBuffer(data, STRIDE);
  ib.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("aBladeA", new THREE.InterleavedBufferAttribute(ib, 4, 0));
  geo.setAttribute("aBladeB", new THREE.InterleavedBufferAttribute(ib, 4, 4));
  geo.instanceCount = 0;

  // tileable value noise for the wind gusts
  const NS = 64,
    nz = new Uint8Array(NS * NS),
    g = 8,
    lat = Array.from({ length: g * g }, () => Math.random());
  for (let j = 0; j < NS; j++)
    for (let i = 0; i < NS; i++) {
      const fx = (i / NS) * g,
        fy = (j / NS) * g,
        x0 = Math.floor(fx),
        y0 = Math.floor(fy);
      const sx = (fx - x0) ** 2 * (3 - 2 * (fx - x0)),
        sy = (fy - y0) ** 2 * (3 - 2 * (fy - y0));
      const L = (a: number, b: number) => lat[(b % g) * g + (a % g)];
      const v = (L(x0, y0) * (1 - sx) + L(x0 + 1, y0) * sx) * (1 - sy) + (L(x0, y0 + 1) * (1 - sx) + L(x0 + 1, y0 + 1) * sx) * sy;
      nz[j * NS + i] = Math.round(v * 255);
    }
  const noise = new THREE.DataTexture(nz, NS, NS, THREE.RedFormat, THREE.UnsignedByteType);
  noise.wrapS = noise.wrapT = THREE.RepeatWrapping;
  noise.magFilter = noise.minFilter = THREE.LinearFilter;
  noise.needsUpdate = true;

  const mat = new THREE.MeshStandardMaterial({ side: THREE.DoubleSide, roughness: 0.85, metalness: 0 });
  const uniforms = {
    ...opts.shadeUniforms,
    ...opts.windUniforms,
    uWindNoise: { value: noise },
    uGrassTex: { value: opts.grassTex },
    uFarTex: { value: opts.farTex },
    uFarRect: { value: new THREE.Vector4(opts.farRect.x0, opts.farRect.z0, opts.farRect.w, opts.farRect.h) },
    uCam: { value: new THREE.Vector3() },
    uR: { value: new THREE.Vector2(R0, R) },
  };
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader =
      `attribute vec4 aBladeA, aBladeB;
uniform sampler2D uWindNoise, uGrassTex, uFarTex, uShade;
uniform vec4 uFarRect; uniform vec3 uCam; uniform vec2 uR, uShadeO, uShadeS;
uniform float uTime, uWind;
varying vec3 vBladeCol; varying float vGust;
` +
      sh.vertexShader
        .replace(
          "#include <beginnormal_vertex>",
          // light the blade mostly like the ground (normal tilted up) so both faces read the same
          `float bc = cos(aBladeA.w), bs = sin(aBladeA.w);
vec3 objectNormal = normalize(vec3(bs * 0.45, 1.0, bc * 0.45));
#ifdef USE_TANGENT
vec3 objectTangent = vec3(1.0, 0.0, 0.0);
#endif`,
        )
        .replace(
          "#include <begin_vertex>",
          `vec3 root = aBladeA.xyz;
float d = length(root.xz - uCam.xz);
// density falloff by rank + shrink into the ground towards the patch edge (no visible border, no pops)
float dens = min(1.0, pow(uR.x / max(d, uR.x), 1.3)) * (1.0 - smoothstep(uR.y * 0.75, uR.y, d));
float grow = smoothstep(aBladeB.z, aBladeB.z + 0.12, dens) * (1.0 - smoothstep(uR.y * 0.8, uR.y, d));
float h = aBladeB.x * grow;
float wdt = 0.03 * (0.7 + 0.6 * aBladeB.w) * clamp(inversesqrt(max(dens, 0.05)), 1.0, 2.5); // wider where sparser
vec2 wdir = normalize(vec2(0.8, 0.6));
float gst = textureLod(uWindNoise, (root.xz - wdir * uTime * 3.0) / 34.0, 0.0).r;
vGust = gst * uWind;
float bend = (aBladeB.y + (0.15 + 0.9 * gst) * uWind + 0.08 * sin(uTime * 3.1 + root.x * 1.7 + root.z * 1.3) * uWind) * position.y * position.y;
vec3 transformed = vec3(position.x * wdt * bc, position.y * h, -position.x * wdt * bs);
transformed.xz += wdir * bend * h * 0.6;
transformed.y -= bend * bend * h * 0.25;
transformed += root;
// colour: the ground's grass colour (texture mean, satellite tint as in the terrain shader), dark base → light tip
vec3 gm = textureLod(uGrassTex, vec2(0.5), 12.0).rgb;
vec3 farc = textureLod(uFarTex, (root.xz - uFarRect.xy) / uFarRect.zw, 0.0).rgb * 1.6;
float lg = max(0.04, dot(gm, vec3(0.333))), lf = max(0.04, dot(farc, vec3(0.333)));
vec3 col = mix(gm, gm * clamp(farc / lf, 0.75, 1.3) * clamp(lf / lg, 0.7, 1.4), 0.35);
vec2 shv = textureLod(uShade, (root.xz - uShadeO) / uShadeS, 0.0).rg;
// the texture mean is greyer than the ground looks (the terrain shader adds contrast): restore saturation
col = max(vec3(0.0), mix(vec3(dot(col, vec3(0.299, 0.587, 0.114))), col, 1.6));
col *= mix(1.0, 0.5, shv.r) * (1.0 - 0.35 * shv.g);
col *= 0.85 + 0.3 * aBladeB.w;
vBladeCol = col * mix(0.45, 1.25, position.y) * mix(vec3(1.0), vec3(1.08, 1.06, 0.8), position.y * 0.5);`,
        );
    sh.fragmentShader =
      "varying vec3 vBladeCol; varying float vGust;\n" +
      sh.fragmentShader
        .replace("#include <map_fragment>", "diffuseColor.rgb = vBladeCol;")
        .replace("#include <roughnessmap_fragment>", "#include <roughnessmap_fragment>\nroughnessFactor = mix(0.9, 0.5, vGust);")
        .replace("#include <normal_fragment_begin>", THREE.ShaderChunk.normal_fragment_begin.replace("float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;", "float faceDirection = 1.0;"));
  };
  mat.customProgramCacheKey = () => "grass-blades-v1";
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.receiveShadow = opts.receiveShadow;
  mesh.name = "grass-blades";

  // ---- tiles (generated once, cached) ----
  const tiles = new Map<number, Float32Array>();
  let seed = 1;
  const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  const tileKey = (i: number, j: number) => (i + 32768) * 65536 + (j + 32768);
  const genTile = (ti: number, tj: number) => {
    seed = (ti * 73856093) ^ (tj * 19349663) ^ 0x5bd1e995;
    const n = Math.round(TILE * TILE * opts.density);
    const out: number[] = [];
    for (let k = 0; k < n; k++) {
      const x = (ti + rnd()) * TILE,
        z = (tj + rnd()) * TILE;
      const [wg, ws, wf, wd] = opts.weights(x, z);
      const free = opts.roadFree(x, z);
      // where: meadow/grass dense, stubble fields short and sparse, forest floor sparse, ploughed soil none
      let p = wg + wd * 0.35 + wf * 0.06 + ws * 0.0;
      if (free < 0.2) p = 0; // on the road
      else if (free < 1.2) p *= 0.5; // gravel shoulder
      const r1 = rnd(),
        r2 = rnd(),
        r3 = rnd(),
        r4 = rnd(),
        r5 = rnd();
      if (r1 > p) continue;
      const stub = wd > wg && wd > wf;
      const hgt = stub ? 0.12 + r2 * 0.1 : wf > 0.5 ? 0.15 + r2 * 0.2 : 0.22 + r2 * r2 * 0.4;
      out.push(x, opts.heightAt(x, z) - 0.04, z, r3 * Math.PI * 2, hgt, (r4 - 0.5) * 0.5, r5 * 0.999, rnd());
    }
    return new Float32Array(out);
  };
  const tile = (i: number, j: number) => {
    const k = tileKey(i, j);
    let t = tiles.get(k);
    if (!t) {
      t = genTile(i, j);
      tiles.set(k, t);
      if (tiles.size > 4000) tiles.delete(tiles.keys().next().value!); // bound the cache
    }
    return t;
  };

  let last = { x: NaN, z: NaN, fx: 0, fz: 0 };
  let count = 0;
  const update = (cam: THREE.Vector3, fwd: THREE.Vector3) => {
    uniforms.uCam.value.copy(cam);
    const fl = Math.hypot(fwd.x, fwd.z) || 1,
      fx = fwd.x / fl,
      fz = fwd.z / fl;
    if (Math.hypot(cam.x - last.x, cam.z - last.z) < 2 && fx * last.fx + fz * last.fz > 0.985) return;
    last = { x: cam.x, z: cam.z, fx, fz };
    count = 0;
    const r = Math.ceil(R / TILE) + 1,
      ci = Math.floor(cam.x / TILE),
      cj = Math.floor(cam.z / TILE);
    for (let a = -r; a <= r; a++)
      for (let b = -r; b <= r; b++) {
        const tx = (ci + a + 0.5) * TILE - cam.x,
          tz = (cj + b + 0.5) * TILE - cam.z,
          td = Math.hypot(tx, tz);
        if (td - TILE * 0.71 > R) continue;
        // forward-biased: behind the camera only the first ~12 m (chase camera, turning)
        if (td > 12 + TILE && (tx * fx + tz * fz) / td < -0.35) continue;
        const t = tile(ci + a, cj + b);
        for (let o = 0; o < t.length; o += STRIDE) {
          const dx = t[o] - cam.x,
            dz = t[o + 2] - cam.z,
            d = Math.hypot(dx, dz);
          if (d > R) continue;
          // keep a margin of 4 m of travel: the shader fades blades whose rank is above the local density
          if (t[o + 6] > densAt(Math.max(0, d - 4)) + 0.02) continue;
          if (count >= maxBlades) break;
          data.set(t.subarray(o, o + STRIDE), count * STRIDE);
          count++;
        }
      }
    geo.instanceCount = count;
    ib.clearUpdateRanges();
    ib.addUpdateRange(0, count * STRIDE);
    ib.needsUpdate = true;
  };
  return {
    mesh,
    update,
    stats: () => ({ blades: count, triangles: count * 5 }),
    dispose: () => {
      geo.dispose();
      mat.dispose();
      noise.dispose();
    },
  };
}
