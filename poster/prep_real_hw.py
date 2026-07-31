#!/usr/bin/env python3
"""Crop the real 小白 build photo and bake it into a soft rounded card
(feathered alpha corners + subtle inner light) to replace the abstract
explode render in the poster hardware zone."""
from PIL import Image, ImageDraw, ImageFilter, ImageOps
import os

PD = os.path.dirname(os.path.abspath(__file__))
SRC = ("/Users/wangjiayi14/Library/Containers/com.tencent.xinWeChat/Data/Documents/"
       "xwechat_files/wxid_sy2143juewa922_2703/temp/RWTemp/2026-08/"
       "9e20f478899dc29eb19741386f9343c8/05df8de1516ca2678b6693c8d82da9ac.jpg")

im = Image.open(SRC).convert("RGB")
# tight crop on the 小白 (keeps hug arms + ESP board + 环抱你 engraving + finger-ring peek)
crop = im.crop((300, 1600, 2200, 3500))  # ~1900x1900
# gentle warm/clean tone lift so it sits in the paper palette
crop = ImageOps.autocontrast(crop, cutoff=1)
w, h = crop.size

# rounded-rect feathered alpha
rad = int(min(w, h) * 0.10)
mask = Image.new("L", (w, h), 0)
d = ImageDraw.Draw(mask)
d.rounded_rectangle([0, 0, w - 1, h - 1], radius=rad, fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(6))

out = crop.convert("RGBA")
out.putalpha(mask)
out.save(os.path.join(PD, "hw_real.png"))
print("hw_real.png", out.size)
