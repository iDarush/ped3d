import * as THREE from 'three';

export interface TreeContactAnchor { x: number; z: number; height: number }
export type TreeGrounding = 'off' | 'shade' | 'full';
export function treeContactRadii(height: number) {
  return { broad: Math.max(1.5, Math.min(3, height * .23)), collar: Math.max(.3, Math.min(.5, .3 + height * .012)) };
}

/** Reuse the canopy texture: BA store nearest-root offsets (6 bits per axis)
 * and height (4 bits total). RG stay untouched. Nothing updates while riding. */
export function createTreeContact(shade: {tex: THREE.DataTexture; uniforms: Record<string,THREE.IUniform>}, anchors: readonly TreeContactAnchor[]) {
  const image=shade.tex.image,W=image.width,H=image.height,old=image.data as Uint8Array;
  const stride=old.length/(W*H),bytes=new Uint8Array(W*H*4),nearest=new Float32Array(W*H).fill(Infinity);
  for(let k=0;k<W*H;k++){bytes[k*4]=old[k*stride];bytes[k*4+1]=old[k*stride+1];}
  const origin=shade.uniforms.uShadeO.value as THREE.Vector2,span=shade.uniforms.uShadeS.value as THREE.Vector2;
  const sx=span.x/W,sz=span.y/H;
  for(const tree of anchors) {
    const ci=(tree.x-origin.x)/sx-.5,cj=(tree.z-origin.y)/sz-.5;
    const h=Math.round(Math.max(0,Math.min(1,(tree.height-5)/7))*15);
    for(let j=Math.max(0,Math.floor(cj-6/sz));j<=Math.min(H-1,Math.ceil(cj+6/sz));j++) {
      for(let i=Math.max(0,Math.floor(ci-6/sx));i<=Math.min(W-1,Math.ceil(ci+6/sx));i++) {
        const dx=tree.x-(origin.x+(i+.5)*sx),dz=tree.z-(origin.y+(j+.5)*sz),d2=dx*dx+dz*dz,k=j*W+i;
        if(Math.abs(dx)>6||Math.abs(dz)>6||d2>=nearest[k])continue;
        nearest[k]=d2;
        bytes[k*4+2]=Math.floor(h/4)*64+Math.round((dx/12+.5)*63);
        bytes[k*4+3]=(h%4)*64+Math.round((dz/12+.5)*63);
      }
    }
  }
  shade.tex.image={data:bytes,width:W,height:H};shade.tex.format=THREE.RGBAFormat;shade.tex.needsUpdate=true;
  return {
    uniforms:{uTreeContactGrid:{value:new THREE.Vector2(W,H)}},texture:shade.tex,
    update:(_x:number,_z:number)=>{},
    pars:'uniform vec2 uTreeContactGrid;\n',
    glsl:`{
float tcDistance=length(vWPos.xz-cameraPosition.xz);
vec2 tcCell=floor((vWPos.xz-uShadeO)/uShadeS*uTreeContactGrid);
if(tcDistance<60.0 && all(greaterThanEqual(tcCell,vec2(0.0))) && all(lessThan(tcCell,uTreeContactGrid))) {
 vec2 tcPacked=floor(textureLod(uShade,(tcCell+0.5)/uTreeContactGrid,0.0).ba*255.0+0.5);
 vec2 tcHigh=floor(tcPacked/64.0);
 float tcHeight=5.0+(tcHigh.x*4.0+tcHigh.y)*(7.0/15.0);
 vec2 tcRoot=uShadeO+(tcCell+0.5)/uTreeContactGrid*uShadeS+(mod(tcPacked,64.0)/63.0-0.5)*12.0;
 float tcD=length(vWPos.xz-tcRoot);
 float tcBroad=0.32*pow(max(0.0,1.0-tcD/clamp(tcHeight*0.23,1.5,3.0)),2.0);
 float tcCollar=0.7*(1.0-smoothstep(0.06,clamp(0.3+tcHeight*0.012,0.3,0.5),tcD));
 float tc=(1.0-(1.0-tcBroad)*(1.0-tcCollar))*(1.0-smoothstep(48.0,60.0,tcDistance));
 col *= (1.0-0.8*tc)*mix(vec3(1.0),vec3(0.9,0.94,0.85),tc*0.25);
}
}`,
    dispose:()=>{}, // Owned by the existing canopy-shade resource.
  };
}

/** Geometry is in units of shared species h0 for models AND padded cards.
 * Using physical height from its pivot avoids atlas-row/azimuth dependencies. */
export function patchTreeBase(material: THREE.Material) {
  const previous = material.onBeforeCompile, key = material.customProgramCacheKey();
  material.onBeforeCompile = (shader, renderer) => {
    previous.call(material, shader, renderer);
    shader.vertexShader = 'varying float vTreeBaseHeight;\n' + shader.vertexShader.replace('#include <begin_vertex>', `#include <begin_vertex>
mat4 treeBaseMatrix = modelMatrix;
#ifdef USE_INSTANCING
treeBaseMatrix *= instanceMatrix;
#endif
vTreeBaseHeight = position.y * length(treeBaseMatrix[1].xyz);`);
    shader.fragmentShader = 'varying float vTreeBaseHeight;\n' + shader.fragmentShader.replace('#include <color_fragment>', `#include <color_fragment>
float treeBase = 1.0-smoothstep(0.06,0.6,max(0.0,vTreeBaseHeight));
diffuseColor.rgb *= mix(vec3(1.0),vec3(0.48,0.52,0.38),treeBase);`);
  };
  material.customProgramCacheKey = () => key + '|tree-base-metres';
  material.needsUpdate = true;
}
