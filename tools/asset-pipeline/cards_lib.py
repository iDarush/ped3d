"""Shared helpers for card asset scripts (run inside Blender 5.0)."""
import bpy, bmesh, math, random
from mathutils import Vector

def nodes_new(nt, t, **kw):
    n = nt.nodes.new(t)
    for k, v in kw.items(): setattr(n, k, v)
    return n

def math_node(nt, op, a=None, b=None):
    n = nt.nodes.new('ShaderNodeMath'); n.operation = op
    if isinstance(a, (int, float)): n.inputs[0].default_value = a
    elif a is not None: nt.links.new(a, n.inputs[0])
    if isinstance(b, (int, float)): n.inputs[1].default_value = b
    elif b is not None: nt.links.new(b, n.inputs[1])
    return n.outputs[0]

def fog_factor(nt, density):
    """three.js FogExp2: f = 1 - exp(-(density*d)^2), d = view distance"""
    cam = nt.nodes.new('ShaderNodeCameraData')
    x = math_node(nt, 'MULTIPLY', cam.outputs['View Distance'], density)
    x2 = math_node(nt, 'MULTIPLY', x, x)
    e = math_node(nt, 'EXPONENT', math_node(nt, 'MULTIPLY', x2, -1.0))
    return math_node(nt, 'SUBTRACT', 1.0, e)

def card_quads(planes, cell_uv, quad_w, quad_h, pivot_v):
    """planes: list of (angle_deg, column_offset). Build vertical quads through origin.
    cell_uv(col)-> (u0,v0,u1,v1) in BLENDER uv (v up). Quad spans x in [-w/2,w/2] along plane dir,
    z from -pivot_v*quad_h to (1-pivot_v)*quad_h. Returns bmesh."""
    bm = bmesh.new(); uvl = bm.loops.layers.uv.new('UVMap')
    for ang, col in planes:
        a = math.radians(ang); r = Vector((math.cos(a), math.sin(a), 0))   # camera-right for azimuth a
        z0, z1 = -pivot_v * quad_h, (1 - pivot_v) * quad_h
        p = [-r * quad_w / 2 + Vector((0, 0, z0)), r * quad_w / 2 + Vector((0, 0, z0)),
             r * quad_w / 2 + Vector((0, 0, z1)), -r * quad_w / 2 + Vector((0, 0, z1))]
        vs = [bm.verts.new(x) for x in p]; f = bm.faces.new(vs)
        u0, v0, u1, v1 = cell_uv(col)
        for l, uv in zip(f.loops, [(u0, v0), (u1, v0), (u1, v1), (u0, v1)]): l[uvl].uv = uv
    return bm
