# alder LODs — web-optimised (KTX2 / KHR_texture_basisu)

Same geometry as `../out/`, textures are **shared external KTX2** (both LOD glbs reference the same `textures/*.ktx2`).
Source/licence: Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files — user to confirm.

| file | size | notes |
|---|---|---|
| `alder_a_lod0.glb` | 301 KB | 4218 tris, geometry identical to out/: true |
| `alder_a_lod1.glb` | 88 KB | 1240 tris, geometry identical to out/: true |
| `alder_b_lod0.glb` | 311 KB | 4222 tris, geometry identical to out/: true |
| `alder_b_lod1.glb` | 100 KB | 1252 tris, geometry identical to out/: true |
| `textures/bark_color.ktx2` | 259 KB | 1024², full mips, ETC1S (BasisLZ) sRGB |
| `textures/bark_normal.ktx2` | 1176 KB | 1024², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| `textures/bark_rough.ktx2` | 831 KB | 1024², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| `textures/foliage_color.ktx2` | 283 KB | 1024², full mips, ETC1S (BasisLZ) sRGB RGBA, alpha-coverage-preserving mips |
| `textures/foliage_normal.ktx2` | 1110 KB | 1024², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| **total** | **4.35 MB** | was 24.97 MB (4 glbs with embedded PNG/JPG) |

## Quality (decoded KTX2 vs source PNG)
```
{
 "bark_color": {
  "psnr_db": 31.0
 },
 "bark_normal": {
  "angular_err_deg_mean": 1.8,
  "p99": 5.87
 },
 "bark_rough": {
  "psnr_db": 51.1
 },
 "foliage_color": {
  "psnr_db": 32.7,
  "mask_IoU": 0.9918,
  "coverage_mip0_2_4": [
   0.3095,
   0.3092,
   0.3157
  ]
 },
 "foliage_normal": {
  "angular_err_deg_mean": 1.58,
  "p99": 8.84
 }
}
```

## Validation (gltf-transform validate)
```
alder_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
alder_a_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
alder_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
alder_b_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```
Warnings are the expected ones for KTX2 (validator does not support KHR_texture_basisu; `image/ktx2` mime; URI in GLB is allowed).

## three.js load test (headless Chrome/SwiftShader, three r170, GLTFLoader + KTX2Loader) -> `three_check.png`
```
alder_a_lod0.glb tris=4218 bark[alphaTest=0 side=0 map=true/1024 normalMap=true/1024 rough=tex] foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.66] bbox -4.23,0.00,-4.10 .. 4.75,14.76,4.40
alder_a_lod1.glb tris=1240 bark[alphaTest=0 side=0 map=true/1024 normalMap=true/1024 rough=tex] foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.66] bbox -4.10,0.00,-4.08 .. 4.69,14.64,4.39
alder_b_lod0.glb tris=4222 bark[alphaTest=0 side=0 map=true/1024 normalMap=true/1024 rough=tex] foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.66] bbox -4.43,-0.28,-4.76 .. 4.67,10.72,3.77
alder_b_lod1.glb tris=1252 bark[alphaTest=0 side=0 map=true/1024 normalMap=true/1024 rough=tex] foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.66] bbox -4.41,-0.28,-4.64 .. 4.48,10.80,3.95
OK
```

## Loader notes (same as birch)
GLTFLoader + `KTX2Loader().setTranscoderPath(BASE_URL + 'basis/').detectSupport(renderer)`; extension is **required** (no PNG fallback);
keep `textures/` next to the glbs; load all glbs through one loader; foliage = alphaTest 0.5, DoubleSide; bark opaque; Y-up, metres, origin at trunk/clump base.
