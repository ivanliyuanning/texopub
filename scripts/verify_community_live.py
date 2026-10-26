"""Isolated community acceptance. No human OTP, cookie or real account is used."""
from pathlib import Path
import argparse,base64,hashlib,json,re,secrets,subprocess,sys,time,uuid
from urllib.parse import urlencode,urlparse,parse_qs
ROOT=Path(__file__).resolve().parents[1]
E=ROOT/'evidence/community-release-20261026'
C=ROOT/'.secrets/community-release-tests.json'
PROD='https://commonplace-api.ivanliyuanning123.workers.dev'
sha=lambda value:hashlib.sha256(value.encode() if isinstance(value,str) else value).hexdigest()
def save(value):
 C.write_text(json.dumps(value));C.chmod(0o600)
def request(url,body=None,token=None,method=None,headers=None):
 h={'User-Agent':'TexoPub-Community-Acceptance/2.1',**(headers or {})}
 if token:h['Authorization']='Bearer '+token
 if body is not None:
  if not isinstance(body,bytes):body=json.dumps(body).encode();h['Content-Type']='application/json'
  h['Content-Length']=str(len(body))
 cfg=['url = '+json.dumps(url),'request = '+json.dumps(method or ('POST' if body is not None else 'GET')),'silent','show-error','max-time = 55']
 cfg += ['header = '+json.dumps(k+': '+v) for k,v in h.items()]
 temporary=ROOT/'.secrets/community-request-body'
 if body is not None:
  temporary.write_bytes(body);temporary.chmod(0o600);cfg+=['data-binary = '+json.dumps('@'+str(temporary),ensure_ascii=False)]
 try:r=subprocess.run(['curl','--config','-','-w','\n%{http_code}'],input='\n'.join(cfg)+'\n',capture_output=True,text=True)
 finally:temporary.unlink(missing_ok=True)
 if r.returncode:raise RuntimeError('HTTP transport '+str(r.returncode))
 raw,status=r.stdout.rsplit('\n',1)
 try:data=json.loads(raw)
 except ValueError:data=raw
 return int(status),data

def checked(url,*args,**kwargs):
 status,data=request(url,*args,**kwargs)
 if not 200<=status<300:raise RuntimeError(str(status)+' '+str(data)[:220])
 return data

def transport():
 c=json.loads(C.read_text()) if C.exists() else {}
 source=(E/'worker.mjs').read_bytes()
 if 'transport' not in c:
  admin=json.loads((ROOT/'.secrets/admin.json').read_text())
  publisher=checked(PROD+'/v1/admin/publishers',{'name':'Community release code transport temporary','quota_bytes':10*1024*1024},admin['token']);c['transport']=publisher;save(c)
 a=c['transport']
 body={'kind':'asset','slug':'community-code-transport-4398','title':'Temporary release code transport','visibility':'private','files':[{'path':'worker.txt','bytes':len(source),'sha256':sha(source)}]}
 upload=checked(PROD+'/v1/uploads',body,a['token'],headers={'Idempotency-Key':'community-code-transport-4398'})
 c['transport_upload']=upload;save(c)
 checked(PROD+upload['files'][0]['upload_path'],source,a['token'],'PUT')
 work=checked(PROD+upload['commit_path'],{},a['token'])['work']
 c['transport_work']=work;c['transport_key']='objects/'+a['publisher_id']+'/'+work['id']+'/'+sha(source);save(c)
 print(json.dumps({'staging_key':c['transport_key'],'bytes':len(source),'sha256':sha(source),'temporary_publisher':a['publisher_id']}))

