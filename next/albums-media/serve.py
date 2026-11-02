"""Read-only loopback preview with a second origin for media-link validation."""
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlsplit, unquote
import argparse, json, mimetypes, re, threading
from prepare_resources import prepare

BASE=Path(__file__).resolve().parent
PROJECT=BASE.parents[1]
EVIDENCE=PROJECT/'evidence/albums-media-20261102'
MEDIA=EVIDENCE/'staging/tennis-annotation/assets'

def under(root,relative):
    p=(root/relative).resolve()
    return p if p.is_relative_to(root.resolve()) and p.is_file() else None

class Handler(BaseHTTPRequestHandler):
    external=False
    primary_port=8792
    external_port=8793
    resource_manifest={}
    resource_files={}
    prepared_html=None
    def log_message(self,*args): pass
    def do_OPTIONS(self):
        self.send_response(204);self.send_header('Access-Control-Allow-Origin','*');self.send_header('Access-Control-Allow-Headers','Range');self.send_header('Access-Control-Allow-Methods','GET,HEAD,OPTIONS');self.end_headers()
    def do_POST(self): self.send_error(405,'Read-only local preview')
    do_PUT=do_DELETE=do_POST
    def do_HEAD(self): self.respond(head=True)
    def do_GET(self): self.respond(head=False)
    def send_bytes(self,data,mime,head):
        self.send_response(200);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.send_header('Access-Control-Allow-Origin','*');self.send_header('X-Content-Type-Options','nosniff');self.end_headers()
        if not head:self.wfile.write(data)
    def respond(self,head=False):
        url=unquote(urlsplit(self.path).path)
        if url.startswith('/api/') or url.startswith('/v1/'):
            return self.send_error(404,'No production API in this preview')
        if self.external:
            p=self.resource_files.get(url)
        elif url=='/preview-config.json':
            return self.send_bytes(json.dumps({'externalOrigin':f'http://127.0.0.1:{self.external_port}'}).encode(),'application/json',head)
        elif url=='/resource-manifest.json':
            return self.send_bytes(json.dumps(self.resource_manifest,ensure_ascii=False).encode(),'application/json',head)
        elif url=='/dependency-check/':
            items=self.resource_manifest['items']
            video=next(x for x in items if x['mime']=='video/mp4')
            audio=next((x for x in items if x['mime']=='audio/wav'),None)
            if audio is None:return self.send_error(503,'Audio fixture is missing')
            html=f'''<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>网页内音视频引用验收 · 技术样例</title><style>body{{background:#faf8f3;color:#223e34;font:16px/1.8 system-ui;margin:0}}main{{max-width:920px;margin:auto;padding:30px 20px}}h1{{font-size:28px;line-height:1.5}}h2{{font-size:20px;margin-top:30px}}video{{width:100%;max-height:470px;background:#1b3029;border-radius:9px}}audio{{width:100%}}p{{color:#62716d}}small{{font-size:13px}}a{{color:#b24d31}}</style><main><small>本地资源依赖验收 · 不属于专辑内容</small><h1>播放器留在网页，媒体来自独立资源地址。</h1><p>这份技术样例分别用 video/source 与 audio/source 引用素材。默认不预下载媒体，点击后才播放；没有独立音视频作品页。</p><h2>网页中的视频</h2><video id="fixture-video" controls playsinline preload="none"><source src="{video['url']}" type="video/mp4"></video><h2>网页中的音频</h2><audio id="fixture-audio" controls preload="none"><source src="{audio['url']}" type="audio/wav"></audio><p><a href="/preview/">返回验收面板</a></p></main></html>'''
            return self.send_bytes(html.encode(),'text/html; charset=utf-8',head)
        elif url=='/snapshots/catalog.json': p=PROJECT/'next/data/catalog.json'
        elif url.startswith('/brand/'):p=under(PROJECT/'templates/brand',url[len('/brand/'):])
        elif url.startswith('/shared/'):
            name=url[len('/shared/'):];p=PROJECT/'templates/community'/name if name in {'style.css','icons.mjs','identity.mjs','loading.mjs'} else None
        elif url=='/preview-assets/annotation/index.html':p=self.prepared_html
        elif url.startswith('/preview-assets/annotation/'):
            p=under(EVIDENCE/'staging/tennis-annotation',url[len('/preview-assets/annotation/'):])
        elif url.startswith('/preview-assets/'):
            fixed={'007-3.mp4':MEDIA/'007-3.mp4','022-1.mp4':MEDIA/'022-1.mp4','007-3-audio.wav':EVIDENCE/'preview/007-3-audio.wav','annotation-thumb.png':EVIDENCE/'prepared-desktop.png'}
            jpg=sorted(MEDIA.glob('007-3-*.jpg'))
            blue=sorted(MEDIA.glob('022-1-*.jpg'))
            if jpg:fixed['red-poster.jpg']=jpg[0]
            if blue:fixed['blue-poster.jpg']=blue[0]
            p=fixed.get(url[len('/preview-assets/'):])
        elif url in {'/preview/','/preview.html'}: p=BASE/'preview.html'
        elif url.startswith('/assets/'):p=under(BASE,url.lstrip('/'))
        elif url in {'/app.mjs','/model.mjs','/demo-albums.mjs','/style.css','/preview.mjs','/preview.css'}:p=BASE/url.lstrip('/')
        elif not Path(url.rstrip('/')).suffix: p=BASE/'index.html'
        else:p=None
        if not p or not p.is_file(): return self.send_error(404,'Preview file not found')
        self.send_file(p,head)
    def send_file(self,p,head):
        total=p.stat().st_size;start=0;end=total-1;status=200
        mime={'.mjs':'application/javascript','.svg':'image/svg+xml','.wav':'audio/wav'}.get(p.suffix,mimetypes.guess_type(p.name)[0] or 'application/octet-stream')
        if mime.startswith('text/'):mime+='; charset=utf-8'
        if 'Range' in self.headers:
            match=re.fullmatch(r'bytes=(\d*)-(\d*)',self.headers['Range'])
            if not match or not any(match.groups()): return self.range_error(total)
            first,last=match.groups()
            if first:start=int(first);end=min(int(last),total-1) if last else total-1
            elif int(last)>0:start=max(0,total-int(last))
            else:return self.range_error(total)
            if start>=total or start>end:return self.range_error(total)
            status=206
        self.send_response(status)
        headers={'Content-Type':mime,'Content-Length':str(max(0,end-start+1)),'Accept-Ranges':'bytes','Cache-Control':'public,max-age=300' if urlsplit(self.path).path.startswith('/resources/') else 'no-store','Access-Control-Allow-Origin':'*','Timing-Allow-Origin':'*','Access-Control-Expose-Headers':'Content-Range,Content-Length,Accept-Ranges','X-Content-Type-Options':'nosniff','Cross-Origin-Resource-Policy':'cross-origin'}
        if status==206:headers['Content-Range']=f'bytes {start}-{end}/{total}'
        for k,v in headers.items():self.send_header(k,v)
        self.end_headers()
        if not head:
            try:
                with p.open('rb') as stream:
                    stream.seek(start);remaining=end-start+1
                    while remaining>0:
                        block=stream.read(min(256*1024,remaining))
                        if not block:break
                        self.wfile.write(block);remaining-=len(block)
            except (BrokenPipeError,ConnectionResetError):pass
    def range_error(self,total):
        self.send_response(416);self.send_header('Content-Range',f'bytes */{total}');self.send_header('Content-Length','0');self.send_header('Access-Control-Allow-Origin','*');self.end_headers()

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--port',type=int,default=8792);args=parser.parse_args()
    Handler.primary_port=args.port;Handler.external_port=args.port+1
    Handler.resource_manifest,Handler.resource_files,Handler.prepared_html=prepare(f'http://127.0.0.1:{args.port+1}')
    External=type('External',(Handler,),{'external':True})
    primary=ThreadingHTTPServer(('127.0.0.1',args.port),Handler)
    try:external=ThreadingHTTPServer(('127.0.0.1',args.port+1),External)
    except OSError:primary.server_close();raise
    threading.Thread(target=external.serve_forever,daemon=True).start()
    print(f'Local: http://127.0.0.1:{args.port}/albums/huidong-tennis-test/',flush=True)
    print(f'Panel: http://127.0.0.1:{args.port}/preview/',flush=True)
    try:primary.serve_forever()
    finally:external.shutdown();external.server_close();primary.server_close()
