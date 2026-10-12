"""Small procedural-modelling toolkit used by the asset scripts.

Geometry is accumulated per material into plain vertex/face lists and turned into one mesh
object per material at the end (`Asset.build`). Every primitive is created with outward
facing normals so the result renders correctly with single-sided materials in three.js.
"""
import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector

# Palette shared with the web app (docs/ARCHITECTURE.md). sRGB hex values.
PALETTE = {
    'orange': '#f2561d',
    'orange_dark': '#c9441a',
    'white': '#f5f5f3',
    'offwhite': '#e6e4e0',
    'lightgray': '#d3d4d4',
    'gray': '#a7a9ab',
    'darkgray': '#55595e',
    'black': '#1d1e21',
    'glass': '#8f9daa',
    'cardboard': '#c99b62',
    'tape': '#a87d4b',
    'wood': '#a98257',
    'red': '#d9381e',
    'metal': '#bcc1c6',
}

ROUGHNESS = {'metal': 0.45, 'glass': 0.2, 'black': 0.7}
METALLIC = {'metal': 0.6}


def srgb_to_linear(c):
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def hex_to_linear(h):
    h = h.lstrip('#')
    return tuple(srgb_to_linear(int(h[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def get_material(name):
    mat = bpy.data.materials.get(name)
    if mat is not None:
        return mat
    if name not in PALETTE:
        raise KeyError(f'unknown palette material {name!r}')
    mat = bpy.data.materials.new(name)
    try:
        mat.use_nodes = True
    except Exception:
        pass
    r, g, b = hex_to_linear(PALETTE[name])
    bsdf = mat.node_tree.nodes.get('Principled BSDF')
    bsdf.inputs['Base Color'].default_value = (r, g, b, 1.0)
    bsdf.inputs['Roughness'].default_value = ROUGHNESS.get(name, 0.8)
    bsdf.inputs['Metallic'].default_value = METALLIC.get(name, 0.0)
    mat.diffuse_color = (r, g, b, 1.0)
    return mat


def reset_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def trs(loc=(0, 0, 0), rot=(0, 0, 0)):
    return Matrix.Translation(Vector(loc)) @ Euler(rot, 'XYZ').to_matrix().to_4x4()


AXIS_ROT = {
    'Z': Matrix.Identity(4),
    'X': Matrix.Rotation(math.pi / 2, 4, 'Y'),   # local Z -> world X
    'Y': Matrix.Rotation(-math.pi / 2, 4, 'X'),  # local Z -> world Y
}


def _edge_ok(spec, a, b, half):
    """Classify a box edge (a, b are vertex coords of an axis-aligned box centred at 0)."""
    eps = 1e-5
    d = b - a
    along = max(range(3), key=lambda i: abs(d[i]))
    at = lambda i, s: abs(a[i] - s * half[i]) < eps and abs(b[i] - s * half[i]) < eps
    tags = set()
    if along == 2:
        tags.add('vert')
    if at(2, 1):
        tags.add('top')
    if at(2, -1):
        tags.add('bottom')
    if at(1, -1):
        tags.add('front')
    if at(1, 1):
        tags.add('back')
    if at(0, -1):
        tags.add('right')
    if at(0, 1):
        tags.add('left')
    if spec == 'all':
        return True
    if spec == 'nobottom':
        return 'bottom' not in tags
    wanted = set(spec.split('+'))
    return bool(tags & wanted)


class Asset:
    """Collects geometry for one asset, split by material."""

    def __init__(self, name, q=1):
        self.name = name
        self.q = q          # 1 = realtime asset, 2 = thumbnail / hero detail
        self.parts = {}     # material -> (verts, faces)

    # ------------------------------------------------------------------ core
    def add_bm(self, mat, bm, matrix=None):
        if matrix is not None:
            bmesh.ops.transform(bm, matrix=matrix, verts=bm.verts)
        verts, faces = self.parts.setdefault(mat, ([], []))
        off = len(verts)
        bm.verts.index_update()
        verts.extend(v.co.copy() for v in bm.verts)
        faces.extend([off + v.index for v in f.verts] for f in bm.faces)
        bm.free()

    def seg(self, n):
        """Scale a segment count with quality."""
        return n if self.q == 1 else int(n * 2)

    # ------------------------------------------------------------ primitives
    def box(self, mat, size, loc=(0, 0, 0), rot=(0, 0, 0), bevel=0.0, seg=1, edges='all', drop=''):
        """Axis aligned box of `size` centred at `loc`. `drop`: faces to delete, e.g. '-z+z'."""
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
        half = Vector(size) * 0.5
        if bevel > 0:
            sel = [e for e in bm.edges if _edge_ok(edges, e.verts[0].co, e.verts[1].co, half)]
            if sel:
                bmesh.ops.bevel(bm, geom=sel, offset=min(bevel, min(size) * 0.49), segments=seg,
                                affect='EDGES', profile=0.5, clamp_overlap=True)
        elif drop:
            kill = []
            for f in bm.faces:
                n = f.normal
                for token, axis, sign in (('-x', 0, -1), ('+x', 0, 1), ('-y', 1, -1), ('+y', 1, 1),
                                          ('-z', 2, -1), ('+z', 2, 1)):
                    if token in drop and n[axis] * sign > 0.9:
                        kill.append(f)
            if kill:
                bmesh.ops.delete(bm, geom=kill, context='FACES_ONLY')
        self.add_bm(mat, bm, trs(loc, rot))

    def box_between(self, mat, p0, p1, thick=(0.05, 0.05)):
        """Thin box (strut) from point p0 to p1 with cross-section `thick` (w, h)."""
        p0, p1 = Vector(p0), Vector(p1)
        d = p1 - p0
        length = d.length
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bmesh.ops.scale(bm, vec=Vector((thick[0], thick[1], length)), verts=bm.verts)
        rot = Vector((0, 0, 1)).rotation_difference(d.normalized()).to_matrix().to_4x4()
        self.add_bm(mat, bm, Matrix.Translation((p0 + p1) * 0.5) @ rot)

    def cyl(self, mat, r, h, loc=(0, 0, 0), rot=(0, 0, 0), seg=12, r2=None, caps=True, axis='Z'):
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=caps, cap_tris=False, segments=seg, radius1=r,
                              radius2=r if r2 is None else r2, depth=h)
        self.add_bm(mat, bm, trs(loc, rot) @ AXIS_ROT[axis])

    def sphere(self, mat, r, loc=(0, 0, 0), scale=(1, 1, 1), u=16, v=10, rot=(0, 0, 0)):
        bm = bmesh.new()
        bmesh.ops.create_uvsphere(bm, u_segments=u, v_segments=v, radius=r)
        bmesh.ops.scale(bm, vec=Vector(scale), verts=bm.verts)
        self.add_bm(mat, bm, trs(loc, rot))

    def quad(self, mat, w, h, loc=(0, 0, 0), rot=(0, 0, 0)):
        """Single rectangle in the local XY plane facing +Z, then rotated/translated."""
        bm = bmesh.new()
        vs = [bm.verts.new((x, y, 0)) for x, y in ((-w / 2, -h / 2), (w / 2, -h / 2), (w / 2, h / 2), (-w / 2, h / 2))]
        bm.faces.new(vs)
        self.add_bm(mat, bm, trs(loc, rot))

    def prism(self, mat, pts, depth, loc=(0, 0, 0), rot=(0, 0, 0), plane='YZ', drop_caps=False,
              drop_normals=()):
        """Extrude a closed 2D polygon. plane 'YZ': pts are (y, z), extruded along X (centred).
        plane 'XY': pts are (x, y), extruded along Z from 0 to depth.
        plane 'XZ': pts are (x, z), extruded along Y (centred)."""
        bm = bmesh.new()
        n = len(pts)
        if plane == 'YZ':
            a = [bm.verts.new((-depth / 2, p[0], p[1])) for p in pts]
            b = [bm.verts.new((depth / 2, p[0], p[1])) for p in pts]
        elif plane == 'XZ':
            a = [bm.verts.new((p[0], -depth / 2, p[1])) for p in pts]
            b = [bm.verts.new((p[0], depth / 2, p[1])) for p in pts]
        else:
            a = [bm.verts.new((p[0], p[1], 0)) for p in pts]
            b = [bm.verts.new((p[0], p[1], depth)) for p in pts]
        caps = [bm.faces.new(a), bm.faces.new(list(reversed(b)))]
        for i in range(n):
            j = (i + 1) % n
            bm.faces.new((a[i], a[j], b[j], b[i]))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        kill = list(caps) if drop_caps else []
        if drop_normals:
            bm.normal_update()
            for f in bm.faces:
                for dn in drop_normals:
                    if f.normal.dot(Vector(dn)) > 0.95 and f not in kill:
                        kill.append(f)
        if kill:
            bmesh.ops.delete(bm, geom=kill, context='FACES_ONLY')
        self.add_bm(mat, bm, trs(loc, rot))

    def lathe(self, mat, profile, seg=16, loc=(0, 0, 0), rot=(0, 0, 0), axis='Z', closed=True):
        """Revolve a profile of (radius, height) points around local Z."""
        bm = bmesh.new()
        rings = []
        for (r, z) in profile:
            ring = []
            for k in range(seg):
                t = 2 * math.pi * k / seg
                ring.append(bm.verts.new((r * math.cos(t), r * math.sin(t), z)))
            rings.append(ring)
        npr = len(rings)
        last = npr if closed else npr - 1
        for i in range(last):
            ra, rb = rings[i], rings[(i + 1) % npr]
            for k in range(seg):
                k2 = (k + 1) % seg
                try:
                    bm.faces.new((ra[k], ra[k2], rb[k2], rb[k]))
                except ValueError:
                    pass
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.add_bm(mat, bm, trs(loc, rot) @ AXIS_ROT[axis])

    def tube(self, mat, pts, r, seg=8, caps=True):
        """Sweep a circle along a polyline (parallel transport frames)."""
        pts = [Vector(p) for p in pts]
        bm = bmesh.new()
        tangents = []
        for i in range(len(pts)):
            if i == 0:
                t = pts[1] - pts[0]
            elif i == len(pts) - 1:
                t = pts[-1] - pts[-2]
            else:
                t = (pts[i + 1] - pts[i]).normalized() + (pts[i] - pts[i - 1]).normalized()
            tangents.append(t.normalized())
        up = Vector((0, 0, 1)) if abs(tangents[0].z) < 0.9 else Vector((1, 0, 0))
        nrm = tangents[0].cross(up).normalized()
        rings = []
        for i, p in enumerate(pts):
            if i > 0:
                q = tangents[i - 1].rotation_difference(tangents[i])
                nrm = (q @ nrm).normalized()
            bin_ = tangents[i].cross(nrm).normalized()
            ring = []
            for k in range(seg):
                a = 2 * math.pi * k / seg
                ring.append(bm.verts.new(p + r * (math.cos(a) * nrm + math.sin(a) * bin_)))
            rings.append(ring)
        for i in range(len(rings) - 1):
            ra, rb = rings[i], rings[i + 1]
            for k in range(seg):
                k2 = (k + 1) % seg
                bm.faces.new((ra[k], ra[k2], rb[k2], rb[k]))
        if caps:
            bm.faces.new(rings[0])
            bm.faces.new(list(reversed(rings[-1])))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.add_bm(mat, bm)

    def text(self, mat, body, size, loc=(0, 0, 0), rot=(math.pi / 2, 0, 0), extrude=0.03, offset=0.0):
        """Extruded text, centred. Default rotation stands it up facing -Y."""
        cu = bpy.data.curves.new('_tmp_text', 'FONT')
        cu.body = body
        cu.size = size
        cu.extrude = extrude
        cu.offset = offset
        cu.resolution_u = 3 if self.q == 1 else 8
        cu.align_x = 'CENTER'
        cu.align_y = 'CENTER'
        ob = bpy.data.objects.new('_tmp_text', cu)
        bpy.context.scene.collection.objects.link(ob)
        dg = bpy.context.evaluated_depsgraph_get()
        me = bpy.data.meshes.new_from_object(ob.evaluated_get(dg))
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.remove_doubles(bm, verts=bm.verts[:], dist=1e-5)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
        self.add_bm(mat, bm, trs(loc, rot))
        bpy.data.objects.remove(ob)
        bpy.data.curves.remove(cu)
        bpy.data.meshes.remove(me)

    # ------------------------------------------------------------- utilities
    def shift(self, dx=0.0, dy=0.0, dz=0.0):
        off = Vector((dx, dy, dz))
        for verts, _ in self.parts.values():
            for v in verts:
                v += off

    def bounds(self):
        lo = Vector((1e9, 1e9, 1e9))
        hi = Vector((-1e9, -1e9, -1e9))
        for verts, _ in self.parts.values():
            for v in verts:
                for i in range(3):
                    lo[i] = min(lo[i], v[i])
                    hi[i] = max(hi[i], v[i])
        return lo, hi

    def tri_count(self):
        return sum(len(f) - 2 for _, faces in self.parts.values() for f in faces)

    def build(self, collection=None, prefix='asset_'):
        coll = collection or bpy.context.scene.collection
        root = bpy.data.objects.new(f'{prefix}{self.name}', None)
        root.empty_display_size = 0.5
        coll.objects.link(root)
        for mat in sorted(self.parts):
            verts, faces = self.parts[mat]
            if not faces:
                continue
            name = f'{prefix}{self.name}__{mat}'
            me = bpy.data.meshes.new(name)
            me.from_pydata([tuple(v) for v in verts], [], faces)
            me.validate(clean_customdata=False)
            me.update()
            me.materials.append(get_material(mat))
            me.shade_smooth()
            me.set_sharp_from_angle(angle=math.radians(50))
            ob = bpy.data.objects.new(name, me)
            coll.objects.link(ob)
            ob.parent = root
        return root
