# digitaria: game-ready LODs (a, b = 2 source variants)

Source: Maxtree Plant Models Vol.60 — Digitaria sanguinalis 01_06 + 01_05  
Licence: **Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files** (⚠ to be confirmed by the user)  
Built by treekit (`/workspace/kickr/treekit`, `lod_maxtree.py`, config `trees/digitaria.json`), Blender 5.0.1 headless.

## Source variants used
| id | blend | height m | width m | source tris | by role | below ground m |
|---|---|---|---|---|---|---|
| `a` | `MT_PM_V60_Digitaria_sanguinalis_01_06.blend` | 0.204 | 0.33 × 0.26 | 5,286 | leaf 5,286 | 0.002 |
| `b` | `MT_PM_V60_Digitaria_sanguinalis_01_05.blend` | 0.131 | 0.16 × 0.14 | 5,358 | leaf 5,358 | 0.002 |


## LODs (web version, `out_ktx2/`)
| file | bark/stem tris | foliage tris | total | verts | glb (geometry only) |
|---|---|---|---|---|---|
| `digitaria_a_lod0.glb` | 0 | 6 (3 cards) | **6** | 12 | 2 KB |
| `digitaria_b_lod0.glb` | 0 | 6 (3 cards) | **6** | 12 | 2 KB |

Mode: **star clump**. Each model is 3 vertical quads through the clump centre, each textured with a full-clump render from that azimuth. No LOD1 (grass).

## Materials: 1 (foliage)

- `foliage`: alpha **MASK** (cutoff 0.5), double-sided; opacity in `foliage_color` alpha; normal map; roughness factor 0.688 (= 1 − mean leaf glossiness), metallic 0.

## Shared KTX2 textures (all glbs of this asset reference the same files)
| file | size px | bytes |
|---|---|---|
| `textures/foliage_color.ktx2` | 1024×1024 | 275 KB |
| `textures/foliage_color_dry.ktx2` | 1024×1024 | 247 KB |
| `textures/foliage_normal.ktx2` | 1024×1024 | 987 KB |

Codecs: colour ETC1S sRGB (foliage with alpha-coverage-preserving mips); normals/roughness UASTC q3 RDO zstd, linear.
Decode-back quality: `{"foliage_color": {"psnr_db": 28.6, "mask_IoU": 0.937, "coverage_mip0_2_4": [0.0737, 0.0743, 0.0725]}, "foliage_normal": {"angular_err_deg_mean": 1.18, "p99": 8.07}}`

## Transform
Metres, glTF Y-up, origin at the trunk/clump base (ring centre at source z = 0); all transforms applied. Real heights kept.

## Validation (gltf-transform validate; three.js r170 GLTFLoader+KTX2Loader test → `out_ktx2/three_check.png`)
```
digitaria_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
digitaria_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```


## Previews
- `out/preview.png`: per model, original | LOD0 | LOD1 (same ortho camera, Cycles)
- `out_ktx2/three_check.png`: three.js load test


## Notes and caveats (digitaria)
- *Digitaria sanguinalis* (hairy crabgrass), an annual weed of sandy fields and verges, common in NE Germany.
- Variant `a` = 01_06 (0.20 m, sprawling with tall thin stalks) and `b` = 01_05 (0.11 m). Authored size kept (×1). The verge proposal uses it as the "tall wispy stalks" layer at scale 1.8–3.0 (0.2–0.6 m).
- The atlas is very sparse (about 7 % alpha coverage). At alphaTest 0.5 it reads as a few thin stalks, which is intended, but expect some shimmer at 15–35 m without MSAA.
- Star-clump mode: 3 crossed quads (6 tris) per clump, no LOD1.
- Dry variant: `*_lod0_dry.glb` uses `textures/foliage_color_dry.ktx2`.

