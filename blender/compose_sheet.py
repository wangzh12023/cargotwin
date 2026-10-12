"""Compose preview tiles into labelled contact sheets (run with a normal Python that has Pillow).

python blender/compose_sheet.py [cols per_sheet]     e.g. `8 40` -> one sheet with every asset
"""
import math
import os
import sys

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
TILES = os.path.join(ROOT, 'blender', 'preview', 'tiles')
OUT = os.path.join(ROOT, 'blender', 'preview')
COLS, PER_SHEET = 5, 20


def main(cols=COLS, per_sheet=PER_SHEET):
    names = sorted(f for f in os.listdir(TILES) if f.endswith('.png'))
    try:
        font = ImageFont.truetype('arial.ttf', 18)
    except OSError:
        font = ImageFont.load_default()
    for s in range(math.ceil(len(names) / per_sheet)):
        chunk = names[s * per_sheet:(s + 1) * per_sheet]
        tw, th = Image.open(os.path.join(TILES, chunk[0])).size
        rows = math.ceil(len(chunk) / cols)
        sheet = Image.new('RGB', (cols * tw, rows * (th + 26)), (250, 250, 250))
        d = ImageDraw.Draw(sheet)
        for i, n in enumerate(chunk):
            x, y = (i % cols) * tw, (i // cols) * (th + 26)
            sheet.paste(Image.open(os.path.join(TILES, n)).convert('RGB'), (x, y + 26))
            d.text((x + 8, y + 3), n[:-4], fill=(20, 20, 20), font=font)
        path = os.path.join(OUT, f'sheet_{s + 1}.png')
        sheet.save(path)
        print(path, sheet.size)


if __name__ == '__main__':
    main(*[int(a) for a in sys.argv[1:3]])
