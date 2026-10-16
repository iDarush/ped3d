"""Birch impostor/card assets.  blender -b -P cards/make_cards.py
Renders (Cycles, ortho, transparent, NEUTRAL: unlit albedo x soft AO) from out/birch_source.blend LOD0:
 - tree atlas 2048^2: 4 variants x 8 azimuths, cells 256x448; bottom 256px row: 4 understory cells 512x256
 - matching view-space normal atlas
 - tileable forest band 2048x256
 - card meshes (cross / 3-plane / billboard / understory cross) as PNG-textured glb (converted to KTX2 later)"""
import bpy, bmesh, os, sys, math, random, json
import numpy as np
from mathutils import Vector, Matrix
from PIL import Image
CARDS = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(CARDS)
sys.path.insert(0, CARDS); from cards_lib import *
SRC = os.path.join(CARDS, 'src'); TILE = os.path.join(CARDS, '_tiles'); GLBP = os.path.join(CARDS, '_glb_png')
for d in (SRC, TILE, GLBP): os.makedirs(d, exist_ok=True)
SAMPLES = int(os.environ.get('CARD_SAMPLES', 64))
ATL = 2048; CW, CH = 256, 448; NAZ = 8; NVAR = 4; UW, UH = 512, 256
BAND_W, BAND_H, BAND_L = 2048, 256, 64.0

bpy.ops.wm.open_mainfile(filepath=os.path.join(ROOT, 'out', 'birch_source.blend'))
scn = bpy.context.scene
bark0 = bpy.data.objects['birch_lod0_bark']; fol0 = bpy.data.objects['birch_lod0_foliage']
IM = {n: bpy.data.images[n] for n in ('bark_color.jpg', 'bark_normal.png', 'foliage_color.png', 'foliage_normal.png')}
for o in list(bpy.data.objects): o.hide_render = True
SRC_H = max(v.co.z for o in (bark0, fol0) for v in o.data.vertices)

# ---------------- materials ----------------
def tex(nt, img, cs):
    n = nt.nodes.new('ShaderNodeTexImage'); n.image = img; img.colorspace_settings.name = cs; img.alpha_mode = 'STRAIGHT'; return n
def out_mix(nt, shader, alpha_sock):
    o = nt.nodes.new('ShaderNodeOutputMaterial')
    if alpha_sock is None: nt.links.new(shader, o.inputs['Surface']); return
    tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(math_node(nt, 'GREATER_THAN', alpha_sock, 0.5), mx.inputs[0])
    nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(shader, mx.inputs[2]); nt.links.new(mx.outputs[0], o.inputs['Surface'])
def newmat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; nt.nodes.clear(); return m, nt
def mat_albedo(kind, tint=(1, 1, 1)):
    m, nt = newmat(f'alb_{kind}_{tint}')
    t = tex(nt, IM['bark_color.jpg' if kind == 'bark' else 'foliage_color.png'], 'sRGB')
    ao = nt.nodes.new('ShaderNodeAmbientOcclusion'); ao.inputs['Distance'].default_value = 0.6; ao.samples = 8
    aof = math_node(nt, 'ADD', 0.62, math_node(nt, 'MULTIPLY', ao.outputs['AO'], 0.38))   # soft, non-directional
    mul = nt.nodes.new('ShaderNodeMix'); mul.data_type = 'RGBA'; mul.blend_type = 'MULTIPLY'; mul.inputs[0].default_value = 1
    nt.links.new(t.outputs['Color'], mul.inputs[6]); mul.inputs[7].default_value = (*tint, 1)
    mul2 = nt.nodes.new('ShaderNodeVectorMath'); mul2.operation = 'SCALE'
    nt.links.new(mul.outputs[2], mul2.inputs[0]); nt.links.new(aof, mul2.inputs['Scale'])
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(mul2.outputs[0], em.inputs['Color'])
    out_mix(nt, em.outputs[0], None if kind == 'bark' else t.outputs['Alpha']); return m
