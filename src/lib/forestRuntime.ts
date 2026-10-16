import * as THREE from 'three';
import { createTreeContact, patchTreeBase, type TreeGrounding } from './treeContact';
import { loadForestAssets, type ForestAsset } from './forestAssets';
import { mirroredForestGeometry } from './forestAtlas';
import { createForestGrass } from './forestGrass';
import { BirchSelection, birchBlend } from './birchSelection';
import { patchBirchBlend, patchBirchLod } from './birchLod';
import { forestHash, chooseForestSpecies } from './forestPlacement';
import type { QualityPreset } from './quality';
import type { CanopyShade } from './canopyShade';
import type { Foliage } from './foliage';
import type { ForestFog } from './forestFog';
import type { FieldVerge } from './fieldVerge';

export interface ForestStats { trees: number; cards: number; lod0: number; lod1: number; shrubs: number; shrubLod0: number; shrubLod1: number; grass: number; rootTufts: number; fieldTufts:number;dryTufts:number;fieldSpecies:Record<string,number>;species: string[] }
interface Plant { id: number; x: number; y: number; z: number; yaw: number; scale: number; row: number; asset: ForestAsset; matrix: THREE.Matrix4 }
interface Slot { mesh: THREE.InstancedMesh; n: number; row: THREE.InstancedBufferAttribute; blend: THREE.InstancedBufferAttribute }
export async function createForestRuntime(o: { renderer: THREE.WebGLRenderer; root: THREE.Group; quality: QualityPreset; trees: Float32Array; heightAt: (x: number,z: number) => number; roadFree: (x: number,z: number) => number; weights: (x: number,z: number) => number[]; shade: CanopyShade; foliage: Foliage; fog: ForestFog; stage: string; grounding?: TreeGrounding; fieldVerge?:FieldVerge }) {
  const modelsEnabled = o.stage !== 'cards';
  const mirrorsEnabled = o.stage === 'full';
  const time = { value: 0 };
  const selection = new BirchSelection([o.quality.birchDetailCount,o.quality.birchSimpleCount], Math.min(o.quality.detailR,o.quality.birchCardNear+o.quality.birchCardFade/2));
  const shrubsEnabled = ['shrubs','grass','full'].includes(o.stage);
  const shrubSelection = new BirchSelection([o.quality.forestShrubDetailCount,o.quality.forestShrubSimpleCount],30,12);
  const vergeEnabled=['grass','full'].includes(o.stage);
  const rootsEnabled=o.grounding==='full';
  const grassEnabled=vergeEnabled||rootsEnabled;
  const resources = await loadForestAssets(o.renderer, ['tree',...(shrubsEnabled?['shrub']:[]),...(grassEnabled?['grass']:[])], modelsEnabled, !!o.fieldVerge&&vergeEnabled);
  const assets = resources.assets.filter(a => a.entry.role !== 'grass' && a.card && a.meta);
  const treeAssets = assets.filter(a=>a.entry.role==='tree');
  const shrubAssets = assets.filter(a=>a.entry.role==='shrub');
  if (!treeAssets.length) console.warn('No tree cards in forest manifest; continuing without tree instances');
  const extra: { dispose(): void }[] = [];
  const plants: Plant[] = [], grid = new Map<string, Plant[]>(), cells = new Map<string, Plant[]>();
  const key = (x: number,z: number,size: number) => `${Math.floor(x/size)},${Math.floor(z/size)}`;
  const candidates = treeAssets.length ? Array.from({ length: o.trees.length / 6 }, (_,i) => i).filter(i => o.trees[i*6+5] !== 3) : [];
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
    const asset = treeAssets.find(a => a.entry.id === chooseForestSpecies(x,z,treeAssets.map(a=>a.entry.id)))!;
    const row = mirrorsEnabled ? Math.floor(forestHash(x,z,82)*(['alder','maple'].includes(asset.entry.id)?4:2)) : asset.models.length > 1 ? Math.floor(forestHash(x,z,82)*2) : (['alder','maple'].includes(asset.entry.id) ? Math.floor(forestHash(x,z,82)*2) : 0);
    const scale = 8 + forestHash(x,z,17)*4, yaw = forestHash(x,z,29)*Math.PI*2;
    const matrix = new THREE.Matrix4().compose(new THREE.Vector3(x,o.heightAt(x,z)-0.05,z),q.setFromAxisAngle(up,yaw),new THREE.Vector3(scale,scale,scale));
    const p: Plant = { id: plants.length, x, y:o.heightAt(x,z), z, yaw, scale, row, asset, matrix };
    plants.push(p);
    for (const [map,k] of [[grid,key(x,z,5)],[cells,key(x,z,25)]] as const) { let list=map.get(k); if(!list) map.set(k,list=[]); list.push(p); }
  }
  if(shrubsEnabled && shrubAssets.length) {
    const anchors=new Set<string>(), shrubGrid=new Map<string,Plant[]>();
    const roots=[...plants];
    for(const root of roots) {
      const ax=Math.floor(root.x/6)*6,az=Math.floor(root.z/6)*6,k=`${ax},${az}`;
      if(anchors.has(k))continue;anchors.add(k);
      const w=o.weights(ax,az)[2];if(w<0.3)continue;
      const edge=[[8,0],[-8,0],[0,8],[0,-8]].some(([dx,dz])=>o.weights(ax+dx,az+dz)[2]<0.3);
      const count=edge?3+Math.floor(forestHash(ax,az,19)*5):1;
      for(let n=0;n<count;n++) {
        const x=ax+(forestHash(ax+n,az,51)-0.5)*(edge?7:6),z=az+(forestHash(ax+n,az,52)-0.5)*(edge?7:6);
        if(o.weights(x,z)[2]<0.3||o.roadFree(x,z)<0.6)continue;
        const gx=Math.floor(x),gz=Math.floor(z);let close=false;
        for(let a=-1;a<=1;a++)for(let b=-1;b<=1;b++)for(const p of shrubGrid.get(`${gx+a},${gz+b}`)??[])if((p.x-x)**2+(p.z-z)**2<1)close=true;
        if(close)continue;
        const asset=shrubAssets.find(a=>a.entry.id===chooseForestSpecies(x,z,shrubAssets.map(a=>a.entry.id),true))!;
        const scale=asset.meta!.tree_cells.source_tree_height_m*(0.8+forestHash(x,z,53)*0.5),yaw=forestHash(x,z,54)*Math.PI*2,row=Math.floor(forestHash(x,z,55)*(mirrorsEnabled?4:2));
        const y=o.heightAt(x,z)-0.03,matrix=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),q.setFromAxisAngle(up,yaw),new THREE.Vector3(scale,scale,scale));
        const p:Plant={id:plants.length,x,y,z,yaw,scale,row,asset,matrix};plants.push(p);
        for(const [map,cell] of [[cells,key(x,z,25)],[shrubGrid,`${gx},${gz}`]] as const){let list=map.get(cell);if(!list)map.set(cell,list=[]);list.push(p);}
      }
    }
  }
  const grounding = o.grounding !== 'off' && plants.some(p=>p.asset.entry.role==='tree') ? createTreeContact(o.shade,plants.filter(p=>p.asset.entry.role==='tree').map(p=>({x:p.x,z:p.z,height:p.scale*(p.asset.meta!.variants[p.row]?.height_m??p.asset.meta!.tree_cells.source_tree_height_m)/p.asset.meta!.tree_cells.source_tree_height_m}))) : undefined;
  const stateFor=(p:Plant)=>(p.asset.entry.role==='shrub'?shrubSelection:selection).states.get(p.id);
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
    const cellV=asset.meta!.tree_cells.cell_px[1]/asset.meta!.atlas.size[1];
    material.onBeforeCompile = (sh,r) => {
      previous.call(material,sh,r);
      // The authored cross already carries views 0 and 90 degrees on the
      // matching world-fixed planes. Retexturing it with camera azimuth made
      // branches rotate independently of those planes.
      sh.vertexShader='attribute float forestRow;\n'+sh.vertexShader.replace('#include <uv_vertex>',`#include <uv_vertex>
#ifdef USE_MAP
vMapUv.y += forestRow*${cellV.toFixed(9)};
#endif
#ifdef USE_NORMALMAP
vNormalMapUv.y += forestRow*${cellV.toFixed(9)};
#endif`);
      sh.fragmentShader=sh.fragmentShader.replace('#include <lights_fragment_begin>','#include <lights_fragment_begin>\nreflectedLight.indirectDiffuse += diffuseColor.rgb*0.25;');
    };
    material.customProgramCacheKey=()=>cacheKey+'|forest-fixed-cross-'+asset.entry.id+'-'+mirrorsEnabled;
    if (grounding && asset.entry.role==='tree') patchTreeBase(material);
    if (modelsEnabled) patchBirchBlend(material,true,time);
    if (asset.entry.role==='shrub') patchBirchLod(material,true,-100,o.quality.forestShrubCardR,1);
    const geometry=source.geometry.clone(); extra.push(geometry);
    const row=new THREE.InstancedBufferAttribute(new Float32Array(count),1);
    const blend=new THREE.InstancedBufferAttribute(new Float32Array(count*3),3);
    geometry.setAttribute('birchBlend',blend);
    geometry.setAttribute('forestRow',row);
    const mesh=new THREE.InstancedMesh(geometry,material,count); mesh.frustumCulled=false; mesh.count=0;
    mesh.name='forest-'+asset.entry.id+'-cross'; mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); o.root.add(mesh); extra.push(mesh);
    slots.set(asset.entry.id,{mesh,n:0,row,blend});
  }
  type ModelSlot = { mesh: THREE.InstancedMesh; n: number; blend: THREE.InstancedBufferAttribute };
  const modelSlots = new Map<string,ModelSlot[]>();
  const patched = new Set<THREE.Material>();
  for(const asset of assets) for(let variant=0;variant<asset.models.length*(mirrorsEnabled?2:1);variant++) for(let level=0;level<asset.models[variant%asset.models.length].length;level++) {
    const capacity=asset.entry.role==='shrub'?(level===0?o.quality.forestShrubDetailCount:o.quality.forestShrubSimpleCount):(level===0?o.quality.birchDetailCount:o.quality.birchSimpleCount);
    const group: ModelSlot[]=[];
    for(const part of asset.models[variant%asset.models.length][level]) {
      const material=part.material, leaf=material.alphaTest>0;
      if(!patched.has(material)) {
        patched.add(material);
        if(o.quality.liteTrees && leaf) material.normalMap=null;
        material.alphaToCoverage=leaf&&o.quality.antialias;
        if(leaf) material.onBeforeCompile=sh=>{sh.fragmentShader=sh.fragmentShader.replace('#include <normal_fragment_begin>',THREE.ShaderChunk.normal_fragment_begin.replace('float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;','float faceDirection = 1.0;'));};
        o.shade.patch(material,leaf?3:2,!(grounding&&asset.entry.role==='tree'&&!leaf));
        if(grounding&&asset.entry.role==='tree'&&!leaf)patchTreeBase(material);
        o.foliage.patch(material,leaf?1:2);o.fog.patch(material);patchBirchBlend(material,false,time);
      }
      const geo=variant>=asset.models.length?mirroredForestGeometry(part.geometry):part.geometry.clone();extra.push(geo);
      const blend=new THREE.InstancedBufferAttribute(new Float32Array(capacity*3),3);geo.setAttribute('birchBlend',blend);
      const mesh=new THREE.InstancedMesh(geo,material,capacity);mesh.count=0;mesh.frustumCulled=false;
      mesh.castShadow=asset.entry.role==='tree'&&o.quality.shadows&&o.quality.birchShadows;mesh.receiveShadow=mesh.castShadow;
      mesh.name=`forest-${asset.entry.id}-${variant}-lod${level}`;
      const depth=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,map:leaf?material.map:null,alphaTest:leaf?material.alphaTest:0,side:leaf?THREE.DoubleSide:THREE.FrontSide});
      o.foliage.patch(depth,leaf?1:2);patchBirchBlend(depth,false,time);mesh.customDepthMaterial=depth;extra.push(depth);
      o.root.add(mesh);extra.push(mesh);group.push({mesh,n:0,blend});
    }
    modelSlots.set(`${asset.entry.id}:${variant}:${level}`,group);
  }
  const grass=createForestGrass({assets:grassEnabled?resources.assets:[],roots:rootsEnabled?plants.filter(p=>p.asset.entry.role==='tree'):[],vergeEnabled,fieldVerge:o.fieldVerge,fieldDensity:o.quality.fieldVergeDensity,antialias:o.quality.antialias,root:o.root,radius:o.quality.forestGrassR,density:o.quality.forestGrassDensity,normals:o.quality.groundNormals,heightAt:o.heightAt,roadFree:o.roadFree,weights:o.weights,shade:o.shade,foliage:o.foliage,fog:o.fog});
  let lastX=Infinity,lastZ=Infinity,lastFx=0,lastFz=0,selectionInitialized=false;
  const stats: ForestStats={trees:plants.filter(p=>p.asset.entry.role==='tree').length,cards:0,lod0:0,lod1:0,shrubs:0,shrubLod0:0,shrubLod1:0,grass:0,rootTufts:0,fieldTufts:0,dryTufts:0,fieldSpecies:{},species:resources.assets.map(a=>a.entry.id)};
  const update=(cam:THREE.Vector3,fwd:THREE.Vector3,cardR:number) => {
    grounding?.update(cam.x,cam.z);
    grass.update(cam);stats.grass=grass.stats();stats.rootTufts=grass.rootStats();const field=grass.fieldStats();stats.fieldTufts=field.tufts;stats.dryTufts=field.dry;stats.fieldSpecies=field.species;
    const now=performance.now()/1000;time.value=now;
    const released=[...selection.states.values(),...shrubSelection.states.values()].some(s=>s.to===0&&birchBlend(s,now)===0);
    if (!released && Math.hypot(cam.x-lastX,cam.z-lastZ)<4 && fwd.x*lastFx+fwd.z*lastFz>0.985) return;
    if(Number.isFinite(lastX)&&Math.hypot(cam.x-lastX,cam.z-lastZ)>100){
      selection.states.clear();shrubSelection.states.clear();selectionInitialized=false;
    }
    lastX=cam.x;lastZ=cam.z;lastFx=fwd.x;lastFz=fwd.z;
    for(const s of slots.values()) s.n=0;
    for(const group of modelSlots.values()) for(const s of group)s.n=0;
    const visible: Plant[]=[];
    const r=Math.ceil(cardR/25)+1, cx=Math.floor(cam.x/25),cz=Math.floor(cam.z/25);
    for(let a=-r;a<=r;a++) for(let b=-r;b<=r;b++) {
      const list=cells.get(`${cx+a},${cz+b}`); if(!list)continue;
      const dx=(cx+a+0.5)*25-cam.x,dz=(cz+b+0.5)*25-cam.z,d=Math.hypot(dx,dz),padding=36;
      if(d-padding>cardR || (d>80&&(dx*fwd.x+dz*fwd.z+padding)/d<0.26) || o.fog.pathMin(dx,dz,padding)>o.quality.forestFogFar+10)continue;
      for(const p of list) {
        if((p.x-cam.x)**2+(p.z-cam.z)**2>(p.asset.entry.role==='shrub'?o.quality.forestShrubCardR:cardR)**2) continue;
        visible.push(p);
      }
    }
    // Conservative forward half-space includes the viewport, crown extent,
    // refill travel and fade travel. A fixed encounter representation matters
    // more than filling every model slot while a tree is already on screen.
    const protectedIds=selectionInitialized?new Set(visible.filter(p=>{
      const dx=p.x-cam.x,dz=p.z-cam.z;
      const inView=dx*fwd.x+dz*fwd.z >= -(p.scale+20);
      return inView && (stateFor(p)!==undefined || p.asset.entry.role==='shrub' || dx*dx+dz*dz<65**2);
    }).map(p=>p.id)):undefined;
    if(modelsEnabled) selection.update(visible.filter(p=>p.asset.entry.role==='tree'&&(p.x-cam.x)**2+(p.z-cam.z)**2<100**2).map(p=>{
      const dd=(p.x-cam.x)**2+(p.z-cam.z)**2;
      return {i:p.id,dd,admit:selectionInitialized&&dd>=65**2&&(p.x-cam.x)*fwd.x+(p.z-cam.z)*fwd.z>0};
    }),now,protectedIds);
    if(shrubsEnabled) shrubSelection.update(visible.filter(p=>p.asset.entry.role==='shrub'&&(p.x-cam.x)**2+(p.z-cam.z)**2<40**2).map(p=>({i:p.id,dd:(p.x-cam.x)**2+(p.z-cam.z)**2})),now,protectedIds);
    selectionInitialized=true;
    const seen=new Set(visible.map(p=>p.id));
    for(const i of [...selection.states.keys(),...shrubSelection.states.keys()]) if(!seen.has(i))visible.push(plants[i]);
    for(const p of visible) {
      const state=stateFor(p);
      if(!state||birchBlend(state,now)<1||state.to===0) {
        const s=slots.get(p.asset.entry.id)!;
        s.mesh.setMatrixAt(s.n,p.matrix);s.row.setX(s.n,p.row);
        s.blend.setXYZ(s.n,state?.from??0,state?.to??0,state?.start??0);s.n++;
      }
    }
    stats.lod0=0;stats.lod1=0;stats.shrubLod0=0;stats.shrubLod1=0;
    stats.shrubs=visible.filter(p=>p.asset.entry.role==='shrub').length;
    for(const [i,state] of [...selection.states,...shrubSelection.states]) {
      const p=plants[i],variant=p.row;
      for(const s of modelSlots.get(`${p.asset.entry.id}:${variant}:${state.level}`)??[]) {
        s.mesh.setMatrixAt(s.n,p.matrix);s.blend.setXYZ(s.n,state.from,state.to,state.start);s.n++;
      }
      if(p.asset.entry.role==='shrub'){if(state.level===0)stats.shrubLod0++;else stats.shrubLod1++;}
      else {if(state.level===0)stats.lod0++;else stats.lod1++;}
    }
    for(const group of modelSlots.values())for(const s of group){s.mesh.count=s.n;s.mesh.visible=s.n>0;s.mesh.instanceMatrix.needsUpdate=true;s.blend.needsUpdate=true;}
    stats.cards=0;
    for(const s of slots.values()) {s.mesh.count=s.n;s.mesh.visible=s.n>0;s.mesh.instanceMatrix.needsUpdate=true;s.row.needsUpdate=true;s.blend.needsUpdate=true;stats.cards+=s.n;}
  };
  return { update, grounding, grassRegion:grass.region, stats:()=>({...stats}), dispose:()=>{grounding?.dispose();grass.dispose();for(const group of modelSlots.values())for(const s of group)o.root.remove(s.mesh);for(const s of slots.values())o.root.remove(s.mesh);extra.forEach(x=>x.dispose());resources.dispose();} };
}
