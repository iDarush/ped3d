# gentree — game-ready LODs

Source: TurboSquid free model GenTree-103 by LazarusLong (GenTree-103_AE3D_03122023-F1.blend, Blender 3.4)  
Licence: **TurboSquid free model GenTree-103 by LazarusLong, TurboSquid Standard License (free) — user to confirm**  
Built by treekit (`/workspace/kickr/treekit`, `run.sh gentree`), Blender 5.0.1 headless.

## Triangles
| | bark | foliage | total | verts | glb (embedded PNG/JPG) |
|---|---|---|---|---|---|
| original | 13520 (+ twigs 62528) | 14518 | 90566 | 73534 | — |
| **LOD0** | 2346 | 1680 (840 cards) | **4026** | 4655 | 5.71 MB |
| **LOD1** | 634 | 600 (300 cards) | **1234** | 1563 | 5.53 MB |

Web version with shared KTX2 textures: `../out_ktx2/` (see its README; ~368 KB of geometry + shared textures).

## Materials: 2
- `bark` — opaque, base colour + normal + roughness **texture** (`bark_rough.png`, G = 1 − SMOOTH; min/mean/max [0.027, 0.629, 1.0], not constant), metallic 0.
- `foliage` — alpha **MASK** (cutoff 0.5), double-sided, opacity in `foliage_color.png` alpha, normal map, roughness factor 0.5 (constant in source), metallic 0.

## Textures (embedded in each glb; copies in `textures/`)
| file | size | bytes |
|---|---|---|
| `bark_color.jpg` | 1024×1024 RGB | 473 KB |
| `bark_normal.png` | 1024×1024 RGB | 2.07 MB |
| `bark_rough.png` | 1024×1024 RGB | 737 KB |
| `foliage_color.png` | 1024×1024 RGBA | 1.28 MB |
| `foliage_normal.png` | 1024×1024 RGB | 755 KB |

No sun/shadows baked: foliage atlas = unlit albedo × soft ambient occlusion only.
Source images relinked case-insensitively (`_2k` variants used): 5; missing and ignored (by design): gentree_2_trunk_limbs_ae3d_03312023-a-height.png.

## Transform
Metres, glTF Y-up, origin = trunk base ring centre (shift applied [-0.0076, 0.0001, 0.0154] m), all transforms applied.
LOD0 bbox (Blender Z-up): x -6.459…6.635, y -6.302…8.067, z 0…16.813 m. Source height 16.845 m (kept real; not rescaled).

## Validation (gltf-transform validate)
- `gentree_lod0.glb`: 0 errors
- `gentree_lod1.glb`: 0 errors

`preview.png` = original | LOD0 | LOD1 (same ortho camera, Cycles).

## Method

**Bark (trunk + primary limbs, `Main Trunk`, 61 limb components).** Simplified on its own: collapse-decimation with a binary search to the target tris, using a protect vertex group:
- base flare (z < 1.2 m) is fully protected;
- each fork junction (0.45 m around the lowest vertex of every limb) is protected at 0.8 weight.

LOD1 first removes 38 thin limbs (radius < 3.5 cm), then decimates. After decimation, zero-area faces are dissolved. One mikktspace tangent in LOD1 came out zero (a sliver vertex whose custom normal was about 90° to its face) and was repaired, so the validator reports 0 errors.

**Foliage (leaf-cluster cards).** The source has 7,259 single-quad leaves on about 62k twig triangles. Neither can be decimated sensibly, so both are replaced by baked cluster cards:
1. **k-means** on leaf face centres: k = 420 for LOD0 (median 16 leaves per cluster), k = 150 for LOD1 (median 41). Twig faces are assigned to the nearest cluster if they lie within 1.3·r + 0.1 m; 99% are assigned, and the remaining ~1% are dropped.
2. **Templates.** Representative clusters (40–70th percentile of leaf count, on the crown exterior, more than 2 m apart): 5 small and 3 large. Each is rendered along its PCA plane (orthographic, 512 px) in two passes:
   - **albedo**: unlit × soft AO, no sun;
   - **normal**: camera-space, 50% leaf normal + 50% cluster-sphere normal.

   Templates are cropped to their opaque bbox and shelf-packed into one 1024² `foliage_color.png` (RGBA, opacity in alpha) and `foliage_normal.png`, dilated. Opaque fraction is 12%.
3. **Cards.** Each cluster becomes a PCA-oriented quad at the cluster centre, with its tilt clamped to |n_z| ≤ 0.55 so cards don't lie flat. It uses the template whose aspect matches best (random pick among the top 2), scaled by √(area ratio) × 0.92. A second, crossed quad sits in the (normal, up) plane at 0.7 scale, so clusters keep volume from every azimuth.

   Result: LOD0 has 840 cards (1,680 tris), LOD1 has 300 cards (600 tris). The secondary twigs live only in the templates; the primary limbs remain real geometry.

## Caveats
- **Height:** the asset keeps the real **16.8 m** (LOD0 16.81 m; source 16.85 m incl. leaf tips). The consumer (Codex) currently caps runtime tree height at **12 m**, so for that cap, scale instances by ≈ 0.71, or raise the cap for this species.
- **Autumn colour:** the source leaf texture is yellow/orange (sweetgum-like). It is kept as is. If a green summer look is needed, tint `foliage_color` or apply a hue shift in the shader; the cards use the same atlas colours.
- Foliage looks a little less sun-bright than the original in the preview. That is expected, because the templates carry no baked sun (as specified); the light comes from the runtime.
- Cluster cards are planar. From very close (< 5 m) under the crown, the card planes are visible. This is the usual trade-off at this tris budget.
- The bark roughness map is not constant (SMOOTH texture: 1 − smooth spans 0.03–1.0), so it ships as a texture (`bark_rough.png`, G channel), not a factor.
- DISP / HEIGHT / SPEC are absent by design. The .blend only references HEIGHT (in the trunk/twig materials); that node was unplugged gracefully. glTF has no slot for these maps anyway.
- The crown is asymmetric (bbox y −6.3…+8.5 m around the trunk). This matters for impostor framing (see `../cards/PROPOSAL_FOR_CODEX.md`).

## Cards / impostors (`../cards/`)
- Rendered from **this final LOD0** with the same pivot (trunk base), metres and scale, so the LOD→card switch does not pop.
- Atlas: 4 variants × 8 azimuths, 256×448 px cells, 2048² (same as birch). The normal atlas ships at 1024².
- Cell world size **19.43 × 34.01 m**. Framing is width-limited (asymmetric crown, plus v3 is 10% wider), so the tree fills only about the lower half of each cell.
- The bottom 256 px row is unused (understory and forest band skipped for this tree).
- Mesh unit = 16.813 m (v0 = LOD0 height): instance scale = tree height in metres. `quad_w` 1.156, `quad_h` 2.0229, `pivot_v` 0.0223.

