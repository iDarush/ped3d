# Maxtree Plant Models Vol.60: forest + understory set for ride3d

Built from `models/raw/collection` (Maxtree **Plant Models Vol.60**, files `MT_PM_V60_*`, Blender Cycles/Eevee version) with treekit (Blender 5.0.1 headless + KTX-Software 4.4.2).
There is **no licence file in the collection folder** (only `blender_assets.cats.txt`). Licence = whatever Darya's Maxtree purchase grants: typically the Maxtree standard licence (use in projects, no resale or redistribution of the source models/textures). This zip carries **no source .blend or source maps**, only derived, optimised game assets. Please confirm.

| species (role) | variants (source file) | LOD0 tris | LOD1 tris | cards | textures |
|---|---|---|---|---|---|
| alder *Alnus cremastogyne* (tree) | a = 01_04 (14.76 m), b = 01_02 (10.72 m) | 4,218 / 4,222 | 1,240 / 1,252 | 4×8 atlas 2048×1536 | 1024² bark c/n/r + foliage c/n |
| maple *Acer buergerianum* (tree, autumn leaves) | a = 01_03 (12.46 m), b = 01_01 (12.22 m) | 4,180 / 4,225 | 1,245 / 1,250 | 4×8 atlas 2048×1264 | 1024² bark c/n + foliage c/n |
| abelia *A. × grandiflora* (shrub) | a = 01_03 (1.44 m), b = 01_04 (1.19 m) | 1,387 / 1,382 | 520 / 520 | 4×8 atlas 1024×464 | 512² |
| cistus *C. albidus* (shrub) | a = 01_02 (1.03 m), b = 01_04 (1.26 m) | 1,449 / 1,360 | 522 / 521 | 4×8 atlas 1024×400 | 512² |
| lolium *L. perenne* (grass) | a = 01_04 (0.47 m), b = 01_06 (0.27 m) | 6 / 6 (3-quad star) | none | not needed (already cards) | 512² foliage c/n |
| setaria *S. viridis* (grass) | a = 01_06 (0.28 m), b = 01_03 (0.17 m) | 6 / 6 (3-quad star) | none | not needed | 1024² foliage c/n |

All glbs: max 2 materials (`bark` opaque, `foliage` alpha MASK 0.5, double-sided, opacity in colour alpha), shared external KTX2 (KHR_texture_basisu),
metres, Y up, origin at the trunk/clump base, transforms applied, `gltf-transform validate`: 0 errors. Cards are rendered from the final LOD0 with the same pivot (instance scale = height in metres).

Layout: `<species>/out_ktx2/` (web LODs + textures + README + three.js check), `<species>/cards/` (card glbs, KTX2 atlases, `<species>_cards.json`), `<species>/out/REPORT.md` (full report + caveats),
`birch_fix/` (corrected birch card normal atlas, drop-in for `models/birch/cards/textures/birch_cards_normal.ktx2`), `final/` (mock forest scene, LOD0 contact sheet with 1.75 m figure, per-species previews).
Budgets: `final/budget.json` (download + estimated GPU memory per species).
