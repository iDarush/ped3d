"""approximate ride3d field verge, Cycles. blender -b -P verge_scene.py -- MODE VIEW OUT.png
MODE: A (current: green strip + dense lolium/setaria line, forestGrass.ts rules) | B (proposed sparse straw clumps) | C (B, denser)
VIEW: road (eye 1.5 m on road, like the screenshot) | close (close-up of the right verge)"""
import bpy, sys, math, os, json, random
from mathutils import Vector, Euler
a = sys.argv[sys.argv.index('--') + 1:]; MODE, VIEW, OUT = a[0], a[1], a[2]
SAMPLES = int(os.environ.get('SAMPLES', '64'))
PNG = '/workspace/kickr/forest/verge/png'; SA = '/workspace/kickr/ride3d/public/scene-assets'
bpy.ops.wm.read_factory_settings(use_empty=True)
scn = bpy.context.scene; scn.render.engine = 'CYCLES'; scn.cycles.device = 'CPU'; scn.cycles.samples = SAMPLES; scn.cycles.use_denoising = True
scn.render.resolution_x, scn.render.resolution_y = (1600, 800); scn.view_settings.view_transform = 'Standard'; scn.view_settings.look = 'None'
scn.cycles.max_bounces = 4; scn.cycles.transparent_max_bounces = 24
ROAD_HW, SHOULDER = 2.5, 0.4

def h(x, z, salt):  # forestHash port
    def imul(p, q): return ((p & 0xffffffff) * (q & 0xffffffff)) & 0xffffffff
    n = imul(round(x * 100), 374761393) ^ imul(round(z * 100), 668265263) ^ salt
    n = imul(n ^ (n >> 13), 1274126177); return ((n ^ (n >> 16)) & 0xffffffff) / 4294967296

def img(p, cs='sRGB'):
    i = bpy.data.images.load(p); i.colorspace_settings.name = cs; return i

