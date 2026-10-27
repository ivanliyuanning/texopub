const SITE=process.env.TEXOPUB_TEST_SITE||'build/current/site';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {open}=require('./helpers/community.cjs');
test('publishing is a static guide with both supported connection paths and no manual upload or clipboard controls',async()=>{
 const c=await open('/publish/');assert.equal(c.d.querySelectorAll('main button,input,textarea,select').length,0);assert(c.d.querySelector('a[href="https://texopub.com/plugins/texopub/"]'));assert(c.d.querySelector('a[href="https://texopub.com/for-ai/SKILL.md"]'));assert(!c.calls.some(x=>x.p.startsWith('me/')));assert.equal(c.calls.filter(x=>x.body).length,0);c.close();
});
test('for-ai and publish share the approved application, not an old manual editing workflow',async()=>{
 assert.equal(fs.readFileSync(SITE+'/for-ai/index.html','utf8'),fs.readFileSync(SITE+'/publish/index.html','utf8'));const c=await open('/for-ai/');assert.match(c.d.querySelector('main').textContent,/发布网页、收录网站或上传素材/);assert.equal(c.d.querySelectorAll('main button').length,0);c.close();
});
test('guide explains unified listing and anonymous asset links',async()=>{
 const c=await open('/publish/');const text=c.d.querySelector('.help-details').textContent;assert.match(text,/三档链接均无需登录即可访问/);assert.match(text,/网页和独立素材/);c.close();
});
test('packaged clients expose the same new identity, partner and asset permission capabilities',()=>{
 const client=fs.readFileSync(SITE+'/downloads/commonplace.py','utf8');for(const marker of ['profile-update','--ai-partners','asset-visibility','--expected-revision'])assert(client.includes(marker));const manifest=JSON.parse(fs.readFileSync(SITE+'/for-ai/manifest.json'));assert.equal(manifest.version,'2.3.1');assert.equal(manifest.contains_credentials,false);
});
