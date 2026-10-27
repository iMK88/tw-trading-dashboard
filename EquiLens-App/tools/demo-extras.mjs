// 示意模式的合成內容：錄製時不連外網，焦點頁的新聞與本周大事紀改用這裡的示意資料。
// 標題都加上「【示意】」，連結指向衡析的功能說明，不冒用真實新聞。
// 用法：record-demo.mjs 錄完後呼叫；只想更新這部分時執行 node tools/demo-extras.mjs（直接改寫 web/demo/demo-api.json）。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const DOC = 'https://github.com/wakin61043/tw-trading-dashboard/blob/main/docs/features/briefing.md';
const tw = (d, hm) => Date.parse(`${d}T${hm}:00+08:00`);

const NEWS = {
  0: [
    ['2026-10-16', '20:45', '台股', 'tw', true, '散熱族群量價齊揚，法人看好 AI 伺服器出貨旺季延續', '散熱模組與機殼廠第四季訂單能見度高，市場關注液冷滲透率。', ['3017', '3324', '2421'], []],
    ['2026-10-16', '19:10', '台股', 'tw', false, '外資連 3 日回補權值股，台積電與鴻海獲加碼', '三大法人合計買超逾 200 億元，外資現貨與期貨同步偏多。', ['2330', '2317'], []],
    ['2026-10-16', '17:30', '國際', 'global', false, '亞洲股市普遍收高，市場等待美國零售銷售數據', '日經與韓股走揚，市場關注今晚公布的美國消費數據。', [], []],
    ['2026-10-16', '16:05', '台股', 'tw', false, '網通廠法說會釋出樂觀展望，800G 交換器需求升溫', '業者表示雲端客戶擴大資本支出，明年產品組合持續優化。', ['2345', '5388'], []],
    ['2026-10-16', '15:20', '美股', 'us', true, '台積電 ADR 盤前走高，晶圓代工報價調整受關注', '市場預期先進製程產能維持吃緊，帶動半導體類股情緒。', ['2330'], [{ code: 'TSM', name: '台積電 ADR' }]],
    ['2026-10-16', '14:40', '原物料・匯率', 'commodity', false, '新台幣收盤升值 1 角，熱錢回流帶動匯價走強', '外資匯入增加，央行盤中未明顯進場調節。', [], []],
    ['2026-10-16', '14:05', '台股', 'tw', false, '重電族群漲多拉回，華城、中興電量縮整理', '電網強韌計畫標案陸續開出，中長期需求仍在。', ['1519', '1513'], []],
  ],
  1: [
    ['2026-10-16', '05:40', '美股', 'us', true, '費半指數收高 1.8%，AI 晶片股領漲', 'AI 伺服器供應鏈財報優於預期，帶動半導體類股走強。', [], [{ code: 'NVDA', name: '輝達' }, { code: 'AVGO', name: '博通' }]],
    ['2026-10-15', '21:15', '國際', 'global', false, '美國 CPI 年增率符合預期，市場維持年底降息預期', '核心通膨小幅回落，美債殖利率走低。', [], []],
    ['2026-10-15', '18:30', '台股', 'tw', false, 'PCB 族群營收創高，高階載板需求回溫', 'AI 加速卡帶動 ABF 與高層數板出貨增加。', ['2368', '3037', '8046'], []],
    ['2026-10-15', '15:50', '台股', 'tw', false, '金融股前三季獲利成長，配息題材升溫', '壽險與銀行獲利同步改善，市場關注明年股利政策。', ['2881', '2882'], []],
  ],
};

const MACRO = [
  ['2026-10-13', '17:00', 'EUR', 'Medium', 'ZEW Economic Sentiment', 'ZEW 經濟景氣指數', '12.5', '10.3'],
  ['2026-10-14', '09:30', 'CNY', 'Medium', 'CPI y/y', null, '0.2%', '0.1%'],
  ['2026-10-15', '20:30', 'USD', 'High', 'CPI m/m', null, '0.3%', '0.4%'],
  ['2026-10-15', '20:30', 'USD', 'High', 'Core CPI m/m', null, '0.3%', '0.3%'],
  ['2026-10-16', '20:30', 'USD', 'High', 'Retail Sales m/m', null, '0.4%', '0.6%'],
  ['2026-10-16', '20:30', 'USD', 'Medium', 'Unemployment Claims', null, '225K', '231K'],
  ['2026-10-17', '22:00', 'USD', 'Medium', 'Prelim UoM Consumer Sentiment', null, '56.8', '55.1'],
];
const ZH_MACRO = { 'CPI y/y': 'CPI（年增）', 'CPI m/m': 'CPI（月增）', 'Core CPI m/m': '核心 CPI（月增）', 'Retail Sales m/m': '零售銷售（月增）', 'Unemployment Claims': '初領失業救濟金人數', 'Prelim UoM Consumer Sentiment': '密大消費者信心初值' };
const COUNTRY = { USD: '美國', CNY: '中國', EUR: '歐元區', JPY: '日本' };
const EARNINGS = [
  ['2026-10-14', 'ASML', 'ASML Holding', '艾司摩爾', '盤前', '$5.40'],
  ['2026-10-15', 'TSM', 'Taiwan Semiconductor', '台積電 ADR', '盤前', '$2.65'],
  ['2026-10-15', 'NFLX', 'Netflix', '網飛', '盤後', '$6.10'],
  ['2026-10-16', 'TXN', 'Texas Instruments', '德州儀器', '盤後', '$1.48'],
];

export function briefingExtras(entries) {
  const set = (k, v) => { entries[k] = { s: 200, b: JSON.stringify(v) }; };
  for (const offset of [0, 1]) {
    const key = `m/api/briefing/news?offset=${offset}`, old = entries[key] && JSON.parse(entries[key].b);
    if (!old?.window) continue;
    const items = NEWS[offset].map(([d, hm, category, section, must, title, summary, ids, us], i) => ({
      id: `demo-${offset}-${i}`, title: `【示意】${title}`, summary, category, section, must, time: tw(d, hm), url: DOC, tw: ids, us,
    })).sort((a, b) => b.must - a.must || b.time - a.time);
    const { error, ...rest } = old;
    set(key, { ...rest, items, complete: !old.window.inProgress });
    if (offset === 0) set('m/api/briefing/news', { ...rest, items, complete: !old.window.inProgress });
  }
  const week = entries['m/api/briefing/week'] && JSON.parse(entries['m/api/briefing/week'].b);
  if (week?.range) {
    const macro = MACRO.map(([d, hm, country, impact, titleEn, zh, forecast, previous]) => {
      const time = tw(d, hm);
      return { type: 'macro', time, date: d, country, countryName: COUNTRY[country], impact, holiday: false, title: zh || ZH_MACRO[titleEn] || titleEn, titleEn, forecast, previous };
    });
    const earnings = EARNINGS.map(([date, symbol, name, zh, timing, eps]) => ({ type: 'earnings', date, symbol, name, cap: null, timing, eps, zh, tech: true }));
    const { errors, ...rest } = week;
    set('m/api/briefing/week', { ...rest, macro, earnings, errors: [] });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'web', 'demo', 'demo-api.json');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  briefingExtras(data.entries);
  data.entries = Object.fromEntries(Object.keys(data.entries).sort().map(k => [k, data.entries[k]]));
  fs.writeFileSync(file, JSON.stringify(data));
  console.log('demo extras applied', file);
}