def mat_normal(kind, center, crown_mix=0.5):
    """emission = camera-space normal*0.5+0.5 (x right, y up, z to viewer) -> tangent-space map for camera-facing quad"""
    m, nt = newmat(f'nrm_{kind}_{tuple(round(c,2) for c in center)}')
    t = tex(nt, IM['bark_normal.png' if kind == 'bark' else 'foliage_normal.png'], 'Non-Color')
    nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(t.outputs['Color'], nm.inputs['Color'])
    n = nm.outputs['Normal']
    if kind != 'bark':
        geo = nt.nodes.new('ShaderNodeNewGeometry')
        d = nt.nodes.new('ShaderNodeVectorMath'); d.operation = 'SUBTRACT'; nt.links.new(geo.outputs['Position'], d.inputs[0]); d.inputs[1].default_value = center
        dn = nt.nodes.new('ShaderNodeVectorMath'); dn.operation = 'NORMALIZE'; nt.links.new(d.outputs[0], dn.inputs[0])
        mx = nt.nodes.new('ShaderNodeMix'); mx.data_type = 'VECTOR'; mx.inputs[0].default_value = crown_mix
        nt.links.new(n, mx.inputs[4]); nt.links.new(dn.outputs[0], mx.inputs[5])
        nn = nt.nodes.new('ShaderNodeVectorMath'); nn.operation = 'NORMALIZE'; nt.links.new(mx.outputs[1], nn.inputs[0]); n = nn.outputs[0]
    vt = nt.nodes.new('ShaderNodeVectorTransform'); vt.vector_type = 'NORMAL'; vt.convert_from = 'WORLD'; vt.convert_to = 'CAMERA'
    nt.links.new(n, vt.inputs[0])
    enc = nt.nodes.new('ShaderNodeVectorMath'); enc.operation = 'MULTIPLY_ADD'
    nt.links.new(vt.outputs[0], enc.inputs[0]); enc.inputs[1].default_value = (0.5, 0.5, -0.5); enc.inputs[2].default_value = (0.5, 0.5, 0.5)   # Cycles camera space is +Z forward -> flip z so it points to the viewer
    em = nt.nodes.new('ShaderNodeEmission'); nt.links.new(enc.outputs[0], em.inputs['Color'])
    out_mix(nt, em.outputs[0], None if kind == 'bark' else t.outputs['Alpha']); return m

# ---------------- variants ----------------
def components(bm):
    bm.faces.ensure_lookup_table(); seen = set(); parts = []
    for f in bm.faces:
        if f.index in seen: continue
        st = [f]; seen.add(f.index); comp = []
        while st:
            g = st.pop(); comp.append(g)
            for e in g.edges:
                for h in e.link_faces:
                    if h.index not in seen: seen.add(h.index); st.append(h)
        parts.append(comp)
    return parts
def xform_mesh(src, mirror, sxy, sz, drop=0.0, seed=0):
    bm = bmesh.new(); bm.from_mesh(src.data)
    if drop:
        rnd = random.Random(seed); kill = set()
        for c in components(bm):
            if rnd.random() < drop: kill.update(v for f in c for v in f.verts)
        bmesh.ops.delete(bm, geom=list(kill), context='VERTS')
    for v in bm.verts: v.co = Vector((v.co.x * sxy * (-1 if mirror else 1), v.co.y * sxy, v.co.z * sz))
    if mirror: bmesh.ops.reverse_faces(bm, faces=bm.faces[:])
    me = bpy.data.meshes.new(src.name + '_v'); bm.to_mesh(me); bm.free(); return me
VARS = [dict(name='v0_original', mirror=False, sxy=1.0, sz=1.0, drop=0.0, seed=0, tint=(1, 1, 1)),
        dict(name='v1_mirrored', mirror=True, sxy=1.0, sz=1.0, drop=0.0, seed=0, tint=(0.96, 1.0, 0.94)),
        dict(name='v2_slender_sparse', mirror=False, sxy=0.92, sz=1.12, drop=0.3, seed=2, tint=(1.0, 1.02, 0.96)),
        dict(name='v3_mirrored_wide_late', mirror=True, sxy=1.1, sz=0.95, drop=0.2, seed=3, tint=(1.08, 1.04, 0.82))]
