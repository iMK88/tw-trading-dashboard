// 免金鑰台股資料：集保股權分散表、期交所三大法人與選擇權行情、證交所三大法人金額，以及法人／期貨籌碼的資料來源選擇。
// 樣本取自 2026-10-30 各網站實際回應（只節錄需要的列）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTdccHolders } from '../lib/providers/tdcc.mjs';
import { parseFuturesInstitutional, parseOptionInstitutional, parseOptionDaily, taifexSupports } from '../lib/providers/taifex.mjs';
import { parseTwseTotalInstitutional } from '../lib/providers/twse.mjs';
import { holderMarketDay } from '../lib/chipwatch.mjs';
import { flowRequester, buildFlows, flowNames } from '../lib/flows.mjs';
import { buildOptions } from '../lib/options.mjs';

const TDCC = '﻿資料日期,證券代號,持股分級,人數,股數,占集保庫存數比例%\n' + [
  '20261030,000218,1,0,0,0.00', '20261030,00712 ,15,3,9000000,40.00',
  ...[[1, 2610784, 306416985, 1.18], [2, 469863, 897771913, 3.46], [3, 54468, 389274750, 1.50], [4, 17931, 219722860, 0.84], [5, 8385, 147387361, 0.56], [6, 8026, 196535634, 0.75], [7, 3719, 129131378, 0.49], [8, 2049, 92390131, 0.35], [9, 4156, 289719513, 1.11], [10, 2087, 292043503, 1.12], [11, 1321, 370357306, 1.42], [12, 581, 283700880, 1.09], [13, 342, 237299857, 0.91], [14, 219, 196660125, 0.75], [15, 1478, 21883958871, 84.38], [16, 1, 1000, 0.00], [17, 3185409, 25932370067, 100.00]]
    .map(([l, p, u, pct]) => `20261030,2330  ,${l},${p},${u},${pct.toFixed(2)}`),
].join('\r\n') + '\r\n';

test('TDCC shareholding CSV: BOM, padded codes, numeric levels → FinMind rows and big-holder summary', () => {
  const { date, rows } = parseTdccHolders(TDCC);
  assert.equal(date, '2026-10-30');
  assert.deepEqual([...new Set(rows.map(r => r.stock_id))], ['2330']); // ETF 與 6 碼代號略過，代號去掉空白
  assert.equal(rows.length, 17);
  const s = holderMarketDay(rows, date)['2330'];
  assert.equal(s[0], 84.38); // 千張大戶
  assert.equal(s[3], 3185409); // 股東人數取「合計」列
  assert.equal(s[4], 25932370067); // 集保總股數
  assert.equal(s[1], 87.13); // 400 張以上：第 12–15 級
});

const FUT = '日期,商品名稱,身份別,多方交易口數,多方交易契約金額(千元),空方交易口數,空方交易契約金額(千元),多空交易口數淨額,多空交易契約金額淨額(千元),多方未平倉口數,多方未平倉契約金額(千元),空方未平倉口數,空方未平倉契約金額(千元),多空未平倉口數淨額,多空未平倉契約金額淨額(千元)\r\n'
  + '2026/10/29,臺股期貨,外資及陸資,50000,1,50000,1,0,0,7000,1,96000,1,-89000,1\r\n'
  + '2026/10/30,臺股期貨,自營商,10424,94458619,10319,93702627,105,755992,6106,55360824,4370,39628863,1736,15731961\r\n'
  + '2026/10/30,臺股期貨,投信,2233,20241546,240,2174813,1993,18066733,92025,833746500,2814,25494840,89211,808251660\r\n'
  + '2026/10/30,臺股期貨,外資及陸資,61741,563174796,63521,578971872,-1780,-15797076,6528,59146319,98769,894942786,-92241,-835796467\r\n';
const OPTI = '日期,商品名稱,買賣權別,身份別,買方交易口數,買方交易契約金額(千元),賣方交易口數,賣方交易契約金額(千元),交易口數買賣淨額,交易契約金額買賣淨額(千元),買方未平倉口數,買方未平倉契約金額(千元),賣方未平倉口數,賣方未平倉契約金額(千元),未平倉口數買賣淨額,未平倉契約金額買賣淨額(千元)\r\n'
  + '2026/10/30,臺指選擇權,CALL,自營商,116320,1066092,124878,795034,-8558,271059,31802,775215,25379,408433,6423,366782\r\n'
  + '2026/10/30,臺指選擇權,CALL,外資及陸資,125368,672378,124716,616404,652,55974,16177,332432,13713,328078,2464,4354\r\n'
  + '2026/10/30,臺指選擇權,PUT,自營商,100000,986738,109900,1052463,-9900,-65726,18183,846924,18832,551827,-649,295097\r\n'
  + '2026/10/30,臺指選擇權,PUT,外資及陸資,135930,963005,141902,994828,-5972,-31823,10753,1205908,8427,1082277,2326,123631\r\n';
