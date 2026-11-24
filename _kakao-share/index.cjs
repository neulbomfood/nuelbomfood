const { onRequest } = require('firebase-functions/v2/https');
const { onDocumentCreated } = require('firebase-functions/v2/firestore');
const { defineSecret, defineInt } = require('firebase-functions/params');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, FieldValue } = require('firebase-admin/firestore');
const { receiveDelivery, creditDelivery } = require('./rewards.cjs');

initializeApp();
const db = getFirestore();
const adminKey = defineSecret('KAKAO_PRIMARY_ADMIN_KEY');
const template = defineInt('KAKAO_SHARE_TEMPLATE_ID');
const region = 'asia-northeast3';

exports.kakaoShareWebhook = onRequest({ region, invoker: 'public', secrets: [adminKey] }, async (req, res) => {
  if (req.method !== 'POST') { res.set('Allow', 'POST').status(405).end(); return; }
  const result = receiveDelivery({ authorization: req.get('authorization'),
    resource: req.get('x-kakao-resource-id'), body: req.body }, { adminKey: adminKey.value(), templateId: template.value() });
  if (result.delivery) {
    try {
      // Acknowledge after one durable write. Wallet processing can finish after Kakao's timeout.
      await db.collection('kakaoShareDeliveries').doc(result.id).create(result.delivery);
    } catch (error) {
      if (error.code !== 6 && error.code !== 'already-exists') { res.status(503).end(); return; }
    }
  }
  res.status(result.status).end();
});

exports.creditKakaoShare = onDocumentCreated({
  document: 'kakaoShareDeliveries/{eventId}', region, secrets: [adminKey], retry: true
}, async event => {
  await creditDelivery(db, event.params.eventId, event.data?.data(), adminKey.value(), () => FieldValue.serverTimestamp());
});
