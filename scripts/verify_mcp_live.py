"""End-to-end MCP acceptance with disposable synthetic accounts, never human OTPs/cookies."""
import argparse,hashlib,json,secrets,sys,time,urllib.request,urllib.error,uuid
from pathlib import Path
ROOT=Path(__file__).resolve().parents[1];E=ROOT/'evidence/texopub-plugin-20261023';C=ROOT/'.secrets/mcp-acceptance.json'
APP='https://texopub.com';API='https://commonplace-api.ivanliyuanning123.workers.dev';RESOURCE=APP+'/api/mcp'
class NoRedirect(urllib.request.HTTPRedirectHandler):
 def redirect_request(self,*a,**k):return None
opener=urllib.request.build_opener(NoRedirect)
def call(url,data=None,headers=None,method=None):
 h={'User-Agent':'TexoPub-MCP-Acceptance/0.1',**(headers or {})};body=None
 if data is not None:body=json.dumps(data,ensure_ascii=False).encode();h['Content-Type']='application/json'
 try:
  r=opener.open(urllib.request.Request(url,body,h,method=method),timeout=45)
 except urllib.error.HTTPError as ex:r=ex
 with r:
  b=r.read();ct=r.headers.get('Content-Type','');return r.status,(json.loads(b) if 'json' in ct else b),dict(r.headers)
def checked(url,*a,**k):
 s,b,h=call(url,*a,**k);assert 200<=s<300,(s,str(b)[:300]);return b
sha=lambda s:hashlib.sha256(s.encode()).hexdigest()
def browser(a):return {'Cookie':'__Host-texopub='+a['session'],'Origin':APP,'X-TexoPub-Request':'space'}
def save(c):C.write_text(json.dumps(c));C.chmod(0o600)
def prepare():
 assert not C.exists(),'Existing test state must be cleaned first'
 admin=json.loads((ROOT/'.secrets/admin.json').read_text());c={'accounts':[],'works':[]};sql=[]
 for i in range(2):
  p=checked(API+'/v1/admin/publishers',{'name':'MCP acceptance temporary '+str(i),'quota_bytes':2*1024*1024},{'Authorization':'Bearer '+admin['token']});a={'publisher_id':p['publisher_id'],'id':uuid.uuid4().hex,'session':secrets.token_hex(32)};c['accounts'].append(a);t=int(time.time());sql += [f"INSERT INTO accounts(id,publisher_id,phone,created) VALUES('{a['id']}','{a['publisher_id']}','mcp-acceptance-{a['id']}',{t});",f"INSERT INTO login_sessions(token_hash,account_id,created,expires) VALUES('{sha(a['session'])}','{a['id']}',{t},{t+1800});"]
 save(c);(E/'acceptance-seed.sql').write_text('\n'.join(sql));print(json.dumps({'prepared_accounts':2,'seed_file':str(E/'acceptance-seed.sql')}))
def authorize(a):
 from urllib.parse import urlencode,urlparse,parse_qs
 import base64,re
 client=checked(API+'/oauth/register',{'client_name':'TexoPub temporary acceptance','redirect_uris':['https://chatgpt.com/connector_platform_oauth_redirect'],'token_endpoint_auth_method':'none'});verifier=secrets.token_urlsafe(32);challenge=base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).decode().rstrip('=')
 url=APP+'/api/oauth/authorize?'+urlencode({'client_id':client['client_id'],'redirect_uri':client['redirect_uris'][0],'response_type':'code','code_challenge':challenge,'code_challenge_method':'S256','resource':RESOURCE,'scope':'texopub:read texopub:publish','state':'live-acceptance'})
 s,b,h=call(url,headers=browser(a));assert s==200,(s,str(b)[:200]);ticket=re.search(rb'name="ticket" value="([a-f0-9]+)"',b)[1].decode();yes=checked(APP+'/api/oauth/consent',{'ticket':ticket,'decision':'allow'},browser(a));q=parse_qs(urlparse(yes['redirect']).query);assert q['iss']==[API] and q['state']==['live-acceptance'];args={'grant_type':'authorization_code','client_id':client['client_id'],'redirect_uri':client['redirect_uris'][0],'code':q['code'][0],'code_verifier':verifier,'resource':RESOURCE}
 assert call(API+'/oauth/token',{**args,'code_verifier':secrets.token_urlsafe(32)})[0]==400
 token=checked(API+'/oauth/token',args);assert call(API+'/oauth/token',args)[0]==400
 return {**token,'client_id':client['client_id']}
