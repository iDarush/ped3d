# ammophila: game-ready LODs (a, b = 2 source variants)

Source: Maxtree Plant Models Vol.60 — Ammophila arenaria 01_01 + 01_02  
Licence: **Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files** (⚠ to be confirmed by the user)  
Built by treekit (`/workspace/kickr/treekit`, `lod_maxtree.py`, config `trees/ammophila.json`), Blender 5.0.1 headless.

## Source variants used
| id | blend | height m | width m | source tris | by role | below ground m |
|---|---|---|---|---|---|---|
| `a` | `MT_PM_V60_Ammophila_arenaria_01_01.blend` | 0.245 | 0.33 × 0.37 | 49,386 | leaf 49,386 | 0.027 |
| `b` | `MT_PM_V60_Ammophila_arenaria_01_02.blend` | 0.263 | 0.45 × 0.44 | 59,985 | leaf 59,985 | 0.018 |


## LODs (web version, `out_ktx2/`)
| file | bark/stem tris | foliage tris | total | verts | glb (geometry only) |
|---|---|---|---|---|---|
| `ammophila_a_lod0.glb` | 0 | 6 (3 cards) | **6** | 12 | 2 KB |
| `ammophila_b_lod0.glb` | 0 | 6 (3 cards) | **6** | 12 | 2 KB |

Mode: **star clump**. Each model is 3 vertical quads through the clump centre, each textured with a full-clump render from that azimuth. No LOD1 (grass).

## Materials: 1 (foliage)

- `foliage`: alpha **MASK** (cutoff 0.5), double-sided; opacity in `foliage_color` alpha; normal map; roughness factor 0.684 (= 1 − mean leaf glossiness), metallic 0.

## Shared KTX2 textures (all glbs of this asset reference the same files)
| file | size px | bytes |
|---|---|---|
| `textures/foliage_color.ktx2` | 1024×1024 | 360 KB |
| `textures/foliage_color_dry.ktx2` | 1024×1024 | 332 KB |
| `textures/foliage_normal.ktx2` | 1024×1024 | 1.05 MB |

Codecs: colour ETC1S sRGB (foliage with alpha-coverage-preserving mips); normals/roughness UASTC q3 RDO zstd, linear.
Decode-back quality: `{"foliage_color": {"psnr_db": 28.9, "mask_IoU": 0.9331, "coverage_mip0_2_4": [0.2204, 0.2211, 0.2236]}, "foliage_normal": {"angular_err_deg_mean": 2.1, "p99": 12.44}}`

## Transform
Metres, glTF Y-up, origin at the trunk/clump base (ring centre at source z = 0); all transforms applied. Real heights kept.

## Validation (gltf-transform validate; three.js r170 GLTFLoader+KTX2Loader test → `out_ktx2/three_check.png`)
```
ammophila_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
ammophila_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```


## Previews
- `out/preview.png`: per model, original | LOD0 | LOD1 (same ortho camera, Cycles)
- `out_ktx2/three_check.png`: three.js load test


## Notes and caveats (ammophila)
- *Ammophila arenaria* (European marram grass). In Germany it grows on Baltic/North Sea dunes, not on Müritz field verges. It is used here only for its look: a thin, upright, wispy tussock that already has straw tones, which reads like a dry *Calamagrostis*/*Festuca* verge tussock at riding distance.
- Variant `a` = 01_01 (0.25 m, narrow tussock) and `b` = 01_02 (0.26 m, wider). Authored size kept (×1). The verge proposal scales instances 0.9–1.8 (0.22–0.45 m).
- Star-clump mode: 3 crossed quads (6 tris) per clump, no LOD1. Source has 49k/60k tris.
- Dry variant: `*_lod0_dry.glb` uses `textures/foliage_color_dry.ktx2` (straw recolour, same atlas, same normal map; `treekit/dry_variant.py`).

