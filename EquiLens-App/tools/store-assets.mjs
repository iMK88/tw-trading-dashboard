// 產生上架素材：App 圖示（iOS 1024、Play 512）、Play 主題圖片（1024×500），以及兩個商店要求尺寸的截圖（示意資料）。
// 截圖需要示意資料的 Nexus（4391）與 Pocket（4392）正在執行（見 EquiLens-Nexus/tools/screenshots/README.md）。
// 用法：PLAYWRIGHT=$(npm root -g)/playwright/index.mjs node tools/store-assets.mjs [icons|shots]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { dayTradeScan, indexMinutes } from '../../EquiLens-Nexus/tools/screenshots/overlays.mjs';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const STORE = path.join(ROOT, 'store'), ONLY = process.argv[2] || '';
const T = new Date('2026-10-16T14:40:00+08:00');
const b = await chromium.launch();

// 圖示：滿版正方形（商店與系統會自行裁成圓角），六角形與走勢線取自 EquiLens-Pocket/public/icon.svg，放大置中
const glyph = (s = 1.25) => { const P = (x, y) => `${(50 + (x - 50) * s).toFixed(2)},${(50 + (y - 50) * s).toFixed(2)}`;
  return `<polygon points="${[[50, 23.6], [72.86, 36.8], [72.86, 63.2], [50, 76.4], [27.14, 63.2], [27.14, 36.8]].map(p => P(...p)).join(' ')}" fill="#2EE6FF" stroke="#2EE6FF" stroke-width="${6.6 * s}" stroke-linejoin="round"/><polyline points="${[[35.48, 61.22], [46.04, 50], [53.96, 56.6], [65.84, 39.44]].map(p => P(...p)).join(' ')}" fill="none" stroke="#07101C" stroke-width="${5.94 * s}" stroke-linecap="round" stroke-linejoin="round"/>`; };
const iconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="#07101C"/>${glyph()}</svg>`;
async function render(html, w, h, file, type = 'png') {
  const p = await b.newPage({ viewport: { width: w, height: h } });
  await p.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;width:${w}px;height:${h}px;overflow:hidden;background:#07101C}</style></head><body>${html}</body></html>`);
  await p.waitForTimeout(300); fs.mkdirSync(path.dirname(file), { recursive: true });
  await p.screenshot({ path: file, type, ...(type === 'jpeg' ? { quality: 88 } : {}) }); await p.close();
}
if (!ONLY || ONLY === 'icons') {
  const big = iconSvg.replace('<svg ', '<svg width="1024" height="1024" ');
  await render(big, 1024, 1024, path.join(STORE, 'assets', 'icon-1024.png'));
  fs.copyFileSync(path.join(STORE, 'assets', 'icon-1024.png'), path.join(ROOT, 'ios', 'EquiLens', 'Assets.xcassets', 'AppIcon.appiconset', 'AppIcon-1024.png'));
  await render(iconSvg.replace('<svg ', '<svg width="512" height="512" '), 512, 512, path.join(STORE, 'assets', 'play-icon-512.png'));
  // Play 主題圖片：深色底、圖示、名稱與一句話說明
  await render(`<div style="width:1024px;height:500px;display:flex;align-items:center;gap:56px;padding:0 80px;box-sizing:border-box;background:radial-gradient(circle at 78% 30%,rgba(46,230,255,.22),transparent 55%),linear-gradient(135deg,#07101C,#0f1726);font-family:'Noto Sans CJK TC','Noto Sans TC',sans-serif;color:#e9f1fc">
    <div style="width:220px;height:220px;flex:none;border-radius:48px;overflow:hidden;box-shadow:0 18px 50px rgba(0,0,0,.5)">${iconSvg.replace('<svg ', '<svg width="220" height="220" ')}</div>
    <div><div style="font-size:76px;font-weight:800;letter-spacing:.08em">衡析</div><div style="font-size:30px;font-weight:700;color:#2ee6ff;margin-top:4px;letter-spacing:.04em">EquiLens</div>
    <div style="font-size:28px;margin-top:22px;color:#c8d6ea">台股研究戰情室・連回你自己的電腦</div><div style="font-size:21px;margin-top:10px;color:#97a8c0">盤中雷達 · 資金熱浪 · 籌碼與權證 · 推播通知</div></div></div>`, 1024, 500, path.join(STORE, 'assets', 'play-feature-1024x500.png'));
  console.log('icons done');
}

// 商店截圖：手機版畫面（示意資料），依各商店要求的像素尺寸截取
const SETS = {
  'play-phone': { w: 360, h: 640, dpr: 3 },          // 1080×1920
  'play-tablet': { w: 960, h: 600, dpr: 2 },         // 1920×1200（左右雙頁）
  'ios-iphone-6.9': { w: 440, h: 956, dpr: 3 },      // 1320×2868
  'ios-ipad-13': { w: 1032, h: 1376, dpr: 2 },       // 2064×2752（左右雙頁）
};
if (!ONLY || ONLY === 'shots') {
  const st = new Map((await (await fetch('http://127.0.0.1:4391/api/state')).json()).stocks.map(s => [s.id, s]));
  for (const [name, v] of Object.entries(SETS)) {
    const c = await b.newContext({ viewport: { width: v.w, height: v.h }, deviceScaleFactor: v.dpr, hasTouch: true }), p = await c.newPage();
    await p.clock.install({ time: T });
    await p.route('**/m/api/daytrade', async r => { const res = await r.fetch(), j = await res.json(); r.fulfill({ response: res, json: { ...j, ...dayTradeScan(st), capable: true, enabled: true } }); });
    await p.route(u => u.pathname === '/m/api/index', async r => { const res = await r.fetch(), j = await res.json(), ref = j.ref || 23005, last = j.quote?.last || 23187, M = indexMinutes(ref, last);
      r.fulfill({ response: res, json: { ...j, source: 'fugle', ref, minutes: M, quote: { ...j.quote, open: M.c[0], high: Math.max(...M.c), low: Math.min(...M.c) } } }); });
    await p.goto('http://127.0.0.1:4392/'); await p.waitForTimeout(500);
    await p.evaluate(() => fetch('/m/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'nexus-pocket' }, body: JSON.stringify({ password: 'demo-password-123' }) }));
    await p.reload(); await p.waitForTimeout(2500);
    const dir = path.join(STORE, 'screenshots', name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
    let n = 0; const shot = async label => { await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(400); await p.screenshot({ path: path.join(dir, `${String(++n).padStart(2, '0')}-${label}.jpg`), type: 'jpeg', quality: 88 }); };
    const tab = async k => { await p.locator(`button.tab[data-tab="${k}"]`).click(); await p.waitForTimeout(2200); };
    const closeSheet = async () => { if (await p.evaluate(() => document.documentElement.dataset.layout === 'phone' && document.getElementById('sheet')?.classList.contains('open'))) { await p.locator('[data-close-sheet]').click(); await p.waitForTimeout(600); } };
    await tab('live'); await shot('board');
    await p.locator('[data-intra="3017"]').first().click(); await p.waitForTimeout(2200); await shot('chart'); await closeSheet();
    await p.locator('[data-lview="daytrade"]').click(); await p.waitForTimeout(1500); await shot('daytrade');
    await tab('heat'); await shot('heatmap');
    await tab('brief'); await shot('brief');
    await tab('flows'); const br = p.locator('[data-fview="brokers"]'); if (await br.count()) { await br.click(); await p.waitForTimeout(1500); } await shot('chips');
    await c.close(); console.log(name, n, 'shots');
  }
}
await b.close();
