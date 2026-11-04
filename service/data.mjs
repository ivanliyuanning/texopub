import {deleteAppData} from './data-lifecycle.mjs';
import consoleTemplate from '../templates/data-console.html';
import connectTemplate from '../templates/data-connect.html';
import dataSDK from '../templates/data-sdk.html';
import {browserAccount,workAuthorAccount} from './accounts.mjs';
import {withWorkOperation} from './lifecycle.mjs';
import {DataError,DATA_LIMITS,at,uid,bytes,dstmt as S,done as one,dall as all,bad,object,identifier,collectionKey,revision,digest,boundedJSON,definition,compatible,validate,assetRefs,view,account,budget,batch,assertChanged} from './data-core.mjs';
export {DataError};
const M=(e,q,...p)=>e.DB.prepare(q).bind(...p),main=(e,q,...p)=>M(e,q,...p).first();
const APP=e=>e.APP_ORIGIN||'https://texopub.com';
export function dataJSON(value,status=200){return new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json;charset=utf-8','Cache-Control':'no-store','Access-Control-Allow-Origin':'*','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'}});}
function enabled(e,pid){if(!e.DATA_DB||!(e.DATA_PUBLISHERS||'').split(',').map(x=>x.trim()).includes(pid))bad(403,'data_not_enabled','此空间尚未开启数据试用');}
const scope=k=>'texopub:data:'+k;
async function identity(r,e,p,needed,appId){
 let auth;
 if(p){auth={pid:p.id,scopes:p.scope?.split(' ')||[],apps:['*']};}
 else if(r.headers.has('Authorization')){const token=r.headers.get('Authorization')?.match(/^Bearer (txd_[a-f0-9]{64})$/)?.[1];if(!token)bad(403,'data_scope_required','发布密钥不含数据权限；请使用独立数据密钥或明确授权的数据OAuth连接');
 const k=await one(e,'SELECT * FROM data_credentials WHERE token_hash=? AND revoked=0 AND expires>?',await digest(token),at());if(!k)bad(401,'data_key_invalid','数据密钥无效、已过期或撤销');auth={pid:k.publisher_id,scopes:JSON.parse(k.scopes),apps:JSON.parse(k.apps)};
 }else{const a=await browserAccount(r,e);auth={pid:a.publisher_id,scopes:['read','write','manage'].map(scope),apps:['*'],browser:a};}
 enabled(e,auth.pid);if(!auth.scopes.includes(scope(needed)))bad(403,'data_scope_required','此凭证没有所需数据权限：'+scope(needed));
 if(appId&&!auth.apps.includes('*')&&!auth.apps.includes(appId))bad(403,'data_app_forbidden','数据密钥未授权此应用');
 if(!await main(e,'SELECT id FROM publishers WHERE id=? AND revoked=0',auth.pid))bad(401,'account_revoked','账号已停用');return auth;
}
async function ownApp(e,pid,id){identifier(id);const a=await one(e,"SELECT * FROM data_apps WHERE id=? AND publisher_id=? AND state!='deleted'",id,pid);if(!a)bad(404,'app_not_found','数据应用不存在');return a;}
function appView(a){return {id:a.id,work_id:a.work_id,state:a.state,revision:a.revision,pending_revision:a.pending_revision,config:JSON.parse(a.active_config),pending_config:JSON.parse(a.pending_config),bytes:a.bytes,records:a.records,quota_bytes:DATA_LIMITS.app_bytes};}
export async function prepareDataBinding(e,p,work,b){
 const old=work?JSON.parse(work.metadata).data_binding:undefined;
 if(b===undefined){if(old&&e.DATA_DB&&(await one(e,'SELECT state FROM data_apps WHERE id=?',old.app_id))?.state==='deleted')return undefined;return old;} if(b===null){if(old)bad(409,'data_binding_required','请先暂停并删除数据应用，再解除绑定');return undefined;}
 if(!object(b))bad(422,'invalid_binding','data_binding需要app_id、revision和config_hash');enabled(e,p.id);const a=await ownApp(e,p.id,identifier(b.app_id));if(!work||a.work_id!==work.id)bad(403,'data_binding_forbidden','数据应用只可绑定原作品');
 const pending=b.revision===a.pending_revision,conf=pending?a.pending_config:a.active_config;
 if(!Number.isSafeInteger(b.revision)||b.revision<1||(!pending&&b.revision!==a.revision)||b.config_hash!==await digest(JSON.parse(conf)))bad(409,'data_binding_stale','数据配置已变化，请重新读取应用');return {app_id:a.id,revision:b.revision,config_hash:b.config_hash};
}
export async function activateDataBinding(e,w){
 const b=JSON.parse(w.metadata).data_binding;if(!b)return;
 enabled(e,w.publisher_id);const a=await ownApp(e,w.publisher_id,b.app_id);
 if(a.work_id!==w.id)bad(409,'data_binding_stale','数据应用绑定不匹配');
 if(a.revision===b.revision&&await digest(JSON.parse(a.active_config))===b.config_hash)return;
 if(a.pending_revision!==b.revision||await digest(JSON.parse(a.pending_config))!==b.config_hash)bad(409,'data_binding_stale','作品的数据配置已过期');
 const conf=JSON.parse(a.pending_config),commands=[];
 for(const [key,def] of Object.entries(conf.collections)){const prev=await one(e,'SELECT * FROM data_collections WHERE app_id=? AND key=?',a.id,key);if(prev?.records)compatible(JSON.parse(prev.definition),def);
 commands.push(S(e,'INSERT INTO data_collections(app_id,key,definition) VALUES(?,?,?) ON CONFLICT(app_id,key) DO UPDATE SET definition=excluded.definition,revision=data_collections.revision+1',a.id,key,JSON.stringify(def)));}
 commands.push(S(e,"UPDATE data_apps SET active_config=pending_config,revision=pending_revision,updated=? WHERE id=? AND pending_revision=? AND pending_config=? AND state!='deleted'",at(),a.id,b.revision,a.pending_config));await batch(e,assertChanged(e,commands));
}
async function configure(e,a,b){
 if(b.expected_revision!==a.pending_revision)bad(409,'revision_conflict','请提供当前pending_revision');if(!object(b.collections)||!Object.keys(b.collections).length||Object.keys(b.collections).length>10)bad(422,'invalid_schema','每应用需要1到10集合');
 const conf={collections:{}};for(const [k,v] of Object.entries(b.collections)){collectionKey(k);conf.collections[k]=definition(v);const prev=await one(e,'SELECT * FROM data_collections WHERE app_id=? AND key=?',a.id,k);if(prev?.records)compatible(JSON.parse(prev.definition),conf.collections[k]);}
 const old=JSON.parse(a.active_config);for(const k of Object.keys(old.collections||{}))if(!conf.collections[k]&&await one(e,'SELECT key FROM data_collections WHERE app_id=? AND key=?',a.id,k))bad(409,'collection_delete_required','请先明确删除集合，再移除配置');
 if(bytes(conf)>65536)bad(413,'config_too_large','配置最多64KiB');const next=Math.max(a.revision,a.pending_revision)+1;
 await batch(e,assertChanged(e,[S(e,"UPDATE data_apps SET pending_config=?,pending_revision=?,updated=? WHERE id=? AND pending_revision=? AND state!='deleted'",JSON.stringify(conf),next,at(),a.id,b.expected_revision)]));
 return {app:appView(await ownApp(e,a.publisher_id,a.id)),data_binding:{app_id:a.id,revision:next,config_hash:await digest(conf)},publish_required:true};
}
async function collection(e,a,key,management=false){collectionKey(key);if(a.state!=='active'&&!management)bad(409,'app_inactive','数据应用已暂停或正在删除');const c=await one(e,'SELECT * FROM data_collections WHERE app_id=? AND key=?',a.id,key);if(!c||c.deleting)bad(404,'collection_not_found','集合不存在或配置尚未随网页发布');return {...c,def:JSON.parse(c.definition)};}
function context(a,c,actor,write){
 if(actor.management)return {subject:null,management:true};
 if(c.def.mode==='owner'||c.def.mode==='public_read'&&write){if(actor.pid!==a.publisher_id)bad(403,'owner_required','仅作品作者可执行此操作');return {subject:a.publisher_id};}
 if(c.def.mode==='public_read')return {subject:a.publisher_id};
 if(!actor.account_id)bad(401,'connect_required','请先连接TexoPub账号');return {subject:actor.account_id};
}
async function readRecord(e,a,c,id,ctx){identifier(id);const row=await one(e,'SELECT * FROM data_records WHERE app_id=? AND collection=? AND id=?'+(ctx.subject!==null?' AND subject_id=?':''),a.id,c.key,id,...(ctx.subject!==null?[ctx.subject]:[]));if(!row)bad(404,'record_not_found','记录不存在');return row;}
function cursorEncode(v){return btoa(unescape(encodeURIComponent(JSON.stringify(v)))).replaceAll('+','-').replaceAll('/','_').replace(/=+$/,'');}
function cursorDecode(v){try{if(typeof v!=='string'||v.length>4096)throw 0;return JSON.parse(decodeURIComponent(escape(atob(v.replaceAll('-','+').replaceAll('_','/')))));}catch{bad(400,'invalid_cursor','分页游标无效');}}
async function query(e,a,c,ctx,b){
 const limit=b.limit??20;if(!Number.isInteger(limit)||limit<1||limit>50)bad(422,'invalid_limit','每页1到50条');const fields=b.fields;if(fields!==undefined&&(!Array.isArray(fields)||fields.some(k=>!Object.hasOwn(c.def.fields,k))))bad(422,'invalid_fields','fields仅可选择已声明字段');
 const eq=b.where||{};if(!object(eq)||Object.keys(eq).length>2)bad(422,'invalid_query','where仅接受声明索引的等值条件');let ix=-1;
 if(Object.keys(eq).length){ix=c.def.indexes.findIndex(idx=>idx.length===Object.keys(eq).length&&idx.every(k=>Object.hasOwn(eq,k)));if(ix<0)bad(422,'index_required','查询条件需要完整匹配已声明索引');validate({...c.def,fields:Object.fromEntries(Object.entries(c.def.fields).map(([k,f])=>[k,{...f,required:false}])),indexes:[]},eq);}
 const fingerprint=await digest({app:a.id,col:c.key,subject:ctx.subject,eq,fields:fields||null});let last='';if(b.cursor){const cur=cursorDecode(b.cursor);if(cur.hash!==fingerprint||cur.seq!==c.change_seq)bad(409,'cursor_stale','记录已变化，请从第一页重新读取');last=identifier(cur.last);}
 const params=[a.id,c.key],clauses=['app_id=?','collection=?'];if(ctx.subject!==null){clauses.push('subject_id=?');params.push(ctx.subject);}if(ix>=0)for(const [j,k] of c.def.indexes[ix].entries()){const value=eq[k];if(value!==null&&!['string','number','boolean'].includes(typeof value))bad(422,'invalid_query','索引值必须是标量');clauses.push(`k${ix*2+j+1} IS ?`);params.push(typeof value==='boolean'?Number(value):value);}
 if(ix>=0&&c.def.indexes[ix].length===1)clauses.push(`k${ix*2+2} IS NULL`);
 if(last){clauses.push('id>?');params.push(last);}params.push(limit+1);
 const index=ctx.subject!==null?(ix<0?'data_records_scope':`data_records_k${ix*2+1}`):(ix<0?'data_records_admin':`data_records_admin_k${ix*2+1}`);
 const rows=await all(e,`SELECT * FROM data_records INDEXED BY ${index} WHERE ${clauses.join(' AND ')} ORDER BY id LIMIT ?`,...params);const result=[];let size=1024;for(const row of rows.slice(0,limit)){const v={...view(row,fields),...(ctx.management?{subject_id:row.subject_id}:{})},cost=bytes(v);if(result.length&&size+cost>250000)break;size+=cost;result.push(v);}const more=rows.length>result.length;
 return {records:result,next_cursor:more?cursorEncode({hash:fingerprint,seq:c.change_seq,last:result.at(-1).id}):null,change_seq:c.change_seq};
}
async function refsFromStored(e,a,c,id){const current=await one(e,'SELECT data FROM data_records WHERE app_id=? AND id=?',a.id,id);const hist=await all(e,'SELECT data FROM data_history WHERE app_id=? AND record_id=?',a.id,id);return [current,...hist].filter(Boolean).flatMap(x=>assetRefs(c.def,JSON.parse(x.data)));}
async function syncPins(e,a,c,id){const refs=await refsFromStored(e,a,c,id);await e.DB.batch([M(e,'DELETE FROM data_resource_pins WHERE app_id=? AND record_id=?',a.id,id),M(e,"INSERT OR IGNORE INTO data_resource_pins SELECT ?,?,?,json_extract(value,'$.work_id'),json_extract(value,'$.version'),json_extract(value,'$.path') FROM json_each(?)",a.id,id,a.publisher_id,JSON.stringify(refs))]);await S(e,'DELETE FROM data_pin_jobs WHERE app_id=? AND record_id=?',a.id,id).run();}
async function pinned(e,a,c,id,next,fn,locked=false){
 if(!locked)return withWorkOperation(e,a.work_id,()=>pinned(e,a,c,id,next,fn,true));
 await S(e,'INSERT OR IGNORE INTO data_pin_jobs VALUES(?,?,?)',a.id,id,c.key).run();
 const refs=[...await refsFromStored(e,a,c,id),...assetRefs(c.def,next||{})];const ids=[...new Set(refs.map(r=>r.work_id))].sort();if(ids.length>8)bad(422,'asset_reference_limit','单条记录及历史最多关联8组素材，请先清理旧历史');
 async function lock(n){if(n<ids.length)return withWorkOperation(e,ids[n],()=>lock(n+1));
  if(ids.length>8)bad(422,'asset_reference_limit','单条记录及历史最多关联8组素材，请先清理旧历史');
  if(refs.length){const invalid=await main(e,"SELECT value FROM json_each(?) j WHERE NOT EXISTS(SELECT 1 FROM works w JOIN versions v ON v.work_id=w.id JOIN files f ON f.version_id=v.id WHERE w.id=json_extract(j.value,'$.work_id') AND w.publisher_id=? AND w.kind='asset' AND w.status='published' AND w.deleted_at IS NULL AND v.id=json_extract(j.value,'$.version') AND v.state='published' AND f.path=json_extract(j.value,'$.path') AND f.ready=1) LIMIT 1",JSON.stringify(refs),a.publisher_id);if(invalid)bad(409,'asset_unavailable','素材引用必须是本人已发布的素材文件');
   await M(e,"INSERT OR IGNORE INTO data_resource_pins SELECT ?,?,?,json_extract(value,'$.work_id'),json_extract(value,'$.version'),json_extract(value,'$.path') FROM json_each(?)",a.id,id,a.publisher_id,JSON.stringify(refs)).run();}
  try{return await fn();}finally{await syncPins(e,a,c,id);}
 }return lock(0);
}
async function perform(e,a,c,actor,op,b){
 const write=['create','update','remove','restore','clear_history'].includes(op);if(write&&a.state!=='active'&&!['remove','clear_history'].includes(op))bad(409,'app_inactive','暂停期间仅可读取、导出和清理数据');const ctx=context(a,c,actor,write);await budget(e,a.publisher_id,write,op==='query'?128:64);
 if(op==='query')return query(e,a,c,ctx,b);
 if(op==='get'){const row=await readRecord(e,a,c,b.id,ctx);return {record:{...view(row),...(ctx.management?{subject_id:row.subject_id}:{})}};}
 if(op==='history'){const r=await readRecord(e,a,c,b.id,ctx);const rows=await all(e,'SELECT revision,data,created,expires FROM data_history WHERE record_id=? AND expires>? ORDER BY revision DESC LIMIT 5',r.id,at());return {record_id:r.id,revision:r.revision,history:rows.map(x=>({...x,data:JSON.parse(x.data)}))};}
 if(op==='create'){
  const v=validate(c.def,b.data),key=b.idempotency_key;if(typeof key!=='string'||!/^[A-Za-z0-9_-]{8,100}$/.test(key))bad(428,'idempotency_required','新增需要8到100位idempotency_key');
  const subject=ctx.subject??(c.def.mode==='user_private'?b.subject_id:a.publisher_id);if(typeof subject!=='string'||!/^[a-f0-9]{32}$/.test(subject))bad(422,'subject_required','私有集合管理新增需明确subject_id（账号ID）');
  const h=await digest(v.data);const previous=await one(e,'SELECT * FROM data_idempotency WHERE app_id=? AND collection=? AND subject_id=? AND key=? AND expires>?',a.id,c.key,subject,key,at());
  if(previous){if(previous.hash!==h)bad(409,'idempotency_conflict','幂等键已经用于其他内容');const r=await one(e,'SELECT * FROM data_records WHERE id=? AND app_id=?',previous.record_id,a.id);if(!r)bad(409,'idempotency_deleted','原记录已删除，请使用新幂等键');return {record:view(r),replayed:true};}
  const id=uid(),n=at();try{return await pinned(e,a,c,id,v.data,async()=>{await batch(e,[S(e,'DELETE FROM data_idempotency WHERE app_id=? AND collection=? AND subject_id=? AND key=? AND expires<=?',a.id,c.key,subject,key,n),S(e,'INSERT INTO data_records(id,app_id,collection,publisher_id,subject_id,data,charge,created,updated,k1,k2,k3,k4,k5,k6) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',id,a.id,c.key,a.publisher_id,subject,JSON.stringify(v.data),v.charge,n,n,...v.keys),S(e,'INSERT INTO data_idempotency VALUES(?,?,?,?,?,?,?)',a.id,c.key,subject,key,h,id,n+86400)]);return {record:view(await one(e,'SELECT * FROM data_records WHERE id=?',id))};});}catch(err){if(/UNIQUE constraint/.test(err.message))return perform(e,a,c,actor,op,b);throw err;}
 }
 const row=await readRecord(e,a,c,b.id,ctx),rev=revision(b);if(rev!==row.revision)bad(409,'revision_conflict','记录已更新，请重新读取',{current_revision:row.revision});
 if(op==='clear_history'){if(b.confirm!==true)bad(400,'confirmation_required','清空历史需要confirm=true');return pinned(e,a,c,row.id,{},async()=>{await batch(e,assertChanged(e,[S(e,'UPDATE data_records SET updated=updated WHERE id=? AND revision=?',row.id,rev)]).concat([S(e,'DELETE FROM data_history WHERE record_id=?',row.id)]));return {cleared:true};});}
 if(op==='remove'){return pinned(e,a,c,row.id,{},async()=>{await batch(e,assertChanged(e,[S(e,'DELETE FROM data_records WHERE id=? AND revision=? AND app_id=?',row.id,rev,a.id)]));return {deleted:true,record_id:row.id};});}
 let data=b.data;if(op==='restore'){const h=await one(e,'SELECT data FROM data_history WHERE record_id=? AND revision=? AND expires>?',row.id,b.history_revision,at());if(!h)bad(404,'history_not_found','历史不存在或已过期');data=JSON.parse(h.data);}
 if(!['update','restore'].includes(op))bad(400,'invalid_operation','不支持的数据操作');const v=validate(c.def,data),n=at();
 return pinned(e,a,c,row.id,v.data,async()=>{const commands=[];
  // Retain at most five previous revisions for seven days; expiry/pruning releases quota.
  commands.push(S(e,'DELETE FROM data_history WHERE record_id=? AND (expires<=? OR revision NOT IN (SELECT revision FROM data_history WHERE record_id=? ORDER BY revision DESC LIMIT 4))',row.id,n,row.id));
  if(c.def.history)commands.push(S(e,'INSERT INTO data_history SELECT id,revision,app_id,publisher_id,data,charge,updated,? FROM data_records WHERE id=? AND revision=?',n+7*86400,row.id,rev));
  commands.push(S(e,'UPDATE data_records SET data=?,charge=?,revision=revision+1,updated=?,k1=?,k2=?,k3=?,k4=?,k5=?,k6=? WHERE id=? AND revision=? AND app_id=? AND EXISTS(SELECT 1 FROM data_apps WHERE id=? AND state=\'active\')',JSON.stringify(v.data),v.charge,n,...v.keys,row.id,rev,a.id,a.id));
  await batch(e,assertChanged(e,commands));return {record:view(await one(e,'SELECT * FROM data_records WHERE id=?',row.id))};
 });
}
// The viewer ticket is public context, never an account credential. Runtime calls still
// require a live author login, or an explicit session-bound visitor grant.
async function sign(e,payload){if(!e.DATA_BRIDGE_SECRET)bad(503,'data_unconfigured','数据连接尚未配置');const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(e.DATA_BRIDGE_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);return [...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(payload)))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function viewerData(e,w,version,viewerOrigin){const b=JSON.parse(w.version_metadata||w.metadata).data_binding;if(!b||!e.DATA_BRIDGE_SECRET)return null;const payload=cursorEncode({app_id:b.app_id,work_id:w.work_id||w.id,version,revision:b.revision,config_hash:b.config_hash,origin:viewerOrigin,nonce:uid(),expires:at()+3600});return {ticket:payload+'.'+await sign(e,payload),api:APP(e)+'/api/v1/data',app_origin:APP(e),login_url:APP(e)+'/login/?next='+encodeURIComponent('/api/v1/data/return?work_id='+(w.work_id||w.id))};}
async function ticket(e,raw,author=false){if(typeof raw!=='string'||raw.length>4096)bad(401,'invalid_viewer','无效网页连接');const [p,s,...tail]=raw.split('.');if(tail.length||!s||s.length!==64||s!==await sign(e,p))bad(401,'invalid_viewer','网页连接签名无效');const t=cursorDecode(p);if(!author&&t.expires<at())bad(401,'viewer_expired','网页连接已过期，请刷新网页');
 const a=await one(e,'SELECT * FROM data_apps WHERE id=?',identifier(t.app_id));if(!a)bad(404,'app_not_found','数据应用不存在');enabled(e,a.publisher_id);
 const w=await main(e,"SELECT w.*,p.revoked FROM works w JOIN publishers p ON p.id=w.publisher_id WHERE w.id=? AND w.status='published' AND w.deleted_at IS NULL",t.work_id);const binding=w&&JSON.parse(w.metadata).data_binding;
 if(!w||w.revoked||a.state!=='active'||w.current_version!==t.version||a.work_id!==w.id||a.revision!==t.revision||binding?.app_id!==a.id||binding?.config_hash!==t.config_hash||binding?.revision!==a.revision||await digest(JSON.parse(a.active_config))!==t.config_hash)bad(409,'viewer_stale','作品已更新、暂停或下架，请刷新网页');return {t,a,w};}
export async function dataRoutes(r,e,u,p=null){
 if(!u.pathname.startsWith('/v1/data'))return null;
 if(e.DATA_RATE_LIMITER){const {success}=await e.DATA_RATE_LIMITER.limit({key:r.headers.get('CF-Connecting-IP')||'unknown'});if(!success)bad(429,'rate_limited','请求过于频繁，请稍后重试');}
 if(u.pathname==='/v1/data/sdk.js')return new Response(dataSDK,{headers:{'Content-Type':'application/javascript;charset=utf-8','Access-Control-Allow-Origin':'*','Cache-Control':'public,max-age=300'}});
 if(u.pathname==='/v1/data/console')return new Response(consoleTemplate,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});
 if(u.pathname==='/v1/data/connect'){return new Response(connectTemplate,{headers:{'Content-Type':'text/html;charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Cross-Origin-Opener-Policy':'unsafe-none','Content-Security-Policy':"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'"}});}
 if(u.pathname==='/v1/data/return'&&r.method==='GET'){
  const w=await main(e,"SELECT w.* FROM works w JOIN publishers p ON p.id=w.publisher_id WHERE w.id=? AND w.status='published' AND w.deleted_at IS NULL AND p.revoked=0",identifier(u.searchParams.get('work_id')));
  if(!w)bad(404,'work_not_found','作品已下架或不存在');
  return Response.redirect(e.CONTENT_ORIGIN.replace(/\/$/,'')+'/p/'+(w.public_slug||w.publisher_id+'/'+w.slug)+'/',302);
 }
 if(u.pathname==='/v1/data/capabilities')return dataJSON({version:'1',pilot:true,limits:DATA_LIMITS,scopes:['read','write','manage'].map(scope),modes:['owner','public_read','user_private'],file_storage_separate:true,query:'declared-index-equality; id-order; cursor',history:{revisions:5,days:7}});
 if(!e.DATA_DB)bad(503,'data_unconfigured','数据服务尚未配置');
 const path=u.pathname.slice('/v1/data'.length),b=['GET','HEAD'].includes(r.method)?{}:await boundedJSON(r);
 if(path==='/runtime/author'&&r.method==='POST'){
  const user=await workAuthorAccount(r,e),{t,a}=await ticket(e,b.ticket,true);
  if(r.headers.get('Origin')!==t.origin)bad(403,'forbidden','作品来源不匹配');
  if(user.publisher_id!==a.publisher_id)bad(403,'forbidden','仅作者可使用此作品的云端数据');
  // A signed ticket identifies public work context; it is never sufficient authority.
  // Author login and current published binding are checked anew on every call.
  if(b.operation==='connect')return dataJSON({connected:true,state:'ready',role:'author'});
  const c=await collection(e,a,collectionKey(b.collection));
  return dataJSON(await perform(e,a,c,{pid:user.publisher_id,account_id:user.id},b.operation,b.args||{}));
 }
 if(path.startsWith('/runtime/')){
  const {t,a,w}=await ticket(e,b.ticket),c=await collection(e,a,collectionKey(b.collection||Object.keys(JSON.parse(a.active_config).collections)[0]));
  if(path==='/runtime/info')return dataJSON({title:JSON.parse(w.metadata).title,author:JSON.parse(w.metadata).author,app_id:a.id,viewer_origin:t.origin,collections:Object.fromEntries(Object.entries(JSON.parse(a.active_config).collections).map(([k,v])=>[k,{mode:v.mode,history:v.history}])),notice:'作者及其获授权AI可管理本作品全部数据。user_private仅隔离其他访客，不对作者隐藏。'});
  if(path==='/runtime/grant'&&r.method==='POST'){const user=await browserAccount(r,e);if(b.confirm!==true)bad(400,'confirmation_required','需要本人确认连接');const id=uid();await budget(e,a.publisher_id,true);await S(e,'DELETE FROM data_grants WHERE expires<=?',at()).run();const count=await one(e,'SELECT COUNT(*) n FROM data_grants WHERE app_id=? AND expires>? AND revoked=0',a.id,at());if(count.n>=20)bad(429,'grant_limit','本作品同时最多20个连接，请撤销旧连接');await batch(e,[S(e,'INSERT INTO data_grants VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',id,a.id,a.publisher_id,user.id,user.session_hash,t.version,t.revision,t.nonce,at()+7200,0,at(),at())]);return dataJSON({grant_id:id,expires_at:at()+7200});}
  if(path==='/runtime/call'&&r.method==='POST'){
   let actor={};if(b.grant_id){const user=await browserAccount(r,e);const g=await one(e,'SELECT * FROM data_grants WHERE id=? AND app_id=? AND account_id=? AND session_hash=? AND viewer_nonce=? AND work_version=? AND config_revision=? AND revoked=0 AND expires>? AND last_used>?',identifier(b.grant_id),a.id,user.id,user.session_hash,t.nonce,t.version,t.revision,at(),at()-1800);if(!g)bad(401,'grant_expired','连接已失效，请重新连接');await S(e,'UPDATE data_grants SET last_used=? WHERE id=?',at(),g.id).run();actor={pid:user.publisher_id,account_id:user.id};}
   else if(c.def.mode!=='public_read'||!['get','query'].includes(b.operation))bad(401,'connect_required','请先连接TexoPub账号');
   return dataJSON(await perform(e,a,c,actor,b.operation,b.args||{}));
  }
  if(path==='/runtime/disconnect'&&r.method==='POST'){const user=await browserAccount(r,e);await S(e,'UPDATE data_grants SET revoked=1 WHERE id=? AND account_id=? AND session_hash=?',identifier(b.grant_id),user.id,user.session_hash).run();return dataJSON({disconnected:true});}
  bad(404,'not_found','数据接口不存在');
 }
 const match=path.match(/^\/apps\/([a-f0-9]{32})(?:\/(.*))?$/),appId=match?.[1],tail=match?.[2]||'';
 let needed=tail==='grants'?'manage':'read';if(r.method!=='GET')needed=tail.endsWith('/delete')?'manage':tail.match(/^collections\/[^/]+\/(query|get|history|export)$/)?'read':tail.startsWith('collections/')?'write':'manage';
 const auth=await identity(r,e,p,needed,appId),pid=auth.pid;const acc=await account(e,pid);
 if(!tail.startsWith('collections/')&&path!=='/usage'&&!(path==='/credentials'&&(r.method==='GET'||b.revoke)))await budget(e,pid,r.method!=='GET');
 if(path==='/usage'&&r.method==='GET'){const file=await main(e,'SELECT quota_bytes,(SELECT COALESCE(SUM(total_bytes),0) FROM versions WHERE publisher_id=publishers.id) bytes FROM publishers WHERE id=?',pid);return dataJSON({database:{...acc,quota_bytes:acc.quota,limits:DATA_LIMITS,usage_units:'保守操作预算；不是Cloudflare计费行数'},files:file,today:await one(e,'SELECT * FROM data_usage WHERE subject=? AND day=?',pid,Math.floor(at()/86400)),reset_at:(Math.floor(at()/86400)+1)*86400});}
 if(path==='/credentials'){
  if(!auth.browser)bad(403,'browser_required','数据密钥只能在本人设置中创建或撤销');
  if(r.method==='GET')return dataJSON({credentials:await all(e,'SELECT id,name,scopes,apps,expires,revoked,created FROM data_credentials WHERE publisher_id=? ORDER BY created DESC LIMIT 100',pid)});
  await browserAccount(r,e,true);if(b.revoke){await S(e,'UPDATE data_credentials SET revoked=1 WHERE id=? AND publisher_id=?',identifier(b.revoke),pid).run();return dataJSON({revoked:true});}
  const scopes=b.scopes,apps=b.apps;if(!Array.isArray(scopes)||!scopes.length||scopes.some(x=>!['read','write','manage'].map(scope).includes(x))||!Array.isArray(apps)||!apps.length||apps.length>3)bad(422,'invalid_scope','请明确数据权限和应用范围');for(const id of apps)if(id!=='*')await ownApp(e,pid,id);if(apps.includes('*')&&apps.length!==1)bad(422,'invalid_scope','全部应用不能与其他范围混用');
  if(!Number.isInteger(b.days)||b.days<1||b.days>180||typeof b.name!=='string'||!b.name.trim()||b.name.length>80)bad(422,'invalid_key','密钥需要名称和1到180天有效期');const count=await one(e,'SELECT COUNT(*) n FROM data_credentials WHERE publisher_id=? AND revoked=0 AND expires>?',pid,at());if(count.n>=10)bad(429,'key_limit','最多10个有效数据密钥');const token='txd_'+uid()+uid(),id=uid();await batch(e,[S(e,'INSERT INTO data_credentials VALUES(?,?,?,?,?,?,?,0,?)',id,pid,await digest(token),b.name,JSON.stringify([...new Set(scopes)]),JSON.stringify(apps),at()+b.days*86400,at())]);return dataJSON({id,token,expires_at:at()+b.days*86400},201);
 }
 if(path==='/apps'&&r.method==='GET'){const apps=(await all(e,"SELECT * FROM data_apps WHERE publisher_id=? AND state!='deleted' ORDER BY id",pid)).filter(a=>auth.apps.includes('*')||auth.apps.includes(a.id));const works=(await M(e,'SELECT id,metadata FROM works WHERE id IN (SELECT value FROM json_each(?))',JSON.stringify(apps.map(a=>a.work_id))).all()).results;return dataJSON({apps:apps.map(a=>({...appView(a),title:JSON.parse(works.find(w=>w.id===a.work_id)?.metadata||'{}').title||a.work_id}))});}
 if(path==='/apps'&&r.method==='POST'){
  if(!auth.apps.includes('*'))bad(403,'data_app_forbidden','创建应用需要全部应用管理授权');const w=await main(e,"SELECT * FROM works WHERE id=? AND publisher_id=? AND kind='work' AND deleted_at IS NULL AND json_extract(metadata,'$.source')='hosted'",identifier(b.work_id),pid);if(!w)bad(404,'work_not_found','请先发布本人托管网页，再为其创建数据应用');const id=uid();await S(e,"DELETE FROM data_apps WHERE work_id=? AND state='deleted'",w.id).run();try{await batch(e,[S(e,'INSERT INTO data_apps(id,publisher_id,work_id,created,updated) VALUES(?,?,?,?,?)',id,pid,w.id,at(),at())]);}catch(err){if(/UNIQUE/.test(err.message))bad(409,'app_exists','此作品已有数据应用');throw err;}return dataJSON({app:appView(await ownApp(e,pid,id))},201);
 }
 if(!match)bad(404,'not_found','数据接口不存在');const a=await ownApp(e,pid,appId);
 if(!tail&&r.method==='GET')return dataJSON({app:appView(a),collections:await all(e,'SELECT key,revision,records,change_seq,deleting FROM data_collections WHERE app_id=?',a.id),data_binding:a.pending_revision?{app_id:a.id,revision:a.pending_revision,config_hash:await digest(JSON.parse(a.pending_config))}:null});
 if(tail==='config'&&r.method==='POST'){return dataJSON(await configure(e,a,b));}
 if(tail==='state'&&r.method==='POST'){if(!['active','paused'].includes(b.state)||a.state==='deleting'||b.expected_revision!==a.revision)bad(409,'revision_conflict','状态无效或配置已变化');await batch(e,assertChanged(e,[S(e,"UPDATE data_apps SET state=?,updated=? WHERE id=? AND revision=? AND state IN ('active','paused')",b.state,at(),a.id,b.expected_revision)]));return dataJSON({app:appView(await ownApp(e,pid,a.id))});}
 if(tail==='delete'&&r.method==='POST'){if(b.confirm!==true||b.expected_revision!==a.revision)bad(409,'confirmation_required','删除需要confirm和当前revision');return dataJSON(await deleteAppData(e,a.work_id));}
 if(tail==='grants'&&r.method==='GET')return dataJSON({grants:await all(e,'SELECT id,created,expires,revoked,work_version FROM data_grants WHERE app_id=? ORDER BY created DESC LIMIT 30',a.id)});
 if(tail==='grants/revoke'&&r.method==='POST'){await S(e,'UPDATE data_grants SET revoked=1 WHERE app_id=? AND id=?',a.id,identifier(b.id)).run();return dataJSON({revoked:true});}
 const deletion=tail.match(/^collections\/([a-z][a-z0-9_]{0,39})\/delete$/);
 if(deletion&&r.method==='POST'){if(!auth.scopes.includes(scope('manage')))bad(403,'data_scope_required','删除集合需要数据管理权限');if(b.confirm!==true)bad(400,'confirmation_required','永久删除集合需要confirm=true');return dataJSON(await deleteCollection(e,a,deletion[1],b));}
 const cm=tail.match(/^collections\/([a-z][a-z0-9_]{0,39})\/(query|get|create|update|remove|history|restore|clear_history|export)$/);
 if(cm&&r.method==='POST'){const c=await collection(e,a,cm[1],true);return dataJSON(await perform(e,a,c,{management:true},cm[2]==='export'?'query':cm[2],b));}
 bad(404,'not_found','数据接口不存在');
}

