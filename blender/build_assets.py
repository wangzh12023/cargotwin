"""Builds every prop / vehicle used by the web app and exports public/models/assets.glb.

Run headless:  blender -b --factory-startup -P blender/build_assets.py
Conventions (docs/ARCHITECTURE.md): metres, Z-up in Blender, vehicles face -Y (three.js +Z),
origin = footprint centre at ground level, one Empty `asset_<name>` per asset whose children are
joined per palette material and named `asset_<name>__<material>`.
"""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402

import lib_geo as G  # noqa: E402
from lib_geo import Asset  # noqa: E402

R = math.radians
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
OUT = os.path.join(ROOT, 'public', 'models', 'assets.glb')


# --------------------------------------------------------------------------- shared parts
def wheel(a, x, y, r, w, side, hub=True):
    """Tyre with its axle along X, centred at (x, y, r). `side` = +1 when the outer face is +X."""
    seg = 12 if a.q == 1 else 30
    ri = r * 0.6
    c = 0.075 * r / 0.5
    prof = [(ri, -w / 2), (r - c, -w / 2), (r, -w / 2 + c), (r, w / 2 - c), (r - c, w / 2), (ri, w / 2)]
    a.lathe('black', prof, seg=seg, loc=(x, y, r), axis='X')
    if hub:
        hx = x + side * (w / 2 - 0.01)
        a.cyl('metal', r * 0.52, 0.03, loc=(hx, y, r), axis='X', seg=seg)
        a.cyl('darkgray', r * 0.17, 0.05, loc=(hx + side * 0.015, y, r), axis='X', seg=8 if a.q == 1 else 16)


def wheel_arch(a, x, y, r):
    pts = []
    for i in range(9):
        t = math.pi * i / 8
        pts.append((x, y + math.cos(t) * r, 0.5 + math.sin(t) * r))
    a.tube('black', pts, 0.045, seg=6 if a.q == 1 else 12)


def carton(a, size, loc, rot_z=0.0, mat='cardboard', tape=True):
    """Cardboard box sitting with its bottom at loc.z, tape strip across the top."""
    sx, sy, sz = size
    x, y, z = loc
    a.box(mat, size, loc=(x, y, z + sz / 2), rot=(0, 0, rot_z))
    if tape:
        a.quad('tape', 0.07, sy * 0.999, loc=(x, y, z + sz + 0.008), rot=(0, 0, rot_z))


def pallet_simple(a, loc=(0, 0, 0), rot_z=0.0):
    """1.2 (X) x 1.0 (Y) x 0.14 pallet: top deck + three runners (shows the fork gaps)."""
    x, y, z = loc
    c, s = math.cos(rot_z), math.sin(rot_z)
    rot = (0, 0, rot_z)

    def at(px, py, pz):
        return (x + px * c - py * s, y + px * s + py * c, z + pz)

    a.box('wood', (1.2, 1.0, 0.03), loc=at(0, 0, 0.125), rot=rot)
    for py in (-0.44, 0.0, 0.44):
        a.box('wood', (1.2, 0.12, 0.11), loc=at(0, py, 0.055), rot=rot, drop='-z')


def pallet_detailed(a, loc=(0, 0, 0)):
    x, y, z = loc
    for i in range(5):
        a.box('wood', (0.14, 1.0, 0.022), loc=(x - 0.53 + i * 0.265, y, z + 0.131))
    for px in (-0.53, 0.0, 0.53):
        for py in (-0.44, 0.0, 0.44):
            a.box('wood', (0.14, 0.12, 0.098), loc=(x + px, y + py, z + 0.071))
    for py in (-0.44, 0.0, 0.44):
        a.box('wood', (1.2, 0.12, 0.022), loc=(x, y + py, z + 0.011))


def boxes_on_pallet(a, loc=(0, 0, 0), rot_z=0.0, mixed=False, layers=2, rng=None):
    rng = rng or random.Random(7)
    x, y, z = loc
    c, s = math.cos(rot_z), math.sin(rot_z)
    base = z + 0.14
    bw, bd, bh = 0.585, 0.485, 0.48
    for layer in range(layers):
        top = layer == layers - 1
        if mixed and top:
            for py in (-0.25, 0.25):
                h = 0.38
                px, ppy = 0.0, py
                a.box('white', (1.17, 0.48, h), loc=(x + px * c - ppy * s, y + px * s + ppy * c, base + h / 2),
                      rot=(0, 0, rot_z))
            continue
        for px in (-0.3, 0.3):
            for py in (-0.25, 0.25):
                j = rng.uniform(-0.01, 0.01)
                carton(a, (bw, bd, bh), (x + (px + j) * c - py * s, y + (px + j) * s + py * c, base),
                       rot_z=rot_z, tape=top)
        base += bh


