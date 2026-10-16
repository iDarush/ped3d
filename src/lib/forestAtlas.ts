import * as THREE from 'three';
/** Bake reflection with corrected winding: instance matrices remain positive. */
export function mirroredForestGeometry(source:THREE.BufferGeometry) {
  const geo=source.clone().scale(-1,1,1);
  if(!geo.index)geo.setIndex(Array.from({length:geo.getAttribute('position').count},(_,i)=>i));
  const index=geo.index!;
  for(let i=0;i<index.count;i+=3){const b=index.getX(i+1);index.setX(i+1,index.getX(i+2));index.setX(i+2,b);}
  const tangent=geo.getAttribute('tangent');
  if(tangent)for(let i=0;i<tangent.count;i++)tangent.setW(i,-tangent.getW(i));
  return geo;
}

/** Blend adjacent views only around their boundary. Explicit gradients avoid
 * incorrect mips across the atlas wrap. No persistent screen-door grain. */
export function patchForestAtlasFrames(shader:THREE.WebGLProgramParametersWithUniforms) {
  shader.vertexShader='varying vec2 vForestFrame;\n'+shader.vertexShader;
  shader.fragmentShader=`varying vec2 vForestFrame;
vec4 forestAtlasSample(sampler2D atlas,vec2 uv) {
 vec2 dx=dFdx(uv),dy=dFdy(uv);
 float t=smoothstep(0.35,0.65,vForestFrame.x);
 vec2 nextUv=uv+vec2(vForestFrame.y,0.0);
 vec4 result=vec4(0.0);
 if(t<=0.0) result=textureGrad(atlas,uv,dx,dy);
 else if(t>=1.0) result=textureGrad(atlas,nextUv,dx,dy);
 else result=mix(textureGrad(atlas,uv,dx,dy),textureGrad(atlas,nextUv,dx,dy),t);
 return result;
}
`+shader.fragmentShader;
  shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>',THREE.ShaderChunk.map_fragment.replace('texture2D( map, vMapUv )','forestAtlasSample(map,vMapUv)'));
  shader.fragmentShader=shader.fragmentShader.replace('#include <normal_fragment_maps>',THREE.ShaderChunk.normal_fragment_maps.replaceAll('texture2D( normalMap, vNormalMapUv )','forestAtlasSample(normalMap,vNormalMapUv)'));
}