coll_v = bpy.data.collections.new('CARD_VARIANTS'); scn.collection.children.link(coll_v)
for V in VARS:
    V['bark'] = bpy.data.objects.new(V['name'] + '_bark', xform_mesh(bark0, V['mirror'], V['sxy'], V['sz']))
    V['fol'] = bpy.data.objects.new(V['name'] + '_fol', xform_mesh(fol0, V['mirror'], V['sxy'], V['sz'], V['drop'], V['seed']))
    for o in (V['bark'], V['fol']): coll_v.objects.link(o); o.hide_render = True
    vs = [v.co for o in (V['bark'], V['fol']) for v in o.data.vertices]
    fv = [v.co for v in V['fol'].data.vertices]
    V['height'] = max(v.z for v in vs); V['radius'] = max(math.hypot(v.x, v.y) for v in vs)
    V['center'] = tuple(sum((v for v in fv), Vector()) / len(fv))
    V['mats'] = {'alb': (mat_albedo('bark'), mat_albedo('fol', V['tint'])), 'nrm': (mat_normal('bark', V['center']), mat_normal('fol', V['center']))}
def set_pass(objs_pairs, which):
    for (b, f, mats) in objs_pairs:
        b.data.materials.clear(); b.data.materials.append(mats[which][0])
        f.data.materials.clear(); f.data.materials.append(mats[which][1])

# ---------------- render setup ----------------
scn.render.engine = 'CYCLES'; c = scn.cycles; c.device = 'CPU'; c.samples = SAMPLES; c.use_denoising = False
c.transparent_max_bounces = 128; c.max_bounces = 4; c.use_adaptive_sampling = False
scn.render.film_transparent = True; scn.render.image_settings.file_format = 'PNG'; scn.render.image_settings.color_mode = 'RGBA'
scn.render.image_settings.color_depth = '8'
w = bpy.data.worlds.new('black'); scn.world = w; w.use_nodes = True; w.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.0
cam = bpy.data.objects.new('cardcam', bpy.data.cameras.new('cardcam')); scn.collection.objects.link(cam); scn.camera = cam
cam.data.type = 'ORTHO'; cam.data.clip_end = 500
def render(path, which, res):
    scn.view_settings.view_transform = 'Standard' if which == 'alb' else 'Raw'
    scn.view_settings.look = 'None'; scn.view_settings.exposure = 0; scn.view_settings.gamma = 1
    scn.render.resolution_x, scn.render.resolution_y = res; scn.render.resolution_percentage = 100
    scn.render.filepath = path; bpy.ops.render.render(write_still=True)
def place_cam(az_deg, center_z, ortho, dist=60):
    a = math.radians(az_deg)
    cam.location = (dist * math.sin(a), -dist * math.cos(a), center_z); cam.rotation_euler = (math.radians(90), 0, a)
    cam.data.ortho_scale = ortho

# cell framing shared by ALL tree cells (one quad mesh fits every cell)
margin_px = 10
need_h = max(V['height'] for V in VARS); need_w = 2 * max(V['radius'] for V in VARS)
cell_h = max(need_h / (1 - 2 * margin_px / CH), need_w / (1 - 2 * margin_px / CW) * CH / CW)
cell_w = cell_h * CW / CH; pivot_v = margin_px / CH          # pivot: trunk base, margin_px above cell bottom
center_z = cell_h / 2 - margin_px / CH * cell_h
tiles = {}
for vi, V in enumerate(VARS):
    for o in (V['bark'], V['fol']): o.hide_render = False
    for az in range(NAZ):
        place_cam(az * 360 / NAZ, center_z, cell_h)
        for which in ('alb', 'nrm'):
            set_pass([(V['bark'], V['fol'], V['mats'])], which)
            p = os.path.join(TILE, f'tree_{vi}_{az}_{which}.png'); render(p, which, (CW, CH)); tiles[(vi, az, which)] = p
    for o in (V['bark'], V['fol']): o.hide_render = True

# ---------------- understory bushes (self-made from birch foliage cards) ----------------
fbm = bmesh.new(); fbm.from_mesh(fol0.data); fparts = components(fbm)
part_geo = []
for cpt in fparts:
    vs = list({v for f in cpt for v in f.verts}); ctr = sum((v.co for v in vs), Vector()) / len(vs)
    part_geo.append([f for f in cpt])
