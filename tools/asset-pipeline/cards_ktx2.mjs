// cards/_glb_png/*.glb (embedded PNG) -> cards/*.glb referencing shared cards/textures/*.ktx2 (KHR_texture_basisu, external URIs)
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS, KHRTextureBasisu } from '@gltf-transform/extensions';
import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..', 'cards');
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
for (const f of fs.readdirSync(path.join(ROOT, '_glb_png')).filter(f => f.endsWith('.glb'))) {
  const doc = await io.read(path.join(ROOT, '_glb_png', f));
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  for (const tex of doc.getRoot().listTextures()) {
    const name = tex.getName(); const ktx = path.join(ROOT, 'textures', `${name}.ktx2`);
    tex.setImage(new Uint8Array(fs.readFileSync(ktx))).setMimeType('image/ktx2').setURI(`textures/${name}.ktx2`);
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'c2')); const base = path.parse(f).name;
  await io.write(path.join(tmp, base + '.gltf'), doc);
  const json = JSON.parse(fs.readFileSync(path.join(tmp, base + '.gltf'), 'utf8'));
  const bin = fs.readFileSync(path.join(tmp, json.buffers[0].uri)); delete json.buffers[0].uri; json.buffers[0].byteLength = bin.length;
  const pad = (b, c) => Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4, c)]);
  const jb = pad(Buffer.from(JSON.stringify(json)), 0x20), bb = pad(bin, 0);
  const hdr = Buffer.alloc(12); hdr.writeUInt32LE(0x46546C67, 0); hdr.writeUInt32LE(2, 4); hdr.writeUInt32LE(28 + jb.length + bb.length, 8);
  const ch = (len, type) => { const b = Buffer.alloc(8); b.writeUInt32LE(len, 0); b.writeUInt32LE(type, 4); return b; };
  fs.writeFileSync(path.join(ROOT, f), Buffer.concat([hdr, ch(jb.length, 0x4E4F534A), jb, ch(bb.length, 0x004E4942), bb]));
  fs.rmSync(tmp, { recursive: true }); console.log(f, fs.statSync(path.join(ROOT, f)).size, json.images.map(i => i.uri).join(', '));
}
