// 證交所（TWSE）與櫃買中心（TPEx）官方開放資料（台股，免金鑰）：股票清單、休市日、全市場與個股日成交、
// 三大法人買賣超、本益比與股價淨值比、最新月營收。沒有盤中即時快照與分 K，盤中功能需搭配其他資料源。
// 兩個網站都會封鎖過於頻繁的請求，因此每次請求至少間隔 2.5 秒。
import { DataError, fetchJSON, num, rocDate, ymd, weekdays, addDays } from './common.mjs';
import { parseTwseWarrants, parseTpexWarrants } from '../warrants.mjs';

// 證交所／櫃買產業代碼
export const INDUSTRY = { '01': '水泥工業', '02': '食品工業', '03': '塑膠工業', '04': '紡織纖維', '05': '電機機械', '06': '電器電纜', '08': '玻璃陶瓷', '09': '造紙工業', '10': '鋼鐵工業', '11': '橡膠工業', '12': '汽車工業', '14': '建材營造業', '15': '航運業', '16': '觀光餐旅', '17': '金融保險業', '18': '貿易百貨業', '19': '綜合', '20': '其他業', '21': '化學工業', '22': '生技醫療業', '23': '油電燃氣業', '24': '半導體業', '25': '電腦及週邊設備業', '26': '光電業', '27': '通信網路業', '28': '電子零組件業', '29': '電子通路業', '30': '資訊服務業', '31': '其他電子業', '32': '文化創意業', '33': '農業科技業', '34': '電子商務', '35': '綠能環保', '36': '數位雲端', '37': '運動休閒', '38': '居家生活', '80': '管理股票', '91': '存託憑證' };
const COMMON = /^[1-9]\d{3}$/;
const LABEL = '證交所／櫃買開放資料';

let last = 0, tail = Promise.resolve();
async function get(url, { signal, interval = 2500 } = {}) {
  const previous = tail; let release; tail = new Promise(r => release = r); await previous;
  try {
    const wait = Math.max(0, last + interval - Date.now()); if (wait) await new Promise(r => setTimeout(r, wait));
    last = Date.now();
    const r = await fetchJSON(url, { signal, label: LABEL, timeout: 40000 });
    if (!r.ok || r.body == null) throw new DataError('{label}：資料服務回應 {status}', { label: LABEL, status: r.status });
    return r.body;
  } finally { release(); }
}
const rwdTable = (body, re) => (body?.tables || []).find(t => re.test(t.title || '')) || null;

// 處置有價證券（上市：證交所公告；上櫃：櫃買開放資料）：處置期間涵蓋 date 的股票代號。期間為民國日期
const roc = s => { const m = /^(\d{2,3})\/?(\d{2})\/?(\d{2})$/.exec(String(s).trim()); return m ? `${Number(m[1]) + 1911}-${m[2]}-${m[3]}` : null; };
const inPeriod = (period, date) => { const [a, b] = String(period || '').split(/[～~]/).map(roc); return !!a && a <= date && (!b || b >= date); };
export function parseTwseDisposition(body, date) {
  const f = body?.fields || [], code = f.indexOf('證券代號'), per = f.indexOf('處置起迄時間');
  return [...new Set((body?.data || []).filter(r => COMMON.test(String(r[code]).trim()) && inPeriod(r[per], date)).map(r => String(r[code]).trim()))];
}
export function parseTpexDisposition(list, date) {
  return [...new Set((Array.isArray(list) ? list : []).filter(r => COMMON.test(String(r.SecuritiesCompanyCode).trim()) && inPeriod(r.DispositionPeriod, date)).map(r => String(r.SecuritiesCompanyCode).trim()))];
}
// 上櫃現股當沖交易標的（櫃買中心，盤前公布）：可當沖代號，以及暫停先賣後買的代號
export function parseTpexDayTrade(body) {
  const t = (body?.tables || []).find(x => /當沖/.test(x.title || '')) || body?.tables?.[0]; if (!t?.data?.length) return null;
  const f = t.fields || [], code = Math.max(0, f.indexOf('證券代號')), mark = f.findIndex(x => /註記/.test(x));
  const rows = t.data.map(r => [String(r[code]).trim(), mark >= 0 ? String(r[mark] ?? '').trim() : '']).filter(([id]) => id);
  return { eligible: rows.map(r => r[0]), sellFirstOff: rows.filter(r => r[1]).map(r => r[0]) };
}
export async function tpexDayTrade(date, { signal } = {}) {
  const body = await get(`https://www.tpex.org.tw/www/zh-tw/intraday/list?date=${date.replace(/-/g, '%2F')}&response=json`, { signal });
  return sameDay(body, date) ? parseTpexDayTrade(body) : null; // 尚未公布：不拿其他日期的名單代替
}

