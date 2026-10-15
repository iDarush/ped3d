// Stage the user's local birch assets and the Three.js Basis runtime for Vite.
// Generated copies are ignored by Git; raw source models stay in models/.
import { existsSync, mkdirSync, copyFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const source = resolve(root, "models/birch/ktx2");
const files = ["birch_lod0.glb", "birch_lod1.glb", ...["bark_color", "bark_normal", "foliage_color", "foliage_normal"].map((n) => `textures/${n}.ktx2`)];
if (!existsSync(source)) {
  console.info("Local birch assets not present; procedural trees remain available.");
} else {
  const missing = files.filter((f) => !existsSync(resolve(source, f)));
  if (missing.length) throw new Error(`Incomplete local birch: ${missing.join(", ")}`);
  const copy = (from, to) => { mkdirSync(dirname(to), { recursive: true }); copyFileSync(from, to); };
  for (const file of files) copy(resolve(source, file), resolve(root, "public/scene-assets/birch", file));
  for (const file of ["basis_transcoder.js", "basis_transcoder.wasm"]) {
    copy(resolve(root, "node_modules/three/examples/jsm/libs/basis", file), resolve(root, "public/basis", file));
  }
  copy(resolve(root, "node_modules/three/LICENSE"), resolve(root, "public/basis/LICENSE.three.txt"));
  console.info("Local birch ready: shared KTX2 textures, both LODs, Basis runtime.");
}