export async function dataMaintenance(e){
 if(!e.DATA_DB)return;
 const jobs=await all(e,'SELECT * FROM data_pin_jobs LIMIT 2');for(const job of jobs){const a=await one(e,'SELECT * FROM data_apps WHERE id=?',job.app_id);if(!a)continue;const c=await one(e,'SELECT * FROM data_collections WHERE app_id=? AND key=?',a.id,job.collection);await withWorkOperation(e,a.work_id,async()=>{if(c)await syncPins(e,a,{...c,def:JSON.parse(c.definition)},job.record_id);else{await M(e,'DELETE FROM data_resource_pins WHERE app_id=? AND record_id=?',a.id,job.record_id).run();await S(e,'DELETE FROM data_pin_jobs WHERE app_id=? AND record_id=?',a.id,job.record_id).run();}});}
 const expired=await all(e,'SELECT h.record_id,h.app_id,r.collection FROM data_history h JOIN data_records r ON r.id=h.record_id WHERE h.expires<=? GROUP BY h.record_id,h.app_id,r.collection LIMIT 1',at());
 for(const h of expired){const a=await one(e,'SELECT * FROM data_apps WHERE id=?',h.app_id),c=await one(e,'SELECT * FROM data_collections WHERE app_id=? AND key=?',h.app_id,h.collection);if(!a||!c)continue;await withWorkOperation(e,a.work_id,async()=>{await S(e,'DELETE FROM data_history WHERE record_id=? AND expires<=?',h.record_id,at()).run();await syncPins(e,a,{...c,def:JSON.parse(c.definition)},h.record_id);});}
 await batch(e,[S(e,'DELETE FROM data_idempotency WHERE rowid IN (SELECT rowid FROM data_idempotency WHERE expires<=? LIMIT 100)',at()),S(e,'DELETE FROM data_grants WHERE rowid IN (SELECT rowid FROM data_grants WHERE expires<=? LIMIT 100)',at()),S(e,'DELETE FROM data_usage WHERE day<?',Math.floor(at()/86400)-35)]);
}

