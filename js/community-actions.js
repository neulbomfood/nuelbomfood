// Existing browser identities are reused; these operations never call reward services.
export function installCommunityActions(target, { db, doc, runTransaction, serverTimestamp }) {
  const storage = target.localStorage;
  function currentUser() {
    if (target.isOnline === false) throw new Error('인터넷 연결을 확인한 뒤 다시 시도해주세요.');
    const id = target.getUserId();
    if (!id) throw new Error('작성자 정보를 확인하지 못했어요.');
    return id;
  }
  function owned(snapshot, userId) {
    if (!snapshot.exists()) throw new Error('이미 삭제된 글이나 댓글이에요.');
    const value = snapshot.data();
    if (value.userId !== userId) throw new Error('내가 작성한 글과 댓글만 변경할 수 있어요.');
    return value;
  }
  function body(value, max) {
    const text = String(value ?? '').trim();
    if (!text || text.length > max) throw new Error(`내용은 1~${max}자로 입력해주세요.`);
    return text;
  }
  function cached(key, transform) {
    try {
      const value = JSON.parse(storage.getItem(key));
      if (value != null) storage.setItem(key, JSON.stringify(transform(value)));
    } catch { /* Storage failure must not turn a committed save into a reported failure. */ }
  }
  const change = (rows, id, patch) => Array.isArray(rows)
    ? rows.flatMap(row => row.id !== id ? [row] : patch ? [{ ...row, ...patch }] : []) : rows;
  function cachePost(id, patch, userId) {
    cached('cached_user_posts', rows => change(rows, id, patch));
    if (!patch) {
      cached(`neulbom_community_activity_${userId}`, value => ({ ...value,
        myComments: value.myComments?.filter(item => item.postId !== id),
        comments: value.comments?.filter(item => item.postId !== id) }));
    }
  }
  function cacheComment(id, postId, patch, userId) {
    cached(`cached_comments_free_${postId}`, rows => change(rows, id, patch));
    cached(`neulbom_community_activity_${userId}`, value => ({ ...value,
      myComments: change(value.myComments, id, patch), comments: change(value.comments, id, patch) }));
  }
  target.updateCommunityPost = async (id, input) => {
    const userId = currentUser();
    const patch = { content: body(input.content, 500), title: String(input.title ?? '').trim(),
      communityBoard: target.Community.boardOf(input.board) };
    if (patch.title.length > 80) throw new Error('제목은 80자 이하로 입력해주세요.');
    await runTransaction(db, async transaction => {
      const reference = doc(db, 'user_posts', id);
      owned(await transaction.get(reference), userId);
      transaction.update(reference, { ...patch, updatedAt: serverTimestamp() });
    });
    cachePost(id, patch, userId);
    return patch;
  };
  target.deleteCommunityPost = async id => {
    const userId = currentUser();
    await runTransaction(db, async transaction => {
      const reference = doc(db, 'user_posts', id);
      owned(await transaction.get(reference), userId);
      // Other members' comments are not deleted by the post author.
      transaction.delete(reference);
    });
    cachePost(id, null, userId);
  };
  target.updateCommunityComment = async (id, postId, content) => {
    const userId = currentUser();
    const patch = { text: body(content, 200) };
    await runTransaction(db, async transaction => {
      const reference = doc(db, 'free_comments', id);
      const value = owned(await transaction.get(reference), userId);
      if (value.postId !== postId) throw new Error('댓글이 속한 글을 확인하지 못했어요.');
      const parent = await transaction.get(doc(db, 'user_posts', postId));
      if (!parent.exists()) throw new Error('이미 삭제된 글이에요.');
      transaction.update(reference, { ...patch, updatedAt: serverTimestamp() });
    });
    cacheComment(id, postId, patch, userId);
    return patch;
  };
  target.deleteCommunityComment = async (id, postId) => {
    const userId = currentUser();
    const count = await runTransaction(db, async transaction => {
      const reference = doc(db, 'free_comments', id);
      const value = owned(await transaction.get(reference), userId);
      if (value.postId !== postId) throw new Error('댓글이 속한 글을 확인하지 못했어요.');
      const parentRef = doc(db, 'user_posts', postId);
      const parent = await transaction.get(parentRef);
      const next = Math.max(0, (Number(parent.data()?.commentCount) || 0) - 1);
      transaction.delete(reference);
      if (parent.exists()) transaction.update(parentRef, { commentCount: next });
      return next;
    });
    cacheComment(id, postId, null, userId);
    cachePost(postId, { commentCount: count }, userId);
    return count;
  };
}
