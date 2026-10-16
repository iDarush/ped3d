# alder: game-ready LODs (a, b = 2 source variants)

Source: Maxtree Plant Models Vol.60 — Alnus cremastogyne (alder) 01_04 + 01_02  
Licence: **Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files** (⚠ to be confirmed by the user)  
Built by treekit (`/workspace/kickr/treekit`, `lod_maxtree.py`, config `trees/alder.json`), Blender 5.0.1 headless.

## Source variants used
| id | blend | height m | width m | source tris | by role | below ground m |
|---|---|---|---|---|---|---|
| `a` | `MT_PM_V60_Alnus_cremastogyne_01_04.blend` | 14.548 | 8.64 × 8.55 | 864,322 | bark 363,111, twig 99,782, leaf 401,429 | 0.0 |
| `b` | `MT_PM_V60_Alnus_cremastogyne_01_02.blend` | 10.594 | 9.06 × 8.6 | 1,100,362 | bark 465,693, twig 126,366, leaf 508,303 | 0.263 |


## LODs (web version, `out_ktx2/`)
| file | bark/stem tris | foliage tris | total | verts | glb (geometry only) |
|---|---|---|---|---|---|
| `alder_a_lod0.glb` | 2418 | 1800 (900 cards) | **4218** | 5067 | 301 KB |
| `alder_a_lod1.glb` | 600 | 640 (320 cards) | **1240** | 1589 | 88 KB |
| `alder_b_lod0.glb` | 2422 | 1800 (900 cards) | **4222** | 5084 | 311 KB |
| `alder_b_lod1.glb` | 612 | 640 (320 cards) | **1252** | 1616 | 100 KB |

LOD0/LOD1: decimated bark (protected base and forks) plus leaf-cluster cards (baked templates of real leaves, twigs and petioles).

## Materials: 2 (bark, foliage)
- `bark`: opaque; base colour, normal map, roughness **texture** `bark_rough` (G = 1 − glossiness), metallic 0.
- `foliage`: alpha **MASK** (cutoff 0.5), double-sided; opacity in `foliage_color` alpha; normal map; roughness factor 0.658 (= 1 − mean leaf glossiness), metallic 0.

## Shared KTX2 textures (all glbs of this asset reference the same files)
| file | size px | bytes |
|---|---|---|
| `textures/bark_color.ktx2` | 1024×1024 | 259 KB |
| `textures/bark_normal.ktx2` | 1024×1024 | 1.15 MB |
| `textures/bark_rough.ktx2` | 1024×1024 | 831 KB |
| `textures/foliage_color.ktx2` | 1024×1024 | 283 KB |
| `textures/foliage_normal.ktx2` | 1024×1024 | 1.08 MB |

Codecs: colour ETC1S sRGB (foliage with alpha-coverage-preserving mips); normals/roughness UASTC q3 RDO zstd, linear.
Decode-back quality: `{"bark_color": {"psnr_db": 31.0}, "bark_normal": {"angular_err_deg_mean": 1.8, "p99": 5.87}, "bark_rough": {"psnr_db": 51.1}, "foliage_color": {"psnr_db": 32.7, "mask_IoU": 0.9918, "coverage_mip0_2_4": [0.3095, 0.3092, 0.3157]}, "foliage_normal": {"angular_err_deg_mean": 1.58, "p99": 8.84}}`

## Transform
Metres, glTF Y-up, origin at the trunk/clump base (ring centre at source z = 0); all transforms applied. Real heights kept.

## Validation (gltf-transform validate; three.js r170 GLTFLoader+KTX2Loader test → `out_ktx2/three_check.png`)
```
alder_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
alder_a_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
alder_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
alder_b_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```

## Impostor cards (`../cards/`)
- Atlas 2048×1536 colour+alpha (normal atlas shipped 1024×768); 4 variant rows × 8 azimuths; cell 256×384 px = 10.4725×15.7087 m.
- Cell framing: auto: cell width = atlas/naz; cell height fitted per tree to its height:width (max pixels per metre), capped at atlas/rows; rows below rows_used_px are empty.
- Variants: v0_a (model a, 14.76 m), v1_b (model b, 10.717 m), v2_a_mirrored (model a, 14.76 m, mirrored), v3_b_mirrored (model b, 10.717 m, mirrored).
- Rendered from final LOD0 (alder_a_lod0.glb, alder_b_lod0.glb geometry), same pivot/scale/units. Pivot = trunk base = cell bottom-centre, 10 px above bottom edge.
- Meshes: `alder_card_cross.glb` 4 tris, `alder_card_3plane.glb` 6 tris, `alder_card_billboard.glb` 2 tris; units: 1.0 = height of variant-0 tree (14.76 m source = LOD0 height); instance scale = desired tree height in metres (scale 14.760 matches LOD0 exactly).
- Spec: `alder_cards.json`.

| file | size |
|---|---|
| `cards/textures/alder_cards_color.ktx2` | 725 KB |
| `cards/textures/alder_cards_normal.ktx2` | 865 KB |

## Previews
- `out/preview.png`: per model, original | LOD0 | LOD1 (same ortho camera, Cycles)
- `out_ktx2/three_check.png`: three.js load test
- `cards/preview_threejs_cards.png`: LOD0 next to the card meshes in three.js

## Notes and caveats (alder)
- Species: *Alnus cremastogyne* (Chinese alder). Maxtree Vol.60 has no *Alnus glutinosa*, the native black alder of Müritz, so this is the closest stand-in. Its leaf shape and colour read as generic alder at game distance.
- Variant `a` = 01_04 (14.55 m; tallest; a single straight trunk, like a mature forest-edge alder). Variant `b` = 01_02 (10.86 m; multi-stem, broader crown, which gives variety).
- `b` has surface roots that go 0.26 m below z = 0. The pivot stays at the trunk ring at source z = 0, so the roots sink into the terrain as authored (`below_ground_m` in stats.json).
- Translucency maps were not copied (as instructed). Leaves are shaded with albedo, normal and roughness only. Petioles and small twigs are baked into the leaf-cluster card templates; branches shorter than 1.5 m are not modelled as geometry.
- Bark roughness: `bark_rough` texture (glossiness variation above the constant threshold), or a factor; see Materials.

