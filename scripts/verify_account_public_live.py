"""Read-only production account-page routing and public/private surface checks."""
import argparse,json,urllib.request,urllib.error
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1]
p=argparse.ArgumentParser();p.add_argument('--publisher-id',required=True);a=p.parse_args();base='https://texopub.com';checks=[]
def get(path):
 q=urllib.request.Request(base+path,headers={'User-Agent':'CommonplaceRemote/1.7'})
 try:
  with urllib.request.urlopen(q,timeout=30) as r:return r.status,r.read(),r.headers
 except urllib.error.HTTPError as e:return e.status,e.read(),e.headers
for path,marker in [('/space/',b'login-panel'),('/account-privacy/',b'<!doctype html>'),('/u/'+a.publisher_id+'/',b'profile-title'),('/u/'+a.publisher_id,b'profile-title')]:
 status,raw,h=get(path);assert status==200,(path,status);assert marker in raw,(path,'missing marker');checks.append(path+' returns 200 with expected app')
 if path=='/space/':assert h.get('Cache-Control')=='no-store';assert "frame-ancestors 'none'" in h.get('Content-Security-Policy','');checks.append('space no-store / CSP verified')
status,raw,h=get('/api/v1/profiles/'+a.publisher_id);assert status==200;profile=json.loads(raw);assert not any(k in profile for k in ['phone','email','materials','keys','token']);assert isinstance(profile['items'],list);checks.append('public profile contains no private contacts, materials or keys')
assert get('/api/v1/account')[0]==401;checks.append('anonymous account access rejected')
for path,n in [('/api/v1/catalog',1),('/api/v1/materials',101)]:
 status,raw,h=get(path);assert status==200 and len(json.loads(raw)['items'])==n;checks.append(path+' baseline preserved')
(ROOT/'evidence/account-space-20261022/final-public-account-checks.json').write_text(json.dumps({'checks':checks},ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':True,'checks':len(checks)}))