def mat_ground(mode):
    m = bpy.data.materials.new('ground'); nt = m.node_tree; N, L = nt.nodes, nt.links; N.clear()
    out = N.new('ShaderNodeOutputMaterial'); bs = N.new('ShaderNodeBsdfPrincipled'); bs.inputs['Roughness'].default_value = 0.95
    L.new(bs.outputs[0], out.inputs[0])
    tc = N.new('ShaderNodeTexCoord'); geo = N.new('ShaderNodeNewGeometry')
    def tex(path, scale, cs='sRGB'):
        mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / scale, 1 / scale, 1)
        L.new(geo.outputs['Position'], mp.inputs[0]); t = N.new('ShaderNodeTexImage'); t.image = img(path, cs); L.new(mp.outputs[0], t.inputs[0]); return t
    def rgbmul(sock, col):
        mm = N.new('ShaderNodeMix'); mm.data_type = 'RGBA'; mm.blend_type = 'MULTIPLY'; mm.inputs[0].default_value = 1
        L.new(sock, mm.inputs[6]); mm.inputs[7].default_value = (*col, 1); return mm.outputs[2]
    def mix(fac, A, B):
        mm = N.new('ShaderNodeMix'); mm.data_type = 'RGBA'; L.new(fac, mm.inputs[0]); L.new(A, mm.inputs[6]); L.new(B, mm.inputs[7]); return mm.outputs[2]
    def math_(op, x, y=None, c=None):
        n = N.new('ShaderNodeMath'); n.operation = op
        (L.new(x, n.inputs[0]) if not isinstance(x, float) else setattr(n.inputs[0], 'default_value', x))
        if y is not None: (L.new(y, n.inputs[1]) if not isinstance(y, float) else setattr(n.inputs[1], 'default_value', y))
        if c is not None: n.inputs[2].default_value = c
        return n.outputs[0]
    soil = tex(SA + '/soil.jpg', 3.0); soil2 = tex(SA + '/soil.jpg', 23.0)
    noise = N.new('ShaderNodeTexNoise'); noise.inputs['Scale'].default_value = 0.35; L.new(geo.outputs['Position'], noise.inputs[0])
    nfine = N.new('ShaderNodeTexNoise'); nfine.inputs['Scale'].default_value = 2.5; L.new(geo.outputs['Position'], nfine.inputs[0])
    field = mix(noise.outputs['Fac'], rgbmul(soil.outputs[0], (1.27, 1.33, 1.0)), rgbmul(soil2.outputs[0], (1.14, 1.17, 0.88)))
    # furrows parallel to the road
    wv = N.new('ShaderNodeTexWave'); wv.wave_type = 'BANDS'; wv.bands_direction = 'X'; wv.inputs['Scale'].default_value = 1.0 / 0.7 * 0.1
    sep = N.new('ShaderNodeSeparateXYZ'); L.new(geo.outputs['Position'], sep.inputs[0])
    absx = math_('ABSOLUTE', sep.outputs[0]); dist = math_('SUBTRACT', absx, float(ROAD_HW + SHOULDER))   # m from shoulder outer edge
    fur = math_('SINE', math_('MULTIPLY', absx, 2 * math.pi / 0.7)); furf = math_('MULTIPLY_ADD', fur, 0.06, 0.94)
    field = rgbmul(field, (1, 1, 1)); fm = N.new('ShaderNodeMix'); fm.data_type = 'RGBA'; fm.blend_type = 'MULTIPLY'; fm.inputs[0].default_value = 1
    L.new(field, fm.inputs[6]); L.new(furf, fm.inputs[7]); field = fm.outputs[2]
    grass = tex(SA + '/grass.jpg', 2.0)
    jit = math_('MULTIPLY_ADD', nfine.outputs['Fac'], 0.9, -0.45)
    if mode == 'A':
        greenc = rgbmul(grass.outputs[0], (1.26, 0.85, 0.9))    # green verge strip like screenshot (~#7B8250)
        w = math_('SUBTRACT', 1.0, math_('SMOOTHSTEP' if False else 'MAXIMUM', 0.0, 0.0))
        band = N.new('ShaderNodeMapRange'); band.inputs[1].default_value = 2.6; band.inputs[2].default_value = 3.1; band.inputs[3].default_value = 1; band.inputs[4].default_value = 0
        L.new(math_('ADD', dist, math_('MULTIPLY', jit, 0.5)), band.inputs[0]); col = mix(band.outputs[0], field, greenc)
    else:
        # field colour lightened toward straw over ~1.5 m, broken edge
        g_l = N.new('ShaderNodeRGBToBW'); L.new(grass.outputs[0], g_l.inputs[0])
        straw = rgbmul(N.new('ShaderNodeCombineColor').outputs[0], (1, 1, 1))
        cc = N.new('ShaderNodeCombineColor'); [L.new(math_('MULTIPLY', g_l.outputs[0], k), cc.inputs[i]) for i, k in enumerate((2.3, 2.05, 1.25))]
        strawg = mix(nfine.outputs['Fac'], cc.outputs[0], rgbmul(field, (1.12, 1.1, 0.98)))
        vm = N.new('ShaderNodeMapRange'); vm.inputs[1].default_value = 0.2; vm.inputs[2].default_value = 1.5; vm.inputs[3].default_value = 0.8; vm.inputs[4].default_value = 0
        L.new(math_('ADD', dist, jit), vm.inputs[0])
        patch = math_('MULTIPLY_ADD', nfine.outputs['Fac'], 0.9, 0.55)
        col = mix(math_('MINIMUM', math_('MULTIPLY', vm.outputs[0], patch), 0.85), field, strawg)
    L.new(col, bs.inputs['Base Color']); return m

def mat_tex(name, path, scale, tint=(1, 1, 1), rough=0.95):
    m = bpy.data.materials.new(name); nt = m.node_tree; N, L = nt.nodes, nt.links; bs = N['Principled BSDF']; bs.inputs['Roughness'].default_value = rough
    geo = N.new('ShaderNodeNewGeometry'); mp = N.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (1 / scale, 1 / scale, 1); L.new(geo.outputs['Position'], mp.inputs[0])
    t = N.new('ShaderNodeTexImage'); t.image = img(path); L.new(mp.outputs[0], t.inputs[0])
    mm = N.new('ShaderNodeMix'); mm.data_type = 'RGBA'; mm.blend_type = 'MULTIPLY'; mm.inputs[0].default_value = 1; L.new(t.outputs[0], mm.inputs[6]); mm.inputs[7].default_value = (*tint, 1)
    L.new(mm.outputs[2], bs.inputs['Base Color']); return m

