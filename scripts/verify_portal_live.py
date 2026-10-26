#!/usr/bin/env python3
"""Read-only production checks for owned Suzhou migration and new entry pages."""
from pathlib import Path
import concurrent.futures,hashlib,json,urllib.request,urllib.error
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence/portal-layout-20261022';c=json.loads((ROOT/'.secrets/portal-migration.json').read_text());base='https://texopub.com';token=c['token'];checks=[]
def fetch(url,token=None):
 headers={'User-Agent':'TexoPubVerification/1.8'}
 if token:headers['Authorization']='Bearer '+token
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=headers),timeout=45) as r:return r.status,r.read(),{k.lower():v for k,v in r.headers.items()}
 except urllib.error.HTTPError as e:return e.code,e.read(),{k.lower():v for k,v in e.headers.items()}
def api(path,cred=token):
 status,raw,h=fetch(base+'/api/v1/'+path,cred);return status,json.loads(raw),h
def check(name,v):
 assert v,name;checks.append(name)
status,me,_=api('me');check('migration publisher matches real phone/email account',status==200 and me['publisher_id']==c['publisher_id'])
_,works,_=api('me/works');own=[w for w in works['items'] if w['kind']=='work' and w['status']=='published'];check('one published owned Suzhou work, original URL',len(own)==1 and own[0]['id']=='854f50dc76d645809acf16b37c251df6' and own[0]['url']==base+'/p/suzhou-museum/')
_,materials,_=api('me/materials');check('all 101 original resources owned; executable work entry excluded',len(materials['items'])==101 and not any(x['name']=='index.html' for x in materials['items']))
other=json.loads((ROOT/'.secrets/owner-publisher.json').read_text());first=materials['items'][0];status,_,_=fetch(first['url']);check('anonymous protected material request rejected',status==401);status,_,_=fetch(first['url'],other['token']);check('other publisher cannot read own protected material',status==404)
status,_,_=api('profiles/'+c['publisher_id'],None);check('real creator homepage defaults private',status==404)
_,catalog,_=api('catalog',None);check('public catalog has one migrated work and no static duplicate',len(catalog['items'])==1 and catalog['items'][0]['publisher_id']==c['publisher_id'])
_,public,_=api('materials',None);check('original public resources remain exactly 101',len(public['items'])==101)
manifest=json.loads((E/'suzhou-upload.json').read_text());expected={x['path']:x['sha256'] for x in manifest['files']}
def verify(f):
 status,data,h=fetch(f['url'],token);assert status==200 and hashlib.sha256(data).hexdigest()==expected[f['name']],f['name'];assert 'no-store' in h.get('cache-control','');return f['name']
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:verified=list(pool.map(verify,materials['items']))
check('all 101 owned resources are byte-identical to their original uploaded files',len(verified)==101)
for path in ['/','/space/','/space/works/','/space/materials/','/space/settings/','/space/settings/keys/','/login/','/publish/']:
 status,data,h=fetch(base+path);check(path+' returns 200',status==200)
 if path.startswith(('/space/','/login/')):check(path+' protected page no-store and CSP',h.get('cache-control')=='no-store' and 'sha256-' in h.get('content-security-policy','') and h.get('x-frame-options')=='DENY')
(E/'live-portal-checks.json').write_text(json.dumps({'passed':True,'checks':checks,'verified_resources':len(verified),'work_id':own[0]['id'],'version':own[0]['version'],'public_homepage_enabled':False},ensure_ascii=False,indent=2));print(json.dumps({'passed':True,'checks':len(checks),'resources_byte_verified':len(verified)}))
