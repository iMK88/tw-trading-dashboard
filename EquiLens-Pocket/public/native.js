// 衡析 Pocket：商店版 App（Android／iOS 原生殼）的橋接。網頁在 App 內執行時，推播、存圖、螢幕恆亮與切換伺服器改由 App 處理。
// 網頁 → App：Android 為 window.EquiLensAndroid.postMessage(json)，iOS 為 window.webkit.messageHandlers.equilens.postMessage(json)，
// 內容 { id, method, args }；App → 網頁：window.__equilensReply(id, ok, value) 回覆，window.__equilensEvent(name, data) 通知事件。
const W = typeof window !== 'undefined' ? window : {};
const A = W.EquiLensAndroid || null, I = W.webkit?.messageHandlers?.equilens || null;
export const APP = !!(A || I);
export const APP_PLATFORM = A ? 'android' : I ? 'ios' : '';
let seq = 0, info = null;
const waits = new Map(), listeners = new Map();
if (APP) {
  W.__equilensReply = (id, ok, value) => { const w = waits.get(id); if (!w) return; waits.delete(id); clearTimeout(w.timer); ok ? w.resolve(value) : w.reject(new Error(value || '操作失敗')); };
  W.__equilensEvent = (name, data) => { for (const fn of listeners.get(name) || []) try { fn(data); } catch { } };
}
// 呼叫 App 的功能，回傳 Promise
export function appCall(method, args = {}, timeout = 60000) {
  if (!APP) return Promise.reject(new Error('只有在衡析 App 中可用'));
  const id = ++seq;
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { waits.delete(id); reject(new Error('App 沒有回應')); }, timeout);
    waits.set(id, { resolve, reject, timer });
    const msg = JSON.stringify({ id, method, args });
    try { A ? A.postMessage(msg) : I.postMessage(msg); } catch (e) { waits.delete(id); clearTimeout(timer); reject(e); }
  });
}
export function onAppEvent(name, fn) { if (!listeners.has(name)) listeners.set(name, new Set()); listeners.get(name).add(fn); }
// App 資訊：{ platform, version, server, demo, relay, pushAvailable }
export async function appInfo() { if (!APP) return null; if (!info) info = await appCall('info', {}, 10000).catch(() => ({})); return info; }

if (APP) {
  // 圖卡存檔（save-image.js 是電腦版與手機版共用的檔案，透過這個掛鉤交給 App 存到相簿或開分享選單）
  W.__equilensSaveImage = async (blob, name) => {
    const data = await new Promise((resolve, reject) => { const r = new FileReader(); r.onload = () => resolve(r.result); r.onerror = () => reject(new Error('圖片讀取失敗')); r.readAsDataURL(blob); });
    return appCall('saveImage', { name, data });
  };
  // 點通知開啟：同一個伺服器的頁面只切換分頁
  onAppEvent('open', d => { try { const u = new URL(d?.url || '/', location.href); if (u.origin === location.origin && u.hash && u.hash !== location.hash) location.hash = u.hash; } catch { } });
}