async function deleteCollection(e,a,key,b){return withWorkOperation(e,a.work_id,async()=>{
 const c=await one(e,'SELECT * FROM data_collections WHERE app_id=? AND key=?',a.id,key);if(!c)return {deleted:true,collection:key};if(b.expected_revision!==c.revision)bad(409,'revision_conflict','请提供集合当前revision（应用配置发布次数）');
 await S(e,'UPDATE data_collections SET deleting=1 WHERE app_id=? AND key=?',a.id,key).run();
 await batch(e,[S(e,'INSERT OR IGNORE INTO data_pin_jobs SELECT app_id,id,collection FROM data_records WHERE app_id=? AND collection=? LIMIT 10',a.id,key),S(e,'DELETE FROM data_records WHERE id IN (SELECT id FROM data_records WHERE app_id=? AND collection=? LIMIT 10)',a.id,key)]);
 const jobs=await all(e,'SELECT record_id FROM data_pin_jobs WHERE app_id=? AND collection=? LIMIT 10',a.id,key);if(jobs.length){await M(e,'DELETE FROM data_resource_pins WHERE app_id=? AND record_id IN (SELECT value FROM json_each(?))',a.id,JSON.stringify(jobs.map(j=>j.record_id))).run();await S(e,'DELETE FROM data_pin_jobs WHERE app_id=? AND record_id IN (SELECT value FROM json_each(?))',a.id,JSON.stringify(jobs.map(j=>j.record_id))).run();}
 if(await one(e,'SELECT id FROM data_records WHERE app_id=? AND collection=? LIMIT 1',a.id,key)||await one(e,'SELECT record_id FROM data_pin_jobs WHERE app_id=? AND collection=? LIMIT 1',a.id,key))return {deleting:true,collection:key};
 await batch(e,[S(e,'DELETE FROM data_idempotency WHERE app_id=? AND collection=?',a.id,key),S(e,'DELETE FROM data_collections WHERE app_id=? AND key=?',a.id,key)]);return {deleted:true,collection:key,publish_required:true,note:'请更新集合配置并随网页新版本发布，以移除已删除集合的声明。'};
 });}

// Credentialed CORS is limited to this endpoint and exact platform-owned origins.
// The sandboxed work has Origin:null and never receives the session cookie or a grant.
export function authorRuntimeCors(r,e,response){
 if(new URL(r.url).pathname.replace(/^\/api(?=\/)/,'')!=='/v1/data/runtime/author')return response;
 const headers=new Headers(response.headers),from=r.headers.get('Origin');
 headers.delete('Access-Control-Allow-Origin');headers.delete('Access-Control-Allow-Credentials');
 headers.set('Vary','Origin');headers.set('Cache-Control','no-store');
 if([APP(e),e.CONTENT_ORIGIN?.replace(/\/$/,'')].includes(from)){
  headers.set('Access-Control-Allow-Origin',from);headers.set('Access-Control-Allow-Credentials','true');
  headers.set('Access-Control-Allow-Methods','POST');headers.set('Access-Control-Allow-Headers','Content-Type, X-TexoPub-Request');
 }
 return new Response(response.body,{status:response.status,headers});
}
