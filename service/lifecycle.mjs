import {AccountError} from './accounts.mjs';
const S=(e,q,...p)=>e.DB.prepare(q).bind(...p);
const one=(e,q,...p)=>S(e,q,...p).first();
const all=async(e,q,...p)=>(await S(e,q,...p).all()).results;
const now=()=>Math.floor(Date.now()/1000);
const bad=(status,message)=>{throw new AccountError(status,message);};
export const LISTINGS={unlisted:'不展示',profile:'仅个人主页',public:'公开展示'};
export function listing(value){if(!Object.hasOwn(LISTINGS,value))bad(400,'展示范围请选择不展示、仅个人主页或公开展示');return value;}
// One R2 mutation per work. A crashed request has a bounded lease; normal errors
// always release it. New object keys are scoped to a work, so uploads to another
// work cannot race legacy shared-object collection.
export async function withWorkOperation(e,workId,fn,uploadVersion=null){
 const token=crypto.randomUUID(),at=now();
 // For an upload, take the lease and recheck its live work/version in one SQL
 // statement. This keeps an eight-file MCP call below the free D1 query limit.
 const lock=uploadVersion?await S(e,"INSERT INTO work_operations(work_id,token,expires) SELECT w.id,?,? FROM works w JOIN versions v ON v.work_id=w.id WHERE w.id=? AND v.id=? AND w.deleted_at IS NULL AND v.state='draft' AND v.expires>=? ON CONFLICT(work_id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE work_operations.expires<?",token,at+900,workId,uploadVersion,at,at).run():await S(e,'INSERT INTO work_operations(work_id,token,expires) VALUES(?,?,?) ON CONFLICT(work_id) DO UPDATE SET token=excluded.token,expires=excluded.expires WHERE work_operations.expires<?',workId,token,at+900,at).run();
 if(!lock.meta.changes)bad(409,'内容正在上传或清理，请稍后重试');
 try{return await fn();}finally{await S(e,'DELETE FROM work_operations WHERE work_id=? AND token=?',workId,token).run();}
}
export async function deleteWork(e,p,workId,b){
 if(b.confirm!==true)bad(400,'永久删除须明确确认，无法恢复');
 if(!Object.hasOwn(b,'expected_version')||!(b.expected_version===null||/^[a-f0-9]{32}$/.test(b.expected_version)))bad(400,'请先读取当前版本；无版本草稿传null');
 let w=await one(e,'SELECT * FROM works WHERE id=? AND publisher_id=?',workId,p.id);
 if(!w)bad(404,'内容不存在或不属于当前空间');
 if(b.expected_version!==(w.deleted_at?w.deletion_version:w.current_version))bad(409,'内容已变化，请刷新后再删除');
 if(w.delete_complete)return {deleted:true,work_id:w.id,released_bytes:w.delete_bytes};
 return withWorkOperation(e,w.id,async()=>{
  w=await one(e,'SELECT * FROM works WHERE id=? AND publisher_id=?',w.id,p.id);
  if(b.expected_version!==(w.deleted_at?w.deletion_version:w.current_version))bad(409,'内容已变化，请刷新后再删除');
  if(w.delete_complete)return {deleted:true,work_id:w.id,released_bytes:w.delete_bytes};
  if(!w.deleted_at){
   const r=await S(e,"UPDATE works SET status='hidden',deleted_at=?,deletion_version=current_version,delete_bytes=(SELECT COALESCE(SUM(total_bytes),0) FROM versions WHERE work_id=works.id),revision=revision+1,updated=? WHERE id=? AND publisher_id=? AND current_version IS ? AND deleted_at IS NULL",now(),now(),w.id,p.id,b.expected_version).run();
   if(!r.meta.changes)bad(409,'内容已变化，请刷新后再删除');
   w=await one(e,'SELECT * FROM works WHERE id=?',w.id);
  }
  // Keep references until R2 succeeds. A failed or interrupted request is safe to
  // retry with the same work and version. Other deleting works are inaccessible
  // and do not pin legacy objects indefinitely when two cleanups run together.
  const candidates=await all(e,'SELECT DISTINCT f.object_key FROM files f JOIN versions v ON v.id=f.version_id WHERE v.work_id=? AND f.object_key IS NOT NULL LIMIT 200',w.id);
  if(candidates.length){
   const keys=candidates.map(f=>f.object_key);
   const exclusive=await all(e,'SELECT value AS object_key FROM json_each(?) k WHERE NOT EXISTS(SELECT 1 FROM files f JOIN versions v ON v.id=f.version_id JOIN works other ON other.id=v.work_id WHERE f.object_key=k.value AND other.id!=? AND other.deleted_at IS NULL)',JSON.stringify(keys),w.id);
   if(exclusive.length)await e.FILES.delete(exclusive.map(f=>f.object_key));
   await S(e,'DELETE FROM files WHERE version_id IN (SELECT id FROM versions WHERE work_id=?) AND object_key IN (SELECT value FROM json_each(?))',w.id,JSON.stringify(keys)).run();
  }
  const remaining=await one(e,'SELECT COUNT(*) AS n FROM files f JOIN versions v ON v.id=f.version_id WHERE v.work_id=? AND f.object_key IS NOT NULL',w.id);
  if(remaining.n)return {deleted:false,deleting:true,work_id:w.id,remaining_files:remaining.n,note:'访问已关闭，使用相同参数继续清理；完成后释放历史版本额度。'};
  // Sweep work-scoped orphan PUTs left by an interrupted upload.
  const prefix='objects/'+p.id+'/'+w.id+'/',orphans=await e.FILES.list({prefix,limit:200});
  if(orphans.objects.length)await e.FILES.delete(orphans.objects.map(o=>o.key));
  if(orphans.truncated)return {deleted:false,deleting:true,work_id:w.id,note:'正在清理剩余存储对象，请使用相同参数继续。'};
  const legacyId=JSON.parse(w.metadata).legacy_id;
  await e.DB.batch([
   S(e,'DELETE FROM files WHERE version_id IN (SELECT id FROM versions WHERE work_id=?)',w.id),
   S(e,'DELETE FROM versions WHERE work_id=?',w.id),
   S(e,'UPDATE works SET metadata=?,current_version=NULL,delete_complete=1 WHERE id=? AND deleted_at IS NOT NULL',JSON.stringify(legacyId?{legacy_id:legacyId}:{}),w.id)
  ]);
  // Only the identifier/slug tombstone remains; it reserves the old address and
  // makes an acknowledged deletion idempotent without retaining the work data.
  return {deleted:true,work_id:w.id,released_bytes:w.delete_bytes};
 });
}
