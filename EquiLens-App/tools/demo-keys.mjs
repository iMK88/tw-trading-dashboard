// 示意模式的 API 回應查詢鍵：錄製工具（record-demo.mjs）與 App 內的回放用同一套規則
// （Android DemoServer.kt、iOS DemoServer.swift 各有一份相同邏輯，修改時三處一起改，並跑 tests/demo-keys.test.mjs）。
// 依序嘗試：完整鍵（排除每次不同的參數）→ 只含識別參數（股票代號、型態、K 線週期）的鍵 → 沒有識別參數時只用路徑。
export const VOLATILE = ['since', 'refresh', '_', 'v', 't'];
export const ID_PARAMS = ['id', 'pid', 'wid', 'i', 'period']; // period：5 分 K 與日 K 不能互相代替
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
// path：不含開頭的「/」，例如 m/api/stock；search：查詢字串（可含或不含「?」）
export function demoKeys(path, search = '') {
  const q = [...new URLSearchParams(search)].filter(([k]) => !VOLATILE.includes(k)).sort((a, b) => cmp(a[0], b[0]) || cmp(a[1], b[1]));
  const join = list => list.map(([k, v]) => `${k}=${v}`).join('&');
  const ids = q.filter(([k]) => ID_PARAMS.includes(k)), keys = [q.length ? `${path}?${join(q)}` : path];
  if (ids.length) keys.push(`${path}?${join(ids)}`); else if (q.length) keys.push(path);
  return [...new Set(keys)];
}
