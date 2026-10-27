// 衡析推播中繼（Cloudflare Worker）：接收每位使用者電腦上的衡析 Pocket 送來的通知，以 Firebase Cloud Messaging（HTTP v1）送到商店版 App。
// 商店版 App 是由發行者（你）的 Firebase 專案發送推播；使用者的電腦不能持有這把金鑰，所以由這個中繼代為發送。
// 中繼不保存任何通知內容或 token，只在記憶體中做頻率限制。
//
// 秘密（npx wrangler secret put FCM_SERVICE_ACCOUNT）：Firebase 服務帳戶 JSON（project_id、client_email、private_key）
// POST /v1/send  { token, platform: 'android'|'ios', title, body, tag, url }
//   200 已送出；400 格式錯誤；404 token 已失效（Pocket 會刪除這台裝置）；429 太頻繁；502 FCM 錯誤
const LIMITS = { perToken: 30, perIp: 600, windowMs: 60e3 };
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';
const enc = new TextEncoder();
const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64uText = s => b64u(enc.encode(s));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// 頻率限制（每個 Worker 執行個體各自計算，屬盡力而為）
const hits = new Map();
export function limited(key, max, now = Date.now()) {
  const h = hits.get(key);
  if (!h || now - h.start >= LIMITS.windowMs) { hits.set(key, { start: now, n: 1 }); if (hits.size > 50000) hits.clear(); return false; }
  return ++h.n > max;
}
export const resetLimits = () => hits.clear();

export function validRequest(b) {
  return !!b && typeof b.token === 'string' && /^[\w:.-]{20,4096}$/.test(b.token) && (b.platform === 'android' || b.platform === 'ios')
    && typeof b.title === 'string' && b.title.length <= 200 && (b.body == null || (typeof b.body === 'string' && b.body.length <= 1500))
    && (b.tag == null || (typeof b.tag === 'string' && b.tag.length <= 100)) && (b.url == null || (typeof b.url === 'string' && b.url.length <= 500));
}

// FCM HTTP v1 訊息：Android 用 data 訊息（由 App 自行顯示，點擊時開啟對應頁面）；iOS 用 APNs 通知
export function fcmMessage(b) {
  const data = { title: b.title, body: b.body || '', tag: b.tag || '', url: b.url || '/' };
  if (b.platform === 'android') return { message: { token: b.token, data, android: { priority: 'HIGH', ttl: '3600s' } } };
  const collapse = (b.tag || '').slice(0, 64);
  return { message: { token: b.token, data: { tag: data.tag, url: data.url }, notification: { title: b.title, body: b.body || '' },
    apns: { headers: { 'apns-priority': '10', 'apns-expiration': String(Math.floor(Date.now() / 1000) + 3600), ...(collapse ? { 'apns-collapse-id': collapse } : {}) }, payload: { aps: { sound: 'default', ...(collapse ? { 'thread-id': collapse.split(':')[0] } : {}) } } } } };
}

// 以服務帳戶取得 OAuth 存取權杖（RS256 JWT），快取到到期前 1 分鐘
let cached = null;
export const resetToken = () => { cached = null; };
async function accessToken(sa, fetcher) {
  if (cached && cached.exp - 60e3 > Date.now() && cached.email === sa.client_email) return cached.token;
  const pem = String(sa.private_key).replace(/-----[^-]+-----/g, '').replace(/\s+/g, ''), der = Uint8Array.from(atob(pem), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('pkcs8', der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
  const now = Math.floor(Date.now() / 1000), aud = sa.token_uri || 'https://oauth2.googleapis.com/token';
  const unsigned = `${b64uText(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))}.${b64uText(JSON.stringify({ iss: sa.client_email, scope: FCM_SCOPE, aud, iat: now, exp: now + 3600 }))}`;
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
  const res = await fetcher(aud, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: `grant_type=${encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer')}&assertion=${unsigned}.${b64u(sig)}` });
  const j = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(`OAuth ${res.status}`);
  cached = { token: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000, email: sa.client_email };
  return cached.token;
}

export async function handle(request, env, fetcher = fetch) {
  const url = new URL(request.url);
  if (request.method === 'GET' && url.pathname === '/') return new Response('EquiLens push relay', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
  if (url.pathname !== '/v1/send') return json({ error: 'not found' }, 404);
  if (request.method !== 'POST') return json({ error: 'method not allowed' }, 405);
  if (Number(request.headers.get('content-length') || 0) > 8192) return json({ error: 'too large' }, 413);
  let b; try { b = JSON.parse(await request.text()); } catch { return json({ error: 'bad json' }, 400); }
  if (!validRequest(b)) return json({ error: 'bad request' }, 400);
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  if (limited(`ip:${ip}`, LIMITS.perIp) || limited(`t:${b.token}`, LIMITS.perToken)) return json({ error: 'rate limited' }, 429);
  let sa; try { sa = JSON.parse(env.FCM_SERVICE_ACCOUNT || ''); } catch { return json({ error: 'relay not configured' }, 503); }
  if (!sa?.project_id || !sa.client_email || !sa.private_key) return json({ error: 'relay not configured' }, 503);
  let token; try { token = await accessToken(sa, fetcher); } catch { return json({ error: 'auth failed' }, 502); }
  const res = await fetcher(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(sa.project_id)}/messages:send`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(fcmMessage(b)) });
  if (res.ok) return json({ ok: true });
  const err = await res.json().catch(() => ({})), code = (err?.error?.details || []).map(d => d.errorCode).find(Boolean) || err?.error?.status || '';
  if (res.status === 404 || ['UNREGISTERED', 'SENDER_ID_MISMATCH'].includes(code)) return json({ error: 'gone', code }, 404);
  if (res.status === 401) cached = null;
  return json({ error: 'fcm error', code, status: res.status }, res.status === 429 ? 429 : 502);
}

export default { fetch: (request, env) => handle(request, env) };
