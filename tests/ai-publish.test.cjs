// Offline interaction tests; no browser is controlled here.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('../.tools/node_modules/jsdom');
const html=readFileSync('build/current/site/publish/index.html','utf8');
const origin='https://co-created-library-lyn.pages.dev';
const tick=()=>new Promise(resolve=>setImmediate(resolve));

test('AI prompt copies complete installation instructions without manual upload controls',async()=>{
 let copied='';
 const dom=new JSDOM(html,{url:origin+'/publish/',runScripts:'dangerously',beforeParse(w){w.navigator.clipboard={writeText:async text=>{copied=text;}};}});
 const d=dom.window.document;
 assert.equal(d.querySelectorAll('input[type=file],form,[ondrop]').length,0);
 assert.equal(d.querySelector('#ai-publish-prompt').readOnly,true);
 d.querySelector('#copy-ai-prompt').click();await tick();
 assert.equal(copied,d.querySelector('#ai-publish-prompt').value);
 const manifest=JSON.parse(readFileSync('service/public/for-ai/manifest.json','utf8'));
 assert.ok(copied.includes(manifest.archive_url));
 assert.match(copied,/for-ai\/SKILL\.md/);
 assert.match(copied,/明确指定的网页发布到我的空间/);
 assert.match(d.querySelector('#prompt-feedback').textContent,/已复制/);
 assert.equal(d.querySelector('nav a[href="/publish/"]').textContent,'发布 ＋');
 assert.equal(d.querySelector('.skill-links:not(.publish-modes) a[href="/publish/?kind=asset"]').textContent,'仅上传素材 →');
 dom.window.close();
});

test('denied clipboard selects full prompt and gives truthful manual copy fallback',async()=>{
 const dom=new JSDOM(html,{url:origin+'/publish/',runScripts:'dangerously',beforeParse(w){w.navigator.clipboard={writeText:async()=>{throw Error('denied');}};}});
 const d=dom.window.document,field=d.querySelector('#ai-publish-prompt');
 d.querySelector('#copy-ai-prompt').click();await tick();
 assert.equal(field.selectionStart,0);assert.equal(field.selectionEnd,field.value.length);
 assert.match(d.querySelector('#prompt-feedback').textContent,/已选中.*Ctrl\+C/);
 assert.doesNotMatch(d.querySelector('#prompt-feedback').textContent,/已复制/);
 dom.window.close();
});

test('material entry uses material prompt, while for-ai page shares the same onboarding',()=>{
 const dom=new JSDOM(html,{url:origin+'/publish/?kind=asset',runScripts:'dangerously'});
 assert.match(dom.window.document.querySelector('#ai-publish-prompt').value,/明确指定的图片、音视频或文档上传到我的私有素材库/);
 assert.equal(readFileSync('build/current/site/for-ai/index.html','utf8'),html);
 dom.window.close();
});
test('external listing entry copies a link-only submission prompt',async()=>{
 let copied='';const dom=new JSDOM(html,{url:origin+'/publish/?kind=external',runScripts:'dangerously',beforeParse(w){w.navigator.clipboard={writeText:async value=>{copied=value;}};}});
 const d=dom.window.document;assert(d.querySelector('a[href="/publish/?kind=external"]'));assert.match(d.querySelector('#publish-title').textContent,/已有网站/);assert.equal(d.querySelector('.publish-modes [aria-current="page"]').dataset.kind,'external');assert.match(d.querySelector('.demo-tasks').textContent,/收录网址/);d.querySelector('#copy-ai-prompt').click();await tick();assert.match(copied,/已有网站收录/);assert.match(copied,/不复制或重新部署网站/);assert.match(d.querySelector('#prompt-feedback').textContent,/网站网址/);assert.equal(d.querySelectorAll('input[type=file]').length,0);dom.window.close();
});
