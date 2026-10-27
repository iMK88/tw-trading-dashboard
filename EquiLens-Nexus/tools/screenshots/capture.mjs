// README 截圖：電腦版（http://127.0.0.1:4391）與手機版（http://127.0.0.1:4392），畫面為示意資料
// Playwright 是全域安裝：PLAYWRIGHT=$(npm root -g)/playwright/index.mjs
import { dayTradeScan, indexMinutes } from './overlays.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const OUT = process.argv[2], ONLY = process.argv[3] ? new Set(process.argv[3].split(',')) : null;
const T = new Date('2026-10-16T21:30:00+08:00');
const want = k => !ONLY || ONLY.has(k);
const b = await chromium.launch();
const VIEW = { width: 1440, height: 1000 };

// 當沖掃描的觀察名單與大盤分時資料（示意；與商店版 App 的示意模式共用）
const st = new Map((await (await fetch('http://127.0.0.1:4391/api/state')).json()).stocks.map(s => [s.id, s]));
const dtScan = dayTradeScan(st);
async function desktop(page) {
  await page.clock.install({ time: T });
  await page.route('**/api/daytrade', async r => { const res = await r.fetch(); const j = await res.json(); r.fulfill({ response: res, json: { ...j, ...dtScan, capable: true, enabled: true, settings: j.settings } }); });
  await page.goto('http://127.0.0.1:4391/'); await page.waitForTimeout(1500);
}
const nav = async (p, k) => { await p.locator(`button[data-page="${k}"]`).first().click(); await p.waitForTimeout(2200); };
const shot = (p, name, clip) => p.screenshot({ path: `${OUT}/${name}.png`, ...(clip ? { clip } : {}) });
const MAIN = (y = 60, h = 840) => ({ x: 238, y, width: 1202, height: h });