/* ---------- 當沖盤前資料（免金鑰）：可當沖標的、暫停交易、暫停先賣後買、參考價 ---------- */
// 證交所與櫃買中心在指定日期尚未公布時，可能回傳最近一次的資料（例如查 11/03 回 11/02 的名單），
// 所以每一項都先核對回應的日期；日期不符時該項留空並記下原因，絕不拿舊資料當今天用。
const sameDay = (body, date) => String(body?.date || '') === ymd(date);
const rocIn = s => rocDate(String(s || '').replace(/\./g, '/'));
// 有些證交所回應把表格放在 tables，有些直接放在最外層（title／fields／data）
const rwdAny = (body, re) => rwdTable(body, re) || (Array.isArray(body?.fields) ? { title: body.title, fields: body.fields, data: body.data || [] } : null);
// 上市可當沖標的（TWTB4U，盤前公布；收盤後同一張表補上成交量值）
export function parseTwseDayTradeList(body, date) {
  if (!sameDay(body, date)) return null;
  const t = rwdTable(body, /當日沖銷交易標的/); if (!t?.data?.length) return null;
  const f = t.fields || [], code = Math.max(0, f.indexOf('證券代號')), mark = f.findIndex(x => /註記/.test(x));
  const rows = t.data.map(r => [String(r[code]).trim(), mark >= 0 ? String(r[mark] ?? '').trim() : '']).filter(([id]) => id);
  return { eligible: rows.map(r => r[0]), sellFirstOff: rows.filter(r => r[1]).map(r => r[0]) };
}
// 上市暫停先賣後買預告表（TWTBAU1，前一交易日 18:00 更新）：區間涵蓋 date 的代號
export function parseTwseSellFirstOff(body, date) {
  const t = rwdAny(body, /暫停先賣後買/); if (!t) return /沒有符合/.test(body?.stat || '') ? [] : null; // 沒有任何預告
  const f = t.fields || [], code = f.findIndex(x => /代號/.test(x)), a = f.findIndex(x => /開始日/.test(x)), b = f.findIndex(x => /結束日/.test(x));
  if (code < 0 || a < 0) return null;
  return [...new Set((t.data || []).filter(r => { const s = rocIn(r[a]), e = rocIn(r[b]); return s && s <= date && (!e || e >= date); }).map(r => String(r[code]).trim()))];
}
// 上市參考價（TWT84U 股價升降幅度，盤前公布）：第一個「開盤競價基準」欄是當日參考價（第二個同名欄是前一日的），只留普通股
export function parseTwseRefPrices(body, date) {
  if (!sameDay(body, date)) return null;
  const t = rwdAny(body, /升降幅度/); if (!t?.data?.length) return null;
  const f = t.fields || [], code = Math.max(0, f.indexOf('證券代號')), ref = f.indexOf('開盤競價基準');
  if (ref < 0) return null;
  const out = {};
  for (const r of t.data) { const id = String(r[code]).trim(), v = num(r[ref]); if (COMMON.test(id) && v > 0) out[id] = v; }
  return out;
}
// 暫停交易（上市 TWTAWU：暫停日期／恢復日期在同一列）：暫停日在 date 當天或之前、尚未恢復的代號
export function parseTwseSuspended(body, date) {
  const t = rwdAny(body, /暫停交易/);
  if (!t) return /沒有符合/.test(body?.stat || '') ? [] : null; // 期間內沒有暫停交易
  const f = t.fields || [], code = f.indexOf('證券代號'), a = f.indexOf('暫停交易日期'), b = f.indexOf('恢復交易日期');
  if (code < 0 || a < 0) return null;
  return [...new Set((t.data || []).filter(r => { const s = rocIn(r[a]), e = rocIn(r[b]); return s && s <= date && (!e || e > date); }).map(r => String(r[code]).trim()).filter(id => COMMON.test(id)))];
}
// 暫停交易（上櫃 tpex_spendi_history：暫停與恢復分成兩列）：依日期排序後，最後一個事件為暫停的代號
export function parseTpexSuspended(list, date) {
  const ev = new Map();
  for (const r of Array.isArray(list) ? list : []) {
    const id = String(r.SecuritiesCompanyCode || '').trim(); if (!COMMON.test(id)) continue;
    const s = rocDate(r.DateOfSuspendedTrading), e = rocDate(r.DateOfResumedTrading);
    if (!ev.has(id)) ev.set(id, []);
    if (s && s <= date) ev.get(id).push([s, 1]);
    if (e && e <= date) ev.get(id).push([e, 0]);
  }
  return [...ev].filter(([, l]) => l.sort((x, y) => x[0].localeCompare(y[0]) || x[1] - y[1]).at(-1)?.[1] === 1).map(([id]) => id);
}
// 上櫃暫停先賣後買預告表（tpex_intraday_trading_pre）：開始日 ≤ date < 恢復日
export function parseTpexSellFirstOff(list, date) {
  return [...new Set((Array.isArray(list) ? list : []).filter(r => { const s = rocDate(r.FirstDayToSuspendSellThenBuy), e = rocDate(r.DayOfReinstatingSellThenBuy); return s && s <= date && (!e || e > date); }).map(r => String(r.SecuritiesCompanyCode).trim()))];
}
// 上櫃參考價：前一交易日「上櫃股票行情」的「次日 參考價」（櫃買沒有單獨的升降幅度表）；body 須是 prev 那天的行情
export function parseTpexRefPrices(body, prev) {
  if (!sameDay(body, prev)) return null;
  const t = (body?.tables || []).find(x => /股票行情/.test(x.title || '')) || body?.tables?.[0]; if (!t?.data?.length) return null;
  const f = (t.fields || []).map(x => String(x).replace(/\s/g, '')), code = Math.max(0, f.indexOf('代號')), ref = f.indexOf('次日參考價');
  if (ref < 0) return null;
  const out = {};
  for (const r of t.data) { const id = String(r[code]).trim(), v = num(r[ref]); if (COMMON.test(id) && v > 0) out[id] = v; }
  return out;
}
// 上市四項（與 FinMind dayTradePrep 同形狀）；個別項目失敗或日期不符時留空並記下原因，其餘照用
export async function twseDayTradePrep(date, { signal } = {}) {
  const errors = [], d = ymd(date), until = date < ymdToday() ? d : ymd(ymdToday());
  const item = async (label, url, parse) => { try { const v = parse(await get(url, { signal }), date); if (v == null) errors.push(`${label}：尚未公布 ${date} 的資料`); return v; } catch (e) { errors.push(`${label}：${e.message}`); return null; } };
  const list = await item('證交所當沖標的', `https://www.twse.com.tw/rwd/zh/dayTrading/TWTB4U?date=${d}&response=json`, parseTwseDayTradeList);
  const suspended = await item('證交所暫停交易', `https://www.twse.com.tw/rwd/zh/afterTrading/TWTAWU?startDate=${ymd(addDays(date, -60))}&endDate=${until}&response=json`, parseTwseSuspended);
  const off = await item('證交所暫停先賣後買', 'https://www.twse.com.tw/rwd/zh/dayTrading/TWTBAU1?response=json', parseTwseSellFirstOff);
  const ref = await item('證交所參考價', `https://www.twse.com.tw/rwd/zh/variation/TWT84U?date=${d}&selectType=ALL&response=json`, parseTwseRefPrices);
  // missing：未取得的項目（由 lib/daytrade-prep.mjs 決定是否以 FinMind Sponsor 補上）
  const missing = [!list?.eligible?.length && 'eligible', suspended == null && 'suspended', off == null && 'sellFirstOff', !ref || !Object.keys(ref).length ? 'ref' : null].filter(Boolean);
  return { eligible: list?.eligible?.length ? list.eligible : null, suspended: suspended || [], sellFirstOff: [...new Set([...(list?.sellFirstOff || []), ...(off || [])])], ref: ref || {}, errors, missing };
}
const ymdToday = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
// 上櫃三項（可當沖標的另由 tpexDayTrade 取得）：暫停交易、暫停先賣後買預告、參考價（前一個交易日的「次日 參考價」）
export async function tpexPrep(date, { signal } = {}) {
  const errors = [], missing = [], out = { suspended: [], sellFirstOff: [], ref: {}, errors, missing };
  try { out.suspended = parseTpexSuspended(await get('https://www.tpex.org.tw/openapi/v1/tpex_spendi_history', { signal }), date); } catch (e) { errors.push(`櫃買暫停交易：${e.message}`); missing.push('suspended'); }
  try { out.sellFirstOff = parseTpexSellFirstOff(await get('https://www.tpex.org.tw/openapi/v1/tpex_intraday_trading_pre', { signal }), date); } catch (e) { errors.push(`櫃買暫停先賣後買：${e.message}`); missing.push('sellFirstOff'); }
  try {
    // 一定要是 date 的前一個交易日；那天的行情還沒公布時留空，不往前拿更舊的
    const prev = (await calendar(addDays(date, -20), { signal })).filter(d => d < date).at(-1);
    const ref = prev ? parseTpexRefPrices(await get(`https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=${tpexDate(prev)}&type=EW&response=json`, { signal }), prev) : null;
    if (ref) out.ref = ref; else { errors.push(`櫃買參考價：尚未公布 ${prev || date} 的行情`); missing.push('ref'); }
  } catch (e) { errors.push(`櫃買參考價：${e.message}`); missing.push('ref'); }
  return out;
}
export async function dispositions(date, { signal } = {}) {
  const from = addDays(date, -30).replace(/-/g, ''), to = date.replace(/-/g, ''), out = new Set(), errors = [];
  try { for (const id of parseTwseDisposition(await get(`https://www.twse.com.tw/rwd/zh/announcement/punish?response=json&startDate=${from}&endDate=${to}`, { signal }), date)) out.add(id); } catch (e) { errors.push(e.message); }
  try { for (const id of parseTpexDisposition(await get('https://www.tpex.org.tw/openapi/v1/tpex_disposal_information', { signal }), date)) out.add(id); } catch (e) { errors.push(e.message); }
  return { ids: [...out], errors };
}
const sign = (s, v) => /-|green/.test(String(s)) ? -Math.abs(v ?? 0) : Math.abs(v ?? 0);
const tpexDate = d => d.replace(/-/g, '%2F');

