# ammophila LODs — web-optimised (KTX2 / KHR_texture_basisu)

Same geometry as `../out/`, textures are **shared external KTX2** (both LOD glbs reference the same `textures/*.ktx2`).
Source/licence: Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files — user to confirm.

| file | size | notes |
|---|---|---|
| `ammophila_a_lod0.glb` | 2 KB | 6 tris, geometry identical to out/: true |
| `ammophila_b_lod0.glb` | 2 KB | 6 tris, geometry identical to out/: true |
| `textures/foliage_color.ktx2` | 360 KB | 1024², full mips, ETC1S (BasisLZ) sRGB RGBA, alpha-coverage-preserving mips |
| `textures/foliage_normal.ktx2` | 1076 KB | 1024², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| **total** | **1.41 MB** | was 6.67 MB (2 glbs with embedded PNG/JPG) |

## Quality (decoded KTX2 vs source PNG)
```
{
 "foliage_color": {
  "psnr_db": 28.9,
  "mask_IoU": 0.9331,
  "coverage_mip0_2_4": [
   0.2204,
   0.2211,
   0.2236
  ]
 },
 "foliage_normal": {
  "angular_err_deg_mean": 2.1,
  "p99": 12.44
 }
}
```

## Validation (gltf-transform validate)
```
ammophila_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
ammophila_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```
Warnings are the expected ones for KTX2 (validator does not support KHR_texture_basisu; `image/ktx2` mime; URI in GLB is allowed).

## three.js load test (headless Chrome/SwiftShader, three r170, GLTFLoader + KTX2Loader) -> `three_check.png`
```
ammophila_a_lod0.glb tris=6 foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.68] bbox -0.16,0.00,-0.16 .. 0.15,0.25,0.14
ammophila_b_lod0.glb tris=6 foliage[alphaTest=0.5 side=2 map=true/1024 normalMap=true/1024 rough=0.68] bbox -0.23,0.00,-0.17 .. 0.18,0.26,0.19
OK
```

## Loader notes (same as birch)
GLTFLoader + `KTX2Loader().setTranscoderPath(BASE_URL + 'basis/').detectSupport(renderer)`; extension is **required** (no PNG fallback);
keep `textures/` next to the glbs; load all glbs through one loader; foliage = alphaTest 0.5, DoubleSide; bark opaque; Y-up, metres, origin at trunk/clump base.
