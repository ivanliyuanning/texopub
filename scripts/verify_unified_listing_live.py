"""Disposable production acceptance for unified listing. Credentials never enter logs."""
from pathlib import Path
import argparse,hashlib,json,os,secrets,subprocess,sys,time,uuid
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence/unified-listing-20261027';C=ROOT/'.secrets/unified-listing-live.json';API='https://commonplace-api.ivanliyuanning123.workers.dev';APP='https://texopub.com'
sha=lambda b:hashlib.sha256(b.encode() if isinstance(b,str) else b).hexdigest()
def save(c):
 C.write_text(json.dumps(c));C.chmod(0o600)
def request(url,body=None,token=None,method=None,headers=None):
 h={'User-Agent':'TexoPub-Unified-Listing-Acceptance/2.3',**(headers or {})}
 if token:h['Authorization']='Bearer '+token
 cfg=['url = '+json.dumps(url),'request = '+json.dumps(method or ('POST' if body is not None else 'GET')),'silent','show-error','max-time = 45']
 tmp=ROOT/'.secrets/unified-request-body'
 if body is not None:
  if not isinstance(body,bytes):body=json.dumps(body,ensure_ascii=False).encode();h['Content-Type']='application/json'
  tmp.write_bytes(body);tmp.chmod(0o600);cfg+=['data-binary = '+json.dumps('@'+str(tmp),ensure_ascii=False)]
 cfg+=['header = '+json.dumps(k+': '+v) for k,v in h.items()]
 if method=='HEAD':cfg+=['head']
 try:
  for attempt in range(3):
   r=subprocess.run(['curl','--config','-','-w','\n%{http_code}'],input=('\n'.join(cfg)+'\n').encode(),capture_output=True)
   if r.returncode==0:break
   if attempt<2:time.sleep(attempt+1)
 finally:tmp.unlink(missing_ok=True)
 if r.returncode:raise RuntimeError('curl transport '+str(r.returncode))
 raw,status=r.stdout.rsplit(b'\n',1);return int(status),raw

def checked(url,*args,**kwargs):
 status,raw=request(url,*args,**kwargs)
 if not 200<=status<300:raise RuntimeError(str(status)+' '+raw[:200].decode(errors='replace'))
 try:return json.loads(raw)
 except ValueError:return raw

def transport():
 c=json.loads(C.read_text()) if C.exists() else {};admin=json.loads((ROOT/'.secrets/admin.json').read_text())
 if 'publisher' not in c:c['publisher']=checked(API+'/v1/admin/publishers',{'name':'Unified listing acceptance temporary','quota_bytes':10485760},admin['token']);c['works']=[];save(c)
 a=c['publisher'];source=(ROOT/'service/public/downloads/texopub-worker-v2026.10.27.mjs').read_bytes();body={'kind':'asset','slug':'unified-release-code','title':'Temporary release code','visibility':'private','listing':'unlisted','files':[{'path':'worker.txt','bytes':len(source),'sha256':sha(source)}]}
 u=checked(API+'/v1/uploads',body,a['token'],headers={'Idempotency-Key':'unified-release-code-'+sha(source)[:12]});checked(API+u['files'][0]['upload_path'],source,a['token'],'PUT');w=checked(API+u['commit_path'],{},a['token'])['work'];c['transport']=w;c['transport_key']='objects/'+a['publisher_id']+'/'+w['id']+'/'+sha(source);save(c)
 print(json.dumps({'staging_key':c['transport_key'],'bytes':len(source),'sha256':sha(source),'publisher_id':a['publisher_id']}))

