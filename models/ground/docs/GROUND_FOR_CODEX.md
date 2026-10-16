# Разнообразие лесной подстилки: трава, опавшие листья, каменные проплешины

Автор: Грок. Код приложения не трогал. Всё ниже — предложение для Кодекса, привязанное к текущему `src/lib/procScene.ts` (материал `terrain-near`), `canopyShade.ts` и `treeContact.ts`.

## 1. Проблема

Под лесом земля везде одна: `tileTex(uForest)` (TextureCan ground_0006, плитка 2,2 м + макро 29 м) с небольшой примесью `uMoss` по `mossPatch`. На длинном участке это однообразное коричневое поле. Вариативность дают только тень полога, `shFleck` и `treeContact`.

## 2. Новые текстуры (CC0, TextureCan)

Лежат в `models/ground/textures/`. Конвенция ровно как у `save_pbr()` в `tools/prepare-assets.py`:
цвет 1024² JPG q86 sRGB, нормаль 1024² JPG q92 **OpenGL** (+Y, как `forestfloor_n.jpg`), ORM 512² JPG q90 (R = AO, G = roughness, B = 0). Новое: `_h.jpg` 512² q92, линейная высота 0..1 (растянута по перцентилям 0,5–99,5 %).

| роль | TextureCan | файлы | плитка, м (предлагаю) |
|---|---|---|---|
| forestfloor (база, уже есть) | ground_0006, details/92 | добавлен только `forestfloor_h.jpg` | 2,2 (как сейчас) |
| forest_grass | ground_0009 «Grassland», details/130 | `.jpg`, `_n`, `_orm`, `_h` | 1,2 |
| forest_leaves | ground_0028 «Ground Covered by Maple Leaves», details/243 | `.jpg`, `_n`, `_orm`, `_h` | 1,4 |
| forest_rock | ground_0035 «Sandy Trail with Rocks, Pebbles and Plants», details/265 | `.jpg`, `_n`, `_orm`, `_h` | 2,6 |

Кредиты в формате `public/scene-assets/sources.json`: `models/ground/sources_addition.json` (влить в ключ `texturecan`).

**Цветокоррекция** (иначе слои выпадали бы из `forestfloor`, средняя яркость ≈ 89):
- grass: насыщенность ×0,62, сдвиг в оливковый, яркость → 86. Исходник ядовито-зелёный.
- leaves: исходник — осенний красно-оранжевый клён. Насыщенность ×0,55, сдвиг в коричневый, яркость 64 → 84. Читается как прошлогодняя листва; к осенним клёну и GenTree подходит.
- rock: это не скала, а светлая песчаная тропа с галькой. Контраст ×1,35, яркость 107 → 96. Как «проплешина» работает, как скальный выход — нет.

Бесшовность проверена (`docs/seam_check.json`: отношение перепада на шве к перепаду внутри 0,6–1,3 для всех карт; `docs/ground_strip_2x2tiles.jpg`).

## 3. Бюджет сэмплеров и памяти (почему массив)

Сейчас у `terrain-near` на med: `uSplat, uGrass, uSoil, uForest, uMoss, uFar, uGrassN, uSoilN, uForestN` (9) + `uShade` + `uFFTex` (forestFog.patch) + карта тени солнца ≈ **12**. Гарантированный минимум WebGL2 и реальный лимит Iris Xe (ANGLE/D3D11) — **16**. Три слоя отдельными текстурами = +6…+10 сэмплеров → не влезает.

**Предложение: два `THREE.DataArrayTexture` вместо `uForest` и `uForestN`** (сэмплеров столько же, 12):
- `uFloor` (sRGB, RGBA8, 1024², 4 слоя): RGB = цвет, **A = высота** из `_h.jpg`. Слои: 0 forestfloor, 1 grass, 2 leaves, 3 rock.
- `uFloorN` (linear, RGBA8, 1024², 4 слоя): RGB = нормаль, **A = AO** (R из `_orm.jpg`).
  Альфа у `SRGB8_ALPHA8` не гамма-кодируется, так что высота в A остаётся линейной.

Память GPU (RGBA8 + мипы ≈ ×1,33): 4 слоя × 5,3 МБ = 21,3 МБ на массив, вместе 42,7 МБ; минус старые `forestfloor` + `forestfloor_n` (10,7 МБ) → **≈ +32 МБ**. Для med можно сделать `uFloorN` 512² → +16 МБ. Загрузка по сети: +3,4 МБ JPG.
Позже — те же массивы в KTX2 (`ktx create --layers 4`, ETC1S цвет / UASTC нормали; KTX2Loader в three 0.186 отдаёт `CompressedArrayTexture`) → в 4–6 раз меньше VRAM.