def seed():
 c=json.loads(C.read_text());at=int(time.time());sql=[]
 if 'stage' not in c:
  c['stage']={'admin':secrets.token_hex(32),'accounts':[],'oauth':[]}
  for n in range(2):c['stage']['accounts'].append({'id':uuid.uuid4().hex,'publisher_id':uuid.uuid4().hex,'token':secrets.token_hex(32),'session':secrets.token_hex(32),'read':secrets.token_hex(32)})
  save(c)
 for n,a in enumerate(c['stage']['accounts']):
  sql.extend(["INSERT OR IGNORE INTO publishers(id,name,token_hash,quota_bytes,created) VALUES('%s','Community isolated %d','%s',10485760,%d);"%(a['publisher_id'],n,sha(a['token']),at),"INSERT OR IGNORE INTO accounts(id,publisher_id,phone,created,profile_public) VALUES('%s','%s','community-isolated-%s',%d,0);"%(a['id'],a['publisher_id'],a['id'],at),"INSERT OR IGNORE INTO login_sessions(token_hash,account_id,created,expires) VALUES('%s','%s',%d,%d);"%(sha(a['session']),a['id'],at,at+14400),"INSERT OR IGNORE INTO api_keys(id,publisher_id,name,token_hash,prefix,scope,created,expires) VALUES('%s','%s','isolated read','%s','isolated','read',%d,%d);"%(sha(a['read'])[:32],a['publisher_id'],sha(a['read']),at,at+14400)])
 (E/'stage-seed.sql').write_text('\n'.join(sql)+'\n')
 print(json.dumps({'accounts':2,'admin_hash':sha(c['stage']['admin']),'sql_file':str(E/'stage-seed.sql')}))