def plane(name, x0, x1, y0, y1, z, mat):
    me = bpy.data.meshes.new(name); me.from_pydata([(x0, y0, z), (x1, y0, z), (x1, y1, z), (x0, y1, z)], [], [(0, 1, 2, 3)]); me.materials.append(mat)
    o = bpy.data.objects.new(name, me); scn.collection.objects.link(o); return o

plane('ground', -3000, 3000, -200, 3000, 0.0, mat_ground(MODE))
plane('road', -ROAD_HW, ROAD_HW, -50, 3000, 0.012, mat_tex('asphalt', SA + '/asphalt.jpg', 4.0, (0.44, 0.44, 0.45)))
gm = mat_tex('gravel', SA + '/gravel.jpg', 2.0, (0.19, 0.19, 0.185))
for s in (-1, 1): plane('sh%d' % s, min(s * ROAD_HW, s * (ROAD_HW + SHOULDER)), max(s * ROAD_HW, s * (ROAD_HW + SHOULDER)), -50, 3000, 0.008, gm)

# world: app sky + sun
w = bpy.data.worlds.new('w'); scn.world = w; nt = w.node_tree; N, L = nt.nodes, nt.links
env = N.new('ShaderNodeTexEnvironment'); env.image = img(SA + '/sky.hdr', 'Linear Rec.709'); bg = N['Background']; bg.inputs['Strength'].default_value = 1.0
L.new(env.outputs[0], bg.inputs[0])
sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN')); sun.data.energy = 3.2; sun.data.angle = math.radians(1.5)
sun.rotation_euler = Euler((math.radians(52), 0, math.radians(-145)), 'XYZ'); scn.collection.objects.link(sun)

# grass assets
proto = {}
def load(name):
    if name in proto: return proto[name]
    before = set(bpy.data.objects); bpy.ops.import_scene.gltf(filepath=f'{PNG}/{name}.glb')
    obs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']; o = obs[0]
    for x in list(bpy.data.objects):
        if x in before or x == o: continue
        bpy.data.objects.remove(x)
    o.parent = None; o.location = (0, 0, 0); o.rotation_euler = (math.radians(90), 0, 0)   # glTF Y-up mesh data imported with object rotation
    bpy.context.view_layer.update(); o.data.transform(o.matrix_world); o.matrix_world.identity()
    for mt in o.data.materials:   # Lambert-ish like the app: rough, no spec; translucency a bit
        b = mt.node_tree.nodes.get('Principled BSDF')
        if b: b.inputs['Roughness'].default_value = 0.9; b.inputs['Specular IOR Level'].default_value = 0.2
    o.hide_render = True; o.hide_viewport = True; proto[name] = o; return o

placed = []
def put(name, x, y, s, yaw):
    p = load(name); o = bpy.data.objects.new(name, p.data); o.location = (x, y, -0.015); o.rotation_euler = (0, 0, yaw); o.scale = (s, s, s)
    scn.collection.objects.link(o); placed.append((name, x, y, s))

CAM = {'road': ((-0.4, 0.0, 1.5), (math.radians(88), 0, 0), 50), 'close': ((1.6, 0.0, 1.5), (math.radians(72), 0, math.radians(-25)), 50)}
R = 36.0   # forestGrassR (med) 35 + fade
cam_xy = CAM[VIEW][0][:2]
def visible(x, y):
    d = math.hypot(x - cam_xy[0], y - cam_xy[1]); return d < R and (y > cam_xy[1] - 4)

