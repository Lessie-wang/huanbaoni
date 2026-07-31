#!/usr/bin/env python3
"""Assemble the 5 key-effect submission screenshots into one folder.
- 4 live H5 captures (portrait/realtime/chat/growth) copied as-is (1170x2532).
- 1 clean, enhanced real-device shot cropped from the WeChat build photo
  (keeps hug arms + ESP32 board + 环抱你 engraving + finger-ring; gentle
  autocontrast + soft vignette so the desk clutter recedes)."""
from PIL import Image, ImageOps, ImageDraw, ImageFilter
import os, shutil

POS = "/Users/wangjiayi14/Downloads/知愈-ring真系列/huanbaoni/poster"
OUT = "/Users/wangjiayi14/Downloads/知愈-ring真系列/huanbaoni/submission_screenshots"
os.makedirs(OUT, exist_ok=True)

# ---- 1) real device shot ----
SRC = ("/Users/wangjiayi14/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
       "xwechat_files/wxid_sy2143juewa922_2703/temp/RWTemp/2026-08/"
       "9e20f478899dc29eb19741386f9343c8/05df8de1516ca2678b6693c8d82da9ac.jpg")
im = Image.open(SRC).convert("RGB")
crop = im.crop((210, 1560, 2230, 3470))          # full 小白 + arms + board + ring peek
crop = ImageOps.autocontrast(crop, cutoff=1)
w, h = crop.size
# soft vignette toward the corners so desk clutter recedes
vig = Image.new("L", (w, h), 0)
d = ImageDraw.Draw(vig)
d.ellipse([-w * 0.18, -h * 0.18, w * 1.18, h * 1.18], fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(180))
dark = ImageOps.colorize(vig, black=(60, 50, 42), white=(255, 255, 255)).convert("RGB")
crop = Image.blend(dark, crop, 0.82)             # 18% vignette darkening at edges
crop.save(os.path.join(POS, "hw_real_shot.png"))  # source for the 2:1 card
print("hw_real_shot", crop.size)

# ---- 2) drop the poster as the cover for convenience ----
shutil.copy(os.path.join(POS, "poster_wall.png"), os.path.join(OUT, "00_封面_海报.png"))
print("copied 00_封面_海报.png")
# NOTE: the 5 numbered 2:1 cards + collage are produced by prep_cards_2to1.py
# Pipeline: python3 prep_submission.py && python3 prep_cards_2to1.py
