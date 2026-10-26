import {browserAccount,sha,AccountError} from './accounts.mjs';
const time=()=>Math.floor(Date.now()/1000), random=()=>crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','');
const S=(e,q,...p)=>e.DB.prepare(q).bind(...p),one=(e,q,...p)=>S(e,q,...p).first();
const app=e=>e.APP_ORIGIN||'https://texopub.com',issuer=e=>(e.API_ORIGIN||'https://commonplace-api.ivanliyuanning123.workers.dev').replace(/\/$/,'');
export const resource=e=>app(e)+'/api/mcp';
const SCOPES=['texopub:read','texopub:publish'];
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer','Access-Control-Allow-Origin':'*'};
const json=(x,status=200)=>Response.json(x,{status,headers});
const bad=(m,status=400)=>{throw new AccountError(status,m);};
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export async function bounded(r,max=3*1024*1024){
 if(Number(r.headers.get('Content-Length'))>max)bad('请求文件过大',413);
 if(!r.body)return new Uint8Array();const reader=r.body.getReader(),chunks=[];let size=0;
 try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>max){await reader.cancel();bad('请求文件过大',413);}chunks.push(x.value);}}finally{reader.releaseLock();}
 const bytes=new Uint8Array(size);let at=0;for(const x of chunks){bytes.set(x,at);at+=x.length;}return bytes;
}
async function body(r){const text=new TextDecoder().decode(await bounded(r,16384));try{return r.headers.get('Content-Type')?.includes('application/json')?JSON.parse(text):Object.fromEntries(new URLSearchParams(text));}catch{bad('请求格式不正确');}}
function scopes(s){const a=String(s||'texopub:read texopub:publish').split(' ').filter(Boolean);if(!a.length||a.some(x=>!SCOPES.includes(x)))bad('不支持的授权范围');return [...new Set(a)].sort().join(' ');}
function callback(raw){try{const u=new URL(raw);if(u.hash||u.username||u.password)bad('无效回调地址');if(u.protocol==='https:'&&u.hostname==='chatgpt.com'&&!u.port&&(/^\/connector\/oauth\/[a-zA-Z0-9_-]+$/.test(u.pathname)||u.pathname==='/connector_platform_oauth_redirect'))return u.href;if(u.protocol==='http:'&&['127.0.0.1','localhost','[::1]'].includes(u.hostname)&&/^\/(?:callback|oauth\/callback)(?:\/[a-zA-Z0-9_-]+)?$/.test(u.pathname))return u.href;}catch{}bad('仅支持 ChatGPT 正式回调与 Codex 本机回调');}
async function client(e,id){
 // Predefined public ChatGPT client. DCR is the advertised registration flow;
 // this pinned callback also accepts a host's previously discovered stable ID.
 if(id==='https://chatgpt.com/oauth/client.json')return {id,name:'ChatGPT',redirects:['https://chatgpt.com/connector_platform_oauth_redirect']};
 const c=await one(e,'SELECT * FROM oauth_clients WHERE id=?',id);if(!c)bad('客户端尚未注册');return {id:c.id,name:c.name,redirects:JSON.parse(c.redirects)};
}
async function limit(r,e,key,n=30){const k='oauth:'+key+':'+(r.headers.get('CF-Connecting-IP')||'unknown')+':'+Math.floor(time()/3600);const row=await S(e,'INSERT INTO auth_limits(key,n,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n',k,time()+7200).first();if(row.n>n)bad('请求过于频繁，请稍后再试',429);}
function page(title,inner){const nonce=random();return new Response(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}｜TexoPub</title><link rel="icon" href="/favicon.svg"><style nonce="${nonce}">*{box-sizing:border-box}body{margin:0;background:#f7f5ef;color:#292823;font:17px/1.65 system-ui,sans-serif}main{max-width:600px;margin:8vh auto;padding:28px}a{color:#a34227}h1{font-size:30px;line-height:1.25}button{font:inherit;background:#a34227;color:white;border:0;border-radius:8px;padding:11px 20px;cursor:pointer;min-height:44px}button.secondary{color:#4e473f;background:#eae5db}form{display:flex;gap:12px;flex-wrap:wrap}article{border-top:1px solid #ddd5c7;padding:18px 0}.muted{color:#686258;font-size:15px}#status{color:#a34227;overflow-wrap:anywhere}</style></head><body><main><a href="/">TexoPub</a>${inner}<p id="status" role="status"></p></main><script nonce="${nonce}">document.querySelectorAll('form').forEach(f=>f.addEventListener('submit',async e=>{e.preventDefault();const b=e.submitter;b.disabled=true;try{const x=await fetch(f.action,{method:'POST',headers:{'Content-Type':'application/json','X-TexoPub-Request':'space'},body:JSON.stringify({...Object.fromEntries(new FormData(f)),decision:b.value})});const v=await x.json();if(!x.ok)throw Error(v.error||'请求未完成');if(v.redirect)location.assign(v.redirect);else location.reload();}catch(err){document.getElementById('status').textContent=err.message;b.disabled=false;}}));</script></body></html>`,{headers:{...headers,'Content-Type':'text/html; charset=utf-8','Content-Security-Policy':`default-src 'none'; style-src 'nonce-${nonce}'; script-src 'nonce-${nonce}'; connect-src 'self'; img-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'`}});}
function returnToLogin(r,e){return Response.redirect(app(e)+'/login/?next='+encodeURIComponent(new URL(r.url).pathname+new URL(r.url).search),302);}
async function browser(r,e){try{return await browserAccount(r,e);}catch(err){if(r.method==='GET'&&err.status===401)return null;throw err;}}
function redirect(c,e,params){const u=new URL(c.redirect_uri);for(const [k,v] of Object.entries({...params,state:c.state,iss:issuer(e)}))if(v)u.searchParams.set(k,v);return u.href;}
async function issue(e,g){const access='txo_'+random(),refresh='txr_'+random(),expires=Math.min(time()+3600,g.expires);await S(e,'INSERT INTO oauth_tokens(access_hash,refresh_hash,grant_id,expires,refresh_expires) VALUES(?,?,?,?,?)',await sha(access),await sha(refresh),g.id,expires,Math.min(time()+2592000,g.expires)).run();return json({access_token:access,token_type:'Bearer',expires_in:expires-time(),refresh_token:refresh,scope:g.scope});}
export async function oauthIdentity(r,e){
 const token=r.headers.get('Authorization')?.match(/^Bearer (txo_\S+)$/)?.[1];if(!token)return null;
 return one(e,'SELECT p.*,g.scope,g.id AS grant_id FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id JOIN publishers p ON p.id=g.publisher_id WHERE t.access_hash=? AND t.expires>? AND g.expires>? AND g.revoked=0 AND p.revoked=0',await sha(token),time(),time());
}
export function authChallenge(e,message='请连接自己的 TexoPub 账号'){return new Response(JSON.stringify({error:message}),{status:401,headers:{...headers,'Content-Type':'application/json','WWW-Authenticate':`Bearer resource_metadata="${issuer(e)}/.well-known/oauth-protected-resource", scope="texopub:read texopub:publish"`}});}
export async function oauthRoutes(r,e,u){
 const p=u.pathname;
 if(p==='/.well-known/oauth-protected-resource'||p==='/.well-known/oauth-protected-resource/mcp')return json({resource:resource(e),authorization_servers:[issuer(e)],scopes_supported:SCOPES,resource_documentation:app(e)+'/plugins/texopub/'});
 if(p==='/.well-known/oauth-authorization-server')return json({issuer:issuer(e),authorization_response_iss_parameter_supported:true,authorization_endpoint:app(e)+'/api/oauth/authorize',token_endpoint:issuer(e)+'/oauth/token',registration_endpoint:issuer(e)+'/oauth/register',revocation_endpoint:issuer(e)+'/oauth/revoke',response_types_supported:['code'],grant_types_supported:['authorization_code','refresh_token'],code_challenge_methods_supported:['S256'],token_endpoint_auth_methods_supported:['none'],client_id_metadata_document_supported:false,scopes_supported:SCOPES});
 if(!p.startsWith('/oauth/'))return null;
 if(p==='/oauth/register'&&r.method==='POST'){
  await limit(r,e,'register',30);const b=await body(r);if(b.token_endpoint_auth_method&&b.token_endpoint_auth_method!=='none')bad('仅支持 PKCE 公共客户端');if(!Array.isArray(b.redirect_uris)||!b.redirect_uris.length||b.redirect_uris.length>8)bad('需要有效的回调地址');const urls=[...new Set(b.redirect_uris.map(callback))],id='txpc_'+random(),name=String(b.client_name||'ChatGPT / Codex').slice(0,80);await S(e,'INSERT INTO oauth_clients(id,name,redirects,created) VALUES(?,?,?,?)',id,name,JSON.stringify(urls),time()).run();return json({client_id:id,client_id_issued_at:time(),client_name:name,redirect_uris:urls,token_endpoint_auth_method:'none',grant_types:['authorization_code','refresh_token'],response_types:['code']},201);
 }
 if(p==='/oauth/authorize'&&r.method==='GET'){
  await limit(r,e,'authorize',120);const q=u.searchParams,c=await client(e,q.get('client_id')),cb=callback(q.get('redirect_uri'));if(!c.redirects.includes(cb))bad('回调地址与注册记录不一致');if(q.get('response_type')!=='code'||q.get('code_challenge_method')!=='S256'||!/[A-Za-z0-9_-]{43}/.test(q.get('code_challenge')||'')||(q.get('code_challenge')||'').length!==43)bad('需要 S256 PKCE 授权');if(q.get('resource')!==resource(e))bad('授权资源不匹配');const scope=scopes(q.get('scope')),state=q.get('state')||'';if(state.length>2048)bad('授权状态过长');
  const a=await browser(r,e);if(!a)return returnToLogin(r,e);const ticket=random(),request={client_id:c.id,client_name:c.name,redirect_uri:cb,challenge:q.get('code_challenge'),scope,state};await S(e,'DELETE FROM oauth_pending WHERE expires<?',time()).run();await S(e,'INSERT INTO oauth_pending(hash,session_hash,request,expires) VALUES(?,?,?,?)',await sha(ticket),a.session_hash,JSON.stringify(request),time()+600).run();
  const p=await one(e,'SELECT name FROM publishers WHERE id=?',a.publisher_id);return page('连接 TexoPub',`<h1>允许 ${esc(c.name)} 使用你的 TexoPub 空间？</h1><p>当前空间：<strong>${esc(p.name)}</strong></p><ul><li>读取你的作品、素材和存储使用量</li>${scope.includes('texopub:publish')?'<li>按你的要求发布、更新及归档自己的网页和素材</li>':''}</ul><p>公开发布的网页及其依赖文件可被任何人访问；独立素材默认私有。</p><p class="muted">不会获得手机号、邮箱、账号设置或其他空间的权限。连接最长有效 180 天，可随时在设置中撤销。</p><form action="/api/oauth/consent"><input type="hidden" name="ticket" value="${ticket}"><button name="decision" value="allow">允许连接</button><button class="secondary" name="decision" value="deny">取消</button></form>`);
 }
 if(p==='/oauth/consent'&&r.method==='POST'){
  const a=await browserAccount(r,e),b=await body(r);const row=await S(e,'DELETE FROM oauth_pending WHERE hash=? AND session_hash=? AND expires>? RETURNING request',await sha(String(b.ticket||'')),a.session_hash,time()).first();if(!row)bad('授权页面已失效，请重新连接');const c=JSON.parse(row.request);if(b.decision!=='allow')return json({redirect:redirect(c,e,{error:'access_denied'})});const code=random();await S(e,'INSERT INTO oauth_codes(hash,publisher_id,client_id,redirect_uri,challenge,scope,state,expires) VALUES(?,?,?,?,?,?,?,?)',await sha(code),a.publisher_id,c.client_id,c.redirect_uri,c.challenge,c.scope,c.state,time()+300).run();return json({redirect:redirect(c,e,{code})});
 }
 if(p==='/oauth/token'&&r.method==='POST'){
  await limit(r,e,'token',180);const b=await body(r);try{
   if(b.resource!==resource(e))bad('invalid_target');
   if(b.grant_type==='authorization_code'){
    const c=await one(e,'SELECT * FROM oauth_codes WHERE hash=? AND used=0 AND expires>?',await sha(String(b.code||'')),time());if(!c||c.client_id!==b.client_id||c.redirect_uri!==b.redirect_uri||!/^[A-Za-z0-9._~-]{43,128}$/.test(b.code_verifier||''))bad('invalid_grant');const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(b.code_verifier)),challenge=btoa(String.fromCharCode(...new Uint8Array(digest))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');if(challenge!==c.challenge)bad('invalid_grant');const claim=await S(e,'UPDATE oauth_codes SET used=1 WHERE hash=? AND used=0 AND expires>? RETURNING hash',c.hash,time()).first();if(!claim)bad('invalid_grant');const g={id:random(),scope:c.scope,expires:time()+15552000};await S(e,'INSERT INTO oauth_grants(id,publisher_id,client_id,name,scope,created,expires) VALUES(?,?,?,?,?,?,?)',g.id,c.publisher_id,c.client_id,(await one(e,'SELECT name FROM oauth_clients WHERE id=?',c.client_id))?.name||'ChatGPT',g.scope,time(),g.expires).run();return issue(e,g);
   }
   if(b.grant_type==='refresh_token'){
    const t=await one(e,'SELECT t.*,g.scope,g.expires AS grant_expires,g.client_id,g.revoked,p.revoked AS publisher_revoked FROM oauth_tokens t JOIN oauth_grants g ON g.id=t.grant_id JOIN publishers p ON p.id=g.publisher_id WHERE t.refresh_hash=?',await sha(String(b.refresh_token||'')));if(!t||t.client_id!==b.client_id||t.revoked||t.publisher_revoked||t.refresh_expires<=time()||t.grant_expires<=time())bad('invalid_grant');if(t.refresh_used){await S(e,'UPDATE oauth_grants SET revoked=1 WHERE id=?',t.grant_id).run();bad('invalid_grant');}const claim=await S(e,'UPDATE oauth_tokens SET refresh_used=1 WHERE refresh_hash=? AND refresh_used=0 RETURNING grant_id',t.refresh_hash).first();if(!claim)bad('invalid_grant');return issue(e,{id:t.grant_id,scope:t.scope,expires:t.grant_expires});
   }
   bad('unsupported_grant_type');
  }catch(err){if(err instanceof AccountError)return json({error:err.message},400);throw err;}
 }
 if(p==='/oauth/revoke'&&r.method==='POST'){
  await limit(r,e,'revoke',120);const b=await body(r),h=await sha(String(b.token||''));await S(e,'UPDATE oauth_grants SET revoked=1 WHERE client_id=? AND id IN (SELECT grant_id FROM oauth_tokens WHERE access_hash=? OR refresh_hash=?)',String(b.client_id||''),h,h).run();return json({});
 }
 if(p==='/oauth/connections'&&r.method==='GET'){
  const a=await browser(r,e);if(!a)return returnToLogin(r,e);const rows=(await S(e,'SELECT id,name,scope,created,expires,revoked FROM oauth_grants WHERE publisher_id=? ORDER BY created DESC LIMIT 100',a.publisher_id).all()).results;return page('已连接的插件','<h1>已连接的插件</h1><p>撤销连接会立即停止该连接的访问，已发布作品保留。</p>'+rows.map(g=>`<article><strong>${esc(g.name)}</strong><p class="muted">${esc(g.scope)} · ${g.revoked?'已撤销':g.expires<=time()?'已过期':'有效至 '+new Date(g.expires*1000).toISOString().slice(0,10)}</p>${!g.revoked&&g.expires>time()?`<form action="/api/oauth/revoke-connection"><input type="hidden" name="id" value="${g.id}"><button name="decision" value="revoke">撤销连接</button></form>`:''}</article>`).join('')+(!rows.length?'<p>还没有连接插件。</p>':'')+'<p><a href="/space/settings/">返回设置</a></p>');
 }
 if(p==='/oauth/revoke-connection'&&r.method==='POST'){
  const a=await browserAccount(r,e),b=await body(r);await S(e,'UPDATE oauth_grants SET revoked=1 WHERE id=? AND publisher_id=?',String(b.id||''),a.publisher_id).run();return json({revoked:true});
 }
 bad('授权接口不存在',404);
}
