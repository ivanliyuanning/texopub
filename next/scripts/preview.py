from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from pathlib import Path
import os
root=Path(__file__).resolve().parents[1]/'dist';os.chdir(root)
class Handler(SimpleHTTPRequestHandler):
 def do_GET(self):
  relative=self.path.split('?')[0].lstrip('/')
  if not relative or not (root/relative).is_file():
   if relative and Path(relative).suffix:
    return super().do_GET()
   self.path='/index.html'
  return super().do_GET()
 def end_headers(self):
  self.send_header('Cache-Control','no-store');self.send_header('X-Content-Type-Options','nosniff');super().end_headers()
 def log_message(self,*args):pass
print('Local: http://127.0.0.1:8770/',flush=True)
ThreadingHTTPServer(('127.0.0.1',8770),Handler).serve_forever()
