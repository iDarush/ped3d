import * as THREE from "three";

/**
 * Cheap canopy shade, baked at load time into one RG texture over the land-cover grid (2 m):
 *   R = canopy density: forest weight, shifted a few metres away from the sun (penumbra outside the forest on
 *       the shadow side) and blurred, so the forest edge is soft
 *   G = contact AO: a soft radial blob around every tree base (radius ~ crown radius), max-combined
 * Ground, road, trunks, crowns and grass sample it (vegetation per instance in the vertex shader), so this costs
 * no draw calls, no shadow casters and one texture fetch.
 */
export interface CanopyShade {
  tex: THREE.DataTexture;
  uniforms: Record<string, THREE.IUniform>;
  /** GLSL declarations for the ground shader */
  groundPars: string;
  /** GLSL block for the ground: multiplies \`col\` (albedo) given world xz \`wp\` */
  groundGlsl: string;
  /** patch a mesh material: 1 = road, 2 = trunk, 3 = crown/bush, 4 = grass */
  patch: (m: THREE.Material, mode: 1 | 2 | 3 | 4) => void;
}

export function bakeCanopyShade(opts: {
  lc: { x0: number; z0: number; s: number; nx: number; nz: number };
  px: Uint8ClampedArray; // land-cover RGBA, B = forest
  trees: Float32Array; // [x, y, z, height, rot, type] * n
  crownR: number[]; // crown radius per unit height, per type
  sunDir: THREE.Vector3; // towards the sun
}): CanopyShade {
  const { lc, px, trees } = opts;
  const W = lc.nx,
    H = lc.nz,
    n = W * H;
  const F = new Float32Array(n);
  for (let k = 0; k < n; k++) F[k] = Math.min(1, Math.max(0, (px[k * 4 + 2] / 255 - 0.2) / 0.5));
  // shadow side: the canopy throws shade away from the sun; take forest from up to ~6 m sun-wards
  const sx = opts.sunDir.x,
    sz = opts.sunDir.z,
    sl = Math.hypot(sx, sz) || 1;
  const C = new Float32Array(n);
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      let v = F[j * W + i];
      for (const m of [1.5, 3]) {
        const ii = Math.round(i + (sx / sl) * m),
          jj = Math.round(j + (sz / sl) * m);
        if (ii >= 0 && jj >= 0 && ii < W && jj < H) v = Math.max(v, F[jj * W + ii] * (1 - m / 6));
      }
      C[j * W + i] = v;
    }
  // separable box blur, radius 3 px (6 m), twice ≈ soft penumbra
  const tmp = new Float32Array(n);
  const blur = (a: Float32Array, r: number) => {
    for (let j = 0; j < H; j++) {
      let acc = 0;
      for (let i = -r; i <= r; i++) acc += a[j * W + Math.min(W - 1, Math.max(0, i))];
      for (let i = 0; i < W; i++) {
        tmp[j * W + i] = acc / (2 * r + 1);
        acc += a[j * W + Math.min(W - 1, i + r + 1)] - a[j * W + Math.max(0, i - r)];
      }
    }
    for (let i = 0; i < W; i++) {
      let acc = 0;
      for (let j = -r; j <= r; j++) acc += tmp[Math.min(H - 1, Math.max(0, j)) * W + i];
      for (let j = 0; j < H; j++) {
        a[j * W + i] = acc / (2 * r + 1);
        acc += tmp[Math.min(H - 1, j + r + 1) * W + i] - tmp[Math.max(0, j - r) * W + i];
      }
    }
  };
  blur(C, 3);
  blur(C, 3);
  // contact AO blobs at tree bases
  const A = new Float32Array(n);
  for (let t = 0; t < trees.length / 6; t++) {
    const x = trees[t * 6],
      z = trees[t * 6 + 2],
      h = trees[t * 6 + 3],
      type = trees[t * 6 + 5];
    const rad = Math.max(1.5, Math.min(7, opts.crownR[type] * h * 0.75));
    const peak = type === 3 ? 0.5 : 0.75;
    const ci = (x - lc.x0) / lc.s - 0.5,
      cj = (z - lc.z0) / lc.s - 0.5,
      rp = rad / lc.s;
    for (let j = Math.max(0, Math.floor(cj - rp)); j <= Math.min(H - 1, Math.ceil(cj + rp)); j++)
      for (let i = Math.max(0, Math.floor(ci - rp)); i <= Math.min(W - 1, Math.ceil(ci + rp)); i++) {
        const d = Math.hypot(i - ci, j - cj) / rp;
        if (d >= 1) continue;
        const v = peak * (1 - d) * (1 - d);
        const k = j * W + i;
        // soft-max so overlapping blobs deepen a little but never saturate
        A[k] = A[k] + v - A[k] * v;
      }
  }
  const bytes = new Uint8Array(n * 2);
  for (let k = 0; k < n; k++) {
    bytes[k * 2] = Math.round(Math.min(1, C[k]) * 255);
    bytes[k * 2 + 1] = Math.round(Math.min(1, A[k]) * 255);
  }
  const tex = new THREE.DataTexture(bytes, W, H, THREE.RGFormat, THREE.UnsignedByteType);
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.unpackAlignment = 2;
  tex.needsUpdate = true;

  const uniforms: Record<string, THREE.IUniform> = {
    uShade: { value: tex },
    uShadeO: { value: new THREE.Vector2(lc.x0, lc.z0) },
    uShadeS: { value: new THREE.Vector2(lc.nx * lc.s, lc.nz * lc.s) },
  };
  const NOISE = `
float shHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float shNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(shHash(i), shHash(i + vec2(1, 0)), f.x), mix(shHash(i + vec2(0, 1)), shHash(i + vec2(1, 1)), f.x), f.y);
}
// sun flecks: low-frequency light patches on the forest floor (static)
float shFleck(vec2 w) {
  float n = shNoise(w / 7.0) * 0.6 + shNoise(w / 2.3 + 17.0) * 0.4;
  return smoothstep(0.5, 0.66, n);
}
uniform sampler2D uShade; uniform vec2 uShadeO, uShadeS;
`;
  // dense forest: ~0.42 x open-field albedo, flecks back to ~0.8, contact AO down to ~0.5, cooler and less saturated
  const groundGlsl = `{
  vec2 shv = texture2D(uShade, (wp - uShadeO) / uShadeS).rg;
  float cC = shv.r, cA = shv.g;
  float fl = shFleck(wp) * cC;
  float k = mix(1.0, 0.45, cC);
  k = mix(k, 1.25, fl * 0.85); // flecks: direct sun through canopy gaps (sun itself is dimmed in forest)
  k *= 1.0 - 0.5 * cA;
  float lum = dot(col, vec3(0.299, 0.587, 0.114));
  // shade: slightly cooler and less saturated; sun flecks: warm
  col = mix(col, vec3(lum) * vec3(1.05, 1.0, 0.86), 0.2 * cC * (1.0 - fl)); // counter the blue sky fill in shade
  col *= mix(vec3(1.0), vec3(1.08, 1.02, 0.85), fl * 0.8);
  col *= k;
}`;
  const patch = (m: THREE.Material, mode: 1 | 2 | 3 | 4) => {
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      Object.assign(sh.uniforms, uniforms);
      sh.vertexShader =
        "uniform sampler2D uShade; uniform vec2 uShadeO, uShadeS;\nvarying vec2 vShade; varying float vShadeY; varying vec2 vShadeW;\n" +
        sh.vertexShader.replace(
          "#include <begin_vertex>",
          `#include <begin_vertex>
{
#ifdef USE_INSTANCING
  vec3 shAnchor = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
  vec3 shAnchor = (modelMatrix * vec4(transformed, 1.0)).xyz;
#endif
  vShade = textureLod(uShade, (shAnchor.xz - uShadeO) / uShadeS, 0.0).rg;
  vShadeY = position.y;
  vShadeW = shAnchor.xz;
}`,
        );
      sh.fragmentShader =
        NOISE +
        "varying vec2 vShade; varying float vShadeY; varying vec2 vShadeW;\n" +
        sh.fragmentShader.replace(
          "#include <map_fragment>",
          `#include <map_fragment>
{
  float cC = vShade.r;
  float k = 1.0;
#if SHADE_MODE == 1
  vec2 shv = texture2D(uShade, (vShadeW - uShadeO) / uShadeS).rg; // road: per pixel, like the ground
  cC = shv.r;
  k = mix(1.0, 0.45, cC);
  k = mix(k, 0.85, shFleck(vShadeW) * cC * 0.75);
#elif SHADE_MODE == 2
  // trunk: canopy shade + dark base (height AO over the lowest ~3 m of a 25 m tree)
  k = mix(1.0, 0.5, cC) * mix(0.4, 1.0, smoothstep(0.0, 0.12, vShadeY));
#elif SHADE_MODE == 3
  // crowns/bushes: lower parts in the shade of the canopy, tops lit
  k = 1.0 - 0.5 * cC * (1.0 - smoothstep(0.35, 0.95, vShadeY));
#else
  // grass tufts / undergrowth
  k = mix(1.0, 0.6, cC) * (1.0 - 0.3 * vShade.g);
#endif
  diffuseColor.rgb *= k;
}`,
        );
    };
    m.defines = { ...(m.defines ?? {}), SHADE_MODE: mode };
    m.customProgramCacheKey = () => prevKey + "|shade" + mode;
    m.needsUpdate = true;
  };
  return { tex, uniforms, groundPars: NOISE, groundGlsl, patch };
}
