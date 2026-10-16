import {expect,it} from 'vitest';
import * as THREE from 'three';
import {createTreeContact,treeContactRadii,patchTreeBase} from '../lib/treeContact';
import {patchForestAtlasFrames} from '../lib/forestAtlas';
const fixture=()=>{
  const tex=new THREE.DataTexture(new Uint8Array(16*16*2).fill(73),16,16,THREE.RGFormat);
  return {tex,uniforms:{uShadeO:{value:new THREE.Vector2(-16,-16)},uShadeS:{value:new THREE.Vector2(32,32)}}};
};
it('keeps canopy RG and packs the closest real root with bounded coordinate and height error',()=>{
  const shade=fixture();createTreeContact(shade,[{x:.25,z:.5,height:10},{x:8,z:8,height:12}]);
  const bytes=shade.tex.image.data as Uint8Array;
  for(let i=0;i<256;i++){expect(bytes[i*4]).toBe(73);expect(bytes[i*4+1]).toBe(73);}
  const k=(8*16+8)*4,b=bytes[k+2],a=bytes[k+3];
  const x=1+((b%64)/63-.5)*12,z=1+((a%64)/63-.5)*12,h=5+(Math.floor(b/64)*4+Math.floor(a/64))*7/15;
  expect(Math.abs(x-.25)).toBeLessThan(.1);expect(Math.abs(z-.5)).toBeLessThan(.1);expect(Math.abs(h-10)).toBeLessThan(.25);
  expect(treeContactRadii(5).broad).toBe(1.5);expect(treeContactRadii(30).broad).toBe(3);
  shade.tex.dispose();
});
it('does not allocate a second texture or change root positions while riding',()=>{
  const shade=fixture(),field=createTreeContact(shade,[{x:1,z:1,height:10}]);
  const data=(shade.tex.image.data as Uint8Array).slice();
  field.update(100,200);field.update(-100,80);
  expect(field.texture).toBe(shade.tex);expect(shade.tex.image.data).toEqual(data);
  field.dispose();shade.tex.dispose();
});
it('retains the base tint after the card atlas expands its map shader chunk',()=>{
  const material=new THREE.MeshLambertMaterial();
  material.onBeforeCompile=sh=>patchForestAtlasFrames(sh);
  patchTreeBase(material);
  const shader={uniforms:{},vertexShader:THREE.ShaderLib.lambert.vertexShader,fragmentShader:THREE.ShaderLib.lambert.fragmentShader};
  material.onBeforeCompile(shader as never,{} as THREE.WebGLRenderer);
  expect(shader.fragmentShader).toContain('float treeBase =');
  expect(shader.vertexShader).toContain('length(treeBaseMatrix[1].xyz)');
  material.dispose();
});