## 4. Сборка массивов (procScene.ts, после загрузки `T`/`N`)

```ts
const FLOOR = ["forestfloor", "forest_grass", "forest_leaves", "forest_rock"]; // слой = индекс
const img = (n: string) => tl.loadAsync(ASSETS + n + ".jpg").then((t) => t.image as HTMLImageElement);
const [fc, fh, fn, fo] = await Promise.all([
  Promise.all(FLOOR.map((n) => img(n))),
  Promise.all(FLOOR.map((n) => img(n + "_h"))),
  Promise.all(FLOOR.map((n) => img(n + "_n"))),
  Promise.all(FLOOR.map((n) => img(n + "_orm"))),
]);
function packArray(rgb: HTMLImageElement[], alpha: HTMLImageElement[], srgb: boolean, size = 1024) {
  const cv = document.createElement("canvas"); cv.width = cv.height = size;
  const c2 = cv.getContext("2d", { willReadFrequently: true })!;
  // flip vertically = то же, что flipY=true у обычных текстур, чтобы ориентация и знак G нормали не поменялись
  c2.setTransform(1, 0, 0, -1, 0, size);
  const data = new Uint8Array(size * size * 4 * rgb.length), L = size * size * 4;
  rgb.forEach((im, i) => {
    c2.drawImage(im, 0, 0, size, size); data.set(c2.getImageData(0, 0, size, size).data, i * L);
    c2.drawImage(alpha[i], 0, 0, size, size); const a = c2.getImageData(0, 0, size, size).data;
    for (let k = 0; k < size * size; k++) data[i * L + k * 4 + 3] = a[k * 4]; // R канал → A
  });
  const t = new THREE.DataArrayTexture(data, size, size, rgb.length);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.minFilter = THREE.LinearMipmapLinearFilter; t.magFilter = THREE.LinearFilter;
  t.generateMipmaps = true; t.anisotropy = Math.min(8, maxAniso);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true;
  return track(t);
}
const floorC = packArray(fc, fh, true);   // RGB цвет + A высота
const floorN = packArray(fn, fo, false);  // RGB нормаль + A AO
```
`forestfloor.jpg`/`forestfloor_n.jpg` из списков `T`/`N` можно убрать, если они больше нигде не нужны (сейчас используются только в терейне).

## 5. Шейдер `terrain-near`

### 5.1 pars (в замену `uniform sampler2D ... uForest ... uForestN`)
```glsl
precision mediump sampler2DArray;
uniform sampler2DArray uFloor, uFloorN;
// плитка (м) и фиксированный поворот на слой. Поворот константный: вращение по шуму даёт завихрения и муар.
const vec4 FL_TILE = vec4(2.2, 1.2, 1.4, 2.6);
vec2 flUv(vec2 p, int i) {
  vec2 r = i == 1 ? vec2(0.6, 0.8) : i == 2 ? vec2(-0.28, 0.96) : i == 3 ? vec2(0.96, -0.28) : vec2(1.0, 0.0);
  return mat2(r.x, r.y, -r.y, r.x) * p / FL_TILE[i] + float(i) * vec2(0.37, 0.61);
}
// height blend: слой «вылезает» сначала верхушками (листья, камни, стебли), потом заливает
float flBlend(float m, float hb, float hl) {
  float a = hl * 0.5 + m, b = hb * 0.5 + (1.0 - m), ma = max(a, b) - 0.2;
  float wa = max(a - ma, 0.0), wb = max(b - ma, 0.0);
  return wa / (wa + wb + 1e-5);
}
```
`shNoise()` уже есть в `shade.groundPars` — новых текстур под маски не нужно.

