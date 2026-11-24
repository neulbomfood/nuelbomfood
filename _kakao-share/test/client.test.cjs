const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '../..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const script = fs.readFileSync(path.join(root, 'script.js'), 'utf8');
const loadClient = () => import('../../js/kakao-share.js');

test('unconfigured home keeps link copy, hides the reward button and does not load Kakao', async () => {
  const { installKakaoShare } = await loadClient();
  assert.match(html, /id="rewarded-kakao-share" hidden disabled/);
  assert.match(html, /id="kakao-share-guide" hidden/);
  assert.match(html, /카톡 공유하고 <strong>500P<\/strong> 받기/);
  const guide = html.match(/<details id="home-points-guide"[\s\S]*?<\/details>/)[0];
  assert.match(guide, /onclick="copyInstallLink\(\)"/);
  assert.doesNotMatch(html.replace(guide, ''), /onclick="copyInstallLink\(\)"/);
  installKakaoShare({ document: { querySelector: () => ({ content: '' }) } }, {});
});
test('copy only writes the existing install link, including manual fallback', async () => {
  const handler = script.slice(script.indexOf('async function copyInstallLink'), script.indexOf('function giveDailyVisitPoints'));
  const link = html.match(/id="app-install-link" href="([^"]+)"/)[1];
  const calls = [];
  const env = { navigator: { clipboard: { writeText: url => calls.push(url) } },
    document: { getElementById: () => ({ href: link }) }, showToast() {}, window: { prompt: (_,url) => calls.push(url) } };
  vm.runInNewContext(handler, env);
  await env.copyInstallLink();
  env.navigator.clipboard = null;
  await env.copyInstallLink();
  assert.deepEqual(calls, [link, link]);
});
test('share picker receives the registered wallet and template without awarding points on open', async () => {
  const { installKakaoShare } = await loadClient();
  const events = {}, bag = new Map(), messages = [];
  const walletId = 'user_1234567890123_abc';
  const button = { hidden: true, disabled: true, addEventListener: (name,fn) => events[name] = fn };
  const guide = { hidden: true }, status = {};
  const target = { crypto: require('node:crypto').webcrypto, navigator: {}, addEventListener() {}, clearTimeout() {}, setTimeout() {},
    localStorage: { getItem: key => bag.get(key), setItem: (key,value) => bag.set(key,value) },
    pointsManager: { userId: () => walletId, flushPending: async () => true },
    document: { readyState: 'complete', querySelector: name => ({ content: name.includes('javascript') ? 'a'.repeat(32) : '501' }),
      addEventListener() {}, getElementById: id => ({ 'rewarded-kakao-share': button, 'kakao-share-guide': guide, 'kakao-share-status': status })[id] },
    Kakao: { isInitialized: () => true, Share: { sendCustom: options => messages.push(options) } } };
  let saved;
  const services = { doc: (_, col, id) => id, onSnapshot() {}, runTransaction: async (_, fn) =>
    fn({ get: async () => ({ data: () => ({ pointSyncVersion: 1 }) }), update: (_, data) => { saved = data; } }) };
  installKakaoShare(target, services);
  for (let i = 0; i < 40 && !saved; i++) await new Promise(resolve => setTimeout(resolve, 5));
  assert.ok(saved?.kakaoShareProofHash);
  assert.equal(guide.hidden, false);
  events.click();
  assert.equal(messages.length, 1);
  assert.equal(messages[0].templateId, 501);
  assert.equal(messages[0].serverCallbackArgs.wallet_id, walletId);
  assert.equal(messages[0].pickerSettings.showSendToMe, false);
  assert.equal(bag.get('points'), undefined);
});
test('server credit is adopted once without a second local earn operation', async () => {
  const { watchShareBalance } = await loadClient();
  const bag = new Map([['points','100']]);
  let notify, readCount = 0, updates = 0;
  const target = { localStorage: { getItem: k => bag.get(k), setItem: (k,v) => bag.set(k,v) },
    navigator: {}, document: { hidden: false, addEventListener() {} }, addEventListener() {},
    clearTimeout, setTimeout, pointsManager: { userId: () => 'wallet', readBalance: () => Number(bag.get('points')),
      readQueue: () => [], refreshFromStorage: () => updates++ } };
  const row = { points: 600, kakaoShareRewardCount: 1 };
  watchShareBalance(target, { doc: () => 'wallet', onSnapshot: (_, options, fn) => { notify = fn; },
    getDocFromServer: async () => { readCount++;return { data: () => row }; } }, 'wallet');
  const snap = { metadata: { fromCache:false, hasPendingWrites:false }, data: () => row };
  notify(snap);
  await new Promise(resolve => setTimeout(resolve, 20));
  notify(snap);
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal(bag.get('points'), '600');
  assert.equal(readCount, 1);
  assert.equal(updates, 1);
});

test('returning from Kakao refreshes even when the live listener misses a delayed credit', async () => {
  const { watchShareBalance } = await loadClient();
  const bag = new Map([['points','100']]);
  const events = {};
  let timer, count = 0, reads = 0;
  const target = {
    localStorage: { getItem: key => bag.get(key), setItem: (key, value) => bag.set(key, value) },
    navigator: { onLine: true },
    document: { hidden: false, addEventListener(name, fn) { events[name] = fn; } },
    addEventListener(name, fn) { events[name] = fn; },
    setTimeout(fn) { timer = fn; return 1; }, clearTimeout() { timer = undefined; },
    pointsManager: { userId: () => 'wallet', readBalance: () => Number(bag.get('points')),
      readQueue: () => [], refreshFromStorage() {} }
  };
  const startChecking = watchShareBalance(target, { doc: () => 'wallet', onSnapshot() {},
    getDocFromServer: async () => {
      reads++;
      return { data: () => ({ points: 100 + 500 * count, kakaoShareRewardCount: count }) };
    } }, 'wallet');
  startChecking();
  target.document.hidden = true;
  await timer();
  assert.equal(reads, 0);
  target.document.hidden = false;
  events.visibilitychange();
  events.focus();
  await timer();
  assert.equal(bag.get('points'), '100');
  count = 1;
  await timer();
  assert.equal(bag.get('points'), '600');
  assert.equal(timer, undefined);
  count = 2;
  events.pageshow();
  await timer();
  assert.equal(bag.get('points'), '1100');
  assert.equal(reads, 3);
});
