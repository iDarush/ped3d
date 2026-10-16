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

it('uses distinct dry maps, preserves green root rings, and keeps world groups after a refill',()=>{
  const root=new THREE.Group(),geo=new THREE.PlaneGeometry(.2,.3),normal=new THREE.Texture(),green=new THREE.Texture(),dry=new THREE.Texture();
  const assets:ForestAsset[]=['lolium','setaria','ammophila','digitaria'].map(id=>{
    const greenMat=new THREE.MeshStandardMaterial({map:green,normalMap:normal}),dryMat=new THREE.MeshStandardMaterial({map:dry,normalMap:normal});
    return {entry:{id,role:'grass',models:[`${id}_a_lod0.glb`],cards:null,dryOnly:id==='digitaria'},models:[[[new THREE.Mesh(geo,id==='digitaria'?dryMat:greenMat)]]],...(id==='setaria'||id==='ammophila'?{dryModels:[[new THREE.Mesh(geo,dryMat)]]}:{})};
  });
  const sample=(x:number,z:number)=>({kind:'field' as const,field:1,free:Math.abs(z)-2.5,shoulder:Math.abs(z)-2.9});
  const grass=createForestGrass({assets,roots:[{x:2,z:4}],vergeEnabled:true,fieldVerge:{sample},fieldDensity:1.7,antialias:true,root,radius:22,density:.7,normals:true,heightAt:()=>0,roadFree:(x,z)=>sample(x,z).free,weights:()=>[1,0,0,0],shade:{patch:()=>{}} as never,foliage:{patch:()=>{}} as never,fog:{patch:()=>{}} as never});
  grass.update(new THREE.Vector3());
  expect(grass.fieldStats().tufts).toBeGreaterThan(10);expect(grass.fieldStats().dry).toBeGreaterThan(grass.fieldStats().tufts*.8);
  expect(grass.rootStats()).toBeGreaterThan(0);
  expect(grass.region(0,6)).toBe(true); // suppress the old bright procedural carpet
  const dryMesh=root.children.find(m=>m.name==='forest-setaria-0-dry') as THREE.InstancedMesh<THREE.BufferGeometry,THREE.MeshLambertMaterial>;
  const greenMesh=root.children.find(m=>m.name==='forest-setaria-0') as typeof dryMesh;
  expect(dryMesh.material.map).toBe(dry);expect(greenMesh.material.map).toBe(green);expect(dryMesh.material.normalMap).toBe(greenMesh.material.normalMap);
  expect(dryMesh.material.alphaToCoverage).toBe(true);expect(dryMesh.castShadow).toBe(false);
  const collect=()=>root.children.flatMap(c=>{const m=c as THREE.InstancedMesh;return Array.from({length:m.count},(_,i)=>`${m.name}:${m.instanceMatrix.array[i*16+12]},${m.instanceMatrix.array[i*16+14]}`);}).sort();
  const before=collect();grass.update(new THREE.Vector3(100,0,0));grass.update(new THREE.Vector3());expect(collect()).toEqual(before);
  grass.dispose();geo.dispose();normal.dispose();green.dispose();dry.dispose();
});
