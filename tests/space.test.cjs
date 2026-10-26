// Tests the shipped community app with isolated HTTP fixtures; never sends real OTPs.
const {test}=require('node:test'),assert=require('node:assert/strict');
const {open,settle,submit}=require('./helpers/community.cjs');
test('my overview and complete work list are owner scoped and cannot fallback to public materials',async()=>{
 for(const path of ['/space/','/space/works/','/space/materials/']){const c=await open(path);assert(!c.calls.some(x=>x.p==='catalog'||x.p==='materials'));assert.equal(c.d.querySelectorAll('.work-card button,.material button').length,0);assert.equal(c.d.querySelector('h1 script'),null);if(path==='/space/materials/')assert.match(c.d.querySelector('.material').textContent,/仅自己可访问/);c.close()}
});
test('login is separate and gated workspace performs no private reads',async()=>{const c=await open('/space/settings/keys/',{logged:false});assert(!c.calls.some(x=>x.p==='me/profile'||x.p==='account/keys'));assert(c.d.querySelector('.error-panel a[href^="/login/"]'));assert.equal(c.d.querySelectorAll('.ai-notice,input').length,0);c.close()});
test('homepage visibility requires a deliberate human submission; name and preferences remain AI managed',async()=>{
 const c=await open('/space/settings/');assert.equal(c.d.querySelector('#homepage-form input').checked,false);assert.equal(c.calls.filter(x=>x.body).length,0);assert.equal(c.d.querySelectorAll('input').length,1);assert.equal(c.d.querySelectorAll('select,textarea,[data-ai]').length,0);c.d.querySelector('#homepage-form input').checked=true;await submit(c,'#homepage-form');assert.deepEqual(c.calls.find(x=>x.p==='account/profile').body,{public:true});c.d.querySelector('#homepage-form input').checked=false;await submit(c,'#homepage-form');assert.equal(c.d.querySelector('#homepage-form input').checked,false);c.close();
});
test('six calendar months are default and keys can be revoked by their human owner',async()=>{
 const c=await open('/space/settings/keys/');c.d.querySelector('#key-form').elements.name.value='Agent';await submit(c,'#key-form');assert.equal(c.calls.find(x=>x.p==='account/keys'&&x.body).body.months,6);c.w.confirm=()=>false;c.d.querySelector('[data-revoke-key]').click();await settle();assert(!c.calls.some(x=>x.p.endsWith('/revoke')));c.w.confirm=()=>true;c.d.querySelector('[data-revoke-key]').click();await settle();assert(c.calls.some(x=>x.p.endsWith('/revoke')));assert.equal(c.d.querySelectorAll('[data-revoke-key]').length,0);assert.equal(c.d.querySelector('#new-key').value,'');c.close();
});
test('leaving the key screen discards a fresh credential and no clipboard operation is offered',async()=>{
 const c=await open('/space/settings/keys/');c.d.querySelector('#key-form').elements.name.value='Agent';await submit(c,'#key-form');assert(c.d.querySelector('#new-key').value);c.w.history.pushState(null,'','/space/');c.w.dispatchEvent(new c.w.PopStateEvent('popstate'));await settle();assert.equal(c.d.querySelector('#new-key'),null);c.w.history.pushState(null,'','/space/settings/keys/');c.w.dispatchEvent(new c.w.PopStateEvent('popstate'));await settle();assert.equal(c.d.querySelector('#new-key').value,'');assert.equal(c.d.querySelector('#key-reveal').hidden,true);assert(!c.d.querySelector('main').textContent.includes('复制'));c.close();
});
test('contact verification is a human-only workflow and changing the subject invalidates its challenge',async()=>{
 const c=await open('/space/account/');const form=c.d.querySelector('#bind-email-form');form.elements.subject.value='old@example.com';form.querySelector('[data-send-bind]').click();await settle();form.elements.subject.value='new@example.com';form.elements.subject.dispatchEvent(new c.w.Event('input'));form.elements.code.value='123456';await submit(c,'#bind-email-form');assert(!c.calls.some(x=>x.p==='auth/verify'));assert.match(c.d.querySelector('#account-message').textContent,/先获取验证码/);assert.equal(c.calls.find(x=>x.p==='auth/challenge').body.purpose,'email-bind');c.close();
});
test('legacy identity proof is cleared after use rather than displayed or passed to AI',async()=>{
 const c=await open('/space/account/');const form=c.d.querySelector('#import-form');form.elements.token.value='synthetic-legacy-proof';await submit(c,'#import-form');assert.equal(form.elements.token.value,'');assert(c.calls.some(x=>x.p==='account/import'&&x.body.token==='synthetic-legacy-proof'));assert(!c.d.body.textContent.includes('synthetic-legacy-proof'));c.close();
});
test('logging out all devices clears private UI and returns to real login',async()=>{
 const c=await open('/space/account/');c.d.querySelector('[data-logout-all]').click();await settle();assert(c.calls.some(x=>x.p==='account/logout-all'));assert.equal(c.w.location.pathname,'/login/');assert(c.d.querySelector('#login-form'));assert.equal(c.d.querySelectorAll('.work-card,.material').length,0);c.close();
});
