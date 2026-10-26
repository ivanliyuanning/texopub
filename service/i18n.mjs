import shared from '../templates/community/locales/en.json';
const messages={...shared,
 '连接 TexoPub':'Connect TexoPub',
 '允许 ':'Allow ',
 ' 使用你的 TexoPub 空间？':' to access your TexoPub space?',
 '当前空间：':'Current space: ',
 '读取你的作品、素材和存储使用量':'Read your works, materials and storage usage',
 '按你的要求发布、更新及归档自己的网页和素材':'Publish, update and archive your webpages and materials as requested',
 '公开发布的网页及其依赖文件可被任何人访问；独立素材默认私有。':'Published webpages and their dependencies can be accessed by anyone. Independent files are private by default.',
 '不会获得手机号、邮箱、账号设置或其他空间的权限。连接最长有效 180 天，可随时在设置中撤销。':'No access to your phone number, email, account settings or other spaces. The connection lasts up to 180 days and can be revoked in settings.',
 '允许连接':'Allow connection','取消':'Cancel','已连接的插件':'Connected plugins',
 '撤销连接会立即停止该连接的访问，已发布作品保留。':'Revoking a connection immediately stops its access. Published works remain available.',
 '撤销连接':'Revoke connection','还没有连接插件。':'No connected plugins yet.','返回设置':'Back to settings'
};
const pattern=new RegExp(Object.keys(messages).sort((a,b)=>b.length-a.length).map(s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'g');
export function requestLanguage(request){
 const query=new URL(request.url).searchParams.get('lang');
 const saved=(request.headers.get('Cookie')||'').match(/(?:^|;\s*)texopub_lang=(en|zh)(?:;|$)/)?.[1];
 if(['en','zh'].includes(query))return query;
 return saved||((request.headers.get('Accept-Language')||'zh').split(',')[0].trim().toLowerCase().startsWith('zh')?'zh':'en');
}
// Only translate known static template chunks. Interpolated user names remain original.
export function ui(request){const en=requestLanguage(request)==='en';const translate=s=>en?String(s).replace(pattern,m=>messages[m]):s;
 return (parts,...values)=>typeof parts==='string'?translate(parts):parts.map((part,n)=>translate(part)+(n<values.length?values[n]:'')).join('');
}
