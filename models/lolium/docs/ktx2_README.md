# lolium LODs — web-optimised (KTX2 / KHR_texture_basisu)

Same geometry as `../out/`, textures are **shared external KTX2** (both LOD glbs reference the same `textures/*.ktx2`).
Source/licence: Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files — user to confirm.

| file | size | notes |
|---|---|---|
| `lolium_a_lod0.glb` | 2 KB | 6 tris, geometry identical to out/: true |
| `lolium_b_lod0.glb` | 2 KB | 6 tris, geometry identical to out/: true |
| `textures/foliage_color.ktx2` | 108 KB | 512², full mips, ETC1S (BasisLZ) sRGB RGBA, alpha-coverage-preserving mips |
| `textures/foliage_normal.ktx2` | 274 KB | 512², full mips, UASTC q3 + RDO(0.5) + Zstd 18, linear |
| **total** | **0.38 MB** | was 1.57 MB (2 glbs with embedded PNG/JPG) |

## Quality (decoded KTX2 vs source PNG)
```
{
 "foliage_color": {
  "psnr_db": 31.2,
  "mask_IoU": 0.976,
  "coverage_mip0_2_4": [
   0.2977,
   0.2975,
   0.3184
  ]
 },
 "foliage_normal": {
  "angular_err_deg_mean": 2.45,
  "p99": 13.2
 }
}
```

## Validation (gltf-transform validate)
```
lolium_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
lolium_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```
Warnings are the expected ones for KTX2 (validator does not support KHR_texture_basisu; `image/ktx2` mime; URI in GLB is allowed).

## three.js load test (headless Chrome/SwiftShader, three r170, GLTFLoader + KTX2Loader) -> `three_check.png`
```
lolium_a_lod0.glb tris=6 foliage[alphaTest=0.5 side=2 map=true/512 normalMap=true/512 rough=0.69] bbox -0.44,0.00,-0.36 .. 0.40,0.47,0.37
lolium_b_lod0.glb tris=6 foliage[alphaTest=0.5 side=2 map=true/512 normalMap=true/512 rough=0.69] bbox -0.38,0.00,-0.34 .. 0.38,0.27,0.36
OK
```

## Loader notes (same as birch)
GLTFLoader + `KTX2Loader().setTranscoderPath(BASE_URL + 'basis/').detectSupport(renderer)`; extension is **required** (no PNG fallback);
keep `textures/` next to the glbs; load all glbs through one loader; foliage = alphaTest 0.5, DoubleSide; bark opaque; Y-up, metres, origin at trunk/clump base.
