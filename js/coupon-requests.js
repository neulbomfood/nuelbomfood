export const COUPON_FORM_URL = 'https://docs.google.com/forms/d/e/1FAIpQLSf79U4uayn49L_SMV3KgjnAp8vlP7gx-XJ-v6AnBxveqlIPxg/viewform?usp=dialog';

// Reopening a form is a plain link: it never calls the point or request services.
export function installCouponRequests(target, { db, collection, doc, query, where,
  getDocs, runTransaction, serverTimestamp }) {
  const document = target.document;
  const storage = target.localStorage;
  const userId = target.getUserId();
  const cacheKey = `neulbom_coupon_requests_${userId}`;
  let requests = [];
  let refreshing = null;
  let revision = 0;
  let busy = false;
  let cached = true;

  const balance = () => Math.max(0, Number(storage.getItem('points')) || 0);
  const notify = (text, kind) => target.showSalonToast?.(text, kind);
  const valid = row => row && row.userId === userId && typeof row.id === 'string'
    && Number.isFinite(row.points) && row.points >= 5000 && row.status === 'pending';
  function saveCache() {
    try { storage.setItem(cacheKey, JSON.stringify(requests)); }
    catch { /* The server remains the source for request history. */ }
  }
  function setBusy(value) {
    busy = value;
    target.couponRequestBusy = value;
    ['exchange-button', 'community-exchange'].forEach(id => {
      const button = document.getElementById(id);
      if (button) {
        button.disabled = value || balance() < 5000;
        button.setAttribute('aria-busy', String(value));
      }
    });
  }
  function render() {
    document.querySelectorAll('[data-coupon-requests]').forEach(host => {
      host.replaceChildren();
      host.hidden = !requests.length;
      if (!requests.length) return;
      requests.forEach(request => {
        const row = document.createElement('div');
        row.className = 'coupon-request-row';
        const title = document.createElement('strong');
        title.className = 'coupon-request-title';
        title.textContent = `쿠폰 신청 진행 중 · ${request.points.toLocaleString('ko-KR')}P`;
        row.append(title);
        if (request.requestedAtMs) {
          const date = document.createElement('span');
          date.className = 'coupon-request-date';
          date.textContent = `${new Date(request.requestedAtMs).toLocaleDateString('ko-KR')} 신청`;
          row.append(date);
        }
        const link = document.createElement('a');
        link.className = 'coupon-request-reopen';
        link.href = COUPON_FORM_URL;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        link.textContent = '신청서 다시 열기 ↗';
        link.setAttribute('aria-label', `${request.points.toLocaleString('ko-KR')}P 쿠폰 신청서 다시 열기 (새 창)`);
        row.append(link);
        host.append(row);
      });
      const help = document.createElement('p');
      help.className = 'coupon-request-help';
      help.textContent = '구글폼의 포인트 입력란에는 위 신청 내역의 금액을 적어주세요. 이미 제출했다면 다시 작성하지 않아도 돼요. 확인 후 할인쿠폰을 지급해드려요.';
      host.append(help);
      if (cached) {
        const notice = document.createElement('p');
        notice.className = 'coupon-request-cache';
        notice.textContent = '최근 저장된 신청 내역이에요.';
        host.append(notice);
      }
    });
  }
  async function refresh() {
    if (refreshing) return refreshing;
    const startedAt = revision;
    refreshing = (async () => {
      try {
        const snapshot = await getDocs(query(collection(db, 'exchangeRequests'), where('userId', '==', userId)));
        // A response started before a new request must not hide that request.
        if (startedAt !== revision || snapshot.metadata?.fromCache) return;
        requests = snapshot.docs.map(item => {
          const data = item.data();
          return { id: item.id, userId: data.userId, points: Number(data.points), status: data.status,
            requestedAtMs: data.requestedAt?.toMillis?.() || data.createdAt?.toMillis?.() || 0 };
        }).filter(valid).sort((a, b) => b.requestedAtMs - a.requestedAtMs);
        cached = false;
        saveCache();
        render();
      } catch (error) {
        cached = true;
        render();
        console.warn('쿠폰 신청 내역을 새로 불러오지 못했습니다.', error);
      } finally { refreshing = null; }
    })();
    return refreshing;
  }
  function updateLocalBalance(pointsAtRequest) {
    // Preserve rewards earned while saving. Do not call setPoints/syncPoints:
    // the request transaction has already written the server balance.
    const oldPoints = balance();
    const nextPoints = Math.max(0, oldPoints - pointsAtRequest);
    try { storage.setItem('points', String(nextPoints)); } catch { /* Keep this session correct. */ }
    if (target.pointsManager) {
      target.pointsManager.currentPoints = nextPoints;
      target.pointsManager.updateAllDisplays();
    }
    if (typeof target.points !== 'undefined') target.points = nextPoints;
    target.dispatchEvent(new target.CustomEvent('pointsChanged', {
      detail: { oldPoints, newPoints: nextPoints, change: nextPoints - oldPoints }
    }));
    target.dispatchEvent(new target.CustomEvent('pointsUpdated'));
  }
  async function createRequest() {
    // Read shared storage after acquiring the lock, including changes from another tab.
    const points = balance();
    if (points < 5000) {
      notify('5,000P부터 할인쿠폰을 신청할 수 있어요.', 'warning');
      return;
    }
    if (target.navigator?.onLine === false) {
      notify('인터넷 연결을 확인한 뒤 신청해주세요.', 'warning');
      return;
    }
    if (!target.confirm(`보유한 ${points.toLocaleString('ko-KR')}P 전액으로 할인쿠폰을 신청할까요?\n신청 포인트는 차감되며, 구글폼에는 신청한 ${points.toLocaleString('ko-KR')}P를 입력해주세요.`)) return;
    let formWindow = null;
    let reference;
    try {
      // Reserve the window while the click still has user activation. A blocked
      // or closed popup is recoverable through the permanent reopen link.
      try {
        formWindow = target.open('about:blank', '_blank');
        if (formWindow) formWindow.opener = null;
      } catch { /* The request card also provides the form link. */ }
      if (target.pointsManager?.flushPending && !await target.pointsManager.flushPending()) {
        throw new Error('Point synchronization is still pending');
      }
      reference = doc(collection(db, 'exchangeRequests'));
      const request = { userId, nickname: storage.getItem('nickname') || '익명', points,
        requestedAt: serverTimestamp(), status: 'pending' };
      await runTransaction(db, async transaction => {
        // A retry of this transaction uses the same request ID.
        const existing = await transaction.get(reference);
        if (existing.exists()) return;
        const userRef = doc(db, 'users', userId);
        const user = await transaction.get(userRef);
        const available = Math.max(0, Number(user.data()?.points) || 0);
        if (available < points) throw new Error('Insufficient synchronized points');
        transaction.set(reference, request);
        transaction.set(userRef, {
          points: available - points, lastExchangeAt: serverTimestamp(), nickname: request.nickname
        }, { merge: true });
      });
    } catch (error) {
      try { if (formWindow && !formWindow.closed) formWindow.close(); } catch { /* Already closed. */ }
      console.error('할인쿠폰 신청 오류:', error);
      notify('신청을 저장하지 못했어요. 포인트는 차감되지 않았어요. 잠시 후 다시 시도해주세요.', 'error');
      return;
    }
    revision += 1;
    requests.unshift({ id: reference.id, userId, points, status: 'pending', requestedAtMs: Date.now() });
    cached = false;
    saveCache();
    updateLocalBalance(points);
    render();
    // Popup failure after a successful save must never be reported as a failed request.
    try { if (formWindow && !formWindow.closed) formWindow.location.replace(COUPON_FORM_URL); } catch { /* Use the reopen link. */ }
    notify('신청 포인트를 보관했어요. 구글폼 제출까지 완료해주세요.', 'success');
  }
  target.requestExchange = async () => {
    if (busy) return;
    setBusy(true);
    try {
      if (target.navigator?.locks) {
        await target.navigator.locks.request(`neulbom-coupon-${userId}`, { ifAvailable: true }, async lock => {
          if (lock) await createRequest();
          else notify('다른 창에서 쿠폰 신청을 저장하고 있어요.', 'warning');
        });
      } else await createRequest();
    } finally { setBusy(false); }
  };
  try {
    const saved = JSON.parse(storage.getItem(cacheKey));
    if (Array.isArray(saved)) requests = saved.filter(valid);
  } catch { /* Ignore malformed or unavailable browser storage. */ }
  render();
  void refresh();
  target.addEventListener('focus', refresh);
  target.addEventListener('online', refresh);
  target.addEventListener('pageshow', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) void refresh(); });
  target.addEventListener('storage', event => {
    if (event.key === cacheKey) {
      try { requests = (JSON.parse(event.newValue) || []).filter(valid); } catch { requests = []; }
      cached = true;
      render();
      void refresh();
    }
    if (event.key === 'points') {
      if (target.pointsManager) {
        target.pointsManager.currentPoints = balance();
        target.pointsManager.updateAllDisplays();
      }
      setBusy(busy);
    }
  });
  return { refresh };
}
