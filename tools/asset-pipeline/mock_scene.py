"""Mock scene sanity render: road, LOD0 birches < 40 m, cross cards 40-300 m, forest band at ~305 m, FogExp2.
blender -b -P cards/mock_scene.py  -> cards/preview_mock_scene.png"""
import bpy, os, sys, math, random, json
from mathutils import Vector
CARDS = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.dirname(CARDS)
sys.path.insert(0, CARDS); from cards_lib import *
META = json.load(open(os.path.join(CARDS, 'birch_cards.json')))
FOG_D = 0.0045; FOG = (0.62, 0.70, 0.80); NEAR, FAR = 40.0, 300.0
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene
with bpy.data.libraries.load(os.path.join(ROOT, 'out', 'birch_source.blend'), link=False) as (src, dst): dst.collections = ['LOD0']
L0 = dst.collections[0]
def fogify(m):
    nt = m.node_tree; out = [n for n in nt.nodes if n.type == 'OUTPUT_MATERIAL'][0]
    bsdf = [n for n in nt.nodes if n.type == 'BSDF_PRINCIPLED'][0]
    alpha_src = bsdf.inputs['Alpha'].links[0].from_socket if bsdf.inputs['Alpha'].links else None
    if alpha_src: nt.links.remove(bsdf.inputs['Alpha'].links[0])
    em = nt.nodes.new('ShaderNodeEmission'); em.inputs['Color'].default_value = (*FOG, 1)
    mf = nt.nodes.new('ShaderNodeMixShader'); nt.links.new(fog_factor(nt, FOG_D), mf.inputs[0])
    nt.links.new(bsdf.outputs[0], mf.inputs[1]); nt.links.new(em.outputs[0], mf.inputs[2]); final = mf.outputs[0]
    if alpha_src:
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); ma = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(alpha_src, ma.inputs[0]); nt.links.new(tr.outputs[0], ma.inputs[1]); nt.links.new(final, ma.inputs[2]); final = ma.outputs[0]
    nt.links.new(final, out.inputs['Surface'])
for o in L0.objects:
    for s in o.material_slots: fogify(s.material)
def pbr_mat(name, color_png, normal_png=None, base=None, rough=0.9, alpha=True, repeat=True):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; b = nt.nodes['Principled BSDF']
    b.inputs['Roughness'].default_value = rough
    if color_png:
        t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(color_png, check_existing=True); t.image.alpha_mode = 'STRAIGHT'
        t.extension = 'REPEAT' if repeat else 'CLIP'
        nt.links.new(t.outputs['Color'], b.inputs['Base Color'])
        if alpha: nt.links.new(math_node(nt, 'GREATER_THAN', t.outputs['Alpha'], 0.5), b.inputs['Alpha'])
    else: b.inputs['Base Color'].default_value = (*base, 1)
    if normal_png:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(normal_png, check_existing=True); n.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], b.inputs['Normal'])
    fogify(m); return m
SRC = os.path.join(CARDS, 'src')
CM = pbr_mat('cards', os.path.join(SRC, 'birch_cards_color.png'), os.path.join(SRC, 'birch_cards_normal.png'))
ATL = META['atlas']['size'][0]; mm = META['meshes']; tc = META['tree_cells']; CW, CH = tc['cell_px']
def cell_uv(px): x, y, w, h = px; return (x / ATL, 1 - (y + h) / ATL, (x + w) / ATL, 1 - y / ATL)
card_meshes = []
for row in range(4):
    bm = card_quads([(0, 0), (90, 2)], lambda c: cell_uv([c * CW, row * CH, CW, CH]), mm['quad_w'], mm['quad_h'], mm['pivot_v_in_quad'])
    me = bpy.data.meshes.new(f'cross_{row}'); bm.to_mesh(me); me.materials.append(CM); card_meshes.append(me)
uc = [c for c in META['cells'] if c['kind'] == 'understory']; uw, uh = uc[0]['cell_world_m']
und_meshes = []
for c in uc:
    bm = card_quads([(0, 0), (90, 0)], lambda _: cell_uv(c['px']), 1.0, uh / uw, 6 / c['px'][3])
    me = bpy.data.meshes.new(c['id']); bm.to_mesh(me); me.materials.append(CM); und_meshes.append(me)
