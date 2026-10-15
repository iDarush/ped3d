#!/usr/bin/env python3
"""Prepare CC0 textures for the procedural scene (run once; output is committed to public/scene-assets).

Downloads ambientCG (CC0) material zips + one Poly Haven (CC0) sky HDRI into a cache folder,
then writes small web-ready textures:
  grass/soil/moss: ambientCG 512 px colour (+ normal for grass/soil)
  forest floor, asphalt, gravel, bark, roof, brick, plaster: TextureCan 1K PBR (colour, normal, AO+roughness packed)
  facades: brick / plaster tiles with procedurally painted windows (1 storey x 1 bay per tile)
  leaves_broad.png: a crown "cluster card" composited from ~300 real leaf photos (LeafSet009)
  needles.png: a pine branch card drawn procedurally
Usage: python3 tools/prepare-assets.py [cacheDir]
"""
import io, math, os, random, sys, urllib.request, zipfile, json
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance, ImageOps

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CACHE = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "..", "assets-cache")
OUT = os.path.join(ROOT, "public", "scene-assets")
os.makedirs(CACHE, exist_ok=True); os.makedirs(OUT, exist_ok=True)
rnd = random.Random(7)

ACG = {  # role -> ambientCG asset id (all CC0, https://docs.ambientcg.com/license/)
    "grass": "Grass001", "soil": "Ground048", "moss": "Ground037", "leaves": "LeafSet009",
}
# TextureCan (CC0, https://www.texturecan.com/terms/): PBR sets with normal / roughness / AO maps, 1K.
# role -> detail page id; the 1K zip link is read from https://www.texturecan.com/details/<id>/
TEXTURECAN = {
    "forestfloor": 92,   # Forest Ground Texture with Twigs, Pebbles and Rocks (ground_0006)
    "asphalt": 5,        # Grey Asphalt Texture (asphalt_0001)
    "bark": 214,         # Tree Bark Texture (wood_0025)
    "brick": 81,         # PBR Red Brick Texture with Trowel Marks (bricks_0008)
    "plaster": 199,      # Stucco Plaster with Trowel Marks (concrete_0012)
    "roof": 556,         # Orange Clay Rooftop Tiles (rooftop_0008)
    "gravel": 194,       # Ground Covered with Gravel (ground_0020)
}
TC_HEADERS = {"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
              "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"}
HDRI = ("kloofendal_48d_partly_cloudy_puresky", "https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/2k/kloofendal_48d_partly_cloudy_puresky_2k.hdr")

def fetch(url, path, headers=None):
    if not os.path.exists(path):
        print("download", url)
        req = urllib.request.Request(url, headers=headers or {"User-Agent": "ride3d-poc asset prep"})
        with urllib.request.urlopen(req, timeout=180) as r, open(path, "wb") as f: f.write(r.read())
    return path

def acg(asset, kind="Color"):
    z = zipfile.ZipFile(fetch(f"https://ambientcg.com/get?file={asset}_1K-JPG.zip", os.path.join(CACHE, f"{asset}.zip")))
    name = next(n for n in z.namelist() if n.endswith(f"_{kind}.jpg"))
    return Image.open(io.BytesIO(z.read(name)))

TC_SOURCES = {}
def texturecan(role):
    """Returns (zipfile, page url, zip url) for a TextureCan set (cached)."""
    tid = TEXTURECAN[role]; page = f"https://www.texturecan.com/details/{tid}/"
    html = open(fetch(page, os.path.join(CACHE, f"tc-{tid}.html"), TC_HEADERS), encoding="utf-8", errors="ignore").read()
    import re
    href = re.search(r'href="(/downloads/[^"]+_1k_[^"]+\.zip)"', html).group(1)
    url = "https://www.texturecan.com" + href
    TC_SOURCES[role] = {"page": page, "zip_1k": url, "license": "CC0 1.0 (https://www.texturecan.com/terms/)"}
    return zipfile.ZipFile(fetch(url, os.path.join(CACHE, f"tc{tid}.zip"), {**TC_HEADERS, "Referer": page}))

def tc_map(z, kind):
    name = next((n for n in z.namelist() if not n.startswith("__") and f"_{kind}_" in n), None)
    return Image.open(io.BytesIO(z.read(name))) if name else None

