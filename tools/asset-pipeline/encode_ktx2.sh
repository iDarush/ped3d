#!/usr/bin/env bash
# cards/src/*.png -> cards/textures/*.ktx2
#  colour+alpha: ETC1S sRGB RGBA with alpha-COVERAGE-PRESERVING mips (coverage_mips.py) -> crowns don't thin out at distance
#  normals: UASTC q3 + RDO + zstd, linear, standard mips, shipped at 1024^2 (same UV layout)
set -euo pipefail; cd "$(dirname "$0")"; mkdir -p textures; rm -rf _mips
C=(--encode basis-lz --clevel 4 --qlevel 255)
N=(--encode uastc --uastc-quality 3 --uastc-rdo --uastc-rdo-l 1.0 --zstd 18 --generate-mipmap)
python3 coverage_mips.py src/birch_cards_color.png _mips/cards birch_cards.json
python3 coverage_mips.py src/forest_band_color.png _mips/band
ktx create --format R8G8B8A8_SRGB --assign-tf srgb "${C[@]}" --levels $(ls _mips/cards | wc -l) _mips/cards/mip_*.png textures/birch_cards_color.ktx2
ktx create --format R8G8B8A8_SRGB --assign-tf srgb "${C[@]}" --levels $(ls _mips/band | wc -l) _mips/band/mip_*.png textures/forest_band_color.ktx2
python3 -c "from PIL import Image; Image.open('src/birch_cards_normal.png').resize((1024,1024), Image.LANCZOS).save('src/birch_cards_normal_1024.png')"
ktx create --format R8G8B8_UNORM --assign-tf linear "${N[@]}" src/birch_cards_normal_1024.png textures/birch_cards_normal.ktx2
ls -la textures
