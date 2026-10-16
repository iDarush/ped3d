# setaria: сухой (соломенный) вариант

- `ktx2/setaria_{a,b}_lod0_dry.glb`: та же геометрия (6 треугольников), цвет из `textures/foliage_color_dry.ktx2` (1024², ETC1S sRGB RGBA, мипы с сохранением покрытия альфы, 216 KB). Normal общий: `foliage_normal.ktx2`.
- Получено перекраской декодированного `foliage_color.ktx2` скриптом `tools/asset-pipeline/field_verge/dry_variant.py`: яркость сохраняется, тон уходит в солому, остаётся 25 % исходного оттенка. Повторное ETC1S-кодирование даёт небольшую потерю качества.
- Для чего нужен: обочины в поле, см. `models/_preview/field_verge/FIELD_VERGE_FOR_CODEX.md`.
