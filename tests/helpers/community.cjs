const assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('../../.tools/node_modules/jsdom'),esbuild=require('../../.tools/node_modules/esbuild');
let source;const pid='a'.repeat(32),other='b'.repeat(32),wid='c'.repeat(32),v='d'.repeat(32),tick=()=>new Promise(r=>setImmediate(r));
async function prepare(){source ||= (await esbuild.build({entryPoints:['templates/community/app.mjs'],bundle:true,write:false,format:'esm'})).outputFiles[0].text}
async function settle(){for(let n=0;n<12;n++)await tick()}
async function open(path='/',options={}){
 await prepare();
 const dom=new JSDOM('<div id="app"></div>',{url:'https://texopub.com'+path,runScripts:'outside-only'}),w=dom.window,calls=[];let logged=options.logged??true,expired=false,profilePublic=false,key=null,keySecret='txp_synthetic_once_only',challengeResolve;
 const identity={id:pid,publisher_id:pid,name:'真实作者<script>bad()</script>',bio:'用户确认的简介',revision:0,avatar_url:'',ai_partners:[]};
 const work={id:wid,publisher_id:pid,creator:identity,title:'实际作品',summary:'可检索内容',slug:'actual',category_id:'humanities/literature',category:'文学与阅读',category_path:['人文与艺术','文学与阅读'],format:'article',listing:'public',status:'published',kind:'work',version:v,revision:1,url:'https://content.texopub.com/p/actual/',updated:'2026-10-26',ai_partners:[]};
 const own=[work,{...work,id:'e'.repeat(32),title:'不展示作品',listing:'unlisted'},{...work,id:'f'.repeat(32),title:'归档作品',status:'hidden'},{...work,id:'1'.repeat(32),title:'草稿作品',status:'draft',version:null}];
 w.matchMedia=()=>({matches:false});w.scrollTo=()=>{};w.confirm=()=>true;w.URL.createObjectURL=()=> 'blob:local-test';w.URL.revokeObjectURL=()=>{};
 w.fetch=async(url,init={})=>{
  const body=init.body&&JSON.parse(init.body),p=String(url).replace('/api/v1/','');calls.push({p,body,init});let status=200,data={};
  if(p==='/community/identity-lexicon.json')data=JSON.parse(fs.readFileSync('service/identity-lexicon.json'));
  else if(p==='/community/plugin.html'||p==='/community/privacy.html')return {ok:true,status:200,text:async()=>'<h1>站点说明</h1>'};
  else if(p==='categories')data=JSON.parse(fs.readFileSync('taxonomy.json'));
  else if(p==='catalog'){if(options.failPublic){status=503;data={error:'目录暂时不可用'}}else data={items:options.publicWorks||[work]};}
  else if(p==='materials')data={items:Array.from({length:50},(_,n)=>({id:'public-'+n,name:'公开图片'+n,collection:'公开作品',mime:'image/png',url:'https://images.example.com/'+n+'.png',bytes:1024}))};
  else if(p==='auth/status')data={sms:true,email:true};
  else if(p==='auth/challenge'){if(options.delayChallenge)await new Promise(r=>challengeResolve=r);data={challenge_id:'challenge',retry_after:60,message:'验证码已发送'}}
  else if(p==='auth/verify'){assert.equal(body.code,'123456');logged=true;data={logged_in:true}}
  else if(p.startsWith('profiles/')){if(options.profile404){status=404;data={error:'主页未公开'}}else {const id=p.split('/')[1];data={...identity,id,publisher_id:id,ai_partners:options.partner?[{id:'9'.repeat(32),application:'Codex',name:'织织'}]:[],items:[{...work,publisher_id:id}]}}}
  else if(!logged||expired){status=401;data={error:'登录已过期'}}
  else if(p==='account')data={publisher_id:pid,name:identity.name,phone:'139****1111',email:null,default_listing:'profile',profile_public:profilePublic,reauth_required:false};
  else if(p==='me/profile')data=identity;
  else if(p==='me/works')data={items:own};
  else if(p==='me/materials'){if(options.delayMaterials)await new Promise(r=>options.materialsReady=r);data={items:[{id:v+'/private.txt',name:'私有笔记.txt',collection:'个人资料',mime:'text/plain',bytes:40,visibility:'private',kind:'asset',url:'/api/v1/me/files/'+v+'/private.txt'}]};}
  else if(p==='account/profile'){profilePublic=body.public;data={profile_public:profilePublic}}
  else if(p==='account/keys'&&body){assert.equal(body.months,6);key={id:'2'.repeat(32),name:body.name,prefix:'txp_…last',scope:body.scope,expires:Math.floor(Date.now()/1000)+86400};data={id:key.id,token:keySecret,api:'https://api.example.com',publisher_id:pid};}
  else if(p==='account/keys')data={items:key?[key]:[],legacy_key_active:false};
  else if(/account\/keys\/.*\/expiry/.test(p))data={saved:true};
  else if(/account\/keys\/.*\/revoke/.test(p)){key=null;data={revoked:true}}
  else if(p==='account/import')data={imported:true};
  else if(p==='account/logout'||p==='account/logout-all'){logged=false;data={logged_out:true}}
  else throw new Error('Unexpected request '+p);
  if(options.failOwn&&p==='me/works'){status=503;data={error:'本人作品暂时不可用'}}
  return {ok:status<400,status,json:async()=>data};
 };
 const loading=w.eval('(async()=>{'+source+'})()');if(!options.delayMaterials)await loading;await settle();
 return {dom,w,d:w.document,calls,loading,expire:()=>expired=true,releaseChallenge:()=>challengeResolve?.(),close:()=>dom.window.close()};
}
async function submit(c,selector){const form=c.d.querySelector(selector);form.dispatchEvent(new c.w.Event('submit',{cancelable:true,bubbles:true}));await settle()}

module.exports={open,settle,submit,pid,other,wid,v};
