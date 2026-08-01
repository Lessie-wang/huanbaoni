#!/usr/bin/env python3
"""Turn each key screenshot into a premium 2:1 presentation card matching the
poster design system (warm paper, gold Songti title, phone bezel / photo card).
Portrait phone shots become landscape 2:1 cards; the real-device photo too."""
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageOps
import os

POS = "/Users/wangjiayi14/Downloads/知愈-ring真系列/huanbaoni/poster"
OUT = "/Users/wangjiayi14/Downloads/知愈-ring真系列/huanbaoni/submission_screenshots"
os.makedirs(OUT, exist_ok=True)

W, H = 2400, 1200
PAPER, PAPER2 = (246, 241, 233), (238, 228, 214)
INK, SUB = (51, 46, 40), (146, 138, 126)
GOLD_D, GOLD_L = (142, 107, 68), (203, 168, 118)
GRAD = [(90, 70, 50), (142, 107, 68), (192, 154, 99)]

def fp(*cands):
    for p, i in cands:
        if os.path.exists(p):
            try:
                return ImageFont.truetype(p, i)
            except Exception:
                pass
    return ImageFont.load_default()

def song(sz):
    return fp(("/System/Library/Fonts/Supplemental/Songti.ttc", sz))
def pf(sz):
    return fp(("/System/Library/Fonts/Hiragino Sans GB.ttc", sz),
              ("/System/Library/Fonts/STHeiti Medium.ttc", sz),
              ("/System/Library/Fonts/STHeiti Light.ttc", sz),
              ("/System/Library/Fonts/Supplemental/Songti.ttc", sz))
def mono(sz):
    return fp(("/System/Library/Fonts/Supplemental/Courier New Bold.ttf", sz),
              ("/System/Library/Fonts/Menlo.ttc", sz))

def paper_bg():
    base = Image.new("RGB", (W, H), PAPER)
    grad = Image.new("RGB", (W, H))
    for y in range(H):
        t = y / H
        grad.paste(tuple(int(PAPER[i] + (PAPER2[i] - PAPER[i]) * t) for i in range(3)),
                   [0, y, W, y + 1])
    base = Image.blend(base, grad, 0.6)
    # warm glow top-left
    glow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(glow).ellipse([-400, -300, 1200, 900], fill=255)
    glow = glow.filter(ImageFilter.GaussianBlur(260))
    warm = ImageOps.colorize(glow, black=PAPER, white=(252, 246, 236)).convert("RGB")
    base = Image.blend(base, warm, 0.5)
    d = ImageDraw.Draw(base)
    d.rounded_rectangle([34, 34, W - 34, H - 34], radius=18,
                        outline=(196, 178, 150), width=2)
    return base

def track(d, xy, text, font, fill, tr):
    x, y = xy
    for ch in text:
        d.text((x, y), ch, font=font, fill=fill)
        x += d.textlength(ch, font=font) + tr
    return x

def grad_title(canvas, xy, text, font):
    tmp = Image.new("L", (W, H), 0)
    ImageDraw.Draw(tmp).text(xy, text, font=font, fill=255)
    bb = tmp.getbbox()
    if not bb:
        return
    grad = Image.new("RGB", (W, H))
    x0, y0, x1, y1 = bb
    for y in range(H):
        t = min(max((y - y0) / max(1, (y1 - y0)), 0), 1)
        if t < 0.5:
            c = tuple(int(GRAD[0][i] + (GRAD[1][i] - GRAD[0][i]) * (t / 0.5)) for i in range(3))
        else:
            c = tuple(int(GRAD[1][i] + (GRAD[2][i] - GRAD[1][i]) * ((t - 0.5) / 0.5)) for i in range(3))
        grad.paste(c, [0, y, W, y + 1])
    canvas.paste(grad, (0, 0), tmp)

def wrap(d, text, font, maxw):
    lines, cur = [], ""
    for ch in text:
        if ch == "\n":
            lines.append(cur); cur = ""; continue
        if d.textlength(cur + ch, font=font) > maxw and cur:
            lines.append(cur); cur = ch
        else:
            cur += ch
    if cur:
        lines.append(cur)
    return lines

