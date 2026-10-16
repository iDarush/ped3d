# setaria: game-ready LODs (a, b = 2 source variants)

Source: Maxtree Plant Models Vol.60 — Setaria viridis 01_06 + 01_03  
Licence: **Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files** (⚠ to be confirmed by the user)  
Built by treekit (`/workspace/kickr/treekit`, `lod_maxtree.py`, config `trees/setaria.json`), Blender 5.0.1 headless.

## Source variants used
| id | blend | height m | width m | source tris | by role | below ground m |
|---|---|---|---|---|---|---|
| `a` | `MT_PM_V60_Setaria_viridis_beauv_01_06.blend` | 0.283 | 0.26 × 0.25 | 6,043 | leaf 6,043 | 0.001 |
| `b` | `MT_PM_V60_Setaria_viridis_beauv_01_03.blend` | 0.173 | 0.32 × 0.36 | 3,930 | leaf 3,930 | 0.002 |


## LODs (web version, `out_ktx2/`)
| file | bark/stem tris | foliage tris | total | verts | glb (geometry only) |
|---|---|---|---|---|---|
| `setaria_a_lod0.glb` | 0 | 6 (3 cards) | **6** | 12 | 2 KB |
| `setaria_b_lod0.glb` | 0 | 6 (3 cards) | **6** | 12 | 2 KB |

Mode: **star clump**. Each model is 3 vertical quads through the clump centre, each textured with a full-clump render from that azimuth. No LOD1 (grass).

## Materials: 1 (foliage)

- `foliage`: alpha **MASK** (cutoff 0.5), double-sided; opacity in `foliage_color` alpha; normal map; roughness factor 0.715 (= 1 − mean leaf glossiness), metallic 0.

## Shared KTX2 textures (all glbs of this asset reference the same files)
| file | size px | bytes |
|---|---|---|
| `textures/foliage_color.ktx2` | 1024×1024 | 243 KB |
| `textures/foliage_normal.ktx2` | 1024×1024 | 906 KB |

Codecs: colour ETC1S sRGB (foliage with alpha-coverage-preserving mips); normals/roughness UASTC q3 RDO zstd, linear.
Decode-back quality: `{"foliage_color": {"psnr_db": 30.1, "mask_IoU": 0.965, "coverage_mip0_2_4": [0.1105, 0.1094, 0.1079]}, "foliage_normal": {"angular_err_deg_mean": 1.19, "p99": 9.39}}`

## Transform
Metres, glTF Y-up, origin at the trunk/clump base (ring centre at source z = 0); all transforms applied. Real heights kept.

## Validation (gltf-transform validate; three.js r170 GLTFLoader+KTX2Loader test → `out_ktx2/three_check.png`)
```
setaria_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
setaria_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```


## Previews
- `out/preview.png`: per model, original | LOD0 | LOD1 (same ortho camera, Cycles)
- `out_ktx2/three_check.png`: three.js load test


## Notes and caveats (setaria)
- *Setaria viridis* (green foxtail), a common annual grass on sandy verges in NE Germany.
- Variant `a` = 01_06 (0.28 m, with seed heads) and `b` = 01_03 (0.17 m leafy tuft). Star-clump mode: 3 crossed quads (6 tris) per clump, no LOD1.
- Thin seed-head stalks (~1 mm) are sub-pixel even at 1024², so some heads look detached at close range. This is acceptable at grass-scatter distance.

