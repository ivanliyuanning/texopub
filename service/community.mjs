import lexicon from './identity-lexicon.json' with {type:'json'};

export class CommunityError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const fail = (status, message) => { throw new CommunityError(status, message); };
const query = (env, sql, ...args) => env.DB.prepare(sql).bind(...args);
const one = (env, sql, ...args) => query(env, sql, ...args).first();
const many = async (env, sql, ...args) => (await query(env, sql, ...args).all()).results;
const now = () => Math.floor(Date.now() / 1000);
export function identitySeed(value) {
  let h = 2166136261;
  for (const c of String(value)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export function defaultCreatorName(id) {
  const h = identitySeed(id);
  return lexicon.prefixes[h % lexicon.prefixes.length] + lexicon.roles[Math.floor(h / lexicon.prefixes.length) % lexicon.roles.length];
}
function string(value, label, max, empty = true) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim())) fail(400, label + '格式不正确');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) fail(400, label + '含有无效字符');
  return value.trim();
}
function fields(body, allowed) {
  if (!body || Array.isArray(body) || typeof body !== 'object') fail(400, '需要资料对象');
  if (Object.keys(body).some(key => !allowed.includes(key))) fail(400, '包含不支持的资料字段；主页开关只能由本人在网页授权');
}
function revision(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail(400, '请先读取当前资料版本');
  return value;
}
function avatarUrl(value) {
  const raw = string(value, '头像网址', 2048);
  if (!raw) return '';
  let u;
  try { u = new URL(raw); } catch { fail(400, '头像需要公开的 HTTPS 图片网址'); }
  if (u.protocol !== 'https:' || u.username || u.password || u.port || !u.hostname.includes('.') || /(?:^|\.)(localhost|local|internal|test|invalid)$/.test(u.hostname) || /^[\d.]+$/.test(u.hostname) || (/\/(?:api\/)?v1\/me\//.test(u.pathname)&&!/^\/(?:api\/)?v1\/me\/(?:files\/[a-f0-9]{32}\/.+|assets\/[a-f0-9]{32})$/.test(u.pathname))) fail(400, '头像需要可匿名访问的 HTTPS 图片网址');
  return u.href;
}
const avatar = (env, id, kind) => (env.APP_ORIGIN || 'https://texopub.com') + '/api/v1/avatars/' + kind + '/' + id + '.svg';
export function creatorIdentity(env, p) {
  return {
    id: p.id, name: !p.name || p.name === '新创作者' ? defaultCreatorName(p.id) : p.name,
    bio: p.bio || '', avatar_url: p.avatar_url || '', avatar: p.avatar_url || avatar(env, p.id, 'human'),
    revision: p.profile_revision || 0, name_source: p.name_source || 'custom', lexicon_version: p.lexicon_version || 1
  };
}
function partnerIdentity(env, p) {
  return {id: p.id, key: p.partner_key, application: p.application, name: p.name || p.application,
    bio: p.bio || '', avatar_url: p.avatar_url || '', avatar: p.avatar_url || avatar(env, p.id, 'ai'),
    revision: p.revision, source: 'self_reported', show_on_profile: !!p.show_on_profile};
}
async function partnerId(publisherId, key) {
  const data = new TextEncoder().encode(publisherId + ':ai:' + key);
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', data))].map(x => x.toString(16).padStart(2, '0')).join('').slice(0, 32);
}
function partnerKey(value) {
  if (typeof value !== 'string' || value.length > 64 || !/^[a-z0-9]+(?:[-_][a-z0-9]+)*$/.test(value)) fail(400, '伙伴 key 使用小写英文、数字、连字符或下划线');
  return value;
}
export async function getProfile(env, p) {
  const publisher = await one(env, 'SELECT * FROM publishers WHERE id=? AND revoked=0', p.id);
  if (!publisher) fail(404, '创作者不存在');
  return {...creatorIdentity(env, publisher), publisher_id: p.id,
    ai_partners: (await many(env, 'SELECT * FROM ai_partners WHERE publisher_id=? ORDER BY created,id', p.id)).map(x => partnerIdentity(env, x))};
}
export async function updateProfile(env, p, body) {
  fields(body, ['name', 'bio', 'avatar_url', 'expected_revision']);
  const expected = revision(body.expected_revision), changes = [], values = [];
  if (Object.hasOwn(body, 'name')) {
    const reset = body.name === null;
    changes.push('name=?', 'name_source=?', 'lexicon_version=?');
    values.push(reset ? defaultCreatorName(p.id) : string(body.name, '名字', 80, false), reset ? 'generated' : 'custom', lexicon.version);
  }
  if (Object.hasOwn(body, 'bio')) { changes.push('bio=?'); values.push(string(body.bio, '简介', 400)); }
  if (Object.hasOwn(body, 'avatar_url')) { changes.push('avatar_url=?'); values.push(avatarUrl(body.avatar_url)); }
  if (!changes.length) fail(400, '没有需要更新的资料');
  const changed = await query(env, 'UPDATE publishers SET ' + changes.join(',') + ',profile_revision=profile_revision+1 WHERE id=? AND revoked=0 AND profile_revision=?', ...values, p.id, expected).run();
  if (!changed.meta.changes) fail(409, '资料已变化，请重新读取后再更新');
  return getProfile(env, p);
}
export async function upsertPartner(env, p, body) {
  fields(body, ['key', 'application', 'name', 'bio', 'avatar_url', 'show_on_profile', 'expected_revision']);
  const key = partnerKey(body.key), expected = revision(body.expected_revision);
  const old = await one(env, 'SELECT * FROM ai_partners WHERE publisher_id=? AND partner_key=?', p.id, key);
  if ((old?.revision || 0) !== expected) fail(409, '伙伴资料已变化，请重新读取');
  const application = body.application === undefined ? old?.application : string(body.application, 'AI 应用名', 80, false);
  if (!application) fail(400, '需要可确认的 AI 应用名');
  const name = body.name === undefined ? old?.name || application : string(body.name, '伙伴名称', 80, false);
  const bio = body.bio === undefined ? old?.bio || '' : string(body.bio, '伙伴简介', 400);
  const image = body.avatar_url === undefined ? old?.avatar_url || '' : avatarUrl(body.avatar_url);
  if (body.show_on_profile !== undefined && typeof body.show_on_profile !== 'boolean') fail(400, '请选择是否在主页展示伙伴');
  const visible = body.show_on_profile === undefined ? old?.show_on_profile || 0 : Number(body.show_on_profile);
  const id = old?.id || await partnerId(p.id, key), at = now();
  try {
    const changed = await query(env, `INSERT INTO ai_partners(id,publisher_id,partner_key,application,name,bio,avatar_url,show_on_profile,revision,created,updated)
      VALUES(?,?,?,?,?,?,?,?,1,?,?) ON CONFLICT(publisher_id,partner_key) DO UPDATE SET application=excluded.application,name=excluded.name,bio=excluded.bio,avatar_url=excluded.avatar_url,show_on_profile=excluded.show_on_profile,revision=ai_partners.revision+1,updated=excluded.updated WHERE ai_partners.revision=?`,
      id, p.id, key, application, name, bio, image, visible, at, at, expected).run();
    if (!changed.meta.changes) fail(409, '伙伴资料已变化，请重新读取');
  } catch (e) { if (e instanceof CommunityError) throw e; if (/UNIQUE/.test(e.message)) fail(409, '伙伴资料并发创建，请重新读取'); throw e; }
  return partnerIdentity(env, await one(env, 'SELECT * FROM ai_partners WHERE id=? AND publisher_id=?', id, p.id));
}
// Contributions belong to a version; registering a partner never invents old work credits.
export async function prepareContributors(env, p, declarations, previous) {
  if (declarations === undefined) return {items: previous?.ai_partners || [], statements: []};
  if (!Array.isArray(declarations) || declarations.length > 8) fail(400, '每份作品最多记录8个 AI 伙伴');
  const existing = declarations.length ? await many(env, 'SELECT * FROM ai_partners WHERE publisher_id=?', p.id) : [];
  const items = [], statements = [], seen = new Set(), at = now();
  for (const input of declarations) {
    fields(input, ['key', 'application', 'name', 'avatar_url', 'model', 'contribution']);
    const key = partnerKey(input.key);
    if (seen.has(key)) fail(400, 'AI 伙伴不能重复'); seen.add(key);
    const old = existing.find(x => x.partner_key === key);
    const application = string(input.application, 'AI 应用名', 80, false);
    if (old && old.application !== application) fail(409, '同一伙伴 key 的应用名不同，请先读取并更新伙伴资料');
    const id = old?.id || await partnerId(p.id, key);
    const name = input.name === undefined ? application : string(input.name, '伙伴名称', 80, false);
    const image = input.avatar_url === undefined ? '' : avatarUrl(input.avatar_url);
    if (!old) statements.push(query(env, 'INSERT INTO ai_partners(id,publisher_id,partner_key,application,name,avatar_url,created,updated) VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(publisher_id,partner_key) DO NOTHING', id, p.id, key, application, name, image, at, at));
    const item = {id, key, application};
    for (const field of ['model', 'contribution']) if (input[field] !== undefined) {
      const value = string(input[field], field === 'model' ? '模型' : '参与内容', field === 'model' ? 120 : 240);
      if (value) item[field] = value;
    }
    items.push(item);
  }
  return {items, statements};
}
export async function enrichWorks(env, works) {
  if (!works.length) return works;
  const ids = [...new Set(works.map(w => w.publisher_id).filter(Boolean))];
  const publishers = ids.length ? await many(env, 'SELECT * FROM publishers WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(ids)) : [];
  const partnerIds = [...new Set(works.flatMap(w => (w.ai_partners || []).map(x => x.id)))];
  const partners = partnerIds.length ? await many(env, 'SELECT * FROM ai_partners WHERE id IN (SELECT value FROM json_each(?))', JSON.stringify(partnerIds)) : [];
  return works.map(w => {
    const p = publishers.find(p => p.id === w.publisher_id);
    const creator = p ? creatorIdentity(env, p) : null;
    return {...w, ...(creator ? {author: creator.name, creator: {id: creator.id, name: creator.name, avatar: creator.avatar, avatar_url: creator.avatar_url}} : {}),
      ai_partners: (w.ai_partners || []).flatMap(c => {
        const partner = partners.find(p => p.id === c.id && p.publisher_id === w.publisher_id);
        if (!partner) return [];
        const identity = partnerIdentity(env, partner);
        return [{id: identity.id, key: identity.key, name: identity.name, application: identity.application, avatar: identity.avatar, avatar_url: identity.avatar_url,
          ...(c.model ? {model: c.model} : {}), ...(c.contribution ? {contribution: c.contribution} : {})}];
      })};
  });
}
export async function publicProfile(env, pid, works) {
  const p = await one(env, 'SELECT p.* FROM publishers p JOIN accounts a ON a.publisher_id=p.id WHERE p.id=? AND p.revoked=0 AND a.profile_public=1', pid);
  if (!p) fail(404, '主页未公开或不存在');
  const enriched = await enrichWorks(env, works);
  const ids = new Set(enriched.flatMap(w => (w.ai_partners || []).map(x => x.id)));
  const partners = await many(env, 'SELECT * FROM ai_partners WHERE publisher_id=?', pid);
  return {publisher_id: pid, ...creatorIdentity(env, p),
    ai_partners: partners.filter(x => x.show_on_profile || ids.has(x.id)).map(x => partnerIdentity(env, x)), items: enriched};
}
export function avatarSvg(id, kind) {
  const h = identitySeed(id), dark = kind === 'ai', cells = [];
  for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) if ((identitySeed(id + ':' + x + ':' + y) & 1)) {
    for (const col of x === 2 ? [x] : [x, 4 - x]) cells.push(`<rect x="${8 + col * 10}" y="${8 + y * 10}" width="8" height="8" rx="${dark ? 1 : 4}"/>`);
  }
  if(!cells.length)cells.push('<rect x="28" y="28" width="8" height="8" rx="2"/>');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="${dark ? '#1e382b' : ['#e1eca1','#e9d5bb','#d5e5dd','#efd8cd'][h % 4]}"/><g fill="${dark ? '#dceaa0' : '#1e382b'}">${cells.join('')}</g></svg>`;
}
