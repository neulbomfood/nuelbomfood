const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');
const { receiveDelivery, creditDelivery } = require('../rewards.cjs');

const key = 'local-only-test-key';
const proof = randomBytes(32).toString('hex');
const proofHash = createHash('sha256').update(proof).digest('hex');
const sender = 'user_' + Date.now() + '_abc';
const config = { adminKey: key, templateId: 501 };
function event(overrides = {}, resource = 'delivery') {
  return { authorization: 'KakaoAK ' + key, resource, body: { wallet_id: sender, wallet_proof: proof,
    CHAT_TYPE: 'DirectChat', HASH_CHAT_ID: 'room1', TEMPLATE_ID: '501', ...overrides } };
}
test('only authenticated, delivered messages for our template are eligible', () => {
  assert.equal(receiveDelivery({ ...event(), authorization: '' }, config).status, 401);
  assert.equal(receiveDelivery(event(), { ...config, adminKey: '' }).status, 401);
  assert.equal(receiveDelivery(event({}, ''), config).status, 400);
  for (const fields of [{ CHAT_TYPE: 'MemoChat' }, { CHAT_TYPE: 'Unknown' },
    { CHAT_TYPE: 'MultiChat', IS_SINGLE_CHATROOM: 'true' }, { IS_SINGLE_CHATROOM: true },
    { TEMPLATE_ID: 9 }, { wallet_id: '../bad' }, { wallet_proof: '' }, { HASH_CHAT_ID: '' }]) {
    assert.equal(receiveDelivery(event(fields), config).delivery, undefined);
  }
  for (const roomType of ['DirectChat', 'MultiChat', 'OpenDirectChat', 'OpenMultiChat']) {
    assert.ok(receiveDelivery(event({ CHAT_TYPE: roomType }), config).delivery);
  }
});
test('receipt follows wallet and room, delivery follows Kakao event, raw proof and room are not persisted', () => {
  const a = receiveDelivery(event(), config);
  const b = receiveDelivery(event({}, 'retry-as-new-event'), config);
  assert.equal(a.delivery.roomReceipt, b.delivery.roomReceipt);
  assert.notEqual(a.id, b.id);
  assert.notEqual(a.delivery.roomReceipt, receiveDelivery(event({ HASH_CHAT_ID: 'room2' }), config).delivery.roomReceipt);
  assert.notEqual(a.delivery.roomReceipt, receiveDelivery(event({ wallet_id: sender + 'b' }), config).delivery.roomReceipt);
  assert.ok(!JSON.stringify(a.delivery).includes(proof));
  assert.ok(!JSON.stringify(a.delivery).includes('room1'));
});
test('edited delivery and replay under a different ID cannot credit', async () => {
  const { id, delivery } = receiveDelivery(event(), config);
  assert.equal(await creditDelivery(null, 'other-id', delivery, key), 'ignored');
  assert.equal(await creditDelivery(null, id, { ...delivery, wallet: sender + 'z' }, key), 'ignored');
});
test('Firestore: concurrent and repeated deliveries, different rooms, independent wallets and ledger', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST
}, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(localhost|127\.0\.0\.1):\d+$/);
  const { initializeApp, deleteApp } = require('firebase-admin/app');
  const { getFirestore, FieldValue } = require('firebase-admin/firestore');
  const app = initializeApp({ projectId: 'demo-neulbom-share' }, 'share-test');
  const db = getFirestore(app);
  const wallet = db.doc('users/' + sender);
  const other = db.doc('users/' + sender + 'b');
  const initial = { points: 100, pointSyncVersion: 1, kakaoShareProofHash: proofHash };
  const apply = (fields, resource) => {
    const { id, delivery } = receiveDelivery(event(fields, resource), config);
    return creditDelivery(db, id, delivery, key, () => FieldValue.serverTimestamp());
  };
  try {
    await Promise.all([wallet.create(initial), other.create(initial)]);
    assert.equal(await apply({ wallet_proof: '1'.repeat(64) }, 'wrong-proof'), 'ignored');
    const results = await Promise.all([apply({}, 'same'), apply({}, 'same'), apply({}, 'other-event-same-room')]);
    assert.deepEqual(results.sort(), ['credited', 'duplicate', 'duplicate']);
    assert.equal(await apply({ HASH_CHAT_ID: 'second' }, 'another-room'), 'credited');
    assert.equal(await apply({ wallet_id: other.id }, 'another-wallet'), 'credited');
    const points = (await wallet.get()).data();
    assert.equal(points.points, 1100);
    assert.equal(points.kakaoShareRewardCount, 2);
    assert.equal((await other.get()).data().points, 600);
    const ledger = await db.collection('pointsHistory').where('userId', '==', sender).get();
    assert.equal(ledger.size, 2);
    assert.ok(ledger.docs.every(row => row.data().verified && row.data().points === 500));
    assert.deepEqual(ledger.docs.map(row => row.data().beforePoints).sort((a,b) => a-b), [100, 600]);
  } finally { await deleteApp(app); }
});