def run():
 c=json.loads(C.read_text());resources=json.loads((E/'staging-resources.json').read_text());API=resources['api_url'];APP=API;checks=[]
 a,b=c['stage']['accounts'];browser=lambda a:{'Cookie':'__Host-texopub='+a['session'],'Origin':APP,'X-TexoPub-Request':'space'}
 def authorize(owner,scope='texopub:read texopub:publish'):
  client=checked(API+'/oauth/register',{'client_name':'TexoPub isolated community acceptance','redirect_uris':['https://chatgpt.com/connector_platform_oauth_redirect'],'token_endpoint_auth_method':'none'})
  verifier=secrets.token_urlsafe(32);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
  q=urlencode({'client_id':client['client_id'],'redirect_uri':client['redirect_uris'][0],'response_type':'code','code_challenge':challenge,'code_challenge_method':'S256','scope':scope,'resource':APP+'/api/mcp','state':'isolated-community'})
  html=checked(APP+'/api/oauth/authorize?'+q,headers=browser(owner));ticket=re.search(r'name="ticket" value="([a-f0-9]+)"',html)[1]
  redirect=checked(APP+'/api/oauth/consent',{'ticket':ticket,'decision':'allow'},headers=browser(owner))['redirect'];code=parse_qs(urlparse(redirect).query)['code'][0]
  grant=checked(API+'/oauth/token',{'grant_type':'authorization_code','client_id':client['client_id'],'redirect_uri':client['redirect_uris'][0],'code':code,'code_verifier':verifier,'resource':APP+'/api/mcp'})
  grant['client_id']=client['client_id'];c['stage']['oauth'].append(grant);save(c);return grant
 def rpc(method,params,grant):return checked(APP+'/api/mcp',{'jsonrpc':'2.0','id':uuid.uuid4().hex,'method':method,'params':params},grant['access_token'],headers={'Accept':'application/json, text/event-stream'})
 def tool(name,args,grant,ok=True):
  result=rpc('tools/call',{'name':name,'arguments':args},grant)['result']
  if ok:assert not result.get('isError'),str(result)[:400];return result['structuredContent']
  assert result.get('isError'),name+' should reject';return result
 results={'checks':checks,'passed':False}
 try:
  g=authorize(a);ro=authorize(a,'texopub:read');other=authorize(b)
  names=[x['name'] for x in rpc('tools/list',{},g)['result']['tools']];assert len(names)==20;checks.append('OAuth/SDK discovers all 20 tools with unchanged read/publish scopes')
  profile=tool('get_my_profile',{},g);assert profile['ai_partners']==[]
  tool('update_my_profile',{'expected_revision':profile['revision'],'name':'只读不能写'},ro,False)
  profile=tool('update_my_profile',{'expected_revision':profile['revision'],'name':'共创验收甲','bio':'已确认的测试简介'},g)
  tool('update_my_profile',{'expected_revision':0,'name':'旧版本不能写'},g,False)
  assert request(API+'/v1/profiles/'+a['publisher_id'])[0]==404
  assert not any(k in profile for k in ['phone','email','token','keys']);checks.append('Profile updates check current revision/read scope and never enable homepage')
  partner=tool('upsert_ai_partner',{'key':'codex','application':'Codex','expected_revision':0,'name':'织织'},g);assert partner['name']=='织织';assert tool('get_my_profile',{},other)['ai_partners']==[]
  icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><rect x="2" y="2" width="20" height="20" fill="#c74727"/></svg>'
  cover='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80"><rect width="120" height="80" fill="#dceaa0"/></svg>'
  args={'slug':'community-check-'+a['publisher_id'][:8],'title':'Temporary isolated community check','category_id':'technology/software','format':'tool','listing':'unlisted','idempotency_key':'community-eight-v1','html':'<!doctype html><html><head><title>Community test</title></head><body>version 1</body></html>','icon_svg':icon,'cover':'cover.svg','text_files':[{'path':'cover.svg','text':cover}]+[{'path':'files/'+str(n)+'.txt','text':'original '+str(n)} for n in range(5)],'ai_partners':[{'key':'codex','application':'Codex','contribution':'编写测试页面'}]}
  published=tool('publish_website',args,g);work=tool('get_work',{'work_id':published['work_id']},g);url=work['url'];assert work['ai_partners'][0]['name']=='织织';assert 'model' not in work['ai_partners'][0];assert checked(work['cover'])==cover
  assert not any(x['id']==work['id'] for x in checked(API+'/v1/catalog')['items']);tool('get_work',{'work_id':work['id']},other,False);checks.append('Eight-file MCP publishing with original cover and truthful AI credits passes free-tier limits')
  updated={**args,'work_id':work['id'],'expected_version':work['version'],'idempotency_key':'community-eight-v2','html':args['html'].replace('version 1','version 2')};updated.pop('icon_svg');updated.pop('ai_partners')
  published=tool('publish_website',updated,g);work=tool('get_work',{'work_id':work['id']},g);assert work['url']==url;assert work['ai_partners'][0]['contribution']=='编写测试页面';assert work['cover_strategy']=='uploaded';checks.append('Icon-reusing update keeps URL, listing and omitted contributor records')
  checked(APP+'/api/v1/account/profile',{'public':True},headers=browser(a));assert checked(API+'/v1/profiles/'+a['publisher_id'])['items']==[]
  work=tool('set_work_listing',{'work_id':work['id'],'expected_version':work['version'],'expected_revision':work['revision'],'listing':'profile'},g)
  public=checked(API+'/v1/profiles/'+a['publisher_id']);assert len(public['items'])==1;assert public['ai_partners'][0]['name']=='织织';assert not any(x['id']==work['id'] for x in checked(API+'/v1/catalog')['items']);checks.append('Human homepage opt-in and profile-only listing disclose only chosen content')
  simple={k:v for k,v in args.items() if k not in ['cover','ai_partners','text_files']};simple.update(slug='community-default-cover',idempotency_key='community-default-cover');simple['text_files']=[]
  fallback=tool('publish_website',simple,g);assert fallback['work']['cover_strategy']=='typographic-v1';assert fallback['work'].get('ai_partners',[])==[];checks.append('Missing cover and AI declaration use typographic fallback without inferred credits')
  credential=ROOT/'.secrets/community-stage-client.json';credential.write_text(json.dumps({'api':API,'token':a['token'],'publisher_id':a['publisher_id']}));credential.chmod(0o600)
  original=E/'standalone-original.txt';original.write_text('original standalone bytes\n')
  client=ROOT/'build/current/site/downloads/commonplace.py'
  def cli(*args):
   result=subprocess.run([sys.executable,str(client),'--credential',str(credential),*args],text=True,capture_output=True)
   if result.returncode:raise RuntimeError(result.stderr[:400])
   return json.loads(result.stdout)
  assert cli('profile')['name']=='共创验收甲'
  uploaded=cli('assets',str(original),'--slug','community-private-file','--title','Temporary private asset','--receipt',str(E/'asset-receipt.json'))
  asset=tool('get_work',{'work_id':uploaded['work_id']},g);assert request(asset['url'])[0]==401;assert checked(asset['url'],headers=browser(a))==original.read_text()
  permissions={'work_id':asset['id'],'expected_version':asset['version'],'expected_revision':asset['revision'],'visibility':'public'};tool('set_asset_visibility',permissions,ro,False);tool('set_asset_visibility',permissions,other,False)
  asset=tool('set_asset_visibility',permissions,g);assert checked(asset['url'])==original.read_text();assert asset['version']==uploaded['version'];public_asset_url=asset['url']
  cli('asset-visibility',asset['id'],'--expected-version',asset['version'],'--expected-revision',str(asset['revision']),'--visibility','private');assert request(public_asset_url)[0]==404;checks.append('Downloaded CLI and MCP share private/public asset control without replacing original bytes')
  external=tool('submit_website',{'slug':'community-external','title':'Temporary external record','category_id':'technology/software','external_url':'https://example.com/texopub-isolated-acceptance','listing':'unlisted','icon_svg':icon,'idempotency_key':'community-external'},g);assert external['url']=='https://example.com/texopub-isolated-acceptance';checks.append('AI external-site catalog preserves original URL and hosting')
  results.update(passed=True,tool_count=len(names),checks=checks)
 finally:
  cleanup=[]
  for owner in c['stage']['accounts']:
   for work in checked(API+'/v1/me/works',token=owner['token'])['items']:
    for n in range(100):
     removed=checked(API+'/v1/me/works/'+work['id']+'/delete',{'expected_version':work.get('version'),'confirm':True},owner['token'])
     if removed['deleted']:cleanup.append(work['id']);break
    else:raise RuntimeError('Temporary content cleanup incomplete')
   assert checked(API+'/v1/me',token=owner['token'])['reserved_bytes']==0
  for grant in c['stage'].get('oauth',[]):checked(API+'/oauth/revoke',{'client_id':grant['client_id'],'token':grant['refresh_token']})
  c['stage']['cleaned']=True;save(c);results['deleted_work_ids']=cleanup;results['reserved_bytes']=0
  (E/'stage-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');(ROOT/'.secrets/community-stage-client.json').unlink(missing_ok=True)
 print(json.dumps({'passed':results['passed'],'checks':len(checks),'temporary_works_deleted':len(results['deleted_work_ids']),'reserved_bytes':0}))

