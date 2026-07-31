# tools —— 上线与现场保险工具

## 线上（GitHub Pages）
代码 push 到 `main` 后，`.github/workflows/pages.yml` 自动把 `webapp/` 发布为站点根：

    https://lessie-wang.github.io/huanbaoni/

首次需在仓库 **Settings → Pages → Build and deployment → Source = GitHub Actions** 开启一次。

## 生成二维码
    python3 tools/make_qr.py "https://lessie-wang.github.io/huanbaoni/" tools/qr-online.png

优先用本地库（segno / qrcode），没有则自动走在线 API 兜底（需联网）。
建议装库更稳：`pip3 install segno`（或 `pipx`）。

## 现场保险（网络抽风时）
自己手机开热点、电脑连该热点，然后：

    bash tools/serve-local.sh          # 默认 8080 端口

它会打印局域网地址（如 http://192.168.x.x:8080/）。给这个地址生成二维码：

    python3 tools/make_qr.py "http://192.168.x.x:8080/" tools/qr-local.png

观众手机连同一热点即可扫码打开，全程不依赖公网。
