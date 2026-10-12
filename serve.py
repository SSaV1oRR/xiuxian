# 本地开发服务器：禁用缓存，修改代码后刷新即可生效
# 用法：python serve.py [端口，默认 8130]
# 同时监听 IPv4/IPv6，避免 Windows 上 localhost 先尝试 ::1 导致每个模块请求多等数百毫秒
import http.server
import os
import re
import socket
import socketserver
import sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8130
SHOT_DIR = os.path.join('docs', 'screenshots')
LOCAL = ('127.0.0.1', '::1', '::ffff:127.0.0.1')


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map, '.js': 'text/javascript'}

    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        super().end_headers()

    # 开发用截图上传（__qinglan.shot）：仅接受本机请求，只写入 docs/screenshots/<名称>.jpg
    def do_POST(self):
        if not self.path.startswith('/__shot/') or self.client_address[0] not in LOCAL:
            self.send_error(403)
            return
        name = re.sub(r'[^\w\-]', '', self.path[len('/__shot/'):])[:60] or 'shot'
        size = int(self.headers.get('Content-Length', 0))
        if size <= 0 or size > 30_000_000:
            self.send_error(413)
            return
        data = self.rfile.read(size)
        os.makedirs(SHOT_DIR, exist_ok=True)
        with open(os.path.join(SHOT_DIR, name + '.jpg'), 'wb') as f:
            f.write(data)
        self.send_response(204)
        self.send_header('Content-Length', '0')
        self.end_headers()

    def log_message(self, fmt, *args):
        pass


class DualStackServer(socketserver.ThreadingTCPServer):
    allow_reuse_address = True
    daemon_threads = True

    def __init__(self, addr, handler):
        try:
            self.address_family = socket.AF_INET6
            super().__init__(('::', addr[1]), handler, bind_and_activate=False)
            self.socket.setsockopt(socket.IPPROTO_IPV6, socket.IPV6_V6ONLY, 0)
        except (OSError, AttributeError):
            self.address_family = socket.AF_INET
            super().__init__(('', addr[1]), handler, bind_and_activate=False)
        self.server_bind()
        self.server_activate()


with DualStackServer(('', PORT), NoCacheHandler) as httpd:
    print(f'青岚宗: http://localhost:{PORT}', flush=True)
    httpd.serve_forever()