def seed_mcp():
 c=json.loads(C.read_text());a=c['publisher'];admin=json.loads((ROOT/'.secrets/admin.json').read_text())
 if 'other' not in c:c['other']=checked(API+'/v1/admin/publishers',{'name':'Unified listing other temporary'},admin['token']);save(c)
 if 'oauth' not in c:
  c['oauth']=[{'id':uuid.uuid4().hex,'client_id':uuid.uuid4().hex,'access':'txo_'+secrets.token_urlsafe(32),'refresh':'txr_'+secrets.token_urlsafe(32),'publisher_id':pid,'scope':scope} for pid,scope in [(a['publisher_id'],'texopub:read texopub:publish'),(a['publisher_id'],'texopub:read'),(c['other']['publisher_id'],'texopub:read texopub:publish')]];save(c)
 at=int(time.time());sql=[]
 for g in c['oauth']:
  sql.extend(["INSERT OR IGNORE INTO oauth_grants(id,publisher_id,client_id,name,scope,created,expires) VALUES('%s','%s','%s','Unified listing temporary acceptance','%s',%d,%d)"%(g['id'],g['publisher_id'],g['client_id'],g['scope'],at,at+7200),"INSERT OR IGNORE INTO oauth_tokens(access_hash,refresh_hash,grant_id,expires,refresh_expires) VALUES('%s','%s','%s',%d,%d)"%(sha(g['access']),sha(g['refresh']),g['id'],at+7200,at+7200)])
 (E/'mcp-seed.sql').write_text(';\n'.join(sql)+';\n');print(json.dumps({'temporary_grants':3,'sql_file':str(E/'mcp-seed.sql')}))

def run():
 c=json.loads(C.read_text());a=c['publisher'];checks=[]
 # Resume failed acceptance with a clean, disposable fixture set.
 for w in checked(API+'/v1/me/works',token=a['token'])['items']:
  if w['id']==c['transport']['id']:continue
  for _ in range(20):
   deleted=checked(API+'/v1/me/works/'+w['id']+'/delete',{'expected_version':w.get('version'),'confirm':True},a['token'])
   if deleted['deleted']:break
  else:raise RuntimeError('Previous test fixture cleanup incomplete')
 c['works']=[];c['run_id']=uuid.uuid4().hex[:8];save(c)
 for receipt in E.glob('.commonplace-unified-*.json'):receipt.unlink()
 client=E/'downloaded-commonplace.py';client.write_bytes(checked(APP+'/downloads/commonplace.py'));cred=ROOT/'.secrets/unified-listing-cli.json';cred.write_text(json.dumps({'api':API,'token':a['token']}));cred.chmod(0o600)
 original=E/'fixture.txt';original.write_text('TexoPub unified listing original bytes.\n');page=E/'fixture.html';page.write_text('<!doctype html><html><head><title>Temporary listing acceptance</title></head><body>Unified listing acceptance</body></html>');icon=E/'fixture-icon.svg';icon.write_text('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#245530" d="M2 2h28v28H2z"/></svg>')
 def cli(*args):
  r=subprocess.run([sys.executable,str(client),'--credential',str(cred),*map(str,args)],cwd=E,capture_output=True,text=True)
  if r.returncode:raise RuntimeError('CLI failed: '+r.stderr[:250])
  return json.loads(r.stdout)
 def rpc(method,params,g=0):return checked(APP+'/api/mcp',{'jsonrpc':'2.0','id':uuid.uuid4().hex,'method':method,'params':params},c['oauth'][g]['access'],headers={'Accept':'application/json, text/event-stream'})
 def tool(name,args,g=0,ok=True):
  x=rpc('tools/call',{'name':name,'arguments':args},g)['result']
  if ok:assert not x.get('isError'),str(x)[:300];return x['structuredContent']
  assert x.get('isError');return x
 tools=rpc('tools/list',{})['result']['tools'];assert len(tools)==20;schema=next(x for x in tools if x['name']=='upload_asset');assert schema['inputSchema']['properties']['listing']['enum']==['unlisted','profile','public'];checks.append('Production MCP advertises unified asset listing schema (20 tools)')
 for kind in ['asset','work']:
  for listing in ['unlisted','profile','public']:
   slug='unified-'+kind+'-'+listing+'-'+c['run_id']
   cmd=['assets',original] if kind=='asset' else ['publish',page,'--category','technology/software','--icon',icon]
   pub=cli(*cmd,'--slug',slug,'--title','Temporary unified '+kind+' '+listing,'--listing',listing);c['works'].append(pub);save(c);w=cli('show',pub['work_id']);assert w['listing']==listing
   assert request(w['url'])[0]==200;assert request(w['url'],method='HEAD')[0]==200
   if kind=='asset':
    assert checked(w['url'])==original.read_bytes();assert request(w['url'],headers={'Range':'bytes=0-6'})==(206,b'TexoPub')
    for url in [APP+'/api/v1/me/assets/'+w['id'],APP+'/api/v1/me/files/'+w['version']+'/fixture.txt']:
     assert checked(url)==original.read_bytes();assert request(url,method='HEAD')[0]==200
    assert any(x['id'].startswith(w['version']+'/') for x in checked(APP+'/api/v1/materials')['items'])==(listing=='public')
   else:assert any(x['id']==w['id'] for x in checked(APP+'/api/v1/catalog')['items'])==(listing=='public')
   args={'work_id':w['id'],'expected_version':w['version'],'expected_revision':w['revision'],'listing':'profile'};tool('set_work_listing',args,1,False);tool('set_work_listing',args,2,False);changed=tool('set_work_listing',args);assert changed['version']==w['version'] and changed['url']==w['url'];assert checked(w['url']) if kind=='asset' else request(w['url'])[0]==200
   if kind=='asset':
    new=cli(*cmd,'--slug',slug,'--title','Temporary asset update','--update');assert new['listing']=='profile' and new['url']==w['url'];c['works'][-1]=new;save(c)
    current=cli('show',new['work_id']);closed=tool('set_asset_visibility',{'work_id':current['id'],'expected_version':current['version'],'expected_revision':current['revision'],'listing':'unlisted'});assert closed['listing']=='unlisted';assert checked(w['url'])==original.read_bytes()
   checks.append(kind+' '+listing+': anonymous links, correct discovery, MCP listing and cross-owner/read-only mutation guards')
 # Incomplete draft remains unavailable over the old alias and content origin.
 raw=b'uncommitted';u=checked(API+'/v1/uploads',{'kind':'asset','slug':'unified-incomplete-'+c['run_id'],'title':'Temporary incomplete draft','listing':'public','files':[{'path':'draft.txt','bytes':len(raw),'sha256':sha(raw)}]},a['token'],headers={'Idempotency-Key':'unified-incomplete-'+c['run_id']});c['works'].append({'work_id':u['work_id'],'version':None});save(c);checked(API+u['files'][0]['upload_path'],raw,a['token'],'PUT');assert request(u['files'][0]['url'])[0]==404;assert request(APP+'/api/v1/me/files/'+u['upload_id']+'/draft.txt')[0]==404;checks.append('Uploaded but uncommitted draft remains inaccessible via both content and legacy aliases')
 (E/'live-acceptance.json').write_text(json.dumps({'checks':checks,'test_works':len(c['works']),'all_passed':True},indent=2)+'\n');print(json.dumps({'passed':len(checks),'test_works':len(c['works'])}))

