import { expect,it,vi } from 'vitest';
import * as THREE from 'three';
import { createForestRuntime } from '../lib/forestRuntime';
import { QUALITY } from '../lib/quality';
it('continues on an empty optional manifest without touching the GPU or dereferencing a missing species',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>({ok:true,json:async()=>({version:1,species:[]})})));
  try {
    const root=new THREE.Group();
    const forest=await createForestRuntime({renderer:{} as THREE.WebGLRenderer,root,quality:QUALITY.med,trees:new Float32Array([0,0,0,10,0,0]),heightAt:()=>0,roadFree:()=>20,weights:()=>[0,0,1,0],shade:{patch:()=>{}} as never,foliage:{patch:()=>{}} as never,fog:{patch:()=>{},pathMin:()=>0} as never,stage:'full'});
    forest.update(new THREE.Vector3(),new THREE.Vector3(0,0,1),100);
    expect(forest.stats().trees).toBe(0);expect(root.children).toHaveLength(0);
    forest.dispose();
  } finally {vi.unstubAllGlobals();}
});
