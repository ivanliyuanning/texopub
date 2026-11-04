// Local synthetic preview only. This module is never imported by the production Worker.
import worker from '../service/worker.mjs';
import {boundedJSON} from '../service/data-core.mjs';
import previewBridge from '../templates/data-preview-bridge.html';
export default {async fetch(request,env,ctx){
 const u=new URL(request.url),users=JSON.parse(env.PREVIEW_USERS_JSON),app=env.APP_ORIGIN,content=env.CONTENT_ORIGIN;
 if(u.pathname==='/preview/runtime'){
  if(u.origin!==content||request.method!=='POST'||request.headers.get('Origin')!==content||request.headers.get('X-TexoPub-Preview')!=='runtime')return Response.json({error:{message:'仅限本地演示页面操作'}},{status:403});
  let b;try{b=await boundedJSON(request);}catch{return Response.json({error:{message:'演示请求过大或格式无效'}},{status:400});}
  if(!['grant','call','disconnect'].includes(b.action)||!Object.hasOwn(users,b.role))return Response.json({error:{message:'请选择有效的虚构演示身份'}},{status:400});
  const {action,role,...body}=b;return worker.fetch(new Request(app+'/api/v1/data/runtime/'+action,{method:'POST',headers:{'Content-Type':'application/json',Origin:app,'X-TexoPub-Request':'space',Cookie:'__Host-texopub='+users[role].cookie},body:JSON.stringify(body)}),{...env,ROLE:'api'},ctx);
 }
 if(u.pathname==='/publish/'||u.pathname.startsWith('/community/')||u.pathname.startsWith('/brand/')||['/categories.json','/favicon.ico'].includes(u.pathname)){const response=await fetch('https://preview-assets.local'+u.pathname);if(u.pathname==='/publish/'){const headers=new Headers(response.headers);headers.delete('Content-Length');return new Response((await response.text()).replace('<body>','<body><aside style="padding:10px 24px;background:#fff3d8;color:#654f2c;font:14px system-ui" role="note">隔离预览：使用虚构账号，提醒邮件仅模拟发送。</aside>'),{status:response.status,headers});}return response;}
 if(u.pathname==='/preview/login'){
  const role=u.searchParams.get('as')||'author';if(!Object.hasOwn(users,role))return new Response('Unknown preview identity',{status:400});
  const token=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(users[role].cookie)),hash=[...new Uint8Array(token)].map(x=>x.toString(16).padStart(2,'0')).join(''),now=Math.floor(Date.now()/1000);
  await env.DB.prepare('UPDATE login_sessions SET created=?,expires=? WHERE token_hash=?').bind(now,now+86400,hash).run();const next=u.searchParams.get('next');return new Response(null,{status:302,headers:{Location:next&&(next.startsWith('/api/v1/data/')||next.startsWith('/api/v1/data-applications/admin/')||next.startsWith('/publish/'))?next:'/preview/','Set-Cookie':'texopub-preview-session='+users[role].cookie+'; HttpOnly; SameSite=Lax; Path=/'}});
 }
 if(u.pathname==='/space/settings/')return Response.redirect(app+'/preview/',302);
 if(u.pathname==='/login/'){const cookie=request.headers.get('Cookie')||'',role=Object.entries(users).find(([,v])=>cookie.includes('texopub-preview-session='+v.cookie))?.[0]||'author';return Response.redirect(app+'/preview/login?as='+role+'&next='+encodeURIComponent(u.searchParams.get('next')||'/preview/'),302);}
 if(u.pathname==='/preview/'||u.pathname==='/')return new Response(await env.FILES.get('preview-home').then(o=>o.text()),{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store'}});
 // HTTP localhost WebViews may reject Secure __Host cookies. Translate only this
 // isolated preview's synthetic cookie; production browserAccount is unchanged.
 if(u.origin===app){const raw=request.headers.get('Cookie')||'',user=Object.values(users).find(v=>raw.includes('texopub-preview-session='+v.cookie));if(user){const headers=new Headers(request.headers);headers.set('Cookie',raw.split(';').filter(x=>!x.trim().startsWith('__Host-texopub=')).join(';')+'; __Host-texopub='+user.cookie);request=new Request(request,{headers});}}
 const response=await worker.fetch(request,{...env,ROLE:u.origin===content?'content':'api'},ctx);
 if(u.origin===content&&response.headers.get('Content-Type')?.startsWith('text/html')&&!u.pathname.startsWith('/_texopub/')){
  const html=await response.text(),headers=new Headers(response.headers);headers.delete('Content-Length');headers.set('Content-Security-Policy',(headers.get('Content-Security-Policy')||'').replace(/connect-src [^;]*/,"connect-src 'self' "+app));
  return new Response(html.replace(/<script data-texopub-data>[\s\S]*?<\/script>/,code=>{const match=code.match(/,config=([\s\S]*?);if\(!config\)return;/);return match?previewBridge.replace('{{DATA_CONFIG}}',match[1]):code;}),{status:response.status,headers});
 }
 if(u.origin===app&&u.pathname==='/api/v1/data-applications/admin/'&&response.headers.get('Content-Type')?.startsWith('text/html')){const headers=new Headers(response.headers);headers.delete('Content-Length');return new Response((await response.text()).replace('<body>','<body>') .replace('<h1>','<p>隔离预览：邮件仅模拟发送，不会发送到真实邮箱。</p><h1>'),{status:response.status,headers});}
 return response;
}};
