const frame=document.querySelector('#preview-frame'),stage=document.querySelector('#stage');
const params=new URLSearchParams(location.search);
let variant=['a','b','profile'].includes(params.get('view'))?params.get('view'):'a';
let size=['desktop','390','320'].includes(params.get('size'))?params.get('size'):'desktop';
const files={a:'gallery.html',b:'field.html',profile:'creator.html'};
function render(){
 const next=new URL(files[variant],location.href).href;if(frame.src!==next)frame.src=next;
 frame.title=variant==='a'?'A 共创画廊首页':variant==='b'?'B 共创现场首页':'个人主页与 AI 伙伴示意';
 document.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.variant===variant)));
 document.querySelectorAll('[data-size]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.size===size)));
 stage.className='stage'+(size==='desktop'?'':' mobile')+(size==='320'?' mobile-320':'');
 document.querySelector('#standalone').href=files[variant];
 const url=new URL(location.href);url.searchParams.set('view',variant);if(size!=='desktop')url.searchParams.set('size',size);else url.searchParams.delete('size');history.replaceState(null,'',url);
}
document.querySelectorAll('[data-variant]').forEach(b=>b.addEventListener('click',()=>{variant=b.dataset.variant;frame.src=files[variant];render()}));
document.querySelectorAll('[data-size]').forEach(b=>b.addEventListener('click',()=>{size=b.dataset.size;render()}));
render();
frame.addEventListener('load',()=>{try{const filename=frame.contentWindow.location.pathname.split('/').pop();const current=Object.entries(files).find(([,file])=>file===filename)?.[0];if(current&&current!==variant){variant=current;document.querySelectorAll('[data-variant]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.variant===variant)));document.querySelector('#standalone').href=files[variant];frame.title=variant==='profile'?'个人主页与 AI 伙伴示意':variant==='a'?'A 共创画廊首页':'B 共创现场首页';const url=new URL(location.href);url.searchParams.set('view',variant);history.replaceState(null,'',url)}}catch{}});
