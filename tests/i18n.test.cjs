const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {open,settle,submit,pid}=require('./helpers/community.cjs');
test('English discovery translates platform and categories while preserving user content and safe search',async()=>{
 const c=await open('/',{english:true});assert.equal(c.d.querySelector('h1').textContent,'Humans and AI, creating together.');assert.equal(c.d.querySelector('[data-language]').textContent,'中文');assert.match(c.d.querySelector('.work-meta').textContent,/Literature and reading/);assert.equal(c.d.querySelector('.work-title').textContent,'实际作品');assert.match(c.d.querySelector('.creator-name').textContent,/真实作者/);assert.equal(c.d.querySelector('.creator-name script'),null);
 c.d.querySelector('#category-toggle').click();assert.match(c.d.querySelector('#category-panel').textContent,/Technology and AI/);const search=c.d.querySelector('#work-search');search.value='Literature';search.dispatchEvent(new c.w.Event('input'));assert.equal(c.d.querySelector('#result-count').textContent,'1 works');assert(!c.calls.some(x=>x.body));c.close();
});
test('all public and owner routes have English controls and original private material names',async()=>{
 for(const path of ['/space/','/space/works/','/space/materials/','/space/settings/','/space/settings/keys/','/space/account/','/publish/','/about/','/materials/','/plugins/texopub/','/account-privacy/','/u/'+pid+'/']){
  const c=await open(path,{english:true});assert.equal(c.d.querySelector('#retry-load'),null,path);assert(c.d.querySelector('[data-language]'),path);assert.equal(c.d.querySelector('.global-nav a').textContent,'Discover',path);
  if(path==='/publish/')assert(c.d.querySelector('a[href="https://texopub.com/for-ai/en/SKILL.md"]'));
  if(path==='/space/materials/')assert.match(c.d.querySelector('.material').textContent,/私有笔记.txt/);
  if(path==='/space/works/')assert.match(c.d.querySelector('main').textContent,/Unlisted/);
  if(path==='/account-privacy/')assert.match(c.d.querySelector('main').textContent,/An email alone cannot create/);
  c.close();
 }
});
test('English authentication preserves account controls, code flow and safe return paths',async()=>{
 const c=await open('/login/?next=https%3A%2F%2Fevil.example',{english:true,logged:false});assert.match(c.d.body.textContent,/Mainland China/);assert(!c.calls.some(x=>x.p==='auth/challenge'));c.d.querySelector('#login-subject').value='13900001111';c.d.querySelector('#send-login-code').click();await settle();assert.equal(c.d.querySelector('#account-message').textContent,'Verification code sent.');c.d.querySelector('#login-code').value='123456';await submit(c,'#login-form');assert.equal(c.w.location.pathname,'/space/');c.close();
 const expired=await open('/space/',{english:true,logged:false});assert.match(expired.d.querySelector('h1').textContent,/Sign in/);assert(!expired.calls.some(x=>x.p==='me/works'));expired.close();
});
test('language preference validates overrides, persists without localStorage and preserves query/fragment',async()=>{
 const src=fs.readFileSync('templates/community/locale.mjs','utf8');let data;
 const saved={location:global.location,document:global.document,navigator:Object.getOwnPropertyDescriptor(global,'navigator')};
 let assigned;global.document={cookie:'texopub_lang=zh'};global.location={href:'https://texopub.com/?q=guide&lang=en#top',search:'?q=guide&lang=en',protocol:'https:',assign:x=>assigned=x};Object.defineProperty(global,'navigator',{value:{language:'zh-CN'},configurable:true});data=await import('data:text/javascript,'+encodeURIComponent(src));assert.equal(data.preferredLanguage(),'en');global.location.search='?lang=evil';assert.equal(data.preferredLanguage(),'zh');data.saveLanguage('en');assert.match(global.document.cookie,/texopub_lang=en/);assert.match(global.document.cookie,/Secure/);const before=global.document.cookie;data.saveLanguage('invalid');assert.equal(global.document.cookie,before);
 data.switchLanguage();assert.match(assigned,/q=guide/);assert.match(assigned,/#top/);assert.match(assigned,/lang=zh/);global.location=saved.location;global.document=saved.document;if(saved.navigator)Object.defineProperty(global,'navigator',saved.navigator);else delete global.navigator;
});
