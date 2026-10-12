"""Verification: re-imports public/models/assets.glb, prints per-asset stats (three.js axes) and
renders one preview tile per asset into blender/preview/tiles/ (compose with compose_sheet.py).

Run:  blender -b --factory-startup -P blender/preview_assets.py [-- name1 name2 ...]
"""
import json
import math
import os
import sys

import bpy
from mathutils import Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
GLB = os.path.join(ROOT, 'public', 'models', 'assets.glb')
OUT = os.path.join(ROOT, 'blender', 'preview')
TILES = os.path.join(OUT, 'tiles')

VEHICLES = ('truck_box', 'truck_flatbed', 'forklift', 'forklift_loaded', 'amr', 'amr_cart')


def setup_render(w=420, h=315, samples=24):
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type in ('OPTIX',)
        sc.cycles.device = 'GPU'
    except Exception as e:  # pragma: no cover - CPU fallback
        print('GPU setup failed, using CPU', e)
    sc.cycles.samples = samples
    sc.cycles.use_denoising = True
    sc.render.resolution_x = w
    sc.render.resolution_y = h
    sc.render.resolution_percentage = 100
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = 'PNG'
    try:
        sc.view_settings.view_transform = 'Standard'
        sc.view_settings.exposure = -0.35
    except Exception:
        pass
    world = bpy.data.worlds.new('w')
    world.use_nodes = True
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (0.78, 0.79, 0.8, 1)
    bg.inputs['Strength'].default_value = 0.9
    sc.world = world
    sun = bpy.data.objects.new('sun', bpy.data.lights.new('sun', 'SUN'))
    sun.data.energy = 2.6
    sun.data.angle = math.radians(8)
    sun.rotation_euler = (math.radians(50), math.radians(-20), math.radians(-35))
    sc.collection.objects.link(sun)
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.type = 'ORTHO'
    sc.collection.objects.link(cam)
    sc.camera = cam
    # ground
    bpy.ops.mesh.primitive_plane_add(size=400, location=(0, 0, 0))
    ground = bpy.context.active_object
    gm = bpy.data.materials.new('ground')
    gm.use_nodes = True
    gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.62, 0.63, 0.64, 1)
    ground.data.materials.append(gm)
    return cam


def tri_count(ob):
    me = ob.data
    me.calc_loop_triangles()
    return len(me.loop_triangles)


def world_bbox(objs):
    lo = Vector((1e9, 1e9, 1e9))
    hi = Vector((-1e9, -1e9, -1e9))
    for ob in objs:
        for c in ob.bound_box:
            w = ob.matrix_world @ Vector(c)
            for i in range(3):
                lo[i] = min(lo[i], w[i])
                hi[i] = max(hi[i], w[i])
    return lo, hi


def centroid(ob):
    me = ob.data
    s = Vector()
    for v in me.vertices:
        s += ob.matrix_world @ v.co
    return s / max(1, len(me.vertices))


def main():
    only = sys.argv[sys.argv.index('--') + 1:] if '--' in sys.argv else []
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=GLB)
    roots = [o for o in bpy.data.objects if o.parent is None and o.name.startswith('asset_')]
    roots.sort(key=lambda o: o.name)
    stats = {}
    problems = []
    for r in roots:
        name = r.name[len('asset_'):]
        kids = [c for c in r.children if c.type == 'MESH']
        for c in kids:
            mats = [m.name for m in c.data.materials]
            exp = f'asset_{name}__'
            if not c.name.startswith(exp) or len(mats) != 1 or c.name[len(exp):] != mats[0]:
                problems.append(f'{c.name}: materials {mats}')
        lo, hi = world_bbox(kids)
        tris = sum(tri_count(c) for c in kids)
        # three.js axes: x = x, y = z_blender, z = -y_blender
        bb3 = {'min': [round(lo.x, 3), round(lo.z, 3), round(-hi.y, 3)],
               'max': [round(hi.x, 3), round(hi.z, 3), round(-lo.y, 3)]}
        info = {'children': sorted(c.name for c in kids), 'tris': tris, 'bbox_three': bb3,
                'root_transform_identity': r.matrix_world == r.matrix_world.Identity(4)}
        if name in VEHICLES:
            orange = [c for c in kids if c.name.endswith('__orange')]
            if orange:
                cy = centroid(orange[0]).y if name.startswith('truck') else None
                if cy is not None:
                    info['cab_centroid_y_blender'] = round(cy, 3)
                    if cy >= 0:
                        problems.append(f'{name}: cab not toward -Y')
            if name.startswith('forklift'):
                metal = [c for c in kids if c.name.endswith('__metal')]
                fy = centroid(metal[0]).y if metal else 0
                info['forks_centroid_y_blender'] = round(fy, 3)
                if fy >= 0:
                    problems.append(f'{name}: forks not toward -Y')
        if abs(lo.z) > 0.02:
            problems.append(f'{name}: bottom at z={lo.z:.3f}')
        stats[name] = info
        print(f'{name:20s} tris {tris:5d}  three bbox {bb3["min"]} .. {bb3["max"]}  kids {len(kids)}')
    os.makedirs(TILES, exist_ok=True)
    with open(os.path.join(OUT, 'stats.json'), 'w') as f:
        json.dump(stats, f, indent=1)
    print('PROBLEMS:', problems or 'none')

    cam = setup_render()
    az, el = math.radians(40), math.radians(28)
    d = Vector((math.cos(el) * math.sin(az), -math.cos(el) * math.cos(az), math.sin(el)))
    cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
    for r in roots:
        name = r.name[len('asset_'):]
        if only and name not in only:
            continue
        for o in roots:
            vis = o is r
            for c in o.children:
                c.hide_render = not vis
        kids = [c for c in r.children if c.type == 'MESH']
        lo, hi = world_bbox(kids)
        corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
        center = (lo + hi) / 2
        rm = cam.rotation_euler.to_matrix()
        right, up = rm @ Vector((1, 0, 0)), rm @ Vector((0, 1, 0))
        us = [c.dot(right) for c in corners]
        vs = [c.dot(up) for c in corners]
        aspect = bpy.context.scene.render.resolution_x / bpy.context.scene.render.resolution_y
        cam.data.ortho_scale = max(max(us) - min(us), (max(vs) - min(vs)) * aspect) * 1.1
        um, vm = (max(us) + min(us)) / 2, (max(vs) + min(vs)) / 2
        cam.location = right * um + up * vm + d * (center.dot(d) + 150)
        cam.data.clip_start = 0.5
        cam.data.clip_end = 1000
        bpy.context.scene.render.filepath = os.path.join(TILES, f'{name}.png')
        bpy.ops.render.render(write_still=True)
    print('tiles written to', TILES)


main()
