#!/usr/bin/env python3
"""One-time authorized legacy upload; only public Suzhou guide/resources are included.
Run prepare/upload, then attach the trusted alias to the draft through admin D1,
then commit. The credential never enters the upload directory or evidence.
"""
from pathlib import Path
import concurrent.futures,hashlib,json,re,sys
sys.path.insert(0,str(Path(__file__).resolve().parent))
from remote_publish import request
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence/portal-layout-20261022';C=json.loads((ROOT/'.secrets/portal-migration.json').read_text());API=C['api'];TOKEN=C['token']
def sha(b):return hashlib.sha256(b).hexdigest()
if sys.argv[-1]=='commit':
 u=json.loads((E/'suzhou-upload.json').read_text());result=request(API,u['commit_path'],TOKEN,{},'POST');(E/'suzhou-published.json').write_text(json.dumps(result,ensure_ascii=False,indent=2));print(json.dumps({'published':result['published'],'id':result['work']['id'],'url':result['work']['url']},ensure_ascii=False));raise SystemExit
reg=json.loads((ROOT/'library.json').read_text());w=reg['works'][0];assert w['id']=='suzhou-museum';base=E/'suzhou-upload-source';base.mkdir(exist_ok=True);(base/'index.html').write_bytes((ROOT/w['snapshot']/'index.html').read_bytes());manifest=[];cover=None
for a in reg['assets']:
 source=ROOT/a['local'];data=source.read_bytes();assert sha(data)==a['sha256']
 if a['id']==w['icon_asset_id']:relative='icon.svg'
 else:
  title=re.sub(r'[^\w\-一-鿿]+','-',a.get('title') or Path(a['name']).stem).strip('-')[:64]
  relative='resources/'+title+'-'+a['sha256'][:8]+Path(a['name']).suffix.lower()
 target=base/relative;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(data)
 if a['url']==w['cover']:cover=relative
for f in sorted(base.rglob('*')):
 if f.is_file():
  data=f.read_bytes();manifest.append({'path':f.relative_to(base).as_posix(),'bytes':len(data),'sha256':sha(data)})
body={'slug':'suzhou-museum','kind':'work','title':w['title'],'summary':w['summary'],'tags':w['tags'],'category_id':w['category_id'],'format':w['format'],'icon':'icon.svg','entry':'index.html','cover':cover,'files':manifest,'license':w.get('rights') or '原作品来源与使用范围见正文'}
if not isinstance(body['license'],str):body['license']='原作品来源与使用范围见正文'
# Keep the same body/idempotency key on retry; server verifies its original hash.
if (E/'suzhou-upload.json').exists():u=json.loads((E/'suzhou-upload.json').read_text())
else:
 u=request(API,'/v1/uploads',TOKEN,body,'POST',idem='authorized-suzhou-account-migration-20261022');(E/'suzhou-upload.json').write_text(json.dumps(u,ensure_ascii=False,indent=2))
def send(f):
 data=(base/f['path']).read_bytes();r=request(API,f['upload_path'],TOKEN,data,'PUT',binary=True);assert r['ready'];return {'path':f['path'],'sha256':sha(data),'bytes':len(data)}
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:uploaded=list(pool.map(send,u['files']))
(E/'suzhou-upload-verification.json').write_text(json.dumps({'publisher_id':C['publisher_id'],'upload_id':u['upload_id'],'work_id':u['work_id'],'files':uploaded,'original_entry_sha256':sha((base/'index.html').read_bytes())},ensure_ascii=False,indent=2))
print(json.dumps({'upload_id':u['upload_id'],'work_id':u['work_id'],'files':len(uploaded),'bytes':sum(f['bytes'] for f in uploaded),'ready':True}))
