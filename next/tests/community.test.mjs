import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {seed,creatorName,partnerName,avatarCells,safeUrl,escape} from '../src/identity.mjs';
import {icon} from '../src/icons.mjs';
const require=createRequire(import.meta.url),{JSDOM}=require('../../.tools/node_modules/jsdom');
const lexicon=JSON.parse(await readFile(new URL('../data/identity-lexicon.json',import.meta.url)));
const fixtures={};for(const [file,key] of [['catalog.json','catalog'],['materials.json','materials'],['identity-lexicon.json','lexicon']])fixtures[key]=JSON.parse(await readFile(new URL('../data/'+file,import.meta.url)));
fixtures.taxonomy=JSON.parse(await readFile(new URL('../../taxonomy.json',import.meta.url)));
const source=(await readFile(new URL('../src/app.mjs',import.meta.url),'utf8')).replace(/^import .*;\n/gm,'');
async function open(path='/',options={}){
 const dom=new JSDOM('<div id="app"></div><dialog id="handoff"></dialog>',{url:'http://localhost:8770'+path,runScripts:'outside-only'});const w=dom.window,calls=[],copies=[];
 w.testDeps={seed,creatorName,partnerName,avatarCells,safeUrl,escape,icon};w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};
 w.HTMLDialogElement.prototype.showModal=function(){this.open=true};w.HTMLDialogElement.prototype.close=function(){this.open=false;this.dispatchEvent(new w.Event('close'))};
 Object.defineProperty(w.navigator,'clipboard',{value:{writeText:async text=>copies.push(text)}});
 w.fetch=async(url,init)=>{calls.push({url,init});if(options.fail)throw Error('offline');const key=String(url).includes('identity-')?'lexicon':String(url).includes('taxonomy')?'taxonomy':String(url).includes('materials')?'materials':'catalog';const data=structuredClone(fixtures[key]);if(options.malicious&&key==='catalog'){data.items[0].title='<img src=x onerror="window.compromised=true">';data.items[0].summary='<script>evil()</script>'}return {ok:true,json:async()=>data}};
 await w.eval('(async()=>{const {seed,creatorName,partnerName,avatarCells,safeUrl,escape:e,icon:i}=globalThis.testDeps;'+source+'})()');
 return {dom,w,d:w.document,calls,copies,close:()=>dom.window.close()};
}
function input(ctx,selector,value){const el=ctx.d.querySelector(selector);el.value=value;el.dispatchEvent(new ctx.w.Event('input',{bubbles:true}))}
test('identity defaults remain stable; explicit identity wins and missing model is optional',()=>{
 assert.equal(creatorName('same',null,lexicon),creatorName('same','新创作者',lexicon));assert.equal(creatorName('same','我自己的名字',lexicon),'我自己的名字');assert.equal(partnerName({application:'Codex'}),'Codex');assert.equal(partnerName({nickname:'伙伴甲',application:'Codex'}),'伙伴甲');assert.equal(partnerName({}),'AI 伙伴');assert.deepEqual(avatarCells('same'),avatarCells('same'));assert(avatarCells('same').length>0);assert.equal(safeUrl('javascript:alert(1)'),'');
 const all=lexicon.prefixes.flatMap(a=>lexicon.roles.map(b=>a+b));assert.equal(new Set(all).size,384);assert(all.every(n=>n.length>=3&&n.length<=8));
});
test('discovery supports real taxonomy, keyword search and empty-category recovery',async()=>{
 const c=await open();assert.equal(c.d.querySelectorAll('[data-work]').length,3);assert.equal(c.d.querySelectorAll('.category-group').length,8);assert.equal(c.d.querySelectorAll('.category-options button').length,36);
 c.d.querySelector('[data-category-select="science/nature"]').click();assert.equal(c.d.querySelector('#result-count').textContent,'0 份作品');assert.equal(c.d.querySelector('#category-panel').hidden,true);assert.equal(c.d.querySelector('#empty-results').hidden,false);
 c.d.querySelector('[data-clear-category]').click();assert.equal(c.d.querySelector('#result-count').textContent,'3 份作品');
 input(c,'#work-search','罪与罚');assert.equal(c.d.querySelector('#result-count').textContent,'1 份作品');input(c,'#work-search','nothing matches');assert.equal(c.d.querySelector('#result-count').textContent,'0 份作品');c.d.querySelector('[data-reset-search]').click();assert.equal(c.d.querySelector('#result-count').textContent,'3 份作品');c.close();
});
test('creator metadata remains text and fallback covers remain usable',async()=>{
 const c=await open('/',{malicious:true});assert.equal(c.d.querySelector('.work-title img'),null);assert.equal(c.d.querySelector('.work-summary script'),null);assert.match(c.d.querySelector('.work-title').textContent,/<img/);assert(c.d.querySelectorAll('.default-cover').length>=2);const im=c.d.querySelector('.cover-image');im.dispatchEvent(new c.w.Event('error'));assert.equal(c.d.querySelectorAll('.cover-image').length,0);assert.equal(c.d.querySelectorAll('.default-cover').length,3);c.close();
});
test('profile differentiates human and AI identity and omits empty biography/model blocks',async()=>{
 const c=await open('/u/preview/');assert.match(c.d.querySelector('.identity-role').textContent,/人类创作者/);assert.match(c.d.querySelector('.partner-person').textContent,/Codex/);assert.equal(c.d.querySelectorAll('.partner-person .icon').length,1);assert(!c.d.querySelector('#main').textContent.includes('模型未提供'));assert(!c.d.querySelector('.profile-bio'));c.close();
});
test('workspace explains AI editing inline without action or copy controls',async()=>{
 const c=await open('/space/works/');assert.equal(c.d.querySelectorAll('[data-ai],[data-copy-url],.work-card button').length,0);assert.equal(c.d.querySelectorAll('select').length,0);assert.equal(c.d.querySelectorAll('.ai-notice').length,1);assert.match(c.d.querySelector('.ai-notice').textContent,/不提供手动修改和编辑功能/);assert.match(c.d.querySelector('.ai-notice').textContent,/作品标题或网址/);assert(c.calls.every(x=>!x.init?.method||x.init.method==='GET'));assert.equal(c.d.querySelectorAll('.work-card').length,3);c.close();
});
test('publish methods and tasks produce different prompts, with no pretend completion',async()=>{
 const c=await open('/publish/');c.d.querySelector('[data-publish-kind="asset"]').click();assert.match(c.d.querySelector('#publish-prompt').value,/默认私有/);c.d.querySelector('[data-publish-method="agent"]').click();assert.match(c.d.querySelector('.publish-stage').textContent,/读取公开 Skill/);assert.equal(c.d.querySelector('[data-copy-publish]'),null);assert.match(c.d.querySelector('.publish-explanation').textContent,/把具体需求告诉已连接的 AI/);assert(c.calls.every(x=>!x.init?.method));assert.equal(c.d.querySelectorAll('[data-ai]').length,0);c.close();
});
test('login preview sends no OTP and clearly separates entry into preview workspace',async()=>{
 const c=await open('/login/');const initial=c.calls.length;c.d.querySelector('[data-preview-code]').click();assert.match(c.d.querySelector('#login-feedback').textContent,/不会发送验证码/);c.d.querySelector('#login-preview').dispatchEvent(new c.w.Event('submit',{bubbles:true,cancelable:true}));assert.equal(c.calls.length,initial);assert.match(c.d.querySelector('#login-feedback').textContent,/没有提交手机号或验证码/);c.close();
});
test('preview load failure has retry rather than a stale successful-looking gallery',async()=>{
 const c=await open('/',{fail:true});assert.equal(c.d.querySelectorAll('[data-work]').length,0);assert(c.d.querySelector('#retry-load'));assert.match(c.d.querySelector('h1').textContent,/无法读取/);c.close();
});
test('product pages have one passive contextual notice and local private fixture assets',async()=>{
 for(const path of ['/','/u/preview/','/space/','/space/works/','/space/materials/','/space/settings/','/space/settings/keys/','/materials/','/about/']){const c=await open(path);assert(c.d.querySelector('main'));assert.equal(c.d.querySelector('#retry-load'),null,path);assert.equal(c.d.querySelectorAll('[data-ai],[data-copy-url],[data-copy-handoff]').length,0,path);assert.equal(c.d.querySelectorAll('.ai-notice').length,1,path);const notice=c.d.querySelector('.ai-notice');assert.equal(notice.querySelectorAll('button,textarea,input').length,0);assert.equal(notice.nextElementSibling,null);assert.equal(notice.querySelector('a').getAttribute('href'),'/publish/');const text=notice.textContent;if(path==='/space/settings/')assert.match(text,/默认展示范围/);if(path==='/space/settings/keys/')assert.match(text,/登录和授权由你本人完成/);if(path==='/space/materials/')assert.match(text,/素材名称/);if(path==='/space/materials/'){assert.equal(c.d.querySelectorAll('.material').length,1);assert.match(c.d.querySelector('.material-preview').getAttribute('href'),/^\/data\//)}c.close()}
});
