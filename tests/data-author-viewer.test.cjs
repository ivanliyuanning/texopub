const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function viewer(respond){
 const listeners={},out=[],requests=[],elements=[],child={postMessage:m=>out.push(m)},frame={contentWindow:child,addEventListener:(n,f)=>listeners['frame:'+n]=f};let opened=0;
 const document={getElementById:()=>frame,createElement:tag=>({tag,hidden:false,style:'',focus(){}}),body:{append:el=>elements.push(el)}};
 const config={api:'https://texopub.com/api/v1/data',ticket:'trusted-context',app_origin:'https://texopub.com',login_url:'https://texopub.com/login/?next=work'};
 const scope={document,window:{open(){opened++;}},addEventListener:(n,f)=>listeners[n]=f,setInterval(){},Date,Math,Map,JSON,Object,fetch:async(url,opts)=>{requests.push({url,...opts,body:JSON.parse(opts.body)});const result=await respond(url,opts);return {ok:result.status<300,status:result.status,json:async()=>result.data};}};
 vm.runInNewContext(fs.readFileSync('templates/data-viewer.html','utf8').replace(/^<script[^>]*>|<\/script>\s*$/g,'').replace('{{DATA_CONFIG}}',JSON.stringify(config)),scope);
 return {elements,out,requests,opened:()=>opened,async call(operation,args={},source=child){await listeners.message({source,data:{type:'texopub:data-request',id:'test-'+out.length,operation,collection:'notes',args,ticket:'injected-other-work'}});return out.at(-1);}};
}
test('outer automatically uses live author login, pins its own context and never opens a popup for owner CRUD',async()=>{
 const v=viewer(async()=>({status:200,data:{records:[]}}));await v.call('connect');await v.call('query');await v.call('create',{data:{title:'synthetic'}});
 assert.equal(v.opened(),0);assert(v.elements.every(el=>el.hidden));assert.equal(v.requests.length,3);
 for(const r of v.requests){assert(r.url.endsWith('/runtime/author'));assert.equal(r.credentials,'include');assert.equal(r.headers['X-TexoPub-Request'],'work');assert.equal(r.body.ticket,'trusted-context');assert(!JSON.stringify(r.body).includes('cookie'));}
 const count=v.requests.length;await v.call('query',{},{});assert.equal(v.requests.length,count);
});
test('logout returns login_required and link; public reads still work, and quota metadata reaches the child',async()=>{
 let mode='logout';const v=viewer(async url=>mode==='quota'?{status:429,data:{error:{code:'data_daily_quota',message:'limit',reset_at:123}}}:url.endsWith('/runtime/author')?{status:401,data:{error:{code:'account_authentication',message:'login'}}}:mode==='public'?{status:200,data:{records:[]}}:{status:401,data:{error:{code:'connect_required',message:'login'}}});
 let r=await v.call('query');assert.equal(r.error.code,'login_required');assert(r.error.login_url.startsWith('https://texopub.com/login/'));assert.equal(v.opened(),0);assert.equal(v.elements.find(el=>el.tag==='a').hidden,false);
 mode='public';r=await v.call('query');assert(r.result);assert.equal(v.elements.find(el=>el.tag==='a').hidden,true);
 mode='quota';r=await v.call('create');assert.equal(r.error.reset_at,123);assert.equal(r.error.code,'data_daily_quota');
});
