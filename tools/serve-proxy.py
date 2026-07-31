#!/usr/bin/env python3
"""本机 HTTPS 静态服务 + 反向代理跳板。

现场手机没有内网 VPN，到不了 maas(10.35.x)。本服务跑在有 VPN 的电脑上：
  - 静态：把 webapp/ 发布为站点根
  - 代理：所有 /hackson/* 请求 → 转发到 https://maas.devops.rednote.life/hackson/*
          （电脑走自己的 VPN 到内网，手机只跟电脑局域网通信即可）

链路：手机 ──局域网──> 电脑:8443 ──VPN──> maas 内网
页面把 API baseUrl 指向同源 /hackson，于是无 CORS、无二次证书信任。

用法(由 serve-https.sh 调用)：
  python3 serve-proxy.py <webapp目录> <端口> <证书.crt> <私钥.key>
"""
import http.server, ssl, sys, os, urllib.request, urllib.error

WEBAPP, PORT, CRT, KEY = sys.argv[1], int(sys.argv[2]), sys.argv[3], sys.argv[4]
UPSTREAM = "https://maas.devops.rednote.life"   # /hackson 前缀转发到这里
PREFIX = "/hackson"
HOP = ("host", "content-length", "connection", "accept-encoding",
       "transfer-encoding", "content-encoding", "keep-alive")

os.chdir(WEBAPP)


class Handler(http.server.SimpleHTTPRequestHandler):
    # 静默掉每条静态请求日志，只在代理时打点
    def log_message(self, fmt, *args):
        if self.path.startswith(PREFIX):
            sys.stderr.write("[proxy] %s %s\n" % (self.command, self.path))

    def _proxy(self):
        url = UPSTREAM + self.path
        length = int(self.headers.get("Content-Length", 0) or 0)
        body = self.rfile.read(length) if length else None
        fwd = {k: v for k, v in self.headers.items() if k.lower() not in HOP}
        req = urllib.request.Request(url, data=body, method=self.command, headers=fwd)
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                data = r.read()
                self.send_response(r.status)
                for k, v in r.headers.items():
                    if k.lower() in HOP:
                        continue
                    self.send_header(k, v)
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                self.wfile.write(data)
        except urllib.error.HTTPError as e:            # 上游 4xx/5xx：原样透传，前端能看到真实报错
            data = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", e.headers.get("Content-Type", "application/json"))
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)
        except Exception as e:                          # 电脑到内网断了 → 502，提示排查 VPN
            msg = ("proxy upstream error: %s" % e).encode("utf-8")
            self.send_response(502)
            self.send_header("Content-Type", "text/plain; charset=utf-8")
            self.send_header("Content-Length", str(len(msg)))
            self.end_headers()
            self.wfile.write(msg)

    def do_GET(self):
        return self._proxy() if self.path.startswith(PREFIX) else super().do_GET()

    def do_POST(self):
        if self.path.startswith(PREFIX):
            return self._proxy()
        self.send_error(405)

    def do_OPTIONS(self):
        if self.path.startswith(PREFIX):
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", "*")
            self.send_header("Access-Control-Allow-Headers", "*")
            self.send_header("Access-Control-Allow-Methods", "GET,POST,OPTIONS")
            self.end_headers()
            return
        self.send_error(405)


ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
ctx.load_cert_chain(CRT, KEY)
httpd = http.server.ThreadingHTTPServer(("0.0.0.0", PORT), Handler)  # 多线程：生图耗时不阻塞静态
httpd.socket = ctx.wrap_socket(httpd.socket, server_side=True)
print(f"[https+proxy] webapp/ + {PREFIX}/* → {UPSTREAM} on 0.0.0.0:{PORT}", flush=True)
httpd.serve_forever()
