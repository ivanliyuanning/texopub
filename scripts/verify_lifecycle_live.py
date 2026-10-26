"""Disposable live acceptance for listing and deletion; never uses human OTPs/cookies."""
import argparse,hashlib,json,secrets,time,uuid,urllib.request,urllib.error,subprocess,sys
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence/lifecycle-20261026';C=ROOT/'.secrets/lifecycle-acceptance.json';API='https://commonplace-api.ivanliyuanning123.workers.dev';APP='https://texopub.com'
sha=lambda s:hashlib.sha256(s.encode() if isinstance(s,str) else s).hexdigest()
def request(url,body=None,token=None,method=None,headers=None):
 h={'User-Agent':'TexoPub-Lifecycle-Acceptance/2.0',**(headers or {})}
 if token:h['Authorization']='Bearer '+token
 if body is not None:
  if not isinstance(body,bytes):body=json.dumps(body).encode();h['Content-Type']='application/json'
  h['Content-Length']=str(len(body))
 # curl handles this network's proxy transport consistently. Secrets travel only
 # via stdin config, not command arguments, logs or saved evidence.
 cfg=['url = '+json.dumps(url),'request = '+json.dumps(method or ('POST' if body is not None else 'GET')),'silent','show-error','max-time = 45']
 cfg += ['header = '+json.dumps(k+': '+v) for k,v in h.items()]
 if body is not None:
  if isinstance(body,bytes):
   temporary=ROOT/'.secrets/lifecycle-request-body';temporary.write_bytes(body);temporary.chmod(0o600);cfg+=['data-binary = '+json.dumps('@'+str(temporary),ensure_ascii=False)]
 result=subprocess.run(['curl','--config','-','-w','\n%{http_code}'],input='\n'.join(cfg)+'\n',capture_output=True,text=True)
 if body is not None:temporary.unlink(missing_ok=True)
 if result.returncode:raise RuntimeError('curl transport '+str(result.returncode))
 raw,status=result.stdout.rsplit('\n',1)
 try:data=json.loads(raw)
 except ValueError:data=raw
 return int(status),data

def checked(url,*args,**kwargs):
 status,data=request(url,*args,**kwargs)
 if not 200<=status<300:raise RuntimeError(str(status)+' '+str(data)[:250])
 return data

def save(c):C.write_text(json.dumps(c));C.chmod(0o600)
def prepare():
 assert not C.exists(),'Use existing acceptance state instead of duplicating accounts'
 admin=json.loads((ROOT/'.secrets/admin.json').read_text());c={'accounts':[],'works':[],'phase':'prepared'};sql=[]
 for i in range(2):
  a=checked(API+'/v1/admin/publishers',{'name':'Lifecycle temporary '+str(i),'quota_bytes':10*1024*1024},admin['token']);a.update(id=uuid.uuid4().hex,session=secrets.token_hex(32));c['accounts'].append(a);at=int(time.time())
  sql += ["INSERT INTO accounts(id,publisher_id,phone,created,profile_public) VALUES('%s','%s','lifecycle-test-%s',%d,1);"%(a['id'],a['publisher_id'],a['id'],at),"INSERT INTO login_sessions(token_hash,account_id,created,expires) VALUES('%s','%s',%d,%d);"%(sha(a['session']),a['id'],at,at+7200)]
 save(c);(E/'acceptance-seed.sql').write_text('\n'.join(sql)+'\n')
 # Stage the credential-free Worker source as a private test file. Cloudflare's
 # connected API can read that exact R2 object without allowing arbitrary hosts.
 source=E/'staging/worker.mjs';copy=E/'staging-worker.txt';copy.write_bytes(source.read_bytes());a=c['accounts'][0];body={'kind':'asset','slug':'lifecycle-worker-staging','title':'Temporary lifecycle build staging','visibility':'private','files':[{'path':'worker.txt','bytes':copy.stat().st_size,'sha256':sha(copy.read_bytes())}]}
 u=checked(API+'/v1/uploads',body,a['token'],headers={'Idempotency-Key':'lifecycle-stage-'+a['publisher_id']});save({**c,'staging_upload':u});checked(API+u['files'][0]['upload_path'],copy.read_bytes(),a['token'],'PUT');w=checked(API+u['commit_path'],{},a['token'])['work'];c['works'].append({'work_id':w['id'],'version':w['version']});c['staging_key']='objects/'+a['publisher_id']+'/'+u['work_id']+'/'+sha(copy.read_bytes());save(c)
 print(json.dumps({'accounts':len(c['accounts']),'seed_file':str(E/'acceptance-seed.sql'),'staging_key':c['staging_key'],'staging_hash':sha(copy.read_bytes()),'staging_work_id':w['id']}))

