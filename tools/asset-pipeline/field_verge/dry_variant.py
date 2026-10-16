"""treekit dry/straw recolour of a grass foliage atlas (same layout, alpha untouched).
python3 dry_variant.py IN_rgba.png OUT_rgba.png [--strength 1.0]
Keeps per-texel luminance structure; maps it onto a straw ramp sampled to sit ~+15..25% lighter / more yellow than the
ploughed field in the user's screenshot (field ~ #968574 / #846D5C, sRGB); keeps 25% of the source chroma so some olive survives."""
import sys, numpy as np
from PIL import Image
a = sys.argv[1:]; IN, OUT = a[0], a[1]; K = float(a[a.index('--strength') + 1]) if '--strength' in a else 1.0
im = np.array(Image.open(IN).convert('RGBA')).astype(np.float32) / 255
rgb, al = im[..., :3], im[..., 3]
lin = np.where(rgb <= 0.04045, rgb / 12.92, ((rgb + 0.055) / 1.055) ** 2.4)
Y = lin @ np.array([0.2126, 0.7152, 0.0722], np.float32)
m = al > 0.5; Ym = np.median(Y[m]); t = np.minimum(np.clip(Y / (2.2 * Ym), 0, 1) ** 0.8, 0.85)      # median texel -> t~0.5
s2l = lambda c: (np.array(c, np.float32) / 255) ** 2.2
dark, mid, light = s2l((66, 57, 38)), s2l((136, 120, 82)), s2l((188, 172, 128))   # straw ramp (sRGB)
ramp = np.where(t[..., None] < 0.5, dark + (mid - dark) * (t[..., None] / 0.5), mid + (light - mid) * ((t[..., None] - 0.5) / 0.5))
chroma = lin - Y[..., None]                                                         # keep a little of the source hue variation
out = np.clip(ramp + 0.25 * chroma, 0, 1)
out = lin + (out - lin) * K
srgb = np.where(out <= 0.0031308, out * 12.92, 1.055 * out ** (1 / 2.4) - 0.055)
Image.fromarray(np.clip(np.dstack([srgb, al]) * 255 + .5, 0, 255).astype(np.uint8), 'RGBA').save(OUT, optimize=True)
print(OUT, 'median Y', round(float(Ym), 4))
