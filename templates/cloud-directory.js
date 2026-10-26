// Add cloud-published works using text nodes; contributor metadata is never HTML.
async function refreshCloudDirectory() {
  const api=document.querySelector('meta[name="commonplace-api"]')?.content;
  if(!api)return;
  try {
    const r=await fetch(api+'/v1/catalog',{signal:AbortSignal.timeout(8000),cache:'no-store'});
    if(!r.ok)throw new Error('catalog unavailable');
    const data=await r.json(),container=document.querySelector('#work-results');
    const el=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text!==undefined)n.textContent=text;return n;};
    const safeUrl=value=>{try{const u=new URL(value);return u.protocol==='https:'?u.href:'';}catch{return '';}};
    const refreshed=[];
    for(const w of data.items){
      const url=safeUrl(w.url),icon=safeUrl(w.icon);if(!url||!icon)continue;
      const entry=el('article','directory-entry');entry.dataset.workId=w.id;entry.dataset.updated=w.updated||'';entry.dataset.categoryId=w.category_id;entry.dataset.format=w.format;
      entry.dataset.source=w.source||'hosted';entry.dataset.search=[w.title,w.summary,w.category,w.external_domain||'',...(w.tags||[])].join(' ').toLocaleLowerCase();
      const body=el('div');body.append(el('div','work-label',w.category));
      const heading=el('div','entry-heading'),im=el('img','entry-icon');im.src=icon;im.alt='';im.width=28;im.height=28;
      const h=el('h3'),a=el('a','',w.title+' ↗');a.href=url;if(w.source==='external'){a.target='_blank';a.rel='noopener noreferrer';a.setAttribute('aria-label',w.title+'（外部网站，新标签页打开）');}h.append(a);heading.append(im,h);body.append(heading,el('p','description',w.summary));
      const meta=el('div','entry-meta');if(w.source==='external'){meta.append(el('span','','外部网站 · '+new URL(url).hostname));if(w.link_status==='unavailable')meta.append(el('span','','链接可能失效'));}meta.append(el('span','',(w.source==='external'?'收录者：':'')+(w.author||'共创作品')),el('span','','更新于 '+w.updated));body.append(meta);
      const tags=el('div','tags');for(const tag of (w.tags||[]).slice(0,5))tags.append(el('span','','#'+tag));body.append(tags);entry.append(body);
      if(safeUrl(w.cover)){const link=el('a','entry-thumb');link.href=url;link.tabIndex=-1;link.setAttribute('aria-hidden','true');const image=el('img');image.src=safeUrl(w.cover);image.alt='';image.loading='lazy';link.append(image);entry.append(link);}
      refreshed.push(entry);
    }
    refreshed.sort((a,b)=>b.dataset.updated.localeCompare(a.dataset.updated));container.replaceChildren(...refreshed);
    entries=[...document.querySelectorAll('.directory-entry')];
    for(const button of buttons){const cid=button.dataset.category;const n=entries.filter(e=>!cid||e.dataset.categoryId===cid||e.dataset.categoryId.startsWith(cid+'/')).length;button.querySelector('.count').textContent=String(n);button.classList.toggle('unfilled',n===0);}
    document.querySelector('.directory-caption').textContent='已收录 '+entries.length+' 份作品，按主题持续整理。';render(false);
  }catch{document.querySelector('.directory-caption').textContent='暂时无法加载作品目录，请刷新重试。';}
}
refreshCloudDirectory();