def browser(a):return {'Cookie':'__Host-texopub='+a['session'],'Origin':APP,'X-TexoPub-Request':'space'}
def authorize(a,scope='texopub:read texopub:publish'):
 import base64,re
 from urllib.parse import urlencode,urlparse,parse_qs
 c=checked(API+'/oauth/register',{'client_name':'Lifecycle disposable acceptance','redirect_uris':['https://chatgpt.com/connector_platform_oauth_redirect'],'token_endpoint_auth_method':'none'})
 verifier=secrets.token_urlsafe(32);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
 q=urlencode({'client_id':c['client_id'],'redirect_uri':c['redirect_uris'][0],'response_type':'code','code_challenge':challenge,'code_challenge_method':'S256','resource':APP+'/api/mcp','scope':scope,'state':'lifecycle-live'})
 page=checked(APP+'/api/oauth/authorize?'+q,headers=browser(a));ticket=re.search(r'name="ticket" value="([a-f0-9]+)"',page)[1]
 yes=checked(APP+'/api/oauth/consent',{'ticket':ticket,'decision':'allow'},headers=browser(a));code=parse_qs(urlparse(yes['redirect']).query)['code'][0]
 return {**checked(API+'/oauth/token',{'grant_type':'authorization_code','client_id':c['client_id'],'redirect_uri':c['redirect_uris'][0],'code':code,'code_verifier':verifier,'resource':APP+'/api/mcp'}),'client_id':c['client_id']}
seq=0
def rpc(g,method,params):
 global seq;seq+=1
 r=checked(APP+'/api/mcp',{'jsonrpc':'2.0','id':seq,'method':method,'params':params},g['access_token'],headers={'Accept':'application/json, text/event-stream'})
 assert 'error' not in r,str(r)[:250]
 return r['result']
def tool(g,name,args):
 r=rpc(g,'tools/call',{'name':name,'arguments':args});assert not r.get('isError'),str(r)[:250];return r['structuredContent']
