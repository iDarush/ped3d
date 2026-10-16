import { expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, dirname } from 'node:path';
import { prepareLocalModels } from '../../tools/prepare-local-models.mjs';

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