def save_pbr(role, z, color=None, size=1024, tile=None):
    """color (1K) + normal (OpenGL, 1K) + ORM-packed AO/roughness (512: R = AO, G = roughness)."""
    c = color or tc_map(z, "color").convert("RGB")
    n = tc_map(z, "normal_opengl").convert("RGB")
    ao = tc_map(z, "ao"); rough = tc_map(z, "roughness")
    ao = (ao or Image.new("L", c.size, 255)).convert("L").resize((512, 512), Image.LANCZOS)
    rough = (rough or Image.new("L", c.size, 220)).convert("L").resize((512, 512), Image.LANCZOS)
    if tile:  # repeat to change the physical size of one texture tile
        c, n, ao, rough = [repeat(im, tile) for im in (c, n, ao, rough)]
    c.convert("RGB").resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"{role}.jpg"), quality=86)
    n.resize((size, size), Image.LANCZOS).save(os.path.join(OUT, f"{role}_n.jpg"), quality=92)
    Image.merge("RGB", (ao.resize((512, 512)), rough.resize((512, 512)), Image.new("L", (512, 512), 0))).save(os.path.join(OUT, f"{role}_orm.jpg"), quality=90)

def repeat(im, k):
    w, h = im.size; big = Image.new(im.mode, (w * k, h * k))
    for i in range(k):
        for j in range(k): big.paste(im, (i * w, j * h))
    return big

def save_jpg(img, name, size=512, q=85):
    img.convert("RGB").resize((size, size), Image.LANCZOS).save(os.path.join(OUT, name), quality=q)

# --- tiling ground / road / bark ---
for role in ["grass", "soil", "moss"]:
    save_jpg(acg(ACG[role]), f"{role}.jpg")
# ambientCG normal maps for the two big ground layers that stay on ambientCG
for role in ["grass", "soil"]:
    acg(ACG[role], "NormalGL").convert("RGB").resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, f"{role}_n.jpg"), quality=90)
for role in ["forestfloor", "bark", "gravel"]:
    save_pbr(role, texturecan(role))
# asphalt_0001 is fresh, near-black asphalt with a coarse grain at our 4 m road UV tile:
# brighten it to weathered rural asphalt and repeat 2x2 so the grain is ~half size
z = texturecan("asphalt")
from PIL import ImageEnhance
def flatten(im, target=96, radius=48):
    """Remove large-scale light/dark blotches (they repeat visibly on a long road), mostly
    desaturate (the source is slightly blue) and set the mean brightness."""
    from PIL import ImageFilter, ImageChops, ImageStat
    w, h = im.size
    low = repeat(im, 3).filter(ImageFilter.GaussianBlur(radius)).crop((w, h, 2 * w, 2 * h))  # wrap-aware
    mean = [round(v) for v in ImageStat.Stat(im).mean]
    hp = ImageChops.subtract(im, low, offset=128)  # im - low + 128
    out = Image.merge("RGB", [ch.point(lambda v, m=m: max(0, min(255, v - 128 + m))) for ch, m in zip(hp.split(), mean)])
    out = ImageEnhance.Color(out).enhance(0.35)
    return ImageEnhance.Brightness(out).enhance(target / max(1, sum(mean) / 3))
c = flatten(tc_map(z, "color").convert("RGB"))
save_pbr("asphalt", z, color=c, tile=2)
z = texturecan("roof"); save_pbr("roof", z)


# --- facades with windows: tile = 3 m wide x 3 m high (one storey, one bay) ---
def window_box(S):
    px = S / 3.0
    x0, x1 = int((1.5 - 0.55) * px), int((1.5 + 0.55) * px)
    y0, y1 = int(S - (0.9 + 1.3) * px), int(S - 0.9 * px)
    return x0, y0, x1, y1