# --------------------------------------------------------------------------- vehicles
def truck_cab(a, yf=-4.8):
    bs = 2 if a.q == 1 else 4
    # lower cab body and set-back upper cab (windscreen ledge)
    a.box('orange', (2.42, 2.25, 1.4), loc=(0, yf + 1.125, 1.32), bevel=0.1, seg=bs, edges='nobottom')
    a.box('orange', (2.38, 2.12, 1.32), loc=(0, yf + 0.13 + 1.06, 2.62), bevel=0.14, seg=bs)
    # roof deflector: rises from the cab roof to box height and runs back over the box front
    a.prism('orange', [(yf + 0.32, 3.24), (yf + 2.25, 3.24), (yf + 2.25, 3.5), (yf + 1.05, 3.5)], 2.3)
    a.box('orange', (2.48, 0.9, 0.035), loc=(0, yf + 2.25 + 0.45, 3.5175))
    # glazing
    a.box('glass', (2.04, 0.04, 0.9), loc=(0, yf + 0.13 - 0.012, 2.66))
    for sx in (-1, 1):
        a.box('glass', (0.04, 1.0, 0.72), loc=(sx * 1.196, yf + 0.78, 2.66))
        # mirrors
        a.box('black', (0.24, 0.05, 0.05), loc=(sx * 1.3, yf + 0.36, 2.92))
        a.box('black', (0.07, 0.16, 0.44), loc=(sx * 1.43, yf + 0.34, 2.7), bevel=0.02, seg=1)
        # headlights
        a.box('offwhite', (0.36, 0.03, 0.17), loc=(sx * 0.86, yf - 0.012, 1.0))
        # door step
        a.box('black', (0.08, 0.5, 0.07), loc=(sx * 1.2, yf + 1.45, 0.72))
    # grille + bumper
    a.box('black', (1.36, 0.03, 0.5), loc=(0, yf - 0.012, 1.34))
    for gz in (1.2, 1.34, 1.48):
        a.box('darkgray', (1.28, 0.02, 0.045), loc=(0, yf - 0.03, gz))
    a.box('black', (2.46, 0.3, 0.32), loc=(0, yf + 0.1, 0.74), bevel=0.04, seg=1)


def truck_chassis(a, rear_axles=(2.65, 3.95), front_axle=-3.85):
    a.box('black', (0.2, 9.1, 0.28), loc=(0.55, 0.15, 0.76), drop='-z')
    a.box('black', (0.2, 9.1, 0.28), loc=(-0.55, 0.15, 0.76), drop='-z')
    a.box('black', (2.3, 0.12, 0.14), loc=(0, 4.72, 0.56))
    for sx in (-1, 1):
        a.box('black', (0.05, 4.3, 0.09), loc=(sx * 1.18, -0.2, 0.8))
        a.box('lightgray', (0.5, 1.3, 0.42), loc=(sx * 0.95, -1.55, 0.78), bevel=0.03, seg=1)  # tank / side box
        a.box('red', (0.26, 0.03, 0.11), loc=(sx * 1.0, 4.79, 0.56))
        wheel(a, sx * 1.06, front_axle, 0.5, 0.32, sx)
        wheel_arch(a, sx * 1.23, front_axle, 0.6)
        for ry in rear_axles:
            wheel(a, sx * 0.97, ry, 0.5, 0.56, sx)


def make_truck_box(q=1):
    a = Asset('truck_box', q)
    truck_cab(a)
    truck_chassis(a)
    bs = 1 if q == 1 else 3
    # light-grey box body (the reference trucks read noticeably greyer than white buildings)
    a.box('lightgray', (2.5, 7.25, 2.44), loc=(0, 1.175, 1.06 + 1.22), bevel=0.05, seg=bs)
    a.box('darkgray', (2.52, 7.25, 0.07), loc=(0, 1.175, 1.06))
    for sx in (-1, 1):
        a.box('orange', (0.012, 7.2, 0.14), loc=(sx * 1.256, 1.175, 1.4))
    a.box('orange', (2.4, 0.012, 0.14), loc=(0, 4.806, 1.4))
    # rear door seam and lock rods
    a.box('offwhite', (0.03, 0.015, 2.3), loc=(0, 4.81, 2.28))
    for rx in (-0.78, -0.36, 0.36, 0.78):
        a.box('darkgray', (0.035, 0.02, 2.1), loc=(rx, 4.815, 2.28))
    if q > 1:  # vertical body ribs for the product render (kept above the stripe)
        for i in range(19):
            y = -2.1 + i * 0.38
            for sx in (-1, 1):
                a.box('lightgray', (0.02, 0.06, 1.9), loc=(sx * 1.255, y, 2.47))
    return a


def make_truck_flatbed(q=1):
    a = Asset('truck_flatbed', q)
    truck_cab(a)
    truck_chassis(a)
    a.box('darkgray', (2.5, 7.25, 0.26), loc=(0, 1.175, 1.13))
    for sx in (-1, 1):
        a.box('orange', (0.012, 7.2, 0.1), loc=(sx * 1.256, 1.175, 1.14))
    a.box('wood', (2.46, 7.2, 0.04), loc=(0, 1.175, 1.28))
    # headboard behind the cab
    a.box('gray', (2.4, 0.08, 1.3), loc=(0, -2.38, 1.95))
    for hz in (1.55, 1.95, 2.35):
        a.box('darkgray', (2.42, 0.1, 0.06), loc=(0, -2.38, hz))
    return a


