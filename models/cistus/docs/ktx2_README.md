# cistus LODs — web-optimised (KTX2 / KHR_texture_basisu)

Same geometry as `../out/`, textures are **shared external KTX2** (both LOD glbs reference the same `textures/*.ktx2`).
Source/licence: Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files — user to confirm.

| file | size | notes |
|---|---|---|
| `cistus_a_lod0.glb` | 116 KB | 1449 tris, geometry identical to out/: true |
| `cistus_a_lod1.glb` | 49 KB | 522 tris, geometry identical to out/: true |
| `cistus_b_lod0.glb` | 114 KB | 1360 tris, geometry identical to out/: true |
| `cistus_b_lod1.glb` | 51 KB | 521 tris, geometry identical to out/: true |
| `textures/bark_color.ktx2` | 85 KB | 512², full mips, ETC1S (BasisLZ) sRGB |
| `textures/bark_normal.ktx2` | 254 KB | 512², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| `textures/foliage_color.ktx2` | 107 KB | 512², full mips, ETC1S (BasisLZ) sRGB RGBA, alpha-coverage-preserving mips |
| `textures/foliage_normal.ktx2` | 286 KB | 512², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| **total** | **1.04 MB** | was 5.19 MB (4 glbs with embedded PNG/JPG) |

## Quality (decoded KTX2 vs source PNG)
```
{
 "bark_color": {
  "psnr_db": 34.2
 },
 "bark_normal": {
  "angular_err_deg_mean": 1.07,
  "p99": 3.39
 },
 "foliage_color": {
  "psnr_db": 34.1,
  "mask_IoU": 0.9907,
  "coverage_mip0_2_4": [
   0.2794,
   0.2788,
   0.251
  ]
 },
 "foliage_normal": {
  "angular_err_deg_mean": 2.3,
  "p99": 12.91
 }
}
```

## Validation (gltf-transform validate)
```
cistus_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
cistus_a_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
cistus_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
cistus_b_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```
Warnings are the expected ones for KTX2 (validator does not support KHR_texture_basisu; `image/ktx2` mime; URI in GLB is allowed).

## three.js load test (headless Chrome/SwiftShader, three r170, GLTFLoader + KTX2Loader) -> `three_check.png`
```
cistus_a_lod0.glb tris=1449 bark[alphaTest=0 side=0 map=true/512 normalMap=true/512 rough=0.82] foliage[alphaTest=0.5 side=2 map=true/512 normalMap=true/512 rough=0.71] bbox -0.79,-0.00,-0.85 .. 0.77,1.03,0.68
cistus_a_lod1.glb tris=522 bark[alphaTest=0 side=0 map=true/512 normalMap=true/512 rough=0.82] foliage[alphaTest=0.5 side=2 map=true/512 normalMap=true/512 rough=0.71] bbox -0.79,-0.00,-0.84 .. 0.80,1.04,0.70
cistus_b_lod0.glb tris=1360 bark[alphaTest=0 side=0 map=true/512 normalMap=true/512 rough=0.82] foliage[alphaTest=0.5 side=2 map=true/512 normalMap=true/512 rough=0.71] bbox -0.75,-0.00,-0.65 .. 0.69,1.26,0.69
cistus_b_lod1.glb tris=521 bark[alphaTest=0 side=0 map=true/512 normalMap=true/512 rough=0.82] foliage[alphaTest=0.5 side=2 map=true/512 normalMap=true/512 rough=0.71] bbox -0.73,-0.00,-0.65 .. 0.66,1.24,0.69
OK
```

## Loader notes (same as birch)
GLTFLoader + `KTX2Loader().setTranscoderPath(BASE_URL + 'basis/').detectSupport(renderer)`; extension is **required** (no PNG fallback);
keep `textures/` next to the glbs; load all glbs through one loader; foliage = alphaTest 0.5, DoubleSide; bark opaque; Y-up, metres, origin at trunk/clump base.
