import * as THREE from "three";

/**
 * Direction-aware forest fog.
 *
 * Instead of one global fog that switches when the camera is "in the forest", we march rays from the camera
 * over the land-cover map (SECTORS directions x BINS distance steps) and store, per direction and distance,
 * how many metres of the ray run through forest ("forest path"). Every material's fog chunk is patched to look
 * this up: forest fog opacity = smoothstep(near, far, forestPath). Then the normal open-country haze is applied
 * on top. So looking out of a forest edge into a field shows clear air, looking into the forest shows dense
 * green fog, a distant forest across a field (beyond the march range or only a thin strip) gets only aerial haze,
 * and the transition follows the camera continuously (no global switch, no pop).
 *
 * The same lookup drives the "forest wall" (an open cylinder that hides sky between distant trunks only in
 * directions where the forest is deep enough) and CPU culling of trees / terrain tiles that are fully fogged.
 */
export const SECTORS = 128;
export const BINS = 64;

export interface ForestFog {
  uniforms: Record<string, THREE.IUniform>;
  /** re-march the rays from the camera (cheap: SECTORS x BINS bilinear samples) */
  update: (camX: number, camZ: number) => void;
  /** forest path [m] from the camera to (camera + (dx, dz)); lower bound beyond the march range */
  path: (dx: number, dz: number) => number;
  /** minimum forest path over an angular window (for conservative culling of an object of radius r at distance d) */
  pathMin: (dx: number, dz: number, r: number) => number;
  /** patch a material so its fog includes the forest fog */
  patch: (m: THREE.Material) => void;
  /** material for the "forest wall" cylinder */
  wallMaterial: () => THREE.MeshBasicMaterial;
  dispose: () => void;
}

