// 期交所（TAIFEX）公開資料（台股期貨與選擇權，免金鑰）：三大法人臺股期貨（TX）未平倉、臺指選擇權（TXO）
// 買賣權分計，以及臺指選擇權每日行情（各履約價未沖銷契約數）。
// 使用可指定日期區間的下載端點（POST，CSV，MS950 編碼）：
//   futContractsDateDown（期貨契約，三大法人）、callsAndPutsDateDown（選擇權買賣權分計，三大法人）、optDataDown（選擇權每日行情）
// 一律轉成 FinMind 的列格式（TaiwanFuturesInstitutionalInvestors／TaiwanOptionInstitutionalInvestors／TaiwanOptionDaily），
// 讓 flows.mjs 與 options.mjs 不必修改。不支援的資料集回傳 null，由呼叫端改用其他資料源。
import { DataError, sleep, stopped, num } from './common.mjs';

const BASE = 'https://www.taifex.com.tw/cht/3/';
const LABEL = '期交所公開資料';
// 期交所的身分別 → FinMind 的 institutional_investors
const INVESTOR = { '外資及陸資': '外資', '外資': '外資', '投信': '投信', '自營商': '自營商' };
// FinMind 代號 → 期交所商品代號
const FUTURES = { TX: 'TXF' };
const OPTIONS = { TXO: 'TXO' };

const slash = d => d.replace(/-/g, '/');
const dash = d => { const m = /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/.exec(String(d).trim()); return m ? `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}` : null; };
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);

// CSV（第一列為表頭，表頭最後可能多一個逗號）→ 物件陣列，以表頭名稱取欄位
export function parseCsv(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/).filter(l => l.trim());
  if (!lines.length) return [];
  const head = lines[0].split(',').map(s => s.trim());
  return lines.slice(1).map(l => { const c = l.split(','); return Object.fromEntries(head.map((h, i) => [h, (c[i] ?? '').trim()])); }).filter(r => dash(r[head[0]]));
}
const value = v => num(v);

// 三大法人期貨（futContractsDateDown）→ TaiwanFuturesInstitutionalInvestors
export function parseFuturesInstitutional(text, futuresId) {
  return parseCsv(text).filter(r => INVESTOR[r['身份別']]).map(r => ({
    date: dash(r['日期']), futures_id: futuresId, name: futuresId, institutional_investors: INVESTOR[r['身份別']],
    long_deal_volume: value(r['多方交易口數']), long_deal_amount: value(r['多方交易契約金額(千元)']),
    short_deal_volume: value(r['空方交易口數']), short_deal_amount: value(r['空方交易契約金額(千元)']),
    long_open_interest_balance_volume: value(r['多方未平倉口數']), long_open_interest_balance_amount: value(r['多方未平倉契約金額(千元)']),
    short_open_interest_balance_volume: value(r['空方未平倉口數']), short_open_interest_balance_amount: value(r['空方未平倉契約金額(千元)']),
  }));
}
// 三大法人選擇權買賣權分計（callsAndPutsDateDown）→ TaiwanOptionInstitutionalInvestors（call_put 為「買權」「賣權」）
export function parseOptionInstitutional(text, optionId) {
  return parseCsv(text).filter(r => INVESTOR[r['身份別']] && /^(CALL|PUT)$/i.test(r['買賣權別'])).map(r => ({
    date: dash(r['日期']), option_id: optionId, name: optionId, call_put: /^CALL$/i.test(r['買賣權別']) ? '買權' : '賣權', institutional_investors: INVESTOR[r['身份別']],
    long_deal_volume: value(r['買方交易口數']), long_deal_amount: value(r['買方交易契約金額(千元)']),
    short_deal_volume: value(r['賣方交易口數']), short_deal_amount: value(r['賣方交易契約金額(千元)']),
    long_open_interest_balance_volume: value(r['買方未平倉口數']), long_open_interest_balance_amount: value(r['買方未平倉契約金額(千元)']),
    short_open_interest_balance_volume: value(r['賣方未平倉口數']), short_open_interest_balance_amount: value(r['賣方未平倉契約金額(千元)']),
  }));
}
// 選擇權每日行情（optDataDown）→ TaiwanOptionDaily；一般時段為 position、盤後為 after_market（盤後沒有未沖銷契約數）
export function parseOptionDaily(text, optionId) {
  return parseCsv(text).filter(r => r['契約'] === optionId && ['買權', '賣權'].includes(r['買賣權'])).map(r => ({
    date: dash(r['交易日期']), option_id: optionId, contract_date: r['到期月份(週別)'], strike_price: value(r['履約價']), call_put: r['買賣權'] === '買權' ? 'call' : 'put',
    open: value(r['開盤價']), max: value(r['最高價']), min: value(r['最低價']), close: value(r['收盤價']), volume: value(r['成交量']),
    settlement_price: value(r['結算價']), open_interest: value(r['未沖銷契約數']), trading_session: r['交易時段'] === '一般' ? 'position' : 'after_market',
  }));
}

let last = 0, tail = Promise.resolve();
async function post(page, form, { signal, interval = 2500, timeout = 60000 } = {}) {
  const previous = tail; let release; tail = new Promise(r => release = r); await previous;
  try {
    const wait = Math.max(0, last + interval - Date.now()); if (wait) await sleep(wait, signal);
    if (signal?.aborted) throw stopped();
    last = Date.now();
    let res;
    try { res = await fetch(BASE + page, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(form).toString(), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeout)]) : AbortSignal.timeout(timeout) }); }
    catch { if (signal?.aborted) throw stopped(); throw new DataError('{label} 連線失敗或逾時', { label: LABEL }); }
    if (!res.ok) throw new DataError('{label}：資料服務回應 {status}', { label: LABEL, status: res.status });
    return new TextDecoder('big5').decode(await res.arrayBuffer());
  } finally { release(); }
}
const span = params => ({ queryStartDate: slash(params.start_date), queryEndDate: slash(params.end_date || today()) });

// FinMind 資料集名稱與參數 → 期交所查詢；不支援時回傳 null
export async function taifexRequest(dataset, params = {}, opts = {}) {
  if (!params.start_date) return null;
  if (dataset === 'TaiwanFuturesInstitutionalInvestors' && FUTURES[params.data_id])
    return parseFuturesInstitutional(await post('futContractsDateDown', { ...span(params), commodityId: FUTURES[params.data_id] }, opts), params.data_id);
  if (dataset === 'TaiwanOptionInstitutionalInvestors' && OPTIONS[params.data_id])
    return parseOptionInstitutional(await post('callsAndPutsDateDown', { ...span(params), commodityId: OPTIONS[params.data_id] }, opts), params.data_id);
  if (dataset === 'TaiwanOptionDaily' && OPTIONS[params.data_id])
    return parseOptionDaily(await post('optDataDown', { down_type: '1', commodity_id: OPTIONS[params.data_id], ...span(params) }, { ...opts, timeout: 120000 }), params.data_id);
  return null;
}
export const taifexSupports = (dataset, params = {}) =>
  (dataset === 'TaiwanFuturesInstitutionalInvestors' && !!FUTURES[params.data_id]) || (['TaiwanOptionInstitutionalInvestors', 'TaiwanOptionDaily'].includes(dataset) && !!OPTIONS[params.data_id]);