def forklift_parts(a, loaded=False):
    lift = 0.18 if loaded else 0.0
    bs = 2 if a.q == 1 else 4
    # wheels
    for sx in (-1, 1):
        wheel(a, sx * 0.48, -0.5, 0.32, 0.24, sx)
        wheel(a, sx * 0.46, 0.82, 0.26, 0.2, sx)
    # chassis, body, fenders, counterweight, hood
    a.box('darkgray', (0.82, 1.75, 0.38), loc=(0, 0.12, 0.29))
    a.box('orange', (1.08, 1.6, 0.5), loc=(0, 0.25, 0.68), bevel=0.05, seg=bs, edges='nobottom')
    for sx in (-1, 1):
        a.box('orange', (0.3, 0.7, 0.07), loc=(sx * 0.5, -0.5, 0.69), bevel=0.02, seg=1)
    a.box('orange', (1.1, 0.5, 0.98), loc=(0, 1.12, 0.67), bevel=0.14, seg=bs, edges='nobottom')
    a.box('orange', (1.0, 0.85, 0.16), loc=(0, 0.55, 1.0), bevel=0.04, seg=bs, edges='nobottom')
    # cowl, steering
    a.box('orange', (0.72, 0.32, 0.36), loc=(0, -0.32, 1.1), bevel=0.05, seg=bs, edges='nobottom')
    a.box('black', (0.6, 0.2, 0.04), loc=(0, -0.3, 1.29))
    a.box_between('black', (0, -0.26, 1.28), (0, -0.12, 1.5), thick=(0.05, 0.05))
    a.cyl('black', 0.17, 0.035, loc=(0, -0.1, 1.52), rot=(R(-35), 0, 0), seg=12 if a.q == 1 else 24)
    # seat
    a.box('black', (0.5, 0.46, 0.1), loc=(0, 0.42, 1.13), bevel=0.03, seg=1)
    a.box('black', (0.5, 0.1, 0.48), loc=(0, 0.69, 1.4), rot=(R(-10), 0, 0), bevel=0.03, seg=1)
    # overhead guard
    for sx in (-1, 1):
        a.box('black', (0.06, 0.06, 1.22), loc=(sx * 0.5, -0.36, 1.54))
        a.box('black', (0.06, 0.06, 1.08), loc=(sx * 0.5, 0.98, 1.62))
        a.box('black', (0.07, 1.42, 0.07), loc=(sx * 0.5, 0.31, 2.17))
        a.box('offwhite', (0.07, 0.04, 0.07), loc=(sx * 0.5, -0.4, 1.98))  # work light
    for gy in (-0.36, 0.98):
        a.box('black', (1.07, 0.07, 0.07), loc=(0, gy, 2.17))
    for gy in (-0.15, 0.1, 0.35, 0.6, 0.85):
        a.box('darkgray', (0.94, 0.07, 0.025), loc=(0, gy, 2.175))
    a.box('orange_dark', (0.14, 0.14, 0.1), loc=(0.3, 0.85, 2.25), bevel=0.03, seg=1)  # beacon
    # mast
    for sx in (-1, 1):
        a.box('black', (0.08, 0.13, 2.25), loc=(sx * 0.33, -0.8, 1.175))
        a.box('black', (0.06, 0.08, 2.05), loc=(sx * 0.25, -0.88, 1.175 + lift * 0.5))
    a.box('black', (0.74, 0.1, 0.1), loc=(0, -0.8, 2.25))
    a.box('black', (0.74, 0.08, 0.08), loc=(0, -0.8, 1.25))
    a.cyl('metal', 0.04, 1.7, loc=(0, -0.74, 1.0), seg=8)
    # carriage + load backrest
    a.box('black', (0.92, 0.06, 0.42), loc=(0, -0.95, 0.33 + lift))
    a.box('black', (0.92, 0.07, 0.06), loc=(0, -0.95, 1.12 + lift))
    for bx in (-0.43, -0.15, 0.15, 0.43):
        a.box('black', (0.035, 0.035, 0.55), loc=(bx, -0.95, 0.83 + lift))
    # forks
    for sx in (-1, 1):
        a.box('metal', (0.1, 0.05, 0.55), loc=(sx * 0.24, -1.0, 0.335 + lift))
        a.box('metal', (0.1, 0.92, 0.045), loc=(sx * 0.24, -1.46, 0.0825 + lift))
    if loaded:
        pz = 0.2
        pallet_simple(a, (0, -1.46, pz), rot_z=R(90))
        boxes_on_pallet(a, (0, -1.46, pz), rot_z=R(90), rng=random.Random(3))


FORKLIFT_SHIFT = 0.275  # recentres the unloaded forklift footprint; reused for the loaded one


def make_forklift(q=1):
    a = Asset('forklift', q)
    forklift_parts(a)
    a.shift(dy=FORKLIFT_SHIFT)
    return a


def make_forklift_loaded(q=1):
    a = Asset('forklift_loaded', q)
    forklift_parts(a, loaded=True)
    a.shift(dy=FORKLIFT_SHIFT)
    return a


