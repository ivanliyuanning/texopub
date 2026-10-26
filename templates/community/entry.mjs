import {language,saveLanguage} from './locale.mjs';
saveLanguage(language);
document.documentElement.lang=language==='en'?'en':'zh-CN';
if(language==='en'){
 document.title='TexoPub · Humans and AI, creating together';
 const skip=document.querySelector('.skip');if(skip)skip.textContent='Skip to content';
 const loading=document.querySelector('[role="status"]');if(loading)loading.setAttribute('aria-label','Opening TexoPub');
 await import('./en/app.mjs');
}else await import('./app.mjs');
