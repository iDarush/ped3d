import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';

export interface ForestEntry { id: string; role: 'tree' | 'shrub' | 'grass'; models: string[]; dryModels?: string[]; dryOnly?: boolean; fieldOnly?: boolean; cards: { mesh: string; metadata: string } | null }
export interface CardMetadata { atlas: { size: [number, number] }; tree_cells: { cell_px: [number, number]; source_tree_height_m: number }; variants: { row: number; mirrored?: boolean; height_m?: number }[] }
export type AssetMesh = THREE.Mesh<THREE.BufferGeometry, THREE.MeshStandardMaterial>;
export interface ForestAsset { entry: ForestEntry; meta?: CardMetadata; card?: AssetMesh; models: AssetMesh[][][]; dryModels?: AssetMesh[][] }

export async function loadForestAssets(renderer: THREE.WebGLRenderer, roles: string[], models: boolean, fieldVerge = false) {
  const base = import.meta.env.BASE_URL + 'scene-assets/';
  const response = await fetch(base + 'forest-manifest.json');
  if (!response.ok) throw new Error('Forest manifest unavailable; run npm run build or npm run dev');
  const manifest = await response.json() as { version: number; species: ForestEntry[] };
  if (manifest.version !== 1) throw new Error('Unsupported forest manifest');
  const entries=manifest.species.filter(e=>roles.includes(e.role)&&(!e.fieldOnly||fieldVerge));
  if (!entries.length) return { assets: [] as ForestAsset[], dispose:()=>{} };
  const ktx = new KTX2Loader().setTranscoderPath(import.meta.env.BASE_URL + 'basis/').detectSupport(renderer);
  const loader = new GLTFLoader().setKTX2Loader(ktx);
  const geometries = new Set<THREE.BufferGeometry>(), materials = new Set<THREE.Material>(), textures = new Set<THREE.Texture>();
  const dispose = () => { geometries.forEach(g => g.dispose()); materials.forEach(m => m.dispose()); textures.forEach(t => t.dispose()); };
  const load = async (url: string, scale: number) => {
    const gltf = await loader.loadAsync(url); gltf.scene.updateMatrixWorld(true);
    const parts: AssetMesh[] = [];
    gltf.scene.traverse(o => {
      if (!(o instanceof THREE.Mesh)) return;
      if (Array.isArray(o.material) || !(o.material instanceof THREE.MeshStandardMaterial)) throw new Error('Expected one PBR material per primitive');
      const mesh = o as AssetMesh;
      mesh.geometry.applyMatrix4(mesh.matrixWorld).scale(scale, scale, scale);
      geometries.add(mesh.geometry); materials.add(mesh.material);
      Object.values(mesh.material).forEach(v => { if (v instanceof THREE.Texture) textures.add(v); });
      parts.push(mesh);
    });
    return parts;
  };
  const assets: ForestAsset[] = [];
  try {
    for (const entry of entries) {
      try {
        const asset: ForestAsset = { entry, models: [] };
        if (entry.cards) {
          const res = await fetch(`${base}${entry.id}/cards/${entry.cards.metadata}`);
          if (!res.ok) throw new Error('Missing card metadata');
          asset.meta = await res.json() as CardMetadata;
          asset.card = (await load(`${base}${entry.id}/cards/${entry.cards.mesh}`, 1))[0];
        }
        if (models || entry.role === 'grass') {
          const names = [...new Set(entry.models.map(n => n.replace(/_lod\d+(?:_dry)?\.glb$/, '')))];
          for (const name of names) {
            const levels: AssetMesh[][] = [];
            for (const file of entry.models.filter(f => f.startsWith(name + '_lod')).sort()) {
              const parts = await load(`${base}${entry.id}/${file}`, 1 / (asset.meta?.tree_cells.source_tree_height_m ?? 1));
              // Share materials and textures between both LODs and variants.
              const shared = asset.models[0]?.[0] ?? levels[0];
              if (shared) for (const part of parts) part.material = shared.find(p => (p.material.alphaTest > 0) === (part.material.alphaTest > 0))?.material ?? part.material;
              levels.push(parts);
            }
            asset.models.push(levels);
          }
          if(fieldVerge&&entry.role==='grass'&&entry.dryModels?.length){
            asset.dryModels=[];
            for(const file of entry.dryModels){
              const parts=await load(`${base}${entry.id}/${file}`,1);
              for(const part of parts){
                const shared=asset.dryModels[0]?.find(p=>(p.material.alphaTest>0)===(part.material.alphaTest>0));
                if(shared)part.material=shared.material;
                else {
                  // Dry GLBs change color only. Reuse the existing normal GPU
                  // texture, not another copy of the same KTX2 image.
                  const green=asset.models[0]?.[0]?.find(p=>(p.material.alphaTest>0)===(part.material.alphaTest>0));
                  if(green)part.material.normalMap=green.material.normalMap;
                }
              }
              asset.dryModels.push(parts);
            }
          }
        }
        if (asset.card || asset.models.length) assets.push(asset);
      } catch (error) { console.warn(`Forest species ${entry.id} unavailable`, error); }
    }
    return { assets, dispose };
  } catch (error) { dispose(); throw error; }
  finally { ktx.dispose(); }
}
