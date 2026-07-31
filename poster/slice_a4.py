#!/usr/bin/env python3
"""Slice the A1 wall poster (poster_wall.png, 5040x3564) into 8 A4-portrait tiles
(4 columns x 2 rows) and bundle a print-ready 8-page A4 PDF.

The A1 canvas (1680x1188 CSS = sqrt(2) landscape) maps exactly onto a 4x2 grid
of A4-portrait sheets: 4*210 = 840mm wide, 2*297 = 594mm tall = ISO A1 landscape.
Each tile is 1260x1782 px (~152 dpi) and gets resampled to a 300dpi A4 page.

Print at 100% / "actual size" (or "fit to printable area" — all sheets shrink
uniformly), trim the white printer margins, then butt-join in a 4x2 grid.
"""
from PIL import Image, ImageDraw, ImageFont
import os

PD = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(PD, "poster_wall.png")
OUT_DIR = os.path.join(PD, "a4_tiles")
os.makedirs(OUT_DIR, exist_ok=True)

COLS, ROWS = 4, 2
# 300 dpi A4 portrait
A4_W, A4_H = 2480, 3508

im = Image.open(SRC).convert("RGB")
W, H = im.size
tw, th = W // COLS, H // ROWS
print("source", im.size, "tile", tw, th)

def small_font(sz):
    for p in ("/System/Library/Fonts/SFNSMono.ttf",
              "/System/Library/Fonts/Menlo.ttc",
              "/Library/Fonts/Arial.ttf"):
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, sz)
            except Exception:
                pass
    return ImageFont.load_default()

fnt = small_font(30)
pages = []
for r in range(ROWS):
    for c in range(COLS):
        box = (c * tw, r * th, (c + 1) * tw, (r + 1) * th)
        tile = im.crop(box)
        # A4 page canvas, tile resampled to fill (aspect ~identical)
        page = tile.resize((A4_W, A4_H), Image.LANCZOS)
        # faint registration label in a corner (trim-away zone)
        d = ImageDraw.Draw(page)
        tag = f"R{r+1}C{c+1}"
        # crop-corner ticks so alignment is verifiable
        m = 26
        tick = 60
        col = (150, 138, 126)
        for (cx, cy, dx, dy) in [(m, m, 1, 1), (A4_W - m, m, -1, 1),
                                 (m, A4_H - m, 1, -1), (A4_W - m, A4_H - m, -1, -1)]:
            d.line([(cx, cy), (cx + dx * tick, cy)], fill=col, width=3)
            d.line([(cx, cy), (cx, cy + dy * tick)], fill=col, width=3)
        d.text((m + 12, m + 10), f"环抱你 · A1 拼贴  {tag}", fill=col, font=fnt)
        tpath = os.path.join(OUT_DIR, f"tile_{r+1}_{c+1}.png")
        tile.save(tpath)  # untouched high-res tile for reference
        pages.append(page.convert("RGB"))
        print("tile", tag, "->", os.path.basename(tpath))

pdf_path = os.path.join(PD, "环抱你_A1_8xA4.pdf")
pages[0].save(pdf_path, "PDF", resolution=300.0, save_all=True,
              append_images=pages[1:])
print("PDF ->", pdf_path, f"({len(pages)} pages, A4 300dpi)")
