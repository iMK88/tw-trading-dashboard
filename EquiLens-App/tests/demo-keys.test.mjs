import test from 'node:test';
import assert from 'node:assert/strict';
import { demoKeys } from '../tools/demo-keys.mjs';

// 這些例子也寫在 Android／iOS 的回放程式註解中，三處的結果必須相同
test('demo lookup keys: exact (without volatile params), then id params only, then path', () => {
  assert.deepEqual(demoKeys('m/api/summary'), ['m/api/summary']);
  assert.deepEqual(demoKeys('m/api/alerts', '?since=12'), ['m/api/alerts']);
  assert.deepEqual(demoKeys('m/api/heatmap', 'date=2026-10-16'), ['m/api/heatmap?date=2026-10-16', 'm/api/heatmap']);
  assert.deepEqual(demoKeys('m/api/intraday', 'id=2330&group=semi'), ['m/api/intraday?group=semi&id=2330', 'm/api/intraday?id=2330']);
  assert.deepEqual(demoKeys('m/api/pattern', 'pid=p1&id=3324'), ['m/api/pattern?id=3324&pid=p1']);
  assert.deepEqual(demoKeys('m/api/chart', 'period=5m&id=2330'), ['m/api/chart?id=2330&period=5m'], '5 分 K 沒有錄到時不拿日 K 代替');
  assert.deepEqual(demoKeys('m/api/intraday', 'id=2330&group=semi&since=3'), ['m/api/intraday?group=semi&id=2330', 'm/api/intraday?id=2330']);
  assert.deepEqual(demoKeys('m/api/chipwatch/branches', 'q=%E5%87%B1%E5%9F%BA'), ['m/api/chipwatch/branches?q=凱基', 'm/api/chipwatch/branches']);
});
