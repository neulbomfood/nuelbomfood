export const POLL_OPTIONS = Object.freeze(['agree', 'disagree', 'unsure']);
export const POLL_REWARD = 30;
export const pollCounts = value => Object.fromEntries(POLL_OPTIONS.map(key =>
  [key, Math.max(0, Math.trunc(Number(value?.[key]) || 0))]));
export const isCommunityPoll = post => post?.poll?.version === 1 &&
  post.kind === 'health-debate' && typeof post.poll.question === 'string' &&
  JSON.stringify(post.poll.options) === JSON.stringify(POLL_OPTIONS);

// Vote changes are transactional. Rewards reuse the existing durable point queue
// and server receipt, with one stable action ID per member and discussion.
export function installCommunityPollStore(target, {db, doc, getDoc, runTransaction, serverTimestamp}) {
  const inFlight = new Map();
  const user = () => {
    const id = target.getUserId();
    if (!id) throw new Error('참여자 정보를 확인하지 못했어요.');
    return id;
  };
  const voteRef = (postId, userId) => doc(db, 'question_answers', encodeURIComponent(`community_poll_${postId}_${userId}`));
  const ownsVote = (value, postId, userId) => value?.kind === 'community-poll' &&
    value.postId === postId && value.userId === userId && POLL_OPTIONS.includes(value.choice);
  function requirePoll(snapshot, open = false) {
    if (!snapshot.exists() || !isCommunityPoll(snapshot.data())) throw new Error('이 설문을 찾을 수 없어요.');
    const post = snapshot.data();
    if (open && post.poll.status !== 'open') throw new Error('참여가 마감된 설문이에요.');
    return post;
  }
  async function reward(postId, userId) {
    const actionId = `community_poll_${postId}`;
    const receiptRef = doc(db, 'pointsHistory', encodeURIComponent(`${userId}_action_${actionId}`));
    try {
      // Checking the receipt also prevents re-crediting after device cache loss.
      const receipt = await getDoc(receiptRef);
      if (receipt.exists()) {
        await target.pointsManager.flushPending();
        return {status: 'credited', newlyCredited: false};
      }
      const marker = `neulbom_point_action_${userId}_${actionId}`;
      const alreadyQueued = Boolean(target.localStorage.getItem(marker));
      await target.pointsManager.addPoints(POLL_REWARD, 'community_poll', actionId);
      const saved = await target.pointsManager.flushPending();
      return {status: saved ? 'credited' : 'pending', newlyCredited: !alreadyQueued};
    } catch (error) {
      // The vote remains saved. Reopening the post retries this same reward ID.
      return {status: 'pending', newlyCredited: false};
    }
  }
  async function load(postId) {
    const userId = user();
    const [postSnapshot, voteSnapshot] = await Promise.all([
      getDoc(doc(db, 'user_posts', postId)), getDoc(voteRef(postId, userId))
    ]);
    const post = requirePoll(postSnapshot);
    const own = voteSnapshot.data();
    const choice = ownsVote(own, postId, userId) ? own.choice : null;
    return {counts: pollCounts(post.pollCounts), choice, open: post.poll.status === 'open',
      reward: choice ? await reward(postId, userId) : null};
  }
  function vote(postId, choice) {
    if (!POLL_OPTIONS.includes(choice)) return Promise.reject(new Error('선택지를 확인해주세요.'));
    if (inFlight.has(postId)) return inFlight.get(postId);
    const task = (async () => {
      if (target.navigator?.onLine === false || target.isOnline === false) throw new Error('인터넷에 연결한 뒤 참여해주세요.');
      const userId = user();
      const reference = voteRef(postId, userId);
      const postRef = doc(db, 'user_posts', postId);
      const result = await runTransaction(db, async transaction => {
        const [postSnapshot, oldSnapshot] = await Promise.all([transaction.get(postRef), transaction.get(reference)]);
        const post = requirePoll(postSnapshot, true);
        const previous = oldSnapshot.data();
        if (oldSnapshot.exists() && !ownsVote(previous, postId, userId)) throw new Error('기존 참여 기록을 확인하지 못했어요.');
        const counts = pollCounts(post.pollCounts);
        if (previous?.choice !== choice) {
          if (previous?.choice) counts[previous.choice] = Math.max(0, counts[previous.choice] - 1);
          counts[choice] += 1;
          transaction.update(postRef, {pollCounts: counts});
          transaction.set(reference, {kind: 'community-poll', postId, userId, choice,
            createdAt: previous?.createdAt || serverTimestamp(), updatedAt: serverTimestamp()});
        }
        return {counts, choice, open: true, firstVote: !oldSnapshot.exists()};
      });
      return {...result, reward: await reward(postId, userId)};
    })().finally(() => inFlight.delete(postId));
    inFlight.set(postId, task);
    return task;
  }
  target.communityPollStore = {load, vote};
  return target.communityPollStore;
}
