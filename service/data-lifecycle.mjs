import {withWorkOperation} from './lifecycle.mjs';
import {at,dstmt as S,done as one,dall as all,batch} from './data-core.mjs';
const M=(e,q,...p)=>e.DB.prepare(q).bind(...p);
export async function deleteAppData(e,workId,locked=false){
 if(e.DATA_DB&&!locked)return withWorkOperation(e,workId,()=>deleteAppData(e,workId,true));
 if(!e.DATA_DB)return;const a=await one(e,"SELECT * FROM data_apps WHERE work_id=? AND state!='deleted'",workId);if(!a)return;
 await S(e,"UPDATE data_apps SET state='deleting' WHERE id=?",a.id).run();const chunk=await all(e,'SELECT id FROM data_records WHERE app_id=? LIMIT 25',a.id);
 if(chunk.length)await batch(e,[S(e,'DELETE FROM data_records WHERE id IN (SELECT id FROM data_records WHERE app_id=? LIMIT 25)',a.id)]);
 if(await one(e,'SELECT id FROM data_records WHERE app_id=? LIMIT 1',a.id))return {deleting:true};
 await batch(e,[S(e,'DELETE FROM data_collections WHERE app_id=?',a.id),S(e,'DELETE FROM data_idempotency WHERE app_id=?',a.id),S(e,'DELETE FROM data_pin_jobs WHERE app_id=?',a.id),S(e,'DELETE FROM data_grants WHERE app_id=?',a.id),S(e,"UPDATE data_apps SET state='deleted',active_config='{}',pending_config='{}',updated=? WHERE id=?",at(),a.id)]);
 await M(e,'DELETE FROM data_resource_pins WHERE app_id=?',a.id).run();return {deleted:true};
}