// 全市場單日行情（上市＋上櫃）→ 內部日成交格式
export function parseTwseDaily(body, date) {
  const t = rwdTable(body, /每日收盤行情/); if (!t) return [];
  return t.data.filter(r => COMMON.test(r[0])).map(r => ({ date, stock_id: r[0], Trading_Volume: num(r[2]), Trading_money: num(r[4]), open: num(r[5]), max: num(r[6]), min: num(r[7]), close: num(r[8]), spread: num(r[10]) == null ? null : sign(r[9], num(r[10])) })).filter(r => r.close > 0);
}
export function parseTpexDaily(body, date) {
  const t = (body?.tables || [])[0]; if (!t) return [];
  return t.data.filter(r => COMMON.test(r[0])).map(r => ({ date, stock_id: r[0], close: num(r[2]), spread: num(String(r[3]).trim()), open: num(r[4]), max: num(r[5]), min: num(r[6]), Trading_Volume: num(r[8]), Trading_money: num(r[9]) })).filter(r => r.close > 0);
}
// 三大法人（上市 T86：股數；上櫃：股數）→ FinMind 法人格式（每股一列一身分）
export function parseTwseInstitutional(body, date) {
  const out = [];
  for (const r of body?.data || []) {
    const id = String(r[0]).trim(); if (!COMMON.test(id)) continue;
    const add = (name, buy, sell) => out.push({ date, stock_id: id, name, buy: num(buy) ?? 0, sell: num(sell) ?? 0 });
    add('Foreign_Investor', r[2], r[3]); add('Foreign_Dealer_Self', r[5], r[6]); add('Investment_Trust', r[8], r[9]); add('Dealer_self', r[12], r[13]); add('Dealer_Hedging', r[15], r[16]);
  }
  return out;
}
export function parseTpexInstitutional(body, date) {
  const t = (body?.tables || [])[0], out = [];
  for (const r of t?.data || []) {
    const id = String(r[0]).trim(); if (!COMMON.test(id)) continue;
    const add = (name, buy, sell) => out.push({ date, stock_id: id, name, buy: num(buy) ?? 0, sell: num(sell) ?? 0 });
    // 欄位：外資及陸資(不含自營) 2-4、外資自營 5-7、外資合計 8-10、投信 11-13、自營自行 14-16、自營避險 17-19、自營合計 20-22、三大法人合計 23
    add('Foreign_Investor', r[2], r[3]); add('Foreign_Dealer_Self', r[5], r[6]); add('Investment_Trust', r[11], r[12]); add('Dealer_self', r[14], r[15]); add('Dealer_Hedging', r[17], r[18]);
  }
  return out;
}

