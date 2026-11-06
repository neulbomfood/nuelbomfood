// Health stories are static assets, so comments do not require a Firestore parent post.
export function installHealthStoryComments(target, { db, collection, doc, getDocs, query, where, runTransaction, serverTimestamp }) {
  const collectionName = 'health_story_comments';
  const cacheKey = postId => `cached_comments_health_story_${postId}`;
  const millis = value => Number(value?.seconds || 0) * 1000;
  function validatePost(postId) {
    if (!target.NEULBOM_HEALTH_STORIES?.some(post => post.id === postId)) throw new Error('건강 이야기를 찾지 못했어요.');
  }
  function currentUser() {
    if (target.isOnline === false) throw new Error('인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    const userId = target.getUserId?.();
    const nickname = target.localStorage.getItem('nickname')?.trim();
    if (!userId || !nickname) throw new Error('닉네임을 등록한 뒤 댓글을 남겨주세요.');
    return { userId, nickname };
  }
  function body(value) {
    const text = String(value ?? '').trim();
    if (!text || text.length > 200) throw new Error('댓글은 1~200자로 입력해주세요.');
    return text;
  }
  function cached(postId) {
    try {
      const rows = JSON.parse(target.localStorage.getItem(cacheKey(postId)));
      return Array.isArray(rows) ? rows : null;
    } catch { return null; }
  }
  function cache(postId, rows) {
    try { target.localStorage.setItem(cacheKey(postId), JSON.stringify(rows)); } catch { /* A full cache must not fail a committed comment. */ }
  }
  function updateCache(postId, id, comment) {
    const rows = (cached(postId) || []).filter(row => row.id !== id);
    if (comment) rows.push(comment);
    cache(postId, rows);
  }
  function owned(snapshot, postId, userId) {
    if (!snapshot.exists()) throw new Error('이미 삭제된 댓글이에요.');
    const value = snapshot.data();
    if (value.postId !== postId || value.userId !== userId) throw new Error('내가 작성한 댓글만 변경할 수 있어요.');
    return value;
  }
  target.healthStoryComments = {
    newId: () => doc(collection(db, collectionName)).id,
    async list(postId) {
      validatePost(postId);
      try {
        if (target.isOnline === false) throw new Error('offline');
        const snapshot = await getDocs(query(collection(db, collectionName), where('postId', '==', postId)));
        const rows = snapshot.docs.map(item => ({ ...item.data(), id: item.id })).sort((a, b) => millis(b.timestamp) - millis(a.timestamp));
        cache(postId, rows);
        return { rows, cached: false };
      } catch (error) {
        const rows = cached(postId);
        if (rows !== null) return { rows, cached: true };
        throw error;
      }
    },
    async create(postId, text, id) {
      validatePost(postId);
      const user = currentUser();
      text = body(text);
      if (!/^[\w-]{1,100}$/.test(id)) throw new Error('댓글 정보를 확인하지 못했어요. 다시 열어주세요.');
      const reference = doc(db, collectionName, id);
      const value = await runTransaction(db, async transaction => {
        const snapshot = await transaction.get(reference);
        // Retrying a save whose response was lost must not create a second comment.
        if (snapshot.exists()) return owned(snapshot, postId, user.userId);
        const comment = { postId, ...user, text, timestamp: serverTimestamp() };
        transaction.set(reference, comment);
        return { ...comment, timestamp: { seconds: Math.floor(Date.now() / 1000) } };
      });
      const comment = { ...value, id };
      updateCache(postId, id, comment);
      let rewardPending = false;
      try {
        // Same 30P and per-post/user action key as the existing community comments.
        await target.addUserPoints(30, 'comment', `comment_health_story_${postId}_${user.userId}`);
      } catch { rewardPending = true; }
      return { comment, rewardPending };
    },
    async update(postId, id, text) {
      validatePost(postId);
      const { userId } = currentUser();
      text = body(text);
      const reference = doc(db, collectionName, id);
      const comment = await runTransaction(db, async transaction => {
        const value = owned(await transaction.get(reference), postId, userId);
        transaction.update(reference, { text, updatedAt: serverTimestamp() });
        return { ...value, id, text, updatedAt: { seconds: Math.floor(Date.now() / 1000) } };
      });
      updateCache(postId, id, comment);
      return comment;
    },
    async remove(postId, id) {
      validatePost(postId);
      const { userId } = currentUser();
      const reference = doc(db, collectionName, id);
      await runTransaction(db, async transaction => {
        owned(await transaction.get(reference), postId, userId);
        transaction.delete(reference);
      });
      updateCache(postId, id, null);
    }
  };
  target.dispatchEvent(new Event('healthStoryCommentsReady'));
}
