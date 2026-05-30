#!/usr/bin/env python3
"""Local dev server for ПОТУЖНОСТЬ РУ.

Serves files from project/ and redirects common wrong paths like /project/vintage/...
"""
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import os
import sys

ROOT = Path(__file__).resolve().parent
PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8000


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path in ('/dj', '/dj.html', '/dj/'):
            self.send_response(301)
            self.send_header('Location', '/vintage/dj.html')
            self.end_headers()
            return
        if path.startswith('/project/'):
            target = path[8:] or '/'
            self.send_response(301)
            self.send_header('Location', target)
            self.end_headers()
            return
        return super().do_GET()


def main():
    os.chdir(ROOT)
    with ThreadingHTTPServer(('', PORT), Handler) as httpd:
        print(f'Сервер запущен: http://localhost:{PORT}')
        print()
        print(f'Главная (эфир):  http://localhost:{PORT}/vintage/index.html')
        print(f'DJ-заявка:       http://localhost:{PORT}/vintage/dj.html')
        print(f'Админка:         http://localhost:{PORT}/afisha/admin.html')
        print(f'Афиша:           http://localhost:{PORT}/afisha/index.html')
        print(f'Залипай:         http://localhost:{PORT}/zalipay/index.html')
        print()
        print('Важно: без /project/ в адресе!')
        print('Остановить: Ctrl+C')
        httpd.serve_forever()


if __name__ == '__main__':
    main()