def phone_img(shot, target_h):
    im = Image.open(shot).convert("RGB")
    iw, ih = im.size
    w = int(target_h * iw / ih)
    im = im.resize((w, target_h), Image.LANCZOS)
    pad = 14
    bw, bh = w + pad * 2, target_h + pad * 2
    bez = Image.new("RGBA", (bw, bh), (0, 0, 0, 0))
    ImageDraw.Draw(bez).rounded_rectangle([0, 0, bw, bh], radius=54, fill=(32, 29, 25, 255))
    r = 42
    m = Image.new("L", (w, target_h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, w, target_h], radius=r, fill=255)
    bez.paste(im, (pad, pad), m)
    d = ImageDraw.Draw(bez)
    d.rounded_rectangle([bw // 2 - 46, pad + 10, bw // 2 + 46, pad + 32], radius=11, fill=(10, 9, 10, 255))
    return bez

def photo_card(shot, target_w):
    im = Image.open(shot).convert("RGB")
    iw, ih = im.size
    h = int(target_w * ih / iw)
    im = im.resize((target_w, h), Image.LANCZOS)
    r = 40
    m = Image.new("L", (target_w, h), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, target_w, h], radius=r, fill=255)
    out = im.convert("RGBA"); out.putalpha(m)
    return out

def shadow(canvas, obj, pos, blur=40, op=90, off=(0, 26)):
    a = obj.split()[3]
    sh = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    s = Image.new("RGBA", obj.size, (60, 46, 34, op)); s.putalpha(a.point(lambda p: int(p * op / 255)))
    sh.paste(s, (pos[0] + off[0], pos[1] + off[1]), s)
    sh = sh.filter(ImageFilter.GaussianBlur(blur))
    canvas.alpha_composite(sh)

def badge(d, xy, text, font):
    x, y = xy
    tw = sum(d.textlength(c, font=font) + 3 for c in text)
    d.rounded_rectangle([x, y, x + tw + 34, y + 46], radius=23, fill=GOLD_D)
    track(d, (x + 17, y + 12), text, font, (255, 255, 255), 3)

def card(kick, title, desc, shot, kind, outname, tags=None):
    cv = paper_bg().convert("RGBA")
    d = ImageDraw.Draw(cv)
    # ---- media on the right ----
    if kind == "phone":
        ph = phone_img(shot, 940)
        px, py = W - ph.size[0] - 190, (H - ph.size[1]) // 2
        shadow(cv, ph, (px, py))
        cv.alpha_composite(ph, (px, py))
    else:
        pc = photo_card(shot, 1000)
        px, py = W - pc.size[0] - 150, (H - pc.size[1]) // 2
        shadow(cv, pc, (px, py))
        cv.alpha_composite(pc, (px, py))
    # ---- text block left ----
    tx = 150
    d.line([(tx, 316), (tx + 46, 316)], fill=GOLD_D, width=4)
    track(d, (tx + 62, 300), kick, mono(30), GOLD_D, 6)
    grad_title(cv, (tx, 360), title, song(118))
    dy = 560
    for ln in wrap(d, desc, pf(40), 940):
        d.text((tx, dy), ln, font=pf(40), fill=SUB); dy += 62
    if tags:
        tgx = tx
        for label, col in tags:
            d.ellipse([tgx, dy + 14, tgx + 22, dy + 36], fill=col)
            d.text((tgx + 34, dy + 8), label, font=pf(32), fill=INK)
            tgx += 44 + d.textlength(label, font=pf(32)) + 60
    # brand footer
    track(d, (tx, H - 150), "环抱你 · 会环抱你的情绪伙伴", pf(30), (168, 150, 130), 2)
    if kind == "photo":
        badge(d, (px + 34, py + 34), "真机实拍", pf(30))
    cv.convert("RGB").save(os.path.join(OUT, outname))
    print("saved", outname)

CALM, MID, HIGH = (159, 187, 169), (227, 203, 147), (214, 154, 132)

card("DAILY SOUL PORTRAIT", "今日心灵画像",
     "伙伴感知强度定底色，你亲手点选情绪补上色相——\nAI 把当天的心情炼成一幅画，配一句诗。",
     f"{POS}/app_portrait.png", "phone", "01_今日心灵画像.png")

card("REALTIME EMBRACE", "实时环抱",
     "三色压力环 + 实时 HR / HRV。压力悄悄升高的那一刻，\n伙伴先你一步，给你一次只有你知道的私密震动。",
     f"{POS}/app_realtime.png", "phone", "02_实时环抱.png",
     tags=[("舒展", CALM), ("波动", MID), ("紧绷", HIGH)])

card("THE REAL BUILD", "真机实操",
     "ESP32-S3 + 五传感器,现场手作。\n心率 / HRV · 皮肤电 · 六轴 + 敲击 ·\n麦克风 · 私密震动马达 —— 软硬兼得。",
     f"{POS}/hw_real_shot.png", "photo", "03_真机实操.png")

card("AI COMPANION", "小知复盘",
     "敲两下伙伴唤醒小知。它带着刚才的身体证据,\n陪你把那阵说不清的情绪,慢慢说清楚。",
     f"{POS}/app_chat.png", "phone", "04_小知复盘.png")

card("GROWTH GALLERY", "心迹画廊",
     "每天一幅心灵画像,连成一条成长轨迹——\n色调由灰转暖,你会看见自己正在好起来。",
     f"{POS}/app_growth.png", "phone", "05_心迹画廊.png")

# ---- 4-phone software collage (single 2:1) ----
def collage():
    cv = paper_bg().convert("RGBA")
    d = ImageDraw.Draw(cv)
    d.line([(150, 138), (196, 138)], fill=GOLD_D, width=4)
    track(d, (212, 122), "SOFTWARE", mono(30), GOLD_D, 6)
    track(d, (212 + d.textlength("SOFTWARE", font=mono(30)) + 8 * 6, 121),
          " · 情绪炼金层", pf(30), GOLD_D, 2)
    grad_title(cv, (150, 166), "把冷数据,炼成一个心灵世界", song(70))
    items = [("app_realtime.png", "实时环抱", "三色压力环"),
             ("app_portrait.png", "今日心灵画像", "AI 情绪画作"),
             ("app_chat.png", "小知复盘", "敲两下伙伴"),
             ("app_growth.png", "心迹画廊", "由灰转暖")]
    ph_h = 648
    gap = 64
    phs = [phone_img(f"{POS}/{s}", ph_h) for s, _, _ in items]
    total = sum(p.size[0] for p in phs) + gap * (len(phs) - 1)
    x = (W - total) // 2
    y = 316
    for p, (_, name, sub) in zip(phs, items):
        shadow(cv, p, (x, y), blur=34, op=85)
        cv.alpha_composite(p, (x, y))
        cx = x + p.size[0] // 2
        tw = d.textlength(name, font=pf(38))
        d.text((cx - tw / 2, y + ph_h + 44), name, font=pf(38), fill=INK)
        sw = d.textlength(sub, font=pf(28))
        d.text((cx - sw / 2, y + ph_h + 96), sub, font=pf(28), fill=SUB)
        x += p.size[0] + gap
    cv.convert("RGB").save(os.path.join(OUT, "06_软件全景.png"))
    print("saved 06_软件全景.png")

collage()
