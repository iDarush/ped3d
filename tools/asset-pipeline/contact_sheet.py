# contact sheet: colour atlas (grid + labels) | normal atlas | band tiled x2 (seam check) | decoded KTX2 colour atlas | mock scene
import json, os, subprocess, tempfile
from PIL import Image, ImageDraw
D = os.path.dirname(os.path.abspath(__file__)); M = json.load(open(os.path.join(D, 'birch_cards.json')))
def over(p, bgc=(150, 165, 185)):
    im = Image.open(p).convert('RGBA'); bg = Image.new('RGBA', im.size, (*bgc, 255)); bg.alpha_composite(im); return bg.convert('RGB')
col = over(os.path.join(D, 'src/birch_cards_color.png')); dr = ImageDraw.Draw(col)
for c in M['cells']:
    x, y, w, h = c['px']; dr.rectangle([x, y, x + w - 1, y + h - 1], outline=(255, 255, 255)); dr.text((x + 4, y + 4), c['id'] + (f" {c['azimuth_deg']}°" if 'azimuth_deg' in c else ''), fill=(0, 0, 0))
    px, py = c['pivot_uv'][0] * 2048, c['pivot_uv'][1] * 2048; dr.ellipse([px - 4, py - 4, px + 4, py + 4], outline=(255, 0, 0), width=2)
nrm = Image.open(os.path.join(D, 'src/birch_cards_normal.png')).convert('RGB')
t = tempfile.mkdtemp(); subprocess.run(['ktx', 'extract', '--transcode', 'rgba8', os.path.join(D, 'textures/birch_cards_color.ktx2'), t + '/c.png'], check=True)
dec = over(t + '/c.png')
band = over(os.path.join(D, 'src/forest_band_color.png')); band2 = Image.new('RGB', (4096, 256)); band2.paste(band, (0, 0)); band2.paste(band, (2048, 0))
dr2 = ImageDraw.Draw(band2); dr2.line([2048, 0, 2048, 20], fill=(255, 0, 0), width=3); dr2.text((2056, 4), 'tile seam', fill=(255, 0, 0))
mock = Image.open(os.path.join(D, 'preview_mock_scene.png')).convert('RGB')
W = 3072; sheet = Image.new('RGB', (W, 1280 + 1728), (35, 35, 35)); d = ImageDraw.Draw(sheet)
sheet.paste(col.resize((1024, 1024)), (0, 0)); sheet.paste(nrm.resize((1024, 1024)), (1024, 0)); sheet.paste(dec.resize((1024, 1024)), (2048, 0))
for i, s in enumerate(['colour+alpha atlas 2048² (src PNG, red = pivot)', 'normal atlas (view-space, shipped 1024²)', 'colour atlas decoded from KTX2 ETC1S']):
    d.text((i * 1024 + 8, 1028), s, fill=(255, 255, 255))
sheet.paste(band2.resize((3072, 192)), (0, 1064)); d.text((8, 1260), 'forest_band_color 2048x256, tiled x2', fill=(255, 255, 255))
sheet.paste(mock.resize((3072, 1728)), (0, 1280))
sheet = sheet.crop((0, 0, W, 1280 + 1728)); sheet.save(os.path.join(D, 'preview_contact_sheet.png'), optimize=True)
