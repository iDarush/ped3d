import * as THREE from 'three';
import type { ForestAsset } from './forestAssets';
import { forestHash, forestGrassRegion, treeRootRing } from './forestPlacement';
import type { CanopyShade } from './canopyShade';
import type { Foliage } from './foliage';
import type { ForestFog } from './forestFog';

export function createForestGrass(o:{assets:ForestAsset[];roots?:readonly {x:number;z:number}[];vergeEnabled?:boolean;root:THREE.Group;radius:number;density:number;normals:boolean;heightAt:(x:number,z:number)=>number;roadFree:(x:number,z:number)=>number;weights:(x:number,z:number)=>number[];shade:CanopyShade;foliage:Foliage;fog:ForestFog}) {
  const assets=o.assets.filter(a=>a.entry.role==='grass'&&a.models.length);
  const extra:{dispose():void}[]=[],slots:{mesh:THREE.InstancedMesh;rank:THREE.InstancedBufferAttribute;n:number;id:string;variant:number}[]=[];
  const capacity=Math.ceil(Math.PI*(o.radius+4)**2/0.64*1.1)+(o.roots?.length?Math.ceil(Math.PI*(o.radius+4)**2/16)*6:0);
  for(const asset of assets) {
    const source=asset.models[0][0][0].material;
    const mat=new THREE.MeshLambertMaterial({map:source.map,normalMap:o.normals?source.normalMap:null,side:THREE.DoubleSide,alphaTest:0.5});extra.push(mat);
    mat.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_begin>',THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;','float faceDirection = 1.0;'));};
    o.shade.patch(mat,4);o.foliage.patch(mat,3);o.fog.patch(mat);
    const prev=mat.onBeforeCompile,cache=mat.customProgramCacheKey();
    mat.onBeforeCompile=(sh,r)=>{
      prev.call(mat,sh,r);
      sh.vertexShader='attribute vec2 grassRank;\nvarying float vGrassCoverage;\n'+sh.vertexShader.replace('#include <begin_vertex>',`#include <begin_vertex>
vec3 ga=(modelMatrix*instanceMatrix*vec4(0.0,0.0,0.0,1.0)).xyz;
float gd=length(ga.xz-cameraPosition.xz);
float gp=1.0-clamp((gd-(grassRank.y-10.0))/10.0,0.0,1.0);
vGrassCoverage=clamp((gp-grassRank.x)*8.0,0.0,1.0);`);
      sh.fragmentShader='varying float vGrassCoverage;\n'+sh.fragmentShader.replace('#include <alphatest_fragment>',`#include <alphatest_fragment>
float gn=fract(52.9829189*fract(dot(gl_FragCoord.xy,vec2(0.06711056,0.00583715))));
if(gn>=vGrassCoverage)discard;`).replace('#include <lights_fragment_begin>','#include <lights_fragment_begin>\nreflectedLight.indirectDiffuse+=diffuseColor.rgb*0.25;');
    };
    mat.customProgramCacheKey=()=>cache+'|forest-grass-'+o.radius;
    for(let variant=0;variant<asset.models.length;variant++) for(const part of asset.models[variant][0]) {
      const geo=part.geometry.clone();extra.push(geo);
      const rank=new THREE.InstancedBufferAttribute(new Float32Array(capacity*2),2);geo.setAttribute('grassRank',rank);
      const mesh=new THREE.InstancedMesh(geo,mat,capacity);mesh.count=0;mesh.frustumCulled=false;mesh.name=`forest-${asset.entry.id}-${variant}`;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);o.root.add(mesh);extra.push(mesh);slots.push({mesh,rank,n:0,id:asset.entry.id,variant});
    }
  }
  const rootCells=new Map<string,{x:number;z:number}[]>();
  for(const tree of o.roots??[]){const key=`${Math.floor(tree.x/8)},${Math.floor(tree.z/8)}`;let list=rootCells.get(key);if(!list)rootCells.set(key,list=[]);list.push(tree);}
  const region=(x:number,z:number)=>{
    if(!assets.length)return false;
    if(o.vergeEnabled!==false&&forestGrassRegion(x,z,o.roadFree,o.weights))return true;
    const ix=Math.floor(x/8),iz=Math.floor(z/8);
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(const tree of rootCells.get(`${ix+a},${iz+b}`)??[])if((tree.x-x)**2+(tree.z-z)**2<1.5**2)return true;
    return false;
  };
  type Tuft={x:number;z:number;matrix:Float32Array;rank:number;root:boolean;slots:typeof slots};
  const tiles=new Map<string,Tuft[]>();
  const regionCache=new Map<string,boolean>();
  const exactRegion=region;
  const cachedRegion=(x:number,z:number)=>{
    const ix=Math.floor(x),iz=Math.floor(z),key=`${ix},${iz}`;
    let value=regionCache.get(key);if(value===undefined){value=exactRegion(ix+.5,iz+.5);regionCache.set(key,value);}return value;
  };
  const tile=(ix:number,iz:number)=>{
    const key=`${ix},${iz}`,cached=tiles.get(key);if(cached)return cached;
    const out:Tuft[]=[];
    const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),up=new THREE.Vector3(0,1,0);
    const append=(x:number,z:number,scale:number,yaw:number,root:boolean)=>{
      if(o.roadFree(x,z)<.6)return;
      const lolium=assets.find(a=>a.entry.id==='lolium'),setaria=assets.find(a=>a.entry.id==='setaria');
      const asset=lolium&&setaria?(forestHash(x,z,124)<.7?lolium:setaria):(lolium??setaria??assets[0]);
      const variant=Math.floor(forestHash(x,z,125)*asset.models.length);
      matrix.compose(new THREE.Vector3(x,o.heightAt(x,z)-.015,z),q.setFromAxisAngle(up,yaw),new THREE.Vector3(scale,scale,scale));
      out.push({x,z,matrix:new Float32Array(matrix.elements),rank:forestHash(x,z,128)*0.875,root,slots:slots.filter(s=>s.id===asset.entry.id&&s.variant===variant)});
    };
    if(o.vergeEnabled!==false)for(let gx=ix*10;gx<(ix+1)*10;gx++)for(let gz=iz*10;gz<(iz+1)*10;gz++) {
      const ax=gx*.8,az=gz*.8;
      if(forestHash(ax,az,121)>o.density*.64)continue;
      const x=ax+forestHash(ax,az,122)*.8,z=az+forestHash(ax,az,123)*.8;
      // Rings have their own fixed population; don't generate a random carpet
      // inside a ring solely because the old blade-exclusion mask covers it.
      if(!forestGrassRegion(x,z,o.roadFree,o.weights))continue;
      append(x,z,.8+forestHash(x,z,126)*.6,forestHash(x,z,127)*Math.PI*2,false);
    }
    for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(const tree of rootCells.get(`${ix+a},${iz+b}`)??[]) {
      for(const p of treeRootRing(tree.x,tree.z)) {
        if(Math.floor(p.x/8)!==ix||Math.floor(p.z/8)!==iz)continue;
        append(p.x,p.z,p.scale,p.yaw,true);
      }
    }
    tiles.set(key,out);return out;
  };
  let lastX=Infinity,lastZ=Infinity,count=0,rootCount=0;
  const update=(cam:THREE.Vector3)=>{
    if(Math.hypot(cam.x-lastX,cam.z-lastZ)<2)return;
    lastX=cam.x;lastZ=cam.z;rootCount=0;for(const s of slots)s.n=0;
    if(!assets.length)return;
    const r=o.radius+4;
    if(tiles.size>256)for(const key of tiles.keys()){const [x,z]=key.split(',').map(Number);if(Math.hypot(x*8+4-cam.x,z*8+4-cam.z)>r+12)tiles.delete(key);}
    if(regionCache.size>20000)for(const key of regionCache.keys()){const [x,z]=key.split(',').map(Number);if(Math.hypot(x-cam.x,z-cam.z)>r+12)regionCache.delete(key);}
    for(let ix=Math.floor((cam.x-r)/8);ix<=Math.ceil((cam.x+r)/8);ix++)for(let iz=Math.floor((cam.z-r)/8);iz<=Math.ceil((cam.z+r)/8);iz++) {
      for(const p of tile(ix,iz)) {
        const pr=(p.root?Math.min(35,o.radius):o.radius)+4;
        if((p.x-cam.x)**2+(p.z-cam.z)**2>pr*pr)continue;
        if(p.root)rootCount++;
        for(const s of p.slots){(s.mesh.instanceMatrix.array as Float32Array).set(p.matrix,s.n*16);s.rank.setXY(s.n,p.rank,p.root?Math.min(35,o.radius):o.radius);s.n++;}
      }
    }
    count=0;for(const s of slots){s.mesh.count=s.n;s.mesh.visible=s.n>0;s.mesh.instanceMatrix.needsUpdate=true;s.rank.needsUpdate=true;count+=s.n;}
  };
  return {update,region:cachedRegion,stats:()=>count,rootStats:()=>rootCount,dispose:()=>{for(const s of slots)o.root.remove(s.mesh);extra.forEach(x=>x.dispose());}};
}
