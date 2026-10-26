// A validated, non-sensitive preference shared with server-rendered consent pages.
export function preferredLanguage() {
  const query = new URLSearchParams(location.search).get('lang');
  const saved = document.cookie.match(/(?:^|; )texopub_lang=(en|zh)(?:;|$)/)?.[1];
  return ['en','zh'].includes(query) ? query : saved || (navigator.language?.toLowerCase().startsWith('zh') ? 'zh' : 'en');
}
export const language = preferredLanguage();
export function saveLanguage(value) {
  if (!['en','zh'].includes(value)) return;
  document.cookie = `texopub_lang=${value}; Path=/; Max-Age=31536000; SameSite=Lax${location.protocol==='https:'?'; Secure':''}`;
}
export function switchLanguage() {
  saveLanguage(language==='en'?'zh':'en');
  const url=new URL(location.href);url.searchParams.set('lang',language==='en'?'zh':'en');location.assign(url.href);
}
