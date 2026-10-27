// 錄製商店版 App 的示意模式資料：對示意資料的 Nexus（4391）與 Pocket（4392）走過手機版各分頁，並直接讀取每檔股票的走勢、K 線與個股資料，
// 把讀取到的 API 回應存成 web/demo/demo-api.json。App 在示意模式下以這份資料回應網頁（不需要電腦），給商店審查與還沒裝衡析的人試用。
// 啟動示意伺服器的方式見 EquiLens-Nexus/tools/screenshots/README.md；用法：PLAYWRIGHT=$(npm root -g)/playwright/index.mjs node tools/record-demo.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoKeys } from './demo-keys.mjs';
import { briefingExtras } from './demo-extras.mjs';
import { dayTradeScan, indexMinutes } from '../../EquiLens-Nexus/tools/screenshots/overlays.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const OUT = process.argv[2] || path.join(ROOT, 'web', 'demo', 'demo-api.json');
const NEXUS = 'http://127.0.0.1:4391', POCKET = 'http://127.0.0.1:4392';
const T = new Date('2026-10-16T14:40:00+08:00');
// 只在下列 POST 回放錄到的結果（讀取類的查詢）；其他 POST 在示意模式一律回覆「無法變更設定」
const POST_REPLAY = new Set(['m/api/grouprank/query', 'm/api/heatmap/query']);

const entries = {}, add = (key, status, body, first = false) => { if (first && entries[key]) return; entries[key] = { s: status, b: body }; };
function record(url, method, status, body) {
  const u = new URL(url), p = u.pathname.replace(/^\//, '');
  if (!(p.startsWith('m/') || p === 'health' || p.startsWith('locales/')) || status !== 200) return;
  if (method === 'POST') { if (POST_REPLAY.has(p)) add(`POST ${p}`, status, body); return; }
  const [exact, ...fallback] = demoKeys(p, u.search);
  add(exact, status, body); for (const k of fallback) add(k, status, body, true);
}

const st = new Map((await (await fetch(NEXUS + '/api/state')).json()).stocks.map(s => [s.id, s]));
const b = await chromium.launch(), c = await b.newContext({ viewport: { width: 390, height: 844 } }), p = await c.newPage();
await p.clock.install({ time: T });
await p.route('**/m/api/daytrade', async r => { const res = await r.fetch(), j = await res.json(); r.fulfill({ response: res, json: { ...j, ...dayTradeScan(st), capable: true, enabled: true } }); });
await p.route(u => u.pathname === '/m/api/index', async r => { const res = await r.fetch(), j = await res.json(), ref = j.ref || 23005, last = j.quote?.last || 23187, M = indexMinutes(ref, last);
  r.fulfill({ response: res, json: { ...j, source: 'fugle', ref, minutes: M, quote: { ...j.quote, open: M.c[0], high: Math.max(...M.c), low: Math.min(...M.c) } } }); });
p.on('response', async res => { try { const req = res.request(); if (!['GET', 'POST'].includes(req.method())) return; record(res.url(), req.method(), res.status(), await res.text()); } catch { } });
p.on('pageerror', e => console.log('pageerror', e.message.slice(0, 160)));

await p.goto(POCKET + '/'); await p.waitForTimeout(500);
await p.evaluate(() => fetch('/m/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nexus-pocket' }, body: JSON.stringify({ password: 'demo-password-123' }) }));
await p.reload(); await p.waitForTimeout(2500);
const wait = ms => p.waitForTimeout(ms);
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);
const tab = async k => { log('tab', k); await p.locator(`button.tab[data-tab="${k}"]`).click({ timeout: 8000 }); await wait(2200); };
const click = async sel => { const l = p.locator(sel).first(); if (await l.count()) { try { await l.click({ timeout: 5000 }); } catch { log('skip', sel); } await wait(1500); } };
// 依序讀取（每個請求最多等 25 秒；示意環境沒有網路，部分資料源會重試到逾時）
const get = paths => p.evaluate(async list => { for (const x of list) await fetch('/m/' + x, { credentials: 'same-origin', signal: AbortSignal.timeout(25000) }).then(r => r.text()).catch(() => null); }, paths); // 讀完內容，回應才錄得到

