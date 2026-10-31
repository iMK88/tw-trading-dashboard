// 玉山證券行情：登入小程式的呼叫與錯誤對照、token 快取與重新登入、以 X-SDK-TOKEN 呼叫與富果相同的行情 API、推播驗證訊息。
import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import esun, { runHelper, esunToken, _setHelper, currentToken, TOKEN_TTL } from '../lib/providers/esun.mjs';
import fugle from '../lib/providers/fugle.mjs';
import { PROVIDERS } from '../lib/providers/index.mjs';

// 假的子程序：輸出指定的 stdout 後結束
const fakeSpawn = (stdout, record = {}) => (cmd, args, opts) => {
  Object.assign(record, { cmd, args, opts });
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough(); child.kill = () => { };
  setImmediate(() => { child.stdout.end(stdout); child.stderr.end(); child.emit('close', 0); });
  return child;
};

test('E.SUN helper: never waits for input, parses the last JSON line and maps errors', async () => {
  const rec = {};
  const r = await runHelper('/x/config.ini', { cmd: 'py', script: '/s.py', spawnFn: fakeSpawn('SDK log line\n{"ok":true,"token":"tok-1","rest":"https://api.fugle.tw/marketdata"}\n', rec) });
  assert.equal(r.token, 'tok-1');
  assert.deepEqual(rec.args, ['/s.py', '/x/config.ini']);
  assert.equal(rec.opts.stdio[0], 'ignore'); // stdin 關閉
  await assert.rejects(runHelper('/x/config.ini', { spawnFn: fakeSpawn('{"ok":false,"error":"password-missing"}\n') }), e => e.code === 'auth' && /--setup/.test(e.message));
  await assert.rejects(runHelper('/x/config.ini', { spawnFn: fakeSpawn('garbage') }), e => e.code === 'auth');
});

test('E.SUN token: cached per config file, forced refresh rate-limited', async () => {
  let n = 0; _setHelper(async () => ({ token: 't' + (++n) }));
  try {
    assert.equal(await esunToken('/a.ini'), 't1');
    assert.equal(await esunToken('/a.ini'), 't1'); // 快取
    assert.equal(await esunToken('/a.ini', { force: true }), 't2'); // 強制重新登入
    assert.equal(await esunToken('/a.ini', { force: true }), 't2'); // 1 分鐘內不重複強制登入
    assert.equal(await esunToken('/b.ini'), 't3'); // 換設定檔
    assert.equal(currentToken(), 't3');
    await assert.rejects(esunToken(''), e => e.code === 'auth');
    assert.ok(TOKEN_TTL >= 3600e3);
  } finally { _setHelper(null); }
});

test('E.SUN provider reuses Fugle market data with X-SDK-TOKEN and re-logs in once on 401', async () => {
  assert.equal(PROVIDERS.esun, esun);
  assert.deepEqual(esun.caps, fugle.caps);
  let n = 0; _setHelper(async () => ({ token: 'tok' + (++n) }));
  const seen = [], origFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    seen.push([String(url), init.headers]);
    const ok = init.headers['X-SDK-TOKEN'] === 'tok2';
    return new Response(JSON.stringify(ok ? { date: '2026-10-30', data: [{ symbol: '2330', closePrice: 1000, tradeVolume: 10, tradeValue: 10000000 }] } : { message: 'Unauthorized' }), { status: ok ? 200 : 401 });
  };
  try {
    const rows = await esun.snapshot([], { key: '/a.ini' });
    assert.ok(seen.every(([u]) => u.startsWith('https://api.fugle.tw/marketdata/v1.0/stock/snapshot/quotes/')));
    assert.ok(seen.every(([, h]) => !('X-API-KEY' in h)));
    assert.equal(seen[0][1]['X-SDK-TOKEN'], 'tok1'); // 第一次被拒 → 重新登入
    assert.equal(rows.length, 2); assert.equal(rows[0].stock_id, '2330');
  } finally { globalThis.fetch = origFetch; _setHelper(null); }
});

test('E.SUN stream authenticates with sdkToken; validate rejects a missing config file', async () => {
  _setHelper(async () => ({ token: 'ws-token' }));
  try {
    await esun.prepareStream('/a.ini');
    assert.deepEqual(esun.stream.auth('/a.ini'), { event: 'auth', data: { sdkToken: 'ws-token' } });
    assert.deepEqual(esun.stream.channels, fugle.stream.channels);
    await assert.rejects(esun.validate('/no/such/config.ini'), /找不到玉山設定檔/);
    await assert.rejects(esun.validate('not-a-path'), /找不到玉山設定檔/);
  } finally { _setHelper(null); }
});
