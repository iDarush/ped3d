import * as THREE from "three";

const smooth = (a: number, b: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function cardCoverage(distance: number, near: number, far: number, fade: number): number {
  return smooth(near - fade / 2, near + fade / 2, distance) * (1 - smooth(far - 20, far, distance));
}

/** Complementary screen-door coverage; both representations use the same noise.
 * No sorted transparency, no additional texture samples. Distance follows the
 * current camera every frame, independently of the CPU's 4 m instance refill.
 */
export function patchBirchLod(material: THREE.Material, card: boolean, near: number, far: number, fade: number) {
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = "varying float vBirchDistance;\n" + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
vec3 birchAnchor = vec3(0.0);
#ifdef USE_INSTANCING
birchAnchor = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#else
birchAnchor = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
#endif
vBirchDistance = length(birchAnchor.xz - cameraPosition.xz);`);
    shader.fragmentShader = "varying float vBirchDistance;\n" + shader.fragmentShader.replace("#include <alphatest_fragment>", `#include <alphatest_fragment>
float birchCoverage = smoothstep(${(near - fade / 2).toFixed(3)}, ${(near + fade / 2).toFixed(3)}, vBirchDistance)
  * (1.0 - smoothstep(${(far - 20).toFixed(3)}, ${far.toFixed(3)}, vBirchDistance));
float birchNoise = fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
${card ? "if (birchNoise >= birchCoverage) discard;" : "if (birchNoise < birchCoverage) discard;"}`);
  };
  material.customProgramCacheKey = () => key + `|birch-lod-${card}-${near}-${far}-${fade}`;
}