// 1. 走過各分頁與子畫面
await tab('brief'); await click('[data-boff="1"]'); await click('[data-boff="0"]');
await tab('home'); await tab('heat'); await wait(2500);
await tab('live');
for (const v of ['board', 'daytrade', 'radar', 'rules', 'groups', 'settings']) await click(`[data-lview="${v}"]`);
await click('[data-lview="board"]');
for (const id of (await p.locator('[data-bgroup]').evaluateAll(els => els.map(e => e.dataset.bgroup))).slice(0, 12)) await click(`[data-bgroup="${id}"]`);
await tab('stocks'); await tab('patterns'); await tab('flows');
for (const v of ['brokers', 'holders']) await click(`[data-fview="${v}"]`);
await click('[data-hr-scope="market"]'); await click('[data-fview="inst"]');

// 2. 每檔股票的走勢、K 線與個股資料；型態明細；大盤指數；日報圖卡等
const stocks = await p.evaluate(() => fetch('/m/api/stocks').then(r => r.json()));
const ids = [...new Set([...stocks.stocks.map(s => s.id), ...(stocks.watchExtra || []).map(s => s.id)])];
console.log('stocks', ids.length);
// 每檔：即時走勢、日 K、個股診斷、認購權證；5 分 K 與主力分點、大戶持股只錄自選股（離線時這幾項要等資料源逾時）
const watch = new Set(stocks.watchlist || []);
for (const [n, id] of ids.entries()) {
  if (n % 10 === 0) log('stock', n);
  await get([`api/intraday?id=${id}`, `api/chart?id=${id}&period=day`, `api/stock?id=${id}`, `api/warrants?id=${id}`, ...(watch.has(id) ? [`api/chart?id=${id}&period=5m`, `api/brokers?id=${id}`, `api/holders?id=${id}`] : [])]);
}
const pats = await p.evaluate(() => fetch('/m/api/patterns').then(r => r.json()));
await get(pats.rows.map(r => `api/pattern?id=${r.id}&pid=${encodeURIComponent(r.pid)}`));
await get(['api/index?id=TAIEX', 'api/index?id=TPEX', 'api/job', 'api/monitor', 'api/price-alerts', 'api/push/key', 'api/replay/days', 'api/grouprank', 'api/holders/rank?scope=mine', 'api/holders/rank?scope=market', 'api/chipwatch', 'api/summary', 'api/board']);
const rep = await p.evaluate(() => fetch('/m/api/report').then(r => r.json()));
for (const d of rep.dates || []) await get([`api/report?date=${d}`, `api/report/card?date=${d}`]);
const cw = await p.evaluate(() => fetch('/m/api/chipwatch').then(r => r.json()));
await get((cw.dates || []).map(d => `api/chipwatch?date=${d}`));
const gr = await p.evaluate(() => fetch('/m/api/grouprank').then(r => r.json()));
await get((gr.dates || []).map(d => `api/grouprank?date=${d}`));
const w = await p.evaluate(() => fetch('/m/api/warrants?id=3017').then(r => r.json()).catch(() => null));
const wd = w?.date || '2026-10-16'; await get((w?.list || []).slice(0, 6).map(x => `api/warrants/brokers?wid=${x.id}&date=${wd}`));
await p.evaluate(() => Promise.all(['/health', '/locales/en.json'].map(u => fetch(u).then(r => r.text()))));
await p.evaluate(() => fetch('/m/api/grouprank/query', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nexus-pocket' }, body: '{}' }).then(r => r.text()));
await wait(1500);
await b.close();

// 3. 示意模式的調整：時光機不提供（畫格太多）、推播未開啟、英文介面變體、合成的新聞與行事曆
const J = k => JSON.parse(entries[k].b), set = (k, v) => { entries[k] = { s: 200, b: JSON.stringify(v) }; };
set('m/api/replay/days', { days: [] });
set('m/api/push/key', { publicKey: '', count: 0, subscribed: false });
set('m/api/job', { running: false });
const health = { ...J('health'), build: 'demo' }; set('health', health); set('health#en', { ...health, lang: 'en' });
const me = J('m/auth/me'); set('m/auth/me#en', { ...me, profile: { ...me.profile, language: 'en' } });
for (const k of Object.keys(entries)) if (k.startsWith('m/api/heatmap/live')) delete entries[k];
briefingExtras(entries); // 焦點頁的新聞與本周大事紀（錄製時不連外網）

const out = { version: 1, recorded: '2026-10-16', note: '衡析示意資料（合成），只供商店版 App 的示意模式使用', entries: Object.fromEntries(Object.keys(entries).sort().map(k => [k, entries[k]])) };
fs.writeFileSync(OUT, JSON.stringify(out));
console.log('entries', Object.keys(entries).length, 'bytes', fs.statSync(OUT).size, OUT);
