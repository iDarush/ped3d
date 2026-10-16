# abelia LODs — web-optimised (KTX2 / KHR_texture_basisu)

Same geometry as `../out/`, textures are **shared external KTX2** (both LOD glbs reference the same `textures/*.ktx2`).
Source/licence: Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files — user to confirm.

| file | size | notes |
|---|---|---|
| `abelia_a_lod0.glb` | 113 KB | 1387 tris, geometry identical to out/: true |
| `abelia_a_lod1.glb` | 49 KB | 520 tris, geometry identical to out/: true |
| `abelia_b_lod0.glb` | 117 KB | 1382 tris, geometry identical to out/: true |
| `abelia_b_lod1.glb` | 49 KB | 520 tris, geometry identical to out/: true |
| `textures/bark_color.ktx2` | 88 KB | 512², full mips, ETC1S (BasisLZ) sRGB |
| `textures/bark_normal.ktx2` | 254 KB | 512², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| `textures/bark_rough.ktx2` | 189 KB | 512², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| `textures/foliage_color.ktx2` | 113 KB | 512², full mips, ETC1S (BasisLZ) sRGB RGBA, alpha-coverage-preserving mips |
| `textures/foliage_normal.ktx2` | 288 KB | 512², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| **total** | **1.23 MB** | was 6.08 MB (4 glbs with embedded PNG/JPG) |

## Quality (decoded KTX2 vs source PNG)
```
{
 "bark_color": {
  "psnr_db": 34.0
 },
 "bark_normal": {
  "angular_err_deg_mean": 1.07,
  "p99": 3.31
 },
 "bark_rough": {
  "psnr_db": 44.7
 },
 "foliage_color": {
  "psnr_db": 29.1,
  "mask_IoU": 0.988,
  "coverage_mip0_2_4": [
   0.2791,
   0.2773,
   0.2969
  ]
 },
 "foliage_normal": {
  "angular_err_deg_mean": 1.89,
  "p99": 10.66
 }
}
```

## Validation (gltf-transform validate)
```
abelia_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
abelia_a_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
abelia_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
abelia_b_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```
Warnings are the expected ones for KTX2 (validator does not support KHR_texture_basisu; `image/ktx2` mime; URI in GLB is allowed).

## three.js load test (headless Chrome/SwiftShader, three r170, GLTFLoader + KTX2Loader) -> `three_check.png`
```
abelia_a_lod0.glb tris=1387 bark[alphaTest=0 side=0 map=true/512 normalMap=true/512 rough=tex] foliage[alphaTest=0.5 side=2 map=true/512 normalMap=true/512 rough=0.65] bbox -0.70,-0.00,-0.68 .. 0.70,1.44,0.63
abelia_a_lod1.glb tris=520 bark[alphaTest=0 side=0 map=true/512 normalMap=true/512 rough=tex] foliage[alphaTest=0.5 side=2 map=true/512 normalMap=true/512 rough=0.65] bbox -0.71,-0.00,-0.68 .. 0.68,1.44,0.63
abelia_b_lod0.glb tris=1382 bark[alphaTest=0 side=0 map=true/512 normalMap=true/512 rough=tex] foliage[alphaTest=0.5 side=2 map=true/512 normalMap=true/512 rough=0.65] bbox -0.74,-0.00,-0.74 .. 0.77,1.19,0.76
abelia_b_lod1.glb tris=520 bark[alphaTest=0 side=0 map=true/512 normalMap=true/512 rough=tex] foliage[alphaTest=0.5 side=2 map=true/512 normalMap=true/512 rough=0.65] bbox -0.74,-0.00,-0.77 .. 0.77,1.23,0.77
OK
```

## Loader notes (same as birch)
GLTFLoader + `KTX2Loader().setTranscoderPath(BASE_URL + 'basis/').detectSupport(renderer)`; extension is **required** (no PNG fallback);
keep `textures/` next to the glbs; load all glbs through one loader; foliage = alphaTest 0.5, DoubleSide; bark opaque; Y-up, metres, origin at trunk/clump base.