def cleanup_transport():
 c=json.loads(C.read_text());a=c['transport'];cleanup=[]
 for work in checked(PROD+'/v1/me/works',token=a['token'])['items']:
  for n in range(100):
   result=checked(PROD+'/v1/me/works/'+work['id']+'/delete',{'expected_version':work.get('version'),'confirm':True},a['token'])
   if result['deleted']:cleanup.append(work['id']);break
  else:raise RuntimeError('Code transport cleanup incomplete')
 assert checked(PROD+'/v1/me',token=a['token'])['reserved_bytes']==0
 admin=json.loads((ROOT/'.secrets/admin.json').read_text());checked(PROD+'/v1/admin/publishers/'+a['publisher_id']+'/revoke',{},admin['token']);c['transport_cleaned']=True;save(c)
 (E/'transport-cleanup.json').write_text(json.dumps({'deleted_work_ids':cleanup,'reserved_bytes':0,'publisher_revoked':True},indent=2)+'\n');print(json.dumps({'transport_cleaned':True,'reserved_bytes':0}))

if __name__=='__main__':
 parser=argparse.ArgumentParser();parser.add_argument('mode',choices=['transport','seed','run','cleanup-transport']);mode=parser.parse_args().mode
 {'transport':transport,'seed':seed,'run':run,'cleanup-transport':cleanup_transport}[mode]()
