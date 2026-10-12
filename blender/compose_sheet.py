"""Compose preview tiles into labelled contact sheets (run with a normal Python that has Pillow).

python blender/compose_sheet.py
"""
import math
import os

from PIL import Image, ImageDraw, ImageFont

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
TILES = os.path.join(ROOT, 'blender', 'preview', 'tiles')
OUT = os.path.join(ROOT, 'blender', 'preview')
COLS, PER_SHEET = 5, 20


def main():
    names = sorted(f for f in os.listdir(TILES) if f.endswith('.png'))
    try:
        font = ImageFont.truetype('arial.ttf', 18)
    except OSError:
        font = ImageFont.load_default()
    for s in range(math.ceil(len(names) / PER_SHEET)):
        chunk = names[s * PER_SHEET:(s + 1) * PER_SHEET]
        tw, th = Image.open(os.path.join(TILES, chunk[0])).size
        rows = math.ceil(len(chunk) / COLS)
        sheet = Image.new('RGB', (COLS * tw, rows * (th + 26)), (250, 250, 250))
        d = ImageDraw.Draw(sheet)
        for i, n in enumerate(chunk):
            x, y = (i % COLS) * tw, (i // COLS) * (th + 26)
            sheet.paste(Image.open(os.path.join(TILES, n)).convert('RGB'), (x, y + 26))
            d.text((x + 8, y + 3), n[:-4], fill=(20, 20, 20), font=font)
        path = os.path.join(OUT, f'sheet_{s + 1}.png')
        sheet.save(path)
        print(path, sheet.size)


if __name__ == '__main__':
    main()
