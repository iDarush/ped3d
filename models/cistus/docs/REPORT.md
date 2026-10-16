# cistus: game-ready LODs (a, b = 2 source variants)

Source: Maxtree Plant Models Vol.60 — Cistus albidus 01_02 + 01_04  
Licence: **Maxtree Plant Models Vol.60, Maxtree licence (user-owned), not for redistribution of source files** (⚠ to be confirmed by the user)  
Built by treekit (`/workspace/kickr/treekit`, `lod_maxtree.py`, config `trees/cistus.json`), Blender 5.0.1 headless.

## Source variants used
| id | blend | height m | width m | source tris | by role | below ground m |
|---|---|---|---|---|---|---|
| `a` | `MT_PM_V60_Cistus_albidus_01_02.blend` | 1.032 | 1.53 × 1.51 | 537,392 | twig 73,728, bark 41,640, leaf 422,024 | 0.053 |
| `b` | `MT_PM_V60_Cistus_albidus_01_04.blend` | 1.203 | 1.39 × 1.34 | 367,538 | twig 53,488, bark 54,274, leaf 259,776 | 0.0 |


## LODs (web version, `out_ktx2/`)
| file | bark/stem tris | foliage tris | total | verts | glb (geometry only) |
|---|---|---|---|---|---|
| `cistus_a_lod0.glb` | 569 | 880 (440 cards) | **1449** | 2105 | 116 KB |
| `cistus_a_lod1.glb` | 122 | 400 (200 cards) | **522** | 876 | 49 KB |
| `cistus_b_lod0.glb` | 480 | 880 (440 cards) | **1360** | 2054 | 114 KB |
| `cistus_b_lod1.glb` | 121 | 400 (200 cards) | **521** | 872 | 51 KB |

LOD0/LOD1: decimated bark (protected base and forks) plus leaf-cluster cards (baked templates of real leaves, twigs and petioles).

## Materials: 2 (bark, foliage)
- `bark`: opaque; base colour, normal map, roughness factor 0.824 (1 − mean glossiness; glossiness map nearly constant), metallic 0.
- `foliage`: alpha **MASK** (cutoff 0.5), double-sided; opacity in `foliage_color` alpha; normal map; roughness factor 0.715 (= 1 − mean leaf glossiness), metallic 0.

## Shared KTX2 textures (all glbs of this asset reference the same files)
| file | size px | bytes |
|---|---|---|
| `textures/bark_color.ktx2` | 512×512 | 85 KB |
| `textures/bark_normal.ktx2` | 512×512 | 254 KB |
| `textures/foliage_color.ktx2` | 512×512 | 107 KB |
| `textures/foliage_normal.ktx2` | 512×512 | 286 KB |

Codecs: colour ETC1S sRGB (foliage with alpha-coverage-preserving mips); normals/roughness UASTC q3 RDO zstd, linear.
Decode-back quality: `{"bark_color": {"psnr_db": 34.2}, "bark_normal": {"angular_err_deg_mean": 1.07, "p99": 3.39}, "foliage_color": {"psnr_db": 34.1, "mask_IoU": 0.9907, "coverage_mip0_2_4": [0.2794, 0.2788, 0.251]}, "foliage_normal": {"angular_err_deg_mean": 2.3, "p99": 12.91}}`

## Transform
Metres, glTF Y-up, origin at the trunk/clump base (ring centre at source z = 0); all transforms applied. Real heights kept.

## Validation (gltf-transform validate; three.js r170 GLTFLoader+KTX2Loader test → `out_ktx2/three_check.png`)
```
cistus_a_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
cistus_a_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
cistus_b_lod0.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
cistus_b_lod1.glb: 0 errors; warnings/infos: IMAGE_UNRECOGNIZED_FORMAT, UNSUPPORTED_EXTENSION, UNUSED_OBJECT, URI_GLB, VALUE_NOT_IN_LIST
```

## Impostor cards (`../cards/`)
- Atlas 1024×400 colour+alpha (normal atlas shipped 512×200); 4 variant rows × 8 azimuths; cell 128×100 px = 2.0776×1.6232 m.
- Cell framing: auto: cell width = atlas/naz; cell height fitted per tree to its height:width (max pixels per metre), capped at atlas/rows; rows below rows_used_px are empty.
- Variants: v0_a (model a, 1.032 m), v1_b (model b, 1.256 m), v2_a_mirrored (model a, 1.032 m, mirrored), v3_b_mirrored (model b, 1.256 m, mirrored).
- Rendered from final LOD0 (cistus_a_lod0.glb, cistus_b_lod0.glb geometry), same pivot/scale/units. Pivot = trunk base = cell bottom-centre, 10 px above bottom edge.
- Meshes: `cistus_card_cross.glb` 4 tris, `cistus_card_3plane.glb` 6 tris, `cistus_card_billboard.glb` 2 tris; units: 1.0 = height of variant-0 tree (1.03 m source = LOD0 height); instance scale = desired tree height in metres (scale 1.032 matches LOD0 exactly).
- Spec: `cistus_cards.json`.

| file | size |
|---|---|
| `cards/textures/cistus_cards_color.ktx2` | 141 KB |
| `cards/textures/cistus_cards_normal.ktx2` | 121 KB |

## Previews
- `out/preview.png`: per model, original | LOD0 | LOD1 (same ortho camera, Cycles)
- `out_ktx2/three_check.png`: three.js load test
- `cards/preview_threejs_cards.png`: LOD0 next to the card meshes in three.js

## Notes and caveats (cistus)
- *Cistus albidus* is a Mediterranean shrub. It is not native to NE Germany; use it sparingly as a grey-green low edge shrub, or swap it later.
- Variant `a` = 01_02 (1.08 m, widest) and `b` = 01_04 (1.20 m, fewest flowers). 01_01 was left out because its many pink flowers look out of place for a Müritz forest edge. A few flowers remain on a/b and appear in the baked templates.
- 01_04 failed CopyToBox twice. It was transferred in 8 MB parts (`%TEMP%\mtsplit`) and checked with SHA256.
- Only the 16 longest stems are kept as geometry. 512² textures. Translucency is not used.

