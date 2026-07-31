#!/usr/bin/env python3
"""生成二维码 PNG。零依赖优先，自动兜底。

用法:
    python3 tools/make_qr.py "https://lessie-wang.github.io/huanbaoni/" [输出.png]

优先级: segno > qrcode(pillow) > 在线 API 兜底(需联网)。
"""
import sys, os, urllib.request, urllib.parse


def main():
    if len(sys.argv) < 2:
        print("用法: python3 tools/make_qr.py <URL> [输出.png]")
        sys.exit(1)
    url = sys.argv[1]
    out = sys.argv[2] if len(sys.argv) > 2 else "qr.png"

    # 1) segno（纯 Python，无 C 依赖）
    try:
        import segno
        segno.make(url, error="m").save(out, scale=10, border=3)
        print(f"[segno] 已生成 {out}  ->  {url}")
        return
    except ImportError:
        pass

    # 2) qrcode + pillow
    try:
        import qrcode
        img = qrcode.make(url)
        img.save(out)
        print(f"[qrcode] 已生成 {out}  ->  {url}")
        return
    except ImportError:
        pass

    # 3) 在线 API 兜底（需联网；现场生成图片阶段通常有网）
    try:
        api = "https://api.qrserver.com/v1/create-qr-code/?size=600x600&data=" + urllib.parse.quote(url, safe="")
        with urllib.request.urlopen(api, timeout=15) as r:
            data = r.read()
        with open(out, "wb") as f:
            f.write(data)
        print(f"[online] 已生成 {out}  ->  {url}")
        return
    except Exception as e:
        print("生成失败。请先安装二维码库：pip3 install segno")
        print(f"（在线兜底也失败：{e}）")
        sys.exit(1)


if __name__ == "__main__":
    main()
