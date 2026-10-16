// Headless three.js load test (GLTFLoader + KTX2Loader) of out_ktx2/*.glb; writes out_ktx2/three_check.png + prints log
import puppeteer from 'puppeteer-core'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.wasm': 'application/wasm', '.glb': 'model/gltf-binary', '.ktx2': 'image/ktx2' };
const srv = http.createServer((q, r) => { const p = path.join(ROOT, decodeURIComponent(q.url.split('?')[0]));
  if (!fs.existsSync(p)) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'Content-Type': types[path.extname(p)] || 'application/octet-stream' }); fs.createReadStream(p).pipe(r); }).listen(0);
const port = srv.address().port;
const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: true, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });
const pg = await b.newPage(); pg.on('pageerror', e => console.log('PAGEERROR', e.message));
await pg.goto(`http://localhost:${port}/tools/cards_check.html`);
await pg.waitForFunction(() => /OK|ERROR/.test(document.getElementById('log').textContent), { timeout: 90000 });
console.log(await pg.$eval('#log', e => e.textContent));
const src = await pg.$eval('#shot', e => e.src);
if (src.startsWith('data:image/png')) fs.writeFileSync(path.join(ROOT, 'cards', 'preview_threejs_cards.png'), Buffer.from(src.split(',')[1], 'base64'));
await b.close(); srv.close();