def facade(name, z, repeat_k, frame="#f2efe8", tint=None):
    S = 1024
    tile = repeat(tc_map(z, "color").convert("RGB"), repeat_k).resize((S, S), Image.LANCZOS)
    nrm = repeat(tc_map(z, "normal_opengl").convert("RGB"), repeat_k).resize((S, S), Image.LANCZOS)
    ao = tc_map(z, "ao").convert("L"); rough = tc_map(z, "roughness").convert("L")
    orm = Image.merge("RGB", (repeat(ao, repeat_k).resize((512, 512)), repeat(rough, repeat_k).resize((512, 512)), Image.new("L", (512, 512), 0)))
    if tint: tile = Image.blend(tile, Image.new("RGB", tile.size, tint), 0.25)
    # plain wall (gables, sheds, barns)
    tile.save(os.path.join(OUT, f"wall_{name}.jpg"), quality=86); nrm.save(os.path.join(OUT, f"wall_{name}_n.jpg"), quality=92); orm.save(os.path.join(OUT, f"wall_{name}_orm.jpg"), quality=90)
    d = ImageDraw.Draw(tile); dn = ImageDraw.Draw(nrm); do = ImageDraw.Draw(orm)
    x0, y0, x1, y1 = window_box(S)
    d.rectangle([x0 - 10, y0 - 10, x1 + 10, y1 + 10], fill=frame)
    for y in range(y0, y1):
        t = (y - y0) / (y1 - y0)
        d.line([x0, y, x1, y], fill=(int(40 + 50 * (1 - t)), int(55 + 55 * (1 - t)), int(70 + 60 * (1 - t))))
    d.rectangle([(x0 + x1) // 2 - 5, y0, (x0 + x1) // 2 + 5, y1], fill=frame)
    d.rectangle([x0, int(y0 + (y1 - y0) * 0.35) - 5, x1, int(y0 + (y1 - y0) * 0.35) + 5], fill=frame)
    d.rectangle([x0 - 18, y1 + 10, x1 + 18, y1 + 26], fill="#cfcac0")
    dn.rectangle([x0 - 10, y0 - 10, x1 + 10, y1 + 26], fill=(128, 128, 255))  # flat window + frame
    s2 = 512 / S
    do.rectangle([int((x0 - 10) * s2), int((y0 - 10) * s2), int((x1 + 10) * s2), int((y1 + 26) * s2)], fill=(255, 60, 0))  # no AO, glossy glass/frame
    tile.save(os.path.join(OUT, f"facade_{name}.jpg"), quality=86); nrm.save(os.path.join(OUT, f"facade_{name}_n.jpg"), quality=92); orm.save(os.path.join(OUT, f"facade_{name}_orm.jpg"), quality=90)

facade("brick", texturecan("brick"), 3)          # one 1K tile is ~1 m of brickwork
facade("plaster", texturecan("plaster"), 1, frame="#ffffff", tint="#efe2c8")

# --- broadleaf crown card (RGBA): ~300 leaf photos on a blobby disc, darker inside ---
lc = acg(ACG["leaves"]).convert("RGB"); lo = acg(ACG["leaves"], "Opacity").convert("L")
lc.putalpha(lo)
leaves = []
for r in range(2):
    for c in range(3):
        cell = lc.crop((c * 1024 // 3, r * 512, (c + 1) * 1024 // 3, (r + 1) * 512))
        bb = cell.getchannel("A").getbbox()
        leaves.append(cell.crop(bb))
S = 1024
card = Image.new("RGBA", (S, S), (0, 0, 0, 0))
# twigs
d = ImageDraw.Draw(card)
for _ in range(14):
    a = rnd.uniform(0, 2 * math.pi); r = rnd.uniform(0.25, 0.45) * S
    d.line([S / 2, S * 0.62, S / 2 + math.cos(a) * r, S / 2 + math.sin(a) * r * 0.8], fill=(70, 55, 40, 255), width=rnd.randint(3, 7))
clumps = []
while len(clumps) < 11:
    cx, cy = rnd.uniform(-0.75, 0.75), rnd.uniform(-0.75, 0.75)
    if cx * cx + cy * cy < 0.6: clumps.append((cx, cy, rnd.uniform(0.12, 0.22)))
for k in range(1300):
    cx, cy, cr = clumps[rnd.randrange(len(clumps))]
    x, y = cx + rnd.gauss(0, cr), cy + rnd.gauss(0, cr)
    if x * x + y * y > 0.95: continue
    lf = leaves[rnd.randrange(len(leaves))]
    size = int(rnd.uniform(24, 40))
    lf = lf.resize((size, int(size * lf.height / lf.width)), Image.LANCZOS).rotate(rnd.uniform(0, 360), expand=True, resample=Image.BICUBIC)
    shade = 0.55 + 0.45 * (0.5 - y * 0.5) * rnd.uniform(0.8, 1.1)  # lighter on top
    rgb = lf.convert("RGB")
    rgb = ImageEnhance.Brightness(rgb).enhance(shade * 0.9)
    # shift hue: slightly deeper green, a few autumn-yellow leaves
    tint = (40, 90, 25) if rnd.random() > 0.04 else (170, 140, 30)
    rgb = Image.blend(rgb, Image.new("RGB", rgb.size, tint), 0.35)
    lf2 = rgb.copy(); lf2.putalpha(lf.getchannel("A"))
    card.alpha_composite(lf2, (int(S / 2 + x * S * 0.45 - lf2.width / 2), int(S / 2 + y * S * 0.45 - lf2.height / 2)))
card.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "leaves_broad.png"))

# --- pine branch card: brown twig + dense needle strokes, drawn at 2x then downsampled ---
S = 1024
pine = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(pine)
def branch(x0, y0, ang, length, depth):
    x1, y1 = x0 + math.cos(ang) * length, y0 + math.sin(ang) * length
    d.line([x0, y0, x1, y1], fill=(85, 62, 40, 255), width=max(2, int(6 - depth * 2)))
    steps = int(length / 6)
    for i in range(steps):
        t = i / steps; px, py = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
        for side in (-1, 1):
            a = ang + side * rnd.uniform(0.5, 1.1)
            nl = rnd.uniform(28, 46) * (1 - 0.5 * t)
            g = rnd.randint(70, 115)
            d.line([px, py, px + math.cos(a) * nl, py + math.sin(a) * nl], fill=(int(g * 0.35), g, int(g * 0.4), 255), width=3)
    if depth < 2:
        for i in range(1, 4):
            t = i / 4
            for side in (-1, 1):
                branch(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, ang + side * rnd.uniform(0.5, 0.9), length * rnd.uniform(0.35, 0.5), depth + 1)
branch(S * 0.08, S * 0.5, 0.0, S * 0.84, 0)
pine.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "needles.png"))

