#!/usr/bin/env python3
"""Forest-floor variety layers from TextureCan (CC0) 1K sets, in the exact convention of
tools/prepare-assets.py save_pbr(): <role>.jpg 1024 q86 sRGB, <role>_n.jpg 1024 OpenGL q92,
<role>_orm.jpg 512 q90 (R=AO, G=roughness, B=0), plus <role>_h.jpg 512 q92 height (new, linear)."""
import io, os, zipfile, json
import numpy as np
from PIL import Image, ImageEnhance
D = os.path.dirname(os.path.abspath(__file__)); DL = os.path.join(D, "dl"); OUT = os.path.join(D, "out", "textures")
os.makedirs(OUT, exist_ok=True)
SETS = {  # role -> (page id, texturecan id, zip, adjust)
  "forest_grass":  (130, "ground_0009", "tc130.zip"),
  "forest_leaves": (243, "ground_0028", "tc243.zip"),
  "forest_rock":   (265, "ground_0035", "tc265.zip"),
  "forestfloor":   (92,  "ground_0006", "tc92.zip"),   # only _h is written for the existing base layer
}
ZIPURL = {130: "/downloads/ground_0009/ground_0009_1k_ReJG9N.zip", 243: "/downloads/ground_0028/ground_0028_1k_6Vu6Ws.zip",
          265: "/downloads/ground_0035/ground_0035_1k_4gB8Sq.zip", 92: "/downloads/ground_0006/ground_0006_1k_hjA45q.zip"}
def tc_map(z, kind):
    name = next((n for n in z.namelist() if not n.startswith("__") and f"_{kind}_" in n), None)
    return Image.open(io.BytesIO(z.read(name))) if name else None

def lum(a): return a[..., 0] * 0.299 + a[..., 1] * 0.587 + a[..., 2] * 0.114
def adjust(img, sat=1.0, tint=None, tint_k=0.0, target_lum=None, contrast=1.0):
    a = np.asarray(img.convert("RGB")).astype(np.float32)
    L = lum(a)[..., None]
    a = L + (a - L) * sat                               # saturation
    if tint is not None:                                 # recolour towards tint * luminance (keeps detail)
        t = np.array(tint, np.float32); t = t / lum(t[None])[0]
        a = a * (1 - tint_k) + (lum(a)[..., None] * t) * tint_k
    m = lum(a).mean()
    a = m + (a - m) * contrast
    if target_lum: a *= target_lum / lum(a).mean()
    return Image.fromarray(np.clip(a + 0.5, 0, 255).astype(np.uint8))

ADJ = {  # forestfloor (ground_0006 colour): mean RGB ~ (100, 86, 72), luminance ~ 89
  "forest_grass":  dict(sat=0.62, tint=(0.80, 1.0, 0.45), tint_k=0.25, target_lum=86, contrast=0.9),
  "forest_leaves": dict(sat=0.55, tint=(1.0, 0.72, 0.42), tint_k=0.35, target_lum=84, contrast=0.9),
  "forest_rock":   dict(sat=0.85, target_lum=96, contrast=1.35),
}
def h8(z):
    h = np.asarray(tc_map(z, "height")).astype(np.float32)
    lo, hi = np.percentile(h, 0.5), np.percentile(h, 99.5)
    h = np.clip((h - lo) / max(1, hi - lo), 0, 1)
    return Image.fromarray((h * 255 + 0.5).astype(np.uint8)).resize((512, 512), Image.LANCZOS)

stats = {}
for role, (pid, tcid, zf) in SETS.items():
    z = zipfile.ZipFile(os.path.join(DL, zf))
    h8(z).save(os.path.join(OUT, f"{role}_h.jpg"), quality=92)
    if role == "forestfloor": continue
    c = adjust(tc_map(z, "color"), **ADJ[role])
    n = tc_map(z, "normal_opengl").convert("RGB")
    ao = tc_map(z, "ao").convert("L").resize((512, 512), Image.LANCZOS)
    rough = tc_map(z, "roughness").convert("L").resize((512, 512), Image.LANCZOS)
    c.resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, f"{role}.jpg"), quality=86)
    n.resize((1024, 1024), Image.LANCZOS).save(os.path.join(OUT, f"{role}_n.jpg"), quality=92)
    Image.merge("RGB", (ao, rough, Image.new("L", (512, 512), 0))).save(os.path.join(OUT, f"{role}_orm.jpg"), quality=90)

credits = {"texturecan": {role: {"page": f"https://www.texturecan.com/details/{pid}/", "id": tcid,
            "zip_1k": "https://www.texturecan.com" + ZIPURL[pid], "license": "CC0 1.0 (https://www.texturecan.com/terms/)"}
            for role, (pid, tcid, zf) in SETS.items() if role != "forestfloor"}}
credits["texturecan"]["forestfloor_h"] = {"page": "https://www.texturecan.com/details/92/", "id": "ground_0006",
    "zip_1k": "https://www.texturecan.com" + ZIPURL[92], "license": "CC0 1.0 (https://www.texturecan.com/terms/)",
    "note": "height map of the existing forestfloor set"}
json.dump(credits, open(os.path.join(D, "out", "sources_addition.json"), "w"), indent=1)
print("ok", sorted(os.listdir(OUT)))