### 5.2 map_fragment: заменить член `mix(tileTex(uForest, …), tileTex(uMoss, …), …) * 0.55 * sp.b`
```glsl
vec2 fwp = vWPos.xz;
vec3 flW = vec3(0.0);             // итоговые веса слоёв 1..3, нужны блоку нормалей
vec3 forestc = vec3(0.0);
if (sp.b > 0.01) {
  vec4 b0 = texture(uFloor, vec3(fwp / 2.2, 0.0));
  float lb = dot(texture(uFloor, vec3(mat2(0.8, -0.6, 0.6, 0.8) * fwp / 29.0, 0.0)).rgb, vec3(0.33)); // макро, как в tileTex
  vec3 c = b0.rgb; float h = b0.a;
  vec2 shv = texture2D(uShade, (fwp - uShadeO) / uShadeS).rg;   // cC = полог, cA = contact AO; тот же fetch, что в groundGlsl (поднять и переиспользовать)
  float fade = 1.0 - smoothstep(90.0, 140.0, length(vWPos - cameraPosition)); // дальше всё равно уходит в farc
  float slope = 1.0 - clamp(normalize(vWN).y, 0.0, 1.0);
  // маски: мировой value noise, 2–3 октавы, пороги подобраны на 600×600 м
  float mR = smoothstep(0.78, 0.85, shNoise(fwp / 13.0 + 31.7) * 0.75 + shNoise(fwp / 3.0) * 0.25 + 1.2 * slope) * (1.0 - 0.6 * shv.g);
  float mL = smoothstep(0.62, 0.69, shNoise(fwp / 4.0 + 11.0) * 0.5 + shNoise(fwp / 1.3 + 3.0) * 0.35 + shNoise(fwp / 0.45) * 0.15 + 0.2 * shv.r + 0.3 * shv.g - 0.12);
  float mG = smoothstep(0.46, 0.54, shNoise(fwp / 9.0 - 7.0) * 0.55 + shNoise(fwp / 3.0 + 9.0) * 0.3 + shNoise(fwp / 0.6) * 0.15 + 0.45 * (1.0 - shv.r) - 0.25 * shv.g - 0.18);
  vec3 m = vec3(mG, mL, mR) * fade;
  // порядок: камень → листья → трава (листья ложатся на камень, трава прорастает поверх всего)
  if (m.z > 0.002) { vec4 l = texture(uFloor, vec3(flUv(fwp, 3), 3.0)); flW.z = flBlend(m.z, h, l.a); c = mix(c, l.rgb, flW.z); h = mix(h, l.a, flW.z); }
  if (m.y > 0.002) { vec4 l = texture(uFloor, vec3(flUv(fwp, 2), 2.0)); flW.y = flBlend(m.y, h, l.a); c = mix(c, l.rgb, flW.y); h = mix(h, l.a, flW.y); flW.z *= 1.0 - flW.y; }
  if (m.x > 0.002) { vec4 l = texture(uFloor, vec3(flUv(fwp, 1), 1.0)); flW.x = flBlend(m.x, h, l.a); c = mix(c, l.rgb, flW.x); flW.yz *= 1.0 - flW.x; }
  c *= 0.65 + 0.9 * lb / max(0.05, dot(c, vec3(0.33)) * 0.5 + 0.5 * lb);
  float cover = flW.x + flW.y + flW.z;
  forestc = mix(c, tileTex(uMoss, fwp * 0.7), (0.08 + mossPatch * 0.55) * (1.0 - cover)); // мох только на голой подстилке
}
vec3 col = grass * sp.r + tileTex(uSoil, vWPos.xz) * sp.g + forestc * 0.55 * sp.b + grass * vec3(1.35, 1.15, 0.55) * wStub;
```
`tileTex` для `uForest` больше не нужен (он принимает `sampler2D`), макро-модуляция теперь одна на всю смесь — один fetch на 29 м вместо одного на слой.

### 5.3 normal_fragment_maps (внутри `#ifdef GROUND_NORMALS`) — вместо `nF`
```glsl
vec4 f0 = texture(uFloorN, vec3(fwp / 2.2, 0.0));
vec3 nF = f0.xyz * 2.0 - 1.0; float aoF = f0.a;
if (flW.z > 0.002) { vec4 t = texture(uFloorN, vec3(flUv(fwp, 3), 3.0)); nF = mix(nF, t.xyz * 2.0 - 1.0, flW.z); aoF = mix(aoF, t.a, flW.z); }
if (flW.y > 0.002) { vec4 t = texture(uFloorN, vec3(flUv(fwp, 2), 2.0)); nF = mix(nF, t.xyz * 2.0 - 1.0, flW.y); aoF = mix(aoF, t.a, flW.y); }
if (flW.x > 0.002) { vec4 t = texture(uFloorN, vec3(flUv(fwp, 1), 1.0)); nF = mix(nF, t.xyz * 2.0 - 1.0, flW.x); aoF = mix(aoF, t.a, flW.x); }
// дальше как сейчас: nt = nG*(sp.r+wStub) + nS*sp.g + nF*sp.b ...
diffuseColor.rgb *= mix(1.0, aoF, 0.5 * sp.b * (1.0 - blendFar)); // AO в ямках между листьями/камнями
```
Важно: у новых слоёв свой UV (поворот + плитка), а не общий `nuv = vWPos.xz / 2.2`. Иначе нормали «поплывут» относительно цвета. Слой 0 оставить на `/2.2`.
Ветки `if (w > 0.002)` дешёвые: маски низкочастотные, в пределах варпа почти всегда одна ветка.

## 6. Правила размещения (что в масках выше)

