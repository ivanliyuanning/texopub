const {test}=require('node:test');
const assert=require('node:assert/strict');
const {readFileSync}=require('node:fs');
const {JSDOM}=require('../.tools/node_modules/jsdom');
const template=readFileSync(require('node:path').join(__dirname,'../templates/work-viewer.html'),'utf8');
function viewer(entry='index.html'){
 const values={TITLE:'Original title',ICON:'https://content.example/icon.svg',SOURCE:'/_texopub/content/v/version/index.html',SANDBOX:'allow-scripts allow-forms allow-popups allow-modals allow-downloads',CONFIG:JSON.stringify({rawRoot:'/_texopub/content/v/version/',publicRoot:'/p/publisher/work/',entry})};
 const html=template.replace(/\{\{(TITLE|ICON|SOURCE|SANDBOX|CONFIG)\}\}/g,(_,key)=>values[key]);
 const dom=new JSDOM(html,{runScripts:'dangerously',url:'https://content.example/p/publisher/work/'});
 const frame=dom.window.document.querySelector('iframe');
 const send=(data,source=frame.contentWindow)=>dom.window.dispatchEvent(new dom.window.MessageEvent('message',{source,data:{type:'texopub:work-state',...data}}));
 return {dom,doc:dom.window.document,frame,send};
}
test('platform owns only home/title; child cannot add controls or send HTML into its title',()=>{
 const {dom,doc,frame,send}=viewer();
 assert.equal(doc.querySelector('.home').href,'https://texopub.com/');assert.equal(doc.querySelector('.home').textContent,'');assert(doc.querySelector('.home svg g'));assert.equal(frame.getAttribute('sandbox').includes('allow-same-origin'),false);
 assert(!doc.querySelector('#textSize'));assert(!doc.querySelector('#search'));assert.equal(doc.querySelectorAll('iframe').length,1);
 send({title:'Spoof'},null);assert.equal(doc.title,'Original title');
 send({title:'<img src=x onerror=alert(1)> Child title'});assert.equal(doc.querySelector('.work-title').textContent,'<img src=x onerror=alert(1)> Child title');assert.equal(doc.title,'<img src=x onerror=alert(1)> Child title');assert.equal(doc.querySelectorAll('.work-title img').length,0);
 dom.window.close();
});
test('scrolling down hides bar and releases space; upward scroll and reveal restore it',()=>{
 const {dom,doc,send}=viewer();
 send({kind:'scroll',y:100,delta:30});assert(doc.body.hasAttribute('data-reading'));assert.equal(doc.querySelector('header').inert,true);
 send({kind:'scroll',y:96,delta:-4});assert(doc.body.hasAttribute('data-reading'));
 send({kind:'scroll',y:78,delta:-18});assert(!doc.body.hasAttribute('data-reading'));assert.equal(doc.querySelector('header').inert,false);
 send({kind:'scroll',y:200,delta:122});assert(doc.body.hasAttribute('data-reading'));doc.querySelector('.reveal').click();assert(!doc.body.hasAttribute('data-reading'));assert.equal(doc.activeElement,doc.querySelector('.home'));
 dom.window.close();
});
test('current child title, internal page and hash remain shareable under stable work path',()=>{
 const {dom,send}=viewer();
 send({kind:'ready',title:'Chapter',path:'/_texopub/content/v/version/chapters/page.html',hash:'#section',search:'?mode=read'});
 assert.equal(dom.window.location.pathname,'/p/publisher/work/chapters/page.html');assert.equal(dom.window.location.hash,'#section');assert.equal(dom.window.location.search,'?mode=read');
 send({path:'/_texopub/content/v/version/%2e%2e/%2e%2e/outside.html'});assert.equal(dom.window.location.pathname,'/p/publisher/work/chapters/page.html');
 dom.window.close();
});

test('encoded Chinese entry keeps the short root URL while preserving hash and query',()=>{
 const entry='川流万物-四川大学博物馆图文导览.html',{dom,send}=viewer(entry);
 send({kind:'ready',path:'/_texopub/content/v/version/'+encodeURIComponent(entry),hash:'#nature',search:'?read=1'});
 assert.equal(dom.window.location.pathname,'/p/publisher/work/');assert.equal(dom.window.location.hash,'#nature');assert.equal(dom.window.location.search,'?read=1');
 dom.window.close();
});
