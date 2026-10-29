const {test,before,after} = require('node:test');
const assert = require('node:assert/strict');
const {readFileSync,writeFileSync} = require('node:fs');
const path=require('node:path');
const {createHash}=require('node:crypto');
const {Miniflare,convertV4MiniflareOptions}=require('../../.tools/node_modules/miniflare');
const esbuild=require('../../.tools/node_modules/esbuild');
const ROOT=path.resolve(__dirname,'..');
const digest=b=>createHash('sha256').update(b).digest('hex');
const admin='test-owner-key-not-for-production';
let mf;
const legacyRequests=[];
const legacyHtml='<!doctype html><html><body>Original Suzhou reader</body></html>';
before(async()=>{
 await esbuild.build({entryPoints:[path.join(ROOT,'worker.mjs')],outfile:path.join(ROOT,'worker.bundle.mjs'),bundle:true,format:'esm',target:'es2022',loader:{'.html':'text'}});
 const script=readFileSync(path.join(ROOT,'worker.bundle.mjs'),'utf8');
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'api',script,modules:true,compatibilityDate:'2026-10-22',d1Databases:{DB:'test-db'},r2Buckets:{FILES:'test-files'},bindings:{ROLE:'api',ADMIN_TOKEN_SHA256:digest(admin),CONTENT_ORIGIN:'https://content.example'}},{name:'content',script,modules:true,compatibilityDate:'2026-10-22',d1Databases:{DB:'test-db'},r2Buckets:{FILES:'test-files'},bindings:{ROLE:'content',CONTENT_ORIGIN:'https://content.example'},outboundService:request=>{
  const url=new URL(request.url);assert.equal(url.origin,'https://co-created-library-lyn.pages.dev');legacyRequests.push({url:request.url,method:request.method});
  return new Response(request.method==='HEAD'?null:legacyHtml,{headers:{'Content-Type':'text/html; charset=utf-8'}});
 }}]}));
 const db=await mf.getD1Database('DB','api');
 await db.batch(JSON.parse(readFileSync(path.join(ROOT,'schema-statements.json'),'utf8')).map(sql=>db.prepare(sql)));
});
after(async()=>{if(mf)await mf.dispose();});
async function call(method,url,body,token,extra={}){
 const headers={...extra};if(token)headers.Authorization='Bearer '+token;
 if(body!==undefined&&!Buffer.isBuffer(body)){body=JSON.stringify(body);headers['Content-Type']='application/json';}
 if(Buffer.isBuffer(body))headers['Content-Length']=String(body.length);
 const target=url.startsWith('https://content.example')?'content':'api';
 const fetcher=await mf.getWorker(target);
 const r=await fetcher.fetch(url.startsWith('https://content.example')?url:'https://api.example'+url,{method,body,headers});
 let data;const raw=await r.text();try{data=JSON.parse(raw);}catch{data=raw;}
 return {status:r.status,headers:r.headers,data};
}
async function publisher(name,quota){const r=await call('POST','/v1/admin/publishers',{name,...(quota?{quota_bytes:quota}:{})},admin);assert.equal(r.status,201,JSON.stringify(r.data));return r.data;}
const icon=Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" fill="green"/></svg>');
function pkg(slug='example',content='Hello'){
 const files={'index.html':Buffer.from('<!doctype html><html><head><title>Demo</title><link rel="icon" href="old.ico"></head><body><script>window.original=42;</script>'+content+'<img src="image.png"></body></html>'),'icon.svg':icon,'image.png':Buffer.from('original-image-bytes')};
 return {files,body:{slug,title:'发布测试',summary:'包含图像',category_id:'technology/software',format:'tool',icon:'icon.svg',entry:'index.html',files:Object.entries(files).map(([path,data])=>({path,bytes:data.length,sha256:digest(data)}))}};
}
let sequence=0;
async function start(p,pack,extra={}){return call('POST','/v1/uploads',{...pack.body,...extra},p.token,{'Idempotency-Key':'test-'+(++sequence)});}
async function send(p,upload,pack){for(const f of upload.files){const r=await call('PUT',f.upload_path,pack.files[f.path],p.token);assert.equal(r.status,200,JSON.stringify(r.data));}}
async function commit(p,upload){return call('POST',upload.commit_path,{},p.token);}
test('public taxonomy and legacy catalog available, uploads require invitation',async()=>{
 assert.equal((await call('GET','/v1/categories')).data.groups.length,8);
 assert.equal((await call('GET','/v1/catalog')).data.items[0].id,'suzhou-museum');
 assert.equal((await call('POST','/v1/uploads',{})).status,401);
 assert.equal((await call('POST','/v1/admin/publishers',{name:'bad'},'not-admin')).status,403);
});
test('upload verifies original bytes, keeps draft private, injects favicon and base, commits once',async()=>{
 const p=await publisher('Alice'),pack=pkg('alice-demo');
 const r=await start(p,pack);assert.equal(r.status,201,JSON.stringify(r.data));const upload=r.data;
 assert.equal((await call('GET',upload.files[0].url)).status,404);
 assert.equal((await commit(p,upload)).status,409);
 const wrong=await call('PUT',upload.files.find(f=>f.path==='image.png').upload_path,Buffer.from('wrong-image-bytesxxx'),p.token);assert.equal(wrong.status,422);
 await send(p,upload,pack);
 assert.equal((await call('GET',upload.files[0].url)).status,404);
 const done=await commit(p,upload);assert.equal(done.status,201,JSON.stringify(done.data));
 assert.equal((await commit(p,upload)).status,200);
 const viewer=await call('GET',done.data.work.url);assert.equal(viewer.status,200);assert.match(viewer.data,/TexoPub 平台标题栏/);assert.match(viewer.data,/sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"/);
 const page=await call('GET','https://content.example/_texopub/content/v/'+upload.upload_id+'/index.html');assert.equal(page.status,200);assert.match(page.data,/<base href="https:\/\/content.example\/_texopub\/content\/v\//);assert.match(page.data,new RegExp(upload.content_base+'icon.svg'));assert.doesNotMatch(page.data,/old.ico/);assert.match(page.data,/window.original=42/);assert.match(page.headers.get('content-security-policy'),/sandbox allow-scripts/);assert.doesNotMatch(page.headers.get('content-security-policy'),/allow-same-origin/);
 const image=await call('GET',upload.files.find(f=>f.path==='image.png').url);assert.equal(image.data,'original-image-bytes');
 const range=await call('GET',upload.files.find(f=>f.path==='image.png').url,undefined,undefined,{Range:'bytes=0-7'});assert.equal(range.status,206);assert.equal(range.data,'original');
 assert.equal((await call('PUT',upload.files[0].upload_path,pack.files['index.html'],p.token)).status,409);
});
test('classification, icon, path, hash, quota and idempotency validations',async()=>{
 const p=await publisher('Validation');
 for(const extra of [{category_id:'technology'},{icon:undefined},{format:'unknown'},{files:[{path:'../private.txt',bytes:1,sha256:'a'.repeat(64)}]}])assert.equal((await start(p,pkg('reject'),extra)).status,400);
 const onlyHtml=pkg('not-an-asset');onlyHtml.body.files=onlyHtml.body.files.filter(f=>f.path==='index.html');assert.equal((await start(p,onlyHtml,{kind:'asset'})).status,400);
 const small=await publisher('Tiny',1);assert.equal((await start(small,pkg('too-big'))).status,413);
 const pack=pkg('repeat'),key='same-key';const a=await call('POST','/v1/uploads',pack.body,p.token,{'Idempotency-Key':key});const b=await call('POST','/v1/uploads',pack.body,p.token,{'Idempotency-Key':key});assert.equal(a.data.upload_id,b.data.upload_id);
 assert.equal((await call('POST','/v1/uploads',{...pack.body,title:'Different'},p.token,{'Idempotency-Key':key})).status,409);
});
test('platform return covers entries, nested and version HTML without modifying stored files or assets',async()=>{
 const p=await publisher('Navigation'),pack=pkg('navigation');
 pack.files['chapters/page.html']=Buffer.from('<html><head><title>Nested</title></head><body><a href="../index.html">Inside</a></body></html>');
 pack.files['bare.html']=Buffer.from('<html><head><title>No explicit body</title></head>Still a work</html>');
 pack.body.files=Object.entries(pack.files).map(([path,data])=>({path,bytes:data.length,sha256:digest(data)}));
 const upload=(await start(p,pack)).data;await send(p,upload,pack);const work=(await commit(p,upload)).data.work;
 const db=await mf.getD1Database('DB','content'),bucket=await mf.getR2Bucket('FILES','content');
 const file=await db.prepare('SELECT object_key FROM files WHERE version_id=? AND path=?').bind(upload.upload_id,'index.html').first();
 const storedBefore=await (await bucket.get(file.object_key)).text();assert(!storedBefore.includes('texopub-return'));
 for(const url of [work.url,work.url+'chapters/page.html',upload.content_base+'chapters/page.html',work.url+'bare.html']){
  const page=await call('GET',url);assert.equal(page.status,200);assert.match(page.data,/TexoPub 平台标题栏/);assert.match(page.data,/href="https:\/\/texopub.com\/"/);assert.doesNotMatch(page.data,/<button id="work/);
  if(page.headers.get('content-length')!==null)assert.equal(Number(page.headers.get('content-length')),Buffer.byteLength(page.data));assert.equal(page.headers.get('etag'),null);assert.equal(page.headers.get('cache-control'),'no-store');assert.equal(page.headers.get('accept-ranges'),'none');
 }
 const nested=await call('GET','https://content.example/_texopub/content/v/'+upload.upload_id+'/chapters/page.html');assert(nested.data.includes('https://content.example/_texopub/content/v/'+upload.upload_id+'/chapters/'));assert(nested.data.includes('href="../index.html"'));assert.match(nested.data,/texopub-bridge:start/);assert.doesNotMatch(nested.data,/TexoPub 平台标题栏/);
 const partial=await call('GET',work.url,undefined,undefined,{Range:'bytes=0-20'});assert.equal(partial.status,200);assert.match(partial.data,/TexoPub 平台标题栏/);
 const head=await call('HEAD',work.url);assert.equal(head.status,200);assert.equal(head.data,'');assert.equal(head.headers.get('content-length'),null);
 assert.equal(await (await bucket.get(file.object_key)).text(),storedBefore);
 const image=await call('GET',upload.content_base+'image.png');assert.equal(image.data,'original-image-bytes');assert.equal(image.headers.get('content-length'),String(pack.files['image.png'].length));
 assert.equal((await call('GET',work.url+'missing.html')).status,404);
 await call('POST','/v1/admin/works/'+work.id+'/hide',{},admin);assert.equal((await call('GET',work.url)).status,404);
});
test('publisher ownership and concurrent updates preserve last successful version',async()=>{
 const p=await publisher('Owner'),other=await publisher('Other'),pack=pkg('owned');let r=await start(p,pack);await send(p,r.data,pack);const initial=(await commit(p,r.data)).data.work;
 assert.equal((await start(other,pkg('owned'),{work_id:initial.id,expected_version:initial.version})).status,403);
 assert.equal((await start(p,pkg('owned'))).status,409);
 const extra={work_id:initial.id,expected_version:initial.version};const one=pkg('owned','One'),two=pkg('owned','Two');const u1=(await start(p,one,extra)).data,u2=(await start(p,two,extra)).data;await send(p,u1,one);await send(p,u2,two);
 assert.equal((await commit(p,u1)).status,201);assert.equal((await commit(p,u2)).status,409);
 assert.match((await call('GET','https://content.example/_texopub/content/v/'+u1.upload_id+'/index.html')).data,/One/);
 assert.equal((await call('PUT',u2.files[0].upload_path,two.files['index.html'],other.token)).status,404);
});
test('standalone assets, revocation, admin hiding and content origin separation',async()=>{
 const p=await publisher('Materials'),data=Buffer.from('public-file');const pack={files:{'notes.txt':data},body:{kind:'asset',visibility:'public',slug:'notes',title:'说明文档',files:[{path:'notes.txt',bytes:data.length,sha256:digest(data)}]}};
 const upload=(await start(p,pack)).data;await send(p,upload,pack);const work=(await commit(p,upload)).data.work;
 assert((await call('GET','/v1/materials')).data.items.some(a=>a.name==='notes.txt'));
 assert(!(await call('GET','/v1/catalog')).data.items.some(w=>w.id===work.id));
 assert.equal((await call('POST','https://content.example/v1/uploads',{},p.token)).status,405);
 await call('POST','/v1/admin/works/'+work.id+'/hide',{},admin);
 assert.equal((await call('GET',upload.files[0].url)).status,404);
 await call('POST','/v1/admin/publishers/'+p.publisher_id+'/revoke',{},admin);
 assert.equal((await call('GET','/v1/me',undefined,p.token)).status,401);
});
test('portable Python client publishes and updates without Wrangler or Cloudflare credentials',async()=>{
 const {mkdtempSync,mkdirSync,rmSync}=require('node:fs');const os=require('node:os');const {promisify}=require('node:util');const execFile=promisify(require('node:child_process').execFile);
 const temp=mkdtempSync(path.join(os.tmpdir(),'commonplace-client-'));const p=await publisher('Python client');
 try{
  const api=(await mf.ready).origin;
  const creds=path.join(temp,'credential.json');writeFileSync(creds,JSON.stringify({api,token:p.token}),{mode:0o600});
  const entry=path.join(temp,'report.html'),image=path.join(temp,'image.png'),ico=path.join(temp,'icon.svg');
  writeFileSync(entry,'<html><head><title>Client</title></head><body><img src="image.png">Client</body></html>');writeFileSync(image,'image');writeFileSync(ico,icon);
  const client=path.join(ROOT,'../scripts/remote_publish.py');const args=[client,'--credential',creds,'publish',entry,'--slug','python-client','--title','Portable client','--category','technology/software','--icon',ico];
  const out=await execFile('python3',args,{cwd:temp});const published=JSON.parse(out.stdout);assert.equal(published.published,true);assert((await call('GET','/v1/catalog')).data.items.some(w=>w.id===published.work_id));
  writeFileSync(entry,'<html><head><title>Client</title></head><body>Updated</body></html>');
  const updated=JSON.parse((await execFile('python3',[...args,'--update'],{cwd:temp})).stdout);assert.equal(published.url,updated.url);assert.notEqual(published.version,updated.version);
  const submit=[client,'--credential',creds,'submit','https://client-external.example/guide/','--slug','client-external','--title','External client','--category','technology/software','--icon',ico];
  const listed=JSON.parse((await execFile('python3',submit,{cwd:temp})).stdout);assert.equal(listed.url,'https://client-external.example/guide/');
  const shown=JSON.parse((await execFile('python3',[client,'--credential',creds,'show',listed.work_id],{cwd:temp})).stdout);assert.equal(shown.source,'external');
  const changed=JSON.parse((await execFile('python3',[...submit,'--update','--link-status','unavailable'],{cwd:temp})).stdout);assert.equal(changed.work_id,listed.work_id);assert.notEqual(changed.version,listed.version);
  const removed=JSON.parse((await execFile('python3',[client,'--credential',creds,'withdraw',changed.work_id,'--expected-version',changed.version],{cwd:temp})).stdout);assert.equal(removed.removed,true);
  const asset=path.join(temp,'notes.txt');writeFileSync(asset,'First');const assetArgs=[client,'--credential',creds,'assets',asset,'--slug','client-asset','--title','Client asset','--public'];
  const firstAsset=JSON.parse((await execFile('python3',assetArgs,{cwd:temp})).stdout);writeFileSync(asset,'Second');const nextAsset=JSON.parse((await execFile('python3',[...assetArgs,'--update'],{cwd:temp})).stdout);assert.equal(firstAsset.url,nextAsset.url);assert.notEqual(firstAsset.version,nextAsset.version);assert.equal((await call('GET',nextAsset.url)).data,'Second');
 }finally{rmSync(temp,{recursive:true,force:true});}
});
function external(slug,url='https://external.example/guide/'){
 return {files:{'icon.svg':icon},body:{source:'external',slug,title:'外部指南',summary:'原站自行托管',external_url:url,category_id:'humanities/museums',format:'guide',icon:'icon.svg',files:[{path:'icon.svg',bytes:icon.length,sha256:digest(icon)}]}};
}
test('external listing uploads only an icon, enters the shared catalog and preserves original URL',async()=>{
 const p=await publisher('收录者'),pack=external('external-guide','https://External.Example:443/guide/#intro');
 const upload=(await start(p,pack)).data;assert(!(await call('GET','/v1/catalog')).data.items.some(w=>w.id===upload.work_id));
 await send(p,upload,pack);const done=await commit(p,upload);assert.equal(done.status,201,JSON.stringify(done.data));const w=done.data.work;
 assert.equal(w.source,'external');assert.equal(w.url,'https://external.example/guide/#intro');assert.equal(w.external_domain,'external.example');assert.equal(w.link_status,'unchecked');
 assert((await call('GET','/v1/catalog')).data.items.some(x=>x.id===w.id&&x.url===w.url));
 assert(!(await call('GET','/v1/materials')).data.items.some(x=>x.publisher_id===p.publisher_id));
 assert.equal((await call('GET',w.icon)).status,200);assert.equal((await call('GET','https://content.example/p/'+p.publisher_id+'/external-guide/')).status,404);
 const duplicate=await start(p,external('duplicate'));assert.equal(duplicate.status,409);
 assert.equal((await start(p,pkg('external-guide'),{work_id:w.id,expected_version:w.version})).status,403);
 const next=external('external-guide',w.url);const session=(await start(p,next,{work_id:w.id,expected_version:w.version,link_status:'unavailable'})).data;await send(p,session,next);const changed=(await commit(p,session)).data.work;assert.equal(changed.id,w.id);assert.equal(changed.url,w.url);assert.equal(changed.link_status,'unavailable');
 const other=await publisher('Other collector');assert.equal((await call('POST','/v1/works/'+w.id+'/withdraw',{expected_version:changed.version},other.token)).status,404);
 assert.equal((await call('POST','/v1/works/'+w.id+'/withdraw',{expected_version:w.version},p.token)).status,409);
 assert.equal((await call('POST','/v1/works/'+w.id+'/withdraw',{expected_version:changed.version},p.token)).status,200);
 assert.equal((await call('POST','/v1/works/'+w.id+'/withdraw',{expected_version:changed.version},p.token)).status,200);
 assert(!(await call('GET','/v1/catalog')).data.items.some(x=>x.id===w.id));assert.equal((await call('GET',changed.icon)).status,404);
});
test('external URLs, categories, icons and concurrent duplicate claims are validated',async()=>{
 const p=await publisher('External validation');
 for(const url of ['javascript:alert(1)','http://external.example/','https://u:password@external.example/','https://localhost/','https://127.0.0.1/','https://[::1]/','https://external.example:8443/'])assert.equal((await start(p,external('invalid',url))).status,400,url);
 for(const extra of [{category_id:'humanities'},{icon:undefined},{link_status:'available'},{kind:'asset'},{source:'other'}])assert.equal((await start(p,external('invalid-extra'),extra)).status,400);
 assert.equal((await start(p,pkg('extra-html'),{source:'external',external_url:'https://extra.example/'})).status,400);
 const a=external('race-a','https://race.example/'),b=external('race-b','https://race.example/');const u1=(await start(p,a)).data,u2=(await start(p,b)).data;await send(p,u1,a);await send(p,u2,b);
 assert.equal((await commit(p,u1)).status,201);assert.equal((await commit(p,u2)).status,409);
 const db=await mf.getD1Database('DB','api');const pending=await db.prepare('SELECT state FROM versions WHERE id=?').bind(u2.upload_id).first();assert.equal(pending.state,'draft');
 const results=(await call('GET','/v1/catalog')).data.items.filter(x=>x.external_url==='https://race.example/');assert.equal(results.length,1);
});
test('trusted legacy migration removes duplicate catalog entry, preserves alias on update and confines original reader exception',async()=>{
 const p=await publisher('Legacy owner'),pack=pkg('suzhou-museum');let u=await start(p,pack,{legacy_id:'suzhou-museum',legacy_initial_version:'injected'});await send(p,u.data,pack);let done=await commit(p,u.data),w=done.data.work;assert.equal(w.legacy_id,undefined);const db=await mf.getD1Database('DB','api');
 const metadata={...w,legacy_id:'suzhou-museum',legacy_initial_version:w.version};delete metadata.id;delete metadata.version;delete metadata.url;delete metadata.path;
 await db.batch([db.prepare('UPDATE works SET metadata=? WHERE id=?').bind(JSON.stringify(metadata),w.id),db.prepare('UPDATE versions SET metadata=? WHERE id=?').bind(JSON.stringify(metadata),w.version)]);
 const catalog=(await call('GET','/v1/catalog')).data.items;assert(!catalog.some(x=>x.id==='suzhou-museum'));assert.equal(catalog.filter(x=>x.legacy_id==='suzhou-museum').length,1);assert.equal(catalog.find(x=>x.id===w.id).url,'https://texopub.com/p/suzhou-museum/');
 const alias=await call('GET','https://content.example/p/suzhou-museum/');assert.equal(alias.status,200);assert.match(alias.data,/src="\/p\/suzhou-museum\/_content\/index.html"/);assert.match(alias.data,/sandbox="[^"]*allow-same-origin/);
 // Browsers may retain the old Pages redirect from index.html to its directory.
 for(const suffix of ['', 'index.html']){
  const reader=await call('GET','https://content.example/p/suzhou-museum/_content/'+suffix+'?reader=1');
  assert.equal(reader.status,200,JSON.stringify(reader.data));assert.equal(reader.data,legacyHtml);assert.equal(reader.headers.get('cache-control'),'no-store');
  assert.equal(legacyRequests.at(-1).url,'https://co-created-library-lyn.pages.dev/p/suzhou-museum/_content/index.html?reader=1');
  const head=await call('HEAD','https://content.example/p/suzhou-museum/_content/'+suffix);assert.equal(head.status,200);assert.equal(head.data,'');assert.equal(legacyRequests.at(-1).method,'HEAD');
 }
 const requestsBefore=legacyRequests.length;assert.equal((await call('GET','https://content.example/p/suzhou-museum/_content/%252e%252e/secret.html')).status,400);assert.equal(legacyRequests.length,requestsBefore);
 const normal=await call('GET','https://content.example/p/'+p.publisher_id+'/suzhou-museum/');assert(!/sandbox="[^"]*allow-same-origin/.test(normal.data));
 const update=pkg('suzhou-museum','New version');u=await start(p,update,{work_id:w.id,expected_version:w.version,legacy_id:'evil'});await send(p,u.data,update);done=await commit(p,u.data);assert.equal(done.data.work.legacy_id,'suzhou-museum');assert.equal(done.data.work.url,'https://texopub.com/p/suzhou-museum/');const newer=await call('GET','https://content.example/p/suzhou-museum/');assert.equal(newer.status,200);assert.match(newer.data,/src="https:\/\/content.example\/_texopub\/content\/v\//);assert(!/sandbox="[^"]*allow-same-origin/.test(newer.data));
 await call('POST','/v1/admin/works/'+w.id+'/hide',{},admin);
 for(const suffix of ['', 'index.html'])assert.equal((await call('GET','https://content.example/p/suzhou-museum/_content/'+suffix)).status,404);
});

test('automatic short URLs retain ownership, versions and sandbox isolation',async()=>{
 const alias='alias-fixture',p=await publisher('Alias owner');
 const pack=pkg('alias-fixture','Short alias content');pack.files['child.html']=Buffer.from('<html><head><title>Child</title></head><body>Child</body></html>');pack.body.files=Object.entries(pack.files).map(([path,data])=>({path,bytes:data.length,sha256:digest(data)}));
 const u=await start(p,pack,{public_slug:'hijack',short_url:'hijack'});assert.equal(u.status,201,JSON.stringify(u.data));const workId=u.data.work_id;await send(p,u.data,pack);const done=await commit(p,u.data);
 const url='https://content.example/p/'+alias+'/';assert.equal(done.data.work.url,url);
 for(const location of [url,url+'child.html']){const r=await call('GET',location);assert.equal(r.status,200);assert.match(r.data,/sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"/);assert.doesNotMatch(r.data,/allow-same-origin/);assert(r.data.includes('"publicRoot":"/p/'+alias+'/"'));}
 assert.equal((await call('GET',url+'image.png')).data,'original-image-bytes');
 const noSlash=await (await mf.getWorker('content')).fetch(url.slice(0,-1)+'?x=1',{redirect:'manual'});assert.equal(noSlash.headers.get('location'),url+'?x=1');
 const original=await call('GET','https://content.example/p/'+(p.publisher_id||p.id)+'/alias-fixture/');assert.equal(original.status,200);
 const catalog=await call('GET','/v1/catalog');assert.equal(catalog.data.items.find(w=>w.id===workId).url,url);
 const pack2=pkg('alias-fixture','Updated alias content'),v=(await start(p,pack2,{work_id:workId,expected_version:done.data.work.version})).data;await send(p,v,pack2);assert.equal((await commit(p,v)).data.work.url,url);assert((await call('GET',url)).data.includes(v.upload_id));
 const another=await publisher('Other owner');assert.equal((await start(another,pkg('alias-fixture'),{work_id:workId})).status,403);
 await call('POST','/v1/admin/works/'+workId+'/hide',{},admin);assert.equal((await call('GET',url)).status,404);assert.equal((await call('GET',url+'image.png')).status,404);
});

test('concurrent same-name publishers get distinct automatic URLs and drafts remain private',async()=>{
 const a=await publisher('Collision A'),b=await publisher('Collision B'),pack=pkg('shared-name');
 const sessions=await Promise.all([start(a,pack),start(b,pack)]);assert(sessions.every(x=>x.status===201),JSON.stringify(sessions));
 assert.equal((await call('GET','https://content.example/p/shared-name/')).status,404);
 await Promise.all([send(a,sessions[0].data,pack),send(b,sessions[1].data,pack)]);
 const done=await Promise.all([commit(a,sessions[0].data),commit(b,sessions[1].data)]),urls=done.map(x=>x.data.work.url);
 assert.equal(new Set(urls).size,2);assert(urls.includes('https://content.example/p/shared-name/'));assert(urls.every(x=>/^https:\/\/content\.example\/p\/shared-name(?:-[a-f0-9]{6,32})?\/$/.test(x)));
 for(const url of urls)assert.equal((await call('GET',url)).status,200);
 await call('POST','/v1/admin/works/'+done[0].data.work.id+'/hide',{},admin);
 const c=await publisher('Collision C'),next=await start(c,pack);assert.equal(next.status,201);await send(c,next.data,pack);const third=(await commit(c,next.data)).data.work;assert(!urls.includes(third.url));
 assert.equal((await call('GET',urls[0])).status,404);
});
test('legacy and publisher namespaces cannot be captured by a requested slug',async()=>{
 const p=await publisher('Reserved paths');
 for(const slug of ['suzhou-museum','a'.repeat(32),'x'.repeat(64)]){
  const pack=pkg(slug),u=(await start(p,pack)).data;await send(p,u,pack);const w=(await commit(p,u)).data.work;const name=new URL(w.url).pathname.split('/')[2];assert(name.length<=64);if(slug!=='x'.repeat(64))assert.notEqual(name,slug);assert.equal((await call('GET',w.url)).status,200);
 }
});

test('base URL keeps fragment links in the current HTML while relative assets still resolve',async()=>{
 const p=await publisher('Fragment links'),pack=pkg('fragment-links');
 pack.files['chapters/中文页面.html']=Buffer.from('<html><head><title>Anchors</title></head><body><a href="#route">Directory</a><h2 id="route">Contents</h2><img src="../image.png"></body></html>');
 pack.body.files=Object.entries(pack.files).map(([path,data])=>({path,bytes:data.length,sha256:digest(data)}));
 const u=(await start(p,pack)).data;await send(p,u,pack);await commit(p,u);
 const doc='https://content.example/_texopub/content/v/'+u.upload_id+'/chapters/'+encodeURIComponent('中文页面.html')+'?view=read';
 const page=await call('GET',doc);assert.equal(page.status,200);
 const base=page.data.match(/<base href="([^"]+)"/)[1];assert.equal(base,doc);
 assert.equal(new URL('#route',base).href,doc+'#route');
 assert.equal(new URL('../image.png',base).href,'https://content.example/_texopub/content/v/'+u.upload_id+'/image.png');
 assert.equal((await call('GET',new URL('#route',base).href)).status,200);
 assert.match(page.data,/href="#route"/);assert.doesNotMatch(page.headers.get('content-security-policy'),/allow-same-origin/);
});

test('listing controls catalogs, preserves link access and supports persisted publisher defaults',async()=>{
 const p=await publisher('Listing author'),pack=pkg('listing-work');
 assert.equal((await call('POST','/v1/me/preferences',{default_listing:'profile'},p.token)).status,200);
 assert.equal((await call('GET','/v1/me',undefined,p.token)).data.default_listing,'profile');
 const u=(await start(p,pack)).data;await send(p,u,pack);let w=(await commit(p,u)).data.work;assert.equal(w.listing,'profile');
 const db=await mf.getD1Database('DB','api');await db.prepare("INSERT INTO accounts(id,publisher_id,phone,created,profile_public) VALUES(?,?,?,0,1)").bind('c'.repeat(32),p.publisher_id,'listing-profile').run();
 const catalog=async()=>((await call('GET','/v1/catalog')).data.items).some(x=>x.id===w.id),profile=async()=>((await call('GET','/v1/profiles/'+p.publisher_id)).data.items).some(x=>x.id===w.id),materials=async()=>((await call('GET','/v1/materials')).data.items).some(x=>x.publisher_id===p.publisher_id);
 assert(!await catalog());assert(await profile());assert(!await materials());assert.equal((await call('GET',w.url)).status,200);
 let r=await call('POST','/v1/me/works/'+w.id+'/listing',{listing:'unlisted',expected_version:w.version,expected_revision:w.revision},p.token);assert.equal(r.status,200);w=r.data;
 assert(!await catalog());assert(!await profile());assert(!await materials());assert.equal((await call('GET',w.url)).status,200);assert.equal((await call('GET','https://content.example/v/'+w.version+'/image.png')).status,200);
 const update=await start(p,pack,{work_id:w.id,expected_version:w.version});await send(p,update.data,pack);w=(await commit(p,update.data)).data.work;assert.equal(w.listing,'unlisted');
 r=await call('POST','/v1/me/works/'+w.id+'/listing',{listing:'public',expected_version:w.version,expected_revision:w.revision},p.token);assert.equal(r.status,200);w=r.data;assert(await catalog());assert(await profile());assert(await materials());
 assert.equal((await call('POST','/v1/me/works/'+w.id+'/listing',{listing:'profile',expected_version:w.version,expected_revision:w.revision-1},p.token)).status,409);
 const draft=await start(p,pack,{work_id:w.id,expected_version:w.version});await send(p,draft.data,pack);
 await call('POST','/v1/me/works/'+w.id+'/listing',{listing:'unlisted',expected_version:w.version,expected_revision:w.revision},p.token);
 assert.equal((await commit(p,draft.data)).status,409,'Changing listing invalidates an older pending content update');
 assert.equal((await call('POST','/v1/me/preferences',{default_listing:'private'},p.token)).status,400);
});

test('permanent delete clears all versions and R2 objects, releases quota, blocks stale/foreign requests and reserves its address',async()=>{
 const p=await publisher('Delete author'),other=await publisher('Another author'),pack=pkg('delete-history');let u=(await start(p,pack)).data;await send(p,u,pack);let w=(await commit(p,u)).data.work;
 const old=w.version;u=(await start(p,pkg(pack.body.slug,'Second'),{work_id:w.id,expected_version:w.version})).data;await send(p,u,pkg(pack.body.slug,'Second'));w=(await commit(p,u)).data.work;
 const endpoint='/v1/me/works/'+w.id+'/delete',args={expected_version:w.version,confirm:true};
 assert.equal((await call('POST',endpoint,args,other.token)).status,404);assert.equal((await call('POST',endpoint,{...args,confirm:false},p.token)).status,400);assert.equal((await call('POST',endpoint,{...args,expected_version:old},p.token)).status,409);
 const r=await call('POST',endpoint,args,p.token);assert.equal(r.status,200,JSON.stringify(r));assert(r.data.deleted);assert(r.data.released_bytes>0);assert.equal((await call('GET','/v1/me',undefined,p.token)).data.reserved_bytes,0);
 assert(!(await call('GET','/v1/me/works',undefined,p.token)).data.items.some(x=>x.id===w.id));assert.equal((await call('GET',w.url)).status,404);assert.equal((await call('GET','https://content.example/v/'+old+'/image.png')).status,404);assert.equal((await call('GET','https://content.example/v/'+w.version+'/image.png')).status,404);
 assert.equal((await call('POST',endpoint,args,p.token)).data.deleted,true);assert.equal((await call('GET','/v1/me/works/'+w.id,undefined,p.token)).data.deleted,true);
 const bucket=await mf.getR2Bucket('FILES','api');assert.equal((await bucket.list({prefix:'objects/'+p.publisher_id+'/'})).objects.length,0);
 assert.equal((await call('POST',u.commit_path,{},p.token)).status,404);const reuse=(await start(other,pack)).data;await send(other,reuse,pack);const next=(await commit(other,reuse)).data.work;assert.notEqual(next.url,w.url);
});

test('deletion retries after R2 failure, retains quota until complete, protects legacy shared objects and handles drafts',async()=>{
 const {deleteWork}=await import('../lifecycle.mjs'),db=await mf.getD1Database('DB','api'),bucket=await mf.getR2Bucket('FILES','api'),p=await publisher('Retry delete'),pack=pkg('retry-delete');
 const u=(await start(p,pack)).data;await send(p,u,pack);const w=(await commit(p,u)).data.work,args={expected_version:w.version,confirm:true},identity={id:p.publisher_id};
 await assert.rejects(deleteWork({DB:db,FILES:{delete:async()=>{throw Error('R2 transient failure');}}},identity,w.id,args),/R2 transient/);
 assert.equal((await call('GET',w.url)).status,404);assert((await call('GET','/v1/me',undefined,p.token)).data.reserved_bytes>0);assert((await call('GET','/v1/me/works/'+w.id,undefined,p.token)).data.deleting);
 assert((await deleteWork({DB:db,FILES:bucket},identity,w.id,args)).deleted);assert.equal((await call('GET','/v1/me',undefined,p.token)).data.reserved_bytes,0);
 const a=(await start(p,pkg('shared-a'))).data,b=(await start(p,pkg('shared-b'))).data;await send(p,a,pkg('shared-a'));await send(p,b,pkg('shared-b'));const wa=(await commit(p,a)).data.work,wb=(await commit(p,b)).data.work;
 const shared='objects/'+p.publisher_id+'/old-shared-image';await bucket.put(shared,'original-image-bytes');await db.prepare("UPDATE files SET object_key=? WHERE version_id IN (?,?) AND path='image.png'").bind(shared,wa.version,wb.version).run();
 assert((await deleteWork({DB:db,FILES:bucket},identity,wa.id,{expected_version:wa.version,confirm:true})).deleted);assert(await bucket.head(shared));assert.equal((await call('GET','https://content.example/v/'+wb.version+'/image.png')).data,'original-image-bytes');
 assert((await deleteWork({DB:db,FILES:bucket},identity,wb.id,{expected_version:wb.version,confirm:true})).deleted);assert.equal(await bucket.head(shared),null);
 const draft=(await start(p,pkg('unfinished'))).data;assert((await deleteWork({DB:db,FILES:bucket},identity,draft.work_id,{expected_version:null,confirm:true})).deleted);assert.equal((await call('POST',draft.commit_path,{},p.token)).status,404);
});

test('large deletion finishes across bounded batches and an active upload lock blocks cleanup without hiding the work',async()=>{
 const p=await publisher('Batched delete'),pack=pkg('batch-delete');for(let i=0;i<220;i++)pack.files['more/'+i+'.txt']=Buffer.from('data '+i);pack.body.files=Object.entries(pack.files).map(([path,data])=>({path,bytes:data.length,sha256:digest(data)}));
 const u=(await start(p,pack)).data;await send(p,u,pack);const w=(await commit(p,u)).data.work,db=await mf.getD1Database('DB','api'),ep='/v1/me/works/'+w.id+'/delete',args={expected_version:w.version,confirm:true};
 await db.prepare('INSERT INTO work_operations(work_id,token,expires) VALUES(?,?,?)').bind(w.id,'active',Math.floor(Date.now()/1000)+60).run();assert.equal((await call('POST',ep,args,p.token)).status,409);assert.equal((await call('GET',w.url)).status,200);await db.prepare('DELETE FROM work_operations WHERE work_id=?').bind(w.id).run();
 let r=await call('POST',ep,args,p.token);assert.equal(r.data.deleted,false);assert(r.data.remaining_files>0);r=await call('POST',ep,args,p.token);assert.equal(r.data.deleted,true);assert.equal((await call('GET','/v1/me',undefined,p.token)).data.reserved_bytes,0);
});

test('webpages and assets share all three listings, anonymous GET/HEAD/Range, profiles and owner-only writes',async()=>{
 const p=await publisher('Unified listing'),other=await publisher('Unrelated reader'),db=await mf.getD1Database('DB','api');
 await db.prepare('INSERT INTO accounts(id,publisher_id,phone,created,profile_public) VALUES(?,?,?,?,1)').bind(p.publisher_id,p.publisher_id,'test-unified-'+p.publisher_id,Math.floor(Date.now()/1000)).run();
 for(const kind of ['work','asset'])for(const listing of ['unlisted','profile','public']){
  const slug='unified-'+kind+'-'+listing,data=Buffer.from('original-file-'+slug),pack=kind==='work'?pkg(slug):{files:{'file.txt':data},body:{kind,slug,title:slug,files:[{path:'file.txt',bytes:data.length,sha256:digest(data)}]}};
  const upload=await start(p,pack,{listing});assert.equal(upload.status,201,JSON.stringify(upload.data));await send(p,upload.data,pack);const result=await commit(p,upload.data);assert.equal(result.status,201,JSON.stringify(result.data));const w=result.data.work;assert.equal(w.listing,listing);
  const fileUrl=upload.data.content_base+(kind==='work'?'image.png':'file.txt'),expected=kind==='work'?'original-image-bytes':data.toString();
  for(const token of [undefined,other.token]){const read=await call('GET',w.url,undefined,token);assert.equal(read.status,200);assert.equal((await call('HEAD',w.url,undefined,token)).status,200);}
  assert.equal((await call('GET',fileUrl)).data,expected);const range=await call('GET',fileUrl,undefined,undefined,{Range:'bytes=0-7'});assert.equal(range.status,206);assert.equal(range.data,expected.slice(0,8));
  for(const old of ['/v1/me/files/'+w.version+'/'+(kind==='work'?'image.png':'file.txt'),...(kind==='asset'?['/v1/me/assets/'+w.id]:[])]){assert.equal((await call('GET',old)).data,expected);assert.equal((await call('HEAD',old)).status,200);assert.equal((await call('GET',old,undefined,undefined,{Range:'bytes=0-7'})).status,206);}
  const materials=(await call('GET','/v1/materials')).data.items;assert.equal(materials.some(f=>f.id.startsWith(w.version+'/')),listing==='public');
  const profile=(await call('GET','/v1/profiles/'+p.publisher_id)).data;assert.equal((kind==='work'?profile.items:profile.materials).some(x=>(x.work_id||x.id)===w.id),listing!=='unlisted');
  const change={expected_version:w.version,expected_revision:w.revision,listing:'profile'};
  assert.equal((await call('POST','/v1/me/works/'+w.id+'/listing',change)).status,401);assert.equal((await call('POST','/v1/me/works/'+w.id+'/listing',change,other.token)).status,404);
  const updated=await call('POST','/v1/me/works/'+w.id+'/listing',change,p.token);assert.equal(updated.status,200);assert.equal(updated.data.version,w.version);assert.equal(updated.data.url,w.url);assert.equal((await call('POST','/v1/me/works/'+w.id+'/listing',change,p.token)).status,409);
  // A draft prepared before a listing change cannot undo that change.
  const draft=await start(p,pack,{work_id:w.id,expected_version:w.version});assert.equal(draft.status,201);await send(p,draft.data,pack);
  const fresh=updated.data;const hidden=await call('POST','/v1/me/works/'+w.id+'/listing',{expected_version:w.version,expected_revision:fresh.revision,listing:'unlisted'},p.token);assert.equal(hidden.status,200);assert.equal((await commit(p,draft.data)).status,409);
  assert.equal((await call('POST','/v1/me/works/'+w.id+'/delete',{expected_version:w.version,confirm:true},p.token)).data.deleted,true);
  assert.equal((await call('GET',w.url)).status,404);assert.equal((await call('GET',fileUrl)).status,404);assert.equal((await call('GET','/v1/me/files/'+w.version+'/'+(kind==='work'?'image.png':'file.txt'))).status,404);
 }
 assert.equal((await call('GET','/v1/me',undefined,p.token)).data.reserved_bytes,0);
 // Disabling the homepage hides lists but leaves content links independent.
 await db.prepare('UPDATE accounts SET profile_public=0 WHERE publisher_id=?').bind(p.publisher_id).run();assert.equal((await call('GET','/v1/profiles/'+p.publisher_id)).status,404);
});

test('asset updates inherit listing, legacy parameters map to listing and conflicting choices are rejected',async()=>{
 const p=await publisher('Asset compatibility'),bytes=Buffer.from('unchanged bytes');
 const make=slug=>({files:{'file.txt':bytes},body:{kind:'asset',slug,title:slug,files:[{path:'file.txt',bytes:bytes.length,sha256:digest(bytes)}]}});
 await call('POST','/v1/me/preferences',{default_listing:'profile'},p.token);
 const pack=make('asset-compatibility'),up=await start(p,pack);await send(p,up.data,pack);let w=(await commit(p,up.data)).data.work;assert.equal(w.listing,'profile');
 await call('POST','/v1/me/preferences',{default_listing:'public'},p.token);const next=await start(p,pack,{work_id:w.id,expected_version:w.version});await send(p,next.data,pack);const changed=(await commit(p,next.data)).data.work;assert.equal(changed.listing,'profile');assert.equal(changed.url,w.url);w=changed;
 const alias=await call('POST','/v1/me/works/'+w.id+'/visibility',{expected_version:w.version,expected_revision:w.revision,visibility:'private'},p.token);assert.equal(alias.status,200,JSON.stringify(alias.data));assert.equal(alias.data.listing,'unlisted');assert.equal((await call('GET',w.url)).status,200);
 assert.equal((await start(p,make('conflict'),{visibility:'private',listing:'public'})).status,400);
 assert.equal((await start(p,make('invalid-mode'),{listing:'private'})).status,400);
 const legacy=await start(p,make('legacy-asset'),{visibility:'private'});assert.equal(legacy.status,201);await send(p,legacy.data,make('legacy-asset'));const done=await commit(p,legacy.data);assert.equal(done.data.work.listing,'unlisted');assert.equal((await call('GET',done.data.work.url)).status,200);
});

test('legacy asset migration is idempotent and preserves history, URLs and original bytes',async()=>{
 const p=await publisher('Migration'),data=Buffer.from('migration-original'),pack={files:{'old.txt':data},body:{kind:'asset',slug:'migration-asset',title:'Migration',listing:'unlisted',files:[{path:'old.txt',bytes:data.length,sha256:digest(data)}]}};
 const first=await start(p,pack);await send(p,first.data,pack);let w=(await commit(p,first.data)).data.work;
 const second=await start(p,pack,{work_id:w.id,expected_version:w.version});await send(p,second.data,pack);w=(await commit(p,second.data)).data.work;
 const db=await mf.getD1Database('DB','api');
 await db.batch([db.prepare("UPDATE works SET listing='public',metadata=json_set(metadata,'$.visibility','private') WHERE id=?").bind(w.id),db.prepare("UPDATE versions SET metadata=json_set(json_remove(metadata,'$.listing'),'$.visibility','private') WHERE work_id=?").bind(w.id)]);
 const migration=readFileSync(path.join(ROOT,'migrations/0008_unified_listing.sql'),'utf8').split(';').map(x=>x.trim()).filter(Boolean);await db.batch(migration.map(q=>db.prepare(q)));
 const migrated=await db.prepare('SELECT * FROM works WHERE id=?').bind(w.id).first();assert.equal(migrated.listing,'unlisted');assert.equal(migrated.revision,w.revision+1);assert.equal(migrated.current_version,w.version);assert.equal(JSON.parse(migrated.metadata).visibility,undefined);
 for(const v of [first.data.upload_id,second.data.upload_id]){const row=await db.prepare('SELECT metadata FROM versions WHERE id=?').bind(v).first();assert.equal(JSON.parse(row.metadata).listing,'unlisted');assert.equal(JSON.parse(row.metadata).visibility,undefined);assert.equal((await call('GET','/v1/me/files/'+v+'/old.txt')).data,data.toString());}
 assert.equal((await call('GET','/v1/me/assets/'+w.id)).data,data.toString());assert.equal((await call('GET',w.url)).data,data.toString());assert(!(await call('GET','/v1/materials')).data.items.some(x=>x.id.startsWith(w.version+'/')));
 await db.batch(migration.map(q=>db.prepare(q)));assert.equal((await db.prepare('SELECT revision FROM works WHERE id=?').bind(w.id).first()).revision,migrated.revision);
});

test('portable CLI uploads three asset listings, preserves update range and supports legacy listing alias',async()=>{
 const fs=require('node:fs'),os=require('node:os'),{promisify}=require('node:util'),execFile=promisify(require('node:child_process').execFile),tmp=fs.mkdtempSync(path.join(os.tmpdir(),'texopub-listing-cli-')),p=await publisher('Unified CLI');
 try{
  const api=(await mf.ready).origin,creds=path.join(tmp,'credential.json'),file=path.join(tmp,'sample.txt'),client=path.join(ROOT,'../scripts/remote_publish.py');fs.writeFileSync(creds,JSON.stringify({api,token:p.token}),{mode:0o600});fs.writeFileSync(file,'cli-original-bytes');
  const run=async(...args)=>JSON.parse((await execFile('python3',[client,'--credential',creds,...args],{cwd:tmp})).stdout);
  for(const listing of ['unlisted','profile','public']){
   const args=['assets',file,'--slug','cli-'+listing,'--title','CLI '+listing,'--listing',listing],pub=await run(...args);assert.equal(pub.listing,listing);assert.equal((await call('GET',pub.url)).data,'cli-original-bytes');
   const fresh=await run('show',pub.work_id),changed=await run('listing',pub.work_id,'--expected-version',pub.version,'--expected-revision',String(fresh.revision),'--listing','profile');assert.equal(changed.version,pub.version);
   const updated=await run('assets',file,'--slug','cli-'+listing,'--title','CLI update','--update');assert.equal(updated.listing,'profile');assert.equal(updated.url,pub.url);
   const current=await run('show',pub.work_id),legacy=await run('asset-visibility',pub.work_id,'--expected-version',current.version,'--expected-revision',String(current.revision),'--visibility','private');assert.equal(legacy.listing,'unlisted');assert.equal((await call('GET',legacy.url)).status,200);
  }
  await assert.rejects(()=>run('assets',file,'--slug','cli-conflict','--title','Conflict','--public','--listing','profile'));
 }finally{fs.rmSync(tmp,{recursive:true,force:true});}
});
