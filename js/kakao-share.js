const SDK_URL = 'https://t1.kakaocdn.net/kakao_js_sdk/2.8.5/kakao.min.js';

function loadShareSdk(target) {
  if (target.Kakao?.Share) return Promise.resolve(target.Kakao);
  return new Promise((resolve, reject) => {
    const script = target.document.createElement('script');
    script.src = SDK_URL;
    script.onload = () => resolve(target.Kakao);
    script.onerror = () => { script.remove(); reject(new Error('Kakao SDK unavailable')); };
    target.document.head.append(script);
  });
}

const hex = bytes => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');

async function prepareWallet(target, { db, doc, runTransaction }, manager) {
  if (!await manager.flushPending()) throw new Error('Wallet not synchronized');
  const userId = manager.userId();
  const storageKey = 'neulbom_kakao_proof_' + userId;
  const prepare = async () => {
    let proof = target.localStorage.getItem(storageKey);
    if (!proof) {
      proof = hex(target.crypto.getRandomValues(new Uint8Array(32)));
      target.localStorage.setItem(storageKey, proof);
    }
    const digest = await target.crypto.subtle.digest('SHA-256', new TextEncoder().encode(proof));
    const proofHash = hex(new Uint8Array(digest));
    const wallet = doc(db, 'users', userId);
    await runTransaction(db, async tx => {
      const data = (await tx.get(wallet)).data();
      if (data?.pointSyncVersion !== 1) throw new Error('Wallet not initialized');
      if (data.kakaoShareProofHash && data.kakaoShareProofHash !== proofHash) throw new Error('Wallet mismatch');
      if (!data.kakaoShareProofHash) tx.update(wallet, { kakaoShareProofHash: proofHash });
    });
    return { wallet_id: userId, wallet_proof: proof };
  };
  return target.navigator.locks
    ? target.navigator.locks.request('neulbom-share-setup-' + userId, prepare) : prepare();
}

// The webhook changes the server balance even when the sender has closed the app.
// Only adopt a fresh server balance after older local operations have finished.
export function watchShareBalance(target, { db, doc, onSnapshot, getDocFromServer }, userId, onCredit) {
  const manager = target.pointsManager;
  const wallet = doc(db, 'users', userId);
  const marker = 'neulbom_kakao_count_' + userId;
  let timer, running = false, observed = 0, remainingChecks = 0;
  let waitingForReturn = false;
  const seen = () => Number(target.localStorage.getItem(marker)) || 0;
  const idle = () => !target.couponRequestBusy && !manager.readQueue().length;
  const schedule = (delay = 0) => {
    target.clearTimeout(timer);
    if (!running && (remainingChecks > 0 || observed > seen()) && !target.document.hidden && target.navigator.onLine !== false) {
      timer = target.setTimeout(reconcile, delay);
    }
  };
  async function reconcile() {
    if (running || target.document.hidden || target.navigator.onLine === false) return;
    if (!idle()) { schedule(2500); return; }
    const before = manager.readBalance();
    running = true;
    remainingChecks = Math.max(0, remainingChecks - 1);
    try {
      const data = (await getDocFromServer(wallet)).data();
      const count = Number(data?.kakaoShareRewardCount) || 0;
      observed = Math.max(observed, count);
      if (count <= seen() || !Number.isSafeInteger(data.points) || data.points < 0) return;
      const apply = () => {
        if (!idle() || manager.userId() !== userId || manager.readBalance() !== before || count <= seen()) return;
        target.localStorage.setItem('points', String(data.points));
        target.localStorage.setItem(marker, String(count));
        remainingChecks = 0;
        waitingForReturn = false;
        manager.refreshFromStorage();
        onCredit?.();
      };
      if (target.navigator.locks) await target.navigator.locks.request('neulbom-points-local-' + userId, apply);
      else apply();
    } catch { /* Retry when connectivity or the foreground state changes. */ }
    finally { running = false; schedule(4000); }
  }
  onSnapshot(wallet, { includeMetadataChanges: true }, snapshot => {
    if (snapshot.metadata.fromCache || snapshot.metadata.hasPendingWrites) return;
    observed = Math.max(observed, Number(snapshot.data()?.kakaoShareRewardCount) || 0);
    if (observed > seen()) schedule();
  }, () => {});
  const onReturn = () => {
    if (target.document.hidden) return;
    remainingChecks = Math.max(remainingChecks, waitingForReturn ? 5 : 1);
    waitingForReturn = false;
    schedule();
  };
  target.document.addEventListener('visibilitychange', onReturn);
  for (const event of ['pageshow', 'focus', 'online']) target.addEventListener(event, onReturn);

  // Kakao can return before the server has credited the wallet.
  return () => {
    waitingForReturn = true;
    remainingChecks = 5;
    schedule(1500);
  };
}

export function installKakaoShare(target, services) {
  const document = target.document;
  const key = document.querySelector('meta[name="kakao-javascript-key"]').content.trim();
  const templateId = Number(document.querySelector('meta[name="kakao-share-template-id"]').content);
  if (!/^[a-f0-9]{32}$/i.test(key) || !Number.isSafeInteger(templateId) || templateId <= 0) return;

  const button = document.getElementById('rewarded-kakao-share');
  const guide = document.getElementById('kakao-share-guide');
  const status = document.getElementById('kakao-share-status');
  const report = message => { status.hidden = false; status.textContent = message; };
  let sdk, args, preparing = false, checkAfterShare;

  function watch() {
    if (!checkAfterShare) {
      checkAfterShare = watchShareBalance(target, services, target.pointsManager.userId(), () => report('공유 포인트가 적립됐어요.'));
    }
  }
  async function prepare() {
    if (preparing || args) return;
    preparing = true;
    try {
      sdk = await loadShareSdk(target);
      if (!sdk.isInitialized()) sdk.init(key);
      args = await prepareWallet(target, services, target.pointsManager);
      button.hidden = false;
      button.disabled = false;
      guide.hidden = false;
      status.hidden = true;
    } catch { report('카카오톡 공유를 준비하지 못했어요. 인터넷 연결 후 다시 시도해주세요.'); }
    finally { preparing = false; }
  }
  // Call the SDK directly in the click handler to retain mobile user activation.
  button.addEventListener('click', () => {
    if (!args) { void prepare(); return; }
    const failure = () => report('카카오톡을 열지 못했어요. 다시 눌러주세요.');
    try {
      target.localStorage.setItem('neulbom_kakao_sent_' + args.wallet_id, '1');
      watch();
      status.hidden = true;
      const result = sdk.Share.sendCustom({ templateId, serverCallbackArgs: args, pickerSettings: { showSendToMe: false } });
      checkAfterShare();
      result?.catch?.(failure);
    } catch { failure(); }
  });
  function start() {
    if (target.localStorage.getItem('neulbom_kakao_sent_' + target.pointsManager.userId())) watch();
    button.hidden = false;
    button.disabled = false;
    void prepare();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
  target.addEventListener('online', prepare);
}
