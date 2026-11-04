// Structured records use their own D1 binding. Never accept caller SQL.
export class DataError extends Error {
  constructor(status,code,message,extra={}){super(message);this.status=status;this.code=code;this.extra=extra;}
}
export const DATA_LIMITS=Object.freeze({account_bytes:50*1024*1024,app_bytes:25*1024*1024,record_bytes:65536,request_bytes:131072,response_bytes:262144,records:20000,apps:3,collections:10,fields:32,indexes:3,read_requests:2000,write_requests:200,read_row_budget:50000,write_row_budget:5000,global_requests:8000,global_reads:1000000,global_writes:30000});
const E=new TextEncoder();
export const at=()=>Math.floor(Date.now()/1000);
export const uid=()=>crypto.randomUUID().replaceAll('-','');
export const bytes=x=>E.encode(typeof x==='string'?x:JSON.stringify(x)).length;
export const dstmt=(e,sql,...params)=>e.DATA_DB.prepare(sql).bind(...params);
export const done=(e,sql,...params)=>dstmt(e,sql,...params).first();
export const dall=async(e,sql,...params)=>(await dstmt(e,sql,...params).all()).results;
export function bad(status,code,message,extra){throw new DataError(status,code,message,extra);}
export function object(x){return x!==null&&typeof x==='object'&&!Array.isArray(x);}
export function identifier(x){if(typeof x!=='string'||!/^[a-f0-9]{32}$/.test(x))bad(400,'invalid_id','需要有效的标识');return x;}
export function collectionKey(x){if(typeof x!=='string'||!/^[a-z][a-z0-9_]{0,39}$/.test(x))bad(400,'invalid_collection','集合和字段使用小写英文、数字、下划线');return x;}
export function revision(b){if(!Number.isSafeInteger(b.expected_revision)||b.expected_revision<1)bad(428,'revision_required','请提供读取到的expected_revision');return b.expected_revision;}
export async function digest(x){const a=await crypto.subtle.digest('SHA-256',E.encode(typeof x==='string'?x:JSON.stringify(x)));return [...new Uint8Array(a)].map(x=>x.toString(16).padStart(2,'0')).join('');}
export async function boundedJSON(r){
  if(Number(r.headers.get('Content-Length'))>DATA_LIMITS.request_bytes)bad(413,'request_too_large','数据请求最多128KiB');
  if(r.headers.get('Content-Encoding')&&!['identity'].includes(r.headers.get('Content-Encoding')))bad(415,'unsupported_encoding','不接收压缩数据请求');
  if(!r.body)return {};const reader=r.body.getReader(),chunks=[];let size=0;
  try{while(true){const x=await reader.read();if(x.done)break;size+=x.value.length;if(size>DATA_LIMITS.request_bytes){await reader.cancel();bad(413,'request_too_large','数据请求最多128KiB');}chunks.push(x.value);}}finally{reader.releaseLock();}
  const all=new Uint8Array(size);let n=0;for(const x of chunks){all.set(x,n);n+=x.length;}
  let b;try{b=JSON.parse(new TextDecoder().decode(all));}catch{bad(400,'invalid_json','需要JSON对象');}if(!object(b))bad(400,'invalid_json','需要JSON对象');return b;
}
export function definition(b){
  if(!object(b)||!['owner','public_read','user_private'].includes(b.mode||'owner')||!object(b.fields))bad(422,'invalid_schema','需要集合访问模式和字段定义');
  const fields=Object.entries(b.fields);if(!fields.length||fields.length>32)bad(422,'invalid_schema','每集合需要1到32字段');
  const allowed=['string','number','boolean','datetime','enum','url','json','asset_ref'];const clean={mode:b.mode||'owner',history:b.history===true,fields:{},indexes:[]};
  for(const [key,f] of fields){collectionKey(key);if(['id','revision','created_at','updated_at','subject_id','__proto__','constructor','prototype'].includes(key)||!object(f)||!allowed.includes(f.type))bad(422,'invalid_schema','无效或保留字段');
    const v={type:f.type,required:f.required===true,nullable:f.nullable===true};if(f.type==='enum'){if(!Array.isArray(f.values)||!f.values.length||f.values.length>32||f.values.some(x=>typeof x!=='string'||bytes(x)>256)||new Set(f.values).size!==f.values.length)bad(422,'invalid_schema','enum需要1到32个唯一短文本');v.values=f.values;}
    if(f.max_bytes!==undefined){if(!Number.isSafeInteger(f.max_bytes)||f.max_bytes<1||f.max_bytes>32768)bad(422,'invalid_schema','字段最大长度应为1到32768字节');v.max_bytes=f.max_bytes;}
    for(const k of ['min','max'])if(f[k]!==undefined){if(!Number.isFinite(f[k]))bad(422,'invalid_schema','数字范围无效');v[k]=f[k];}
    clean.fields[key]=v;
  }
  if(b.indexes!==undefined&&!Array.isArray(b.indexes))bad(422,'invalid_schema','indexes须为数组');
  for(const raw of b.indexes||[]){const idx=typeof raw==='string'?[raw]:raw;if(!Array.isArray(idx)||!idx.length||idx.length>2||new Set(idx).size!==idx.length||idx.some(k=>!Object.hasOwn(clean.fields,k)||['json','asset_ref'].includes(clean.fields[k].type)))bad(422,'invalid_index','索引为1到2个可索引字段');clean.indexes.push(idx);}
  if(clean.indexes.length>3||new Set(clean.indexes.map(x=>JSON.stringify(x))).size!==clean.indexes.length)bad(422,'invalid_index','最多3个不重复索引');return clean;
}
export function compatible(old,next){
  if(old.mode!==next.mode)bad(409,'migration_required','已有记录的访问模式变更需要明确迁移，避免意外公开或丢失归属');
  for(const [k,f] of Object.entries(old.fields)){if(JSON.stringify(f)!==JSON.stringify(next.fields[k]))bad(409,'migration_required','已有字段不能直接删除或改变约束，请先导出并迁移');}
  for(const [k,f] of Object.entries(next.fields))if(!old.fields[k]&&f.required)bad(409,'migration_required','新增必填字段需要数据迁移');
  if(JSON.stringify(old.indexes)!==JSON.stringify(next.indexes))bad(409,'migration_required','已有记录的索引变更需要重新构建，首期请先迁移');
}
function jsonDepth(x,depth=0,counter={n:0}){if(depth>8||++counter.n>512)bad(422,'json_too_complex','JSON层级或元素过多');if(Array.isArray(x))for(const v of x)jsonDepth(v,depth+1,counter);else if(object(x))for(const [k,v] of Object.entries(x)){if(['__proto__','constructor','prototype'].includes(k))bad(422,'invalid_value','保留JSON字段');jsonDepth(v,depth+1,counter);}else if(typeof x==='number'&&!Number.isFinite(x))bad(422,'invalid_value','数字必须有限');}
export function validate(def,data){
  if(!object(data)||Object.keys(data).some(k=>!Object.hasOwn(def.fields,k)))bad(422,'invalid_record','记录含未声明字段');
  const values={};for(const [k,f] of Object.entries(def.fields)){
    if(!Object.hasOwn(data,k)){if(f.required)bad(422,'missing_field','缺少字段：'+k);continue;}const v=data[k];
    if(v===null){if(!f.nullable)bad(422,'invalid_value','字段不能为null：'+k);values[k]=null;continue;}
    if(['string','url','datetime','enum'].includes(f.type)){
      if(typeof v!=='string'||bytes(v)>(f.max_bytes||32768)||/^data:/i.test(v))bad(422,'invalid_value','文本超限或包含data URL：'+k);
      if(f.type==='enum'&&!f.values.includes(v))bad(422,'invalid_value','无效枚举：'+k);
      if(f.type==='datetime'&&(!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(v)||!Number.isFinite(Date.parse(v))))bad(422,'invalid_value','日期使用UTC ISO格式：'+k);
      if(f.type==='url'){let u;try{u=new URL(v);}catch{bad(422,'invalid_value','无效网址：'+k);}if(!['https:','http:'].includes(u.protocol)||u.username||u.password)bad(422,'invalid_value','网址仅接受HTTP(S)，不能含凭证');}
    }else if(f.type==='number'){if(typeof v!=='number'||!Number.isFinite(v)||(f.min!==undefined&&v<f.min)||(f.max!==undefined&&v>f.max))bad(422,'invalid_value','无效数字：'+k);}
    else if(f.type==='boolean'){if(typeof v!=='boolean')bad(422,'invalid_value','需要布尔值：'+k);}
    else if(f.type==='asset_ref'){if(!object(v)||Object.keys(v).some(k=>!['work_id','version','path'].includes(k))||typeof v.path!=='string'||v.path.length>240||v.path.startsWith('/')||v.path.split('/').some(x=>!x||x==='..'))bad(422,'invalid_value','无效素材引用');identifier(v.work_id);identifier(v.version);}
    else{jsonDepth(v);if(bytes(v)>(f.max_bytes||32768))bad(422,'invalid_value','JSON字段过大');}
    values[k]=v;
  }
  if(bytes(values)+512>65536)bad(413,'record_too_large','单条记录最多64KiB');
  const keys=[];for(const idx of def.indexes){for(const name of idx){const v=values[name]??null;if(typeof v==='string'&&bytes(v)>256)bad(422,'index_value_too_large','索引文本最多256字节');keys.push(typeof v==='boolean'?Number(v):v);}if(idx.length===1)keys.push(null);}
  while(keys.length<6)keys.push(null);
  return {data:values,keys,charge:bytes(values)+512+def.indexes.length*2048};
}
export function assetRefs(def,data){return Object.entries(def.fields).filter(([k,f])=>f.type==='asset_ref'&&data[k]).map(([k])=>data[k]);}
export function view(row,fields){const data=JSON.parse(row.data);return {id:row.id,revision:row.revision,created_at:new Date(row.created*1000).toISOString(),updated_at:new Date(row.updated*1000).toISOString(),data:fields?Object.fromEntries(fields.filter(k=>Object.hasOwn(data,k)).map(k=>[k,data[k]])):data};}
export async function account(e,pid){await dstmt(e,'INSERT INTO data_accounts(id) VALUES(?) ON CONFLICT DO NOTHING',pid).run();const a=await done(e,'SELECT * FROM data_accounts WHERE id=?',pid);if(!a.enabled)bad(403,'data_disabled','此空间数据服务已停用');return a;}
export async function budget(e,pid,write=false,weight=64){
  const day=Math.floor(at()/86400),reset_at=(day+1)*86400;
  const read=write?0:1,writes=write?1:0,wr=write?32:4;
  const q="INSERT INTO data_usage(subject,day,requests,reads,writes,read_rows,write_rows) VALUES(?,?,1,?,?,?,?) ON CONFLICT(subject,day) DO UPDATE SET requests=requests+1,reads=reads+excluded.reads,writes=writes+excluded.writes,read_rows=read_rows+excluded.read_rows,write_rows=write_rows+excluded.write_rows";
  const aid=uid();
  try{await e.DATA_DB.batch([
    dstmt(e,q,pid,day,read,writes,weight,wr),dstmt(e,q,'*',day,read,writes,weight,wr),
    dstmt(e,`INSERT INTO data_assertions(id,ok) SELECT ?,CASE WHEN EXISTS(SELECT 1 FROM data_usage WHERE subject=? AND day=? AND reads<=2000 AND writes<=200 AND read_rows<=50000 AND write_rows<=5000) AND EXISTS(SELECT 1 FROM data_usage WHERE subject='*' AND day=? AND requests<=8000 AND read_rows<=1000000 AND write_rows<=30000) THEN 1 ELSE 0 END`,aid,pid,day,day),
    dstmt(e,'DELETE FROM data_assertions WHERE id=?',aid)
  ]);}catch(err){if(/CHECK constraint/.test(err.message))bad(429,'data_daily_quota','达到数据日额度，请在重置后重试',{reset_at});throw err;}
}
export async function batch(e,commands){try{return await e.DATA_DB.batch(commands);}catch(err){if(/SQLITE_FULL|database or disk is full|maximum.*size/i.test(err.message))bad(507,'database_capacity','底层数据库容量已满，请导出或清理数据');if(/CHECK constraint/.test(err.message)){
  if(/ok/.test(err.message))bad(409,'revision_conflict','数据或配置已变化，请重新读取');bad(507,'storage_quota_exceeded','数据容量或记录数已达到上限');
}if(/data_grants_quota|data_credentials_quota/.test(err.message))bad(429,'credential_limit','有效连接或数据密钥数量已达到上限');if(/data_app_inactive/.test(err.message))bad(409,'app_inactive','数据应用未启用');if(/data_apps_quota/.test(err.message))bad(429,'app_quota','最多3个数据应用');throw err;}}
export function assertChanged(e,commands){const id=uid();return [...commands,dstmt(e,'INSERT INTO data_assertions(id,ok) VALUES(?,changes())',id),dstmt(e,'DELETE FROM data_assertions WHERE id=?',id)];}
