import {AccountError} from './accounts.mjs';
import {creatorIdentity,enrichWorks} from './community.mjs';
const S=(e,q,...p)=>e.DB.prepare(q).bind(...p);
const one=(e,q,...p)=>S(e,q,...p).first();
const all=async(e,q,...p)=>(await S(e,q,...p).all()).results;
const bad=(n,s)=>{throw new AccountError(n,s)};
const now=()=>Math.floor(Date.now()/1000);
const uuid=()=>crypto.randomUUID().replaceAll('-','');
const identifier=x=>typeof x==='string'&&/^[a-f0-9]{32}$/.test(x);
const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function str(v,label,max,empty=false){if(typeof v!=='string'||v.length>max||(!empty&&!v.trim())||/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(v))bad(400,label+'格式不正确');return v.trim()}
export function resourceReferences(value){
 if(value===undefined)return [];
 if(!Array.isArray(value)||value.length>250)bad(400,'依赖清单最多250份资源');
 const seen=new Set();return value.map(x=>{
  if(!x||!identifier(x.work_id)||!identifier(x.version)||typeof x.path!=='string'||!x.path||x.path.length>240||x.path.startsWith('/')||/[\\%?#\u0000-\u001f]/.test(x.path)||x.path.split('/').some(p=>!p||p.startsWith('.')))bad(400,'资源引用需要work_id、version及安全的包内path');
  const key=x.work_id+'/'+x.version+'/'+x.path;if(seen.has(key))bad(400,'资源引用不能重复');seen.add(key);
  return {work_id:x.work_id,version:x.version,path:x.path};
 });
}
const origin=e=>(e.APP_ORIGIN||'https://texopub.com').replace(/\/$/,'');
const fileUrl=(e,version,path)=>e.CONTENT_ORIGIN.replace(/\/$/,'')+'/v/'+version+'/'+path.split('/').map(encodeURIComponent).join('/');
const countSQL="SELECT a.*,SUM(CASE WHEN w.status='published' AND w.deleted_at IS NULL THEN 1 ELSE 0 END) AS item_count FROM albums a LEFT JOIN album_items i ON i.album_id=a.id LEFT JOIN works w ON w.id=i.work_id ";
function dto(e,a){return {id:a.id,publisher_id:a.publisher_id,slug:a.slug,title:a.title,summary:a.summary,listing:a.listing,status:a.status,revision:a.revision,item_count:Number(a.item_count||0),cover:a.cover_asset_id?fileUrl(e,a.cover_version,a.cover_path):origin(e)+'/api/v1/albums/'+a.id+'/cover.svg',cover_resource:a.cover_asset_id?{work_id:a.cover_asset_id,version:a.cover_version,path:a.cover_path}:null,url:origin(e)+'/albums/'+a.id+'/',created:new Date(a.created*1000).toISOString(),updated:new Date(a.updated*1000).toISOString()}}
export async function listAlbums(e,pid,publicOnly=false){return (await all(e,countSQL+"WHERE a.publisher_id=? AND a.status"+(publicOnly?"='published' AND a.listing='profile'":"!='deleted'")+" GROUP BY a.id ORDER BY a.updated DESC,a.id LIMIT 1000",pid)).map(a=>dto(e,a))}
export async function getAlbum(e,id,publicWork,p=null){
 const a=await one(e,countSQL+'WHERE a.id=?'+(p?' AND a.publisher_id=?':" AND a.status='published'")+' GROUP BY a.id',...[id,...(p?[p.id]:[])]);
 if(!a||(!p&&a.status!=='published'))bad(404,'专辑不存在或暂不可用');
 if(a.status==='deleted')return {id:a.id,status:'deleted',deleted:true,revision:a.revision};
 const rows=await all(e,'SELECT w.*,i.position FROM album_items i JOIN works w ON w.id=i.work_id WHERE i.album_id=? ORDER BY i.position',a.id);
 const visible=rows.filter(w=>p||w.status==='published'&&!w.deleted_at);
 const enriched=await enrichWorks(e,visible.map(w=>({...publicWork(e,w),status:w.status,position:w.position})));
 const byId=new Map(enriched.map(w=>[w.id,w]));
 const publisher=await one(e,'SELECT * FROM publishers WHERE id=? AND revoked=0',a.publisher_id);if(!publisher)bad(404,'专辑不存在或暂不可用');
 const identity=creatorIdentity(e,publisher);
 return {...dto(e,a),creator:{id:identity.id,name:identity.name,avatar:identity.avatar},items:rows.map(w=>byId.get(w.id)||{status:'unavailable',position:w.position}),...(p?{work_ids:rows.map(w=>w.id)}:{})};
}
function checkedBody(b,creating){
 if(!b||typeof b!=='object'||Array.isArray(b))bad(400,'需要专辑对象');
 const allowed=['slug','title','summary','listing','status','cover_resource','work_ids','expected_revision','idempotency_key'];
 if(Object.keys(b).some(k=>!allowed.includes(k)))bad(400,'包含不支持的专辑字段');
 if(!Number.isSafeInteger(b.expected_revision)||b.expected_revision<0)bad(400,'先读取专辑revision；新建传0');
 if(b.slug!==undefined&&(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(b.slug)||b.slug.length>64))bad(400,'专辑slug使用小写英文数字和连字符');
 if(creating&&(!b.slug||b.expected_revision!==0))bad(400,'新建需要slug和expected_revision=0');
 if(b.listing!==undefined&&!['unlisted','profile'].includes(b.listing))bad(400,'专辑仅支持不展示或仅个人主页');
 if(b.status!==undefined&&!['published','hidden'].includes(b.status))bad(400,'专辑状态请选择published或hidden');
 if(b.title!==undefined)str(b.title,'标题',120);
 if(b.summary!==undefined)str(b.summary,'简介',1000,true);
 if(b.cover_resource!==undefined&&b.cover_resource!==null)resourceReferences([b.cover_resource]);
 if(b.work_ids!==undefined&&(!Array.isArray(b.work_ids)||b.work_ids.length>200||b.work_ids.some(x=>!identifier(x))||new Set(b.work_ids).size!==b.work_ids.length))bad(400,'专辑最多200份不重复的网页');
}
export async function saveAlbum(e,p,b,id,publicWork){
 checkedBody(b,!id);let old=id?await one(e,'SELECT * FROM albums WHERE id=? AND publisher_id=?',id,p.id):null;
 if(id&&(!old||old.status==='deleted'))bad(404,'专辑不存在或已删除');
 const hash=async s=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))].map(x=>x.toString(16).padStart(2,'0')).join('');
 let idem,requestHash;
 if(!id){
  idem=str(b.idempotency_key,'幂等键',100);requestHash=await hash(JSON.stringify(b));
  const retry=await one(e,'SELECT * FROM albums WHERE publisher_id=? AND idem=?',p.id,idem);
  if(retry){if(retry.request_hash!==requestHash)bad(409,'幂等键已用于不同的专辑内容');return getAlbum(e,retry.id,publicWork,p)}
  if(!b.title)bad(400,'新专辑需要标题');
  id=uuid();
 }else if(old.revision!==b.expected_revision)bad(409,'专辑已变化，请重新读取');
 if(old&&b.slug!==undefined&&b.slug!==old.slug)bad(400,'专辑slug不随更新改变');
 const at=now(),token=uuid(),cover=b.cover_resource===undefined?(old?.cover_asset_id?{work_id:old.cover_asset_id,version:old.cover_version,path:old.cover_path}:null):b.cover_resource;
 const args=[str(b.title??old?.title,'标题',120),str(b.summary??old?.summary??'','简介',1000,true),b.listing??old?.listing??'unlisted',b.status??old?.status??'published',cover?.work_id??null,cover?.version??null,cover?.path??null,token,at];
 const commands=old?[S(e,"UPDATE albums SET title=?,summary=?,listing=?,status=?,cover_asset_id=?,cover_version=?,cover_path=?,change_token=?,updated=?,revision=revision+1 WHERE id=? AND publisher_id=? AND revision=? AND status!='deleted'",...args,id,p.id,b.expected_revision)]:[S(e,'INSERT INTO albums(title,summary,listing,status,cover_asset_id,cover_version,cover_path,change_token,updated,id,publisher_id,slug,idem,request_hash,created) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)',...args,id,p.id,b.slug,idem,requestHash,at)];
 if(b.work_ids!==undefined){commands.push(S(e,'DELETE FROM album_items WHERE album_id=? AND EXISTS(SELECT 1 FROM albums WHERE id=? AND change_token=?)',id,id,token));commands.push(S(e,"INSERT INTO album_items(album_id,work_id,position) SELECT ?,value,CAST(key AS INTEGER) FROM json_each(?) WHERE EXISTS(SELECT 1 FROM albums WHERE id=? AND change_token=?)",id,JSON.stringify(b.work_ids),id,token));}
 try{const r=await e.DB.batch(commands);if(!r[0].meta.changes)bad(409,'专辑已变化，请重新读取')}catch(error){if(/UNIQUE/.test(error.message))bad(409,'专辑名称标识或幂等键已存在，请先读取本人专辑');throw error}
 return getAlbum(e,id,publicWork,p);
}
export async function deleteAlbum(e,p,id,b){
 if(b.confirm!==true||!Number.isSafeInteger(b.expected_revision))bad(400,'永久删除专辑需confirm=true与当前revision；成员网页和素材保留');
 const a=await one(e,'SELECT * FROM albums WHERE id=? AND publisher_id=?',id,p.id);if(!a)bad(404,'专辑不存在或不属于当前空间');
 if(a.status==='deleted'){if(a.deletion_revision!==b.expected_revision)bad(409,'专辑已变化');return {deleted:true,album_id:id,members_deleted:false}}
 const token=uuid();const r=await e.DB.batch([S(e,"UPDATE albums SET status='deleted',title='',summary='',cover_asset_id=NULL,cover_version=NULL,cover_path=NULL,change_token=?,deletion_revision=revision,revision=revision+1,updated=? WHERE id=? AND publisher_id=? AND revision=? AND status!='deleted'",token,now(),id,p.id,b.expected_revision),S(e,'DELETE FROM album_items WHERE album_id=? AND EXISTS(SELECT 1 FROM albums WHERE id=? AND change_token=?)',id,id,token)]);
 if(!r[0].meta.changes)bad(409,'专辑已变化，请重新读取');return {deleted:true,album_id:id,members_deleted:false};
}
export async function albumCover(e,id){
 const a=await one(e,"SELECT * FROM albums WHERE id=? AND status='published'",id);if(!a)bad(404,'专辑不存在或暂不可用');
 if(a.cover_asset_id)return {url:fileUrl(e,a.cover_version,a.cover_path)};
 const chars=Array.from(a.title),lines=[chars.slice(0,12).join(''),chars.slice(12,24).join('')+(chars.length>24?'…':'')].filter(Boolean),title=lines.map((line,i)=>`<tspan x="100" dy="${i?110:0}">${escape(line)}</tspan>`).join(''),small=chars.length>8;
 return {svg:`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900" viewBox="0 0 1600 900"><rect width="1600" height="900" fill="#173e34"/><g fill="none" stroke="#b1c5b3" stroke-width="3" opacity=".4"><path d="M950 0 1500 900M1550 0 850 900M880 260h650M830 660h750"/></g><circle cx="1260" cy="390" r="125" fill="#dceaa0"/><g fill="#f8f6ee" font-family="sans-serif"><text x="110" y="150" font-size="30" letter-spacing="6">TEXOPUB / 专辑</text><text x="100" y="450" font-size="${small?64:100}" font-weight="650">${title}</text><text x="110" y="790" font-size="30">${escape(a.summary.slice(0,35)||'沿着一个主题，慢慢看。')}</text></g></svg>`};
}