def cleanup():
 c=json.loads(C.read_text());a=c['publisher'];deleted=[]
 for work in checked(API+'/v1/me/works',token=a['token'])['items']:
  for _ in range(20):
   x=checked(API+'/v1/me/works/'+work['id']+'/delete',{'expected_version':work.get('version'),'confirm':True},a['token'])
   if x['deleted']:deleted.append(work['id']);break
  else:raise RuntimeError('Cleanup incomplete')
 assert checked(API+'/v1/me',token=a['token'])['reserved_bytes']==0;admin=json.loads((ROOT/'.secrets/admin.json').read_text())
 for pub in [a,c.get('other')]:
  if pub:checked(API+'/v1/admin/publishers/'+pub['publisher_id']+'/revoke',{},admin['token']);assert request(API+'/v1/me',token=pub['token'])[0]==401
 for work in c.get('works',[]):
  if work.get('url'):assert request(work['url'])[0]==404
 c['cleaned']=True;save(c);(ROOT/'.secrets/unified-listing-cli.json').unlink(missing_ok=True)
 (E/'live-cleanup.json').write_text(json.dumps({'deleted_work_ids':deleted,'quota_bytes_used':0,'publishers_revoked':True,'old_test_links_closed':True},indent=2)+'\n');print(json.dumps({'deleted':len(deleted),'reserved_bytes':0,'publishers_revoked':True}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('mode',choices=['transport','seed-mcp','run','cleanup']);mode=p.parse_args().mode
 {'transport':transport,'seed-mcp':seed_mcp,'run':run,'cleanup':cleanup}[mode]()
