import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { prepareLocalModels, prepareGroundAssets, GROUND_FILES } from '../../tools/prepare-local-models.mjs';

it('stages independent species, removes stale optional assets and preserves unrelated output', () => {
  const root = mkdtempSync(resolve(tmpdir(), 'ride3d-stage-'));
  const write = (p, data) => { const target = resolve(root, p); mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, data); };
  const glb = () => { const json = Buffer.from(JSON.stringify({ images: [{ uri: 'textures/foliage_color.ktx2' }] })); const b = Buffer.alloc(20 + json.length); b.writeUInt32LE(json.length, 12); json.copy(b, 20); return b; };
  try {
    write('public/scene-assets/maple/stale.glb', 'old');
    write('public/scene-assets/terrain/keep.txt', 'keep');
    for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) write('node_modules/three/examples/jsm/libs/basis/' + file, 'test');
    write('node_modules/three/LICENSE', 'test');
    for (const variant of ['lolium_a', 'lolium_b']) write(`models/lolium/ktx2/${variant}_lod0.glb`, glb());
    write('models/lolium/ktx2/textures/foliage_color.ktx2', 'test');
    // Incomplete optional tree cannot leak partial files or a manifest entry.
    write('models/alder/ktx2/alder_a_lod0.glb', glb());
    const manifest = prepareLocalModels(root);
    expect(manifest.species.map(s => s.id)).toEqual(['lolium']);
    expect(existsSync(resolve(root, 'public/scene-assets/maple/stale.glb'))).toBe(false);
    expect(readFileSync(resolve(root, 'public/scene-assets/terrain/keep.txt'), 'utf8')).toBe('keep');
    expect(existsSync(resolve(root, 'public/scene-assets/lolium/textures/foliage_color.ktx2'))).toBe(true);
    write('models/birch/ktx2/birch_lod0.glb', glb());
    expect(() => prepareLocalModels(root)).toThrow('Incomplete local birch');
  } finally {
    if (!root.startsWith(resolve(tmpdir(), 'ride3d-stage-'))) throw new Error('Unsafe test directory');
    rmSync(root, { recursive: true });
  }
});

it('stages the fixed ground list and merges credits without removing shared assets',()=>{
  const root=mkdtempSync(resolve(tmpdir(),'ride3d-ground-'));
  try {
    const textures=resolve(root,'models/ground/textures'),target=resolve(root,'public/scene-assets');
    mkdirSync(textures,{recursive:true});mkdirSync(target,{recursive:true});
    for(const file of GROUND_FILES)writeFileSync(resolve(textures,file),file);
    writeFileSync(resolve(textures,'unrelated.jpg'),'ignored');
    writeFileSync(resolve(target,'grass.jpg'),'keep');
    writeFileSync(resolve(target,'sources.json'),JSON.stringify({ambientcg:{grass:'existing'},texturecan:{bark:{id:'keep'}}}));
    writeFileSync(resolve(root,'models/ground/sources_addition.json'),JSON.stringify({texturecan:{forest_leaves:{id:'ground_0028'}}}));
    prepareGroundAssets(root);prepareGroundAssets(root);
    expect(readFileSync(resolve(target,'grass.jpg'),'utf8')).toBe('keep');
    expect(existsSync(resolve(target,'unrelated.jpg'))).toBe(false);
    expect(JSON.parse(readFileSync(resolve(target,'sources.json'),'utf8'))).toEqual({ambientcg:{grass:'existing'},texturecan:{bark:{id:'keep'},forest_leaves:{id:'ground_0028'}}});
    expect(readFileSync(resolve(target,'forest_leaves_h.jpg'),'utf8')).toBe('forest_leaves_h.jpg');
  } finally {
    if(!root.startsWith(resolve(tmpdir(),'ride3d-ground-')))throw new Error('Unsafe test directory');
    rmSync(root,{recursive:true});
  }
});

it('keeps dry grass as separate color variants in the same texture directory',()=>{
  const root=mkdtempSync(resolve(tmpdir(),'ride3d-dry-'));
  const write=(file,data)=>{const path=resolve(root,file);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,data);};
  const glb=color=>{const json=Buffer.from(JSON.stringify({images:[{uri:`textures/${color}.ktx2`},{uri:'textures/foliage_normal.ktx2'}]}));const b=Buffer.alloc(20+json.length);b.writeUInt32LE(json.length,12);json.copy(b,20);return b;};
  try{
    for(const file of ['basis_transcoder.js','basis_transcoder.wasm'])write(`node_modules/three/examples/jsm/libs/basis/${file}`,'test');
    write('node_modules/three/LICENSE','test');
    for(const id of ['setaria','digitaria']){
      for(const name of ['foliage_color','foliage_color_dry','foliage_normal'])write(`models/${id}/ktx2/textures/${name}.ktx2`,'test');
      for(const variant of ['a','b']){
        write(`models/${id}/ktx2/${id}_${variant}_lod0.glb`,glb('foliage_color'));
        write(`models/${id}/ktx2/${id}_${variant}_lod0_dry.glb`,glb('foliage_color_dry'));
      }
    }
    const manifest=prepareLocalModels(root),s=manifest.species.find(s=>s.id==='setaria'),d=manifest.species.find(s=>s.id==='digitaria');
    expect(s.models).toEqual(['setaria_a_lod0.glb','setaria_b_lod0.glb']);
    expect(s.dryModels).toEqual(['setaria_a_lod0_dry.glb','setaria_b_lod0_dry.glb']);
    expect(s.files.filter(f=>f.endsWith('foliage_normal.ktx2'))).toHaveLength(1);
    expect(d.dryOnly).toBe(true);expect(d.fieldOnly).toBe(true);
    expect(d.models.every(f=>f.endsWith('_dry.glb'))).toBe(true);
    expect(existsSync(resolve(root,'public/scene-assets/setaria/setaria_a_lod0_dry.glb'))).toBe(true);
  }finally{
    if(!root.startsWith(resolve(tmpdir(),'ride3d-dry-')))throw new Error('Unsafe test directory');
    rmSync(root,{recursive:true});
  }
});
