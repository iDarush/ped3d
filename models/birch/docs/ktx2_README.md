# Birch LODs — web-optimised (KTX2 / KHR_texture_basisu)

Same geometry as `../out/` (LOD0 3652 tris, LOD1 1349 tris, 2 materials), but the textures are **shared external KTX2 files**.
Both glbs point at the same 4 files in `textures/`, so the browser downloads them only once.

## Files
| file | size | notes |
|---|---|---|
| `birch_lod0.glb` | 157 KB | geometry only, references `textures/*.ktx2` |
| `birch_lod1.glb` | 79 KB | geometry only, references `textures/*.ktx2` |
| `textures/bark_color.ktx2` | 241 KB | 1024², 11 mips, ETC1S (BasisLZ), sRGB, qlevel 255 |
| `textures/bark_normal.ktx2` | 547 KB | 1024², 11 mips, UASTC q3 + RDO (λ 0.5) + Zstd 18, linear |
| `textures/foliage_color.ktx2` | 248 KB | 1024², 11 mips, ETC1S (BasisLZ), sRGB, RGBA (alpha = mask) |
| `textures/foliage_normal.ktx2` | 314 KB | 1024², 11 mips, UASTC q3 + RDO (λ 0.5) + Zstd 18, linear |
| **total** | **1.55 MB** | was 5.78 MB (two glbs with embedded PNG/JPG copies) |

GPU memory after transcoding: ~1.4 MB per 1024² texture with mips (BC7/ASTC/ETC2 8 bpp), ~5.6 MB for all 4. Uncompressed RGBA would be ~22 MB.

## Quality checks (decoded KTX2 vs source PNG)
```
{
 "foliage_mask_IoU": 0.9818,
 "foliage_mask_mismatch_pct": 1.84,
 "foliage_rgb_psnr_db_opaque": 30.0,
 "foliage_alpha_coverage_mip0_mip2_mip4": [
  0.1074,
  0.1016,
  0.0876
 ],
 "bark_color_psnr_db": 35.3,
 "bark_normal_angular_err_deg_mean_p99": [
  0.86,
  2.84
 ],
 "foliage_normal_angular_err_deg_mean_p99": [
  2.04,
  8.33
 ]
}
```
- The foliage alpha mask (threshold 0.5) differs from the source on ~1.84% of opaque texels, all on leaf edges by a single texel. Thin twigs survive. UASTC for foliage color was tested (IoU 0.989 vs 0.982, RGB 34 vs 30 dB) and rejected: 3× larger (740 KB) for no visible difference. Re-encode with `./ktx2_encode.sh uastc` if needed.
- Mip-chain alpha coverage thins with distance (mip4 ≈ 18% less coverage than mip0). Turn on `material.alphaToCoverage = true` (with MSAA) for distant trees if they look too sparse.
- Normal maps: mean angular error 0.9° (bark) / 2.0° (foliage, opaque texels).

## Loading in three.js (notes for Codex)
```js
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
const ktx2 = new KTX2Loader()
  .setTranscoderPath('/basis/')   // copy node_modules/three/examples/jsm/libs/basis/{basis_transcoder.js,basis_transcoder.wasm} there
  .detectSupport(renderer);       // REQUIRED: picks BC7/ASTC/ETC2 for the actual GPU (Iris Xe → BC7)
const gltf = await new GLTFLoader().setKTX2Loader(ktx2).loadAsync('/assets/birch/birch_lod0.glb');
```
- Keep `textures/` next to the glbs: image URIs are relative (`textures/foliage_color.ktx2`).
- The extension is marked **required**, so GLTFLoader throws without `setKTX2Loader`. There is no PNG fallback.
- Load LOD0 and LOD1 through **one** KTX2Loader/GLTFLoader so textures are fetched once (browser cache) and the transcoder worker pool is shared. To share GPU textures too, reuse the LOD0 materials on LOD1 meshes (`lod1Mesh.material = lod0Mesh.material`), since the materials are identical.
- Foliage material arrives as `alphaTest = 0.5`, `side = DoubleSide`, `transparent = false`. Bark is opaque, single-sided.
- Colour spaces come out right automatically (map = sRGB, normalMap = linear).
- Call `ktx2.dispose()` when done loading assets (terminates workers).
- Y-up, metres, origin at trunk base.

