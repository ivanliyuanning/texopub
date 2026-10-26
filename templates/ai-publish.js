(() => {
 const prompts=JSON.parse(document.querySelector('#publish-prompts').textContent);
 const field=document.querySelector('#ai-publish-prompt'),button=document.querySelector('#copy-ai-prompt'),status=document.querySelector('#prompt-feedback');
 const kind=new URLSearchParams(location.search).get('kind');if(kind==='asset'||kind==='external')field.value=prompts[kind];
 for(const link of document.querySelectorAll('.publish-modes [data-kind]'))if(link.dataset.kind===(kind==='asset'||kind==='external'?kind:'work'))link.setAttribute('aria-current','page');
 if(kind==='external'){
  document.title='收录已有网站｜TexoPub.ai';document.querySelector('#publish-title').textContent='已有网站，也能被发现。';
  document.querySelector('.publish-intro p').textContent='网站继续由你托管。把公开网址交给 AI，提交简介、分类和图标，让更多人在这里找到它。';
  document.querySelector('.agent-demo').setAttribute('aria-label','示意：向AI提供已有网站的网址，由AI选择分类、准备图标并加入目录');
  document.querySelector('.demo-bubble').textContent='请使用 TexoPub.ai Skill，把我的网站收录到主题目录。';
  const tasks=document.querySelectorAll('.demo-tasks li');['了解原站，选择主题分类','准备简介和专属图标','收录网址，直接访问原站'].forEach((text,i)=>tasks[i].textContent=text);
 }
 button.addEventListener('click',async()=>{
  try{
   if(!navigator.clipboard?.writeText)throw new Error('clipboard unavailable');
   await navigator.clipboard.writeText(field.value);
   button.textContent='已复制，去交给你的 AI ↗';status.textContent=kind==='external'?'提示词已复制。粘贴后，提供你想收录的网站网址。':'提示词已复制。粘贴后，指定你想公开的作品或素材。';
  }catch{
   field.focus();field.select();field.setSelectionRange(0,field.value.length);
   status.textContent='已选中提示词，请按 ⌘C 或 Ctrl+C 复制，再粘贴给你的 AI。';
  }
 });
})();
