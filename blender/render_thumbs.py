"""Renders the transparent product shots used by the UI cards (forklift / loaded forklift / truck).

Run headless:  blender -b --factory-startup -P blender/render_thumbs.py
Outputs public/img/forklift.png, forklift_cargo.png, truck.png (RGBA, transparent background,
soft contact shadow from a shadow catcher). Uses the same model code as build_assets.py at q=2.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
import numpy as np  # noqa: E402
from bpy_extras.object_utils import world_to_camera_view  # noqa: E402
from mathutils import Vector  # noqa: E402

import build_assets as BA  # noqa: E402
import lib_geo as G  # noqa: E402

IMG = os.path.join(BA.ROOT, 'public', 'img')

# (base colour hex or None to keep palette, roughness, metallic, coat)
LOOK = {
    'orange': ('#ee4f17', 0.34, 0.0, 0.4),
    'orange_dark': ('#c4400f', 0.45, 0.0, 0.2),
    'black': ('#161719', 0.55, 0.0, 0.0),
    'darkgray': (None, 0.45, 0.2, 0.0),
    'metal': ('#c4c8cd', 0.28, 1.0, 0.0),
    'glass': ('#1c2228', 0.04, 0.0, 0.6),
    'white': (None, 0.4, 0.0, 0.1),
    'lightgray': ('#e2e3e4', 0.42, 0.0, 0.1),
    'offwhite': (None, 0.35, 0.0, 0.0),
    'cardboard': ('#b98348', 0.85, 0.0, 0.0),
    'tape': ('#94683a', 0.6, 0.0, 0.0),
    'wood': ('#a57a4c', 0.8, 0.0, 0.0),
    'red': (None, 0.4, 0.0, 0.2),
}

SHOTS = [
    # name, builder, (width, height), azimuth from front towards +X, elevation, margin
    ('forklift', BA.make_forklift, (640, 480), 52, 13, 1.08),
    ('forklift_cargo', BA.make_forklift_loaded, (800, 640), 55, 11, 1.05),
    ('truck', BA.make_truck_box, (800, 480), 52, 10, 1.06),
]


def setup_scene():
    sc = bpy.context.scene
    sc.render.engine = 'CYCLES'
    try:
        prefs = bpy.context.preferences.addons['cycles'].preferences
        prefs.compute_device_type = 'OPTIX'
        prefs.get_devices()
        for d in prefs.devices:
            d.use = d.type == 'OPTIX'
        sc.cycles.device = 'GPU'
    except Exception as e:
        print('GPU unavailable, rendering on CPU:', e)
    sc.cycles.samples = 192
    sc.cycles.use_denoising = True
    sc.render.film_transparent = True
    sc.render.image_settings.file_format = 'PNG'
    sc.render.image_settings.color_mode = 'RGBA'
    sc.render.resolution_percentage = 100
    try:
        sc.view_settings.view_transform = 'Standard'
        sc.view_settings.exposure = -0.55
    except Exception:
        pass
    world = bpy.data.worlds.new('studio')
    sc.world = world
    try:
        world.use_nodes = True
    except Exception:
        pass
    bg = world.node_tree.nodes['Background']
    bg.inputs['Color'].default_value = (1, 1, 1, 1)
    bg.inputs['Strength'].default_value = 0.55
    bpy.ops.mesh.primitive_plane_add(size=60, location=(0, 0, 0))
    ground = bpy.context.active_object
    ground.is_shadow_catcher = True
    cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam'))
    cam.data.lens = 58
    sc.collection.objects.link(cam)
    sc.camera = cam
    return cam


def apply_look():
    for name, (hexcol, rough, metal, coat) in LOOK.items():
        mat = bpy.data.materials.get(name)
        if mat is None:
            continue
        bsdf = mat.node_tree.nodes.get('Principled BSDF')
        if hexcol:
            r, g, b = G.hex_to_linear(hexcol)
            bsdf.inputs['Base Color'].default_value = (r, g, b, 1)
        bsdf.inputs['Roughness'].default_value = rough
        bsdf.inputs['Metallic'].default_value = metal
        for key in ('Coat Weight', 'Clearcoat'):
            if key in bsdf.inputs:
                bsdf.inputs[key].default_value = coat
                break


def area_light(name, power, size, target, az, el, dist):
    li = bpy.data.lights.new(name, 'AREA')
    li.energy = power
    li.size = size
    ob = bpy.data.objects.new(name, li)
    a, e = math.radians(az), math.radians(el)
    ob.location = target + Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e))) * dist
    ob.rotation_euler = (target - ob.location).to_track_quat('-Z', 'Y').to_euler()
    bpy.context.scene.collection.objects.link(ob)
    return ob


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


def fit_perspective(cam, corners, d, center, margin):
    """Place the camera along `d` so the projected corners fill the frame (centred, with margin)."""
    sc = bpy.context.scene
    rm = cam.rotation_euler.to_matrix()
    right, up = rm @ Vector((1, 0, 0)), rm @ Vector((0, 1, 0))
    aspect = sc.render.resolution_x / sc.render.resolution_y
    target = center.copy()
    dist = (max(corners, key=lambda c: (c - center).length) - center).length * 3
    for _ in range(12):
        cam.location = target + d * dist
        bpy.context.view_layer.update()
        pts = [world_to_camera_view(sc, cam, c) for c in corners]
        xs, ys = [p.x for p in pts], [p.y for p in pts]
        ex, ey = max(xs) - min(xs), max(ys) - min(ys)
        cx, cy = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2
        width = 2 * dist * math.tan(cam.data.angle / 2)
        target += right * (cx - 0.5) * width + up * (cy - 0.5) * width / aspect
        dist *= max(ex, ey) * margin
    cam.location = target + d * dist


def load_rgba(path):
    img = bpy.data.images.load(path)
    w, h = img.size
    px = np.array(img.pixels[:], dtype=np.float32).reshape(h, w, 4)
    bpy.data.images.remove(img)
    return px


def composite_shadow(obj_path, shadow_path, out_path, strength=0.5, floor=0.03):
    """Object-only pass + shadow-catcher pass -> object over a soft, weakened contact shadow."""
    obj, full = load_rgba(obj_path), load_rgba(shadow_path)
    a1, a2 = obj[..., 3], full[..., 3]
    sh = np.clip((a2 - a1) / np.maximum(1.0 - a1, 1e-4), 0.0, 1.0)
    sh = np.clip((sh - floor) / (1.0 - floor), 0.0, 1.0) * strength
    alpha = a1 + (1.0 - a1) * sh
    out = np.empty_like(obj)
    out[..., :3] = obj[..., :3] * (a1 / np.maximum(alpha, 1e-4))[..., None]
    out[..., 3] = alpha
    h, w = out.shape[:2]
    img = bpy.data.images.new('thumb_out', w, h, alpha=True)
    img.pixels[:] = out.ravel()
    img.filepath_raw = out_path
    img.file_format = 'PNG'
    img.save()
    bpy.data.images.remove(img)


def main():
    G.reset_scene()
    cam = setup_scene()
    roots = {}
    for name, fn, *_ in SHOTS:
        roots[name] = fn(2).build(prefix=f'thumb_{name}_')
    apply_look()
    os.makedirs(IMG, exist_ok=True)
    sc = bpy.context.scene
    for name, _, (w, h), az, el, margin in SHOTS:
        for n, r in roots.items():
            for c in r.children:
                c.hide_render = n != name
        kids = list(roots[name].children)
        lo, hi = world_bbox(kids)
        center = (lo + hi) / 2
        size = (hi - lo).length
        lights = [
            area_light('key', 230 * size, size * 0.6, center, az - 35, 58, size * 1.6),
            area_light('fill', 60 * size, size * 1.2, center, az + 70, 18, size * 1.8),
            area_light('rim', 140 * size, size * 0.7, center, az + 180, 35, size * 1.6),
        ]
        sc.render.resolution_x, sc.render.resolution_y = w, h
        a, e = math.radians(az), math.radians(el)
        d = Vector((math.cos(e) * math.sin(a), -math.cos(e) * math.cos(a), math.sin(e)))
        cam.rotation_euler = (-d).to_track_quat('-Z', 'Y').to_euler()
        corners = [Vector((x, y, z)) for x in (lo.x, hi.x) for y in (lo.y, hi.y) for z in (lo.z, hi.z)]
        fit_perspective(cam, corners, d, center, margin)
        final = os.path.join(IMG, f'{name}.png')
        tmp_obj, tmp_sh = final + '.obj.png', final + '.sh.png'
        ground = bpy.data.objects['Plane']
        ground.hide_render = True
        sc.render.filepath = tmp_obj
        bpy.ops.render.render(write_still=True)
        ground.hide_render = False
        sc.render.filepath = tmp_sh
        bpy.ops.render.render(write_still=True)
        composite_shadow(tmp_obj, tmp_sh, final)
        os.remove(tmp_obj)
        os.remove(tmp_sh)
        print('rendered', final)
        for li in lights:
            bpy.data.objects.remove(li)


main()
