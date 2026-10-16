# gentree LODs — web-optimised (KTX2 / KHR_texture_basisu)

Same geometry as `../out/`, textures are **shared external KTX2** (both LOD glbs reference the same `textures/*.ktx2`).
Source/licence: TurboSquid free model GenTree-103 by LazarusLong, TurboSquid Standard License (free) — user to confirm.

| file | size | notes |
|---|---|---|
| `gentree_lod0.glb` | 275 KB | 4026 tris, geometry identical to out/: true |
| `gentree_lod1.glb` | 93 KB | 1234 tris, geometry identical to out/: true |
| `textures/bark_color.ktx2` | 249 KB | 1024², full mips, ETC1S (BasisLZ) sRGB |
| `textures/bark_normal.ktx2` | 1125 KB | 1024², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| `textures/bark_rough.ktx2` | 839 KB | 1024², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| `textures/foliage_color.ktx2` | 284 KB | 1024², full mips, ETC1S (BasisLZ) sRGB RGBA, alpha-coverage-preserving mips |
| `textures/foliage_normal.ktx2` | 804 KB | 1024², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| **total** | **3.58 MB** | was 11.24 MB (two glbs with embedded PNG/JPG) |

## Quality (decoded KTX2 vs source PNG)
```
{
 "bark_color": {
  "psnr_db": 29.4
 },
 "bark_normal": {
  "angular_err_deg_mean": 3.56,
  "p99": 8.05
 },
 "bark_rough": {
  "psnr_db": 44.5
 },
 "foliage_color": {
  "psnr_db": 29.7,
  "mask_IoU": 0.9856,
  "coverage_mip0_2_4": [
   0.1216,
   0.1214,
   0.1187
  ]
 },
 "foliage_normal": {
  "angular_err_deg_mean": 0.56,
  "p99": 3.51
 }
}
```

## Validation (gltf-transform validate)
```
gentree_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
gentree_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```
Warnings are the expected ones for KTX2 (validator does not support KHR_texture_basisu; `image/ktx2` mime; URI in GLB is allowed).

## three.js load test (headless Chrome/SwiftShader, three r170, GLTFLoader + KTX2Loader) -> `three_check.png`
```
gentree_lod0.glb tris=4026 bark[alphaTest=0 side=0 map=true/1024 normalMap=true/1024 rough=tex] foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.50] bbox -6.46,0.00,-8.07 .. 6.63,16.81,6.30
gentree_lod1.glb tris=1234 bark[alphaTest=0 side=0 map=true/1024 normalMap=true/1024 rough=tex] foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.50] bbox -6.54,0.00,-8.52 .. 6.47,16.76,6.31
OK
```

## Loader notes (same as birch)
GLTFLoader + `KTX2Loader().setTranscoderPath(BASE_URL + 'basis/').detectSupport(renderer)`; extension is **required** (no PNG fallback);
keep `textures/` next to the glbs; load both LODs through one loader; foliage = alphaTest 0.5, DoubleSide; bark opaque; Y-up, metres, origin at trunk base.
