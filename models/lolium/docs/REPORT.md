# lolium: game-ready LODs (a, b = 2 source variants)

Source: Maxtree Plant Models Vol.60 — Lolium perenne 01_04 + 01_06 (scaled x10, see REPORT)  
Licence: **Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files** (⚠ to be confirmed by the user)  
Built by treekit (`/workspace/kickr/treekit`, `lod_maxtree.py`, config `trees/lolium.json`), Blender 5.0.1 headless.

## Source variants used
| id | blend | height m | width m | source tris | by role | below ground m |
|---|---|---|---|---|---|---|
| `a` | `MT_PM_V60_Lolium_perenne_01_04.blend` | 0.469 | 0.96 × 0.87 | 26,796 | leaf 26,796 | 0.107 |
| `b` | `MT_PM_V60_Lolium_perenne_01_06.blend` | 0.276 | 0.86 × 0.85 | 50,272 | leaf 50,272 | 0.058 |
Source scale applied: ×10.0 (see notes).

## LODs (web version, `out_ktx2/`)
| file | bark/stem tris | foliage tris | total | verts | glb (geometry only) |
|---|---|---|---|---|---|
| `lolium_a_lod0.glb` | 0 | 6 (3 cards) | **6** | 12 | 2 KB |
| `lolium_b_lod0.glb` | 0 | 6 (3 cards) | **6** | 12 | 2 KB |

Mode: **star clump**. Each model is 3 vertical quads through the clump centre, each textured with a full-clump render from that azimuth. No LOD1 (grass).

## Materials: 1 (foliage)

- `foliage`: alpha **MASK** (cutoff 0.5), double-sided; opacity in `foliage_color` alpha; normal map; roughness factor 0.695 (= 1 − mean leaf glossiness), metallic 0.

## Shared KTX2 textures (all glbs of this asset reference the same files)
| file | size px | bytes |
|---|---|---|
| `textures/foliage_color.ktx2` | 512×512 | 108 KB |
| `textures/foliage_normal.ktx2` | 512×512 | 274 KB |

Codecs: colour ETC1S sRGB (foliage with alpha-coverage-preserving mips); normals/roughness UASTC q3 RDO zstd, linear.
Decode-back quality: `{"foliage_color": {"psnr_db": 31.2, "mask_IoU": 0.976, "coverage_mip0_2_4": [0.2977, 0.2975, 0.3184]}, "foliage_normal": {"angular_err_deg_mean": 2.45, "p99": 13.2}}`

## Transform
Metres, glTF Y-up, origin at the trunk/clump base (ring centre at source z = 0); all transforms applied. Source ×10.0 scale applied (see notes); otherwise real heights kept.

## Validation (gltf-transform validate; three.js r170 GLTFLoader+KTX2Loader test → `out_ktx2/three_check.png`)
```
lolium_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
lolium_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```


## Previews
- `out/preview.png`: per model, original | LOD0 | LOD1 (same ortho camera, Cycles)
- `out_ktx2/three_check.png`: three.js load test


## Notes and caveats (lolium)
- *Lolium perenne* (perennial ryegrass), native and common on verges.
- ⚠ **Scale assumption:** the Vol.60 Lolium blends measure only 0.03–0.06 m tall, which looks like authoring at 1/10 scale. A ×10 `source_scale` is applied, giving clumps 0.28–0.47 m tall and 0.85–0.96 m wide. Please confirm, or set `lod.source_scale` in `trees/lolium.json` and re-run.
- Variant `a` = 01_04 (full tuft) and `b` = 01_06 (low, wide). Star-clump mode: 3 crossed quads (6 tris) per clump, no LOD1.

