const {test}=require('node:test');const assert=require('node:assert/strict');const {readFileSync}=require('node:fs');const {JSDOM}=require('../../.tools/node_modules/jsdom');
const html=readFileSync('build/current/site/index.html','utf8');const legacy=JSON.parse(readFileSync('service/legacy.json','utf8')).works;
test('cloud works appear in navigation, counts and filters; author metadata remains text',async()=>{
 const work={id:'a'.repeat(32),title:'<script>window.bad=true</script>',summary:'New published tutorial',category_id:'technology/software',category:'技术与AI / 软件与编程',format:'tool',tags:['工具'],author:'New contributor',updated:'2026-10-22',url:'https://commonplace-content.ivanliyuanning123.workers.dev/p/a/demo/',icon:'https://commonplace-content.ivanliyuanning123.workers.dev/v/a/icon.svg'};
 const dom=new JSDOM(html,{url:'https://co-created-library-lyn.pages.dev/',runScripts:'dangerously',beforeParse(w){w.fetch=async()=>({ok:true,json:async()=>({items:[...legacy,work]})});w.HTMLElement.prototype.scrollIntoView=function(){};}});
 await new Promise(resolve=>setImmediate(resolve));const d=dom.window.document;
 assert.equal(d.querySelectorAll('.directory-entry').length,2);assert.equal(d.querySelector('[data-category="technology/software"] .count').textContent,'1');
 assert.equal(dom.window.bad,undefined);assert(d.querySelectorAll('.directory-entry')[0].textContent.includes('<script>'));
 d.querySelector('[data-category="technology/software"]').click();assert.equal([...d.querySelectorAll('.directory-entry')].filter(n=>!n.hidden).length,1);
 const q=d.querySelector('#work-search');q.value='New published';q.dispatchEvent(new dom.window.Event('input'));assert.equal([...d.querySelectorAll('.directory-entry')].filter(n=>!n.hidden).length,1);
 assert.equal(d.querySelector('#result-status').textContent,'1 份作品');dom.window.close();
});
test('network failure does not expose stale works that may have become unlisted or deleted',async()=>{
 const dom=new JSDOM(html,{url:'https://co-created-library-lyn.pages.dev/',runScripts:'dangerously',beforeParse(w){w.fetch=async()=>{throw Error('offline')};}});await new Promise(resolve=>setImmediate(resolve));
 assert.equal(dom.window.document.querySelectorAll('.directory-entry').length,0);assert.match(dom.window.document.querySelector('.directory-caption').textContent,/刷新重试/);dom.window.close();
});
test('external sites share category and domain search, show their domain and open the original site safely',async()=>{
 const work={id:'b'.repeat(32),source:'external',title:'External guide',summary:'<img src=x onerror=alert(1)>',category_id:'humanities/museums',category:'人文与艺术 / 博物馆与文物',format:'guide',tags:[],author:'Collector',updated:'2026-10-22',url:'https://guide.example/museum/',external_domain:'guide.example',link_status:'unavailable',icon:'https://content.example/v/icon.svg'};
 const dom=new JSDOM(html,{url:'https://texopub.com/',runScripts:'dangerously',beforeParse(w){w.fetch=async()=>({ok:true,json:async()=>({items:[...legacy,work]})});}});await new Promise(resolve=>setImmediate(resolve));
 const d=dom.window.document,entry=d.querySelector('[data-source="external"]'),a=entry.querySelector('h3 a');assert.equal(a.href,work.url);assert.equal(a.target,'_blank');assert.equal(a.rel,'noopener noreferrer');assert.match(entry.textContent,/外部网站 · guide.example/);assert.match(entry.textContent,/收录者：Collector/);assert.match(entry.textContent,/链接可能失效/);assert(!entry.querySelector('p img'));
 const q=d.querySelector('#work-search');q.value='guide.example';q.dispatchEvent(new dom.window.Event('input'));assert.equal([...d.querySelectorAll('.directory-entry')].filter(n=>!n.hidden).length,1);assert.equal(d.querySelector('[data-category="humanities/museums"] .count').textContent,'2');dom.window.close();
});