export function createForestFog(opts: { weight: (x: number, z: number) => number; color: THREE.Color; near: number; far: number; maxDist: number }): ForestFog {
  const { weight, maxDist } = opts;
  const step = maxDist / (BINS - 1);
  const P = new Float32Array(SECTORS * BINS); // metres
  const raw = new Float32Array(SECTORS * BINS);
  const local = new Float32Array(SECTORS * BINS);
  const bytes = new Uint8Array(SECTORS * BINS * 2);
  // R: integrated forest path, G: conservative local forest coverage for the wall.
  const tex = new THREE.DataTexture(bytes, BINS, SECTORS, THREE.RGFormat, THREE.UnsignedByteType);
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  const uniforms: Record<string, THREE.IUniform> = {
    uFFTex: { value: tex },
    uFFColor: { value: opts.color },
    uFFNear: { value: opts.near },
    uFFFar: { value: opts.far },
    uFFMax: { value: maxDist },
  };
  const cos = new Float32Array(SECTORS),
    sin = new Float32Array(SECTORS);
  for (let s = 0; s < SECTORS; s++) {
    cos[s] = Math.cos((s / SECTORS) * Math.PI * 2);
    sin[s] = Math.sin((s / SECTORS) * Math.PI * 2);
  }
  let lx = NaN,
    lz = NaN;
  const update = (cx: number, cz: number) => {
    if (Math.hypot(cx - lx, cz - lz) < 0.5) return;
    lx = cx;
    lz = cz;
    for (let s = 0; s < SECTORS; s++) {
      let p = 0;
      const o = s * BINS;
      raw[o] = 0;
      local[o] = weight(cx, cz);
      for (let k = 1; k < BINS; k++) {
        const r = (k - 0.5) * step;
        const w = weight(cx + cos[s] * r, cz + sin[s] * r);
        local[o + k] = w;
        p += w * step;
        raw[o + k] = p;
      }
    }
    // soften across directions ([1 4 6 4 1] over ±2 sectors ≈ ±5.6°) so a forest edge seen at a grazing angle
    // fades over a few degrees instead of drawing a hard vertical seam in the fog / forest wall
    for (let s = 0; s < SECTORS; s++)
      for (let k = 0; k < BINS; k++) {
        const at = (ds: number) => raw[(((s + ds) % SECTORS) + SECTORS) % SECTORS * BINS + k];
        const v = (at(-2) + 4 * at(-1) + 6 * at(0) + 4 * at(1) + at(2)) / 16;
        P[s * BINS + k] = v;
        bytes[(s * BINS + k) * 2] = Math.min(255, Math.round((v / maxDist) * 255));
        // Never spread the wall into an adjacent open sector. The path itself
        // stays softly filtered for materials and its existing CPU culling.
        const coverage = Math.min(local[((s + SECTORS - 1) % SECTORS) * BINS + k], local[s * BINS + k], local[((s + 1) % SECTORS) * BINS + k]);
        bytes[(s * BINS + k) * 2 + 1] = Math.round(Math.max(0, Math.min(1, coverage)) * 255);
      }
    tex.needsUpdate = true;
  };
  const lookup = (s: number, d: number) => {
    const f = Math.min(BINS - 1, Math.max(0, d / step));
    const k = Math.floor(f),
      t = f - k,
      o = (((s % SECTORS) + SECTORS) % SECTORS) * BINS;
    return k >= BINS - 1 ? P[o + BINS - 1] : P[o + k] * (1 - t) + P[o + k + 1] * t;
  };
  const sectorOf = (dx: number, dz: number) => (Math.atan2(dz, dx) / (Math.PI * 2)) * SECTORS;
  const path = (dx: number, dz: number) => {
    const sf = sectorOf(dx, dz),
      s0 = Math.floor(sf),
      t = sf - s0,
      d = Math.hypot(dx, dz);
    return lookup(s0, d) * (1 - t) + lookup(s0 + 1, d) * t;
  };
  const pathMin = (dx: number, dz: number, r: number) => {
    const d = Math.hypot(dx, dz);
    if (d <= r * 1.5) return 0;
    const sf = sectorOf(dx, dz),
      half = (Math.asin(Math.min(1, r / d)) / (Math.PI * 2)) * SECTORS;
    let m = Infinity;
    for (let s = Math.floor(sf - half); s <= Math.ceil(sf + half); s++) m = Math.min(m, lookup(s, d - r));
    return m;
  };

  const PARS_V = "varying vec3 vFFOff;\n";
  const PARS_F = `
uniform sampler2D uFFTex;
uniform vec3 uFFColor;
uniform float uFFNear, uFFFar, uFFMax;
varying vec3 vFFOff;
vec2 forestFogSample() {
  float d = length(vFFOff.xz);
  float u = (min(d, uFFMax) / uFFMax * ${(BINS - 1).toFixed(1)} + 0.5) / ${BINS.toFixed(1)};
  float v = atan(vFFOff.z, vFFOff.x) / 6.28318530718 + ${(0.5 / SECTORS).toFixed(6)};
  return texture2D(uFFTex, vec2(u, v)).rg;
}
float forestFogAmount() {
  return smoothstep(uFFNear, uFFFar, forestFogSample().r * uFFMax);
}
`;
  const VERT = "\nvFFOff = transpose(mat3(viewMatrix)) * mvPosition.xyz; // world-space offset from the camera\n";
  const inject = (sh: THREE.WebGLProgramParametersWithUniforms, wall: boolean) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = (wall ? "varying float vFFWallHeight;\n" : "") + PARS_V + sh.vertexShader.replace("#include <fog_vertex>", "#include <fog_vertex>" + VERT + (wall ? "\nvFFWallHeight = uv.y * 46.0 - 40.0;\n" : ""));
    sh.fragmentShader = (wall ? "varying float vFFWallHeight;\n" : "") + PARS_F + sh.fragmentShader.replace(
      "#include <fog_fragment>",
      wall
        ? // Terrain-relative height and an inward-only forest footprint: no sky halo.
          "vec2 ff = forestFogSample();\ngl_FragColor = vec4(uFFColor, smoothstep(uFFNear, uFFFar, ff.r * uFFMax) * smoothstep(0.5, 0.9, ff.g) * (1.0 - smoothstep(1.0, 6.0, vFFWallHeight)));"
        : "gl_FragColor.rgb = mix(gl_FragColor.rgb, uFFColor, forestFogAmount());\n#include <fog_fragment>",
    );
  };
  const patched = new WeakSet<THREE.Material>();
  const patch = (m: THREE.Material) => {
    if (patched.has(m) || !(m as THREE.Material & { fog?: boolean }).fog) return;
    patched.add(m);
    const prev = m.onBeforeCompile;
    const key = m.customProgramCacheKey();
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      inject(sh, false);
    };
    m.customProgramCacheKey = () => key + "|forestfog";
    m.needsUpdate = true;
  };
  const wallMaterial = () => {
    const m = new THREE.MeshBasicMaterial({ fog: false, transparent: true, depthWrite: false, side: THREE.BackSide });
    m.onBeforeCompile = (sh) => inject(sh, true);
    m.customProgramCacheKey = () => "forestfog-wall-terrain-mask";
    return m;
  };
  return { uniforms, update, path, pathMin, patch, wallMaterial, dispose: () => tex.dispose() };
}


const wallPositions = new WeakMap<THREE.Mesh, { x: number; z: number; radius: number }>();
/** Keep the background below the shortest 8 m crowns, including on slopes. */
export function updateForestWall(wall: THREE.Mesh, x: number, z: number, radius: number, heightAt: (x: number, z: number) => number) {
  const last = wallPositions.get(wall);
  if (last && Math.hypot(x-last.x,z-last.z)<0.5 && last.radius===radius) return;
  wallPositions.set(wall,{x,z,radius});
  wall.scale.set(radius,1,radius);
  wall.position.set(x,0,z);
  const position=wall.geometry.getAttribute("position"),uv=wall.geometry.getAttribute("uv");
  for(let i=0;i<position.count;i++) {
    const ground=heightAt(x+position.getX(i)*radius,z+position.getZ(i)*radius);
    position.setY(i,ground+uv.getY(i)*46-40);
  }
  position.needsUpdate=true;
}
