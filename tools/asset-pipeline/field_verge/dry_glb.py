"""make <sp>_<id>_lod0_dry.glb (and _dry ktx2) next to out_ktx2 glbs: same geometry, colour texture URI -> textures/foliage_color_dry.ktx2
python3 dry_glb.py OUT_KTX2_DIR DRY_RGBA.png [STATS_JSON]"""
import sys, os, json, glob, struct, subprocess, tempfile
K, DRY = sys.argv[1], sys.argv[2]; ST = sys.argv[3] if len(sys.argv) > 3 else None
TK = os.path.dirname(os.path.abspath(__file__)); T = tempfile.mkdtemp()
from PIL import Image
im = Image.open(DRY); cells = os.path.join(T, 'cells.json')
tpl = json.load(open(ST)).get('foliage_atlas', {}).get('templates', []) if ST and os.path.exists(ST) else []
json.dump({'cells': [{'px': t['px']} for t in tpl] or [{'px': [0, 0, im.width, im.height]}]}, open(cells, 'w'))
mips = os.path.join(T, 'mips'); subprocess.run(['python3', os.path.join(TK, 'coverage_mips.py'), DRY, mips, cells], check=True)
files = sorted(glob.glob(os.path.join(mips, 'mip_*.png'))); dst = os.path.join(K, 'textures', 'foliage_color_dry.ktx2')
subprocess.run(['ktx', 'create', '--format', 'R8G8B8A8_SRGB', '--assign-tf', 'srgb', '--encode', 'basis-lz', '--clevel', '4', '--qlevel', '255', '--levels', str(len(files)), *files, dst], check=True)
for g in sorted(glob.glob(os.path.join(K, '*_lod0.glb'))):
    b = open(g, 'rb').read(); jl = struct.unpack_from('<I', b, 12)[0]; js = json.loads(b[20:20 + jl]); rest = b[20 + jl:]
    n = 0
    for i in js['images']:
        if i.get('uri') == 'textures/foliage_color.ktx2': i['uri'] = 'textures/foliage_color_dry.ktx2'; n += 1
    for m in js.get('materials', []): m['name'] = m.get('name', '') + '_dry'
    assert n == 1, (g, n)
    jb = json.dumps(js, separators=(',', ':')).encode(); jb += b' ' * ((4 - len(jb) % 4) % 4)
    out = g[:-4] + '_dry.glb'; total = 12 + 8 + len(jb) + len(rest)
    open(out, 'wb').write(struct.pack('<III', 0x46546C67, 2, total) + struct.pack('<II', len(jb), 0x4E4F534A) + jb + rest); print(out, total)
print(dst, os.path.getsize(dst))
