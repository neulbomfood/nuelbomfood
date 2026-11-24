const test = require('node:test');
const assert = require('node:assert/strict');
const { createHash, randomBytes } = require('node:crypto');

test('HTTP delivery, durable retry receipt, and Firebase worker credit an existing wallet once', {
  skip: !process.env.FIRESTORE_EMULATOR_HOST
}, async () => {
  assert.match(process.env.FIRESTORE_EMULATOR_HOST, /^(localhost|127\.0\.0\.1):\d+$/);
  process.env.GCLOUD_PROJECT = 'demo-neulbom-share';
  process.env.KAKAO_PRIMARY_ADMIN_KEY = 'emulator-only';
  process.env.KAKAO_SHARE_TEMPLATE_ID = '901';
  const { kakaoShareWebhook, creditKakaoShare } = require('../index.cjs');
  const { getFirestore } = require('firebase-admin/firestore');
  const { deleteApp, getApp } = require('firebase-admin/app');
  const express = require('express');
  const app = express();
  app.use(express.json());
  app.all('/', kakaoShareWebhook);
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  const db = getFirestore();
  const hash = value => createHash('sha256').update(value).digest('hex');
  const proof = randomBytes(32).toString('hex');
  const id = 'user_' + Date.now() + '_http';
  const room = 'room-' + Date.now();
  const resource = randomBytes(16).toString('hex');
  const wallet = db.doc('users/' + id);
  const body = { wallet_id: id, wallet_proof: proof, CHAT_TYPE: 'DirectChat', HASH_CHAT_ID: room, TEMPLATE_ID: '901' };
  function post(auth, eventId, message) {
    return fetch('http://127.0.0.1:' + server.address().port, { method: 'POST', headers: {
      'Content-Type': 'application/json', Authorization: auth, 'X-Kakao-Resource-ID': eventId
    }, body: JSON.stringify(message) });
  }
  try {
    await wallet.create({ points: 0, pointSyncVersion: 1, kakaoShareProofHash: hash(proof) });
    assert.equal((await post('wrong', resource, body)).status, 401);
    assert.equal((await post('KakaoAK emulator-only', resource, { ...body, CHAT_TYPE: 'MemoChat' })).status, 204);
    const inbox = db.doc('kakaoShareDeliveries/' + hash(resource));
    assert.equal((await inbox.get()).exists, false);
    for (let i=0; i<2; i++) assert.equal((await post('KakaoAK emulator-only', resource, body)).status, 204);
    const snap = await inbox.get();
    assert.ok(snap.exists);
    assert.equal((await wallet.get()).data().points, 0);
    const event = { params: { eventId: snap.id }, data: snap };
    await creditKakaoShare.run(event);
    await creditKakaoShare.run(event);
    assert.equal((await wallet.get()).data().points, 500);
  } finally {
    await new Promise(resolve => server.close(resolve));
    await deleteApp(getApp());
  }
});
