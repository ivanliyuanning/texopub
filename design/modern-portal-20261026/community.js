const scope=document.querySelector('main');
const search=document.querySelector('#work-search');
const cards=[...document.querySelectorAll('[data-work]')];
const filters=[...document.querySelectorAll('[data-topic]')];
let selectedTopic='all';
const categoriesPanel=document.querySelector('#all-categories-panel');
const categoriesToggle=document.querySelector('#category-toggle');
const categoryOptions=[...document.querySelectorAll('[data-category-filter]')];
const categoryNames=new Map(categoryOptions.map(b=>[b.dataset.categoryFilter,b.dataset.categoryName]));
const responsiveCategories=window.matchMedia('(max-width:760px)');
function arrangeCategories(){document.querySelectorAll('.category-group').forEach(group=>{group.open=!responsiveCategories.matches})}
arrangeCategories();responsiveCategories.addEventListener('change',arrangeCategories);
function setCategoriesOpen(open){if(!categoriesPanel)return;categoriesPanel.hidden=!open;categoriesToggle.setAttribute('aria-expanded',String(open))}
categoriesToggle?.addEventListener('click',()=>setCategoriesOpen(categoriesPanel.hidden));
document.querySelector('#close-categories')?.addEventListener('click',()=>{setCategoriesOpen(false);categoriesToggle.focus()});
categoryOptions.forEach(b=>b.addEventListener('click',()=>{selectedTopic=b.dataset.categoryFilter;setCategoriesOpen(false);renderWorks();categoriesToggle.focus({preventScroll:true})}));
document.querySelector('#clear-category')?.addEventListener('click',()=>{selectedTopic='all';renderWorks()});
function renderWorks(){
 if(!search)return;
 const term=search.value.trim().toLocaleLowerCase();let count=0;
 for(const card of cards){const show=(selectedTopic==='all'||card.dataset.category===selectedTopic||card.dataset.category.startsWith(selectedTopic+'/'))&&(!term||card.dataset.search.includes(term));card.hidden=!show;count+=Number(show);}
 for(const b of filters)b.setAttribute('aria-pressed',String(b.dataset.topic===selectedTopic));
 for(const b of categoryOptions)b.setAttribute('aria-pressed',String(b.dataset.categoryFilter===selectedTopic));
 const categoryState=document.querySelector('#category-state');categoryState.hidden=selectedTopic==='all'||filters.some(b=>b.dataset.topic===selectedTopic);
 document.querySelector('#category-selection').textContent=categoryNames.get(selectedTopic)||'';
 document.querySelector('#result-status').textContent=count+' 份作品';
 document.querySelector('#empty-results').hidden=count!==0;
 const empty=document.querySelector('#empty-results');
 empty.querySelector('h2').textContent=!term&&selectedTopic!=='all'?'这个分类还没有公开作品':'还没有找到匹配的作品';
 empty.querySelector('p').textContent=!term&&selectedTopic!=='all'?'可以看看其他主题，或回到全部作品。':'换个关键词，或看看这里已有的作品。';
}
search?.addEventListener('input',renderWorks);
filters.forEach(b=>b.addEventListener('click',()=>{selectedTopic=b.dataset.topic;renderWorks()}));
document.querySelector('#reset-search')?.addEventListener('click',()=>{selectedTopic='all';search.value='';renderWorks();search.focus()});
document.addEventListener('keydown',e=>{if(e.key==='Escape'&&categoriesPanel&&!categoriesPanel.hidden&&!document.querySelector('dialog[open]')){setCategoriesOpen(false);categoriesToggle.focus()}if(e.key==='/'&&!/INPUT|TEXTAREA/.test(document.activeElement.tagName)&&!document.querySelector('dialog[open]')){e.preventDefault();search?.focus()}});
const dialog=document.querySelector('#ai-handoff'),prompt=document.querySelector('#ai-prompt'),feedback=document.querySelector('#copy-status');
let lastFocused=null;
document.querySelectorAll('[data-open-ai]').forEach(b=>b.addEventListener('click',()=>{lastFocused=b;feedback.textContent='这份指令只会复制，不会在预览中执行。';dialog.showModal()}));
document.querySelector('#close-handoff').addEventListener('click',()=>dialog.close());
dialog.addEventListener('close',()=>lastFocused?.focus());
dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close()}});
document.querySelector('#copy-prompt').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(prompt.value);feedback.textContent='提示词已复制。交给你的 AI 后继续。'}catch{prompt.focus();prompt.select();feedback.textContent='请复制已选中的提示词。'}});
