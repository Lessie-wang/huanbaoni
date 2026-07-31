#!/usr/bin/env bash
# 本机 HTTPS 服务 + 局域网访问 —— 现场保险（不依赖 github.io / 公网）。
#
# 为什么必须 HTTPS：手机浏览器的麦克风(getUserMedia)只在 HTTPS 或 localhost 下工作，
# 手机通过局域网 IP 开 http:// 会被拒麦克风 → 语音功能全废。自签证书虽会弹"不安全"警告，
# 手机手动点一次"仍要访问/信任"即可，之后 AI/生图/语音都能跑。
#
# 用法：
#   bash tools/serve-https.sh            # 默认端口 8443，发布 webapp/
#   PORT=9443 bash tools/serve-https.sh  # 自定义端口
#
# 手机：连同一局域网 WiFi → 扫二维码 或 手动开脚本打印的 https://<IP>:<PORT>/ → 点信任警告。

set -euo pipefail

# ---- 定位 webapp 目录（脚本在 tools/，webapp 是同级）----
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/.." && pwd)"
WEBAPP="$ROOT/webapp"
CERTDIR="$HERE/.certs"
PORT="${PORT:-8443}"

[ -f "$WEBAPP/index.html" ] || { echo "❌ 找不到 $WEBAPP/index.html"; exit 1; }

# ---- 取局域网 IP（手机要连这个，非 127.0.0.1）----
IP="$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || true)"
if [ -z "$IP" ]; then
  IP="$(ifconfig 2>/dev/null | awk '/inet /&&$2!="127.0.0.1"{print $2; exit}')"
fi
[ -n "$IP" ] || { echo "❌ 拿不到局域网 IP，请确认已连 WiFi"; exit 1; }

# ---- 自签证书（含 IP 的 SAN，否则部分浏览器直接拒连）----
mkdir -p "$CERTDIR"
CRT="$CERTDIR/dev.crt"; KEY="$CERTDIR/dev.key"
if [ ! -f "$CRT" ] || ! grep -q "$IP" "$CERTDIR/.ip" 2>/dev/null; then
  echo "🔐 生成自签证书 (CN=$IP, SAN=IP:$IP)…"
  openssl req -x509 -newkey rsa:2048 -nodes -keyout "$KEY" -out "$CRT" \
    -days 30 -subj "/CN=$IP" \
    -addext "subjectAltName=IP:$IP,DNS:localhost" >/dev/null 2>&1
  echo "$IP" > "$CERTDIR/.ip"
fi

URL="https://$IP:$PORT/"

# ---- 生成二维码（复用 make_qr.py，有在线兜底）----
QR="$HERE/qr-lan.png"
python3 "$HERE/make_qr.py" "$URL" "$QR" 2>/dev/null && echo "📱 二维码已生成：$QR" || echo "（二维码生成跳过，手动输入网址亦可）"

cat <<EOF

============================================================
  ✅ 本机 HTTPS 服务已就绪
  手机连同一 WiFi，扫码或手动打开：

      $URL

  ⚠️ 手机首次会弹"不安全/证书无效"警告 → 点"高级/仍要访问/信任"
     （自签证书正常现象；不点信任 → 麦克风用不了）
  二维码图片：$QR
  停止服务：Ctrl+C
============================================================

EOF

# ---- 起 HTTPS 静态服务 + /hackson 反向代理（手机无需 VPN）----
# 代理把 /hackson/* 转发到 maas（电脑走自己的 VPN 到内网）。
exec python3 "$HERE/serve-proxy.py" "$WEBAPP" "$PORT" "$CRT" "$KEY"