BUSH = [dict(seed=11, n=110, rx=0.95, ry=0.7, h=0.85), dict(seed=12, n=80, rx=0.75, ry=0.6, h=0.6),
        dict(seed=13, n=140, rx=1.0, ry=0.8, h=1.0), dict(seed=14, n=90, rx=1.05, ry=0.5, h=0.5)]
bush_w = 2.4; bush_h = bush_w * UH / UW; bpivot_v = 6 / UH
for bi, B in enumerate(BUSH):
    rnd = random.Random(B['seed']); bm = bmesh.new(); uvl_dst = bm.loops.layers.uv.new('UVMap'); uvl_src = fbm.loops.layers.uv[0]
    for k in range(B['n']):
        cpt = fparts[rnd.randrange(len(fparts))]
        vs = list({v for f in cpt for v in f.verts}); ctr = sum((v.co for v in vs), Vector()) / len(vs)
        s = rnd.uniform(0.45, 0.8)
        R = Matrix.Rotation(rnd.uniform(0, 6.283), 3, 'Z') @ Matrix.Rotation(rnd.uniform(-0.6, 0.6), 3, 'X')
        ang = rnd.uniform(0, 6.283); rr = math.sqrt(rnd.random())
        pos = Vector((math.cos(ang) * rr * B['rx'] * 0.8, math.sin(ang) * rr * B['ry'], rnd.uniform(0.1, 0.9) * B['h'] * (1 - 0.55 * rr * rr)))
        vmap = {}
        for v in vs: vmap[v] = bm.verts.new(pos + R @ ((v.co - ctr) * s))
        for f in cpt:
            nf = bm.faces.new([vmap[v] for v in f.verts])
            for l, ls in zip(nf.loops, f.loops): l[uvl_dst].uv = ls[uvl_src].uv
    for v in bm.verts: v.co.z = max(v.co.z, 0.0)
    me = bpy.data.meshes.new(f'bush{bi}'); bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(f'bush{bi}', me); coll_v.objects.link(o)
    zc = max(v.co.z for v in me.vertices) * 0.5
    mats = {'alb': (None, mat_albedo('fol', (0.95, 1.0, 0.9))), 'nrm': (None, mat_normal('fol', (0, 0, zc), 0.6))}
    B['obj'] = o; B['top'] = max(v.co.z for v in me.vertices); B['halfw'] = max(abs(v.co.x) for v in me.vertices)
    for which in ('alb', 'nrm'):
        me.materials.clear(); me.materials.append(mats[which][1])
        place_cam(0, bush_h / 2 - bpivot_v * bush_h, bush_w)
        p = os.path.join(TILE, f'bush_{bi}_{which}.png'); render(p, which, (UW, UH)); tiles[('bush', bi, which)] = p
    o.hide_render = True

# ---------------- forest band (tileable) ----------------
rnd = random.Random(99); band_objs = []
inst_coll = []
for vi, V in enumerate(VARS):
    cl = bpy.data.collections.new(f'inst_{vi}')
    for src in (V['bark'], V['fol']):
        o = bpy.data.objects.new(src.name + '_i', src.data); cl.objects.link(o)
    set_pass([(cl.objects[0], cl.objects[1], V['mats'])], 'alb'); inst_coll.append(cl)
bush_coll = []
for B in BUSH:
    cl = bpy.data.collections.new(B['obj'].name + '_c'); o = bpy.data.objects.new(B['obj'].name + '_i', B['obj'].data); cl.objects.link(o)
    B['obj'].data.materials.clear(); B['obj'].data.materials.append(mat_albedo('fol', (0.9, 0.95, 0.85))); bush_coll.append(cl)
band = bpy.data.collections.new('BAND'); scn.collection.children.link(band)
def add_inst(cl, x, y, s, rot):
    for dx in (-BAND_L, 0, BAND_L):
        if -8 < x + dx < BAND_L + 8:
            e = bpy.data.objects.new('i', None); e.instance_type = 'COLLECTION'; e.instance_collection = cl
            e.location = (x + dx, y, 0); e.scale = (s, s, s); e.rotation_euler = (0, 0, rot); band.objects.link(e)