## Validation
`gltf-transform validate`: **0 errors**. The warnings are all expected: the Khronos validator does not support `KHR_texture_basisu`, so it reports `image/ktx2` as an unknown mime type, unused images, and `URI_GLB` (an external image URI inside a GLB is allowed by the spec).
```
== birch_lod0.glb
info: No errors found.
VALUE_NOT_IN_LIST (sev 1) /images/0/mimeType
VALUE_NOT_IN_LIST (sev 1) /images/1/mimeType
VALUE_NOT_IN_LIST (sev 1) /images/2/mimeType
VALUE_NOT_IN_LIST (sev 1) /images/3/mimeType
IMAGE_UNRECOGNIZED_FORMAT (sev 1) /images/0
IMAGE_UNRECOGNIZED_FORMAT (sev 1) /images/1
IMAGE_UNRECOGNIZED_FORMAT (sev 1) /images/2
IMAGE_UNRECOGNIZED_FORMAT (sev 1) /images/3
UNSUPPORTED_EXTENSION (sev 2) /extensionsUsed/0
URI_GLB (sev 2) /images/0/uri
URI_GLB (sev 2) /images/1/uri
URI_GLB (sev 2) /images/2/uri
URI_GLB (sev 2) /images/3/uri
UNUSED_OBJECT (sev 2) /images/0
UNUSED_OBJECT (sev 2) /images/1
UNUSED_OBJECT (sev 2) /images/2
UNUSED_OBJECT (sev 2) /images/3
== birch_lod1.glb
info: No errors found.
VALUE_NOT_IN_LIST (sev 1) /images/0/mimeType
VALUE_NOT_IN_LIST (sev 1) /images/1/mimeType
VALUE_NOT_IN_LIST (sev 1) /images/2/mimeType
VALUE_NOT_IN_LIST (sev 1) /images/3/mimeType
IMAGE_UNRECOGNIZED_FORMAT (sev 1) /images/0
IMAGE_UNRECOGNIZED_FORMAT (sev 1) /images/1
IMAGE_UNRECOGNIZED_FORMAT (sev 1) /images/2
IMAGE_UNRECOGNIZED_FORMAT (sev 1) /images/3
UNSUPPORTED_EXTENSION (sev 2) /extensionsUsed/0
URI_GLB (sev 2) /images/0/uri
URI_GLB (sev 2) /images/1/uri
URI_GLB (sev 2) /images/2/uri
URI_GLB (sev 2) /images/3/uri
UNUSED_OBJECT (sev 2) /images/0
UNUSED_OBJECT (sev 2) /images/1
UNUSED_OBJECT (sev 2) /images/2
UNUSED_OBJECT (sev 2) /images/3
```

Headless three.js r170 load test (Chrome/SwiftShader, `tools/ktx2_check.mjs`) → `three_check.png`:
```
lod0 birch_lod0_bark mat=bark alphaTest=0 transparent=false side=0 map:compressed fmt=36492 1024x1024 mips=11 cs=srgb | normalMap:compressed fmt=37808 1024x1024 mips=11 cs=srgb-linear
lod0 birch_lod0_foliage mat=foliage alphaTest=0.5 transparent=false side=2 map:compressed fmt=36492 1024x1024 mips=11 cs=srgb | normalMap:compressed fmt=37808 1024x1024 mips=11 cs=srgb-linear
lod0 tris=3652 bbox min -1.23,0.00,-1.34 max 0.93,4.94,1.28
lod1 birch_lod1_bark mat=bark alphaTest=0 transparent=false side=0 map:compressed fmt=36492 1024x1024 mips=11 cs=srgb | normalMap:compressed fmt=37808 1024x1024 mips=11 cs=srgb-linear
lod1 birch_lod1_foliage mat=foliage alphaTest=0.5 transparent=false side=2 map:compressed fmt=36492 1024x1024 mips=11 cs=srgb | normalMap:compressed fmt=37808 1024x1024 mips=11 cs=srgb-linear
lod1 tris=1349 bbox min -1.28,0.00,-1.39 max 0.99,5.00,1.33
OK
```

## Rebuild
`../build.sh` (full pipeline incl. this step) or `../build_ktx2.sh` (KTX2 step only, from existing `../out/`).
