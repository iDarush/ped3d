# abelia: game-ready LODs (a, b = 2 source variants)

Source: Maxtree Plant Models Vol.60 — Abelia x grandiflora 01_03 + 01_04  
Licence: **Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files** (⚠ to be confirmed by the user)  
Built by treekit (`/workspace/kickr/treekit`, `lod_maxtree.py`, config `trees/abelia.json`), Blender 5.0.1 headless.

## Source variants used
| id | blend | height m | width m | source tris | by role | below ground m |
|---|---|---|---|---|---|---|
| `a` | `MT_PM_V60_Abelia_grandiflora_01_03.blend` | 1.448 | 1.38 × 1.32 | 340,418 | bark 78,204, leaf 124,824, twig 137,390 | 0.004 |
| `b` | `MT_PM_V60_Abelia_grandiflora_01_04.blend` | 1.186 | 1.49 × 1.47 | 460,760 | bark 120,408, leaf 210,952, twig 129,400 | 0.004 |


## LODs (web version, `out_ktx2/`)
| file | bark/stem tris | foliage tris | total | verts | glb (geometry only) |
|---|---|---|---|---|---|
| `abelia_a_lod0.glb` | 507 | 880 (440 cards) | **1387** | 2049 | 113 KB |
| `abelia_a_lod1.glb` | 120 | 400 (200 cards) | **520** | 881 | 49 KB |
| `abelia_b_lod0.glb` | 502 | 880 (440 cards) | **1382** | 2059 | 117 KB |
| `abelia_b_lod1.glb` | 120 | 400 (200 cards) | **520** | 875 | 49 KB |

LOD0/LOD1: decimated bark (protected base and forks) plus leaf-cluster cards (baked templates of real leaves, twigs and petioles).

## Materials: 2 (bark, foliage)
- `bark`: opaque; base colour, normal map, roughness **texture** `bark_rough` (G = 1 − glossiness), metallic 0.
- `foliage`: alpha **MASK** (cutoff 0.5), double-sided; opacity in `foliage_color` alpha; normal map; roughness factor 0.654 (= 1 − mean leaf glossiness), metallic 0.

## Shared KTX2 textures (all glbs of this asset reference the same files)
| file | size px | bytes |
|---|---|---|
| `textures/bark_color.ktx2` | 512×512 | 88 KB |
| `textures/bark_normal.ktx2` | 512×512 | 254 KB |
| `textures/bark_rough.ktx2` | 512×512 | 189 KB |
| `textures/foliage_color.ktx2` | 512×512 | 113 KB |
| `textures/foliage_normal.ktx2` | 512×512 | 288 KB |

Codecs: colour ETC1S sRGB (foliage with alpha-coverage-preserving mips); normals/roughness UASTC q3 RDO zstd, linear.
Decode-back quality: `{"bark_color": {"psnr_db": 34.0}, "bark_normal": {"angular_err_deg_mean": 1.07, "p99": 3.31}, "bark_rough": {"psnr_db": 44.7}, "foliage_color": {"psnr_db": 29.1, "mask_IoU": 0.988, "coverage_mip0_2_4": [0.2791, 0.2773, 0.2969]}, "foliage_normal": {"angular_err_deg_mean": 1.89, "p99": 10.66}}`

## Transform
Metres, glTF Y-up, origin at the trunk/clump base (ring centre at source z = 0); all transforms applied. Real heights kept.

## Validation (gltf-transform validate; three.js r170 GLTFLoader+KTX2Loader test → `out_ktx2/three_check.png`)
```
abelia_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
abelia_a_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
abelia_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
abelia_b_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```

## Impostor cards (`../cards/`)
- Atlas 1024×464 colour+alpha (normal atlas shipped 512×232); 4 variant rows × 8 azimuths; cell 128×116 px = 1.9384×1.7567 m.
- Cell framing: auto: cell width = atlas/naz; cell height fitted per tree to its height:width (max pixels per metre), capped at atlas/rows; rows below rows_used_px are empty.
- Variants: v0_a (model a, 1.437 m), v1_b (model b, 1.194 m), v2_a_mirrored (model a, 1.437 m, mirrored), v3_b_mirrored (model b, 1.194 m, mirrored).
- Rendered from final LOD0 (abelia_a_lod0.glb, abelia_b_lod0.glb geometry), same pivot/scale/units. Pivot = trunk base = cell bottom-centre, 10 px above bottom edge.
- Meshes: `abelia_card_cross.glb` 4 tris, `abelia_card_3plane.glb` 6 tris, `abelia_card_billboard.glb` 2 tris; units: 1.0 = height of variant-0 tree (1.44 m source = LOD0 height); instance scale = desired tree height in metres (scale 1.437 matches LOD0 exactly).
- Spec: `abelia_cards.json`.

| file | size |
|---|---|
| `cards/textures/abelia_cards_color.ktx2` | 157 KB |
| `cards/textures/abelia_cards_normal.ktx2` | 143 KB |

## Previews
- `out/preview.png`: per model, original | LOD0 | LOD1 (same ortho camera, Cycles)
- `out_ktx2/three_check.png`: three.js load test
- `cards/preview_threejs_cards.png`: LOD0 next to the card meshes in three.js

## Notes and caveats (abelia)
- *Abelia × grandiflora* is a garden shrub, used here as a generic broadleaf forest-edge shrub (no native hazel or elder in Vol.60).
- Variant `a` = 01_03 (1.45 m, open, multi-stem) and `b` = 01_04 (1.19 m, dense dome). 01_01 (1.69 m, 0.93 M tris) was left out because it is the same shape as 01_03.
- Only the 16 longest stems per model are kept as geometry. Shorter stems and twigs are baked into the cluster-card templates. Translucency is not used.
- Textures are 512² (shrub budget). Cards use a 1024-wide atlas.

