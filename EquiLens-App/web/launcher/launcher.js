// 衡析 App 連線頁：輸入衡析手機版網址並連線、最近連過的網址、示意模式。與 App 的溝通方式同 EquiLens-Pocket/public/native.js。
(() => {
  const A = window.EquiLensAndroid, I = window.webkit?.messageHandlers?.equilens;
  const waits = new Map(); let seq = 0;
  window.__equilensReply = (id, ok, value) => { const w = waits.get(id); if (!w) return; waits.delete(id); ok ? w.resolve(value) : w.reject(new Error(value || '')); };
  window.__equilensEvent = () => { };
  const call = (method, args = {}) => new Promise((resolve, reject) => {
    if (!A && !I) return reject(new Error('NO_APP'));
    const id = ++seq; waits.set(id, { resolve, reject }); const msg = JSON.stringify({ id, method, args });
    A ? A.postMessage(msg) : I.postMessage(msg);
  });

  const EN = {
    title: 'EquiLens', lead: 'The mobile app for your Taiwan stock research desk. Your data and keys stay on your own computer; the app connects to it through your own address.',
    label: 'Your EquiLens Pocket address', connect: 'Connect', or: 'No EquiLens on your computer yet?', demo: 'Try the demo (no computer needed)',
    demoNote: 'The demo shows every screen with synthetic sample data. Queries and settings are disabled.', howTitle: 'How do I get an address?',
    how1: 'Install EquiLens Nexus and Pocket on a Windows or Mac computer (free and open source).', how2: 'In the desktop app, set a domain and a phone password under Data & Settings → Remote access.',
    how3: 'Enter the Pocket address above, sign in, and turn on push notifications.', guide: 'Installation guide (GitHub)', privacy: 'Privacy policy',
    disc: 'EquiLens is a research tool. Scores, alerts and text are not investment advice.', connecting: 'Connecting…', invalid: 'Enter an https:// address',
    noApp: 'Open this page in the EquiLens app.', version: 'Version',
  };
  const en = !/^zh/i.test(navigator.language || '');
  const T = (k, zh) => (en && EN[k]) || zh;
  if (en) { document.documentElement.lang = 'en'; for (const el of document.querySelectorAll('[data-t]')) { const v = EN[el.dataset.t]; if (v) el.textContent = v; } }

  const $ = s => document.querySelector(s), err = $('#err'), url = $('#url'), btn = $('#connect button');
  const normalize = v => { let s = String(v || '').trim(); if (!s) return ''; if (!/^[a-z]+:\/\//i.test(s)) s = 'https://' + s; try { const u = new URL(s); return u.protocol === 'https:' ? u.origin : ''; } catch { return ''; } };
  async function connect(v) {
    const target = normalize(v); err.textContent = '';
    if (!target) { err.textContent = T('invalid', '請輸入 https:// 開頭的網址'); return; }
    btn.disabled = true; const old = btn.textContent; btn.textContent = T('connecting', '連線中…');
    try { await call('connect', { url: target }); } // 成功時 App 會載入衡析，這一頁就被取代
    catch (e) { err.textContent = e.message === 'NO_APP' ? T('noApp', '請在衡析 App 中開啟這一頁。') : e.message; }
    finally { btn.disabled = false; btn.textContent = old; }
  }
  $('#connect').addEventListener('submit', e => { e.preventDefault(); connect(url.value); });
  $('#demo').addEventListener('click', () => call('demo').catch(e => { err.textContent = e.message === 'NO_APP' ? T('noApp', '請在衡析 App 中開啟這一頁。') : e.message; }));
  document.addEventListener('click', e => { const o = e.target.closest('[data-open]'); if (!o) return; const href = (en && o.dataset.openEn) || o.dataset.open; call('openExternal', { url: href }).catch(() => { location.href = href; }); });
  call('info').then(i => {
    if (i?.version) $('#ver').textContent = `${T('version', '版本')} ${i.version}`;
    if (i?.error) err.textContent = i.error;
    const list = (i?.servers || []).slice(0, 3);
    if (list[0] && !url.value) url.value = list[0];
    $('#recent').innerHTML = '';
    for (const s of list) { const b = document.createElement('button'); b.type = 'button'; b.innerHTML = '<span></span><small>›</small>'; b.firstChild.textContent = s.replace(/^https:\/\//, ''); b.addEventListener('click', () => connect(s)); $('#recent').append(b); }
  }).catch(() => { });
})();
