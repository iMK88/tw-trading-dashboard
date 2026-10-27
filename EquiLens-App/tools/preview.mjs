// 在電腦瀏覽器預覽 App 內建的頁面：與 App 的 DemoServer 相同的規則，提供連線頁（/launcher/）、示意模式的手機版畫面與錄好的 API 回應。
// 用法：node tools/preview.mjs [連接埠，預設 4395]，再開 http://127.0.0.1:4395/ （示意模式）或 /launcher/index.html（連線頁）
// 瀏覽器中沒有 App 的原生功能（推播、存圖等），按鈕會顯示「只有在衡析 App 中可用」。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { demoKeys } from './demo-keys.mjs';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const POCKET = path.join(ROOT, '..', 'EquiLens-Pocket', 'public'), LAUNCHER = path.join(ROOT, 'web', 'launcher');
const TYPES = { html: 'text/html', js: 'text/javascript', css: 'text/css', json: 'application/json', svg: 'image/svg+xml', png: 'image/png', webmanifest: 'application/manifest+json' };
const MSG = { zh: { readonly: '示意模式無法變更設定或查詢新資料', missing: '示意模式沒有這項資料' }, en: { readonly: 'Demo mode cannot change settings or query new data', missing: 'Demo mode has no data for this' } };

export function createPreview({ lang = 'zh' } = {}) {
  const entries = JSON.parse(fs.readFileSync(path.join(ROOT, 'web', 'demo', 'demo-api.json'), 'utf8')).entries;
  const send = (res, status, type, body) => { res.writeHead(status, { 'Content-Type': `${type}; charset=utf-8`, 'Cache-Control': 'no-store' }); res.end(body); };
  const json = (res, status, body) => send(res, status, 'application/json', body);
  const file = (res, base, rel) => {
    const f = path.join(base, rel); if (!f.startsWith(base) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) return send(res, 404, 'text/plain', '');
    send(res, 200, TYPES[path.extname(f).slice(1)] || 'application/octet-stream', fs.readFileSync(f));
  };
  return http.createServer((req, res) => {
    const u = new URL(req.url, 'http://x'), p = decodeURIComponent(u.pathname).replace(/^\//, '');
    if (p.startsWith('launcher/')) return file(res, LAUNCHER, p.slice('launcher/'.length));
    if (req.method === 'POST') { const e = entries[`POST ${p}`]; return e ? json(res, e.s, e.b) : json(res, 403, JSON.stringify({ error: MSG[lang].readonly })); }
    if (!(p.startsWith('m/') || p === 'health' || p.startsWith('locales/'))) return file(res, POCKET, p || 'index.html');
    if (lang !== 'zh' && entries[`${p}#en`]) return json(res, entries[`${p}#en`].s, entries[`${p}#en`].b);
    for (const k of demoKeys(p, u.search)) if (entries[k]) return json(res, entries[k].s, entries[k].b);
    json(res, 404, JSON.stringify({ error: MSG[lang].missing }));
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.argv[2]) || 4395;
  createPreview({ lang: process.env.PREVIEW_LANG || 'zh' }).listen(port, '127.0.0.1', () => console.log(`衡析 App 預覽：http://127.0.0.1:${port}/（示意模式）、http://127.0.0.1:${port}/launcher/index.html（連線頁）`));
}
