"""Production private-file checks using disposable publishers; never creates phone accounts."""
import hashlib,io,json,os,subprocess,sys,tempfile,urllib.request,urllib.error,zipfile
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];sys.path.insert(0,str(ROOT/'scripts'))
from remote_publish import request,Error
E=ROOT/'evidence/account-space-20261022';admin=json.loads((ROOT/'.secrets/admin.json').read_text());api=admin['api'];publishers=[];works=[];checks=[]
def get(url,token=None):
 h={'User-Agent':'CommonplacePublisher/1.7'}
 if token:h['Authorization']='Bearer '+token
 try:
  with urllib.request.urlopen(urllib.request.Request(url,headers=h),timeout=40) as r:return r.status,r.read(),dict(r.headers)
 except urllib.error.HTTPError as e:return e.status,e.read(),dict(e.headers)
def rejected(fn,status):
 try:fn()
 except Error as e:assert f'HTTP {status}:' in str(e),str(e)
 else:raise AssertionError('Expected HTTP '+str(status))
try:
 for label in ['A','B']:publishers.append(request(api,'/v1/admin/publishers',admin['token'],{'name':'私有素材验收 '+label,'quota_bytes':262144},'POST'))
 a,b=publishers
 with tempfile.TemporaryDirectory(prefix='texopub-private-') as tmp:
  tmp=Path(tmp);cred=tmp/'credential.json';cred.write_text(json.dumps({'api':api,'token':a['token']}));cred.chmod(0o600)
  manifest=json.loads(get('https://texopub.com/for-ai/manifest.json')[1]);assert manifest['version']=='1.7.0'
  raw=get(manifest['archive_url'])[1];assert hashlib.sha256(raw).hexdigest()==manifest['sha256']
  with zipfile.ZipFile(io.BytesIO(raw)) as z:z.extractall(tmp/'skill')
  client=tmp/'skill/commonplace-remote-publish/scripts/commonplace.py'
  def cli(args):return json.loads(subprocess.check_output([sys.executable,str(client),'--credential',str(cred),*args],cwd=tmp,text=True))
  source=tmp/'note.txt';source.write_text('TexoPub private acceptance. No personal data.\n')
  args=['assets',str(source),'--slug','private-acceptance','--title','私有素材验收（临时）']
  first=cli(args);works.append(first);wid=first['work_id'];vid=first['version'];url=first['url']
  assert '/api/v1/me/assets/' in url,url
  status,data,h=get(url,a['token']);assert status==200 and data==source.read_bytes();assert h.get('Cache-Control')=='private,no-store'
  assert get(url)[0]==401;assert get(url,b['token'])[0]==404
  own=request(api,'/v1/me/materials',a['token'])['items'];assert len(own)==1 and own[0]['visibility']=='private'
  fileurl=own[0]['url'];assert get(fileurl,a['token'])[1]==source.read_bytes();assert get(fileurl,b['token'])[0]==404
  assert not request(api,'/v1/me/materials',b['token'])['items']
  assert not any(x.get('publisher_id')==a['publisher_id'] for x in request(api,'/v1/materials')['items'])
  assert not request(api,'/v1/profiles/'+a['publisher_id'])['items']
  rejected(lambda:request(api,'/v1/works/'+wid),404)
  origin=json.loads((ROOT/'cloudflare.json').read_text())['content_url']
  assert get(origin+'/v/'+vid+'/note.txt')[0]==404
  checks.append('Downloaded public Skill v1.7.0 client uploads standalone asset privately by default; original bytes preserved and public indexes/profile/content origin exclude it')
  checks.append('Owner bearer downloads stable/version URLs; other publisher receives 404, anonymous receives 401; protected responses are private,no-store')
  rejected(lambda:request(api,'/v1/me/works/'+wid+'/archive',b['token'],{'expected_version':vid},'POST'),404)
  rejected(lambda:request(api,'/v1/me/works/'+wid+'/archive',a['token'],{'expected_version':'wrong'},'POST'),409)
  source.write_text('Updated private acceptance. No personal data.\n');updated=cli(args+['--update']);works.append(updated)
  assert updated['url']==url and updated['version']!=vid
  assert get(url,a['token'])[1]==source.read_bytes();assert get(origin+'/v/'+updated['version']+'/note.txt')[0]==404
  rejected(lambda:request(api,'/v1/me/works/'+wid+'/archive',a['token'],{'expected_version':vid},'POST'),409)
  cli(['archive',wid,'--expected-version',updated['version']]);assert get(url,a['token'])[0]==404
  assert not request(api,'/v1/me/materials',a['token'])['items']
  checks.append('Update keeps stable private URL; wrong owner/stale archive rejected; downloaded client archives own current version and closes file access')
finally:
 for w in works:
  try:request(api,'/v1/admin/works/'+w['work_id']+'/hide',admin['token'],{},'POST')
  except Error:pass
 for p in publishers:request(api,'/v1/admin/publishers/'+p['publisher_id']+'/revoke',admin['token'],{},'POST')
result={'checks':checks,'temporary_publishers_revoked':len(publishers),'public_works':len(request(api,'/v1/catalog')['items']),'public_materials':len(request(api,'/v1/materials')['items']),'scope':'Private file/API acceptance only. Real SMS/email and browser key creation still require user verification.'}
(E/'private-assets-live.json').write_text(json.dumps(result,ensure_ascii=False,indent=2)+'\n');print(json.dumps(result,ensure_ascii=False))
