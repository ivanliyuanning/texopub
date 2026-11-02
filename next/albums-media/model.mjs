/** Local, explicit fixtures for the interaction preview. No production API. */
export const STORAGE_KEY='texopub-albums-preview-20261102-v1';
export const albumId='huidong-tennis-test';
export const initialState={revision:0,secondary:false,listing:'unlisted',profilePublic:true,memberListing:'unlisted',status:'published',view:'ready',cover:'generated',external:'direct',order:['annotation','red-video','blue-video','hit-audio'],removed:[],hidden:[],actor:'owner',upload:{status:'idle',parts:0,total:12},lastOperation:'初始预览：专辑和成员均不展示',history:[]};
export function readState(storage=localStorage){try{const x=JSON.parse(storage.getItem(STORAGE_KEY));return x?.schema===1?{...structuredClone(initialState),...x.state}:structuredClone(initialState)}catch{return structuredClone(initialState)}}
export function writeState(state,storage=localStorage){storage.setItem(STORAGE_KEY,JSON.stringify({schema:1,state}));return state}
export function applyOperation(current,operation,expectedRevision=current.revision){
 if(expectedRevision!==current.revision)return {ok:false,error:'内容已变化，请重新读取后再修改。',state:current};
 const s=structuredClone(current);let message='';
 const [kind,value]=operation;
 switch(kind){
  case 'secondary':s.secondary=Boolean(value);message='第二个验收专辑'+(value?'引用同一标注网页':'移除（不删网页）');break;
  case 'listing':if(!['unlisted','profile'].includes(value))throw Error('无效专辑范围');s.listing=value;message='专辑'+(value==='profile'?'仅个人主页展示':'不展示');break;
  case 'profile':s.profilePublic=Boolean(value);message='预览主页'+(value?'开启':'关闭');break;
  case 'member-listing':if(!['unlisted','profile','public'].includes(value))throw Error('无效内容范围');s.memberListing=value;message='标注网页：'+value;break;
  case 'status':if(!['published','hidden','deleted'].includes(value))throw Error('无效状态');s.status=value;message='专辑状态：'+value;break;
  case 'view':if(!['ready','empty','loading','error'].includes(value))throw Error('无效视图');s.view=value;message='预览状态：'+value;break;
  case 'cover':if(!['generated','photo','broken','none'].includes(value))throw Error('无效封面');s.cover=value;message='替换预览封面：'+value;break;
  case 'external':if(!['direct','platform','unavailable','unsupported'].includes(value))throw Error('无效外链状态');s.external=value;message='外部资源：'+value;break;
  case 'add':if(!s.order.includes(value))throw Error('未知内容');s.removed=s.removed.filter(x=>x!==value);message='加入内容（去重）：'+value;break;
  case 'remove':if(!s.order.includes(value))throw Error('未知内容');if(!s.removed.includes(value))s.removed.push(value);message='仅移出专辑：'+value;break;
  case 'hide':if(!s.hidden.includes(value))s.hidden.push(value);message='归档成员：'+value;break;
  case 'restore':s.hidden=s.hidden.filter(x=>x!==value);message='恢复成员：'+value;break;
  case 'reverse':s.order.reverse();message='调整内容顺序';break;
  case 'actor':s.actor=value==='guest'?'guest':'owner';message='切换预览身份：'+s.actor;break;
  case 'upload-start':s.upload={status:'uploading',parts:0,total:12};message='模拟开始180MiB文件上传，无文件传输';break;
  case 'upload-part':if(s.upload.status!=='uploading')return {ok:true,state:current};s.upload.parts=Math.min(s.upload.parts+1,s.upload.total);if(s.upload.parts===s.upload.total)s.upload.status='verifying';message='模拟分块完成：'+s.upload.parts+'/12';break;
  case 'upload-pause':if(s.upload.status!=='uploading')return {ok:false,state:current,error:'没有正在上传的模拟任务'};s.upload.status='paused';message='模拟连接中断，保留已完成分块';break;
  case 'upload-resume':if(s.upload.status!=='paused')return {ok:false,state:current,error:'没有可续传的模拟任务'};s.upload.status='uploading';message='模拟从已完成分块续传';break;
  case 'upload-commit':if(s.upload.status!=='verifying')return {ok:false,state:current,error:'所有分块完成后才能模拟提交'};s.upload.status='complete';message='模拟校验与提交完成；未上传真实文件';break;
  default:throw Error('未知预览操作');
 }
 s.revision++;s.lastOperation=message;s.history=[{revision:s.revision,message},...s.history].slice(0,12);
 return {ok:true,state:s};
}
export function records(state,externalOrigin){return [
 {id:'annotation',type:'web',title:'网球位置与击球声 · 试标结果',summary:'13 张球位置试标、48 条声音候选。放大原帧，对照球框，循环试听击球节点。',listing:state.memberListing,status:state.hidden.includes('annotation')?'hidden':'published',cover:'/preview-assets/annotation-thumb.png',url:'/p/tennis-annotation/',source:'hosted',date:'2026-11-02',version:1},
 {id:'red-video',type:'video',title:'007-3 · 红场片段',summary:'原片 00:29–00:41，保留片段内声音。',listing:'unlisted',status:state.hidden.includes('red-video')?'hidden':'published',cover:'/preview-assets/red-poster.jpg',url:'/media/red-video/',media:'/preview-assets/007-3.mp4',mime:'video/mp4',duration:12,bytes:10890962,source:'hosted',date:'2026-11-02',version:1},
 {id:'blue-video',type:'video',title:'022-1 · 蓝场与邻场',summary:'原片 01:42–01:54，用于对照远端和邻场声源。',listing:'unlisted',status:state.hidden.includes('blue-video')?'hidden':'published',cover:'/preview-assets/blue-poster.jpg',url:'/media/blue-video/',media:externalOrigin+'/media/022-1.mp4',mime:'video/mp4',duration:12,source:'external',externalMode:state.external,externalPage:externalOrigin+'/watch/022-1/',date:'2026-11-02',version:1},
 {id:'hit-audio',type:'audio',title:'007-3 · 声音试听',summary:'从同一 12 秒预览片段解码的 WAV，供声音节点试听。',listing:'unlisted',status:state.hidden.includes('hit-audio')?'hidden':'published',cover:'/assets/audio-tennis.svg',url:'/media/hit-audio/',media:'/preview-assets/007-3-audio.wav',mime:'audio/wav',duration:12.005,bytes:2117710,source:'hosted',date:'2026-11-02',version:1}
 ]}
export function members(state,externalOrigin){const map=new Map(records(state,externalOrigin).map(r=>[r.id,r]));return state.view==='empty'?[]:state.order.filter(id=>!state.removed.includes(id)).map(id=>map.get(id)).filter(Boolean)}
export function visibleProfileAlbums(state){return state.profilePublic&&state.listing==='profile'&&state.status==='published'}
export const accessible=r=>r.status==='published';
export function validateCover({width,height,bytes,mime}){if(!['image/jpeg','image/png','image/webp'].includes(mime))return '请提供 JPG、PNG 或 WebP 封面。';if(bytes>5*1024**2)return '封面建议不超过 5 MiB。';if(width<800||height<450)return '封面至少 800×450，推荐 1600×900。';return Math.abs(width/height-16/9)>.02?'可以使用；先制作16:9裁剪副本，保留原图。':'尺寸与格式符合要求。'}