async function universe(ctx) {
  const [l, o] = await Promise.all([get('https://openapi.twse.com.tw/v1/opendata/t187ap03_L', ctx), get('https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap03_O', ctx)]);
  const row = (id, name, code, market) => COMMON.test(id) && !['80', '91'].includes(code) ? { id, name: String(name).trim(), sector: INDUSTRY[code] || '未分類', market } : null;
  return [...l.map(r => row(String(r['公司代號']).trim(), r['公司簡稱'], r['產業別'], '上市')), ...o.map(r => row(String(r.SecuritiesCompanyCode).trim(), r.CompanyAbbreviation, r.SecuritiesIndustryCode, '上櫃'))].filter(Boolean).sort((a, b) => a.id.localeCompare(b.id));
}
// 交易日曆：平日扣除證交所公告的休市日（名稱含「開始交易」「最後交易」者是交易日）
async function calendar(from, ctx) {
  const today = new Date().toISOString().slice(0, 10), start = from || addDays(today, -400);
  let closed = new Set();
  try { const list = await get('https://openapi.twse.com.tw/v1/holidaySchedule/holidaySchedule', ctx); closed = new Set(list.filter(h => !/交易日/.test(h.Name)).map(h => rocDate(h.Date)).filter(Boolean)); } catch { }
  return weekdays(start, addDays(today, 30)).filter(d => !closed.has(d));
}
async function dailyAll(date, ctx) {
  const tw = await get(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${ymd(date)}&type=ALLBUT0999&response=json`, ctx);
  const tp = await get(`https://www.tpex.org.tw/www/zh-tw/afterTrading/dailyQuotes?date=${tpexDate(date)}&type=EW&response=json`, ctx);
  return [...parseTwseDaily(tw, date), ...parseTpexDaily(tp, date)];
}
// 認購權證收盤行情（權證追蹤用）：上市以證交所每日收盤行情 type=0999（認購權證，不含牛證），上櫃以櫃買權證收盤行情（只有最新一個交易日）。
// 回傳 { q: { 代號: [名稱, 收盤, 成交單位數, 成交金額, 標的?] }, sources: { twse, tpex }, errors }；任一邊失敗時另一邊照用
export async function callWarrantQuotes(date, { signal } = {}) {
  const q = {}, sources = { twse: 0, tpex: 0 }, errors = [];
  try { const r = parseTwseWarrants(await get(`https://www.twse.com.tw/rwd/zh/afterTrading/MI_INDEX?date=${ymd(date)}&type=0999&response=json`, { signal })); Object.assign(q, r); sources.twse = Object.keys(r).length; } catch (e) { errors.push(e.message); }
  try { const r = parseTpexWarrants(await get('https://www.tpex.org.tw/openapi/v1/tpex_warrant_daily_quts', { signal })); if (r.date === date) { Object.assign(q, r.q); sources.tpex = Object.keys(r.q).length; } else if (r.date) errors.push(`TPEx ${r.date}`); } catch (e) { errors.push(e.message); }
  return { q, sources, errors };
}
// 個股歷史：每月一次請求（上市 STOCK_DAY、上櫃 tradingStock）；先試上市，查無資料再試上櫃
async function daily(id, from, to, ctx) {
  const months = []; for (let d = from.slice(0, 7) + '-01'; d <= to; d = addDays(d, 32).slice(0, 7) + '-01') months.push(d);
  let otc = null, rows = [];
  for (const m of months) {
    if (otc !== true) {
      const b = await get(`https://www.twse.com.tw/rwd/zh/afterTrading/STOCK_DAY?date=${ymd(m)}&stockNo=${id}&response=json`, ctx);
      if (b.stat === 'OK' && b.data?.length) { otc = false; rows.push(...b.data.map(r => ({ date: rocDate(r[0]), stock_id: id, Trading_Volume: num(r[1]), Trading_money: num(r[2]), open: num(r[3]), max: num(r[4]), min: num(r[5]), close: num(r[6]), spread: num(r[7]) }))); continue; }
      if (otc === false) continue;
    }
    const b = await get(`https://www.tpex.org.tw/www/zh-tw/afterTrading/tradingStock?code=${id}&date=${tpexDate(m)}&response=json`, ctx), t = b?.tables?.[0];
    if (t?.data?.length) { otc = true; rows.push(...t.data.map(r => ({ date: rocDate(r[0]), stock_id: id, Trading_Volume: (num(r[1]) ?? 0) * 1000, Trading_money: (num(r[2]) ?? 0) * 1000, open: num(r[3]), max: num(r[4]), min: num(r[5]), close: num(r[6]), spread: num(r[7]) }))); }
  }
  const price = rows.filter(r => r.date && r.date >= from && r.date <= to && r.close > 0);
  return { price, adjusted: price, adjustedIsRaw: true };
}
async function institutionalAll(date, ctx) {
  const tw = await get(`https://www.twse.com.tw/rwd/zh/fund/T86?date=${ymd(date)}&selectType=ALLBUT0999&response=json`, ctx);
  const tp = await get(`https://www.tpex.org.tw/www/zh-tw/insti/dailyTrade?type=Daily&sect=EW&date=${tpexDate(date)}&response=json`, ctx);
  return [...parseTwseInstitutional(tw, date), ...parseTpexInstitutional(tp, date)];
}
// 三大法人買賣金額統計（上市，BFI82U，單位：元）→ FinMind TaiwanStockTotalInstitutionalInvestors 格式（name：Foreign_Investor 等，合計為 total）。
// 外資自營商已計入自營商，因此不納入合計（與證交所表格相同）
const TOTAL_NAMES = { '自營商(自行買賣)': 'Dealer_self', '自營商(避險)': 'Dealer_Hedging', '投信': 'Investment_Trust', '外資及陸資(不含外資自營商)': 'Foreign_Investor', '外資自營商': 'Foreign_Dealer_Self', '合計': 'total' };
export function parseTwseTotalInstitutional(body, date) {
  if (body?.stat !== 'OK') return [];
  return (body.data || []).map(r => ({ date, name: TOTAL_NAMES[String(r[0]).trim()], buy: num(r[1]) ?? 0, sell: num(r[2]) ?? 0 })).filter(r => r.name);
}
export async function totalInstitutional(date, ctx = {}) {
  return parseTwseTotalInstitutional(await get(`https://www.twse.com.tw/rwd/zh/fund/BFI82U?type=day&dayDate=${ymd(date)}&response=json`, ctx), date);
}
// 最新的本益比／殖利率／股價淨值比（上市＋上櫃全市場一次取回，個股查詢時快取共用）
let valuationCache = { at: 0, map: new Map() };
async function valuationMap(ctx) {
  if (Date.now() - valuationCache.at < 6 * 3600e3 && valuationCache.map.size) return valuationCache.map;
  const map = new Map();
  for (const r of await get('https://openapi.twse.com.tw/v1/exchangeReport/BWIBBU_ALL', ctx)) map.set(String(r.Code).trim(), { date: rocDate(r.Date), PER: num(r.PEratio), PBR: num(r.PBratio), dividend_yield: num(r.DividendYield) });
  for (const r of await get('https://www.tpex.org.tw/openapi/v1/tpex_mainboard_peratio_analysis', ctx)) map.set(String(r.SecuritiesCompanyCode).trim(), { date: rocDate(r.Date), PER: num(r.PriceEarningRatio), PBR: num(r.PriceBookRatio), dividend_yield: num(r.YieldRatio) });
  valuationCache = { at: Date.now(), map }; return map;
}
// 最新月營收（含去年同月）→ FinMind 月營收格式；長期執行後逐月累積，即可計算近 3 個月年增
let revenueCache = { at: 0, map: new Map() };
async function revenueMap(ctx) {
  if (Date.now() - revenueCache.at < 6 * 3600e3 && revenueCache.map.size) return revenueCache.map;
  const map = new Map();
  for (const url of ['https://openapi.twse.com.tw/v1/opendata/t187ap05_L', 'https://www.tpex.org.tw/openapi/v1/mopsfin_t187ap05_O']) {
    for (const r of await get(url, ctx)) {
      const id = String(r['公司代號']).trim(), ym = String(r['資料年月']), y = Number(ym.slice(0, -2)) + 1911, m = Number(ym.slice(-2)), date = rocDate(r['出表日期']);
      if (!COMMON.test(id) || !y || !m) continue;
      map.set(id, [{ date, stock_id: id, revenue_year: y - 1, revenue_month: m, revenue: (num(r['營業收入-去年當月營收']) ?? 0) * 1000, create_time: date, revenue_basis: '1m' }, { date, stock_id: id, revenue_year: y, revenue_month: m, revenue: (num(r['營業收入-當月營收']) ?? 0) * 1000, create_time: date, revenue_basis: '1m' }]);
    }
  }
  revenueCache = { at: Date.now(), map }; return map;
}

export default {
  id: 'twse', name: '證交所／櫃買中心 開放資料', site: 'https://openapi.twse.com.tw', docs: 'https://openapi.twse.com.tw', markets: ['TW'],
  key: 'none', interval: 2500,
  caps: { universe: 1, calendar: 1, daily: 1, dailyAll: 1, institutional: 'bulk', institutionalAll: 1, valuation: 1, revenue: 'monthly', dayTrade: 1 },
  universe, calendar, dailyAll, daily, institutionalAll,
  // 上市當沖盤前資料（上櫃另由 server 以 tpexDayTrade／tpexPrep 補上，不論哪個資料源提供上市部分）
  dayTrade: (date, ctx) => twseDayTradePrep(date, ctx),
  // 個股法人：以全市場單日資料組成（研究名單更新時批次取得，見 research.mjs）
  institutional: async () => { throw new DataError('{label}：法人資料需以全市場批次更新', { label: LABEL }); },
  valuation: async (id, from, to, ctx) => { const v = (await valuationMap(ctx)).get(id); return v ? [{ stock_id: id, ...v }] : []; },
  revenue: async (id, from, to, ctx) => (await revenueMap(ctx)).get(id) || [],
};
