// Stage local personal-project assets; offline asset-pipeline scripts are not run.
import { existsSync, mkdirSync, copyFileSync, readdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
export const SPECIES = [
  { id: 'birch', role: 'tree', models: ['birch'], lods: [0, 1], strict: true },
  { id: 'gentree', role: 'tree', models: ['gentree'], lods: [0, 1] },
  { id: 'alder', role: 'tree', models: ['alder_a', 'alder_b'], lods: [0, 1] },
  { id: 'maple', role: 'tree', models: ['maple_a', 'maple_b'], lods: [0, 1] },
  { id: 'abelia', role: 'shrub', models: ['abelia_a', 'abelia_b'], lods: [0, 1] },
  { id: 'cistus', role: 'shrub', models: ['cistus_a', 'cistus_b'], lods: [0, 1] },
  { id: 'lolium', role: 'grass', models: ['lolium_a', 'lolium_b'], lods: [0] },
  { id: 'setaria', role: 'grass', models: ['setaria_a', 'setaria_b'], lods: [0] },
];
const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); };
const textures = dir => existsSync(dir) ? readdirSync(dir).filter(f => f.endsWith('.ktx2')).sort().map(f => `textures/${f}`) : [];
function checkGlb(file, source) {
  const buffer = readFileSync(file);
  const json = JSON.parse(buffer.subarray(20, 20 + buffer.readUInt32LE(12)).toString());
  for (const image of json.images ?? []) {
    if (!image.uri || image.uri.startsWith('data:')) continue;
    if (!image.uri.startsWith('textures/') || image.uri.includes('..') || !existsSync(resolve(source, image.uri))) throw new Error(`Missing or unsafe texture ${image.uri} in ${basename(file)}`);
  }
}
export function prepareLocalModels(root) {
  const publicAssets = resolve(root, 'public/scene-assets');
  const manifest = { version: 1, species: [] };
  for (const spec of SPECIES) {
    const source = resolve(root, 'models', spec.id, 'ktx2');
    const target = resolve(publicAssets, spec.id);
    // Verify every recursive deletion stays in a fixed generated species folder.
    if (dirname(target) !== publicAssets || !SPECIES.some(s => s.id === basename(target))) throw new Error('Unsafe output path');
    let entry;
    try {
      if (existsSync(source)) {
        const models = spec.models.flatMap(model => spec.lods.map(lod => `${model}_lod${lod}.glb`));
        const files = [...models, ...textures(resolve(source, 'textures'))];
        for (const file of files) if (!existsSync(resolve(source, file))) throw new Error(`Missing ${file}`);
        for (const model of models) checkGlb(resolve(source, model), source);
        entry = { id: spec.id, role: spec.role, models, files, cards: null };
        const cardsSource = resolve(root, 'models', spec.id, 'cards');
        if (existsSync(cardsSource)) {
          try {
            const mesh = `${spec.id}_card_cross.glb`, metadata = `${spec.id}_cards.json`;
            const cardFiles = [mesh, metadata, ...textures(resolve(cardsSource, 'textures'))];
            for (const file of cardFiles) if (!existsSync(resolve(cardsSource, file))) throw new Error(`Missing ${file}`);
            checkGlb(resolve(cardsSource, mesh), cardsSource);
            const atlas = JSON.parse(readFileSync(resolve(cardsSource, metadata), 'utf8')).atlas;
            for (const file of [atlas.color, atlas.normal]) if (!cardFiles.includes(file)) throw new Error(`Missing atlas ${file}`);
            entry.cards = { mesh, metadata, files: cardFiles };
          } catch (error) { console.warn(`${spec.id} cards skipped: ${error.message}`); }
        }
      }
    } catch (error) {
      if (spec.strict) throw new Error(`Incomplete local ${spec.id}: ${error.message}`);
      entry = undefined;
      console.warn(`${spec.id} skipped: ${error.message}`);
    }
    if (existsSync(target)) rmSync(target, { recursive: true });
    if (!entry) continue;
    for (const file of entry.files) copy(resolve(source, file), resolve(target, file));
    if (entry.cards) for (const file of entry.cards.files) copy(resolve(root, 'models', spec.id, 'cards', file), resolve(target, 'cards', file));
    manifest.species.push(entry);
  }
  mkdirSync(publicAssets, { recursive: true });
  writeFileSync(resolve(publicAssets, 'forest-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  if (manifest.species.length) {
    for (const file of ['basis_transcoder.js', 'basis_transcoder.wasm']) copy(resolve(root, 'node_modules/three/examples/jsm/libs/basis', file), resolve(root, 'public/basis', file));
    copy(resolve(root, 'node_modules/three/LICENSE'), resolve(root, 'public/basis/LICENSE.three.txt'));
  }
  console.info(`Local forest ready: ${manifest.species.map(s => s.id).join(', ') || 'no optional assets'}.`);
  return manifest;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) prepareLocalModels(fileURLToPath(new URL('../', import.meta.url)));
