// 玉山證券行情 API（台股，玉山證券帳戶免費；開發者權限：WebSocket 300 訂閱數／2 連線、盤中 REST 與快照每分鐘 600 次）。
// 玉山行情與富果行情是同一套 API（https://api.fugle.tw/marketdata/v1.0/stock，路徑、欄位、WebSocket 協定都相同），
// 差別只在驗證：先用玉山官方行情 SDK 以設定檔＋.p12 憑證登入，換取行情 token，之後 REST 送 X-SDK-TOKEN 標頭、
// WebSocket 以 { event: 'auth', data: { sdkToken } } 驗證。因此這個資料源沿用 fugle.mjs 的所有功能，只替換驗證方式。
//
// 登入由 tools/esun-token.py 執行（Python 行情 SDK esun_marketdata）：只呼叫登入與取得行情 token，不使用任何下單或帳務功能。
// 「金鑰」欄位存的是玉山設定檔（config.ini）的完整路徑；登入密碼與憑證密碼由玉山 SDK 存在系統鑰匙圈，衡析不經手。
// 第一次使用前請在終端機執行：python3 EquiLens-Nexus/tools/esun-token.py /路徑/config.ini --setup
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import fugle, { PLANS } from './fugle.mjs';
import { DataError, fetchJSON } from './common.mjs';

const LABEL = '玉山證券行情';
const BASE = 'https://api.fugle.tw/marketdata/v1.0/stock';
export const SCRIPT = fileURLToPath(new URL('../../tools/esun-token.py', import.meta.url));
// 用哪個 Python 執行（需已安裝 esun_marketdata）；預設 python3，可用環境變數 ESUN_PYTHON 指定完整路徑
const python = () => process.env.ESUN_PYTHON || 'python3';
// token 效期沒有公開說明：保守地每 6 小時重新登入一次；收到 401／403 或推播驗證失敗時立即重新登入
export const TOKEN_TTL = 6 * 3600e3;
const FORCE_GAP = 60e3; // 強制重新登入至少間隔 1 分鐘，避免驗證失敗時連續登入

const HELPER_ERRORS = {
  'config-not-found': '找不到玉山設定檔，請確認路徑',
  'config-invalid': '玉山設定檔格式錯誤（缺少 [User] Account）',
  'password-missing': '鑰匙圈中沒有玉山登入密碼或憑證密碼，請先在終端機執行一次 esun-token.py --setup',
  'keyring-unavailable': '無法讀取系統鑰匙圈',
  'sdk-missing': '找不到玉山行情 SDK（esun_marketdata），請先以 pip 安裝玉山提供的 .whl；或以 ESUN_PYTHON 指定已安裝的 Python',
  'login-failed': '玉山證券登入失敗，請確認憑證、金鑰、IP 白名單與密碼',
  'token-failed': '玉山證券登入成功，但無法取得行情 token',
};

// 執行登入小程式並解析最後一行 JSON；stdin 關閉，絕不等待輸入
export function runHelper(configPath, { cmd = python(), script = SCRIPT, timeout = 60000, spawnFn = spawn } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnFn(cmd, [script, configPath], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); }
    catch { return reject(new DataError('{label}：無法執行 Python', { label: LABEL })); }
    let out = '', done = false;
    const finish = (fn, v) => { if (done) return; done = true; clearTimeout(timer); fn(v); };
    const timer = setTimeout(() => { child.kill?.(); finish(reject, new DataError('{label}：登入逾時', { label: LABEL })); }, timeout);
    child.stdout?.setEncoding?.('utf8'); child.stdout?.on('data', c => { out += c; });
    child.stderr?.resume?.();
    child.on('error', () => finish(reject, new DataError('{label}：無法執行 Python', { label: LABEL })));
    child.on('close', () => {
      let r = null; try { r = JSON.parse(out.trim().split('\n').at(-1) || 'null'); } catch { }
      if (r?.ok && r.token) return finish(resolve, r);
      const msg = HELPER_ERRORS[r?.error] || '玉山證券登入失敗';
      // 設定檔格式錯誤時附上結構上的原因（區段／欄位名稱，不含設定值）
      const detail = r?.error === 'config-invalid' && r.detail ? String(r.detail).slice(0, 200) : '';
      finish(reject, new DataError(detail ? msg + '（{detail}）' : msg, detail ? { detail } : null, { code: 'auth' }));
    });
  });
}

