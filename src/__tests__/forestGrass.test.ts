import {expect,it} from 'vitest';
import * as THREE from 'three';
import {createForestGrass} from '../lib/forestGrass';
import {treeRootRing} from '../lib/forestPlacement';
import type {ForestAsset} from '../lib/forestAssets';
it('reuses one variant mesh for all root rings and rejects roots on road coverage',()=>{
  const root=new THREE.Group(),geo=new THREE.PlaneGeometry(.2,.4),mat=new THREE.MeshStandardMaterial();
  const asset:ForestAsset={entry:{id:'lolium',role:'grass',models:['lolium_a_lod0.glb'],cards:null},models:[[[new THREE.Mesh(geo,mat)]]]};
  const grass=createForestGrass({assets:[asset],roots:[{x:2,z:2},{x:-10,z:0}],vergeEnabled:false,root,radius:45,density:1,normals:false,heightAt:()=>0,roadFree:x=>x<0?-1:10,weights:()=>[0,0,1,0],shade:{patch:()=>{}} as never,foliage:{patch:()=>{}} as never,fog:{patch:()=>{}} as never});
  expect(root.children).toHaveLength(1);
  grass.update(new THREE.Vector3());
  expect(grass.rootStats()).toBe(treeRootRing(2,2).length);
  expect(grass.stats()).toBe(grass.rootStats());
  const mesh=root.children[0] as THREE.InstancedMesh;
  expect(mesh.castShadow).toBe(false);
  for(let i=0;i<mesh.count;i++){expect(mesh.instanceMatrix.array[i*16+12]).toBeGreaterThan(0);expect(mesh.geometry.getAttribute("grassRank").getY(i)).toBe(35);}
  grass.update(new THREE.Vector3(10,0,0));
  expect(root.children[0]).toBe(mesh);expect(root.children).toHaveLength(1);
  expect(grass.rootStats()).toBe(treeRootRing(2,2).length);
  grass.dispose();geo.dispose();mat.dispose();
});
