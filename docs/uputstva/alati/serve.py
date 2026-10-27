# Serves the exported Expo web build (SPA fallback to index.html) and /img/*.
import http.server, os, sys
ROOT, IMG = sys.argv[1], sys.argv[2]
class H(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        p = path.split("?")[0]
        if p.startswith("/img/"):
            return os.path.join(IMG, p[5:])
        full = os.path.join(ROOT, p.lstrip("/"))
        if os.path.isfile(full):
            return full
        if os.path.isfile(full + ".html"):
            return full + ".html"
        return os.path.join(ROOT, "index.html")
    def log_message(self, *a): pass
http.server.ThreadingHTTPServer(("127.0.0.1", 8099), H).serve_forever()
