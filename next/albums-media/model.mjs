/** Local, explicit fixtures for the interaction preview. No production API. */
export const STORAGE_KEY='texopub-albums-preview-20261102-v1';
export const albumId='huidong-tennis-test';
export const initialState={revision:0,secondary:false,listing:'unlisted',profilePublic:true,memberListing:'unlisted',status:'published',view:'ready',cover:'generated',order:['annotation'],removed:[],hidden:[],actor:'owner',lastOperation:'初始预览：专辑和成员均不展示',history:[]};
export function readState(storage=localStorage){try{const x=JSON.parse(storage.getItem(STORAGE_KEY));return x?.schema===1?{...structuredClone(initialState),...x.state,order:['annotation'],removed:(x.state.removed||[]).filter(id=>id==='annotation'),hidden:(x.state.hidden||[]).filter(id=>id==='annotation')}:structuredClone(initialState)}catch{return structuredClone(initialState)}}
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
  case 'add':if(!s.order.includes(value))throw Error('未知内容');s.removed=s.removed.filter(x=>x!==value);message='加入内容（去重）：'+value;break;
  case 'remove':if(!s.order.includes(value))throw Error('未知内容');if(!s.removed.includes(value))s.removed.push(value);message='仅移出专辑：'+value;break;
  case 'hide':if(!s.hidden.includes(value))s.hidden.push(value);message='归档成员：'+value;break;
  case 'restore':s.hidden=s.hidden.filter(x=>x!==value);message='恢复成员：'+value;break;
  case 'reverse':s.order.reverse();message='调整内容顺序';break;
  case 'actor':s.actor=value==='guest'?'guest':'owner';message='切换预览身份：'+s.actor;break;
  default:throw Error('未知预览操作');
 }
 s.revision++;s.lastOperation=message;s.history=[{revision:s.revision,message},...s.history].slice(0,12);
 return {ok:true,state:s};
}
export function records(state){return [
 {id:'annotation',type:'web',title:'网球位置与击球声 · 试标结果',summary:'13 张球位置试标、48 条声音候选。放大原帧，对照球框，循环试听击球节点。',listing:state.memberListing,status:state.hidden.includes('annotation')?'hidden':'published',cover:'/preview-assets/annotation-thumb.png',url:'/p/tennis-annotation/',source:'hosted',date:'2026-11-02',version:1}
 ]}

export function members(state){const map=new Map(records(state).map(r=>[r.id,r]));return state.view==='empty'?[]:state.order.filter(id=>!state.removed.includes(id)).map(id=>map.get(id)).filter(Boolean)}
export function visibleProfileAlbums(state){return state.profilePublic&&state.listing==='profile'&&state.status==='published'}
export const accessible=r=>r.status==='published';
export function validateCover({width,height,bytes,mime}){if(!['image/jpeg','image/png','image/webp'].includes(mime))return '请提供 JPG、PNG 或 WebP 封面。';if(bytes>5*1024**2)return '封面建议不超过 5 MiB。';if(width<800||height<450)return '封面至少 800×450，推荐 1600×900。';return Math.abs(width/height-16/9)>.02?'可以使用；先制作16:9裁剪副本，保留原图。':'尺寸与格式符合要求。'}