def make_amr(q=1):
    a = Asset('amr', q)
    a.box('white', (1.1, 0.75, 0.32), loc=(0, 0, 0.25), bevel=0.06, seg=2, edges='vert+top')
    a.box('darkgray', (1.12, 0.77, 0.06), loc=(0, 0, 0.12))
    a.box('orange', (0.86, 0.1, 0.03), loc=(0, 0, 0.42))
    a.box('orange', (0.1, 0.5, 0.03), loc=(-0.35, 0, 0.42))
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.cyl('black', 0.08, 0.06, loc=(sx * 0.38, sy * 0.3, 0.08), axis='X', seg=8)
    return a


def make_amr_cart(q=1):
    a = Asset('amr_cart', q)
    a.box('white', (1.0, 0.7, 0.35), loc=(0, 0, 0.255), bevel=0.04, seg=2, edges='vert+top')
    a.box('orange', (0.95, 0.66, 0.07), loc=(0, 0, 0.465), bevel=0.02, seg=1)
    carton(a, (0.5, 0.44, 0.4), (0.05, 0, 0.5), rot_z=R(4))
    for sx in (-1, 1):
        for sy in (-1, 1):
            a.cyl('black', 0.07, 0.05, loc=(sx * 0.36, sy * 0.27, 0.07), axis='X', seg=8)
    return a


# --------------------------------------------------------------------------- cargo
def make_pallet(q=1):
    a = Asset('pallet', q)
    pallet_detailed(a)
    return a


def make_pallet_boxes(q=1):
    a = Asset('pallet_boxes', q)
    pallet_simple(a)
    boxes_on_pallet(a)
    return a


def make_pallet_boxes_mixed(q=1):
    a = Asset('pallet_boxes_mixed', q)
    pallet_simple(a)
    boxes_on_pallet(a, mixed=True, rng=random.Random(11))
    return a


def make_pallet_stack(q=1):
    a = Asset('pallet_stack', q)
    rng = random.Random(5)
    for i in range(5):
        pallet_simple(a, (rng.uniform(-0.02, 0.02), rng.uniform(-0.02, 0.02), i * 0.14), rot_z=R(rng.uniform(-2, 2)))
    return a


def make_box(q=1):
    a = Asset('box', q)
    carton(a, (0.5, 0.5, 0.5), (0, 0, 0))
    a.quad('tape', 0.07, 0.2, loc=(0, -0.258, 0.4), rot=(R(90), 0, 0))
    return a


# --------------------------------------------------------------------------- yard / plant
def make_silo(q=1):
    a = Asset('silo', q)
    seg = 28 if q == 1 else 64
    a.cyl('gray', 3.12, 0.7, loc=(0, 0, 0.35), seg=seg)
    a.cyl('gray', 3.0, 12.9, loc=(0, 0, 0.7 + 6.45), seg=seg, caps=False)
    for z in (3.4, 6.2, 9.0, 11.8):
        a.cyl('darkgray', 3.035, 0.07, loc=(0, 0, z), seg=seg, caps=False)
    a.lathe('lightgray', [(3.04, 13.6), (2.75, 14.15), (2.0, 14.55), (0.55, 14.82), (0.55, 13.6)], seg=seg)
    a.cyl('lightgray', 0.55, 0.28, loc=(0, 0, 14.95), seg=16)
    # caged ladder on -X side
    lx = -3.3
    for sy in (-0.22, 0.22):
        a.box('darkgray', (0.05, 0.05, 13.3), loc=(lx, sy, 7.35))
    z = 1.0
    while z < 13.7:
        a.box('darkgray', (0.04, 0.44, 0.03), loc=(lx, 0, z), drop='-z+z')
        z += 0.45
    for sy in (-0.3, 0.0, 0.3):
        a.box('darkgray', (0.03, 0.03, 10.6), loc=(lx - 0.45, sy, 8.3))
    for hz in (3.2, 5.3, 7.4, 9.5, 11.6, 13.6):
        a.box('darkgray', (0.03, 0.66, 0.03), loc=(lx - 0.47, 0, hz))
        for sy in (-0.33, 0.33):
            a.box('darkgray', (0.5, 0.03, 0.03), loc=(lx - 0.23, sy, hz))
    # outlet pipe: leaves the base on the front-left, curves down into the ground
    d = (-math.sqrt(0.5), -math.sqrt(0.5))
    pts = [(2.6, 1.7), (3.6, 1.7)]
    for i in range(1, 7):
        t = R(90) * i / 6
        pts.append((3.6 + 0.95 * math.sin(t), 0.75 + 0.95 * math.cos(t)))
    pts.append((4.55, 0.0))
    a.tube('darkgray', [(d[0] * r, d[1] * r, zz) for r, zz in pts], 0.17, seg=8 if q == 1 else 16)
    return a