for row, (y, spacing) in enumerate([(0, 1.7), (3.5, 1.5), (7, 1.3), (11, 1.2)]):
    x = rnd.uniform(0, spacing)
    while x < BAND_L:
        add_inst(inst_coll[rnd.randrange(4)], x, y + rnd.uniform(-1, 1), rnd.uniform(0.85, 1.25), rnd.uniform(0, 6.283))
        x += spacing * rnd.uniform(0.7, 1.3)
x = 0
while x < BAND_L:
    add_inst(bush_coll[rnd.randrange(4)], x, -1.5 + rnd.uniform(-0.5, 0.5), rnd.uniform(0.9, 1.5), rnd.uniform(0, 6.283)); x += rnd.uniform(1.0, 2.2)
band_h = BAND_L * BAND_H / BAND_W
cam.location = (BAND_L / 2, -80, band_h / 2); cam.rotation_euler = (math.radians(90), 0, 0); cam.data.ortho_scale = BAND_L
p = os.path.join(TILE, 'band_alb.png'); render(p, 'alb', (BAND_W, BAND_H)); tiles['band'] = p

# ---------------- assemble atlases ----------------
def L(p): return np.array(Image.open(p).convert('RGBA')).astype(np.float32) / 255
def box_blur(a, r):
    for ax in (0, 1):
        pad = [(0, 0)] * a.ndim; pad[ax] = (r + 1, r); cs = np.cumsum(np.pad(a, pad, mode='edge'), axis=ax); n = a.shape[ax]
        a = (np.take(cs, range(2 * r + 1, 2 * r + 1 + n), axis=ax) - np.take(cs, range(0, n), axis=ax)) / (2 * r + 1)
    return a
def dilate(rgb, mask):
    out = rgb.copy(); m = mask.astype(np.float32)
    for r in [1, 2, 4, 8, 16, 32, 64, 128]:
        wgt = box_blur(m, r); cc = box_blur(out * m[..., None], r); upd = (m < 0.5) & (wgt > 1e-4)
        out[upd] = cc[upd] / wgt[upd][..., None]; m = np.where(upd, 1.0, m)
        if m.min() > 0.5: break
    return out
col = np.zeros((ATL, ATL, 4), np.float32); nrm = np.zeros((ATL, ATL, 3), np.float32); nrm[...] = (0.5, 0.5, 1.0)
cells = []
def put(img_alb, img_nrm, x, y, w_, h_):
    a = L(img_alb); n = L(img_nrm); col[y:y + h_, x:x + w_] = a; nrm[y:y + h_, x:x + w_] = n[..., :3]
for vi, V in enumerate(VARS):
    for az in range(NAZ):
        x, y = az * CW, vi * CH; put(tiles[(vi, az, 'alb')], tiles[(vi, az, 'nrm')], x, y, CW, CH)
        cells.append(dict(id=f'tree_{vi}_{az}', kind='tree', variant=vi, variant_name=V['name'], azimuth_deg=az * 360 // NAZ,
            px=[x, y, CW, CH], uv=[x / ATL, y / ATL, (x + CW) / ATL, (y + CH) / ATL], pivot_uv=[(x + CW / 2) / ATL, (y + CH - margin_px) / ATL],
            cell_world_m=[round(cell_w, 4), round(cell_h, 4)], tree_height_m=round(V['height'], 3)))
for bi in range(len(BUSH)):
    x, y = bi * UW, NVAR * CH; put(tiles[('bush', bi, 'alb')], tiles[('bush', bi, 'nrm')], x, y, UW, UH)
    cells.append(dict(id=f'understory_{bi}', kind='understory', px=[x, y, UW, UH], uv=[x / ATL, y / ATL, (x + UW) / ATL, (y + UH) / ATL],
        pivot_uv=[(x + UW / 2) / ATL, (y + UH - 6) / ATL], cell_world_m=[bush_w, round(bush_h, 4)], bush_height_m=round(BUSH[bi]['top'], 3)))
