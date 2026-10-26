import {McpServer} from '../.tools/node_modules/@modelcontextprotocol/sdk/dist/esm/server/mcp.js';
import {WebStandardStreamableHTTPServerTransport} from '../.tools/node_modules/@modelcontextprotocol/sdk/dist/esm/server/webStandardStreamableHttp.js';
import * as z from '../.tools/node_modules/zod/index.js';
import {oauthIdentity,authChallenge,bounded,resource} from './mcp-oauth.mjs';
import {AccountError,sha} from './accounts.mjs';
const E=new TextEncoder(),LIMIT=25*1024*1024;
const short=z.string().min(1).max(120),identifier=z.string().regex(/^[a-f0-9]{32}$/),slug=z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(64);
const fileRef=z.object({download_url:z.string().url(),file_id:z.string().min(1),mime_type:z.string().optional(),file_name:z.string().optional()});
const annotations=(read=false,destructive=false)=>({readOnlyHint:read,destructiveHint:destructive,idempotentHint:true,openWorldHint:!read});
const security=scope=>[{type:'oauth2',scopes:scope}];
const result=value=>({content:[{type:'text',text:JSON.stringify(value)}],structuredContent:value});
function fail(message,status=400){throw new AccountError(status,message);}
function trustedFile(raw){let u;try{u=new URL(raw);}catch{fail('需要有效的对话文件链接');}if(u.protocol!=='https:'||u.username||u.password||u.port||!(/(^|\.)(oaiusercontent\.com|openaiusercontent\.com|blob\.core\.windows\.net)$/.test(u.hostname)||u.hostname==='files.openai.com'||(u.hostname==='chatgpt.com'&&u.pathname.startsWith('/backend-api/'))))fail('只接收 ChatGPT 授权的文件下载地址；其他客户端请传入 HTML 或文本文件');return u;}
async function download(f){let u=trustedFile(f.download_url);for(let i=0;i<4;i++){const r=await fetch(u,{redirect:'manual',signal:AbortSignal.timeout(20000)});if([301,302,303,307,308].includes(r.status)){u=trustedFile(new URL(r.headers.get('Location'),u).href);await r.body?.cancel();continue;}if(!r.ok){await r.body?.cancel();fail('对话文件下载失败或链接已过期，请重新提供文件',422);}return bounded(r,LIMIT);}fail('文件下载重定向次数过多');}
function filePath(s){if(typeof s!=='string'||s.length>240||s.startsWith('/')||/[\\%?#\u0000-\u001f]/.test(s)||s.split('/').some(x=>!x||x.startsWith('.')||x==='node_modules'))fail('文件名必须是包内相对路径，不能包含隐藏或越界目录');return s;}
const hashBytes=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function mcpRoute(request,env,apiRoute){
 if(!['POST','GET','DELETE'].includes(request.method))return new Response(null,{status:405});
 const requestOrigin=request.headers.get('Origin');if(requestOrigin&&!['https://chatgpt.com',env.APP_ORIGIN||'https://texopub.com'].includes(requestOrigin))return new Response('Origin not allowed',{status:403});
 // OAuth is separate from API keys: tokens are resource-bound and never sent to file hosts.
 const identity=await oauthIdentity(request,env);
 if(!identity)return authChallenge(env);
 const call=async(method,path,body)=>{
  if(!identity)fail('请先连接 TexoPub 账号',401);if(method==='GET'&&!identity.scope.split(' ').includes('texopub:read'))fail('此连接没有读取权限',403);if(method!=='GET'&&!identity.scope.split(' ').includes('texopub:publish'))fail('此连接只有读取权限',403);
  const headers={};let data=body;if(body instanceof Uint8Array){headers['Content-Length']=String(body.length);}else if(body!==undefined){data=JSON.stringify(body);headers['Content-Type']='application/json';}
  const r=await apiRoute(new Request('https://texopub.internal'+path,{method,headers,body:data}),env,identity);
  if(!r.ok){let b;try{b=await r.json();}catch{}fail(b?.error||'发布请求未完成',r.status);}return r;
 };
 const api=async(...args)=>(await call(...args)).json();
 const ownWork=id=>api('GET','/v1/me/works/'+id);
 const server=new McpServer({name:'TexoPub',version:'0.3.0'},{instructions:'Publish static HTML websites and files to the user’s own TexoPub space. Read categories before publishing; require a dedicated icon for new websites. Publish, archive or permanently delete only when the user requests it. Ask for listing on each publication unless already chosen or covered by a standing instruction: unlisted (no public lists), profile (personal homepage), public (both, default). Read default_listing from get_my_space; unlisted links remain accessible. Updates require the same work_id and current expected_version, and keep the URL. Creator profile and AI partner changes require the current revision. AI partner application/model/contribution are self-reported and must be truthful; unknown model/biography is omitted. Do not infer old work credits. Never enable the personal homepage. Missing covers use the platform typographic fallback. Standalone assets default to private. Never upload credentials. File references must be authorized conversation files; local paths are not readable by this cloud server.'});
 const add=(name,title,description,schema,read,handler,meta={},destructive=false)=>server.registerTool(name,{title,description,inputSchema:schema,annotations:annotations(read,destructive),_meta:{securitySchemes:security(read?['texopub:read']:['texopub:publish']),...meta}},async args=>{
  if(name!=='list_categories'&&!identity)return {isError:true,content:[{type:'text',text:'请先连接自己的 TexoPub 账号。'}],_meta:{'mcp/www_authenticate':[`Bearer resource_metadata="${(env.API_ORIGIN||'https://commonplace-api.ivanliyuanning123.workers.dev')}/.well-known/oauth-protected-resource", scope="texopub:read texopub:publish"`]}};
  try{return result(await handler(args));}catch(err){return {isError:true,content:[{type:'text',text:err.status?err.message:'服务暂时不可用，请用相同幂等键重试；尚未提交的上传不会公开。'}],structuredContent:{error:err.status?err.message:'服务暂时不可用',status:err.status||503}};}
 });
 add('list_categories','选择发布分类','读取有效二级分类、内容形式和上传限制。发布时直接使用子项的 category_id 完整路径，例如 technology/software，不能只传 software。',{},true,async()=>{const r=await apiRoute(new Request('https://texopub.internal/v1/categories'),env);const data=await r.json();return {...data,groups:data.groups.map(g=>({...g,children:g.children.map(c=>({...c,category_id:g.id+'/'+c.id}))})),category_id_format:'group.id/child.id'};});
 add('get_my_space','查看我的空间','读取当前授权身份、存储额度和作品标识，不返回手机号、邮箱或密钥。',{},true,()=>api('GET','/v1/me'));
 add('get_my_profile','读取我的创作者资料','读取自己的名字、简介、头像和AI伙伴及资料revision，不含联系方式或密钥。修改前先读取，不自动开启主页。',{},true,()=>api('GET','/v1/me/profile'));
 add('update_my_profile','更新我的个人资料','按用户明确需求修改自己的名字、头像或简介。先get_my_profile读取revision。简介只有用户提供或确认后才写入，省略字段沿用原值。头像用公开HTTPS图片；空字符串恢复几何头像，name=null恢复默认名。不能开启主页或改权限。',{expected_revision:z.number().int().min(0),name:z.string().min(1).max(80).nullable().optional(),bio:z.string().max(400).optional(),avatar_url:z.string().max(2048).optional()},false,a=>api('POST','/v1/me/profile',a));
 add('upsert_ai_partner','登记或更新我的AI伙伴','先get_my_profile读取伙伴revision；新伙伴expected_revision=0，key在本人空间固定。application为可确认的应用名，name省略默认应用名。简介和自定义头像只按用户明确需求填写。show_on_profile仅在用户要求展示该伙伴时设true，不能开启个人主页。作品实际参与记录通过发布时ai_partners自报，未知模型省略。',{key:z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/).max(64),expected_revision:z.number().int().min(0),application:z.string().min(1).max(80).optional(),name:z.string().min(1).max(80).optional(),bio:z.string().max(400).optional(),avatar_url:z.string().max(2048).optional(),show_on_profile:z.boolean().optional()},false,a=>api('POST','/v1/me/ai-partners',a));
 add('list_my_works','列出我的作品','列出自己的作品、素材、版本与归档状态，查找更新目标。',{},true,()=>api('GET','/v1/me/works'));
 add('get_work','查看作品当前版本','更新、修改展示范围或删除前读取当前作品，核对 work_id 和 version。仅限本人空间。',{work_id:identifier},true,({work_id})=>ownWork(work_id));
 add('list_my_materials','查看我的素材','列出本人作品素材与独立文件。私有链接需要本人鉴权，不能当作公开图片地址。',{},true,()=>api('GET','/v1/me/materials'));
 const aiPartners=z.array(z.object({key:z.string().regex(/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/).max(64),application:z.string().min(1).max(80),name:z.string().min(1).max(80).optional(),avatar_url:z.string().max(2048).optional(),model:z.string().max(120).optional().describe('仅填写当前客户端可确认的模型；未知则省略，不能猜测'),contribution:z.string().max(240).optional().describe('仅记录本件实际参与内容；单纯上传不冒称创作')})).max(8).optional().describe('本次真实参与的AI伙伴自报；key在本人空间固定。省略沿用原作品记录，空数组明确清空；不补写旧作品署名');
 const common={slug,title:short,summary:z.string().max(1000).optional(),idempotency_key:z.string().min(1).max(100).describe('同一次发布重试必须使用同一键；新版本使用新键'),work_id:identifier.optional(),expected_version:identifier.optional()};
 async function publish(args,kind){
  if((args.work_id&&!args.expected_version)||(!args.work_id&&args.expected_version))fail('更新须同时提供 work_id 和 expected_version');
  const old=args.work_id?await ownWork(args.work_id):null;if(old&&(old.slug!==args.slug))fail('作品或版本不匹配，请读取当前版本后更新',409);
  if((args.attachments?.length||0)+(args.text_files?.length||0)+Number(args.html!==undefined)+Number(args.icon_svg!==undefined)>8)fail('超过8文件请使用分步上传工具');
  const files=new Map();let total=0;
  const put=(path,bytes)=>{path=filePath(path);if(files.has(path))fail('重复文件路径：'+path);if(bytes.length>LIMIT)fail('每个文件不超过25MiB',413);total+=bytes.length;if(total>32*1024*1024)fail('插件单次合计不超过32MiB；更大作品请用现有发布客户端',413);files.set(path,bytes);};
  if(kind==='work'){
   if(args.html!==undefined)put(args.entry||'index.html',E.encode(args.html));
   for(const f of args.text_files||[])put(f.path,E.encode(f.text));
   if(args.icon_svg!==undefined)put(args.icon||'texopub-icon.svg',E.encode(args.icon_svg));
  }
  const refs=kind==='asset'?[args.file]:(args.attachments||[]),paths=kind==='asset'?[args.path]:(args.attachment_paths||[]);
  if(paths.length&&paths.length!==refs.length)fail('文件路径数量须与附件数量一致');
  for(let i=0;i<refs.length;i++)put(paths[i]||refs[i].file_name,await download(refs[i]));
  const previous=old?await env.DB.prepare('SELECT metadata FROM versions WHERE id=? AND work_id=? AND publisher_id=?').bind(args.expected_version,old.id,identity.id).first():null;
  if(old&&!previous)fail('更新的基础版本不属于此作品',403);
  let icon=args.icon||(args.icon_svg!==undefined?'texopub-icon.svg':previous?JSON.parse(previous.metadata).icon_path:undefined);
  if(kind==='work'&&old&&icon&&!files.has(icon)){
   const r=await call('GET','/v1/me/files/'+args.expected_version+'/'+icon.split('/').map(encodeURIComponent).join('/'));put(icon,await bounded(r,1024*1024));
  }
  if(kind==='work'&&(!icon||!files.has(icon)))fail('新作品必须提供专属 icon_svg 或图标附件');
  if(!files.size||files.size>8)fail('一键发布接收1至8个文件；更多文件请使用 inspect_files / prepare_upload / upload_file / commit_upload 分步发布');
  const manifest=[];for(const [path,b] of files)manifest.push({path,bytes:b.length,sha256:await hashBytes(b)});
  const body={kind,slug:args.slug,title:args.title,summary:args.summary||'',idempotency_key:args.idempotency_key,files:manifest,...(old?{work_id:old.id,expected_version:args.expected_version}:{})};
  if(kind==='work')Object.assign(body,{...(args.source==='external'?{source:'external',external_url:args.external_url,link_status:args.link_status||'unchecked'}:{}),...(args.ai_partners!==undefined?{ai_partners:args.ai_partners}:{}),...(args.cover?{cover:args.cover}:{}),...(args.listing!==undefined?{listing:args.listing}:{}),entry:args.entry||'index.html',icon,category_id:args.category_id,format:args.format||'article',tags:args.tags||[]});else body.visibility=args.visibility||'private';
  const upload=await api('POST','/v1/uploads',body);
  for(const f of upload.files)if(!f.ready)await call('PUT',f.upload_path,files.get(f.path));
  const done=await api('POST',upload.commit_path,{});return {published:true,work_id:done.work.id,version:done.work.version,url:done.work.url,work:done.work,listing:done.work.listing,visibility:kind==='asset'?body.visibility:'public',note:kind==='asset'&&body.visibility==='private'?'仅本人可访问；此网址不是匿名素材链接。':'已公开，返回的网址可直接分享。'};
 }
 add('publish_website','发布或更新网页','仅在用户要求发布/更新静态网页时调用。按用户选择的listing控制展示位置，三档均可通过链接访问。新作品需要二级分类和专属图标。直接传 html 或 text_files；附件为授权对话文件，与 attachment_paths 对齐。更新传原 work_id、当前 expected_version 和原 slug；只提交完整新版文件集合，URL保持。无 Mac 本地文件读取。',{...common,ai_partners:aiPartners,cover:z.string().max(240).optional().describe('包内封面图片路径；可不提供，网站使用稳定排版封面'),listing:z.enum(['unlisted','profile','public']).optional().describe('展示范围：unlisted不展示、profile仅个人主页、public公开展示。发布前询问用户或遵循其已指定规则；新作品默认读取空间default_listing，更新省略则保持原范围。三档链接均可访问。'),category_id:z.string().min(3).max(100).describe('list_categories 子项的完整 category_id，例如 technology/software；不能只传 software'),format:z.enum(['guide','article','report','tutorial','tool','visualization','portfolio']).optional(),tags:z.array(z.string().max(40)).max(12).optional(),entry:z.string().max(240).optional(),html:z.string().max(2*1024*1024).optional(),icon_svg:z.string().max(1024*1024).optional(),icon:z.string().max(240).optional(),text_files:z.array(z.object({path:z.string().max(240),text:z.string().max(2*1024*1024)})).max(50).optional(),attachments:z.array(fileRef).max(50).optional(),attachment_paths:z.array(z.string().max(240)).max(50).optional()},false,a=>publish(a,'work'),{'openai/fileParams':['attachments']});
 add('submit_website','收录或更新外部网站','用户要求收录已有网站时使用，保留原网址及托管，不复制原站。需要二级分类和专属icon_svg，更新传原work_id和expected_version。按明确选择设置listing；AI参与记录只说明实际完成的工作。',{...common,external_url:z.string().url().max(2048),category_id:z.string().min(3).max(100),format:z.enum(['guide','article','report','tutorial','tool','visualization','portfolio']).optional(),listing:z.enum(['unlisted','profile','public']).optional(),icon_svg:z.string().min(1).max(1024*1024),ai_partners:aiPartners,link_status:z.enum(['unchecked','unavailable']).optional()},false,a=>publish({...a,source:'external'},'work'));
 add('set_asset_visibility','修改独立素材权限','仅按用户明确要求修改自己的一份独立素材权限，不重新上传文件。先get_work读取version和revision；改为public须获明确公开授权。不能用于网页依赖文件，不能改变他人素材。',{work_id:identifier,expected_version:identifier,expected_revision:z.number().int().min(0),visibility:z.enum(['private','public'])},false,a=>api('POST','/v1/me/works/'+a.work_id+'/visibility',a));
 add('upload_asset','上传独立素材','按用户要求上传一份对话文件到自己的素材库，默认私有。仅获明确公开授权时用 visibility=public。更新保留原 work_id 和 slug。',{...common,file:fileRef,path:z.string().max(240).optional(),visibility:z.enum(['private','public']).optional()},false,a=>publish(a,'asset'),{'openai/fileParams':['file']});
 // Large websites are staged across requests to stay within free-tier D1 limits.
 add('inspect_files','校验待发布文件','为分步发布读取授权附件或文本，返回原字节大小和SHA256；不公开、不创建上传。每次最多8份，分批合并清单。',{attachments:z.array(fileRef).max(8).optional(),attachment_paths:z.array(z.string().max(240)).max(8).optional(),text_files:z.array(z.object({path:z.string().max(240),text:z.string().max(2*1024*1024)})).max(8).optional()},true,async a=>{
  const list=[],refs=a.attachments||[],paths=a.attachment_paths||[];if(paths.length&&paths.length!==refs.length)fail('附件路径数量不匹配');if(refs.length+(a.text_files||[]).length>8)fail('每次最多校验8份文件');
  const inspect=async(path,bytes)=>{list.push({path:filePath(path),bytes:bytes.length,sha256:await hashBytes(bytes)});};
  for(let i=0;i<refs.length;i++)await inspect(paths[i]||refs[i].file_name,await download(refs[i]));for(const x of a.text_files||[])await inspect(x.path,E.encode(x.text));return {files:list};
 },{'openai/fileParams':['attachments']});
 add('prepare_upload','准备分步网页发布','超过8文件时分步发布。先inspect_files取得每个文件的bytes/sha256；提交完整清单、分类、入口和图标路径。此步只建私有草稿，尚未公开。最多250文件/100MiB。更新仍传原work_id/expected_version。',{...common,ai_partners:aiPartners,cover:z.string().max(240).optional().describe('包内封面图片路径；可不提供，网站使用稳定排版封面'),listing:z.enum(['unlisted','profile','public']).optional().describe('展示范围：unlisted不展示、profile仅个人主页、public公开展示。发布前询问用户或遵循其已指定规则；新作品默认读取空间default_listing，更新省略则保持原范围。三档链接均可访问。'),category_id:z.string().min(3).max(100).describe('list_categories 子项的完整 category_id，例如 technology/software；不能只传 software'),format:z.enum(['guide','article','report','tutorial','tool','visualization','portfolio']).optional(),entry:z.string().max(240),icon:z.string().max(240),files:z.array(z.object({path:z.string().max(240),bytes:z.number().int().min(0).max(LIMIT),sha256:z.string().regex(/^[a-f0-9]{64}$/)})).min(1).max(250)},false,async a=>{
  if((a.work_id&&!a.expected_version)||(!a.work_id&&a.expected_version))fail('更新须同时提供work_id和expected_version');return api('POST','/v1/uploads',{...a,kind:'work'});
 });
 add('upload_file','上传草稿中的一个文件','将授权对话附件或text原字节传入prepare_upload返回的upload_id及包内path。文件必须匹配清单SHA256，失败不公开，成功可重试。每个文件单独调用，防止大包超过每次数据库查询限制。',{upload_id:identifier,path:z.string().max(240),file:fileRef.optional(),text:z.string().max(2*1024*1024).optional()},false,async a=>{
  if((a.file!==undefined)===(a.text!==undefined))fail('必须且只能提供file或text之一');const path=filePath(a.path);const bytes=a.file?await download(a.file):E.encode(a.text);return api('PUT','/v1/uploads/'+a.upload_id+'/files/'+path.split('/').map(encodeURIComponent).join('/'),bytes);
 },{'openai/fileParams':['file']});
 add('commit_upload','完成分步发布','仅在用户已要求发布且清单文件全部上传后提交。按准备阶段的listing控制展示位置并返回实际短网址；同一upload_id重试不会新建版本。',{upload_id:identifier},false,async a=>{const x=await api('POST','/v1/uploads/'+a.upload_id+'/commit',{});return {...x,work_id:x.work.id,version:x.work.version,url:x.work.url};});
 add('archive_work','归档自己的内容','仅在用户明确要求下架/归档时调用。立即关闭该作品/素材的公开访问，历史仍占额度。先 get_work 读取当前 version，不能撤销他人内容。',{work_id:identifier,expected_version:identifier},false,({work_id,expected_version})=>api('POST','/v1/me/works/'+work_id+'/archive',{expected_version}),{},true);
 add('set_work_listing','修改作品展示范围','按用户要求修改自己的作品展示位置，不上传新版本。unlisted不展示、profile仅个人主页、public公开展示；三档链接均可访问，个人主页开关保持不变。先get_work读取当前version和revision。',{work_id:identifier,expected_version:identifier.nullable(),expected_revision:z.number().int().min(0),listing:z.enum(['unlisted','profile','public'])},false,a=>api('POST','/v1/me/works/'+a.work_id+'/listing',a));
 add('set_publish_preferences','修改默认展示范围','仅在用户要求改变以后的默认值时调用。新网页默认public，可改unlisted或profile；不改变已有作品，不改变个人主页开关。每次发布仍应询问，除非用户已选择或有明确长期指示。',{default_listing:z.enum(['unlisted','profile','public'])},false,a=>api('POST','/v1/me/preferences',a));
 add('delete_work','永久删除自己的内容','仅在用户明确要求永久删除时调用，无法恢复。先get_work读取version；草稿version可为null。清除全部历史版本和独占文件，保护共用资源并释放额度；若deleted=false，使用相同参数继续到deleted=true。重试安全；不能删除他人内容。',{work_id:identifier,expected_version:identifier.nullable(),confirm:z.literal(true)},false,a=>api('POST','/v1/me/works/'+a.work_id+'/delete',a),{},true);
 const transport=new WebStandardStreamableHTTPServerTransport({sessionIdGenerator:undefined,enableJsonResponse:true,maxRequestBodySize:3*1024*1024});
 await server.connect(transport);const r=await transport.handleRequest(request);const h=new Headers(r.headers);h.set('Cache-Control','no-store');h.set('Access-Control-Allow-Origin','*');h.set('Access-Control-Expose-Headers','WWW-Authenticate,MCP-Protocol-Version');return new Response(r.body,{status:r.status,headers:h});
}
