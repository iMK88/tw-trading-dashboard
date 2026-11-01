// 當沖盤前資料的合併與 FinMind 備援。
// 主要來源一律是免金鑰的交易所開放資料：上市用證交所（twseDayTradePrep），上櫃用櫃買中心（tpexDayTrade 可當沖標的＋tpexPrep 三項）。
// 交易所資料延遲（到了 fallbackAt 仍有項目未取得）且有 FinMind Sponsor 時，才以 FinMind 補上缺的項目：
//   可當沖標的：FinMind 只有上市名單，只能補上市；暫停交易、暫停先賣後買：取聯集；參考價：只補交易所沒給的代號。
// 輸出與 daytrade-prep.json 相同：{ eligible, tpex, suspended, sellFirstOff, ref, missing, fallback, errors }

// 需要備援的項目（'twse:eligible'、'tpex:ref' 這樣的鍵，方便顯示與測試）
export function missingItems({ listed, otcList, otc }) {
  return [
    ...(listed ? (listed.missing || []).map(k => `twse:${k}`) : ['twse:eligible', 'twse:suspended', 'twse:sellFirstOff', 'twse:ref']),
    ...(otcList ? [] : ['tpex:eligible']),
    ...(otc ? (otc.missing || []).map(k => `tpex:${k}`) : ['tpex:suspended', 'tpex:sellFirstOff', 'tpex:ref']),
  ];
}
// FinMind 能補的項目（上櫃可當沖標的 FinMind 沒有）
export const finmindCovers = key => key !== 'tpex:eligible';
// 是否該呼叫 FinMind：有缺項、FinMind 能補、已到備援時間
export const needFallback = (missing, minute, fallbackAt) => minute >= fallbackAt && missing.some(finmindCovers);

export function combinePrep({ listed = null, otcList = null, otc = null, fin = null }) {
  const missing = missingItems({ listed, otcList, otc });
  const union = (...l) => [...new Set(l.flat().filter(Boolean))];
  let eligible = listed?.eligible || otcList?.eligible ? union(listed?.eligible || [], otcList?.eligible || []) : null;
  let suspended = union(listed?.suspended || [], otc?.suspended || []), sellFirstOff = union(listed?.sellFirstOff || [], otcList?.sellFirstOff || [], otc?.sellFirstOff || []);
  const ref = { ...(otc?.ref || {}), ...(listed?.ref || {}) };
  const filled = [];
  if (fin) {
    // FinMind 個別資料集失敗時，該項會是空陣列並記在 errors，不能當作「已補上」
    const ok = ds => !(fin.errors || []).some(e => String(e).startsWith(ds));
    if (missing.includes('twse:eligible') && fin.eligible?.length) { eligible = union(eligible || [], fin.eligible); filled.push('twse:eligible'); }
    if (missing.some(k => /:suspended$/.test(k)) && fin.suspended && ok('TaiwanStockSuspended')) { suspended = union(suspended, fin.suspended); filled.push(...missing.filter(k => /:suspended$/.test(k))); }
    if (missing.some(k => /:sellFirstOff$/.test(k)) && fin.sellFirstOff && ok('TaiwanStockDayTradingSuspension')) { sellFirstOff = union(sellFirstOff, fin.sellFirstOff); filled.push(...missing.filter(k => /:sellFirstOff$/.test(k))); }
    if (missing.some(k => /:ref$/.test(k)) && fin.ref && Object.keys(fin.ref).length) { for (const [id, v] of Object.entries(fin.ref)) if (!(id in ref)) ref[id] = v; filled.push(...missing.filter(k => /:ref$/.test(k))); }
  }
  return {
    eligible, tpex: otcList ? otcList.eligible.length : null, suspended, sellFirstOff, ref,
    missing: missing.filter(k => !filled.includes(k)), fallback: filled.length ? filled : null,
    errors: [...(listed?.errors || []), ...(otc?.errors || []), ...(fin?.errors || [])],
  };
}
