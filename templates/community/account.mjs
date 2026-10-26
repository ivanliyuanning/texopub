import {escape as e} from './identity.mjs';
import {icon as i} from './icons.mjs';
import {destination} from './api.mjs';
let credential = null;
export function clearCredential() { credential = null; }
const message = '<p id="account-message" class="account-message" role="status" aria-live="polite"></p>';
export function loginView(status) {
  return `<section class="login-layout"><div class="login-story"><span class="eyebrow">${i('human')}你的创作者身份</span><h1>回到你的<br>共创空间。</h1><p>登录后查看自己的作品与素材。</p><div class="login-duo"><span class="role-stamp">${i('human')}人类创作者</span><span aria-hidden="true">×</span><span class="role-stamp">${i('ai')}AI 伙伴</span></div></div><form class="login-form" id="login-form"><h2>登录 TexoPub</h2><p>首次手机号验证后创建空间。</p><fieldset class="auth-channels"><legend>登录方式</legend><label><input type="radio" name="channel" value="sms" ${status.sms ? 'checked' : ''} ${status.sms ? '' : 'disabled'}> 手机号</label><label><input type="radio" name="channel" value="email" ${!status.sms && status.email ? 'checked' : ''} ${status.email ? '' : 'disabled'}> 备用邮箱</label></fieldset><label class="field-label" for="login-subject" id="subject-label">${status.sms ? '中国大陆手机号' : '已绑定的备用邮箱'}</label><input class="input" id="login-subject" type="${status.sms ? 'tel' : 'email'}" inputmode="${status.sms ? 'tel' : 'email'}" autocomplete="${status.sms ? 'tel-national' : 'email'}" required><label class="field-label" for="login-code">验证码</label><div class="code-row"><input class="input" id="login-code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required><button class="secondary" type="button" id="send-login-code" ${status.sms || status.email ? '' : 'disabled'}>获取验证码</button></div><button class="primary" type="submit" ${status.sms || status.email ? '' : 'disabled'}>登录</button>${message}<p class="login-footnote">${status.sms || status.email ? '验证码仅在本站填写。' : '登录服务暂时不可用，请稍后重试。'}</p><a class="text-button" href="/account-privacy/">账号与隐私</a></form></section>`;
}
export function gateView() {
  const next = destination(location.pathname + location.search);
  return `<section class="error-panel"><h1>登录你的共创空间</h1><p>作品、素材与账号资料需要登录后查看。</p><a class="primary" href="/login/?next=${encodeURIComponent(next)}" data-route>前往登录</a></section>`;
}
export function homepageControls(account) {
  return `<p>${account.profile_public ? '主页已开启，仅展示你选定的公开内容。' : '主页尚未开启，公开作品仍可出现在发现页。'}</p><form id="homepage-form"><label class="auth-check"><input type="checkbox" name="public" ${account.profile_public ? 'checked' : ''}>公开个人主页</label><button class="secondary" type="submit">保存主页授权</button></form>`;
}
function bindingForm(channel, title, purpose) {
  const id = channel === 'email' ? 'bind-email-form' : 'bind-phone-form';
  return `<details class="security-detail"><summary>${title}</summary><form id="${id}" data-binding="${channel}" data-purpose="${purpose}"><label class="field-label">${channel === 'email' ? '备用邮箱' : '新手机号'}<input class="input" name="subject" type="${channel === 'email' ? 'email' : 'tel'}" autocomplete="off" required></label><label class="field-label">验证码<input class="input" name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required></label><div class="auth-actions"><button class="secondary" type="button" data-send-bind>获取验证码</button><button class="primary" type="submit">确认绑定</button></div></form></details>`;
}
export function accountView(account) {
  return `<div class="workspace-heading"><h2>账号与安全</h2></div><section class="settings-panel"><dl class="settings-values"><dt>手机号</dt><dd>${e(account.phone)}</dd><dt>备用邮箱</dt><dd>${e(account.email || '未绑定')}</dd></dl>${bindingForm('email','绑定或更换备用邮箱','email-bind')}${bindingForm('sms','更换手机号','phone-bind')}<details class="security-detail"><summary>登录设备</summary><div class="auth-actions"><button class="secondary" data-logout>退出当前登录</button><button class="secondary" data-logout-all>退出所有设备</button></div></details><details class="security-detail"><summary>迁入旧发布身份</summary><p>仅适用于你持有的旧邀请凭证。</p><form id="import-form"><label class="field-label">旧凭证<input class="input" name="token" type="password" autocomplete="off" required></label><button class="secondary" type="submit">验证并迁入</button></form></details></section>${message}`;
}
function keyCard(key) {
  const expired = key.expires * 1000 <= Date.now();
  const state = key.revoked ? '已撤销' : expired ? '已过期' : '有效至 ' + new Date(key.expires * 1000).toLocaleDateString('zh-CN');
  return `<article class="key-row"><div><h3>${e(key.name)}</h3><p>${e(key.prefix)} · ${key.scope === 'read' ? '只读' : '发布与读取'} · ${e(state)}</p></div>${key.revoked ? '' : `<div class="auth-actions"><button class="text-button" data-edit-key="${e(key.id)}">调整有效期</button><button class="text-button" data-revoke-key="${e(key.id)}">撤销</button></div>`}</article>`;
}
export function keySection(keys) {
  return `<details class="security-detail" id="key-management" ${credential ? 'open' : ''}><summary>管理本地 Agent 密钥</summary><p>本人创建与撤销，密钥仅在创建时返回。默认有效期为六个月。</p><form id="key-form"><label class="field-label">名称<input class="input" name="name" maxlength="80" required placeholder="例如：我的 Codex"></label><label class="field-label">权限<select class="input" name="scope"><option value="publish">发布与读取</option><option value="read">只读</option></select></label><label class="field-label">有效期<select class="input" name="duration"><option value="month">一个月</option><option value="six-months" selected>六个月</option><option value="year">一年</option><option value="custom">自定天数</option></select></label><label class="field-label" id="custom-days-label" hidden>天数<input class="input" name="days" type="number" min="1" max="3650"></label><div class="auth-actions"><button class="secondary" id="create-key" type="submit">创建密钥</button><button class="text-button" id="cancel-key-edit" type="button" hidden>取消调整</button></div></form><section id="key-reveal" ${credential ? '' : 'hidden'}><label class="field-label" for="new-key">新密钥</label><input class="input" id="new-key" type="password" readonly autocomplete="off"><div class="auth-actions"><button class="primary" id="download-key">下载凭证</button><button class="text-button" id="dismiss-key">收起</button></div><p>凭证只交给你授权的 Agent。</p></section><div id="my-keys">${keys.items.length ? keys.items.map(keyCard).join('') : '<p>暂无密钥。</p>'}</div>${keys.legacy_key_active ? '<details class="security-detail"><summary>旧邀请凭证</summary><button class="text-button" id="revoke-legacy">撤销旧凭证</button></details>' : ''}</details>${message}`;
}
export function bindAccount({api, account, keys, reload, navigate}) {
  const $ = selector => document.querySelector(selector);
  const say = (text, error = false) => { const node = $('#account-message'); if (node) { node.textContent = text; node.dataset.error = String(error); } };
  const loginUrl = () => '/login/?next=' + encodeURIComponent(destination(location.pathname + location.search));
  const action = handler => async event => {
    event.preventDefault(); const button = event.submitter || event.currentTarget;
    if (button.disabled) return; button.disabled = true;
    try { await handler(event); }
    catch (error) {
      if (error.status === 401) { clearCredential(); const input = $('#new-key'); if (input) input.value = ''; const reveal = $('#key-reveal'); if (reveal) reveal.hidden = true; await reload(); }
      say(error.message, true);
      if (error.status === 401) {
        const node = $('#account-message'); if (node) { const a = document.createElement('a'); a.href = loginUrl(); a.textContent = '重新验证'; a.dataset.route = ''; node.append(' ', a); }
      }
    } finally { if (button.isConnected) button.disabled = false; }
  };
  const cooldown = (button, seconds = 60) => {
    const until = Date.now() + Math.max(1, Math.min(300, seconds)) * 1000; const label = button.textContent;
    button.disabled = true;
    const timer = setInterval(() => {
      if (!button.isConnected) { clearInterval(timer); return; }
      const left = Math.ceil((until - Date.now()) / 1000);
      if (left <= 0) { clearInterval(timer); button.disabled = false; button.textContent = label; }
      else button.textContent = left + '秒后重发';
    }, 1000);
  };
  const login = $('#login-form');
  if (login) {
    let challenge = null;
    const reset = () => { challenge = null; $('#login-code').value = ''; };
    login.querySelectorAll('[name=channel]').forEach(input => input.addEventListener('change', () => {
      reset(); const email = login.elements.channel.value === 'email', subject = $('#login-subject');
      subject.value = ''; subject.type = email ? 'email' : 'tel'; subject.inputMode = email ? 'email' : 'tel';
      subject.autocomplete = email ? 'email' : 'tel-national'; $('#subject-label').textContent = email ? '已绑定的备用邮箱' : '中国大陆手机号'; say('');
    }));
    $('#login-subject').addEventListener('input', reset);
    $('#send-login-code').addEventListener('click', async event => {
      const button = event.currentTarget; if (button.disabled) return; button.disabled = true;
      try {
        const channel=login.elements.channel.value,subject=$('#login-subject').value;const result = await api('auth/challenge', {channel, purpose: 'login', subject});
        if (!login.isConnected) return;cooldown(button,result.retry_after);if(channel!==login.elements.channel.value||subject!==$('#login-subject').value){challenge=null;say('手机号或邮箱已变化，请重新获取验证码。',true);return;}challenge = result.challenge_id;say(result.message);
      } catch (error) { say(error.message, true); button.disabled = false; }
    });
    login.addEventListener('submit', action(async () => {
      if (!challenge) throw new Error('请先获取验证码');
      await api('auth/verify', {challenge_id: challenge, code: $('#login-code').value});
      if (login.isConnected) { reset(); navigate(destination(new URLSearchParams(location.search).get('next'))); }
    }));
  }
  $('#homepage-form')?.addEventListener('submit', action(async event => {
    const form=event.currentTarget;await api('account/profile', {public: form.elements.public.checked});
    if (form.isConnected) await reload();
  }));
  document.querySelectorAll('[data-binding]').forEach(form => {
    let challenge = null; form.elements.subject.addEventListener('input', () => { challenge = null; });
    const button = form.querySelector('[data-send-bind]');
    button.addEventListener('click', async () => {
      if (button.disabled) return; button.disabled = true;
      try {
        const subject=form.elements.subject.value;const result = await api('auth/challenge', {channel: form.dataset.binding, purpose: form.dataset.purpose, subject});
        if (form.isConnected) {cooldown(button,result.retry_after);if(subject!==form.elements.subject.value){challenge=null;say('验证对象已变化，请重新获取验证码。',true);return;}challenge = result.challenge_id; say(result.message);}
      } catch (error) { say(error.message, true); button.disabled = false; }
    });
    form.addEventListener('submit', action(async () => {
      if (!challenge) throw new Error('请先获取验证码');
      await api('auth/verify', {challenge_id: challenge, code: form.elements.code.value});
      if (form.isConnected) { form.reset(); challenge = null; await reload(); }
    }));
  });
  for (const [selector, path] of [['[data-logout]', 'account/logout'], ['[data-logout-all]', 'account/logout-all']]) $(selector)?.addEventListener('click', action(async () => { await api(path, {}); clearCredential(); navigate('/login/'); }));
  $('#import-form')?.addEventListener('submit', action(async event => {
    const input = event.currentTarget.elements.token;
    try { await api('account/import', {token: input.value}); if (input.isConnected) await reload(); }
    finally { input.value = ''; }
  }));
  const keyForm = $('#key-form');
  if (!keyForm) return;
  let editing = null;
  const reset = () => { editing = null; keyForm.reset(); keyForm.elements.name.disabled = false; keyForm.elements.scope.disabled = false; $('#create-key').textContent = '创建密钥'; $('#cancel-key-edit').hidden = true; $('#custom-days-label').hidden = true; keyForm.elements.days.required = false; };
  keyForm.elements.duration.addEventListener('change', () => { const custom = keyForm.elements.duration.value === 'custom'; $('#custom-days-label').hidden = !custom; keyForm.elements.days.required = custom; });
  $('#cancel-key-edit').addEventListener('click', reset);
  if (credential) $('#new-key').value = credential.token;
  keyForm.addEventListener('submit', action(async () => {
    const f = keyForm.elements, expiry = f.duration.value === 'custom' ? {days: Number(f.days.value)} : {months: {month: 1, 'six-months': 6, year: 12}[f.duration.value]};
    if (editing) { await api('account/keys/' + editing + '/expiry', expiry); if (keyForm.isConnected) await reload(); return; }
    clearCredential(); $('#new-key').value = ''; $('#key-reveal').hidden = true;
    const created = await api('account/keys', {name: f.name.value, scope: f.scope.value, ...expiry});
    if (keyForm.isConnected) { credential = created; await reload({preserveCredential: true}); }
  }));
  $('[id=download-key]')?.addEventListener('click', () => {
    if (!credential) return;
    const data = {api: credential.api, token: credential.token, publisher_id: credential.publisher_id};
    const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], {type: 'application/json'}));
    const link = document.createElement('a'); link.href = url; link.download = 'texopub-credential.json'; link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  $('#dismiss-key').addEventListener('click', () => { clearCredential(); $('#new-key').value = ''; $('#key-reveal').hidden = true; });
  document.querySelectorAll('[data-edit-key]').forEach(button => button.addEventListener('click', () => {
    const key = keys.items.find(k => k.id === button.dataset.editKey); if (!key) return;
    clearCredential(); $('#new-key').value = ''; $('#key-reveal').hidden = true; editing = key.id;
    keyForm.elements.name.value = key.name; keyForm.elements.name.disabled = true; keyForm.elements.scope.value = key.scope; keyForm.elements.scope.disabled = true;
    $('#create-key').textContent = '保存有效期'; $('#cancel-key-edit').hidden = false; keyForm.elements.duration.focus();
  }));
  document.querySelectorAll('[data-revoke-key]').forEach(button => button.addEventListener('click', action(async () => {
    if (!confirm('撤销后，该密钥连接的 AI 将无法访问空间。确认撤销？')) return;
    await api('account/keys/' + button.dataset.revokeKey + '/revoke', {}); clearCredential(); if (button.isConnected) await reload();
  })));
  $('#revoke-legacy')?.addEventListener('click', action(async () => {
    if (!confirm('确认撤销旧邀请凭证？')) return; await api('account/legacy-key/revoke', {}); clearCredential(); await reload();
  }));
}
