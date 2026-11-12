"""고객 화면 서버: web/ 정적 파일 + /api/meta, /api/day/<T>. 이 컴퓨터에서만 열린다(127.0.0.1).

실행: ~/4Digit/.venv/bin/python ~/4Digit/src/front/serve.py   →  http://127.0.0.1:8520
묶음은 60초 동안만 기억해서, 아침 봉인·개장 직후·장 마감 뒤에 파일이 바뀌면 곧 화면에 반영된다.
--export <폴더>: 같은 묶음을 정적 파일(api/meta.json, api/day/<T>.json)로 내보낸다(서버 없이 올릴 때).
"""
from __future__ import annotations

import json
import mimetypes
import sys
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

import bundle

WEB = Path(__file__).resolve().parent / "web"
PORT, TTL = 8520, 60
_cache: dict[str, tuple[float, bytes]] = {}
_lock = threading.Lock()


def cached(key: str, make) -> bytes:
    with _lock:
        hit = _cache.get(key)
        if hit and time.time() - hit[0] < TTL:
            return hit[1]
        body = json.dumps(make(), ensure_ascii=False, allow_nan=False, default=str).encode()
        _cache[key] = (time.time(), body)
        return body


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):  # 조용히
        pass

    def send(self, code: int, body: bytes, ctype: str) -> None:
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        path = self.path.split("?", 1)[0]
        try:
            if path == "/api/meta":
                return self.send(200, cached("meta", bundle.meta), "application/json; charset=utf-8")
            if path.startswith("/api/day/"):
                T = path.rsplit("/", 1)[1]
                if not (T.isdigit() and len(T) == 8):
                    return self.send(400, b"{}", "application/json")
                return self.send(200, cached("day:" + T, lambda: bundle.day(T)), "application/json; charset=utf-8")
        except FileNotFoundError:
            return self.send(404, b'{"error":"no such day"}', "application/json")
        except Exception as e:  # 화면에 이유를 보여 줄 수 있게
            return self.send(500, json.dumps(dict(error=f"{type(e).__name__}: {e}"), ensure_ascii=False).encode(), "application/json; charset=utf-8")
        f = (WEB / ("index.html" if path in ("/", "") else path.lstrip("/"))).resolve()
        if WEB not in f.parents and f != WEB or not f.is_file():
            return self.send(404, b"not found", "text/plain")
        ctype = mimetypes.guess_type(f.name)[0] or "application/octet-stream"
        if ctype.startswith("text/") or ctype in ("application/javascript", "application/json"):
            ctype += "; charset=utf-8"
        self.send(200, f.read_bytes(), ctype)


def export(out: Path) -> None:
    (out / "api/day").mkdir(parents=True, exist_ok=True)
    m = bundle.meta()
    (out / "api/meta.json").write_text(json.dumps(m, ensure_ascii=False))
    for d in m["days"]:
        (out / f"api/day/{d['T']}.json").write_text(json.dumps(bundle.day(d["T"]), ensure_ascii=False, allow_nan=False, default=str))
    print("내보냄", out, len(m["days"]), "일")


if __name__ == "__main__":
    if len(sys.argv) > 2 and sys.argv[1] == "--export":
        export(Path(sys.argv[2]))
    else:
        mimetypes.add_type("application/javascript", ".js")
        print(f"http://127.0.0.1:{PORT}")
        ThreadingHTTPServer(("127.0.0.1", PORT), H).serve_forever()
