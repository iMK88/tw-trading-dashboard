import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { handle, fcmMessage, validRequest, resetLimits, resetToken } from '../worker.mjs';

// 假的 Firebase 服務帳戶（只在測試中產生），用來驗證 OAuth JWT 簽章
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const SA = { project_id: 'equilens-test', client_email: 'relay@equilens-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }), token_uri: 'https://oauth2.googleapis.com/token' };
const env = { FCM_SERVICE_ACCOUNT: JSON.stringify(SA) };
const TOKEN = 'fcm-token:' + 'x'.repeat(150);
const req = (body, { method = 'POST', ip = '1.2.3.4', path = '/v1/send' } = {}) => new Request('https://relay.example.workers.dev' + path, { method, headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip }, body: method === 'POST' ? JSON.stringify(body) : undefined });
function fakeGoogle({ fcmStatus = 200, fcmBody = { name: 'projects/x/messages/1' } } = {}) {
  const calls = [];
  const fetcher = async (url, opt) => {
    calls.push({ url, opt });
    if (url === SA.token_uri) return new Response(JSON.stringify({ access_token: 'ya29.test', expires_in: 3600 }), { status: 200 });
    return new Response(JSON.stringify(fcmBody), { status: fcmStatus });
  };
  return { calls, fetcher };
}

test('android and ios messages: android data-only, ios APNs alert with collapse id', () => {
  const a = fcmMessage({ token: TOKEN, platform: 'android', title: '🚀 台積電 急拉', body: '+2.1%', tag: 'surge-up:2330', url: '/#live' }).message;
  assert.deepEqual(a.data, { title: '🚀 台積電 急拉', body: '+2.1%', tag: 'surge-up:2330', url: '/#live' }); assert.equal(a.notification, undefined); assert.equal(a.android.priority, 'HIGH');
  const i = fcmMessage({ token: TOKEN, platform: 'ios', title: '📰 AI 盤後日報', body: '電子股領漲', tag: 'report', url: '/#brief' }).message;
  assert.deepEqual(i.notification, { title: '📰 AI 盤後日報', body: '電子股領漲' }); assert.equal(i.apns.headers['apns-collapse-id'], 'report'); assert.equal(i.apns.payload.aps.sound, 'default'); assert.equal(i.data.url, '/#brief');
  assert.equal(validRequest({ token: TOKEN, platform: 'web', title: 'x' }), false); assert.equal(validRequest({ token: 'short', platform: 'ios', title: 'x' }), false);
  assert.equal(validRequest({ token: TOKEN, platform: 'ios', title: 'x'.repeat(201) }), false);
});

test('send: signs a service-account JWT, caches the access token and posts to FCM v1', async () => {
  resetLimits(); resetToken();
  const g = fakeGoogle();
  let r = await handle(req({ token: TOKEN, platform: 'android', title: 't', body: 'b', tag: 'x', url: '/#live' }), env, g.fetcher);
  assert.equal(r.status, 200);
  const oauth = g.calls[0], form = new URLSearchParams(oauth.opt.body), [h, p, s] = form.get('assertion').split('.');
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const claims = JSON.parse(Buffer.from(p, 'base64url'));
  assert.equal(claims.iss, SA.client_email); assert.equal(claims.scope, 'https://www.googleapis.com/auth/firebase.messaging'); assert.equal(claims.aud, SA.token_uri);
  assert.ok(crypto.verify('sha256', Buffer.from(`${h}.${p}`), publicKey, Buffer.from(s, 'base64url')), 'RS256 signature');
  assert.equal(g.calls[1].url, 'https://fcm.googleapis.com/v1/projects/equilens-test/messages:send'); assert.equal(g.calls[1].opt.headers.authorization, 'Bearer ya29.test');
  assert.equal(JSON.parse(g.calls[1].opt.body).message.token, TOKEN);
  r = await handle(req({ token: TOKEN, platform: 'ios', title: 't' }), env, g.fetcher);
  assert.equal(r.status, 200); assert.equal(g.calls.filter(c => c.url === SA.token_uri).length, 1, 'access token reused');
});

test('errors: unregistered token → 404, bad input → 400, unconfigured → 503, rate limits → 429', async () => {
  resetLimits(); resetToken();
  const gone = fakeGoogle({ fcmStatus: 404, fcmBody: { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } } });
  assert.equal((await handle(req({ token: TOKEN, platform: 'android', title: 't' }), env, gone.fetcher)).status, 404);
  const mismatch = fakeGoogle({ fcmStatus: 403, fcmBody: { error: { status: 'PERMISSION_DENIED', details: [{ errorCode: 'SENDER_ID_MISMATCH' }] } } });
  assert.equal((await handle(req({ token: TOKEN, platform: 'android', title: 't' }), env, mismatch.fetcher)).status, 404);
  const down = fakeGoogle({ fcmStatus: 500, fcmBody: { error: { status: 'INTERNAL' } } });
  assert.equal((await handle(req({ token: TOKEN, platform: 'android', title: 't' }), env, down.fetcher)).status, 502);
  assert.equal((await handle(req({ token: TOKEN, platform: 'android' }), env, down.fetcher)).status, 400);
  assert.equal((await handle(req({ token: TOKEN, platform: 'android', title: 't' }), {}, down.fetcher)).status, 503);
  assert.equal((await handle(req(null, { method: 'GET', path: '/' }), env)).status, 200);
  assert.equal((await handle(req(null, { method: 'GET' }), env)).status, 405);
  resetLimits(); const ok = fakeGoogle(); const one = 'fcm-other:' + 'y'.repeat(150);
  const codes = []; for (let i = 0; i < 32; i++) codes.push((await handle(req({ token: one, platform: 'ios', title: 't' }, { ip: '9.9.9.9' }), env, ok.fetcher)).status);
  assert.equal(codes.filter(c => c === 200).length, 30); assert.equal(codes.at(-1), 429, 'per-token limit 30/min');
});