let state = { token: '', at: 0, path: '', forcedAt: 0 }, pending = null, helper = runHelper;
export function _setHelper(fn) { helper = fn || runHelper; state = { token: '', at: 0, path: '', forcedAt: 0 }; pending = null; } // 測試用
export async function esunToken(configPath, { force = false } = {}) {
  if (!configPath) throw new DataError('{label}：尚未設定玉山設定檔路徑', { label: LABEL }, { code: 'auth' });
  const fresh = state.token && state.path === configPath && Date.now() - state.at < TOKEN_TTL;
  if (fresh && (!force || Date.now() - state.forcedAt < FORCE_GAP)) return state.token;
  if (pending) return pending;
  if (force) state.forcedAt = Date.now();
  pending = helper(configPath).then(r => { state = { ...state, token: r.token, at: Date.now(), path: configPath }; return r.token; }).finally(() => { pending = null; });
  return pending;
}
export const currentToken = () => state.token;

// 以 token 執行富果相同的功能；token 被拒時重新登入一次再試
const withToken = fn => async (...args) => {
  const ctx = args.at(-1) || {}, rest = args.slice(0, -1);
  const run = async force => fn(...rest, { ...ctx, headers: { 'X-SDK-TOKEN': await esunToken(ctx.key, { force }) }, label: LABEL });
  try { return await run(false); }
  catch (e) { if (e?.code === 'auth') return run(true); throw e; }
};
const WRAP = ['streamHistory', 'quoteDetail', 'indexDetail', 'indexDaily', 'streamBackfill', 'streamTrades', 'snapshot', 'intraday', 'daily'];

export default {
  ...fugle,
  ...Object.fromEntries(WRAP.map(k => [k, withToken(fugle[k])])),
  id: 'esun', name: '玉山證券行情', site: 'https://www.esunsec.com.tw/trading-platforms/api-trading/', docs: 'https://www.esunsec.com.tw/trading-platforms/api-trading/docs/market-data/intro/',
  key: 'required', keyEnv: 'ESUN_CONFIG',
  // 金鑰欄位填設定檔路徑（不得含空白）
  keyHint: '玉山設定檔 config.ini 的完整路徑',
  stream: { ...fugle.stream, auth: () => ({ event: 'auth', data: { sdkToken: state.token } }) },
  // 推播連線前確保 token 有效；推播驗證失敗時重新登入
  async prepareStream(configPath, { authFailed = false } = {}) { await esunToken(configPath, { force: authFailed }); },
  async validate(configPath) {
    if (typeof configPath !== 'string' || !/\.ini$/i.test(configPath) || !fs.existsSync(configPath)) throw new DataError('找不到玉山設定檔，請確認路徑');
    const token = await esunToken(configPath, { force: true }), headers = { 'X-SDK-TOKEN': token };
    const r = await fetchJSON(`${BASE}/intraday/quote/2330`, { headers, label: LABEL });
    if (!r.ok) throw new DataError('玉山證券行情未接受此帳戶的 token');
    // 快照需開發者以上權限（完成模擬下單）；試一次就知道
    const s = await fetchJSON(`${BASE}/snapshot/quotes/TSE?type=COMMONSTOCK`, { headers, label: LABEL });
    return { plan: s.ok ? 'developer+' : 'basic', tier: s.ok ? 'paid' : 'free', streamLimit: s.ok ? PLANS.developer.limit : PLANS.basic.limit };
  },
};
