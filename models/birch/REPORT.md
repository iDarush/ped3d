# Birch (TurboSquid 2561468) — game-ready LODs

**License source:** TurboSquid product 2561468 (https://www.turbosquid.com/FullPreview/2561468), purchased/downloaded by Darya Savelova;
TurboSquid Standard (royalty-free) License as sold on TurboSquid — *exact license name to be confirmed by the user*.
Not redistributable as a standalone model; use embedded in the app only.

## Triangles
| LOD | bark (trunk+branches) | foliage cards | total | verts | glb size |
|---|---|---|---|---|---|
| source | 2912 | 740 | 3652 | 2656 | – |
| LOD0 | 2912 | 740 | **3652** | 2656 | 2997 KB |
| LOD1 | 722 | 627 | **1349** | 1323 | 2919 KB |

## Materials: 2
- `bark` — opaque, single-sided; baseColor + normal; roughnessFactor 0.906 (source roughness map is a constant image, so no texture is shipped; `--roughness-maps` forces one into the G channel).
- `foliage` — alphaMode **MASK**, alphaCutoff 0.5 (glTF default), doubleSided; baseColor RGBA (opacity in A) + normal; roughnessFactor 0.906.

## Textures (embedded in each glb; copies in `textures/`)
| file | size | bytes |
|---|---|---|
| bark_color.jpg | 1024×1024 | 309 KB |
| bark_normal.png | 1024×1024 | 1004 KB |
| foliage_color.png | 1024×1024 | 1113 KB |
| foliage_normal.png | 1024×1024 | 415 KB |

Foliage atlas: only the 3 regions referenced by the cards were cropped and repacked (they covered 43% of the 2048² source); texel density is 0.68× the 2048 source (a plain 1024 downscale would give 0.50×). The transparent texels have color dilated from neighbouring leaves (no dark halos in mips).
Bark: trunk UVs only used the right half (U 0.5–1.0) of the 2048² bark texture, so that half was cropped to 1024² and the UVs were remapped.
Baked lighting: no directional sun shadows or AO found in the diffuse maps; the dark marks on the bark are birch lenticels, and the leaves only vary in colour per leaf.

## Transform
Metres, glTF Y up (Blender Z-up → Y-up on export), origin at the trunk base centre (shifted by [-0.0004, 0.009, -0.0217] m), no node transforms. Height 4.943 m and trunk base Ø ≈ 0.10 m: proportions fit a young birch, so the model was **not rescaled**. Scale the instances by ×3–4 for a mature 15–20 m birch.

## LOD1 method (trunk and foliage simplified separately)
- Trunk: Decimate (collapse) at 0.35, with a protect weight group on the base flare (z<0.35 m) and around the 16 fork/branch junctions.
- Branches (9 tubes, 1980 tris, which used a bark strip in the leaf atlas): moved to the `bark` material, Decimate at 0.20. 0 tiny pieces dropped.
- Leaf cards: no decimation of card geometry. 155/182 cards kept, chosen by outer-silhouette score with a 0.8 m voxel coverage pass, then scaled ×1.12 about their own centres (86% of the card area kept before enlarging).
- LOD0 = the full source geometry (3652 tris is already inside the 3–6k budget), cleaned: 2 materials, 1 UV set, atlas remapped.

## Validation (gltf-transform validate)
```
== out/birch_lod0.glb
info: No errors found.
info: No warnings found.
== out/birch_lod1.glb
info: No errors found.
info: No warnings found.
```

## Caveats
- The source .blend was saved by Blender 5.0 (zstd, new file header), so the pipeline uses Blender 5.0.1. 4.x LTS can't open it; the output `birch_source.blend` is also 5.0 format.
- Normal maps are assumed to be OpenGL (+Y), as used in the source Blender material.
- The glbs embed PNG textures, about 3 MB each, and LOD0 and LOD1 duplicate them. For the web, share textures between LODs and/or convert to KTX2/WebP, e.g. `gltf-transform etc1s/uastc`.
- Node layout per glb: `birch_lodN_bark` + `birch_lodN_foliage` (one primitive each = 2 draw calls).

Rebuild: `./build.sh` (runs `blender -b -P build_tree.py`, `render_preview.py`, validate, this report).
