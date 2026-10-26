const {test}=require('node:test'),assert=require('node:assert/strict');
const {open,pid}=require('../../tests/helpers/community.cjs');
const work=(id,title,category='humanities/museums')=>({id,publisher_id:pid,author:'作者',title,summary:'摘要',category_id:category,category_path:['主题','分类'],category:'分类',format:'guide',tags:[],updated:'2026-10-26',url:'https://works.example.com/'+id,ai_partners:[]});
test('live catalog participates in gallery, taxonomy counts and keyword filtering, with safe metadata',async()=>{
 const c=await open('/',{publicWorks:[work('1','<script>bad()</script>'),work('2','New published','technology/software')]});assert.equal(c.d.querySelectorAll('.work-card').length,2);assert.equal(c.d.querySelector('.work-title script'),null);c.d.querySelector('[data-category-select="technology/software"]').click();assert.equal(c.d.querySelector('#result-count').textContent,'1 份作品');const input=c.d.querySelector('#work-search');input.value='New published';input.dispatchEvent(new c.w.Event('input'));assert.equal(c.d.querySelector('#result-count').textContent,'1 份作品');c.close();
});
test('live catalog failure has retry and never displays an embedded stale snapshot',async()=>{
 const c=await open('/',{failPublic:true});assert.equal(c.d.querySelectorAll('.work-card').length,0);assert(c.d.querySelector('#retry-load'));assert.match(c.d.querySelector('h1').textContent,/暂时无法读取/);c.close();
});
test('external sites retain original links, domain search, collector attribution and availability warnings',async()=>{
 const item={...work('3','External guide'),source:'external',external_domain:'guide.example.com',url:'https://guide.example.com/original/',link_status:'unavailable',author:'Collector'};
 const c=await open('/',{publicWorks:[item]});const card=c.d.querySelector('[data-source="external"]'),a=card.querySelector('h2 a');assert.equal(a.href,item.url);assert.equal(a.target,'_blank');assert.match(a.rel,/noopener/);assert.match(card.textContent,/外部网站 · guide.example.com/);assert.match(card.textContent,/收录者：Collector/);assert.match(card.textContent,/链接可能失效/);const input=c.d.querySelector('#work-search');input.value='guide.example.com';input.dispatchEvent(new c.w.Event('input'));assert.equal(c.d.querySelector('#result-count').textContent,'1 份作品');c.close();
});
