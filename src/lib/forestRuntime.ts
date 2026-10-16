import * as THREE from 'three';
import { loadForestAssets, type ForestAsset } from './forestAssets';
import { forestHash, chooseForestSpecies } from './forestPlacement';
import type { QualityPreset } from './quality';
import type { CanopyShade } from './canopyShade';
import type { Foliage } from './foliage';
import type { ForestFog } from './forestFog';

export interface ForestStats { trees: number; cards: number; lod0: number; lod1: number; shrubs: number; grass: number; species: string[] }
interface Plant { id: number; x: number; y: number; z: number; yaw: number; scale: number; row: number; asset: ForestAsset; matrix: THREE.Matrix4 }
interface Slot { mesh: THREE.InstancedMesh; n: number; row: THREE.InstancedBufferAttribute; yaw: THREE.InstancedBufferAttribute }
export async function createForestRuntime(o: { renderer: THREE.WebGLRenderer; root: THREE.Group; quality: QualityPreset; trees: Float32Array; heightAt: (x: number,z: number) => number; roadFree: (x: number,z: number) => number; weights: (x: number,z: number) => number[]; shade: CanopyShade; foliage: Foliage; fog: ForestFog; stage: string }) {
  const resources = await loadForestAssets(o.renderer, ['tree'], false);
  const assets = resources.assets.filter(a => a.entry.role === 'tree' && a.card && a.meta);
  if (!assets.length) { resources.dispose(); throw new Error('forest=mix requires at least one tree species with cards'); }
  const extra: { dispose(): void }[] = [];
  const plants: Plant[] = [], grid = new Map<string, Plant[]>(), cells = new Map<string, Plant[]>();
  const key = (x: number,z: number,size: number) => `${Math.floor(x/size)},${Math.floor(z/size)}`;
  const candidates = Array.from({ length: o.trees.length / 6 }, (_,i) => i).filter(i => o.trees[i*6+5] !== 3);
  candidates.sort((a,b) => forestHash(o.trees[a*6], o.trees[a*6+2], 21) - forestHash(o.trees[b*6],o.trees[b*6+2],21));
  const q = new THREE.Quaternion(), up = new THREE.Vector3(0,1,0);
  for (const i of candidates) {
    const x = o.trees[i*6], z = o.trees[i*6+2];
    if (o.roadFree(x,z) < 1) continue;
    const gx = Math.floor(x/5), gz = Math.floor(z/5);
    let close = false;
    for (let a=-1;a<=1;a++) for(let b=-1;b<=1;b++) for(const p of grid.get(`${gx+a},${gz+b}`) ?? []) if ((p.x-x)**2+(p.z-z)**2<25) close=true;
    if (close) continue;
    // Thin the forest edge, keeping isolated source trees outside forest patches.
    const fw = o.weights(x,z)[2];
    if (fw > 0.15 && fw < 0.65 && forestHash(x,z,48) < 0.25) continue;
    const asset = assets.find(a => a.entry.id === chooseForestSpecies(x,z,assets.map(a=>a.entry.id)))!;
    const row = asset.models.length > 1 ? Math.floor(forestHash(x,z,82)*2) : (['alder','maple'].includes(asset.entry.id) ? Math.floor(forestHash(x,z,82)*2) : 0);
    const scale = 8 + forestHash(x,z,17)*4, yaw = forestHash(x,z,29)*Math.PI*2;
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x,o.heightAt(x,z)-0.05,z),q.setFromAxisAngle(up,yaw),new THREE.Vector3(scale,scale,scale));
    const p: Plant = { id: plants.length, x, y:o.heightAt(x,z), z, yaw, scale, row, asset, matrix };
    plants.push(p);
    for (const [map,k] of [[grid,key(x,z,5)],[cells,key(x,z,25)]] as const) { let list=map.get(k); if(!list) map.set(k,list=[]); list.push(p); }
  }
  const slots = new Map<string,Slot>();
  for (const asset of assets) {
    const count = plants.filter(p=>p.asset===asset).length;
    if (!count) continue;
    const source = asset.card!;
    const material = new THREE.MeshLambertMaterial({ map: source.material.map, normalMap:o.quality.groundNormals ? source.material.normalMap:null, side:THREE.DoubleSide,alphaTest:0.5 });
    extra.push(material);
    material.onBeforeCompile = sh => { sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_begin>',THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;','float faceDirection = 1.0;')); };
    o.shade.patch(material,3); o.foliage.patch(material,1); o.fog.patch(material);
    const previous = material.onBeforeCompile, cacheKey=material.customProgramCacheKey();
    const cellU=asset.meta!.tree_cells.cell_px[0]/asset.meta!.atlas.size[0], cellV=asset.meta!.tree_cells.cell_px[1]/asset.meta!.atlas.size[1];
    material.onBeforeCompile = (sh,r) => {
      previous.call(material,sh,r);
      sh.vertexShader='attribute float forestRow;\nattribute float forestYaw;\nattribute float forestPlane;\n'+sh.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
vec3 fa = (modelMatrix * instanceMatrix * vec4(0.0,0.0,0.0,1.0)).xyz;
vec2 fd = cameraPosition.xz-fa.xz;
float fc = floor((atan(fd.x,fd.y)-forestYaw)/0.78539816339+0.5);
float fu = (mod(fc+forestPlane+80.0,8.0)-forestPlane)*${cellU.toFixed(9)};
#ifdef USE_MAP
vMapUv += vec2(fu,forestRow*${cellV.toFixed(9)});
#endif
#ifdef USE_NORMALMAP
vNormalMapUv += vec2(fu,forestRow*${cellV.toFixed(9)});
#endif`);
      sh.fragmentShader=sh.fragmentShader.replace('#include <lights_fragment_begin>','#include <lights_fragment_begin>\nreflectedLight.indirectDiffuse += diffuseColor.rgb*0.25;');
    };
    material.customProgramCacheKey=()=>cacheKey+'|forest-atlas-'+asset.entry.id;
    const geometry=source.geometry.clone(); extra.push(geometry);
    const uv=geometry.getAttribute('uv'), plane=new Float32Array(uv.count);
    for(let i=0;i<uv.count;i+=4) { const col=Math.round(Math.min(...[0,1,2,3].map(j=>uv.getX(i+j)))/cellU); for(let j=0;j<4;j++) plane[i+j]=col; }
    geometry.setAttribute('forestPlane',new THREE.BufferAttribute(plane,1));
    const row=new THREE.InstancedBufferAttribute(new Float32Array(count),1), yaw=new THREE.InstancedBufferAttribute(new Float32Array(count),1);
    geometry.setAttribute('forestRow',row); geometry.setAttribute('forestYaw',yaw);
    const mesh=new THREE.InstancedMesh(geometry,material,count); mesh.frustumCulled=false; mesh.count=0;
    mesh.name='forest-'+asset.entry.id+'-cross'; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); o.root.add(mesh); extra.push(mesh);
    slots.set(asset.entry.id,{mesh,n:0,row,yaw});
  }
  let lastX=Infinity,lastZ=Infinity,lastFx=0,lastFz=0;
  const stats: ForestStats={trees:plants.length,cards:0,lod0:0,lod1:0,shrubs:0,grass:0,species:assets.map(a=>a.entry.id)};
  const update=(cam:THREE.Vector3,fwd:THREE.Vector3,cardR:number) => {
    if (Math.hypot(cam.x-lastX,cam.z-lastZ)<4 && fwd.x*lastFx+fwd.z*lastFz>0.985) return;
    lastX=cam.x;lastZ=cam.z;lastFx=fwd.x;lastFz=fwd.z;
    for(const s of slots.values()) s.n=0;
    const r=Math.ceil(cardR/25)+1, cx=Math.floor(cam.x/25),cz=Math.floor(cam.z/25);
    for(let a=-r;a<=r;a++) for(let b=-r;b<=r;b++) {
      const list=cells.get(`${cx+a},${cz+b}`); if(!list)continue;
      const dx=(cx+a+0.5)*25-cam.x,dz=(cz+b+0.5)*25-cam.z,d=Math.hypot(dx,dz),padding=36;
      if(d-padding>cardR || (d>80&&(dx*fwd.x+dz*fwd.z+padding)/d<0.26) || o.fog.pathMin(dx,dz,padding)>o.quality.forestFogFar+10)continue;
      for(const p of list) {
        if((p.x-cam.x)**2+(p.z-cam.z)**2>cardR**2) continue;
        const s=slots.get(p.asset.entry.id)!;
        s.mesh.setMatrixAt(s.n,p.matrix);s.row.setX(s.n,p.row);s.yaw.setX(s.n,p.yaw);s.n++;
      }
    }
    stats.cards=0;
    for(const s of slots.values()) {s.mesh.count=s.n;s.mesh.visible=s.n>0;s.mesh.instanceMatrix.needsUpdate=true;s.row.needsUpdate=true;s.yaw.needsUpdate=true;stats.cards+=s.n;}
  };
  return { update, stats:()=>({...stats}), dispose:()=>{for(const s of slots.values())o.root.remove(s.mesh);extra.forEach(x=>x.dispose());resources.dispose();} };
}
