"""Alpha-coverage-preserving mip chain for alpha-tested cards (fixes crowns thinning/vanishing at distance).
usage: python3 coverage_mips.py <src.png> <outdir> [cells.json]  -> outdir/mip_00.png ... (fed to `ktx create --levels N`)
Each level: alpha-weighted 2x2 box downsample, then alpha scaled per cell so that coverage(alpha>=0.5) equals level 0."""
import sys, os, json, numpy as np
from PIL import Image
src, outd = sys.argv[1], sys.argv[2]; os.makedirs(outd, exist_ok=True)
a0 = np.array(Image.open(src).convert('RGBA')).astype(np.float64) / 255
H, W = a0.shape[:2]
rects = [[0, 0, W, H]]
if len(sys.argv) > 3:
    rects = [c['px'] for c in json.load(open(sys.argv[3]))['cells']]
cov0 = [float((a0[y:y + h, x:x + w, 3] >= 0.5).mean()) for x, y, w, h in rects]
levels = [a0]; cur = a0; lvl = 0
while max(cur.shape[:2]) > 1:
    fy = 2 if cur.shape[0] > 1 else 1; fx = 2 if cur.shape[1] > 1 else 1
    h2, w2 = cur.shape[0] // fy, cur.shape[1] // fx
    c = cur.reshape(h2, fy, w2, fx, 4)
    al = c[..., 3].mean(axis=(1, 3)); rgb = (c[..., :3] * c[..., 3:4]).sum(axis=(1, 3)) / np.maximum(c[..., 3:4].sum(axis=(1, 3)), 1e-6)
    rgb_plain = c[..., :3].mean(axis=(1, 3)); rgb = np.where(al[..., None] > 1e-4, rgb, rgb_plain)
    lvl += 1; fyl, fxl = H // h2, W // w2; nxt = np.dstack([rgb, al])
    for (x, y, w, h), cv in zip(rects, cov0):
        xs, ys, ws, hs = x // fxl, y // fyl, max(1, w // fxl), max(1, h // fyl)
        reg = al[ys:ys + hs, xs:xs + ws]
        if reg.size == 0 or cv <= 0: continue
        lo, hi = 0.25, 8.0
        for _ in range(24):
            mid = (lo + hi) / 2
            if (np.clip(reg * mid, 0, 1) >= 0.5).mean() < cv: lo = mid
            else: hi = mid
        nxt[ys:ys + hs, xs:xs + ws, 3] = np.clip(reg * hi, 0, 1)
    levels.append(nxt); cur = nxt
for i, l in enumerate(levels):
    Image.fromarray(np.clip(l * 255 + .5, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(outd, f'mip_{i:02d}.png'))
print(len(levels), 'levels; coverage per level (first rect):', [round(float((l[:, :, 3] >= .5).mean()), 4) for l in levels[:6]])
