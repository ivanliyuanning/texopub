const {test,before,after}=require('node:test');
const assert=require('node:assert/strict'),fs=require('node:fs'),{createHash,randomBytes}=require('node:crypto');
const {Miniflare,convertV4MiniflareOptions}=require('../../.tools/node_modules/miniflare'),esbuild=require('../../.tools/node_modules/esbuild');
const app='https://app.example',sha=x=>createHash('sha256').update(x).digest('hex');
let mf,db,api,content,seq=0;
before(async()=>{
 const build=await esbuild.build({entryPoints:['service/worker.mjs'],write:false,bundle:true,format:'esm',loader:{'.html':'text'}});
 const script=build.outputFiles[0].text;
 mf=new Miniflare(convertV4MiniflareOptions({workers:[{name:'api',routes:['app.example/*'],script,modules:true,compatibilityDate:'2026-10-22',d1Databases:{DB:'community'},r2Buckets:{FILES:'community-files'},bindings:{ROLE:'api',APP_ORIGIN:app,CONTENT_ORIGIN:'https://content.example'}},{name:'content',script,modules:true,compatibilityDate:'2026-10-22',d1Databases:{DB:'community'},r2Buckets:{FILES:'community-files'},bindings:{ROLE:'content',CONTENT_ORIGIN:'https://content.example'}}]}));
 db=await mf.getD1Database('DB','api');api=await mf.getWorker('api');content=await mf.getWorker('content');
 await db.batch(JSON.parse(fs.readFileSync('service/schema-statements.json')).map(q=>db.prepare(q)));
});
after(async()=>mf?.dispose());
async function account(){
 const id=randomBytes(16).toString('hex'),pid=randomBytes(16).toString('hex'),token=randomBytes(32).toString('hex'),session=randomBytes(32).toString('hex'),read=randomBytes(32).toString('hex'),at=Math.floor(Date.now()/1000);
 await db.batch([db.prepare('INSERT INTO publishers(id,name,token_hash,created) VALUES(?,?,?,?)').bind(pid,'原始名字',sha(token),at),db.prepare('INSERT INTO accounts(id,publisher_id,phone,created) VALUES(?,?,?,?)').bind(id,pid,'synthetic-'+id,at),db.prepare('INSERT INTO login_sessions(token_hash,account_id,created,expires) VALUES(?,?,?,?)').bind(sha(session),id,at,at+3600),db.prepare('INSERT INTO api_keys(id,publisher_id,name,token_hash,prefix,scope,created,expires) VALUES(?,?,?,?,?,?,?,?)').bind(randomBytes(16).toString('hex'),pid,'read-only',sha(read),'prefix','read',at,at+3600)]);
 return {id,pid,token,read,cookie:'__Host-texopub='+session};
}
async function call(path,body,token,headers={}){
 const r=await api.fetch(app+'/api'+path,{method:body===undefined?'GET':'POST',headers:{...(body===undefined?{}:{'Content-Type':'application/json'}),...(token?{Authorization:'Bearer '+token}:{}),...headers},body:body===undefined?undefined:JSON.stringify(body)});
 const raw=await r.text();let data;try{data=JSON.parse(raw)}catch{data=raw}return {status:r.status,data,headers:r.headers};
}
const browser=a=>({Cookie:a.cookie,Origin:app,'X-TexoPub-Request':'space'});
const icon='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M2 2h20v20H2z"/></svg>';
async function publish(a,extra={},old){
 const slug=old?.slug||'community-'+(++seq),files={'index.html':'<!doctype html><html><head><title>Community</title></head><body>original bytes</body></html>','icon.svg':icon,...(extra.cover?{[extra.cover]:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/></svg>'}:{})};
 const body={slug,title:'真实作品测试',category_id:'technology/software',format:'tool',entry:'index.html',icon:'icon.svg',idempotency_key:'community-'+(++seq),files:Object.entries(files).map(([path,text])=>({path,bytes:Buffer.byteLength(text),sha256:sha(text)})),...(old?{work_id:old.id,expected_version:old.version}:{}),...extra};
 const prepared=await call('/v1/uploads',body,a.token);assert.equal(prepared.status,201,JSON.stringify(prepared.data));
 for(const f of prepared.data.files){const text=files[f.path];const r=await api.fetch(app+f.upload_path,{method:'PUT',headers:{Authorization:'Bearer '+a.token,'Content-Length':String(Buffer.byteLength(text))},body:text});assert.equal(r.status,200,await r.text())}
 const done=await call(prepared.data.commit_path,{},a.token);assert.equal(done.status,201,JSON.stringify(done.data));return done.data.work;
}
test('profile writes are owned, revision checked, read-only rejected and cannot enable homepage',async()=>{
 const a=await account(),b=await account(),own=await call('/v1/me/profile',undefined,a.token);assert.equal(own.data.revision,0);assert.equal(own.data.ai_partners.length,0);assert.equal((await call('/v1/me/profile')).status,401);
 assert.equal((await call('/v1/me/profile',{expected_revision:0,name:'不能改'},a.read)).status,403);
 assert.equal((await call('/v1/me/profile',{expected_revision:0,public:true},a.token)).status,400);
 const results=await Promise.all([call('/v1/me/profile',{expected_revision:0,name:'甲',bio:'真实简介'},a.token),call('/v1/me/profile',{expected_revision:0,name:'乙'},a.token)]);assert.deepEqual(results.map(x=>x.status).sort(),[200,409]);
 const saved=await call('/v1/me/profile',undefined,a.token);assert.equal(saved.data.revision,1);assert.equal((await call('/v1/me/profile',undefined,b.token)).data.name,'原始名字');assert.equal((await call('/v1/profiles/'+a.pid)).status,404);
 assert([401,403].includes((await call('/v1/account/profile',{public:true},a.token)).status));
 assert.equal((await call('/v1/account/profile',{public:true},undefined,browser(a))).status,200);
 const publicData=(await call('/v1/profiles/'+a.pid)).data;assert.equal(publicData.name,saved.data.name);for(const key of ['phone','email','token','keys'])assert.equal(publicData[key],undefined);
});
test('identity defaults are persistent and avatars reset without exposing private file URLs',async()=>{
 const a=await account();let p=(await call('/v1/me/profile',{expected_revision:0,name:null,bio:'',avatar_url:''},a.token)).data;
 assert.notEqual(p.name,'新创作者');assert.equal(p.name_source,'generated');assert.equal((await call('/v1/me/profile',undefined,a.token)).data.name,p.name);assert.equal((await db.prepare('SELECT name FROM publishers WHERE id=?').bind(a.pid).first()).name,p.name);
 const image=await call('/v1/avatars/human/'+a.pid+'.svg');assert.equal(image.status,200);assert.match(image.data,/<svg/);assert.doesNotMatch(image.data,/<script|onload=|foreignObject/);
 for(const url of ['javascript:alert(1)','https://app.example/api/v1/me/files/private/a.png','http://example.com/a.png','https://user:pass@example.com/a.png'])assert.equal((await call('/v1/me/profile',{expected_revision:p.revision,avatar_url:url},a.token)).status,400);
 p=(await call('/v1/me/profile',{expected_revision:p.revision,avatar_url:'https://images.example.com/avatar.png'},a.token)).data;assert.equal(p.avatar,'https://images.example.com/avatar.png');
 p=(await call('/v1/me/profile',{expected_revision:p.revision,avatar_url:''},a.token)).data;assert.match(p.avatar,/avatars\/human\//);
});
test('AI partner registration defaults to application name, remains isolated and requires current revision',async()=>{
 const a=await account(),b=await account(),created=await call('/v1/me/ai-partners',{key:'codex',application:'Codex',expected_revision:0},a.token);assert.equal(created.status,200);assert.equal(created.data.name,'Codex');assert.equal(created.data.bio,'');assert.equal(created.data.show_on_profile,false);assert.equal(created.data.source,'self_reported');assert.equal((await call('/v1/me/ai-partners',undefined,b.token)).data.items.length,0);
 assert.equal((await call('/v1/me/ai-partners',{key:'codex',application:'Codex',expected_revision:0,name:'stale'},a.token)).status,409);
 const other=await call('/v1/me/ai-partners',{key:'codex',application:'Codex',expected_revision:0},b.token);assert.notEqual(other.data.id,created.data.id);
 const updated=await call('/v1/me/ai-partners',{key:'codex',expected_revision:created.data.revision,name:'织织'},a.token);assert.equal(updated.data.name,'织织');assert.equal(updated.data.application,'Codex');
 assert.equal((await call('/v1/me/ai-partners',{key:'codex',expected_revision:updated.data.revision,model:'not an identity field'},a.token)).status,400);
});
test('published contributions are genuine version metadata, unknown model omitted and updates preserve credits',async()=>{
 const a=await account();let w=await publish(a,{ai_partners:[{key:'codex',application:'Codex',contribution:'编写网页与交互'}]});let current=(await call('/v1/me/works/'+w.id,undefined,a.token)).data;
 assert.equal(current.ai_partners[0].name,'Codex');assert.equal(current.ai_partners[0].model,undefined);assert.equal(current.ai_partners[0].contribution,'编写网页与交互');assert.equal(current.cover_strategy,'typographic-v1');
 const partner=(await call('/v1/me/profile',undefined,a.token)).data.ai_partners[0];await call('/v1/me/ai-partners',{key:'codex',expected_revision:partner.revision,name:'我的伙伴'},a.token);
 w=await publish(a,{},w);current=(await call('/v1/me/works/'+w.id,undefined,a.token)).data;assert.equal(current.ai_partners[0].name,'我的伙伴');assert.equal(current.ai_partners[0].contribution,'编写网页与交互');
 const cleared=await publish(a,{ai_partners:[]},w);assert.equal((await call('/v1/me/works/'+cleared.id,undefined,a.token)).data.ai_partners.length,0);
});
test('unlisted credits stay out of public profiles and catalogs; explicit partner visibility does not enable a homepage',async()=>{
 const a=await account(),w=await publish(a,{listing:'unlisted',ai_partners:[{key:'private-agent',application:'Private Agent',model:'reported-model'}]});
 const enabled=await call('/v1/account/profile',{public:true},undefined,browser(a));assert.equal(enabled.status,200,JSON.stringify(enabled.data));const response=await call('/v1/profiles/'+a.pid);assert.equal(response.status,200,JSON.stringify(response.data));let profile=response.data;assert.equal(profile.items.length,0);assert.equal(profile.ai_partners.length,0);assert(!(await call('/v1/catalog')).data.items.some(x=>x.id===w.id));
 const shown=await call('/v1/me/works/'+w.id+'/listing',{expected_version:w.version,expected_revision:w.revision,listing:'profile'},a.token);assert.equal(shown.status,200);profile=(await call('/v1/profiles/'+a.pid)).data;assert.equal(profile.ai_partners.length,1);assert.equal(profile.items[0].ai_partners[0].model,'reported-model');assert(!(await call('/v1/catalog')).data.items.some(x=>x.id===w.id));
 const b=await account();await call('/v1/me/ai-partners',{key:'agent',application:'Agent',show_on_profile:true,expected_revision:0},b.token);assert.equal((await call('/v1/profiles/'+b.pid)).status,404);
});
test('old works gain no inferred AI credits and creator changes appear without rewriting content or listing',async()=>{
 const a=await account(),w=await publish(a),old=(await call('/v1/me/works/'+w.id,undefined,a.token)).data;assert.equal(old.ai_partners.length,0);await call('/v1/me/profile',{expected_revision:0,name:'新的作者'},a.token);
 const current=(await call('/v1/catalog')).data.items.find(x=>x.id===w.id);assert.equal(current.author,'新的作者');assert.equal(current.creator.name,'新的作者');assert.equal(current.version,w.version);assert.equal(current.listing,w.listing);assert.equal(current.url,w.url);assert.equal(current.ai_partners.length,0);
});
test('uploaded cover bytes remain original and malformed partner manifests do not create drafts',async()=>{
 const a=await account(),w=await publish(a,{cover:'cover.svg'});assert.equal(w.cover_strategy,'uploaded');const image=await content.fetch(w.cover);assert.equal(image.status,200);assert.match(await image.text(),/<circle/);
 const before=(await call('/v1/me/works',undefined,a.token)).data.items.length;
 const args={slug:'invalid-partner',title:'Invalid',category_id:'technology/software',icon:'icon.svg',files:[{path:'index.html',bytes:0,sha256:sha('')},{path:'icon.svg',bytes:0,sha256:sha('')}]};
 for(const ai_partners of [[{key:'x',application:'Agent',publisher_id:'other'}],[{key:'x',application:'A'},{key:'x',application:'A'}],[{key:'x',application:'A',model:'x'.repeat(121)}]])assert.equal((await call('/v1/uploads',{...args,idempotency_key:'invalid-'+(++seq),ai_partners},a.token)).status,400);
 assert.equal((await call('/v1/me/works',undefined,a.token)).data.items.length,before);
});
