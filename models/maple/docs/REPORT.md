# maple: game-ready LODs (a, b = 2 source variants)

Source: Maxtree Plant Models Vol.60 — Acer buergerianum (trident maple) 01_03 + 01_01  
Licence: **Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files** (⚠ to be confirmed by the user)  
Built by treekit (`/workspace/kickr/treekit`, `lod_maxtree.py`, config `trees/maple.json`), Blender 5.0.1 headless.

## Source variants used
| id | blend | height m | width m | source tris | by role | below ground m |
|---|---|---|---|---|---|---|
| `a` | `MT_PM_V60_Acer_buergerianum_01_03.blend` | 12.5 | 6.87 × 7.17 | 1,640,964 | twig 629,224, leaf 427,660, bark 584,080 | 0.0 |
| `b` | `MT_PM_V60_Acer_buergerianum_01_01.blend` | 12.202 | 6.84 × 7.49 | 1,504,832 | twig 543,676, leaf 443,700, bark 517,456 | 0.0 |


## LODs (web version, `out_ktx2/`)
| file | bark/stem tris | foliage tris | total | verts | glb (geometry only) |
|---|---|---|---|---|---|
| `maple_a_lod0.glb` | 2380 | 1800 (900 cards) | **4180** | 4897 | 275 KB |
| `maple_a_lod1.glb` | 605 | 640 (320 cards) | **1245** | 1600 | 97 KB |
| `maple_b_lod0.glb` | 2425 | 1800 (900 cards) | **4225** | 4888 | 289 KB |
| `maple_b_lod1.glb` | 610 | 640 (320 cards) | **1250** | 1603 | 98 KB |

LOD0/LOD1: decimated bark (protected base and forks) plus leaf-cluster cards (baked templates of real leaves, twigs and petioles).

## Materials: 2 (bark, foliage)
- `bark`: opaque; base colour, normal map, roughness factor 0.815 (1 − mean glossiness; glossiness map nearly constant), metallic 0.
- `foliage`: alpha **MASK** (cutoff 0.5), double-sided; opacity in `foliage_color` alpha; normal map; roughness factor 0.741 (= 1 − mean leaf glossiness), metallic 0.

## Shared KTX2 textures (all glbs of this asset reference the same files)
| file | size px | bytes |
|---|---|---|
| `textures/bark_color.ktx2` | 1024×1024 | 235 KB |
| `textures/bark_normal.ktx2` | 1024×1024 | 1.13 MB |
| `textures/foliage_color.ktx2` | 1024×1024 | 338 KB |
| `textures/foliage_normal.ktx2` | 1024×1024 | 1.10 MB |

Codecs: colour ETC1S sRGB (foliage with alpha-coverage-preserving mips); normals/roughness UASTC q3 RDO zstd, linear.
Decode-back quality: `{"bark_color": {"psnr_db": 37.0}, "bark_normal": {"angular_err_deg_mean": 1.51, "p99": 4.81}, "foliage_color": {"psnr_db": 29.4, "mask_IoU": 0.9902, "coverage_mip0_2_4": [0.3578, 0.3573, 0.3606]}, "foliage_normal": {"angular_err_deg_mean": 1.79, "p99": 9.93}}`

## Transform
Metres, glTF Y-up, origin at the trunk/clump base (ring centre at source z = 0); all transforms applied. Real heights kept.

## Validation (gltf-transform validate; three.js r170 GLTFLoader+KTX2Loader test → `out_ktx2/three_check.png`)
```
maple_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
maple_a_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
maple_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
maple_b_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```

## Impostor cards (`../cards/`)
- Atlas 2048×1264 colour+alpha (normal atlas shipped 1024×632); 4 variant rows × 8 azimuths; cell 256×316 px = 10.7815×13.3085 m.
- Cell framing: auto: cell width = atlas/naz; cell height fitted per tree to its height:width (max pixels per metre), capped at atlas/rows; rows below rows_used_px are empty.
- Variants: v0_a (model a, 12.46 m), v1_b (model b, 12.224 m), v2_a_mirrored (model a, 12.46 m, mirrored), v3_b_mirrored (model b, 12.224 m, mirrored).
- Rendered from final LOD0 (maple_a_lod0.glb, maple_b_lod0.glb geometry), same pivot/scale/units. Pivot = trunk base = cell bottom-centre, 10 px above bottom edge.
- Meshes: `maple_card_cross.glb` 4 tris, `maple_card_3plane.glb` 6 tris, `maple_card_billboard.glb` 2 tris; units: 1.0 = height of variant-0 tree (12.46 m source = LOD0 height); instance scale = desired tree height in metres (scale 12.460 matches LOD0 exactly).
- Spec: `maple_cards.json`.

| file | size |
|---|---|
| `cards/textures/maple_cards_color.ktx2` | 608 KB |
| `cards/textures/maple_cards_normal.ktx2` | 709 KB |

## Previews
- `out/preview.png`: per model, original | LOD0 | LOD1 (same ortho camera, Cycles)
- `out_ktx2/three_check.png`: three.js load test
- `cards/preview_threejs_cards.png`: LOD0 next to the card meshes in three.js

## Notes and caveats (maple)
- Species: *Acer buergerianum* (trident maple). It stands in for a native maple (*Acer platanoides* / *pseudoplatanus*); Vol.60 has no native maple.
- ⚠ **Autumn foliage only.** The source has two albedo sets for this species: C1 = yellow-orange and C2 = red. Neither is green. The source leaf material blends C1 and C2 per leaf through a vertex-colour mix. The baked foliage atlas uses **C1 only** (yellow-orange). C1 is the dominant map: the mix factor is about 0 on most leaves, with C2 (red) only as scattered accents. The crowns are therefore slightly more uniform than the source. For a summer scene, the leaves need a green albedo from another source, or a hue-shifted foliage atlas (an easy follow-up on `foliage_color` only; geometry and UVs stay the same).
- Variant `a` = 01_03 (12.50 m) and `b` = 01_01 (12.20 m): the two tallest, mature-looking crowns. 01_06 (10.3 m, narrow) was left out.
- Translucency maps were not copied. Petioles and twigs are baked into the cluster templates. Bark roughness is a factor (glossiness map nearly constant).

