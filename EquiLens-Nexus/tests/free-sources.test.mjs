// 免金鑰台股資料：集保股權分散表、期交所三大法人與選擇權行情、證交所三大法人金額，以及法人／期貨籌碼的資料來源選擇。
// 樣本取自 2026-10-30 各網站實際回應（只節錄需要的列）。
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTdccHolders } from '../lib/providers/tdcc.mjs';
import { parseFuturesInstitutional, parseOptionInstitutional, parseOptionDaily, taifexSupports } from '../lib/providers/taifex.mjs';
import { parseTwseTotalInstitutional, parseTwseDayTradeList, parseTwseSellFirstOff, parseTwseRefPrices, parseTwseSuspended, parseTpexSuspended, parseTpexSellFirstOff, parseTpexRefPrices, parseTpexDayTrade } from '../lib/providers/twse.mjs';
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

/* ---------- 當沖盤前資料（證交所、櫃買中心，2026-10-30／11-02 實際回應節錄） ---------- */
const B4U = date => ({ stat: 'OK', date, tables: [{ title: null, fields: null, data: [] }, { title: '115年11月02日 當日沖銷交易標的', fields: ['證券代號', '證券名稱', '暫停現股賣出後\n現款買進當沖註記'], data: [['00400A', '主動國泰動能高息', ''], ['2330', '台積電', ''], ['2603', '長榮', 'Y']] }] });
test('TWSE day-trade list (TWTB4U): eligible codes and sell-first marks, only for the requested date', () => {
  assert.deepEqual(parseTwseDayTradeList(B4U('20261102'), '2026-11-02'), { eligible: ['00400A', '2330', '2603'], sellFirstOff: ['2603'] });
  // 查 11/03 時證交所回 11/02 的名單：日期不符一律視為尚未公布
  assert.equal(parseTwseDayTradeList(B4U('20261102'), '2026-11-03'), null);
  assert.equal(parseTwseDayTradeList({ stat: 'OK', date: '20261031', tables: [{ title: '115年10月31日 當日沖銷交易標的', fields: ['證券代號'], data: [] }] }, '2026-10-31'), null);
});
test('TWSE sell-first suspension notice (TWTBAU1, top-level fields): ROC ranges inclusive of the end date', () => {
  const body = { stat: 'OK', title: '115年11月02日 暫停先賣後買當日沖銷交易標的預告表', fields: ['證券代號', '證券名稱', '停止先賣後買開始日', '停止先賣後買結束日', '原因'], data: [['00400A', '主動國泰動能高息', '115/11/03', '115/11/09', '分配收益'], ['00406A', '主動中信台灣收益', '115/10/29', '115/11/04', '分配收益'], ['006208', '富邦台50', '115/11/12', '115/11/18', '受益人大會']] };
  assert.deepEqual(parseTwseSellFirstOff(body, '2026-11-02'), ['00406A']);
  assert.deepEqual(parseTwseSellFirstOff(body, '2026-11-04'), ['00400A', '00406A']);
  assert.deepEqual(parseTwseSellFirstOff(body, '2026-11-05'), ['00400A']);
});
const T84U = date => ({ stat: 'OK', date, title: '115年11月02日 股價升降幅度', fields: ['證券代號', '證券名稱', '漲停價', '開盤競價基準', '跌停價', '開盤競價基準', '收盤價', '買進揭示價', '賣出揭示價', '最近成交日', '可否零股交易'], data: [['0050', '元大台灣50', '115.40', '104.95', '94.50', '107.25', '104.95', '104.90', '104.95', '115.10.30', '不可'], ['1101', '台泥', '31.15', '28.35', '25.55', '28.20', '28.35', '28.30', '28.35', '115.10.30', '不可'], ['2317', '鴻海', '270.00', '245.50', '221.00', '248.00', '245.50', '245.00', '245.50', '115.10.30', '不可'], ['2330', '台積電', '2,605.00', '2,370.00', '2,135.00', '2,415.00', '2,370.00', '2,365.00', '2,370.00', '115.10.30', '不可']] });
test('TWSE reference prices (TWT84U): first 開盤競價基準 column, common stocks only, date-checked', () => {
  assert.deepEqual(parseTwseRefPrices(T84U('20261102'), '2026-11-02'), { 1101: 28.35, 2317: 245.5, 2330: 2370 }); // 第二個同名欄（2,415）是前一日的基準
  assert.equal(parseTwseRefPrices(T84U('20261102'), '2026-11-03'), null);
  assert.equal(parseTwseRefPrices({ stat: '很抱歉，沒有符合條件的資料!' }, '2026-10-31'), null);
});
test('TWSE trading halts (TWTAWU): halted on or before the date and not yet resumed; empty period is an empty list', () => {
  const body = { stat: 'OK', title: '暫停交易證券', fields: ['編號', '證券代號', '證券名稱', '暫停交易日期', '暫停交易時間', '恢復交易日期', '恢復交易時間'], data: [[1, '030089', '貿聯統一56購04', '115/06/10', '8:00', '115/06/11', '8:00'], [381, '1218', '泰山', '115/08/13', '8:00', '115/08/14', '8:00'], [384, '2072', '世紀風電', '115/06/25', '8:00', '', '']] };
  assert.deepEqual(parseTwseSuspended(body, '2026-08-13'), ['1218', '2072']); // 權證略過；恢復日當天已可交易
  assert.deepEqual(parseTwseSuspended(body, '2026-08-14'), ['2072']);
  assert.deepEqual(parseTwseSuspended({ stat: '很抱歉，沒有符合條件的資料!' }, '2026-10-30'), []);
});
test('TPEx day-trade prep: halts from paired suspend/resume rows, sell-first notice, next-day reference prices', () => {
  const halts = [{ Date: '115', Serial: '1', SecuritiesCompanyCode: '1788', CompanyName: '杏昌', DateOfSuspendedTrading: '1150618', TimeOfSuspendedTrading: '080000', DateOfResumedTrading: '', TimeOfResumedTrading: '' }, { Date: '115', Serial: '2', SecuritiesCompanyCode: '1788', CompanyName: '杏昌', DateOfSuspendedTrading: '', TimeOfSuspendedTrading: '', DateOfResumedTrading: '1150622', TimeOfResumedTrading: '080000' }];
  assert.deepEqual(parseTpexSuspended(halts, '2026-06-19'), ['1788']);
  assert.deepEqual(parseTpexSuspended(halts, '2026-06-22'), []);
  assert.deepEqual(parseTpexSuspended(halts, '2026-06-17'), []);
  const pre = [{ Date: '1151029', SecuritiesCompanyCode: '00950B', CompanyName: '凱基A級公司債   ', FirstDayToSuspendSellThenBuy: '1151029', DayOfReinstatingSellThenBuy: '1151105', Reason: '分配收益' }];
  assert.deepEqual(parseTpexSellFirstOff(pre, '2026-11-04'), ['00950B']);
  assert.deepEqual(parseTpexSellFirstOff(pre, '2026-11-05'), []); // 恢復日當天已恢復
  const quotes = { stat: 'ok', date: '20261030', tables: [{ title: '上櫃股票行情', fields: ['代號', '名稱', '收盤', '漲跌', '開盤', '最高', '最低', '均價', '成交股數', '成交金額(元)', '成交筆數', '最後買價', '最後買量(張數)', '最後賣價', '最後賣量(張數)', '發行股數', '次日 參考價', '次日 漲停價', '次日 跌停價'], data: [['006201', '元大富櫃50', '40.80', '-2.24 ', '40.30', '41.09', '40.10', '40.53', '517,298', '20,966,771', '700', '40.79', '2', '40.80', '20', '24,446,000', '40.80', '44.88', '36.72'], ['6488', '環球晶', '756.00', '-58.00 ', '775.00', '779.00', '741.00', '755.83', '9,849,934', '7,444,909,918', '38,250', '756.00', '6', '757.00', '59', '528,113,725', '756.00', '831.00', '681.00'], ['8299', '群聯', '1930.00', '-120.00 ', '1960.00', '1970.00', '1900.00', '1938.32', '3,098,085', '6,005,089,385', '13,877', '1930.00', '19', '1935.00', '10', '221,383,247', '1930.00', '2120.00', '1740.00']] }] };
  assert.deepEqual(parseTpexRefPrices(quotes, '2026-10-30'), { 6488: 756, 8299: 1930 }); // 11/02 的參考價 = 10/30 行情的「次日 參考價」
  assert.equal(parseTpexRefPrices({ stat: 'ok', date: '20261031', tables: [{ title: '上櫃股票行情', fields: quotes.tables[0].fields, data: [] }] }, '2026-10-31'), null);
  assert.equal(parseTpexRefPrices(quotes, '2026-11-02'), null); // 行情日期必須是前一個交易日
  assert.deepEqual(parseTpexDayTrade({ stat: 'ok', date: '20261102', tables: [{ title: '現股當沖交易標的', fields: ['證券代號', '證券名稱', '暫停現股賣出後現款買進當沖註記'], data: [['6488', '環球晶', ''], ['8299', '群聯', 'Y']] }] }), { eligible: ['6488', '8299'], sellFirstOff: ['8299'] });
});
