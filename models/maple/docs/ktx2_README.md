# maple LODs — web-optimised (KTX2 / KHR_texture_basisu)

Same geometry as `../out/`, textures are **shared external KTX2** (both LOD glbs reference the same `textures/*.ktx2`).
Source/licence: Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files — user to confirm.

| file | size | notes |
|---|---|---|
| `maple_a_lod0.glb` | 275 KB | 4180 tris, geometry identical to out/: true |
| `maple_a_lod1.glb` | 97 KB | 1245 tris, geometry identical to out/: true |
| `maple_b_lod0.glb` | 289 KB | 4225 tris, geometry identical to out/: true |
| `maple_b_lod1.glb` | 98 KB | 1250 tris, geometry identical to out/: true |
| `textures/bark_color.ktx2` | 235 KB | 1024², full mips, ETC1S (BasisLZ) sRGB |
| `textures/bark_normal.ktx2` | 1153 KB | 1024², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| `textures/foliage_color.ktx2` | 338 KB | 1024², full mips, ETC1S (BasisLZ) sRGB RGBA, alpha-coverage-preserving mips |
| `textures/foliage_normal.ktx2` | 1125 KB | 1024², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| **total** | **3.52 MB** | was 21.39 MB (4 glbs with embedded PNG/JPG) |

## Quality (decoded KTX2 vs source PNG)
```
{
 "bark_color": {
  "psnr_db": 37.0
 },
 "bark_normal": {
  "angular_err_deg_mean": 1.51,
  "p99": 4.81
 },
 "foliage_color": {
  "psnr_db": 29.4,
  "mask_IoU": 0.9902,
  "coverage_mip0_2_4": [
   0.3578,
   0.3573,
   0.3606
  ]
 },
 "foliage_normal": {
  "angular_err_deg_mean": 1.79,
  "p99": 9.93
 }
}
```

## Validation (gltf-transform validate)
```
maple_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
maple_a_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
maple_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
maple_b_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```
Warnings are the expected ones for KTX2 (validator does not support KHR_texture_basisu; `image/ktx2` mime; URI in GLB is allowed).

## three.js load test (headless Chrome/SwiftShader, three r170, GLTFLoader + KTX2Loader) -> `three_check.png`
```
maple_a_lod0.glb tris=4180 bark[alphaTest=0 side=0 map=true/1024 normalMap=true/1024 rough=0.81] foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.74] bbox -3.47,-0.00,-3.67 .. 3.32,12.46,3.50
maple_a_lod1.glb tris=1245 bark[alphaTest=0 side=0 map=true/1024 normalMap=true/1024 rough=0.81] foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.74] bbox -3.73,-0.11,-3.58 .. 3.50,12.65,3.52
maple_b_lod0.glb tris=4225 bark[alphaTest=0 side=0 map=true/1024 normalMap=true/1024 rough=0.81] foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.74] bbox -4.88,-0.01,-3.43 .. 2.03,12.22,3.98
maple_b_lod1.glb tris=1250 bark[alphaTest=0 side=0 map=true/1024 normalMap=true/1024 rough=0.81] foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.74] bbox -4.86,-0.11,-3.52 .. 2.00,12.26,4.04
OK
```

## Loader notes (same as birch)
GLTFLoader + `KTX2Loader().setTranscoderPath(BASE_URL + 'basis/').detectSupport(renderer)`; extension is **required** (no PNG fallback);
keep `textures/` next to the glbs; load all glbs through one loader; foliage = alphaTest 0.5, DoubleSide; bark opaque; Y-up, metres, origin at trunk/clump base.
