#!/usr/bin/env bash
# Rebuild all card assets: renders (Blender 5.0 Cycles) -> atlases/JSON/glb(PNG) -> KTX2 -> glb(KTX2) -> checks/previews
# usage: cards/build_cards.sh [--no-mock]     (needs ../out/birch_source.blend from ../build.sh)
set -euo pipefail; cd "$(dirname "$0")"
blender -b -P make_cards.py
./encode_ktx2.sh
( cd ../tools && node cards_ktx2.mjs && node cards_check.mjs )
for f in *.glb; do echo "== $f"; npx -y @gltf-transform/cli@4 validate "$f" 2>&1 | grep -E "No errors|error" | head -3; done
[ "${1:-}" = "--no-mock" ] || blender -b -P mock_scene.py
python3 contact_sheet.py