def make_gantry_crane(q=1):
    a = Asset('gantry_crane', q)
    for sx in (-1, 1):
        a.box('orange', (0.75, 0.75, 13.3), loc=(sx * 15.0, 0, 7.15))
        a.box('black', (1.3, 3.2, 0.5), loc=(sx * 15.0, 0, 0.25))
        a.box('orange', (0.5, 2.6, 0.5), loc=(sx * 15.0, 0, 0.75))
        a.box_between('orange', (sx * 15.0, -1.2, 0.9), (sx * 15.0, 0, 5.0), thick=(0.3, 0.3))
        a.box_between('orange', (sx * 15.0, 1.2, 0.9), (sx * 15.0, 0, 5.0), thick=(0.3, 0.3))
    a.box('orange', (31.6, 1.1, 1.35), loc=(0, 0, 14.475), bevel=0.04, seg=1)
    a.box('black', (2.4, 1.7, 0.9), loc=(4.0, 0, 13.35))
    for cx in (-0.8, 0.8):
        for cy in (-0.5, 0.5):
            a.box('darkgray', (0.035, 0.035, 5.9), loc=(4.0 + cx, cy, 9.95), drop='-z+z')
    a.box('orange', (6.0, 2.3, 0.32), loc=(4.0, 0, 6.84))
    for cx in (-2.8, 2.8):
        for cy in (-1.0, 1.0):
            a.box('black', (0.25, 0.25, 0.12), loc=(4.0 + cx, cy, 6.62))
    return a


def container(a, body, frame):
    L, W, H = 12.2, 2.44, 2.6
    hx, hy = L / 2, W / 2
    for sy in (-1, 1):
        a.box(frame, (L, 0.16, 0.16), loc=(0, sy * (hy - 0.08), 0.08))
        a.box(frame, (L, 0.16, 0.16), loc=(0, sy * (hy - 0.08), H - 0.08))
    for sx in (-1, 1):
        a.box(frame, (0.16, W, 0.16), loc=(sx * (hx - 0.08), 0, 0.08))
        a.box(frame, (0.16, W, 0.16), loc=(sx * (hx - 0.08), 0, H - 0.08))
        for sy in (-1, 1):
            a.box(frame, (0.16, 0.16, H), loc=(sx * (hx - 0.08), sy * (hy - 0.08), H / 2))
    a.box(body, (L - 0.3, W - 0.2, 0.1), loc=(0, 0, H - 0.1))
    # corrugated long sides (trapezoidal ribs)
    pitch = 0.4 if a.q == 1 else 0.3
    n = int((L - 0.32) / pitch)
    x0 = -n * pitch / 2
    for sy in (-1, 1):
        outer, inner, back = hy - 0.02, hy - 0.06, hy - 0.14
        pts = []
        for i in range(n):
            x = x0 + i * pitch
            pts += [(x, inner), (x + pitch * 0.12, outer), (x + pitch * 0.5, outer), (x + pitch * 0.62, inner)]
        pts.append((x0 + n * pitch, inner))
        pts += [(x0 + n * pitch, back), (x0, back)]
        if sy < 0:
            pts = [(px, -py) for px, py in pts]
        a.prism(body, pts, H - 0.32, loc=(0, 0, 0.16), plane='XY',
                drop_normals=((0, 0, 1), (0, 0, -1), (0, -sy, 0)))
    # ends: plain end and door end with lock rods
    a.box(body, (0.06, W - 0.3, H - 0.32), loc=(-hx + 0.05, 0, H / 2))
    a.box(body, (0.06, W - 0.3, H - 0.32), loc=(hx - 0.05, 0, H / 2))
    for ry in (-0.85, -0.35, 0.35, 0.85):
        a.box('darkgray', (0.04, 0.04, H - 0.4), loc=(hx - 0.0, ry, H / 2))
    a.box(frame, (0.03, 0.04, H - 0.32), loc=(hx - 0.01, 0, H / 2))


def make_container_white(q=1):
    a = Asset('container_white', q)
    container(a, 'white', 'offwhite')
    return a


def make_container_orange(q=1):
    a = Asset('container_orange', q)
    container(a, 'orange', 'orange_dark')
    return a


def make_conveyor(q=1, length=6.0):
    a = Asset('conveyor', q)
    for sx in (-1, 1):
        a.box('gray', (0.08, length, 0.16), loc=(sx * 0.56, 0, 0.82))
    n = int(length / 0.25)
    for i in range(n):
        y = -length / 2 + 0.125 + i * 0.25
        a.cyl('metal', 0.045, 1.04, loc=(0, y, 0.82), axis='X', seg=8, caps=False)
    for ly in (-length / 2 + 0.3, 0.0, length / 2 - 0.3):
        for sx in (-1, 1):
            a.box('gray', (0.06, 0.06, 0.74), loc=(sx * 0.52, ly, 0.37), drop='-z')
        a.box('gray', (1.04, 0.05, 0.05), loc=(0, ly, 0.22))
    return a


def make_scanner_arch(q=1):
    a = Asset('scanner_arch', q)
    for sx in (-1, 1):
        a.box('gray', (0.12, 0.12, 2.2), loc=(sx * 0.8, 0, 1.1), drop='-z')
    a.box('orange', (1.84, 0.3, 0.24), loc=(0, 0, 2.3))
    return a