rnd = random.Random(5); src_h = tc['source_tree_height_m']
n_lod0 = n_card = n_und = 0
sp = 6.5
gx = -320.0
while gx <= 320:
    gy = -10.0
    while gy <= 330:
        x, y = gx + rnd.uniform(-2.5, 2.5), gy + rnd.uniform(-2.5, 2.5); gy += sp
        if abs(x) < 7.5: continue
        d = math.hypot(x, y); H = rnd.uniform(13, 19)
        if d < NEAR:
            e = bpy.data.objects.new('t', None); e.instance_type = 'COLLECTION'; e.instance_collection = L0
            e.location = (x, y, 0); s = H / src_h; e.scale = (s, s, s); e.rotation_euler = (0, 0, rnd.uniform(0, 6.283)); scn.collection.objects.link(e); n_lod0 += 1
        elif d < FAR:
            o = bpy.data.objects.new('c', card_meshes[rnd.randrange(4)]); o.location = (x, y, 0); o.scale = (H, H, H)
            o.rotation_euler = (0, 0, rnd.uniform(0, 6.283)); scn.collection.objects.link(o); n_card += 1
    gx += sp
for side in (-1, 1):            # understory only at the forest edge
    y = 4.0
    while y < 160:
        o = bpy.data.objects.new('u', und_meshes[rnd.randrange(len(und_meshes))]); s = rnd.uniform(0.8, 1.4)
        o.location = (side * rnd.uniform(7.0, 9.5), y, 0); o.scale = (s * uw, s * uw, s * uw); o.rotation_euler = (0, 0, rnd.uniform(0, 6.283))
        scn.collection.objects.link(o); n_und += 1; y += rnd.uniform(3, 6)
# forest band: cylinder arc r=305 m, tile 64x8 m scaled x3.4
import bmesh
k = 3.4; tw, th = META['forest_band']['tile_world_m'][0] * k, META['forest_band']['tile_world_m'][1] * k; R = 305
bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap'); seg = 120; a0, a1 = math.radians(-100), math.radians(100)
ring = []
for i in range(seg + 1):
    a = a0 + (a1 - a0) * i / seg; p = Vector((R * math.sin(a), R * math.cos(a), 0))
    ring.append((bm.verts.new(p), bm.verts.new(p + Vector((0, 0, th))), R * (a - a0) / tw))
for i in range(seg):
    (b0, t0, u0), (b1, t1, u1) = ring[i], ring[i + 1]; f = bm.faces.new([b0, b1, t1, t0])
    for l, uv in zip(f.loops, [(u0, 0), (u1, 0), (u1, 1), (u0, 1)]): l[uvl].uv = uv
me = bpy.data.meshes.new('band'); bm.to_mesh(me); me.materials.append(pbr_mat('band', os.path.join(SRC, 'forest_band_color.png')))
scn.collection.objects.link(bpy.data.objects.new('band', me))
# ground + road
def plane(name, sx, sy, loc, col, rough):
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc); o = bpy.context.object; o.name = name; o.scale = (sx, sy, 1)
    o.data.materials.append(pbr_mat(name, None, base=col, rough=rough)); return o
plane('ground', 1400, 1400, (0, 200, 0), (0.09, 0.15, 0.045), 0.95)
plane('verge', 15, 800, (0, 200, 0.005), (0.16, 0.2, 0.08), 0.95)
plane('road', 4.5, 800, (0, 200, 0.01), (0.12, 0.12, 0.12), 0.7)
w = bpy.data.worlds.new('sky'); scn.world = w; w.use_nodes = True; bg = w.node_tree.nodes['Background']
bg.inputs['Color'].default_value = (*FOG, 1); bg.inputs['Strength'].default_value = 1.0
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.0; sun.angle = math.radians(2); so = bpy.data.objects.new('sun', sun); scn.collection.objects.link(so)
so.rotation_euler = (math.radians(50), 0, math.radians(140))
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scn.collection.objects.link(cam); scn.camera = cam
cam.data.lens = 24; cam.data.clip_end = 2000; cam.location = (0.4, 0, 1.6); cam.rotation_euler = (math.radians(88), 0, 0)
scn.render.engine = 'CYCLES'; c = scn.cycles; c.device = 'CPU'; c.samples = int(os.environ.get('MOCK_SAMPLES', 48)); c.use_denoising = True
c.transparent_max_bounces = 1024; c.max_bounces = 4
scn.view_settings.view_transform = 'Standard'
scn.render.resolution_x, scn.render.resolution_y = 1600, 900
scn.render.filepath = os.path.join(CARDS, 'preview_mock_scene.png')
print('MOCK counts lod0=%d cards=%d understory=%d' % (n_lod0, n_card, n_und))
json.dump(dict(lod0=n_lod0, cross_cards=n_card, understory=n_und, fog_density=FOG_D), open(os.path.join(CARDS, '_mock_counts.json'), 'w'))
bpy.ops.render.render(write_still=True)