const OPTD = '交易日期,契約,到期月份(週別),履約價,買賣權,開盤價,最高價,最低價,收盤價,成交量,結算價,未沖銷契約數,最後最佳買價,最後最佳賣價,歷史最高價,歷史最低價,是否因訊息面暫停交易,交易時段,漲跌價,漲跌%,契約到期日,\r\n'
  + '2026/10/30,TXO,202611  ,43000.0000,買權,2600,2880,2600,2880,2,2710,3,0.2,2820,4700,2600,,一般,-910,-24.01%,20261118\r\n'
  + '2026/10/30,TXO,202611  ,43000.0000,買權,-,-,-,-,0,-,-,0.2,-,4700,3470,,盤後,-,-,20261118\r\n'
  + '2026/10/30,TXO,202611  ,43000.0000,賣權,499,600,379,430,1075,430,853,383,435,1050,97,,一般,214,99.07%,20261118\r\n'
  + '2026/10/30,TXO,202610F5,41400.0000,賣權,0.2,0.2,0.1,0.2,7,0.1,218,-,0.6,13,0.1,,一般,-0.4,-66.67%,20261030\r\n';

test('TAIFEX CSV → FinMind institutional futures/options and option daily rows', () => {
  const fut = parseFuturesInstitutional(FUT, 'TX');
  assert.equal(fut.length, 4);
  const f = fut.find(r => r.date === '2026-10-30' && r.institutional_investors === '外資');
  assert.equal(f.futures_id, 'TX'); assert.equal(f.long_open_interest_balance_volume, 6528); assert.equal(f.short_open_interest_balance_volume, 98769);
  const opt = parseOptionInstitutional(OPTI, 'TXO');
  assert.deepEqual(opt.map(r => [r.call_put, r.institutional_investors]), [['買權', '自營商'], ['買權', '外資'], ['賣權', '自營商'], ['賣權', '外資']]);
  const daily = parseOptionDaily(OPTD, 'TXO');
  assert.equal(daily[0].contract_date, '202611'); assert.equal(daily[0].strike_price, 43000); assert.equal(daily[0].call_put, 'call'); assert.equal(daily[0].trading_session, 'position'); assert.equal(daily[0].open_interest, 3);
  assert.equal(daily[1].trading_session, 'after_market'); assert.equal(daily[1].open_interest, null);
  // options.mjs 直接使用：一般時段、月選；週選 F 代號不列入
  const o = buildOptions('2026-10-30', opt, daily);
  assert.equal(o.positions.find(p => p.investor === '外資' && p.side === '買權').net, 2464);
  assert.deepEqual(o.contracts.map(c => c.contract), ['202611']);
  assert.deepEqual(o.contracts[0].strikes, [{ strike: 43000, call: 3, put: 853, callChange: null, putChange: null }]);
  assert.ok(taifexSupports('TaiwanFuturesInstitutionalInvestors', { data_id: 'TX' }));
  assert.ok(!taifexSupports('TaiwanFuturesInstitutionalInvestors', { data_id: 'MTX' }));
});

test('TWSE BFI82U → FinMind total institutional rows', () => {
  const body = { stat: 'OK', data: [['自營商(自行買賣)', '9,031,429,661', '12,871,788,307', '-3,840,358,646'], ['自營商(避險)', '32,728,302,266', '80,257,041,536', '-47,528,739,270'], ['投信', '36,336,431,234', '12,717,634,927', '23,618,796,307'], ['外資及陸資(不含外資自營商)', '340,478,117,346', '452,945,367,240', '-112,467,249,894'], ['外資自營商', '0', '0', '0'], ['合計', '418,574,280,507', '558,791,832,010', '-140,217,551,503']] };
  const rows = parseTwseTotalInstitutional(body, '2026-10-30');
  assert.equal(rows.length, 6);
  const n = flowNames(rows);
  assert.equal(n.foreign, -112467249894); assert.equal(n.trust, 23618796307); assert.equal(n.dealer, -3840358646 - 47528739270);
  assert.deepEqual(parseTwseTotalInstitutional({ stat: '很抱歉，沒有符合條件的資料!' }, '2026-10-30'), []);
});

test('flow requester: derivatives prefer TAIFEX with FinMind fallback; without FinMind stock data uses the local universe', async () => {
  const calls = [];
  const fm = async (dataset, params) => { calls.push(dataset); return [{ from: 'finmind' }]; };
  const origFetch = globalThis.fetch;
  globalThis.fetch = async () => { throw new Error('offline'); };
  try {
    // 期交所失敗 → 改用 FinMind
    assert.deepEqual(await flowRequester({ fm })('TaiwanFuturesInstitutionalInvestors', { data_id: 'TX', start_date: '2026-10-01', end_date: '2026-10-30' }), [{ from: 'finmind' }]);
    assert.deepEqual(calls, ['TaiwanFuturesInstitutionalInvestors']);
    // 期交所不支援的資料集直接用 FinMind
    await flowRequester({ fm })('TaiwanStockInfo', {}); assert.equal(calls.at(-1), 'TaiwanStockInfo');
    // 沒有 FinMind：期交所失敗時回報錯誤；股票清單改用本機清單
    await assert.rejects(flowRequester({})('TaiwanOptionDaily', { data_id: 'TXO', start_date: '2026-10-23', end_date: '2026-10-30' }));
    const info = await flowRequester({ universe: [{ id: '2330', name: '台積電', sector: '半導體業', market: '上市' }, { id: '5371', name: '中光電', sector: '光電業', market: '上櫃' }] })('TaiwanStockInfo', {});
    const r = buildFlows('2026-10-30', { info, stocks: [{ date: '2026-10-30', stock_id: '5371', name: 'Foreign_Investor', buy: 3000, sell: 1000 }] });
    assert.equal(r.coverage.indexed, 2); assert.equal(r.rankings.find(x => x.id === 'tpex-foreign').buy[0].id, '5371');
  } finally { globalThis.fetch = origFetch; }
});
