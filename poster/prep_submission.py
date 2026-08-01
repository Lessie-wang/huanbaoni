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

# ---- 1) real device shot (venue photo: body hugging + 3D hand wearing the ring) ----
SRC = ("/Users/wangjiayi14/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
       "xwechat_files/wxid_sy2143juewa922_2703/temp/RWTemp/2026-08/"
       "4a77eb96e196d0ca3d31af0bdb540702.jpg")            # 4096x3072
im = Image.open(SRC).convert("RGB")
crop = im.crop((70, 250, 4040, 2980))            # trim ceiling + far-left bottle
crop = ImageOps.autocontrast(crop, cutoff=1)
w, h = crop.size
# very soft vignette to gently focus center (venue bg is already clean)
vig = Image.new("L", (w, h), 0)
d = ImageDraw.Draw(vig)
d.ellipse([-w * 0.22, -h * 0.22, w * 1.22, h * 1.22], fill=255)
vig = vig.filter(ImageFilter.GaussianBlur(200))
dark = ImageOps.colorize(vig, black=(70, 60, 52), white=(255, 255, 255)).convert("RGB")
crop = Image.blend(dark, crop, 0.9)              # 10% vignette darkening at edges
crop.save(os.path.join(POS, "hw_real_shot.png"))  # source for the 2:1 card
print("hw_real_shot", crop.size)

# ---- 2) drop the poster as the cover for convenience ----
shutil.copy(os.path.join(POS, "poster_wall.png"), os.path.join(OUT, "00_封面_海报.png"))
print("copied 00_封面_海报.png")
# NOTE: the 5 numbered 2:1 cards + collage are produced by prep_cards_2to1.py
# Pipeline: python3 prep_submission.py && python3 prep_cards_2to1.py