def make_rack(q=1):
    a = Asset('rack', q)
    rng = random.Random(21)
    L, D, H = 9.0, 1.2, 7.5
    xs = (-4.5, -1.5, 1.5, 4.5)
    for x in xs:
        for sy in (-1, 1):
            a.box('gray', (0.08, 0.08, H), loc=(x, sy * 0.55, H / 2), drop='-z')
    for x in (xs[0], xs[-1]):
        z = 0.2
        k = 0
        while z < H - 1.4:
            y0, y1 = (-0.55, 0.55) if k % 2 == 0 else (0.55, -0.55)
            a.box_between('gray', (x, y0, z), (x, y1, z + 1.4), thick=(0.04, 0.04))
            z += 1.4
            k += 1
    levels = (0.1, 1.55, 3.0, 4.45, 5.9)
    for lz in levels:
        a.box('orange', (L + 0.1, D, 0.1), loc=(0, 0, lz + 0.05))
        for bay in range(3):
            bx = -3.0 + bay * 3.0
            for k, off in enumerate((-0.68, 0.68)):
                w = rng.uniform(1.15, 1.3)
                d = rng.uniform(0.9, 1.0)
                h = rng.uniform(0.95, 1.12)
                carton(a, (w, d, h), (bx + off + rng.uniform(-0.05, 0.05), rng.uniform(-0.04, 0.04), lz + 0.1),
                       rot_z=R(rng.uniform(-2, 2)))
    return a


def make_stacker_crane(q=1):
    a = Asset('stacker_crane', q)
    a.box('darkgray', (0.25, 6.0, 0.15), loc=(0, 0, 0.075))
    a.box('darkgray', (1.2, 2.4, 0.5), loc=(0, 0, 0.4))
    a.box('gray', (0.4, 0.4, 15.0), loc=(0, 0, 7.5 + 0.15))
    a.box('gray', (0.3, 2.0, 0.3), loc=(0, 0, 15.0))
    a.box('orange', (1.8, 1.4, 0.15), loc=(-1.0, 0, 7.5))
    a.box('orange', (0.15, 1.4, 0.7), loc=(-0.2, 0, 7.85))
    carton(a, (1.0, 0.8, 0.8), (-1.1, 0, 7.575), rot_z=R(3))
    return a


def make_machine(q=1):
    a = Asset('machine', q)
    a.box('gray', (2.8, 2.4, 0.35), loc=(0, 0.6, 0.175))
    a.box('orange', (2.4, 2.0, 1.5), loc=(0, 0.6, 1.1), bevel=0.04, seg=2, edges='nobottom')
    a.box('orange_dark', (0.8, 0.6, 0.3), loc=(0.3, 0.8, 2.0))
    a.box('glass', (1.2, 0.02, 0.35), loc=(0, -0.41, 1.3))
    # inclined conveyor towards -Y ending in a small block
    ang = math.atan2(0.35, 2.6)
    for sx in (-1, 1):
        a.box('gray', (0.07, 2.65, 0.12), loc=(sx * 0.42, -1.7, 0.83), rot=(-ang, 0, 0))
    for i in range(9):
        t = (i + 0.5) / 9
        y = -0.4 - t * 2.6
        z = 1.0 - t * 0.35 - 0.12
        a.cyl('metal', 0.04, 0.78, loc=(0, y, z + 0.12), axis='X', seg=8, caps=False)
    for ly, lz in ((-0.8, 0.9), (-2.7, 0.58)):
        for sx in (-1, 1):
            a.box('gray', (0.05, 0.05, lz), loc=(sx * 0.4, ly, lz / 2), drop='-z')
    a.box('orange', (1.0, 0.9, 0.75), loc=(0, -3.4, 0.375), bevel=0.03, seg=1, edges='nobottom')
    a.shift(dy=1.025)  # centre the whole footprint (housing + outlet conveyor) on the origin
    return a


def make_pipe_rack(q=1):
    a = Asset('pipe_rack', q)
    for sx in (-1, 1):
        a.box('gray', (0.25, 0.25, 5.0), loc=(sx * 5.0, 0, 2.5), drop='-z')
        a.box('gray', (0.2, 1.8, 0.2), loc=(sx * 5.0, 0, 5.1))
    for py in (-0.55, 0.0, 0.55):
        a.cyl('lightgray', 0.16, 12.0, loc=(0, py, 5.36), axis='X', seg=10 if q == 1 else 20)
    return a


def make_tank_horizontal(q=1):
    a = Asset('tank_horizontal', q)
    seg = 16 if q == 1 else 40
    a.cyl('white', 1.3, 6.2, loc=(0, 0, 1.6), axis='X', seg=seg, caps=False)
    for sx in (-1, 1):
        a.sphere('white', 1.3, loc=(sx * 3.1, 0, 1.6), scale=(0.32, 1, 1), u=seg, v=10)
        a.box('gray', (0.4, 2.0, 1.0), loc=(sx * 2.2, 0, 0.5))
    return a


def make_dome_tank(q=1):
    a = Asset('dome_tank', q)
    a.box('lightgray', (5.6, 2.2, 0.25), loc=(0, 0, 0.125))
    for x in (-1.75, 0.0, 1.75):
        a.sphere('white', 1.15, loc=(x, 0, 1.4), u=16 if q == 1 else 32, v=10 if q == 1 else 20)
    return a