def rejected_tool(g,name,args):return rpc(g,'tools/call',{'name':name,'arguments':args}).get('isError',False)
def run():
 c=json.loads(C.read_text());a,b=c['accounts'];checks=[];results={'checks':checks};before=checked(API+'/v1/catalog');c['oauth']=[];save(c)
 try:
  g=authorize(a);other=authorize(b);ro=authorize(a,'texopub:read');c['oauth']=[g,other,ro];save(c)
  schema=rpc(g,'tools/list',{})['tools'];names=[t['name'] for t in schema];assert len(names)==15 and all(n in names for n in ['delete_work','set_work_listing','set_publish_preferences']);assert 'listing' in next(t for t in schema if t['name']=='publish_website')['inputSchema']['properties'];checks.append('Deployed MCP exposes fifteen tools with listing and destructive deletion schemas')
  assert rejected_tool(ro,'set_publish_preferences',{'default_listing':'unlisted'})
  assert tool(g,'set_publish_preferences',{'default_listing':'profile'})['default_listing']=='profile';assert tool(g,'get_my_space',{})['default_listing']=='profile'
  slug='lifecycle-check-'+uuid.uuid4().hex[:8];args={'slug':slug,'title':'Temporary lifecycle acceptance','summary':'Disposable synthetic fixture; removed after checks','category_id':'technology/software','format':'tool','idempotency_key':slug,'html':'<!doctype html><html><head><title>Lifecycle test</title></head><body>Version one <a href="about.html">About</a></body></html>','icon_svg':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#a34227" d="M2 2h28v28H2z"/></svg>','text_files':[{'path':'about.html','text':'<!doctype html><html><head><title>About</title></head><body>subpage</body></html>'},{'path':'original.txt','text':'original fixture bytes'}]}
  published=tool(g,'publish_website',args);w=published['work'];c['works'].append({'work_id':w['id'],'version':w['version']});save(c);old_version=w['version'];assert w['listing']=='profile'
  ids=lambda endpoint:{i['id'] for i in checked(API+endpoint)['items']}
  profile='/v1/profiles/'+a['publisher_id'];assert w['id'] not in ids('/v1/catalog') and w['id'] in ids(profile);assert not any(x.get('publisher_id')==a['publisher_id'] for x in checked(API+'/v1/materials')['items']);assert request(w['url'])[0]==200;checks.append('Persisted profile default publishes onto personal homepage only, without platform/material listing')
  w=tool(g,'set_work_listing',{'work_id':w['id'],'expected_version':w['version'],'expected_revision':w['revision'],'listing':'unlisted'});assert w['id'] not in ids('/v1/catalog') and w['id'] not in ids(profile);assert request(w['url'])[0]==200;assert request(w['url']+'original.txt')==(200,'original fixture bytes');checks.append('Unlisted work and dependencies stay accessible by link while all public lists omit the work')
  update={**args,'work_id':w['id'],'expected_version':w['version'],'idempotency_key':slug+'-v2','html':args['html'].replace('Version one','Version two')};update.pop('icon_svg');new=tool(g,'publish_website',update);assert new['work']['listing']=='unlisted' and new['url']==w['url'] and new['version']!=old_version;w=new['work'];c['works'][-1]['version']=w['version'];save(c);checks.append('Updating a work retains its original listing and URL, independent of publisher default')
  status,w2=request(APP+'/api/v1/me/works/'+w['id']+'/listing',{'expected_version':w['version'],'expected_revision':w['revision'],'listing':'public'},headers=browser(a));assert status==200,w2;w=w2;assert w['id'] in ids('/v1/catalog') and w['id'] in ids(profile);assert any(x.get('publisher_id')==a['publisher_id'] for x in checked(API+'/v1/materials')['items']);checks.append('Web browser transport switches to public and both catalogs immediately include the work')
  da={'work_id':w['id'],'expected_version':w['version'],'confirm':True};assert rejected_tool(other,'delete_work',da) and rejected_tool(ro,'delete_work',da);assert rejected_tool(g,'delete_work',{**da,'expected_version':old_version});assert request(APP+'/api/v1/me/works/'+w['id']+'/delete',{'expected_version':w['version'],'confirm':True},headers=browser(b))[0]==404
  checked(APP+'/api/v1/me/works/'+w['id']+'/archive',{'expected_version':w['version']},headers=browser(a));deleted=checked(APP+'/api/v1/me/works/'+w['id']+'/delete',{'expected_version':w['version'],'confirm':True},headers=browser(a));assert deleted['deleted'];assert request(w['url'])[0]==404
  for version in [old_version,w['version']]:assert request('https://content.texopub.com/v/'+version+'/index.html')[0]==404 and request('https://content.texopub.com/v/'+version+'/original.txt')[0]==404
  assert tool(g,'delete_work',da)['deleted'];checks.append('Owner/version/read-only guards hold; archived work is permanently deleted through web transport; every historical URL closes and repeated deletion succeeds')
  # Prove the public downloadable client can delete a private independent file.
  cred=ROOT/'.secrets/lifecycle-client.json';cred.write_text(json.dumps({'api':API,'token':a['token']}));cred.chmod(0o600);fixture=E/'fixture.txt';fixture.write_text('private original fixture')
  client=ROOT/'build/current/site/downloads/commonplace.py'
  def cli(argv):
   r=subprocess.run([sys.executable,str(client),'--credential',str(cred),*argv],cwd=E,capture_output=True,text=True,timeout=120);assert r.returncode==0,r.stderr[:250];return json.loads(r.stdout)
  private=cli(['assets',str(fixture),'--slug','lifecycle-private','--title','Temporary private file']);c['works'].append({'work_id':private['work_id'],'version':private['version']});save(c);assert request(private['url'])[0]==401 and request(private['url'],token=a['token'])==(200,'private original fixture');assert cli(['delete',private['work_id'],'--expected-version',private['version'],'--confirm'])['deleted'];checks.append('Downloaded CLI keeps standalone files private and permanently deletes them with quota reclamation')
  eight={**args,'slug':slug+'-eight','idempotency_key':slug+'-eight','listing':'unlisted','text_files':[{'path':'files/'+str(i)+'.txt','text':'file '+str(i)} for i in range(6)]}
  full=tool(g,'publish_website',eight);c['works'].append({'work_id':full['work_id'],'version':full['version']});save(c)
  newer={**eight,'work_id':full['work_id'],'expected_version':full['version'],'idempotency_key':slug+'-eight-v2','html':eight['html'].replace('Version one','Version two')};newer.pop('icon_svg')
  updated=tool(g,'publish_website',newer);assert updated['url']==full['url'] and updated['version']!=full['version'];c['works'][-1]['version']=updated['version'];save(c)
  assert tool(g,'delete_work',{'work_id':updated['work_id'],'expected_version':updated['version'],'confirm':True})['deleted'];checks.append('Full eight-file one-call publish and icon-reusing update succeed within live free-tier D1 query limits')
  staging=c['works'][0];assert tool(g,'delete_work',{'work_id':staging['work_id'],'expected_version':staging['version'],'confirm':True})['deleted'];assert tool(g,'get_my_space',{})['reserved_bytes']==0;checks.append('Plugin deletes pre-upgrade legacy-key staging object and the test publisher storage returns to zero')
  results.update(passed=True,tool_count=len(names),work_ids=[x['work_id'] for x in c['works']],formal_catalog_unchanged=True)
 finally:
  cleanup=[]
  for owner in c['accounts']:
   own=checked(API+'/v1/me/works',token=owner['token'])['items']
   for w in own:
    for _ in range(100):
     r=checked(API+'/v1/me/works/'+w['id']+'/delete',{'expected_version':w['version'],'confirm':True},owner['token'])
     if r['deleted']:cleanup.append(w['id']);break
   assert checked(API+'/v1/me',token=owner['token'])['reserved_bytes']==0
  for auth in c.get('oauth',[]):checked(API+'/oauth/revoke',{'client_id':auth['client_id'],'token':auth['refresh_token']})
  admin=json.loads((ROOT/'.secrets/admin.json').read_text())
  for owner in c['accounts']:checked(API+'/v1/admin/publishers/'+owner['publisher_id']+'/revoke',{},admin['token'])
  c['cleaned']=True;save(c);results['temporary_content_deleted']=True;results['temporary_publishers_revoked']=True;(E/'live-acceptance.json').write_text(json.dumps(results,ensure_ascii=False,indent=2)+'\n');(ROOT/'.secrets/lifecycle-client.json').unlink(missing_ok=True)
 after=checked(API+'/v1/catalog');assert before==after,'Formal catalog changed';print(json.dumps({'passed':True,'checks':len(checks),'temporary_content_deleted':True}))

if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--prepare',action='store_true');a=p.parse_args();prepare() if a.prepare else run()