{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  p.on('pageerror', e => console.log('pageerror', e.message.slice(0, 160)));
  await desktop(p);
  if (want('overview')) { await nav(p, 'overview'); await shot(p, 'desktop-overview'); }
  if (want('heatmap')) { await nav(p, 'heatmap'); await shot(p, 'desktop-heatmap', MAIN(60, 840)); }
  if (want('report')) { await nav(p, 'home'); await shot(p, 'desktop-report', MAIN(60, 840)); }
  if (want('live')) {
    await nav(p, 'live'); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(800);
    await shot(p, 'desktop-daytrade', MAIN(60, 840));
    const board = p.locator('.lv-layout').first(); await board.scrollIntoViewIfNeeded(); await p.waitForTimeout(600);
    await p.addStyleTag({ content: '.topbar{position:static!important}' });
    const bb = await board.boundingBox(), sy = await p.evaluate(() => window.scrollY);
    await p.screenshot({ path: `${OUT}/desktop-radar.png`, fullPage: true, clip: { x: bb.x, y: bb.y + sy, width: bb.width, height: 760 } });
    await p.locator('[data-dttab="review"]').click(); await p.waitForTimeout(1200); await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400);
    await p.locator('.dt-panel').screenshot({ path: `${OUT}/desktop-daytrade-review.png` });
  }
  if (want('chart')) {
    await nav(p, 'live'); const c = p.locator('[data-kbar="3017"]').first(); await c.scrollIntoViewIfNeeded(); await c.click(); await p.waitForTimeout(2000);
    await shot(p, 'desktop-chart', { x: 200, y: 36, width: 1040, height: 720 });
    for (const [v, n] of [['day', 'desktop-chart-day']]) { await p.locator(`[data-cperiod="${v}"]`).first().click(); await p.waitForTimeout(1500); await shot(p, n); }
    const d = p.locator('[data-stock-detail="3017"]').first(); if (await d.count()) {
      await d.click(); await p.waitForTimeout(2200); await shot(p, 'desktop-detail');
      // 個股的認購權證：展開第一檔的分點進出
      await p.waitForTimeout(1500);
      const wb = p.locator('#ix-warrants [data-wbr]').first(); if (await wb.count()) { await wb.click(); await p.waitForTimeout(1200); }
      await p.locator('#ix-warrants').evaluate(e => e.closest('section').scrollIntoView({ block: 'start' })); await p.waitForTimeout(600);
      await shot(p, 'desktop-warrants');
    }
    await p.keyboard.press('Escape'); await p.waitForTimeout(500);
  }
  if (want('grouprank')) { await p.goto('http://127.0.0.1:4391/'); await p.waitForTimeout(1200); await nav(p, 'grouprank'); await shot(p, 'desktop-grouprank', MAIN(60, 840)); }
  if (want('patterns')) { await nav(p, 'patterns'); await shot(p, 'desktop-patterns', MAIN(60, 840)); }
  if (want('flows')) { await nav(p, 'flows'); await p.locator('[data-flow-cache]').click(); await p.waitForTimeout(2000); await shot(p, 'desktop-flows', MAIN(60, 840)); }
  if (want('chips')) { await nav(p, 'chips'); await shot(p, 'desktop-chips', MAIN(60, 840)); const w = p.locator('.ix-cw-w').first(); if (await w.count()) { await w.scrollIntoViewIfNeeded(); await p.waitForTimeout(500); await w.screenshot({ path: `${OUT}/desktop-chips-warrants.png` }); } }
  if (want('topics')) { await nav(p, 'topics'); await shot(p, 'desktop-topics', MAIN(60, 640)); }
  await p.close();
}
// 手機版
if (want('mobile')) {
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const p = await c.newPage(); await p.clock.install({ time: T });
  await p.route('**/m/api/daytrade', async r => { const res = await r.fetch(); const j = await res.json(); r.fulfill({ response: res, json: { ...j, ...dtScan, capable: true, enabled: true } }); });
  await p.goto('http://127.0.0.1:4392/'); await p.waitForTimeout(800);
  await p.evaluate(() => fetch('/m/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nexus-pocket' }, body: JSON.stringify({ password: 'demo-password-123' }) }));
  await p.goto('http://127.0.0.1:4392/'); await p.waitForTimeout(2000);
  const tab = async k => { await p.locator(`button.tab[data-tab="${k}"]`).click(); await p.waitForTimeout(1800); await p.evaluate(() => window.scrollTo(0, 0)); };
  await tab('brief'); await shot(p, 'mobile-brief');
  await tab('heat'); await shot(p, 'mobile-heat');
  await tab('live'); await shot(p, 'mobile-board');
  await p.locator('[data-lview="daytrade"]').click(); await p.waitForTimeout(1500); await shot(p, 'mobile-daytrade');
  await tab('stocks'); await shot(p, 'mobile-stocks');
  await tab('flows'); const br = p.locator('[data-fview="brokers"]'); if (await br.count()) { await br.click(); await p.waitForTimeout(1500); } await shot(p, 'mobile-chips');
  await c.close();
}
// 摺疊手機（iPhone Duo 的 CSS 尺寸）：展開橫向＝左右雙頁、展開直向＝上下雙頁、封面螢幕＝單頁
// 示意資料沒有指數分時資料，副頁閒置時的大盤走勢以合成的分時資料取代 /m/api/index 的回應
if (want('foldable')) {
  const fold = async (w, h) => {
    const c = await b.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2 }), p = await c.newPage(); await p.clock.install({ time: T });
    await p.route(u => u.pathname === '/m/api/index', async r => { const res = await r.fetch(), j = await res.json(), ref = j.ref || 23005, last = j.quote?.last || 23187, M = indexMinutes(ref, last);
      r.fulfill({ response: res, json: { ...j, source: 'fugle', ref, minutes: M, quote: { ...j.quote, open: M.c[0], high: Math.max(...M.c), low: Math.min(...M.c) } } }); });
    await p.goto('http://127.0.0.1:4392/'); await p.waitForTimeout(800);
    await p.evaluate(() => fetch('/m/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nexus-pocket' }, body: JSON.stringify({ password: 'demo-password-123' }) }));
    await p.reload(); await p.waitForTimeout(2000);
    return { c, p, tab: async k => { await p.locator(`button.tab[data-tab="${k}"]`).click(); await p.waitForTimeout(2000); } };
  };
  { const { c, p, tab } = await fold(890, 626);
    await tab('heat'); await shot(p, 'foldable-idle');
    await tab('live'); await p.locator('[data-intra="3017"]').first().click(); await p.waitForTimeout(2000); await shot(p, 'foldable-split');
    await c.close(); }
  { const { c, p, tab } = await fold(626, 890);
    await tab('live'); await p.locator('[data-intra="2330"]').first().click(); await p.waitForTimeout(2000); await shot(p, 'foldable-stack');
    await c.close(); }
  { const { c, p, tab } = await fold(466, 678);
    await tab('live'); await shot(p, 'foldable-cover');
    await c.close(); }
}
await b.close();
