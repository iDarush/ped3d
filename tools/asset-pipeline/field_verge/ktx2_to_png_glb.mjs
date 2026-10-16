// node ktx2_to_png_glb.mjs <out.glb> <in_ktx2.glb>   -> same glb with KTX2 textures decoded to embedded PNG (for Blender previews)
import { NodeIO } from '@gltf-transform/core'; import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { execFileSync } from 'node:child_process';
const [OUT, IN] = process.argv.slice(2); const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const json = JSON.parse((() => { const b = fs.readFileSync(IN); const n = b.readUInt32LE(12); return b.subarray(20, 20 + n).toString(); })());
const doc = await io.read(IN); const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'k2p'));
const uris = json.images.map(i => i.uri);
doc.getRoot().listTextures().forEach((t, i) => {
  const src = path.join(path.dirname(IN), uris[i]); const png = path.join(tmp, i + '.png');
  execFileSync('ktx', ['extract', '--transcode', 'rgba8', src, png]);
  t.setImage(new Uint8Array(fs.readFileSync(png))).setMimeType('image/png').setURI('');
});
for (const e of doc.getRoot().listExtensionsUsed()) if (e.extensionName === 'KHR_texture_basisu') e.dispose();
await io.write(OUT, doc); console.log(OUT, uris.join(','));
