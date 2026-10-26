import {defaultCreatorName} from './community.mjs';
import {smsReady,mailReady,sendSms,checkSms,sendMail} from './providers.mjs';
const T=()=>Math.floor(Date.now()/1000),ID=()=>crypto.randomUUID().replaceAll('-','');
const E=new TextEncoder(),COOKIE='__Host-texopub';
export class AccountError extends Error{constructor(status,message){super(message);this.status=status;}}
const bad=(n,m)=>{throw new AccountError(n,m);};
const S=(e,q,...p)=>e.DB.prepare(q).bind(...p);
const one=(e,q,...p)=>S(e,q,...p).first();
const all=async(e,q,...p)=>(await S(e,q,...p).all()).results;
export async function sha(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',E.encode(v)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
async function mac(e,v){if(!e.AUTH_PEPPER)bad(503,'登录服务尚未配置');const k=await crypto.subtle.importKey('raw',E.encode(e.AUTH_PEPPER),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,E.encode(v)))].map(n=>n.toString(16).padStart(2,'0')).join('');}
function random(){return ID()+ID();}
async function body(r){const raw=await r.text();if(raw.length>8192)bad(413,'请求过大');try{return JSON.parse(raw);}catch{bad(400,'需要JSON请求');}}
function out(v,status=200,cookie){const headers={'Cache-Control':'no-store','Content-Type':'application/json','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};if(cookie)headers['Set-Cookie']=cookie;return new Response(JSON.stringify(v),{status,headers});}
const appOrigin=e=>e.APP_ORIGIN||'https://texopub.com';
function browser(r,e){if(new URL(r.url).origin!==appOrigin(e))bad(403,'请从本站个人空间操作');if(r.method!=='GET'&&(r.headers.get('Origin')!==appOrigin(e)||r.headers.get('X-TexoPub-Request')!=='space'))bad(403,'请刷新个人空间后重试');}
const cookie=(token,age=2592000)=>`${COOKIE}=${token}; Path=/; Max-Age=${age}; HttpOnly; Secure; SameSite=Lax`;
export async function browserAccount(r,e,recent=false){
 browser(r,e);const token=r.headers.get('Cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(COOKIE+'='))?.slice(COOKIE.length+1);if(!token)bad(401,'请先登录');
 const a=await one(e,'SELECT a.*,s.created AS verified_at,s.token_hash AS session_hash FROM login_sessions s JOIN accounts a ON a.id=s.account_id JOIN publishers p ON p.id=a.publisher_id WHERE s.token_hash=? AND s.expires>? AND p.revoked=0',await sha(token),T());
 if(!a)bad(401,'登录已过期，请重新验证');if(recent&&a.verified_at<T()-900)bad(401,'此操作需要重新验证手机号或备用邮箱');return a;
}
export async function publisherAuth(r,e){
 const token=r.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];
 if(!token){if(!r.headers.get('Cookie')?.includes(COOKIE+'='))bad(401,'请先登录或配置发布密钥');const a=await browserAccount(r,e);return one(e,'SELECT * FROM publishers WHERE id=? AND revoked=0',a.publisher_id);}
 const h=await sha(token),k=await one(e,'SELECT k.*,p.name AS publisher_name,p.quota_bytes,p.daily_uploads,p.default_listing FROM api_keys k JOIN publishers p ON p.id=k.publisher_id WHERE k.token_hash=? AND k.revoked=0 AND k.expires>? AND p.revoked=0',h,T());
 if(k){if(k.scope==='read'&&!['GET','HEAD'].includes(r.method))bad(403,'此密钥只有读取权限');await S(e,'UPDATE api_keys SET last_used=? WHERE id=?',T(),k.id).run();return {id:k.publisher_id,name:k.publisher_name,quota_bytes:k.quota_bytes,daily_uploads:k.daily_uploads,default_listing:k.default_listing};}
 const p=await one(e,'SELECT * FROM publishers WHERE token_hash=? AND revoked=0',h);if(!p)bad(401,'密钥不存在、已过期或已撤销');return p;
}
const maskedPhone=v=>v.slice(0,3)+'****'+v.slice(-4);
const maskedMail=v=>v?v.slice(0,1)+'***@'+v.split('@')[1]:null;
async function accountInfo(e,a){const p=await one(e,'SELECT * FROM publishers WHERE id=?',a.publisher_id);return {id:a.id,publisher_id:a.publisher_id,name:p.name,bio:p.bio||'',avatar_url:p.avatar_url||'',profile_revision:p.profile_revision||0,default_listing:p.default_listing,phone:maskedPhone(a.phone),email:maskedMail(a.email),email_bound:!!a.email,profile_public:!!a.profile_public,homepage:a.profile_public?appOrigin(e)+'/u/'+a.publisher_id+'/':null,reauth_required:a.verified_at<T()-900};}
// Calendar months are clamped to the last day of the destination month.
export function keyExpiry(b,at=T()){
 if(b.days!==undefined){const days=Number(b.days);if(!Number.isInteger(days)||days<1||days>3650)bad(400,'自定义有效期为1到3650天');return at+days*86400;}
 const months=Number(b.months??6);if(!Number.isInteger(months)||months<1||months>120)bad(400,'有效期为1到120个月');
 const d=new Date(at*1000),day=d.getUTCDate();d.setUTCDate(1);d.setUTCMonth(d.getUTCMonth()+months);const end=new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth()+1,0)).getUTCDate();d.setUTCDate(Math.min(day,end));return Math.floor(d.getTime()/1000);
}
async function limit(e,key,max,seconds){const bucket=Math.floor(T()/seconds),k=await mac(e,key+':'+bucket);const n=await S(e,'INSERT INTO auth_limits(key,n,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET n=n+1 RETURNING n',k,(bucket+1)*seconds).first();if(n.n>max)bad(429,'操作过于频繁，请稍后重试');}
function phone(v){const p=String(v||'').replace(/^\+86/,'').replace(/[\s-]/g,'');if(!/^1[3-9]\d{9}$/.test(p))bad(400,'请输入中国大陆手机号');return p;}
function email(v){const x=String(v||'').trim().toLowerCase();if(x.length>254||!/^[-a-z0-9.!#$%&'*+/=?^_`{|}~]+@[a-z0-9-]+(?:\.[a-z0-9-]+)+$/.test(x))bad(400,'请输入有效邮箱');return x;}
function otp(){const a=new Uint32Array(1);do{crypto.getRandomValues(a);}while(a[0]>=4294000000);return String(a[0]%1000000).padStart(6,'0');}
async function challenge(r,e){
 browser(r,e);const b=await body(r),channel=b.channel,purpose=b.purpose||'login';if(!['sms','email'].includes(channel)||!['login','email-bind','phone-bind'].includes(purpose))bad(400,'无效验证方式');
 if(!e.AUTH_PEPPER||!(channel==='sms'?smsReady(e):mailReady(e)))bad(503,channel==='sms'?'短信登录尚未开通，请稍后再来':'备用邮箱服务尚未开通');
 let a=null;if(purpose!=='login')a=await browserAccount(r,e,true);
 if((purpose==='email-bind'&&channel!=='email')||(purpose==='phone-bind'&&channel!=='sms'))bad(400,'验证方式不符');
 const subject=channel==='sms'?phone(b.subject):email(b.subject),at=T();
 await limit(e,'ip:'+ (r.headers.get('CF-Connecting-IP')||'unknown'),20,3600);
 await limit(e,'subject-minute:'+subject,1,60);await limit(e,'subject-day:'+subject,10,86400);
 if(channel==='sms')await limit(e,'sms-budget:'+String(e.SMS_BUDGET_ID||'initial'),Number(e.SMS_TOTAL_LIMIT||1000),3153600000);
 else await limit(e,'mail-budget:'+String(e.MAIL_BUDGET_ID||'initial'),Number(e.MAIL_TOTAL_LIMIT||2000),3153600000);
 await limit(e,'global:'+channel,Number(channel==='sms'?e.SMS_DAILY_LIMIT||100:e.MAIL_DAILY_LIMIT||100),86400);
 let known=null;if(channel==='email'&&purpose==='login')known=await one(e,'SELECT id FROM accounts WHERE email=?',subject);
 const cid=ID(),code=channel==='email'?otp():null;
 await S(e,'DELETE FROM auth_challenges WHERE expires<?',at-86400).run();await S(e,'DELETE FROM auth_limits WHERE expires<?',at-86400).run();await S(e,'DELETE FROM login_sessions WHERE expires<?',at).run();
 await S(e,'INSERT INTO auth_challenges(id,channel,purpose,subject,account_id,code_hash,created,expires) VALUES(?,?,?,?,?,?,?,?)',cid,channel,purpose,subject,a?.id||null,code?await mac(e,cid+':'+code):null,at,at+300).run();
 // Email login is for verified, already-bound addresses only. Always return the same result.
 try{if(channel==='sms')await sendSms(e,subject,cid);else if(purpose==='email-bind'||known)await sendMail(e,subject,code);}catch{await S(e,'UPDATE auth_challenges SET used=1 WHERE id=?',cid).run();bad(503,'验证码发送未完成，请稍后重试');}
 await e.DB.batch([S(e,'UPDATE auth_challenges SET used=1 WHERE subject=? AND id!=? AND used=0',subject,cid),S(e,'UPDATE auth_challenges SET ready=1 WHERE id=?',cid)]);
 return out({challenge_id:cid,expires_in:300,retry_after:60,message:channel==='email'&&purpose==='login'?'若该邮箱已绑定，验证码将发送至邮箱':'验证码已发送'});
}
async function verify(r,e){
 browser(r,e);const b=await body(r);if(!/^[a-f0-9]{32}$/.test(b.challenge_id||'')||!/^\d{6}$/.test(b.code||''))bad(400,'请输入6位验证码');
 await limit(e,'verify-ip:'+ (r.headers.get('CF-Connecting-IP')||'unknown'),60,600);
 const c=await one(e,'SELECT * FROM auth_challenges WHERE id=? AND ready=1',b.challenge_id);if(!c||c.used||c.expires<T()||c.attempts>=5)bad(400,'验证码已失效，请重新获取');
 let a=null;if(c.purpose!=='login'){a=await browserAccount(r,e,true);if(c.account_id!==a.id)bad(403,'验证不属于当前账号');}
 const attempt=await S(e,'UPDATE auth_challenges SET attempts=attempts+1 WHERE id=? AND used=0 AND attempts<5 RETURNING attempts',c.id).first();if(!attempt)bad(400,'验证码已失效');
 let valid=false;try{valid=c.channel==='sms'?await checkSms(e,c.subject,c.id,b.code):(await mac(e,c.id+':'+b.code))===c.code_hash;}catch{bad(503,'验证服务暂时不可用，请稍后重试');}
 if(!valid)bad(400,'验证码不正确或已失效');
 const claimed=await S(e,'UPDATE auth_challenges SET used=1 WHERE id=? AND used=0 AND expires>=? RETURNING id',c.id,T()).first();if(!claimed)bad(400,'验证码已使用');
 if(c.purpose!=='login'){
  try{if(c.purpose==='email-bind')await S(e,'UPDATE accounts SET email=? WHERE id=?',c.subject,a.id).run();else await S(e,'UPDATE accounts SET phone=? WHERE id=?',c.subject,a.id).run();}catch{bad(409,'此手机号或邮箱已绑定其他空间');}
  await S(e,'DELETE FROM login_sessions WHERE account_id=? AND token_hash!=?',a.id,a.session_hash).run();return out({bound:true});
 }
 a=await one(e,c.channel==='sms'?'SELECT * FROM accounts WHERE phone=?':'SELECT * FROM accounts WHERE email=?',c.subject);
 if(!a&&c.channel==='email')bad(400,'验证码不正确或邮箱尚未绑定');
 if(!a){const pid=ID(),aid=ID();try{await e.DB.batch([S(e,'INSERT INTO publishers(id,name,token_hash,created,name_source,lexicon_version) VALUES(?,?,?,?,?,?)',pid,defaultCreatorName(pid),'disabled:'+random(),T(),'generated',1),S(e,'INSERT INTO accounts(id,publisher_id,phone,created) VALUES(?,?,?,?)',aid,pid,c.subject,T())]);}catch(err){a=await one(e,'SELECT * FROM accounts WHERE phone=?',c.subject);if(!a)throw err;}if(!a)a=await one(e,'SELECT * FROM accounts WHERE id=?',aid);}
 const p=await one(e,'SELECT revoked FROM publishers WHERE id=?',a.publisher_id);if(p.revoked)bad(403,'此空间已停用');
 const token=random();await S(e,'INSERT INTO login_sessions(token_hash,account_id,created,expires) VALUES(?,?,?,?)',await sha(token),a.id,T(),T()+2592000).run();return out({logged_in:true},200,cookie(token));
}
export async function accountRoutes(r,e,u){
 const p=u.pathname;
 if(p==='/v1/auth/status'&&r.method==='GET')return out({sms:smsReady(e)&&!!e.AUTH_PEPPER,email:mailReady(e)&&!!e.AUTH_PEPPER});
 if(p==='/v1/auth/challenge'&&r.method==='POST')return challenge(r,e);
 if(p==='/v1/auth/verify'&&r.method==='POST')return verify(r,e);
 if(!p.startsWith('/v1/account'))return null;
 const a=await browserAccount(r,e);
 if(p==='/v1/account'&&r.method==='GET')return out(await accountInfo(e,a));
 if(p==='/v1/account/logout'&&r.method==='POST'){await S(e,'DELETE FROM login_sessions WHERE token_hash=?',a.session_hash).run();return out({logged_out:true},200,cookie('',0));}
 if(p==='/v1/account/logout-all'&&r.method==='POST'){await S(e,'DELETE FROM login_sessions WHERE account_id=?',a.id).run();return out({logged_out:true},200,cookie('',0));}
 if(p==='/v1/account/profile'&&r.method==='POST'){
  const b=await body(r),commands=[];if(b.name!==undefined){const name=String(b.name).trim();if(!name||name.length>80)bad(400,'名称需要1到80个字');commands.push(S(e,"UPDATE publishers SET name=?,name_source='custom',profile_revision=profile_revision+1 WHERE id=?",name,a.publisher_id));}
  if(b.public!==undefined){if(typeof b.public!=='boolean')bad(400,'请选择主页是否公开');commands.push(S(e,'UPDATE accounts SET profile_public=? WHERE id=?',b.public?1:0,a.id));}
  if(!commands.length)bad(400,'没有需要保存的设置');await e.DB.batch(commands);return out(await accountInfo(e,{...a,profile_public:b.public===undefined?a.profile_public:Number(b.public)}));
 }
 if(p==='/v1/account/keys'&&r.method==='GET')return out({items:await all(e,'SELECT id,name,prefix,scope,created,expires,revoked,last_used FROM api_keys WHERE publisher_id=? ORDER BY created DESC LIMIT 100',a.publisher_id),legacy_key_active:!(await one(e,'SELECT token_hash FROM publishers WHERE id=?',a.publisher_id)).token_hash.startsWith('disabled:')});
 if(p==='/v1/account/keys'&&r.method==='POST'){
  await browserAccount(r,e,true);const b=await body(r),name=String(b.name||'').trim(),expires=keyExpiry(b),scope=b.scope||'publish';if(!name||name.length>80||!['publish','read'].includes(scope))bad(400,'请填写名称和权限');
  const active=await one(e,'SELECT COUNT(*) AS n FROM api_keys WHERE publisher_id=? AND revoked=0 AND expires>?',a.publisher_id,T());if(active.n>=20)bad(409,'最多保留20个有效密钥，请先撤销不用的密钥');
  const token='txp_'+random(),kid=ID();await S(e,'INSERT INTO api_keys(id,publisher_id,name,token_hash,prefix,scope,created,expires) VALUES(?,?,?,?,?,?,?,?)',kid,a.publisher_id,name,await sha(token),token.slice(0,8)+'…'+token.slice(-4),scope,T(),expires).run();return out({id:kid,token,api:e.API_ORIGIN||'https://commonplace-api.ivanliyuanning123.workers.dev',publisher_id:a.publisher_id,expires:expires},201);
 }
 const expiry=p.match(/^\/v1\/account\/keys\/([a-f0-9]{32})\/expiry$/);if(expiry&&r.method==='POST'){
  await browserAccount(r,e,true);const expires=keyExpiry(await body(r));const changed=await S(e,'UPDATE api_keys SET expires=? WHERE id=? AND publisher_id=? AND revoked=0',expires,expiry[1],a.publisher_id).run();if(!changed.meta.changes)bad(404,'密钥不存在或已撤销');return out({saved:true,expires});
 }
 const key=p.match(/^\/v1\/account\/keys\/([a-f0-9]{32})\/revoke$/);if(key&&r.method==='POST'){const changed=await S(e,'UPDATE api_keys SET revoked=1 WHERE id=? AND publisher_id=?',key[1],a.publisher_id).run();if(!changed.meta.changes)bad(404,'密钥不存在');return out({revoked:true});}
 if(p==='/v1/account/legacy-key/revoke'&&r.method==='POST'){await browserAccount(r,e,true);await S(e,'UPDATE publishers SET token_hash=? WHERE id=?','disabled:'+random(),a.publisher_id).run();return out({revoked:true});}
 if(p==='/v1/account/import'&&r.method==='POST'){
  await browserAccount(r,e,true);const b=await body(r),old=await one(e,'SELECT id FROM publishers WHERE token_hash=? AND revoked=0',await sha(String(b.token||'')));if(!old)bad(403,'旧凭证无效');if(old.id===a.publisher_id)return out({imported:true});
  const used=await one(e,'SELECT COUNT(*) AS n FROM works WHERE publisher_id=?',a.publisher_id);if(used.n)bad(409,'当前空间已有内容，不能直接切换旧身份');
  try{await e.DB.batch([S(e,'UPDATE accounts SET publisher_id=? WHERE id=?',old.id,a.id),S(e,'UPDATE api_keys SET revoked=1 WHERE publisher_id=?',a.publisher_id),S(e,'DELETE FROM login_sessions WHERE account_id=? AND token_hash!=?',a.id,a.session_hash)]);}catch{bad(409,'该旧发布身份已绑定其他账号');}return out({imported:true});
 }
 bad(404,'账号接口不存在');
}