m = col[..., 3] > 0.5
# normals: renormalise, then dilate; colour: dilate
nv = nrm * 2 - 1; nv /= np.linalg.norm(nv, axis=-1, keepdims=True) + 1e-6; nrm = nv * 0.5 + 0.5
col[..., :3] = dilate(col[..., :3], m); nrm = dilate(nrm, m)
Image.fromarray(np.clip(col * 255 + .5, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(SRC, 'birch_cards_color.png'), optimize=True)
Image.fromarray(np.clip(nrm * 255 + .5, 0, 255).astype(np.uint8), 'RGB').save(os.path.join(SRC, 'birch_cards_normal.png'), optimize=True)
# band: make lower part opaque "forest interior", dilate
b = L(tiles['band']); a = b[..., 3]; yy = np.linspace(1, 0, BAND_H)[:, None] * band_h   # world z per row
ramp = np.clip((0.42 * band_h - yy) / (0.42 * band_h - 0.22 * band_h), 0, 1) * np.ones((1, BAND_W))
op = a > 0.5; interior = np.median(b[op][:, :3], axis=0) * 0.55
rgb = dilate(b[..., :3], op)
rgb = rgb * (a[..., None] > 0.5) + (1 - (a[..., None] > 0.5)) * (rgb * 0.4 + interior * 0.6)
alpha = np.maximum(a, ramp)
Image.fromarray(np.clip(np.dstack([rgb, alpha]) * 255 + .5, 0, 255).astype(np.uint8), 'RGBA').save(os.path.join(SRC, 'forest_band_color.png'), optimize=True)
# seam check
seam = float(np.abs(b[:, 0, 3] - b[:, -1, 3]).mean())

# ---------------- card meshes ----------------
for o in list(bpy.data.objects):
    if o.type == 'MESH' and o.name.startswith('card_'): bpy.data.objects.remove(o)
ex = bpy.data.collections.new('CARD_EXPORT'); scn.collection.children.link(ex)
def mk_card_mat():
    mm = bpy.data.materials.new('birch_card'); mm.use_nodes = True; nt = mm.node_tree; bsdf = nt.nodes['Principled BSDF']
    ci = bpy.data.images.load(os.path.join(SRC, 'birch_cards_color.png')); ni = bpy.data.images.load(os.path.join(SRC, 'birch_cards_normal.png'))
    ni.colorspace_settings.name = 'Non-Color'
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = ci; nt.links.new(t.outputs['Color'], bsdf.inputs['Base Color'])
    lt = math_node(nt, 'LESS_THAN', t.outputs['Alpha'], 0.5); nt.links.new(math_node(nt, 'SUBTRACT', 1.0, lt), bsdf.inputs['Alpha'])
    tn = nt.nodes.new('ShaderNodeTexImage'); tn.image = ni; nm = nt.nodes.new('ShaderNodeNormalMap')
    nt.links.new(tn.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    bsdf.inputs['Roughness'].default_value = 0.9; bsdf.inputs['Metallic'].default_value = 0
    mm.use_backface_culling = False; mm.surface_render_method = 'DITHERED'; return mm
CMAT = mk_card_mat()
def cell_uv_blender(px):
    x, y, w_, h_ = px; return (x / ATL, 1 - (y + h_) / ATL, (x + w_) / ATL, 1 - y / ATL)
tree_px = lambda col_: [col_ * CW, 0, CW, CH]
QH = cell_h / VARS[0]['height']; QW = cell_w / VARS[0]['height']       # unit = v0 tree height
mesh_specs = {
    'birch_card_cross': [(0, 0), (90, 2)],
    'birch_card_3plane': [(0, 0), (60, 1), (120, 3)],     # nearest rendered azimuths 0/45/135 (+-15 deg)
    'birch_card_billboard': [(0, 0)],
}
MESHES = {}
for name, planes in mesh_specs.items():
    bm = card_quads(planes, lambda c_: cell_uv_blender(tree_px(c_)), QW, QH, pivot_v)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free(); me.materials.append(CMAT)
    o = bpy.data.objects.new(name, me); ex.objects.link(o); MESHES[name] = dict(tris=2 * len(planes), planes=[dict(angle_deg=a, cell_column=c_) for a, c_ in planes])
bmq = card_quads([(0, 0), (90, 0)], lambda c_: cell_uv_blender([0, NVAR * CH, UW, UH]), 1.0, bush_h / bush_w, 6 / UH)
me = bpy.data.meshes.new('understory_card_cross'); bmq.to_mesh(me); me.materials.append(CMAT)
o = bpy.data.objects.new('understory_card_cross', me); ex.objects.link(o); MESHES['understory_card_cross'] = dict(tris=4, planes=[dict(angle_deg=0, cell='understory_0'), dict(angle_deg=90, cell='understory_0')])
for name in MESHES:
    bpy.ops.object.select_all(action='DESELECT'); ob = bpy.data.objects[name]; ob.select_set(True); bpy.context.view_layer.objects.active = ob
    bpy.ops.export_scene.gltf(filepath=os.path.join(GLBP, name + '.glb'), export_format='GLB', use_selection=True, export_yup=True,
        export_image_format='AUTO', export_tangents=True, export_cameras=False, export_lights=False, export_extras=False, export_animations=False)
meta = dict(
    source='TurboSquid 2561468 birch (LOD0 of out/birch_source.blend), TurboSquid Standard/royalty-free license (exact name to be confirmed)',
    atlas=dict(color='textures/birch_cards_color.ktx2', normal='textures/birch_cards_normal.ktx2', size=[ATL, ATL],
               uv_convention='glTF/three.js: origin top-left, v down (texture.flipY=false as GLTFLoader sets)',
               normal_encoding='view/card-space normal*0.5+0.5: x=card right(u), y=up, z=towards viewer; OpenGL (+Y) tangent space for an upright quad',
               lighting='unlit albedo x soft ambient occlusion (0.62..1.0), no directional light; foliage normals = 50% leaf normal + 50% crown-sphere normal'),
    tree_cells=dict(rows='variant 0..3 (top to bottom)', columns='azimuth 0..315 step 45 (left to right); azimuth a = view from direction (sin a, -cos a) in Blender Z-up (glTF: x=sin a, z=cos a), counter-clockwise from above',
                    cell_px=[CW, CH], cell_world_m=[round(cell_w, 4), round(cell_h, 4)], pivot='trunk base = cell bottom-centre, %d px above bottom edge' % margin_px,
                    source_tree_height_m=round(VARS[0]['height'], 3)),
    variants=[dict(row=i, name=V['name'], mirrored=V['mirror'], scale_xy=V['sxy'], scale_z=V['sz'], leaf_cards_removed=V['drop'], tint=V['tint'], height_m=round(V['height'], 3)) for i, V in enumerate(VARS)],
    meshes=dict(units='1.0 = height of variant-0 tree (4.94 m source); instance scale = desired tree height in metres', origin='trunk base', up='Y (glTF)',
                quad_w=round(QW, 4), quad_h=round(QH, 4), pivot_v_in_quad=round(pivot_v, 4),
                variant_select='per-instance UV offset: v += row*%d/%d (rows), u += col*%d/%d for azimuth rotation (wrap modulo 8 cells)' % (CH, ATL, CW, ATL),
                files={k + '.glb': v for k, v in MESHES.items()}),
    understory=dict(cells='bottom row, 4 cells 512x256', cell_world_m=[bush_w, round(bush_h, 4)], mesh='understory_card_cross.glb: unit = cell width 2.4 m (scale 1 = 2.4 m wide bush)'),
    forest_band=dict(file='textures/forest_band_color.ktx2', size=[BAND_W, BAND_H], tile_world_m=[BAND_L, band_h], wrapS='RepeatWrapping (seamless horizontally)',
                     content='4 rows of instanced birch variants + bushes, lower ~22-42%% of height filled to opaque forest interior, alpha on top edge', seam_alpha_mae=round(seam, 4)),
    cells=cells)
json.dump(meta, open(os.path.join(CARDS, 'birch_cards.json'), 'w'), indent=1)
bpy.ops.wm.save_as_mainfile(filepath=os.path.join(CARDS, '_cards_work.blend'), compress=True)
print('CARDS_DONE', json.dumps({k: meta[k] for k in ('tree_cells', 'meshes')}, default=str))
