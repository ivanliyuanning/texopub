// Offline DOM tests for generated HTML; this does not control a browser.
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { JSDOM } = require('../.tools/node_modules/jsdom');
const path = require('node:path');
const html = fs.readFileSync(path.join(__dirname, '../build/current/site/index.html'), 'utf8');
const errors = [];
(async()=>{
const dom = new JSDOM(html, {
  url: 'https://library.example/',
  runScripts: 'dangerously',
  beforeParse(window) {
    window.fetch=async()=>({ok:true,json:async()=>({items:JSON.parse(fs.readFileSync('service/legacy.json','utf8')).works})});
    window.HTMLElement.prototype.scrollIntoView = function() {};
    window.addEventListener('error', e => errors.push(e.message));
  }
});
assert.equal(dom.window.document.querySelectorAll('.directory-entry').length,0,'Cloud build must not embed a stale public work snapshot');
await new Promise(resolve=>setImmediate(resolve));
const doc = dom.window.document;
const q = doc.querySelector('#work-search');
const form = doc.querySelector('#format-filter');
const visible = () => [...doc.querySelectorAll('.directory-entry')].filter(e => !e.hidden);
const clickCategory = id => doc.querySelector(`[data-category="${id}"]`).click();
const input = text => {q.value = text; q.dispatchEvent(new dom.window.Event('input'));};
assert.equal(visible().length, 1);
assert.equal(doc.querySelectorAll('.topic-group').length, 8);
assert.equal(doc.querySelectorAll('.directory-entry').length, 1);
clickCategory('humanities/museums');
assert.equal(visible().length, 1);
assert.equal(doc.querySelector('#results-heading').textContent, '博物馆与文物');
assert.equal(new URL(dom.window.location.href).searchParams.get('category'), 'humanities/museums');
assert.equal(doc.querySelector('[data-category="humanities/museums"]').getAttribute('aria-pressed'), 'true');
clickCategory('technology/software');
assert.equal(visible().length, 0);
assert.equal(doc.querySelector('#no-results').hidden, false);
assert.match(doc.querySelector('#no-results p').textContent, /第一份作品/);
doc.querySelector('#reset-filters').click();
input('苏州博物馆');
assert.equal(visible().length, 1);
input('不存在的词');
assert.equal(visible().length, 0);
assert.match(doc.querySelector('#no-results p').textContent, /缩短关键词/);
doc.querySelector('#reset-filters').click();
form.value = 'tool';
form.dispatchEvent(new dom.window.Event('change'));
assert.equal(visible().length, 0);
form.value = 'guide';
form.dispatchEvent(new dom.window.Event('change'));
assert.equal(visible().length, 1);
doc.querySelector('#reset-filters').click();
assert.equal(q.value, '');
assert.equal(form.value, '');
assert.equal(visible().length, 1);
assert.equal(doc.querySelector('#reset-filters').hidden, true);
dom.window.history.replaceState(null, '', '?category=humanities%2Fmuseums&q=苏博&format=guide');
dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate'));
assert.equal(visible().length, 1);
assert.equal(form.value, 'guide');
assert.equal(q.value, '苏博');
const iconUrls=[...doc.querySelectorAll('link[rel=icon]')].map(n=>new URL(n.getAttribute('href'),'https://texopub.com'));
for(const path of ['/favicon.svg','/favicon.ico','/brand/mark-32.png']){
 assert.ok(iconUrls.some(url=>url.pathname===path&&url.searchParams.has('v')));
}
assert.equal(doc.querySelector('.entry-icon').getAttribute('src'), JSON.parse(fs.readFileSync(path.join(__dirname, '../library.json'), 'utf8')).works[0].icon);
assert.deepEqual(errors, []);
console.log(JSON.stringify({passed:true, assertions:'initial directory, taxonomy counts, leaf filter, empty state, query, format, reset, deep links, favicon, no JS errors', works:visible().length}));
dom.window.close();

})().catch(error=>{console.error(error);process.exitCode=1;});
