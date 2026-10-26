export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function api(path, body) {
  const response = await fetch('/api/v1/' + path, {
    method: body === undefined ? 'GET' : 'POST', credentials: 'same-origin', cache: 'no-store',
    headers: body === undefined ? {} : {'Content-Type': 'application/json', 'X-TexoPub-Request': 'space'},
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  let data;
  try { data = await response.json(); } catch { throw new ApiError(response.status || 503, '服务暂时不可用，请稍后重试'); }
  if (!response.ok) throw new ApiError(response.status, data.error || '请求未完成');
  return data;
}
export function destination(value) {
  const allowed = ['/space/', '/space/works/', '/space/materials/', '/space/settings/', '/space/settings/keys/', '/space/account/', '/publish/', '/api/oauth/authorize', '/api/oauth/connections'];
  try {
    const url = new URL(value || '/space/', location.origin);
    return url.origin === location.origin && allowed.includes(url.pathname) ? url.pathname + url.search : '/space/';
  } catch { return '/space/'; }
}
export function safeLink(value) {
  if(typeof value!=='string'||!value.trim())return '';
  try {
    const url = new URL(value, location.origin);
    return !url.username && !url.password && (url.protocol === 'https:' || url.origin === location.origin) ? url.href : '';
  } catch { return ''; }
}
