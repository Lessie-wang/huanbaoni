#!/usr/bin/env python3
"""Cut the 环抱你 hero render out of its dark studio bg -> clean transparent PNG.
Erodes the edge to remove the dark anti-alias halo so it composites cleanly on light bg."""
from PIL import Image, ImageDraw, ImageFilter
import os

SRC = "/tmp/heroA.png"
OUT = os.path.join(os.path.dirname(__file__), "hero.png")

im = Image.open(SRC).convert("RGB")
w, h = im.size
print("src", im.size, "corner", im.getpixel((2, 2)))

# flood-fill the dark background from every border seed
work = im.copy()
MARK = (255, 0, 255)
seeds = []
for x in range(0, w, 5):
    seeds += [(x, 0), (x, h - 1)]
for y in range(0, h, 5):
    seeds += [(0, y), (w - 1, y)]
for s in seeds:
    if work.getpixel(s) != MARK:
        ImageDraw.floodfill(work, s, MARK, thresh=48)

rgba = im.convert("RGBA")
pw, pr = work.load(), rgba.load()
for y in range(h):
    for x in range(w):
        if pw[x, y] == MARK:
            r, g, b, _ = pr[x, y]
            pr[x, y] = (r, g, b, 0)

alpha = rgba.split()[3]
alpha = alpha.filter(ImageFilter.MinFilter(5))     # erode ~2px -> kill dark halo
alpha = alpha.filter(ImageFilter.GaussianBlur(1.0))  # soft feather
rgba.putalpha(alpha)

bbox = alpha.getbbox()
if bbox:
    pad = 16
    l, t, r, b = bbox
    rgba = rgba.crop((max(0, l - pad), max(0, t - pad),
                      min(w, r + pad), min(h, b + pad)))
print("out", rgba.size)
rgba.save(OUT)
print("saved", OUT)
