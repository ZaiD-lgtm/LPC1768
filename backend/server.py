"""Local-only compiler service; also serves the production frontend with --serve."""
import argparse
from http.server import HTTPServer, SimpleHTTPRequestHandler
import json
from pathlib import Path
import secrets
import sys
import time
from urllib.parse import urlparse

from engine import compile_source, load_hex, ROOT

sessions = {}


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT / 'dist'), **kwargs)

    def send_json(self, data, code=200):
        payload = json.dumps(data).encode()
        self.send_response(code)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.send_header('Cache-Control', 'no-store')
        self.end_headers()
        self.wfile.write(payload)

    def allowed(self):
        # Reject cross-site browser requests and DNS rebinding. No CORS access.
        host = self.headers.get('Host', '').split(':')[0]
        origin = self.headers.get('Origin')
        return host in ('127.0.0.1', 'localhost') and (not origin or urlparse(origin).hostname in ('127.0.0.1', 'localhost'))

    def do_GET(self):
        if not self.allowed():
            return self.send_json({'error': 'Local requests only.'}, 403)
        if self.path == '/api/health':
            return self.send_json({'ok': True, 'compiler': 'arm-none-eabi-gcc', 'engine': 'Unicorn Cortex-M3'})
        if not self.server.serve_frontend:
            return self.send_json({'error': 'Use the Vite frontend at http://127.0.0.1:5173'}, 404)
        return super().do_GET()

    def do_POST(self):
        if not self.allowed():
            return self.send_json({'error': 'Local requests only.'}, 403)
        try:
            if 'application/json' not in self.headers.get('Content-Type', ''):
                raise ValueError('Content-Type must be application/json.')
            length = int(self.headers.get('Content-Length', '0'))
            if not 0 < length <= 3 * 1024 * 1024:
                raise ValueError('Invalid request size.')
            data = json.loads(self.rfile.read(length))
            now = time.monotonic()
            for key in list(sessions):
                if now - sessions[key][1] > 1800:
                    del sessions[key]
            if self.path in ('/api/compile', '/api/hex'):
                if self.path == '/api/compile':
                    engine, hex_text, diagnostics = compile_source(data.get('source'))
                else:
                    hex_text, diagnostics = data.get('hex'), ''
                    engine = load_hex(hex_text)
                if len(sessions) >= 8:
                    oldest = min(sessions, key=lambda key: sessions[key][1])
                    del sessions[oldest]
                session = secrets.token_urlsafe(24)
                sessions[session] = (engine, now)
                return self.send_json({'session': session, 'hex': hex_text, 'diagnostics': diagnostics})
            key = data.get('session')
            if self.path == '/api/stop':
                sessions.pop(key, None)
                return self.send_json({'ok': True})
            if self.path == '/api/step':
                if key not in sessions:
                    return self.send_json({'error': 'Simulation session expired. Compile & Run again.'}, 404)
                engine, _ = sessions[key]
                sessions[key] = (engine, now)
                return self.send_json(engine.step(data.get('inputs'), data.get('count', 20000)))
            return self.send_json({'error': 'Unknown endpoint.'}, 404)
        except (ValueError, TypeError, KeyError) as exc:
            return self.send_json({'error': str(exc)}, 400)
        except Exception as exc:
            print(f'Service error: {exc}', file=sys.stderr)
            return self.send_json({'error': f'Compiler service error: {exc}'}, 500)

    def log_message(self, fmt, *args):
        if '/api/step' not in str(args):
            super().log_message(fmt, *args)


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--serve', action='store_true')
    parser.add_argument('--port', type=int, default=8765)
    args = parser.parse_args()
    server = HTTPServer(('127.0.0.1', args.port), Handler)
    server.serve_frontend = args.serve
    print(f'LPC1768 service ready at http://127.0.0.1:{args.port}', flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
