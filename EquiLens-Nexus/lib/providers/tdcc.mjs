// 集保結算所開放資料（台股，免金鑰）：集保戶股權分散表（全市場，每週公布一次，只提供最新一週）。
// https://opendata.tdcc.com.tw/getOD.ashx?id=1-5 → CSV（UTF-8，有 BOM）：資料日期,證券代號,持股分級,人數,股數,占集保庫存數比例%
// 轉成 FinMind TaiwanStockHoldingSharesPer 的列格式，讓 insight.mjs 的 holderLevels 與大戶排行直接沿用：
//   { date, stock_id, HoldingSharesLevel, people, percent, unit }
// 沒有 FinMind Sponsor 時，大戶集中度排行改用這份資料；因為只有最新一週，1 週與 4 週變化要在本機累積 2 週、5 週後才有。
import { DataError, fetchJSON, num } from './common.mjs';

export const TDCC_URL = 'https://opendata.tdcc.com.tw/getOD.ashx?id=1-5';
const LABEL = '集保結算所開放資料';
// 持股分級 1–17 → FinMind 的級距文字（insight.mjs 的 levelLower 取第一個數字當下限；合計與差異數調整不計入級距）
export const TDCC_LEVELS = {
  1: '1-999', 2: '1,000-5,000', 3: '5,001-10,000', 4: '10,001-15,000', 5: '15,001-20,000', 6: '20,001-30,000', 7: '30,001-40,000', 8: '40,001-50,000',
  9: '50,001-100,000', 10: '100,001-200,000', 11: '200,001-400,000', 12: '400,001-600,000', 13: '600,001-800,000', 14: '800,001-1,000,000', 15: 'more than 1,000,001',
  16: '差異數調整（說明4）', 17: 'total',
};

// CSV 文字 → { date: 'YYYY-MM-DD', rows }；只保留上市櫃普通股（4 碼、首碼非 0），ETF 與權證等代號略過
export function parseTdccHolders(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  const rows = []; let date = null;
  for (const line of lines.slice(1)) {
    const c = line.split(','); if (c.length < 6) continue;
    const d = /^(\d{4})(\d{2})(\d{2})$/.exec(c[0].trim()); if (!d) continue;
    const id = c[1].trim(), level = TDCC_LEVELS[Number(c[2])];
    if (!/^[1-9]\d{3}$/.test(id) || !level) continue;
    const day = `${d[1]}-${d[2]}-${d[3]}`; if (!date || day > date) date = day;
    rows.push({ date: day, stock_id: id, HoldingSharesLevel: level, people: num(c[3]) ?? 0, unit: num(c[4]) ?? 0, percent: num(c[5]) ?? 0 });
  }
  return { date, rows: rows.filter(r => r.date === date) };
}

export async function fetchTdccHolders({ signal } = {}) {
  const r = await fetchJSON(TDCC_URL, { signal, label: LABEL, timeout: 90000, text: true });
  if (!r.ok || !r.body) throw new DataError('{label}：資料服務回應 {status}', { label: LABEL, status: r.status });
  const out = parseTdccHolders(r.body);
  if (!out.date || !out.rows.length) throw new DataError('{label}：資料欄位格式錯誤', { label: LABEL });
  return out;
}
