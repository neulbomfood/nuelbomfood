// Firebase persistence shared by home and quiz. Each queued operation is
// committed with its receipt, so a retry cannot award the same points twice.
export function installPointPersistence(target, { db, doc, runTransaction, serverTimestamp }) {
  let flushing = null;
  async function flush() {
    if (flushing) return flushing;
    if (target.navigator?.onLine === false) return false;
    const manager = target.pointsManager;
    if (!manager) return false;
    flushing = Promise.resolve().then(async () => {
      try {
        while (true) {
          const operation = manager.readQueue()[0];
          if (!operation) {
            // Legacy offline entries already affected the on-device balance;
            // the migration baseline includes them. Never award them again.
            target.localStorage.removeItem('offlineActions');
            return true;
          }
          const userId = manager.userId();
          const userRef = doc(db, 'users', userId);
          const receiptRef = doc(db, 'pointsHistory', encodeURIComponent(`${userId}_${operation.id}`));
          const localAtStart = manager.readBalance();
          const serverBalance = await runTransaction(db, async transaction => {
            const receipt = await transaction.get(receiptRef);
            const snapshot = await transaction.get(userRef);
            const data = snapshot.exists() ? snapshot.data() : {};
            const beforePoints = Math.max(0, Number(data.points) || 0);
            if (receipt.exists()) return beforePoints;
            const isBaseline = operation.id === 'baseline';
            const afterPoints = isBaseline
              ? (data.pointSyncVersion === 1 ? beforePoints : Math.max(0, operation.baseline))
              : Math.max(0, beforePoints + operation.amount);
            transaction.set(userRef, { points: afterPoints, pointSyncVersion: 1,
              lastActive: serverTimestamp() }, { merge: true });
            transaction.set(receiptRef, { userId, points: isBaseline ? 0 : afterPoints - beforePoints,
              action: isBaseline ? 'sync' : operation.amount >= 0 ? 'earn' : 'spend',
              source: operation.source, actionId: operation.actionId || operation.id,
              beforePoints, afterPoints, timestamp: serverTimestamp() });
            return afterPoints;
          });
          await manager.acknowledge(operation.id);
          if (!manager.readQueue().length && !target.couponRequestBusy
              && manager.readBalance() === localAtStart && Number.isFinite(serverBalance)) {
            target.localStorage.setItem('points', String(serverBalance));
            manager.refreshFromStorage();
          }
        }
      } catch (error) {
        // Keep both the earned local balance and the pending operation intact.
        // Online/page-resume events retry the server write, not the reward.
        console.warn('포인트 서버 저장 대기 중:', error);
        return false;
      }
    }).finally(() => { flushing = null; });
    return flushing;
  }
  target.pointsPersistence = { flush };
  void flush();
  return target.pointsPersistence;
}
