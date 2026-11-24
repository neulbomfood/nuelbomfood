const { createHash, createHmac, timingSafeEqual } = require('node:crypto');
const amount = 500;
const eligibleRooms = new Set(['DirectChat', 'MultiChat', 'OpenDirectChat', 'OpenMultiChat']);
const hash = value => createHash('sha256').update(value).digest('hex');

function sameSecret(left, right) {
  return typeof left === 'string' && typeof right === 'string' &&
    timingSafeEqual(Buffer.from(hash(left), 'hex'), Buffer.from(hash(right), 'hex'));
}

function signature(id, delivery, key) {
  const { wallet, proofHash, roomReceipt } = delivery;
  return createHmac('sha256', key).update(JSON.stringify(['kakao-share-v1', id, wallet, proofHash, roomReceipt])).digest('hex');
}

function receiveDelivery({ authorization, resource, body }, { adminKey, templateId }) {
  if (!adminKey || !sameSecret(authorization, 'KakaoAK ' + adminKey)) return { status: 401 };
  if (!body || typeof body !== 'object' || typeof resource !== 'string' || !resource.length || resource.length > 512) return { status: 400 };
  if (!eligibleRooms.has(body.CHAT_TYPE) || body.IS_SINGLE_CHATROOM === true || body.IS_SINGLE_CHATROOM === 'true') return { status: 204 };
  if (!Number.isSafeInteger(templateId) || templateId <= 0 || String(body.TEMPLATE_ID) !== String(templateId)) return { status: 204 };
  const { wallet_id: wallet, wallet_proof: proof, HASH_CHAT_ID: room } = body;
  if (typeof wallet !== 'string' || !/^user_\d{10,15}_[a-z0-9]{1,12}$/.test(wallet) ||
      typeof proof !== 'string' || !/^[a-f0-9]{64}$/.test(proof) ||
      typeof room !== 'string' || !room.trim() || room.length > 512) return { status: 204 };
  const id = hash(resource);
  const delivery = { wallet, proofHash: hash(proof), roomReceipt: hash(JSON.stringify([wallet, room])) };
  return { status: 204, id, delivery: { ...delivery, signature: signature(id, delivery, adminKey) } };
}

async function creditDelivery(db, id, delivery, key, timestamp) {
  if (!delivery || !key || !sameSecret(delivery.signature, signature(id, delivery, key))) return 'ignored';
  const user = db.collection('users').doc(delivery.wallet);
  const receipt = db.collection('kakaoShareAwards').doc(delivery.roomReceipt);
  const history = db.collection('pointsHistory').doc('kakao_' + delivery.roomReceipt);
  return db.runTransaction(async tx => {
    const [account, award] = await tx.getAll(user, receipt);
    if (award.exists) return 'duplicate';
    const data = account.data();
    if (!data || data.pointSyncVersion !== 1 || !sameSecret(data.kakaoShareProofHash, delivery.proofHash)) return 'ignored';
    const beforePoints = data.points;
    const count = data.kakaoShareRewardCount ?? 0;
    if (!Number.isSafeInteger(beforePoints) || beforePoints < 0 || !Number.isSafeInteger(beforePoints + amount) ||
        !Number.isSafeInteger(count) || count < 0) throw new Error('Invalid wallet balance');
    const afterPoints = beforePoints + amount;
    const now = timestamp();
    tx.create(receipt, { userId: delivery.wallet, timestamp: now, eventId: id });
    tx.create(history, { userId: delivery.wallet, points: amount, action: 'earn', source: 'share',
      provider: 'kakao', verified: true, actionId: 'kakao_' + delivery.roomReceipt, beforePoints, afterPoints, timestamp: now });
    tx.update(user, { points: afterPoints, kakaoShareRewardCount: count + 1, lastActive: now });
    return 'credited';
  });
}

module.exports = { receiveDelivery, creditDelivery };
