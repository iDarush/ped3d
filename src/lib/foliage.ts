import * as THREE from "three";

/**
 * Tree/grass shading tricks for card foliage (ideas after "realistic tree shader" style card foliage shaders,
 * written from scratch for three.js; applied with onBeforeCompile so instancing, shadows, our forest fog and
 * canopy shade keep working, and no draw calls are added):
 *  - volumetric crown light: per vertex, the distance from the crown centre and the side facing the sun
 *    brighten the outer/sun side, the inside and underside stay dark
 *  - translucency: looking towards the sun, leaves glow warm yellow-green, more at the crown edge, less deep
 *    in the forest (canopy shade)
 *  - wind: whole-tree sway growing with height² (sum of sines on the instance position + gusts), leaf flutter
 *    on crown vertices, slight trunk sway (same function, so crown and trunk stay attached), grass sway.
 *    Shadow-depth materials of crowns use the same sway.
 *  - per-instance tint/brightness variation from a hash of the position
 * All procedural (no texture lookups).
 */
export type FoliageMode = 1 | 2 | 3; // 1 crown, 2 trunk, 3 grass

export interface Foliage {
  uniforms: { uTime: THREE.IUniform<number>; uWind: THREE.IUniform<number>; uSunDir: THREE.IUniform<THREE.Vector3>; uGlow: THREE.IUniform<number> };
  patch: (m: THREE.Material, mode: FoliageMode, crown?: { c: THREE.Vector3; r: THREE.Vector3 }) => void;
}

const SWAY = 0.01; // local (unit-height) sway at the tree top; × tree height in metres

export function createFoliage(sunDir: THREE.Vector3): Foliage {
  const uniforms = {
    uTime: { value: 0 },
    uWind: { value: 1 },
    uSunDir: { value: sunDir.clone().normalize() },
    uGlow: { value: 1 },
  };
  const HEAD_V = `
uniform float uTime, uWind; uniform vec3 uSunDir; uniform vec3 uCrownC, uCrownR;
varying float vCrownL, vGlowW; varying vec3 vTint;
float fHash(vec2 p) { return fract(sin(dot(p, vec2(41.3, 289.1))) * 43758.5453); }
`;
  const HEAD_F = `
uniform float uGlow;
varying float vCrownL, vGlowW; varying vec3 vTint;
`;
  const body = (depth: boolean) => `
#ifdef USE_INSTANCING
{
  vec3 anc = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  mat3 Rm = mat3(normalize(instanceMatrix[0].xyz), normalize(instanceMatrix[1].xyz), normalize(instanceMatrix[2].xyz));
  vec3 wl = transpose(Rm) * vec3(0.8, 0.0, 0.6); // wind direction in the instance's local axes
  float ph = dot(anc.xz, vec2(0.031, 0.027));
  float gust = 0.55 + 0.45 * sin(uTime * 0.23 + anc.x * 0.004 + anc.z * 0.003);
  float sway = (sin(uTime * 1.1 + ph) * 0.6 + sin(uTime * 2.3 + ph * 1.7) * 0.25 + 0.45) * gust * uWind;
#if FOLIAGE_MODE == 3
  transformed.xz += wl.xz * sway * 0.2 * position.y;
#else
  transformed.xz += wl.xz * sway * ${SWAY.toFixed(4)} * position.y * position.y;
#endif
${
  depth
    ? ""
    : `
#if FOLIAGE_MODE == 1
  // leaf flutter: small fast motion along the card normal, more at the crown edge
  vec3 relC = position - uCrownC;
  float dF = clamp(length(relC / uCrownR), 0.0, 1.0);
  transformed += objectNormal * sin(uTime * 7.0 + dot(position, vec3(53.0, 31.0, 47.0)) + ph * 5.0) * 0.004 * dF * gust * uWind;
  // volumetric crown light: outer and sun-facing side bright, inside/underside dark
  vec3 dirW = normalize(Rm * relC + vec3(1e-4));
  vCrownL = clamp(0.4 + 0.55 * dF + 0.45 * dot(dirW, uSunDir) * dF + 0.15 * dirW.y, 0.3, 1.3);
  // translucency when looking towards the sun
  vec3 wpos = (modelMatrix * instanceMatrix * vec4(transformed, 1.0)).xyz;
  float back = max(0.0, dot(normalize(wpos - cameraPosition), uSunDir));
  back *= back; back *= back;
  vGlowW = back * (0.3 + 0.7 * dF);
#else
  vCrownL = 1.0;
  vGlowW = 0.0;
#endif
  float hs = fHash(anc.xz);
  vTint = mix(vec3(0.94, 1.0, 0.96), vec3(1.06, 1.02, 0.86), hs) * (0.9 + 0.2 * fHash(anc.zx + 7.0));
`
}
}
#endif`;
  const patched = new WeakSet<THREE.Material>();
  const patch = (m: THREE.Material, mode: FoliageMode, crown?: { c: THREE.Vector3; r: THREE.Vector3 }) => {
    if (patched.has(m)) return;
    patched.add(m);
    const depth = (m as THREE.MeshDepthMaterial).isMeshDepthMaterial === true;
    const prev = m.onBeforeCompile;
    const prevKey = m.customProgramCacheKey();
    const own = { uCrownC: { value: crown?.c ?? new THREE.Vector3(0, 0.6, 0) }, uCrownR: { value: crown?.r ?? new THREE.Vector3(0.4, 0.4, 0.4) } };
    m.onBeforeCompile = (sh, r) => {
      prev.call(m, sh, r);
      Object.assign(sh.uniforms, uniforms, own);
      sh.vertexShader = HEAD_V + sh.vertexShader.replace("#include <begin_vertex>", "#include <begin_vertex>\n" + body(depth));
      if (!depth) {
        sh.fragmentShader =
          HEAD_F +
          sh.fragmentShader
            .replace("#include <map_fragment>", "#include <map_fragment>\ndiffuseColor.rgb *= vCrownL * vTint;")
            .replace(
              "#include <aomap_fragment>",
              // leaf cards: little sheen (a rough, thin, translucent surface; the env reflection washed crowns out against the light)
              "#if FOLIAGE_MODE != 2\nreflectedLight.indirectSpecular *= 0.25;\nreflectedLight.directSpecular *= 0.4;\n#endif\n#include <aomap_fragment>",
            )
            .replace(
              "#include <emissivemap_fragment>",
              // warm back-lit glow, weaker under the canopy (vShade from canopyShade.ts)
              "#include <emissivemap_fragment>\n#if FOLIAGE_MODE == 1\ntotalEmissiveRadiance += diffuseColor.rgb * vec3(1.0, 1.12, 0.5) * vGlowW * uGlow * (1.0 - 0.75 * vShade.r);\n#endif",
            );
      }
    };
    m.defines = { ...(m.defines ?? {}), FOLIAGE_MODE: mode };
    m.customProgramCacheKey = () => prevKey + "|foliage" + mode + (depth ? "d" : "");
    m.needsUpdate = true;
  };
  return { uniforms, patch };
}