if MODE == 'A':   # forestGrass.ts: 0.8 m grid, p=density*0.64 (med density 1), band free in [1,4] m, 70 % lolium / 30 % setaria, scale 0.8..1.4
    for gx in range(-12, 13):
        for gy in range(-10, 60):
            ax, ay = gx * 0.8, gy * 0.8
            if h(ax, ay, 121) > 0.64: continue
            x, y = ax + h(ax, ay, 122) * 0.8, ay + h(ax, ay, 123) * 0.8
            free = abs(x) - ROAD_HW
            if not (1 <= free <= 4) or not visible(x, y): continue
            sp = 'lolium' if h(x, y, 124) < 0.7 else 'setaria'; v = 'ab'[int(h(x, y, 125) * 2)]
            put(f'{sp}_{v}_lod0', x, y, 0.8 + h(x, y, 126) * 0.6, h(x, y, 127) * 2 * math.pi)
else:             # proposed: clustered by hash on a 4 m cell grid along the verge band (free 0.6..2.6 m), clusters of 2..6 tufts
    DENS = 1.0 if MODE == 'B' else 1.7
    for side in (-1, 1):
        for cy in range(-6, 24):
            oy = cy * 2.0; ox = side * 10.0
            if h(ox, oy, 301) > 0.62 * min(DENS, 1.5): continue
            gx, gy = side * (ROAD_HW + 0.7 + h(ox, oy, 302) * 1.9), oy + h(ox, oy, 303) * 2.0
            n = 2 + int(h(gx, gy, 304) * 5 * DENS); rad = 0.25 + h(gx, gy, 305) * 0.65
            for k in range(n):
                ang = h(gx, gy, 310 + k) * 2 * math.pi; rr = rad * math.sqrt(h(gx, gy, 320 + k))
                x, y = gx + math.cos(ang) * rr, gy + math.sin(ang) * rr; free = abs(x) - ROAD_HW
                if not (0.6 <= free <= 2.6) or not visible(x, y): continue
                r = h(x, y, 330); v = 'ab'[int(h(x, y, 331) * 2)]; s01 = h(x, y, 332)
                if r < 0.45: name, s = f'ammophila_{v}_lod0_dry', 0.9 + s01 * 0.9          # 0.22..0.45 m
                elif r < 0.68: name, s = f'setaria_{v}_lod0_dry', 1.0 + s01 * 0.6             # 0.17..0.45 m
                elif r < 0.9: name, s = f'digitaria_{v}_lod0_dry', 1.8 + s01 * 1.0            # wispy 0.2..0.56 m
                else: name, s = (f'setaria_{v}_lod0' if s01 < 0.5 else f'ammophila_{v}_lod0'), 0.9 + s01 * 0.5   # ~10 % green
                put(name, x, y, s, h(x, y, 333) * 2 * math.pi)
    # sparse singles in between (taller stalks)
    for gx in range(-6, 7):
        for gy in range(-8, 50):
            ax, ay = gx * 0.8, gy * 0.8
            if h(ax, ay, 351) > 0.06 * DENS: continue
            x, y = ax + h(ax, ay, 352) * 0.8, ay + h(ax, ay, 353) * 0.8; free = abs(x) - ROAD_HW
            if not (0.6 <= free <= 3.0) or not visible(x, y): continue
            put(f'digitaria_{"ab"[int(h(x, y, 354) * 2)]}_lod0_dry', x, y, 2.0 + h(x, y, 355) * 1.0, h(x, y, 356) * 6.28)

c, r, f = CAM[VIEW]; cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); cam.location = c; cam.rotation_euler = r
cam.data.sensor_fit = 'VERTICAL'; cam.data.angle = math.radians(f) if VIEW == 'road' else math.radians(40); scn.collection.objects.link(cam); scn.camera = cam
scn.render.filepath = OUT; bpy.ops.render.render(write_still=True)
cnt = {}
for n, *_ in placed: k = n.split('_')[0] + ('_dry' if n.endswith('dry') else ''); cnt[k] = cnt.get(k, 0) + 1
json.dump({'mode': MODE, 'view': VIEW, 'tufts': len(placed), 'by_asset': cnt, 'tris': 6 * len(placed)}, open(OUT[:-4] + '.json', 'w'), indent=1)
json.dump(placed, open(OUT[:-4] + '_placed.json', 'w'))
print('COUNTS', MODE, VIEW, len(placed), cnt)