- **Трава** — где полог реже: `+0.45 * (1 - cC)` (кромка леса, поляны, просеки), меньше у стволов (`-0.25 * cA`). Под густым пологом ≈ 8 %, на кромке почти сплошная. Обочины в лесу: если `cC` на дороге остаётся высоким (зависит от того, как landcover размечает дорогу), добавить канал «дистанция до обочины» — см. п. 8. 3D-пучки на обочинах (`forestGrass.ts`, `vergeEnabled`) остаются как есть, плоская трава лишь подкладка под них.
- **Листья** — под пологом (`+0.2 * cC`) и гуще у стволов (`+0.3 * cA` = contact AO из `bakeCanopyShade`). Под пологом ≈ 25–35 %, у ствола пятно почти всегда. Хорошо сочетается с кольцом травы и затемнением из `treeContact`.
- **Камень** — редкие пятна 3–8 м, ≈ **3 %** площади на ровном (порог 0,78–0,85 ≈ 97-й перцентиль шума), больше на склонах (`+1.2 * slope`, где `slope = 1 - N.y`: 15° → +0,04, 30° → +0,16), не у самых стволов (`* (1 - 0.6 * cA)`).
- Всё затухает к 90–140 м (`fade`): дальше `blendFar` и так тянет цвет к `farc`.

Превью логики (numpy, те же формулы и шум): `docs/mock_blend_40m.jpg` (открытая кромка слева → лес справа, склон сверху), `docs/mock_blend_8m_close.jpg` (вблизи, под пологом, видно height-blend по краям листьев). Сравнение текстур: `docs/ground_strip_2x2tiles.jpg`, `docs/raw_vs_adjusted.jpg`. Сама «пятнистость» на превью без перспективы и без 3D-травы выглядит грубее, чем будет в кадре.

## 7. Стоимость на med

- Сэмплеры: 12 → 12 (два массива вместо `uForest`/`uForestN`).
- Fetch на пиксель в лесу: база 2 (как было: `tileTex`) + `uShade` 1 (переиспользовать с `groundGlsl`) + 0–3 цвета слоёв + 0–3 нормали. Типично +1–2, на стыке двух слоёв +4. Вне леса (`sp.b ≤ 0.01`) ничего не добавляется.
- ALU: 7–8 вызовов `shNoise` (по 4 `sin`-хеша) в лесу. Если дорого — убрать третьи октавы (`/0.45`, `/0.6`): края станут ровнее, но не хуже текущего мха.
- Память: +32 МБ VRAM (или +16 МБ с `uFloorN` 512²), +3,4 МБ загрузки. CPU-копии массивов (2 × 16 МБ) после первой отрисовки можно отпустить.
- Замер в тех же точках (3910 и 4620 м), med, запись в `HANDOFF.md`. Флаг на сравнение: например `?floor=0/1`.

## 8. Опционально, если правил выше мало

Маленькая RG8-текстура на сетке landcover (2 м, как `uShade`, +1 сэмплер → 13): R = близость к обочине (из `roadFree`/хеша трека, который уже есть в `procScene.ts`), G = «листопадность» полога (сумма крон лиственных типов из `trees[]`, хвойным — 0). Тогда трава точно идёт вдоль обочин, а листья только под лиственными. Канал B/A у `uShade` занят `treeContact`, поэтому отдельная текстура.

## 9. Как разложить файлы

- Источник: `models/ground/textures/*.jpg` (13 файлов), кредиты `models/ground/sources_addition.json`, скрипты сборки в `tools/asset-pipeline/ground/` (`build_ground.py`, `mock_blend.py`, `preview.py`; запускать не обязательно).
- Проще всего: один раз скопировать `models/ground/textures/*.jpg` в `public/scene-assets/` (плоско, рядом с `forestfloor.jpg`; загрузчик `ASSETS + n + ".jpg"` подхватит) и влить `sources_addition.json` в `public/scene-assets/sources.json` под `texturecan`. Это CC0, как остальные текстуры, и коммитится так же, как вывод `prepare-assets.py`.
- Или: добавить в `tools/prepare-local-models.mjs` шаг `GROUND`, который копирует `models/ground/textures/*.jpg` в `public/scene-assets/` (без `rmSync` — папка общая с другими текстурами, копировать поштучно по списку).
- Для воспроизводимости можно ещё добавить в `TEXTURECAN` в `prepare-assets.py`: `"forest_grass": 130, "forest_leaves": 243, "forest_rock": 265` и шаг с цветокоррекцией из `build_ground.py` (там же параметры `ADJ`).

## 10. Порядок внедрения

1. Массивы + только база (слой 0) — картинка должна совпасть с текущей. Замер.
2. Листья (самый заметный эффект под пологом). Замер, снимок.
3. Трава по `cC`, потом камень. Замер.
4. Нормали/AO слоёв (только с `GROUND_NORMALS`, т.е. med/high).
5. Если надо — п. 8 и KTX2-массивы.