# --------------------------------------------------------------------------- street furniture
def make_tree(q=1):
    a = Asset('tree', q)
    a.cyl('darkgray', 0.07, 2.4, loc=(0, 0, 1.2), seg=8, caps=False, r2=0.05)
    a.sphere('lightgray', 1.35, loc=(0, 0, 3.35), u=16 if q == 1 else 32, v=10 if q == 1 else 20)
    return a


def make_street_lamp(q=1):
    a = Asset('street_lamp', q)
    a.cyl('darkgray', 0.13, 0.5, loc=(0, 0, 0.25), seg=8)
    a.cyl('darkgray', 0.065, 7.3, loc=(0, 0, 0.5 + 3.65), seg=8, r2=0.055)
    a.box('darkgray', (1.85, 0.06, 0.06), loc=(0.9, 0, 7.72))
    a.box('darkgray', (0.6, 0.24, 0.1), loc=(1.75, 0, 7.66))
    a.quad('offwhite', 0.5, 0.18, loc=(1.75, 0, 7.6), rot=(R(180), 0, 0))
    return a


def make_fence(q=1):
    a = Asset('fence', q)
    a.box('offwhite', (4.0, 0.05, 0.05), loc=(0, 0, 1.175))
    a.box('offwhite', (4.0, 0.04, 0.04), loc=(0, 0, 0.14))
    a.box('offwhite', (0.07, 0.07, 1.25), loc=(-1.965, 0, 0.625), drop='-z')
    for i in range(24):
        x = -1.84 + i * 0.16
        a.box('offwhite', (0.025, 0.025, 1.0), loc=(x, 0, 0.66), drop='-z+z')
    return a


def make_barrier(q=1):
    a = Asset('barrier', q)
    a.box('white', (0.4, 0.35, 1.05), loc=(0, 0, 0.525), bevel=0.03, seg=1, edges='vert+top')
    a.box('red', (0.42, 0.37, 0.08), loc=(0, 0, 1.0))
    for i in range(10):
        a.box('red' if i % 2 == 0 else 'white', (0.5, 0.08, 0.08), loc=(0.45 + i * 0.5, 0, 0.96))
    return a


def make_guard_booth(q=1):
    a = Asset('guard_booth', q)
    a.box('white', (2.4, 2.0, 2.45), loc=(0, 0, 1.225), bevel=0.03, seg=1, edges='vert')
    a.box('offwhite', (2.7, 2.3, 0.22), loc=(0, 0, 2.56), bevel=0.02, seg=1)
    a.box('glass', (2.0, 0.03, 1.0), loc=(0, -1.0, 1.6))
    for sx in (-1, 1):
        a.box('glass', (0.03, 1.6, 1.0), loc=(sx * 1.2, 0, 1.6))
    a.box('darkgray', (0.8, 0.03, 2.0), loc=(0.5, 1.0, 1.0))
    return a


def make_bollard(q=1):
    a = Asset('bollard', q)
    a.cyl('orange', 0.1, 0.85, loc=(0, 0, 0.425), seg=8 if q == 1 else 16, caps=False)
    a.sphere('orange', 0.1, loc=(0, 0, 0.85), scale=(1, 1, 0.5), u=8, v=4)
    return a


# --------------------------------------------------------------------------- building kit
def make_rooftop_ac(q=1):
    a = Asset('rooftop_ac', q)
    a.box('lightgray', (2.4, 1.6, 1.0), loc=(0, 0, 0.5), drop='-z')
    a.cyl('darkgray', 0.5, 0.03, loc=(0.45, 0, 1.01), seg=16)
    a.cyl('gray', 0.12, 0.05, loc=(0.45, 0, 1.03), seg=8)
    for i in range(4):
        a.quad('gray', 1.0, 0.05, loc=(-0.55, -0.81, 0.3 + i * 0.15), rot=(R(90), 0, 0))
    return a


def make_roof_vent(q=1):
    a = Asset('roof_vent', q)
    a.box('lightgray', (1.8, 1.2, 0.36), loc=(0, 0, 0.18), drop='-z')
    for i in range(5):
        a.box('gray', (1.62, 0.06, 0.1), loc=(0, -0.44 + i * 0.22, 0.4))
    return a


def make_skylight(q=1):
    a = Asset('skylight', q)
    a.box('white', (3.0, 2.0, 0.18), loc=(0, 0, 0.09), drop='-z')
    a.box('offwhite', (2.7, 1.7, 0.07), loc=(0, 0, 0.215))
    return a


def make_condenser(q=1):
    a = Asset('condenser', q)
    a.box('white', (9.0, 2.6, 1.0), loc=(0, 0, 0.5), bevel=0.04, seg=1, edges='vert+top')
    for x in (-3.3, -1.1, 1.1, 3.3):
        a.cyl('darkgray', 0.85, 0.06, loc=(x, 0, 1.02), seg=20 if q == 1 else 40)
        a.cyl('lightgray', 0.16, 0.08, loc=(x, 0, 1.06), seg=8)
        a.box('gray', (1.7, 0.04, 0.03), loc=(x, 0, 1.065))
    return a


