"""Verify a human-created short-lived acceptance key. Never reads login cookies/OTPs."""
import argparse,hashlib,json,subprocess,sys,tempfile,urllib.request,urllib.error,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from remote_publish import request,Error
E=ROOT/'evidence/account-space-20261022'
def get(url,token=None):
 h={'User-Agent':'CommonplacePublisher/1.7'}
 if token:h['Authorization']='Bearer '+token
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=35) as r:return r.status,r.read(),dict(r.headers)
 except urllib.error.HTTPError as e:return e.status,e.read(),dict(e.headers)
def rejected(fn,status):
 try:fn()
 except Error as e:assert f'HTTP {status}:' in str(e),str(e)
 else:raise AssertionError('Expected HTTP '+str(status))
def main():
 p=argparse.ArgumentParser();p.add_argument('credential',type=Path);p.add_argument('--confirm-revoked',action='store_true');a=p.parse_args()
 c=json.loads(a.credential.read_text());api=c['api'];token=c['token'];assert token.startswith('txp_')
 result={'key_hash':hashlib.sha256(token.encode()).hexdigest(),'checks':[]}
 if a.confirm_revoked:
  rejected(lambda:request(api,'/v1/me',token),401)
  result['checks'].append('The exact human-created acceptance key is now rejected with 401')
  (E/'account-key-revoked.json').write_text(json.dumps(result,indent=2)+'\n');print(json.dumps({'revoked':True}));return
 me=request(api,'/v1/me',token);pid=me['publisher_id'];assert pid==c['publisher_id']
 rejected(lambda:request(api,'/v1/account/keys',token),403 if api=='https://commonplace-api.ivanliyuanning123.workers.dev' else 401)
 profile=request(api,'/v1/profiles/'+pid);assert not any(k in profile for k in ['phone','email','token','keys','materials'])
 admin=json.loads((ROOT/'.secrets/admin.json').read_text());other=None;work=None
 try:
  other=request(api,'/v1/admin/publishers',admin['token'],{'name':'密钥隔离验收（临时）','quota_bytes':262144},'POST')
  with tempfile.TemporaryDirectory(prefix='texopub-key-') as tmp:
   tmp=Path(tmp);source=tmp/'acceptance.txt';source.write_text('Private acceptance for a human-created key. No personal data.\n')
   client=tmp/'commonplace.py';status,raw,_=get('https://texopub.com/downloads/commonplace.py');assert status==200;client.write_bytes(raw)
   def cli(args):return json.loads(subprocess.check_output([sys.executable,str(client),'--credential',str(a.credential.resolve()),*args],cwd=tmp,text=True))
   cli(['me']);cli(['my-works']);cli(['my-materials'])
   work=cli(['assets',str(source),'--slug','account-key-acceptance-'+uuid.uuid4().hex[:8],'--title','密钥上线验收（临时私有）'])
   status,raw,h=get(work['url'],token);assert status==200 and raw==source.read_bytes();assert h.get('Cache-Control')=='private,no-store'
   assert get(work['url'])[0]==401;assert get(work['url'],other['token'])[0]==404
   assert any(x['work_id']==work['work_id'] for x in cli(['my-materials'])['items'])
   assert not any(x.get('work_id')==work['work_id'] for x in request(api,'/v1/materials')['items'])
   cli(['archive',work['work_id'],'--expected-version',work['version']]);assert get(work['url'],token)[0]==404
   result['checks']=['Browser-created txp key authenticates as its declared publisher through downloaded public client','Key cannot manage browser account or expose private contacts in public profile','Real private R2 upload preserves bytes; own key reads, anonymous/other publisher cannot read','Downloaded client archives acceptance file; private URL closes']
 finally:
  if work:request(api,'/v1/admin/works/'+work['work_id']+'/hide',admin['token'],{},'POST')
  if other:request(api,'/v1/admin/publishers/'+other['publisher_id']+'/revoke',admin['token'],{},'POST')
 result.update(publisher_id=pid,test_work_id=work['work_id'],temporary_publisher_revoked=True)
 (E/'account-key-live.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':True,'checks':len(result['checks']),'temporary_content_archived':True}))
if __name__=='__main__':main()
