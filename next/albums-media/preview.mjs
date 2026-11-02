import {STORAGE_KEY,initialState,readState,writeState,applyOperation,validateCover,members,records,visibleProfileAlbums} from './model.mjs';
import {escape as e} from '/shared/identity.mjs';
let state=readState();const frame=document.querySelector('#preview-frame');
const names={unlisted:'不展示',profile:'仅个人主页',public:'公开展示'};
function result(text,error=false){const el=document.querySelector('#operation-result');el.textContent=text;el.dataset.error=String(error)}
function run(operation,revision=state.revision){const r=applyOperation(readState(),operation,revision);if(!r.ok){result(r.error,true);return r;}state=writeState(r.state);result(state.lastOperation);sync();return r}
function sync(){for(const key of ['listing','actor','cover','view','status'])document.getElementById(key).value=state[key];document.querySelector('#profile').value=String(state.profilePublic);document.querySelector('#secondary').value=String(state.secondary);document.querySelector('#member-listing').value=state.memberListing; document.querySelector('#state-summary').textContent=`revision ${state.revision} · 专辑${names[state.listing]} · 标注网页${names[state.memberListing]} · 主页${state.profilePublic?'开启':'关闭'} · ${visibleProfileAlbums(state)?'主页显示专辑':'主页不显示专辑'} · ${members(state,'').filter(r=>r.status==='published').length} 份可用网页。移出或删除专辑不删除网页及其依赖资源。`;
 document.querySelector('#share-preview').innerHTML=`<img src="${state.cover==='photo'?'/preview-assets/red-poster.jpg':'/assets/album-tennis.svg'}" alt="分享预览封面"><div><small>texopub.com</small><strong>挥动网球测试</strong><p>球的位置，击球的声音。</p></div>`;
 document.querySelector('#operation-history').innerHTML=state.history.map(h=>`<li>r${h.revision} ${e(h.message)}</li>`).join('')}
for(const key of ['listing','actor','cover','view','status'])document.getElementById(key).addEventListener('change',ev=>run([key,ev.target.value]));
document.querySelector('#secondary').addEventListener('change',ev=>run(['secondary',ev.target.value==='true']));
document.querySelector('#profile').addEventListener('change',ev=>run(['profile',ev.target.value==='true']));document.querySelector('#member-listing').addEventListener('change',ev=>run(['member-listing',ev.target.value]));
document.querySelector('#page').addEventListener('change',ev=>{frame.src=ev.target.value;document.querySelector('#route-label').textContent=ev.target.selectedOptions[0].textContent});
frame.addEventListener('load',()=>{try{const p=frame.contentWindow.location.pathname+frame.contentWindow.location.search;const option=[...document.querySelector('#page').options].find(x=>x.value===p);if(option)document.querySelector('#page').value=p;document.querySelector('#route-label').textContent=frame.contentDocument.title;}catch{}});
document.querySelectorAll('[data-width]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-width]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));const w=b.dataset.width;frame.style.width=w==='auto'?'100%':w+'px';document.querySelector('.preview-canvas').classList.toggle('narrow',w!=='auto');document.querySelector('#width-label').textContent=w==='auto'?'桌面自适应':w+'px 浏览器宽度'}));
const operations={reverse:['reverse'],duplicate:['add','annotation'],'remove-web':['remove','annotation'],'restore-web':['add','annotation'],'hide-member':['hide','annotation'],'restore-member':['restore','annotation']};
document.querySelectorAll('[data-op]').forEach(b=>b.addEventListener('click',()=>{if(b.dataset.op==='stale')run(['listing','profile'],state.revision-1);else run(operations[b.dataset.op])}));

const specs={normal:{width:1600,height:900,bytes:1048576,mime:'image/jpeg'},minimum:{width:800,height:450,bytes:307200,mime:'image/webp'},portrait:{width:1200,height:1600,bytes:2097152,mime:'image/png'},small:{width:600,height:300,bytes:102400,mime:'image/jpeg'},large:{width:1600,height:900,bytes:6291456,mime:'image/png'},wrong:{width:1600,height:900,bytes:1024,mime:'image/svg+xml'}};
function coverCheck(){document.querySelector('#cover-validation').textContent=validateCover(specs[document.querySelector('#cover-spec').value])}document.querySelector('#cover-spec').addEventListener('change',coverCheck);
document.querySelector('#reset').addEventListener('click',()=>{state=writeState(structuredClone(initialState));document.querySelector('#page').value='/albums/huidong-tennis-test/';frame.src='/albums/huidong-tennis-test/';sync();result('已恢复约定：专辑和成员不展示，未改变线上数据。')});
window.addEventListener('storage',ev=>{if(ev.key===STORAGE_KEY){state=readState();sync()}});

sync();coverCheck();

fetch('/resource-manifest.json').then(r=>r.json()).then(m=>{document.querySelector('#dependency-summary').innerHTML=`<dt>原内嵌HTML</dt><dd>${(m.source_html_bytes/1024**2).toFixed(1)} MiB</dd><dt>资源地址替换后</dt><dd>${(m.html_bytes/1024).toFixed(1)} KiB</dd><dt>网页依赖</dt><dd>${m.webpage_image_count} 张图片 · ${m.webpage_video_count} 段视频</dd><dt>独立资源总量</dt><dd>${(m.webpage_dependency_bytes/1024**2).toFixed(1)} MiB（未压缩）</dd><dt>原字节校验</dt><dd>${m.media_bytes_unchanged?'全部一致':'需核查'}</dd>`}).catch(()=>{document.querySelector('#dependency-summary').textContent='读取资源清单失败，请刷新重试。'});
