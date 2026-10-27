// 截圖與商店版 App 示意模式共用的示意資料：當沖觀察名單（盤中才有內容）與大盤分時走勢（示意資料沒有指數分時資料）
const ctx = (d, h, vr, sup, res, obi, delta) => ({ ready: true, reasons: [], conditions: { breakout: vr >= 2, vwap: false, bid: false, weak: false }, daily: { long: d, count: 30, ma20: 0 }, hour: { long: h, count: 24, ma20: 0 }, five: { volumeRatio: vr, support: sup, resistance: res }, book: { obi, delta, age: 1.2 } });
// st：Nexus /api/state 的股票（Map：代號 → 股票），價格與均線取自示意資料
export function dayTradeScan(st) {
  const item = (id, name, _p, _c, _v, score, part, c, last, stop) => { const s = st.get(id), price = s.price, change = s.change, vwap = Math.round(price * 0.986 * 100) / 100;
    c.daily.ma20 = s.technical?.ma20 ?? null; c.hour.ma20 = Math.round(price * 0.975 * 100) / 100; c.five.support = Math.round(price * 0.985 * 10) / 10; c.five.resistance = Math.round(price * 0.996 * 10) / 10;
    return { id, name, price, change, vwap, vwapDist: 1.42, rvol: Math.round(c.five.volumeRatio * 1.3 * 100) / 100, obi: c.book.obi, outer5: 62, score, part, filters: [], context: c, reference: stop ? { stop: Math.round(price * 0.982) } : null, last, watch: true, scan: true }; };
  return {
    phaseName: '掃描中', market: { twse: { chg: 0.62, r15: 0.18, avg: 23102.3, vsAvg: 0.21, up: 612, down: 301, regime: 'tailwind', stale: false }, tpex: { chg: 0.48, r15: -0.06, avg: 261.4, vsAvg: 0.12, up: 455, down: 330, regime: 'neutral', stale: false } },
    feed: { window: true, connected: true, mode: 'full', subscribed: 132, expected: 132, connections: [1, 2] }, plan: 'advanced', plans: { advanced: { limit: 2000 } },
    prep: { eligible: 1612, disposition: 14, suspended: 3, sellFirstOff: 22, ref: 1980, errors: [] }, marketChange: 1.12, history: Array.from({ length: 43 }, () => ({ status: 'ready' })), total: 43, displayMin: 70, hidden: 31,
    top: [
      item('3017', '奇鋐', 1048, 4.28, 1031.6, 92, { daily: 20, hour: 25, five: 27, book: 20 }, ctx(true, true, 2.6, 1032, 1045, 0.42, 0.12), { type: 'dt-breakout', t: '09:42:18' }, 1029),
      item('6669', '緯穎', 2745, 3.58, 2721.4, 88, { daily: 20, hour: 25, five: 23, book: 20 }, ctx(true, true, 1.7, 2712, 2740, 0.36, 0.08), { type: 'dt-vwap', t: '10:26:09' }, 2705),
      item('2368', '金像電', 361.5, 2.12, 357.9, 81, { daily: 20, hour: 25, five: 21, book: 15 }, ctx(true, true, 1.5, 356, 361, 0.27, 0.04), null, null),
      item('3037', '欣興', 190.5, 1.88, 188.7, 76, { daily: 20, hour: 25, five: 18, book: 13 }, ctx(true, true, 1.3, 187.5, 190, 0.22, 0.03), null, null),
      item('2382', '廣達', 299.5, 1.01, 300.2, 72, { daily: 20, hour: 25, five: 14, book: 13 }, ctx(true, true, 1.1, 297.5, 301, 0.18, -0.02), null, null),
    ],
  };
}
// 大盤分時：從昨收平滑走到收盤價，量在開收盤較大
export function indexMinutes(ref, last) {
  const m = [], c = [], v = [];
  for (let t = 540; t <= 810; t++) { const k = (t - 540) / 270; m.push(t); c.push(Math.round((ref + (last - ref) * k + Math.sin(t / 9) * ref * .0012 + Math.sin(t / 37) * ref * .002) * 100) / 100); v.push(t < 560 || t > 790 ? 30 + t % 9 : 6 + t % 5); }
  c[c.length - 1] = last; return { m, c, v, vwap: m.map(() => null), group: m.map(() => null) };
}
