import {oauthRoutes} from './mcp-oauth.mjs';
import {mcpRoute} from './mcp.mjs';
import {accountRoutes,publisherAuth,AccountError} from './accounts.mjs';
import taxonomy from './taxonomy.json';
import legacy from './legacy.json';
import {shortCandidate} from './short-urls.mjs';
import {LISTINGS,listing,withWorkOperation,deleteWork} from './lifecycle.mjs';
import viewerTemplate from '../templates/work-viewer.html';
import workBridge from '../templates/work-bridge.html';
const MAX_FILE = 25 * 1024 * 1024;
const MAX_TOTAL = 100 * 1024 * 1024;
const MAX_FILES = 250;
const FORMATS = {guide:'图文导览',article:'文章',report:'研究报告',tutorial:'教程',tool:'交互工具',visualization:'可视化',portfolio:'作品集'};
const MIME = {html:'text/html; charset=utf-8',htm:'text/html; charset=utf-8',css:'text/css; charset=utf-8',js:'application/javascript',mjs:'application/javascript',json:'application/json',txt:'text/plain; charset=utf-8',xml:'application/xml',webmanifest:'application/manifest+json',wasm:'application/wasm',png:'image/png',jpg:'image/jpeg',jpeg:'image/jpeg',webp:'image/webp',gif:'image/gif',svg:'image/svg+xml',avif:'image/avif',ico:'image/x-icon',mp4:'video/mp4',webm:'video/webm',mov:'video/quicktime',mp3:'audio/mpeg',wav:'audio/wav',m4a:'audio/mp4',ogg:'audio/ogg',pdf:'application/pdf',zip:'application/zip',woff:'font/woff',woff2:'font/woff2',ttf:'font/ttf',csv:'text/csv',xlsx:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',docx:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',pptx:'application/vnd.openxmlformats-officedocument.presentationml.presentation',vtt:'text/vtt',srt:'text/plain',glb:'model/gltf-binary',gltf:'model/gltf+json'};
const CORS = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'Authorization,Content-Type,Idempotency-Key,MCP-Protocol-Version,Mcp-Session-Id,Last-Event-ID','Access-Control-Allow-Methods':'GET,HEAD,POST,PUT,OPTIONS','X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer'};
class Failure extends Error {constructor(status,message){super(message);this.status=status;}}
function fail(status,message){throw new Failure(status,message);}
function response(data,status=200){return Response.json(data,{status,headers:{...CORS,'Cache-Control':'no-store'}});}
function now(){return Math.floor(Date.now()/1000);}
function id(){return crypto.randomUUID().replaceAll('-','');}
async function hash(data){if(typeof data==='string')data=new TextEncoder().encode(data);return [...new Uint8Array(await crypto.subtle.digest('SHA-256',data))].map(x=>x.toString(16).padStart(2,'0')).join('');}
function stmt(env,sql,...args){return env.DB.prepare(sql).bind(...args);}
async function first(env,sql,...args){return stmt(env,sql,...args).first();}
async function rows(env,sql,...args){return (await stmt(env,sql,...args).all()).results;}
function text(value,name,max=200,required=true){if(typeof value!=='string'||value.length>max||(required&&!value.trim()))fail(400,`无效的${name}`);return value.trim();}
function path(value){text(value,'文件路径',240);if(!value||value.startsWith('/')||/[\\%?#\u0000-\u001f]/.test(value)||value.split('/').some(x=>!x||x.startsWith('.')||x==='node_modules'))fail(400,'文件路径必须是包内相对路径，不能含隐藏或越界目录');if(!MIME[value.split('.').pop().toLowerCase()])fail(400,'不支持的文件类型：'+value);return value;}
function encoded(value){return value.split('/').map(encodeURIComponent).join('/');}
function origin(env){if(!env.CONTENT_ORIGIN)fail(503,'内容服务尚未配置');return env.CONTENT_ORIGIN.replace(/\/$/,'');}
function versionBase(env,version){return origin(env)+'/v/'+version+'/';}
function category(value){for(const g of taxonomy.groups)for(const c of g.children)if(value===g.id+'/'+c.id)return [g.name,c.name];fail(400,'必须选择有效的二级分类，请读取 /v1/categories');}
function publicWork(env,w){const m=JSON.parse(w.metadata),url=w.kind==='asset'&&m.visibility==='private'?(env.APP_ORIGIN||'https://texopub.com')+'/api/v1/me/assets/'+w.id:m.source==='external'?m.external_url:m.legacy_id?(env.APP_ORIGIN||'https://texopub.com')+'/p/'+m.legacy_id+'/':origin(env)+'/p/'+(w.public_slug||w.publisher_id+'/'+w.slug)+'/';return {...m,listing:w.listing||'public',revision:w.revision||0,...(w.deleted_at?{deleting:!w.delete_complete,deleted:!!w.delete_complete}:{}),source:m.source||'hosted',id:w.id,slug:w.slug,version:w.current_version,publisher_id:w.publisher_id,url,path:url,published:new Date(w.created*1000).toISOString().slice(0,10),updated:new Date(w.updated*1000).toISOString().slice(0,10)};}
function externalUrl(value){
 const raw=text(value,'外部网站网址',2048);let u;try{u=new URL(raw);}catch{fail(400,'外部网站需要完整HTTPS网址');}
 if(u.protocol!=='https:'||u.username||u.password||u.port||!u.hostname.includes('.')||/[:\[\]]|^[\d.]+$/.test(u.hostname)||/(?:^|\.)(?:localhost|local|internal|test|invalid)$/.test(u.hostname))fail(400,'外部网站需要公开HTTPS域名，不能包含登录凭证、自定义端口或本机地址');
 const url=u.href;u.hash='';return {url,key:u.href};
}
async function json(request){const len=Number(request.headers.get('Content-Length')||0);if(len>256000)fail(413,'元数据过大');const raw=await request.text();if(new TextEncoder().encode(raw).length>256000)fail(413,'元数据过大');try{return JSON.parse(raw);}catch{fail(400,'需要有效的JSON请求');}}
async function bearer(request){const token=request.headers.get('Authorization')?.match(/^Bearer (\S+)$/)?.[1];if(!token)fail(401,'需要发布凭证');return hash(token);}
async function auth(request,env,admin=false){if(admin){const h=await bearer(request);if(!env.ADMIN_TOKEN_SHA256||h!==env.ADMIN_TOKEN_SHA256)fail(403,'需要所有者管理凭证');return;}return publisherAuth(request,env);}
function sessionResult(env,v,files){const privateAsset=JSON.parse(v.metadata).visibility==='private';return {upload_id:v.id,work_id:v.work_id,state:v.state,expires_at:v.expires,content_base:versionBase(env,v.id),files:files.map(f=>({path:f.path,bytes:f.bytes,sha256:f.sha256,ready:!!f.ready,upload_path:'/v1/uploads/'+v.id+'/files/'+encoded(f.path),url:privateAsset?(env.APP_ORIGIN||'https://texopub.com')+'/api/v1/me/files/'+v.id+'/'+encoded(f.path):versionBase(env,v.id)+encoded(f.path)})),commit_path:'/v1/uploads/'+v.id+'/commit'};}
async function ownVersion(env,p,version){const v=await first(env,'SELECT v.* FROM versions v JOIN works w ON w.id=v.work_id WHERE v.id=? AND v.publisher_id=? AND w.deleted_at IS NULL',version,p.id);if(!v)fail(404,'上传会话不存在');return v;}
async function createUpload(request,env,p){
 const body=await json(request), idem=text(request.headers.get('Idempotency-Key')||body.idempotency_key,'幂等键',100);
 const requestHash=await hash(JSON.stringify(body));
 const old=await first(env,'SELECT * FROM versions WHERE publisher_id=? AND idem=?',p.id,idem);
 if(old){await ownVersion(env,p,old.id);if(old.request_hash!==requestHash)fail(409,'此幂等键已经用于不同内容');return response(sessionResult(env,old,await rows(env,'SELECT * FROM files WHERE version_id=?',old.id)));}
 const kind=body.kind||'work';if(!['work','asset'].includes(kind))fail(400,'kind必须为work或asset');
 const source=body.source||'hosted';if(!['hosted','external'].includes(source)||(source==='external'&&kind!=='work'))fail(400,'source仅支持hosted或external，外部收录必须是作品');
 const slug=text(body.slug,'slug',64);if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug))fail(400,'slug使用小写英文、数字和连字符');
 const title=text(body.title,'标题',120), summary=text(body.summary||'','摘要',1000,false);
 const tags=body.tags||[];if(!Array.isArray(tags)||tags.length>12||tags.some(t=>typeof t!=='string'||!t.trim()||t.length>40))fail(400,'标签最多12个，每个不超过40字');
 const files=body.files;if(!Array.isArray(files)||!files.length||files.length>MAX_FILES)fail(400,'文件清单需要1到250个文件');
 const seen=new Set();let total=0;
 for(const f of files){path(f.path);if(seen.has(f.path))fail(400,'重复文件路径');seen.add(f.path);if(!Number.isInteger(f.bytes)||f.bytes<0||f.bytes>MAX_FILE)fail(413,'每个文件不超过25MiB');if(!/^[a-f0-9]{64}$/.test(f.sha256))fail(400,'需要SHA256文件校验值');total+=f.bytes;}
 if(total>MAX_TOTAL)fail(413,'每次上传不超过100MiB');
 if(kind==='asset'&&files.length!==1)fail(400,'每次独立素材上传只包含一个文件');
 if(kind==='asset'&&/^(html?|css|m?js|wasm)$/.test(files[0].path.split('.').pop().toLowerCase()))fail(400,'独立素材不能作为可执行网页发布；HTML需要作品分类和图标');
 const reserved=total+files.filter(f=>/\.html?$/i.test(f.path)).length*4096;
 if(files.some(f=>/\.html?$/i.test(f.path)&&f.bytes>2*1024*1024))fail(413,'HTML正文不超过2MiB');
 let metadata={source,title,summary,tags,format:body.format||'article',category_id:body.category_id||'',license:text(body.license||'未声明开放许可','分享许可',120),author:p.name};
 if(kind==='work'){
  metadata.category_path=category(body.category_id);metadata.category=metadata.category_path.join(' / ');
  if(!Object.hasOwn(FORMATS,metadata.format))fail(400,'无效内容形式');
  if(source==='hosted'){const entry=body.entry||'index.html';path(entry);if(!seen.has(entry)||!['html','htm'].includes(entry.split('.').pop().toLowerCase()))fail(400,'缺少HTML入口');metadata.entry=entry;}
  else{
   const external=externalUrl(body.external_url);metadata.external_url=external.url;metadata.external_key=external.key;metadata.external_domain=new URL(metadata.external_url).hostname;
   metadata.link_status=body.link_status||'unchecked';if(!['unchecked','unavailable'].includes(metadata.link_status))fail(400,'link_status仅支持unchecked或unavailable；不代表平台已验证可用性');
   if(files.some(f=>!['svg','png','ico'].includes(f.path.split('.').pop().toLowerCase()))||files.length!==1)fail(400,'外部收录仅上传一份专属图标，不上传或复制外站内容');
   const duplicate=await first(env,"SELECT id FROM works WHERE status='published' AND json_extract(metadata,'$.external_key')=? AND id!=?",metadata.external_key,body.work_id||'');if(duplicate)fail(409,'该网址已被收录');
  }
  const icon=body.icon;path(icon);if(!seen.has(icon)||!['svg','png','ico'].includes(icon.split('.').pop().toLowerCase()))fail(400,'必须提供独立的SVG/PNG/ICO专属图标');
  if(files.find(f=>f.path===icon).bytes>1024*1024)fail(413,'图标不超过1MiB');metadata.icon_path=icon;
  if(body.cover){path(body.cover);if(!seen.has(body.cover)||!MIME[body.cover.split('.').pop().toLowerCase()].startsWith('image/'))fail(400,'封面必须是包内图片');metadata.cover_path=body.cover;}
 }
 if(kind==='asset'){metadata.entry=files[0].path;metadata.visibility=body.visibility||'private';if(!['private','public'].includes(metadata.visibility))fail(400,'素材可见性仅支持private或public');}
 let work=await first(env,'SELECT * FROM works WHERE publisher_id=? AND slug=?',p.id,slug);
 if(body.work_id&&(!work||work.id!==body.work_id))fail(403,'只能更新自己的作品');
 if(work){if(!body.work_id)fail(409,'同slug已存在；更新时提供work_id和expected_version');if(work.deleted_at||work.kind!==kind||work.status==='hidden'||(JSON.parse(work.metadata).source||'hosted')!==source)fail(403,'作品类型不同或已下架；不能把托管作品改成外部收录');if((body.expected_version||null)!==work.current_version)fail(409,'作品版本已变化，请读取最新版本后更新');}
 // Legacy aliases are trusted migration metadata and cannot be supplied by clients.
 if(work){const previous=JSON.parse(work.metadata);for(const k of ['legacy_id','legacy_initial_version'])if(previous[k])metadata[k]=previous[k];}
 const selectedListing=kind==='work'?listing(body.listing??work?.listing??p.default_listing??(await first(env,'SELECT default_listing FROM publishers WHERE id=?',p.id)).default_listing):'public';
 if(kind==='work')metadata.listing=selectedListing;
 const workId=work?.id||id(), version=id(), created=now();
 metadata.icon=kind==='work'?versionBase(env,version)+encoded(metadata.icon_path):'';
 metadata.cover=metadata.cover_path?versionBase(env,version)+encoded(metadata.cover_path):'';
 let stored=false;
 for(let attempt=0;attempt<16;attempt++){
  const publicSlug=!work&&kind==='work'&&source==='hosted'?shortCandidate(slug,workId,attempt):null;
  if(publicSlug&&await first(env,'SELECT id FROM works WHERE public_slug=?',publicSlug))continue;
  const commands=[];
  if(!work)commands.push(stmt(env,'INSERT INTO works(id,publisher_id,slug,kind,created,updated,public_slug,listing) VALUES(?,?,?,?,?,?,?,?)',workId,p.id,slug,kind,created,created,publicSlug,selectedListing));
 commands.push(stmt(env,'INSERT INTO versions(id,publisher_id,work_id,idem,request_hash,base_version,base_revision,metadata,total_bytes,created,expires) VALUES(?,?,?,?,?,?,?,?,?,?,?)',version,p.id,workId,idem,requestHash,work?.current_version||null,work?.revision||0,JSON.stringify(metadata),reserved,created,created+86400));
 commands.push(stmt(env,"INSERT INTO files(version_id,path,mime,bytes,sha256) SELECT ?,json_extract(value,'$.path'),json_extract(value,'$.mime'),json_extract(value,'$.bytes'),json_extract(value,'$.sha256') FROM json_each(?)",version,JSON.stringify(files.map(f=>({...f,mime:MIME[f.path.split('.').pop().toLowerCase()]})))));
 try{await env.DB.batch(commands);stored=true;break;}catch(e){if(publicSlug&&/works\.public_slug|works_public_slug_unique/.test(e.message))continue;if(/work_deleted/.test(e.message))fail(409,'内容已删除，无法上传');if(/quota_exceeded/.test(e.message))fail(413,'已达到发布者存储额度（包含历史版本和未完成上传）');if(/rate_limited/.test(e.message))fail(429,'已达到每日上传次数');if(/UNIQUE/.test(e.message)){const retry=await first(env,'SELECT * FROM versions WHERE publisher_id=? AND idem=?',p.id,idem);if(retry&&retry.request_hash===requestHash)return response(sessionResult(env,retry,await rows(env,'SELECT * FROM files WHERE version_id=?',retry.id)));fail(409,'并发创建冲突，请重试');}throw e;}
 }
 if(!stored)fail(503,'短地址暂时无法分配，请重试同一上传请求');
 const v=await ownVersion(env,p,version);return response(sessionResult(env,v,await rows(env,'SELECT * FROM files WHERE version_id=?',version)),201);
}
async function uploadFile(request,env,p,version,relative){
 const f=await first(env,'SELECT f.*,v.work_id,v.metadata AS version_metadata,v.state AS version_state,v.expires FROM files f JOIN versions v ON v.id=f.version_id JOIN works w ON w.id=v.work_id WHERE f.version_id=? AND f.path=? AND v.publisher_id=? AND w.deleted_at IS NULL',version,relative,p.id);if(!f)fail(404,'文件不在清单中或内容已删除');
 if(f.version_state!=='draft'||f.expires<now())fail(409,'会话已发布或过期');const v={work_id:f.work_id,metadata:f.version_metadata};
 if(Number(request.headers.get('Content-Length'))!==f.bytes)fail(400,'Content-Length必须与清单一致');
 if(f.ready)return response({ready:true,path:relative});
 const data=await request.arrayBuffer();if(data.byteLength!==f.bytes||data.byteLength>MAX_FILE)fail(400,'文件大小与清单不同');if(await hash(data)!==f.sha256)fail(422,'SHA256校验失败');
 const metadata=JSON.parse(v.metadata);let stored=data;
 if(f.mime.startsWith('text/html')){
  if(data.byteLength>2*1024*1024)fail(413,'HTML不超过2MiB，请把内嵌素材提取为独立文件');
  let head=false;
  const rewritten=new HTMLRewriter().on('head',{element(e){head=true;e.prepend('<base href="'+versionBase(env,version)+encoded(relative)+'"><link rel="icon" href="'+metadata.icon+'">',{html:true});}}).on('base',{element(e){e.remove();}}).on('link',{element(e){if((e.getAttribute('rel')||'').toLowerCase().split(/\s+/).some(x=>['icon','apple-touch-icon','apple-touch-icon-precomposed'].includes(x)))e.remove();}}).transform(new Response(data));
  const result=await rewritten.text();if(!head)fail(422,'HTML需要显式<head>标签，以写入图标和素材基址');stored=new TextEncoder().encode(result);
 }
 if(relative===metadata.icon_path){
  const bytes=new Uint8Array(data), ext=relative.split('.').pop().toLowerCase();
  if(ext==='svg'){
   const svg=new TextDecoder().decode(data);if(!/<svg\b/i.test(svg)||!/(viewBox|width)\s*=/i.test(svg)||/<(?:script|foreignObject|image)\b|\bon\w+\s*=|@import|(?:href\s*=\s*["'](?!#))|url\(/i.test(svg))fail(422,'图标SVG需为自包含矢量图');
  }else if(ext==='png'&&!(bytes.length>=33&&[137,80,78,71,13,10,26,10].every((b,i)=>bytes[i]===b)))fail(422,'PNG图标格式无效');
  else if(ext==='ico'&&!(bytes.length>=22&&bytes[0]===0&&bytes[1]===0&&bytes[2]===1&&bytes[3]===0))fail(422,'ICO图标格式无效');
 }
 return withWorkOperation(env,v.work_id,async()=>{
  const key='objects/'+p.id+'/'+v.work_id+'/'+await hash(stored);
  await env.FILES.put(key,stored,{httpMetadata:{contentType:f.mime},onlyIf:{etagDoesNotMatch:'*'}});
  await stmt(env,'UPDATE files SET object_key=?,stored_bytes=?,ready=1 WHERE version_id=? AND path=?',key,stored.byteLength,version,relative).run();
  return response({ready:true,path:relative,bytes:stored.byteLength});
 },version);
}
async function commit(env,p,version){
 let v=await ownVersion(env,p,version);if(v.state==='published'){const w=await first(env,'SELECT * FROM works WHERE id=?',v.work_id);if(w.status!=='published')fail(409,'作品已下架，不能通过重试重新公开');return response({published:true,work:publicWork(env,w)});}
 if(v.expires<now())fail(409,'上传会话已过期');
 const pending=await first(env,'SELECT COUNT(*) AS n FROM files WHERE version_id=? AND ready=0',version);if(pending.n)fail(409,'还有'+pending.n+'个文件未完成上传');
 const commands=[stmt(env,"UPDATE works SET current_version=?,metadata=?,listing=COALESCE(json_extract(?,'$.listing'),listing),status='published',updated=?,revision=revision+1 WHERE id=? AND publisher_id=? AND status!='hidden' AND deleted_at IS NULL AND current_version IS ? AND revision=?",version,v.metadata,v.metadata,now(),v.work_id,p.id,v.base_version,v.base_revision),stmt(env,"UPDATE versions SET state='published' WHERE id=? AND EXISTS(SELECT 1 FROM works WHERE id=? AND current_version=?)",version,v.work_id,version)];
 try{await env.DB.batch(commands);}catch(e){if(/UNIQUE/.test(e.message))fail(409,'该网址已被收录，当前草稿未公开');throw e;}v=await ownVersion(env,p,version);if(v.state!=='published')fail(409,'作品已被其他更新修改或下架，当前草稿未公开');
 const w=await first(env,'SELECT * FROM works WHERE id=?',v.work_id);return response({published:true,work:publicWork(env,w)},201);
}
async function content(request,env,url){
 if(!['GET','HEAD'].includes(request.method))fail(405,'内容域名只提供公开阅读');
 // The migrated Suzhou reader keeps its original same-origin storage. Its old
 // raw route must still consult the work lifecycle before reading static Pages.
 if(url.pathname.startsWith('/p/suzhou-museum/_content/')){
  const w=await first(env,"SELECT id FROM works WHERE json_extract(metadata,'$.legacy_id')='suzhou-museum' AND status='published' AND deleted_at IS NULL");if(!w)fail(404,'作品已下架或删除');
  path(decodeURIComponent(url.pathname.slice('/p/suzhou-museum/_content/'.length)));
  const source=new URL(url.pathname+url.search,env.LEGACY_PAGES_ORIGIN||'https://co-created-library-lyn.pages.dev');
  const r=await fetch(source,{method:request.method,headers:request.headers.has('Range')?{Range:request.headers.get('Range')}:{}}),h=new Headers(r.headers);h.set('Cache-Control','no-store');return new Response(r.body,{status:r.status,headers:h});
 }
 const raw=url.pathname.startsWith('/_texopub/content/');
 if(raw){url=new URL(url);url.pathname=url.pathname.slice('/_texopub/content'.length);}
 let relative,version,legacyAlias=false,shortAlias='';
 const immutable=url.pathname.match(/^\/v\/([a-f0-9]{32})\/(.*)$/);
 if(immutable){version=immutable[1];relative=decodeURIComponent(immutable[2]);}
 else{
  const short=url.pathname.match(/^\/p\/([a-z0-9]+(?:-[a-z0-9]+)*)(?:\/(.*))?$/);
  const shortWork=short&&!/^[a-f0-9]{32}$/.test(short[1])?await first(env,"SELECT * FROM works WHERE public_slug=?",short[1]):null;
  if(shortWork){
   const w=shortWork;
   if(w.status!=='published'||w.kind!=='work'||(JSON.parse(w.metadata).source||'hosted')!=='hosted')fail(404,'作品尚未公开');
   if(short[2]===undefined){const dest=new URL(url);dest.pathname+='/';return Response.redirect(dest.href,302);}
   shortAlias=short[1];version=w.current_version;relative=decodeURIComponent(short[2]||JSON.parse(w.metadata).entry);
  }else{
  const alias=url.pathname.match(/^\/p\/(suzhou-museum)\/(.*)$/);
 if(alias){const w=await first(env,"SELECT * FROM works WHERE json_extract(metadata,'$.legacy_id')=? AND status='published' AND kind='work'",alias[1]);if(!w)fail(404,'作品尚未公开');version=w.current_version;relative=decodeURIComponent(alias[2]||JSON.parse(w.metadata).entry);legacyAlias=true;}
 else{
 const m=url.pathname.match(/^\/p\/([a-f0-9]{32})\/([a-z0-9-]+)(?:\/(.*))?$/);if(!m)fail(404,'未找到作品');
  const w=await first(env,"SELECT * FROM works WHERE publisher_id=? AND slug=? AND status='published'",m[1],m[2]);if(!w)fail(404,'作品尚未公开');if(JSON.parse(w.metadata).source==='external')fail(404,'外部网站请使用目录中的原站网址');
  if(m[3]===undefined)return Response.redirect(url.href+'/',302);
  version=w.current_version;relative=decodeURIComponent(m[3]||JSON.parse(w.metadata).entry||'');
 }
 }
 }
 path(relative);
 const f=await first(env,"SELECT f.*,v.metadata AS version_metadata,w.publisher_id,w.slug,w.kind,w.metadata AS work_metadata FROM files f JOIN versions v ON v.id=f.version_id JOIN works w ON w.id=v.work_id WHERE f.version_id=? AND f.path=? AND f.ready=1 AND v.state='published' AND w.status='published'",version,relative);
 if(!f||f.kind==='asset'&&(JSON.parse(f.version_metadata).visibility==='private'||JSON.parse(f.work_metadata).visibility==='private'))fail(404,'文件尚未公开或已下架');
 let range;
 const isHtml=f.mime.startsWith('text/html');
 // HTML is a streamed platform representation, so byte ranges apply only to assets.
 const rangeHeader=isHtml?null:request.headers.get('Range');if(rangeHeader){const m=rangeHeader.match(/^bytes=(\d+)-(\d*)$/);if(!m)fail(416,'不支持此范围请求');const offset=Number(m[1]),end=m[2]?Number(m[2]):f.stored_bytes-1;if(offset>=f.stored_bytes||end<offset)fail(416,'范围无效');range={offset,length:Math.min(end,f.stored_bytes-1)-offset+1};}
 const object=await env.FILES.get(f.object_key,range?{range}:undefined);if(!object)fail(503,'素材暂时不可用');
 const headers=new Headers({...CORS,'Content-Type':f.mime,'Cache-Control':immutable?'public,max-age=300':'no-cache','Content-Security-Policy':"sandbox allow-scripts allow-forms allow-popups allow-modals allow-downloads; frame-ancestors *; base-uri 'self'",'X-Frame-Options':'','Accept-Ranges':'bytes','ETag':object.httpEtag});
 headers.delete('X-Frame-Options');headers.set('Content-Length',String(range?range.length:f.stored_bytes));if(range)headers.set('Content-Range',`bytes ${range.offset}-${range.offset+range.length-1}/${f.stored_bytes}`);
 if(isHtml){
  // The platform owns a separate viewer document; work scripts remain sandboxed
  // in the child document, with their original sticky/fixed controls untouched.
  headers.delete('Content-Length');headers.delete('ETag');headers.set('Accept-Ranges','none');headers.set('Cache-Control','no-store');
  const metadata=JSON.parse(f.version_metadata);let rawRoot='/_texopub/content/v/'+version+'/';
  const trustedLegacy=legacyAlias&&metadata.legacy_initial_version===version;
  if(trustedLegacy)rawRoot='/p/'+metadata.legacy_id+'/_content/';
  if(!raw){
   headers.set('Content-Security-Policy',"default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; frame-src 'self' "+origin(env)+"; img-src https: data:; frame-ancestors *; base-uri 'none'");
   const publicRoot=shortAlias?'/p/'+shortAlias+'/':legacyAlias?'/p/'+metadata.legacy_id+'/':immutable?'/v/'+version+'/':'/p/'+f.publisher_id+'/'+f.slug+'/';
   const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
   const values={TITLE:escape(metadata.title),ICON:escape(metadata.icon),SOURCE:escape((legacyAlias&&!trustedLegacy?origin(env):'')+rawRoot+encoded(relative)+url.search),SANDBOX:'allow-scripts allow-forms allow-popups allow-modals allow-downloads'+(trustedLegacy?' allow-same-origin':''),CONFIG:JSON.stringify({publicRoot,rawRoot,entry:metadata.entry}).replaceAll('<','\\u003c')};
   const html=viewerTemplate.replace(/\{\{(TITLE|ICON|SOURCE|SANDBOX|CONFIG)\}\}/g,(_,key)=>values[key]);
   return new Response(request.method==='HEAD'?null:html,{headers});
  }
  const page=new Response(request.method==='HEAD'?null:object.body,{headers});
  if(request.method==='HEAD')return page;
  let body=false;
  const base=origin(env)+rawRoot+encoded(relative)+url.search;
  return new HTMLRewriter().on('base',{element(e){e.setAttribute('href',base);}}).on('body',{element(e){if(!body){body=true;e.append(workBridge,{html:true});}}}).onDocument({end(e){if(!body)e.append(workBridge,{html:true});}}).transform(page);
 }
 return new Response(request.method==='HEAD'?null:object.body,{status:range?206:200,headers});
}
async function route(request,env,authenticatedPublisher=null){
 const url=new URL(request.url);url.pathname=url.pathname.replace(/^\/api(?=\/)/,'');if(request.method==='OPTIONS')return new Response(null,{status:204,headers:CORS});
 if(env.ROLE==='content')return content(request,env,url);
 if(url.pathname==='/mcp')return mcpRoute(request,env,(r,e,p)=>safeRoute(r,e,p));
 const oauth=await oauthRoutes(request,env,url);if(oauth)return oauth;
 const accountResponse=await accountRoutes(request,env,url);if(accountResponse)return accountResponse;
 if(url.pathname==='/health')return response({ok:true,service:'commonplace-api',version:2});
 if(url.pathname==='/v1/categories'&&request.method==='GET')return response({...taxonomy,formats:FORMATS,listings:LISTINGS,limits:{file_bytes:MAX_FILE,total_bytes:MAX_TOTAL,files:MAX_FILES,html_bytes:2*1024*1024}});
 if(url.pathname.match(/^\/v1\/profiles\/[a-f0-9]{32}$/)&&request.method==='GET'){const pid=url.pathname.split('/').pop(),p=await first(env,'SELECT p.name FROM publishers p JOIN accounts a ON a.publisher_id=p.id WHERE p.id=? AND p.revoked=0 AND a.profile_public=1',pid);if(!p)fail(404,'主页未公开或不存在');return response({publisher_id:pid,name:p.name,items:(await rows(env,"SELECT * FROM works WHERE publisher_id=? AND status='published' AND kind='work' AND listing IN ('profile','public') ORDER BY updated DESC",pid)).map(w=>publicWork(env,w))});}
 if(url.pathname==='/v1/catalog'&&request.method==='GET'){
  const list=await rows(env,"SELECT * FROM works WHERE status='published' AND kind='work' AND listing='public' ORDER BY updated DESC LIMIT 1000"),migrated=new Set((await rows(env,"SELECT json_extract(metadata,'$.legacy_id') AS legacy_id FROM works WHERE json_extract(metadata,'$.legacy_id') IS NOT NULL")).map(w=>w.legacy_id));return response({schema_version:5,title:'TexoPub.ai',items:[...legacy.works.filter(w=>!migrated.has(w.id)),...list.map(w=>publicWork(env,w))].sort((a,b)=>b.updated.localeCompare(a.updated))});
 }
 if(url.pathname==='/v1/materials'&&request.method==='GET'){
  const list=await rows(env,"SELECT f.*,w.publisher_id,w.metadata,w.id AS work_id FROM files f JOIN versions v ON v.id=f.version_id JOIN works w ON w.current_version=v.id WHERE w.status='published' AND json_extract(w.metadata,'$.legacy_id') IS NULL AND COALESCE(json_extract(w.metadata,'$.source'),'hosted')!='external' AND (w.kind!='asset' OR COALESCE(json_extract(w.metadata,'$.visibility'),'public')='public') AND (w.kind!='work' OR w.listing='public') AND f.mime NOT LIKE 'text/html%' AND f.mime NOT LIKE '%javascript%' AND f.mime NOT LIKE 'text/css%' LIMIT 2000");
  const legacyState=await first(env,"SELECT status,listing FROM works WHERE json_extract(metadata,'$.legacy_id')='suzhou-museum'");
  return response({items:[...(legacyState&&(legacyState.status!=='published'||legacyState.listing!=='public')?[]:legacy.assets),...list.map(f=>({id:f.version_id+'/'+f.path,name:f.path.split('/').pop(),title:f.path.split('/').pop(),collection:JSON.parse(f.metadata).title,mime:f.mime,bytes:f.bytes,url:versionBase(env,f.version_id)+encoded(f.path),publisher_id:f.publisher_id}))]});
 }
 const publicId=url.pathname.match(/^\/v1\/works\/([a-f0-9]{32})$/);
 if(publicId&&request.method==='GET'){const w=await first(env,"SELECT * FROM works WHERE id=? AND status='published' AND (kind!='asset' OR COALESCE(json_extract(metadata,'$.visibility'),'public')='public')",publicId[1]);if(!w)fail(404,'作品不存在');return response(publicWork(env,w));}
 if(url.pathname.startsWith('/v1/admin/')){
  await auth(request,env,true);
  if(url.pathname==='/v1/admin/publishers'&&request.method==='POST'){
   const b=await json(request), name=text(b.name,'发布者名称',80), pid=id(), token='cp_'+id()+id();const quota=b.quota_bytes??536870912;if(!Number.isSafeInteger(quota)||quota<1||quota>10*1024**3)fail(400,'无效额度');
   await stmt(env,'INSERT INTO publishers(id,name,token_hash,quota_bytes,created) VALUES(?,?,?,?,?)',pid,name,await hash(token),quota,now()).run();return response({publisher_id:pid,name,token,quota_bytes:quota},201);
  }
  const pub=url.pathname.match(/^\/v1\/admin\/publishers\/([a-f0-9]{32})\/revoke$/);if(pub&&request.method==='POST'){await stmt(env,'UPDATE publishers SET revoked=1 WHERE id=?',pub[1]).run();return response({revoked:true});}
  const hide=url.pathname.match(/^\/v1\/admin\/works\/([a-f0-9]{32})\/hide$/);if(hide&&request.method==='POST'){await stmt(env,"UPDATE works SET status='hidden',updated=? WHERE id=?",now(),hide[1]).run();return response({hidden:true});}
  fail(404,'管理接口不存在');
 }
 const p=authenticatedPublisher||await auth(request,env);
 if(url.pathname==='/v1/me/preferences'&&request.method==='POST'){const b=await json(request),value=listing(b.default_listing);await stmt(env,'UPDATE publishers SET default_listing=? WHERE id=?',value,p.id).run();return response({default_listing:value});}
 const ownId=url.pathname.match(/^\/v1\/me\/works\/([a-f0-9]{32})$/);
 if(ownId&&request.method==='GET'){const w=await first(env,'SELECT * FROM works WHERE id=? AND publisher_id=?',ownId[1],p.id);if(!w)fail(404,'内容不存在或不属于当前空间');return response({...publicWork(env,w),status:w.status,kind:w.kind});}
 const deletion=url.pathname.match(/^\/v1\/me\/works\/([a-f0-9]{32})\/delete$/);
 if(deletion&&request.method==='POST')return response(await deleteWork(env,p,deletion[1],await json(request)));
 const showListing=url.pathname.match(/^\/v1\/me\/works\/([a-f0-9]{32})\/listing$/);
 if(showListing&&request.method==='POST'){
  const b=await json(request),value=listing(b.listing),w=await first(env,"SELECT * FROM works WHERE id=? AND publisher_id=? AND kind='work' AND deleted_at IS NULL",showListing[1],p.id);
  if(!w)fail(404,'作品不存在或不属于当前空间');if(!Object.hasOwn(b,'expected_version')||b.expected_version!==w.current_version||(b.expected_revision!==undefined&&b.expected_revision!==w.revision))fail(409,'作品已变化，请刷新后再修改展示范围');
  const r=await stmt(env,'UPDATE works SET listing=?,revision=revision+1,updated=? WHERE id=? AND publisher_id=? AND current_version IS ? AND revision=? AND deleted_at IS NULL',value,now(),w.id,p.id,b.expected_version,w.revision).run();if(!r.meta.changes)fail(409,'作品已变化，请刷新后重试');
  return response({...publicWork(env,{...w,listing:value,revision:w.revision+1}),status:w.status,kind:w.kind});
 }
 const withdraw=url.pathname.match(/^\/v1\/works\/([a-f0-9]{32})\/withdraw$/);
 if(withdraw&&request.method==='POST'){
  const w=await first(env,'SELECT * FROM works WHERE id=? AND publisher_id=?',withdraw[1],p.id);if(!w)fail(404,'收录不存在或不属于当前发布者');if(JSON.parse(w.metadata).source!=='external')fail(400,'此接口仅用于移除外部网站收录');
  const b=await json(request);if(!b.expected_version||b.expected_version!==w.current_version)fail(409,'请读取最新版本后再移除收录');
  if(w.status==='hidden')return response({removed:true,work_id:w.id});
  const changed=await stmt(env,"UPDATE works SET status='hidden',updated=? WHERE id=? AND publisher_id=? AND current_version=? AND status='published'",now(),w.id,p.id,b.expected_version).run();if(changed.meta.changes!==1)fail(409,'收录状态已变化，请重新读取');return response({removed:true,work_id:w.id});
 }
 const archive=url.pathname.match(/^\/v1\/me\/works\/([a-f0-9]{32})\/archive$/);
 if(archive&&request.method==='POST'){const b=await json(request),w=await first(env,'SELECT * FROM works WHERE id=? AND publisher_id=?',archive[1],p.id);if(!w||w.deleted_at)fail(404,'内容不存在或不属于当前空间');if(!b.expected_version||b.expected_version!==w.current_version)fail(409,'内容已变化，请刷新后再归档');const changed=await stmt(env,"UPDATE works SET status='hidden',updated=? WHERE id=? AND publisher_id=? AND current_version=?",now(),w.id,p.id,b.expected_version).run();if(!changed.meta.changes)fail(409,'内容已变化，请刷新后再归档');return response({archived:true,work_id:w.id});}
 if(url.pathname==='/v1/me/materials'&&request.method==='GET'){
  const files=await rows(env,"SELECT f.*,w.kind,w.metadata,w.id AS work_id FROM files f JOIN versions v ON v.id=f.version_id JOIN works w ON w.current_version=v.id WHERE w.publisher_id=? AND w.status='published' AND COALESCE(json_extract(w.metadata,'$.source'),'hosted')!='external' AND f.mime NOT LIKE 'text/html%' AND f.mime NOT LIKE '%javascript%' AND f.mime NOT LIKE 'text/css%' ORDER BY w.updated DESC,(f.mime LIKE 'image/%') DESC,f.path LIMIT 2000",p.id);
  return response({items:files.map(f=>({id:f.version_id+'/'+f.path,name:f.path,work_id:f.work_id,collection:JSON.parse(f.metadata).title,kind:f.kind,version:f.version_id,bytes:f.bytes,mime:f.mime,visibility:f.kind==='asset'?(JSON.parse(f.metadata).visibility||'public'):'public',url:(env.APP_ORIGIN||'https://texopub.com')+'/api/v1/me/files/'+f.version_id+'/'+encoded(f.path)}))});
 }
 const privateAsset=url.pathname.match(/^\/v1\/me\/assets\/([a-f0-9]{32})$/);
 if(privateAsset&&['GET','HEAD'].includes(request.method)){const w=await first(env,"SELECT * FROM works WHERE id=? AND publisher_id=? AND kind='asset' AND status='published'",privateAsset[1],p.id);if(!w)fail(404,'素材不存在或不属于当前空间');url.pathname='/v1/me/files/'+w.current_version+'/'+encoded(JSON.parse(w.metadata).entry);}
 const privateFile=url.pathname.match(/^\/v1\/me\/files\/([a-f0-9]{32})\/(.+)$/);
 if(privateFile&&['GET','HEAD'].includes(request.method)){
  const relative=path(decodeURIComponent(privateFile[2]));const f=await first(env,"SELECT f.* FROM files f JOIN versions v ON v.id=f.version_id JOIN works w ON w.id=v.work_id WHERE f.version_id=? AND f.path=? AND w.publisher_id=? AND f.ready=1 AND v.state='published' AND w.status='published'",privateFile[1],relative,p.id);if(!f)fail(404,'素材不存在或不属于当前空间');
  const obj=await env.FILES.get(f.object_key);if(!obj)fail(404,'素材暂时不可用');return new Response(request.method==='HEAD'?null:obj.body,{headers:{'Content-Type':f.mime,'Cache-Control':'private,no-store','X-Content-Type-Options':'nosniff','Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(relative.split('/').pop()),'Content-Security-Policy':"sandbox; default-src 'none'; frame-ancestors 'none'"}});
 }
 if(url.pathname==='/v1/me/works'&&request.method==='GET')return response({items:(await rows(env,'SELECT * FROM works WHERE publisher_id=? AND delete_complete=0 ORDER BY updated DESC LIMIT 1000',p.id)).map(w=>({...publicWork(env,w),status:w.status,kind:w.kind}))});
 if(url.pathname==='/v1/me'&&request.method==='GET'){const usage=await first(env,'SELECT COALESCE(SUM(total_bytes),0) AS reserved_bytes FROM versions WHERE publisher_id=?',p.id);return response({publisher_id:p.id,name:p.name,quota_bytes:p.quota_bytes,...usage,default_listing:(await first(env,'SELECT default_listing FROM publishers WHERE id=?',p.id)).default_listing,works:await rows(env,'SELECT id,slug,current_version,status,listing,revision,deleted_at FROM works WHERE publisher_id=? AND delete_complete=0',p.id)});}
 if(url.pathname==='/v1/uploads'&&request.method==='POST')return createUpload(request,env,p);
 const file=url.pathname.match(/^\/v1\/uploads\/([a-f0-9]{32})\/files\/(.+)$/);if(file&&request.method==='PUT')return uploadFile(request,env,p,file[1],path(decodeURIComponent(file[2])));
 const finish=url.pathname.match(/^\/v1\/uploads\/([a-f0-9]{32})\/commit$/);if(finish&&request.method==='POST')return commit(env,p,finish[1]);
 fail(404,'接口不存在');
}
async function safeRoute(request,env,p=null){try{return await route(request,env,p);}catch(error){if(error instanceof Failure||error instanceof AccountError)return response({error:error.message},error.status);return response({error:'服务暂时不可用，请保留上传会话并重试'},503);}}
export default {fetch(request,env){return safeRoute(request,env);}};
