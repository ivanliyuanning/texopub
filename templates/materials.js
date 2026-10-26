const q=document.querySelector('#asset-search'),status=document.querySelector('#asset-status');
function filterMaterials(){let n=0;for(const a of document.querySelectorAll('.asset')){a.hidden=!a.dataset.search.includes(q.value.trim().toLocaleLowerCase());if(!a.hidden)n++;}status.textContent='显示 '+n+' 个素材';}
q.addEventListener('input',filterMaterials);
document.addEventListener('click',async event=>{const b=event.target.closest('.copy-link');if(!b)return;try{await navigator.clipboard.writeText(b.dataset.url);b.textContent='已复制';}catch{window.prompt('复制素材链接',b.dataset.url);}});
(async()=>{
 const api=document.querySelector('meta[name="commonplace-api"]')?.content;if(!api)return;
 try{
  const r=await fetch(api+'/v1/materials',{cache:'no-store',signal:AbortSignal.timeout(8000)});if(!r.ok)throw new Error();const data=await r.json();
  const grid=document.querySelector('.asset-grid'),existing=new Set();grid.replaceChildren();
  const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
  for(const asset of data.items){if(existing.has(asset.url))continue;const url=new URL(asset.url);if(url.protocol!=='https:')continue;
   const item=el('article','asset');item.dataset.search=[asset.title||asset.name,asset.collection].join(' ').toLocaleLowerCase();
   const a=el('a','asset-preview');a.href=url.href;a.target='_blank';a.rel='noopener';
   if(asset.mime.startsWith('image/')){const img=el('img');img.src=url.href;img.alt=asset.title||asset.name;img.loading='lazy';a.append(img);}else a.append(el('span','file-type',asset.mime));
   const copy=el('button','copy-link','复制链接');copy.dataset.url=url.href;
   item.append(a,el('p','asset-name',asset.title||asset.name),el('p','meta',asset.collection+' · '+Math.round(asset.bytes/1024*10)/10+' KB'),copy);grid.append(item);
  }
  filterMaterials();
 }catch{status.textContent='暂时无法加载素材目录，请刷新重试。';}
})();