# --- pine needle clump card: tufts of needles radiating from twig tips, clustered on a disc ---
S = 1024
clump = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(clump)
for _ in range(14):
    a = rnd.uniform(0, 2 * math.pi); r = rnd.uniform(0.1, 0.42) * S
    d.line([S / 2, S / 2, S / 2 + math.cos(a) * r, S / 2 + math.sin(a) * r], fill=(80, 58, 38, 255), width=rnd.randint(4, 8))
for _ in range(260):
    while True:
        x, y = rnd.uniform(-1, 1), rnd.uniform(-1, 1)
        if x * x + y * y < 0.8: break
    cx, cy = S / 2 + x * S * 0.42, S / 2 + y * S * 0.42
    g0 = rnd.randint(60, 105)
    for _ in range(26):
        a = rnd.uniform(0, 2 * math.pi); L = rnd.uniform(18, 40)
        g = max(30, min(140, g0 + rnd.randint(-15, 15)))
        d.line([cx, cy, cx + math.cos(a) * L, cy + math.sin(a) * L], fill=(int(g * 0.4), g, int(g * 0.45), 255), width=3)
clump.resize((512, 512), Image.LANCZOS).save(os.path.join(OUT, "needles_clump.png"))

# --- grass tuft card: blades growing from the bottom edge ---
S = 512
gr = Image.new("RGBA", (S, S), (0, 0, 0, 0)); d = ImageDraw.Draw(gr)
for _ in range(170):
    x0 = rnd.uniform(0.05, 0.95) * S; h = rnd.uniform(0.35, 0.95) * S; lean = rnd.uniform(-0.25, 0.25) * h
    g = rnd.randint(95, 170); yel = rnd.random() < 0.25
    col = (int(g * (0.85 if yel else 0.45)), g, int(g * (0.3 if yel else 0.25)), 255)
    pts = [(x0 + lean * (t / 8) ** 2, S - h * t / 8) for t in range(9)]
    for k in range(8):
        w = max(1, int(7 * (1 - k / 8)))
        d.line([pts[k], pts[k + 1]], fill=col, width=w)
gr.resize((256, 256), Image.LANCZOS).save(os.path.join(OUT, "grass_blades.png"))

# --- sky ---
import shutil
shutil.copy(fetch(HDRI[1], os.path.join(CACHE, HDRI[0] + "_2k.hdr")), os.path.join(OUT, "sky.hdr"))

# Roughness floor: the scene has no clear-coat/wet look, and a low-roughness road or wall
# picks up a bright environment sheen at grazing angles. Remap G -> floor + (1 - floor) * G.
ROUGH_FLOOR = {"asphalt": 0.8, "gravel": 0.8, "facade_brick": 0.7, "wall_brick": 0.7,
               "facade_plaster": 0.7, "wall_plaster": 0.7, "roof": 0.6}
for role, lo in ROUGH_FLOOR.items():
    fn = os.path.join(OUT, f"{role}_orm.jpg"); r, g, b = Image.open(fn).convert("RGB").split()
    g = g.point(lambda v: round(255 * lo + (1 - lo) * v))
    Image.merge("RGB", (r, g, b)).save(fn, quality=90)

json.dump({"ambientcg": ACG, "texturecan": TC_SOURCES, "polyhaven_hdri": HDRI[0]}, open(os.path.join(OUT, "sources.json"), "w"), indent=1)
print("ok", sorted(os.listdir(OUT)))