def make_dock_leveler(q=1):
    a = Asset('dock_leveler', q)
    a.box('white', (3.2, 2.6, 1.05), loc=(0, 0, 0.525), bevel=0.02, seg=1, edges='vert+top')
    a.box('metal', (2.5, 2.3, 0.02), loc=(0, 0.05, 1.055))
    for sx in (-1, 1):
        a.box('black', (0.26, 0.14, 0.3), loc=(sx * 1.1, -1.35, 0.75))
    return a


def make_door_rollup(q=1):
    a = Asset('door_rollup', q)
    for sx in (-1, 1):
        a.box('white', (0.15, 0.15, 4.2), loc=(sx * 1.725, 0, 2.1), drop='-z')
    a.box('white', (3.6, 0.15, 0.3), loc=(0, 0, 4.05))
    a.box('gray', (3.3, 0.05, 3.9), loc=(0, 0.03, 1.95), drop='-z')
    for i in range(10):
        a.quad('darkgray', 3.3, 0.025, loc=(0, -0.006, 0.35 + i * 0.36), rot=(R(90), 0, 0))
    return a


def make_canopy(q=1):
    a = Asset('canopy', q)
    for x in (-12.2, 0.0, 12.2):
        for sy in (-1, 1):
            a.box('gray', (0.22, 0.22, 5.75), loc=(x, sy * 6.8, 2.875), drop='-z')
    a.box('white', (26.0, 15.0, 0.18), loc=(0, 0, 5.84))
    pitch = 0.5
    n = int(25.6 / pitch)
    x0 = -n * pitch / 2
    pts = []
    for i in range(n):
        x = x0 + i * pitch
        pts += [(x, 5.93), (x + pitch * 0.15, 6.0), (x + pitch * 0.5, 6.0), (x + pitch * 0.65, 5.93)]
    pts += [(x0 + n * pitch, 5.93), (x0 + n * pitch, 5.9), (x0, 5.9)]
    a.prism('white', pts, 14.8, plane='XZ', drop_caps=True, drop_normals=((0, 0, -1),))
    for sy in (-1, 1):
        a.box('offwhite', (26.1, 0.1, 0.32), loc=(0, sy * 7.5, 5.86))
    for sx in (-1, 1):
        a.box('offwhite', (0.1, 15.0, 0.32), loc=(sx * 13.0, 0, 5.86))
    return a


def make_sign(q, name, label, w, h, bottom, text_size, text_z=None, post_x=None):
    a = Asset(name, q)
    top = bottom + h
    px = post_x if post_x is not None else w / 2 - 0.35
    for sx in (-1, 1):
        a.box('gray', (0.2, 0.2, top), loc=(sx * px, 0.2, top / 2), drop='-z')
    a.box('red', (w, 0.22, h), loc=(0, 0, bottom + h / 2))
    tz = text_z if text_z is not None else bottom + h / 2
    a.text('white', label, text_size, loc=(0, -0.111, tz), extrude=0.015, offset=0.01)
    return a


def make_sign_asrs(q=1):
    return make_sign(q, 'sign_asrs', 'ASRS', 7.0, 6.5, 2.6, 1.05, text_z=2.6 + 6.5 - 1.0)


def make_sign_qc(q=1):
    return make_sign(q, 'sign_qc', 'QC', 6.2, 2.4, 4.2, 0.95, text_z=4.2 + 2.4 - 0.85)


ASSETS = [
    make_truck_box, make_truck_flatbed, make_forklift, make_forklift_loaded, make_amr, make_amr_cart,
    make_pallet, make_pallet_boxes, make_pallet_boxes_mixed, make_pallet_stack, make_box,
    make_silo, make_gantry_crane, make_container_white, make_container_orange, make_conveyor,
    make_scanner_arch, make_rack, make_stacker_crane, make_machine, make_pipe_rack,
    make_tank_horizontal, make_dome_tank, make_tree, make_street_lamp, make_fence, make_barrier,
    make_guard_booth, make_bollard, make_rooftop_ac, make_roof_vent, make_skylight, make_condenser,
    make_dock_leveler, make_door_rollup, make_canopy, make_sign_asrs, make_sign_qc,
]


def build_all(q=1, only=None):
    out = []
    for fn in ASSETS:
        a = fn(q)
        if only and a.name not in only:
            continue
        a.build()
        out.append(a)
    return out


def export_glb(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format='GLB',
        export_yup=True,
        export_apply=True,
        export_materials='EXPORT',
        export_cameras=False,
        export_lights=False,
        export_texcoords=False,
        export_normals=True,
        export_extras=False,
        export_animations=False,
        export_draco_mesh_compression_enable=False,
        use_selection=False,
    )


def main():
    G.reset_scene()
    assets = build_all(q=1)
    total = 0
    for a in assets:
        lo, hi = a.bounds()
        t = a.tri_count()
        total += t
        print(f'  {a.name:20s} tris {t:6d}  size {hi.x - lo.x:6.2f} x {hi.y - lo.y:6.2f} x {hi.z - lo.z:6.2f}'
              f'  mats {",".join(sorted(a.parts))}')
    print(f'  TOTAL tris {total}')
    export_glb(OUT)
    print(f'exported {OUT} ({os.path.getsize(OUT) / 1024:.0f} KiB)')


if __name__ == '__main__':
    main()