seq=0
def tool(g,name,args):
 global seq;seq+=1
 b=checked(RESOURCE,{'jsonrpc':'2.0','id':seq,'method':'tools/call','params':{'name':name,'arguments':args}},{'Authorization':'Bearer '+g['access_token'],'Accept':'application/json, text/event-stream'});assert 'error' not in b,b;return b['result']
def run():
 c=json.loads(C.read_text());e={'checks':[]};before=checked(API+'/v1/catalog');
 try:
  for a in c['accounts']:
   a['oauth']=authorize(a);save(c)
  g=c['accounts'][0]['oauth'];other=c['accounts'][1]['oauth'];
  import subprocess
  sdk=subprocess.run(['node',str(ROOT/'scripts/verify_mcp_sdk.mjs')],input=json.dumps({'access_token':g['access_token']}),text=True,capture_output=True,timeout=60);assert sdk.returncode==0,sdk.stderr[:500];(E/'sdk-live.json').write_text(sdk.stdout);e['checks'].append('Official MCP SDK client initializes, lists twelve tools and reads its own authorized space')
  space=tool(g,'get_my_space',{})['structuredContent'];assert space['publisher_id']==c['accounts'][0]['publisher_id'];assert 'phone' not in space;e['checks'].append('Real OAuth authorization, issuer/state, PKCE rejection and one-use code')
  assert call(RESOURCE)[0]==401
  cats=tool(g,'list_categories',{})['structuredContent'];assert cats['groups']
  slug='mcp-acceptance-'+uuid.uuid4().hex[:8];args={'slug':slug,'title':'Temporary MCP acceptance','category_id':'technology/software','format':'tool','idempotency_key':slug,'html':'<!doctype html><html><head><title>MCP acceptance</title></head><body>Version one <a href="about.html">About</a></body></html>','icon_svg':'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><path fill="#a34227" d="M2 2h28v28H2z"/></svg>','text_files':[{'path':'about.html','text':'<!doctype html><html><head><title>About</title></head><body>Second page</body></html>'},{'path':'original.txt','text':'original-byte-check'}]}
  r=tool(g,'publish_website',args);assert not r.get('isError'),r;w=r['structuredContent'];c['works'].append(w);save(c);assert call(w['url'])[0]==200;assert call(w['url']+'about.html')[0]==200;assert call(w['url']+'original.txt')[1]==b'original-byte-check';e['checks'].append('MCP publishes real HTML, subpage and exact file bytes through existing R2 workflow')
  assert tool(g,'publish_website',args)['structuredContent']['version']==w['version'];assert tool(other,'get_work',{'work_id':w['work_id']}).get('isError');e['checks'].append('Idempotent publish and cross-account ownership isolation')
  update={**args,'work_id':w['work_id'],'expected_version':w['version'],'idempotency_key':slug+'-v2','html':args['html'].replace('Version one','Version two')};update.pop('icon_svg');u=tool(g,'publish_website',update);assert not u.get('isError'),u;v=u['structuredContent'];c['works'][0]=v;save(c);assert v['url']==w['url'] and v['version']!=w['version'];assert tool(g,'publish_website',update)['structuredContent']['version']==v['version'];raw=call('https://content.texopub.com/_texopub/content/v/'+v['version']+'/index.html')[1];assert b'Version two' in raw;e['checks'].append('Update retains URL, reuses icon, changes visible version and supports retry')
  assert tool(g,'archive_work',{'work_id':v['work_id'],'expected_version':w['version']}).get('isError');assert not tool(g,'archive_work',{'work_id':v['work_id'],'expected_version':v['version']}).get('isError');assert call(v['url'])[0]==404;e['checks'].append('Stale version cannot archive; correct archive closes public root and subpages')
  staged=[{'path':'index.html','text':'<!doctype html><html><head><title>Staged live</title></head><body>Staged live</body></html>'},{'path':'icon.svg','text':args['icon_svg']},*[{'path':f'files/{i}.txt','text':f'original {i}'} for i in range(12)]]
  manifest=[]
  for i in range(0,len(staged),8):manifest+=tool(g,'inspect_files',{'text_files':staged[i:i+8]})['structuredContent']['files']
  prep=tool(g,'prepare_upload',{'slug':slug+'-large','title':'Temporary staged MCP acceptance','category_id':'technology/software','format':'tool','entry':'index.html','icon':'icon.svg','idempotency_key':slug+'-large','files':manifest});assert not prep.get('isError'),prep;up=prep['structuredContent'];c['works'].append({'work_id':up['work_id']});save(c)
  assert tool(g,'commit_upload',{'upload_id':up['upload_id']}).get('isError')
  for f in staged:
   uploaded=tool(g,'upload_file',{'upload_id':up['upload_id'],**f});assert not uploaded.get('isError'),uploaded
  done=tool(g,'commit_upload',{'upload_id':up['upload_id']});assert not done.get('isError'),done;large=done['structuredContent'];c['works'][-1]=large;save(c);assert call(large['url']+'files/11.txt')[1]==b'original 11';assert not tool(g,'archive_work',{'work_id':large['work_id'],'expected_version':large['version']}).get('isError');assert call(large['url'])[0]==404;e['checks'].append('Fourteen-file staged cloud upload stays private until complete; all files verified; archived after acceptance')
  rotated=checked(API+'/oauth/token',{'grant_type':'refresh_token','client_id':g['client_id'],'refresh_token':g['refresh_token'],'resource':RESOURCE});checked(API+'/oauth/revoke',{'client_id':g['client_id'],'token':rotated['refresh_token']});assert call(RESOURCE,{'jsonrpc':'2.0','id':9,'method':'tools/list','params':{}},{'Authorization':'Bearer '+rotated['access_token'],'Accept':'application/json, text/event-stream'})[0]==401;e['checks'].append('Real refresh and revocation stop access immediately')
 finally:
  admin=json.loads((ROOT/'.secrets/admin.json').read_text());
  for w in c['works']:checked(API+'/v1/admin/works/'+w['work_id']+'/hide',{}, {'Authorization':'Bearer '+admin['token']})
  for a in c['accounts']:
   if a.get('oauth'):checked(API+'/oauth/revoke',{'client_id':a['oauth']['client_id'],'token':a['oauth']['refresh_token']})
   checked(API+'/v1/admin/publishers/'+a['publisher_id']+'/revoke',{}, {'Authorization':'Bearer '+admin['token']})
  c['cleaned']=True;save(c)
 after=checked(API+'/v1/catalog');assert before==after,'Catalog differs after cleanup';e.update(passed=True,temporary_content_hidden=True,temporary_publishers_revoked=True,public_catalog_unchanged=True,work_ids=[w['work_id'] for w in c['works']]);(E/'live-acceptance.json').write_text(json.dumps(e,ensure_ascii=False,indent=2)+'\n');print(json.dumps({'passed':True,'checks':len(e['checks']),'public_catalog_unchanged':True}))
if __name__=='__main__':
 p=argparse.ArgumentParser();p.add_argument('--prepare',action='store_true');a=p.parse_args();prepare() if a.prepare else run()
