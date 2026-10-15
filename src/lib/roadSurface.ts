import * as THREE from "three";

/** Surface wear in road coordinates: no extra meshes, one gravel lookup on roads.
 * roadProfile holds signed distance from centre and ribbon half-width, in metres.
 * Shoulder variation uses world coordinates so adjacent segments stay connected.
 */
export function patchRoadSurface(material: THREE.MeshStandardMaterial, gravel: THREE.Texture, shoulder = false) {
  const previous = material.onBeforeCompile;
  const key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.uniforms.uRoadGravel = { value: gravel };
    shader.vertexShader = `attribute vec2 roadProfile;
varying vec2 vRoadProfile;
varying vec2 vRoadWorld;
` + shader.vertexShader.replace("#include <begin_vertex>", `#include <begin_vertex>
vRoadProfile = roadProfile;
vRoadWorld = (modelMatrix * vec4(transformed, 1.0)).xz;`);
    shader.fragmentShader = `varying vec2 vRoadProfile;
varying vec2 vRoadWorld;
uniform sampler2D uRoadGravel;
float roadHash(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * 0.1031);
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
float roadNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(roadHash(i), roadHash(i + vec2(1, 0)), f.x),
             mix(roadHash(i + vec2(0, 1)), roadHash(i + vec2(1)), f.x), f.y);
}
` + shader.fragmentShader.replace("#include <map_fragment>", `#include <map_fragment>
float roadMacro = roadNoise(vRoadWorld * 0.18);
float roadFine = roadNoise(vRoadWorld * 1.7);
float roadEdge = abs(vRoadProfile.x);
float roadHalf = vRoadProfile.y;
diffuseColor.rgb *= 0.91 + 0.16 * roadMacro;
${shoulder ? `
// Dusty inner verge, earth-coloured outer verge; no alpha blending or overdraw.
float verge = smoothstep(roadHalf - 0.32, roadHalf - 0.04, roadEdge + (roadFine - 0.5) * 0.12);
diffuseColor.rgb *= mix(vec3(1.07, 1.02, 0.91), vec3(0.66, 0.73, 0.52), verge * 0.65);
` : `
// Broken dusty margin, in physical metres rather than a percentage of road width.
float margin = 1.0 - smoothstep(0.03, 0.23 + roadMacro * 0.20,
  roadHalf - roadEdge + (roadFine - 0.5) * 0.09);
// SRGBColorSpace textures are already decoded by the WebGL texture sampler.
vec3 roadDust = texture2D(uRoadGravel, vRoadWorld * 0.25).rgb;
diffuseColor.rgb = mix(diffuseColor.rgb, roadDust * vec3(0.76, 0.70, 0.59), margin * 0.65);
// Subtle paired wear bands; suppress them on narrow footpaths.
float wheelOffset = min(0.78, roadHalf * 0.48);
float wear = 1.0 - smoothstep(0.13, 0.42, abs(roadEdge - wheelOffset));
diffuseColor.rgb *= 1.0 - wear * smoothstep(0.9, 1.6, roadHalf) * 0.055;
`}`);
  };
  material.customProgramCacheKey = () => key + "|road-surface-v1|" + shoulder;
}
