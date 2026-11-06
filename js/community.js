/* Presentation and board metadata only. Firestore collections and reward services are reused. */
(() => {
  const boards = { talk: '건강 수다', question: '궁금해요', practice: '함께 실천' };
  const boardOf = value => Object.hasOwn(boards, value) ? value : 'talk';
  const timestamp = value => {
    if (typeof value?.seconds === 'number') return value.seconds * 1000;
    if (typeof value?.toMillis === 'function') return value.toMillis();
    return new Date(value || 0).getTime() || 0;
  };
  // Member conversations use user_posts; legacy multiple-choice questions keep their own page.
  const entries = posts => posts.map(post => ({ ...post, type: 'free', board: boardOf(post.communityBoard) }));
  const select = (posts, board, query, sort) => {
    const needle = query.trim().toLocaleLowerCase();
    return posts.filter(post => (board === 'all' || post.board === board) &&
      [post.title, post.question, post.content, post.nickname].join(' ').toLocaleLowerCase().includes(needle))
      .sort((a, b) => (sort === 'popular' ? (Number(b.likes) || 0) - (Number(a.likes) || 0) : 0) ||
        timestamp(b.timestamp) - timestamp(a.timestamp));
  };
  const safeImage = (value, base = 'https://neulbomfood.github.io/nuelbomfood/') => {
    try { const url = new URL(value, base); return /^https?:$/.test(url.protocol) ? url.href : ''; }
    catch { return ''; }
  };
  const activityOf = (posts, comments, userId) => {
    if (!userId) return { posts: [], comments: [] };
    const commentedIds = new Set(comments.filter(comment => comment.userId === userId).map(comment => comment.postId));
    return { posts: posts.filter(post => post.userId === userId), comments: posts.filter(post => commentedIds.has(post.id)) };
  };
  const unreadFor = (postId, comments, seenIds, userId) => {
    const seen = new Set(Array.isArray(seenIds) ? seenIds : []);
    return comments.some(comment => comment.postId === postId && comment.userId !== userId && comment.id && !seen.has(comment.id));
  };
  // Explicit account IDs only: a nickname or a client-supplied role is not an operator identity.
  const operatorUserIds = Object.freeze(['neulbom-editorial']);
  const isOperatorComment = comment => Boolean(comment?.userId && operatorUserIds.includes(comment.userId));
  const splitQuestionComments = (post, comments) => {
    const sorted = [...comments].sort((a, b) => timestamp(b.timestamp) - timestamp(a.timestamp));
    const question = (post.board || boardOf(post.communityBoard)) === 'question';
    return {
      answers: question ? sorted.filter(isOperatorComment) : [],
      comments: question ? sorted.filter(comment => !isOperatorComment(comment)) : sorted
    };
  };
  const canManage = (item, userId) => Boolean(userId && item?.userId === userId);
  const model = { boards, boardOf, timestamp, entries, select, safeImage, activityOf, unreadFor, canManage, operatorUserIds, isOperatorComment, splitQuestionComments };
  if (typeof module !== 'undefined' && module.exports) module.exports = model;
  if (typeof document === 'undefined') return;

  const byId = id => document.getElementById(id);
  const state = { board: 'all', sort: 'latest', query: '', posts: [], loaded: false, request: 0, nextBoard: null, detailId: null, listScroll: 0, returnPostId: null };
  const answerRecords = new Map();
  const commentVersions = new Map();
  let answerRequest = 0;
  let listShell, detailShell;
  Object.assign(state, { view: 'community', activityTab: 'posts', myComments: [], threadComments: [], activityLoaded: false, activityError: false, activityRequest: 0, activityUser: null, readMarks: {}, lastRefresh: 0, activeCommentList: null });
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = String(text);
    return node;
  };
  const button = (text, className, action) => {
    const node = el('button', className, text);
    node.type = 'button'; node.addEventListener('click', action); return node;
  };
  const notify = (text, kind = 'error') => window.showSalonToast(text, kind);
  const timeText = value => timestamp(value) ? window.formatTime(new Date(timestamp(value))) : '';

  function ownerMenu(kind, item, post = item) {
    if (!canManage(item, window.getUserId())) return null;
    const menu = el('details', 'community-owner-menu');
    const toggle = el('summary', '', '⋯');
    toggle.setAttribute('aria-label', `내 ${kind === 'post' ? '글' : '댓글'} 관리`);
    const options = el('div', 'community-owner-options');
    options.append(button('수정', '', () => { menu.open = false; editItem(kind, item, post); }),
      button('삭제', 'community-delete-action', () => { menu.open = false; deleteItem(kind, item, post); }));
    menu.append(toggle, options);
    return menu;
  }

  function managementDialog(title, submitText, save, destructive = false) {
    if (state.manageDialog) return null;
    // Ignore older in-flight refreshes while the member is editing.
    state.request++; state.activityRequest++;
    const dialog = el('dialog', 'community-manage-dialog');
    dialog.setAttribute('aria-labelledby', 'community-manage-title');
    const heading = el('h2', '', title); heading.id = 'community-manage-title';
    const form = el('form');
    const fields = el('div', 'community-manage-fields');
    const error = el('p', 'community-manage-error'); error.hidden = true; error.setAttribute('role', 'alert');
    const footer = el('div', 'community-manage-footer');
    const cancel = button('취소', '', () => dialog.close());
    const submit = el('button', destructive ? 'community-delete-confirm' : 'community-save-confirm', submitText);
    submit.type = 'submit';
    footer.append(cancel, submit); form.append(heading, fields, error, footer); dialog.append(form);
    const session = { node: dialog, busy: false }; state.manageDialog = session;
    dialog.addEventListener('cancel', event => { if (session.busy) event.preventDefault(); });
    dialog.addEventListener('close', () => { state.manageDialog = null; dialog.remove(); });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      if (session.busy) return;
      session.busy = true; submit.disabled = true; cancel.disabled = true; error.hidden = true;
      submit.textContent = destructive ? '삭제 중…' : '저장 중…';
      try {
        const done = await save();
        dialog.close();
        if (done) await done();
      } catch (reason) {
        error.textContent = reason.code === 'permission-denied' ? '변경 권한을 확인하지 못했어요. 잠시 후 다시 시도해주세요.'
          : /^[가-힣]/.test(reason.message || '') ? reason.message : destructive ? '삭제하지 못했어요. 잠시 후 다시 시도해주세요.' : '저장하지 못했어요. 입력한 내용은 유지했어요. 다시 시도해주세요.';
        error.hidden = false;
      } finally {
        session.busy = false; submit.disabled = false; cancel.disabled = false; submit.textContent = submitText;
      }
    });
    document.body.append(dialog);
    return { dialog, fields, submit, cancel };
  }

  function editItem(kind, item, post) {
    const isPost = kind === 'post';
    const original = String(isPost ? item.content ?? '' : item.text ?? item.content ?? '');
    const input = el('textarea'); input.id = 'community-edit-content'; input.value = original;
    input.required = true; input.maxLength = isPost ? 500 : 200; input.rows = isPost ? 8 : 4;
    const title = el('input'); title.id = 'community-edit-title'; title.maxLength = 80; title.value = item.title || '';
    const board = el('select'); board.id = 'community-edit-board';
    for (const [value, text] of Object.entries(boards)) { const option = el('option', '', text); option.value = value; board.append(option); }
    board.value = boardOf(item.communityBoard);
    const modal = managementDialog(isPost ? '글 수정' : '댓글 수정', '수정 저장', async () => {
      if (isPost) {
        const patch = await window.updateCommunityPost(item.id, { content: input.value, title: title.value, board: board.value });
        Object.assign(item, patch, { board: boardOf(patch.communityBoard) });
        const stored = state.posts.find(value => value.id === item.id);
        if (stored) Object.assign(stored, item);
        return () => {
          if (state.detailId === item.id) {
            const draft = byId('community-detail-comment-input')?.value || '';
            detailShell.querySelector('article').replaceWith(detailCard(item));
            detailShell.querySelector('.community-detail-nav > span').textContent = boards[item.board];
            byId('community-detail-comment-input').value = draft;
            byId('community-detail-title').focus({ preventScroll: true });
          }
          render(); notify('글이 수정되었어요.', 'success');
        };
      }
      const patch = await window.updateCommunityComment(item.id, post.id, input.value);
      Object.assign(item, patch);
      return async () => {
        await loadComments(post, state.activeCommentList);
        await refreshActivity(); notify('댓글이 수정되었어요.', 'success');
      };
    });
    if (!modal) return;
    const field = (labelText, control) => { const label = el('label', '', labelText); label.htmlFor = control.id; modal.fields.append(label, control); };
    if (isPost) { field('게시판', board); field('제목 (선택)', title); }
    field(isPost ? '내용' : '댓글 내용', input);
    const counter = el('p', 'community-edit-counter');
    const count = () => { counter.textContent = `${input.value.length}/${input.maxLength}`; modal.submit.disabled = !input.value.trim() || input.value.length > input.maxLength; };
    input.addEventListener('input', count); count(); modal.fields.append(counter);
    if (isPost && item.imageUrl) modal.fields.append(el('p', 'community-edit-note', '첨부한 사진은 그대로 유지돼요.'));
    modal.dialog.showModal(); input.focus();
  }

  function deleteItem(kind, item, post) {
    const isPost = kind === 'post';
    const modal = managementDialog(isPost ? '글을 삭제할까요?' : '댓글을 삭제할까요?', '삭제하기', async () => {
      if (isPost) {
        await window.deleteCommunityPost(item.id);
        state.posts = state.posts.filter(value => value.id !== item.id);
        state.myComments = state.myComments.filter(value => value.postId !== item.id);
        state.threadComments = state.threadComments.filter(value => value.postId !== item.id);
        return () => { history.back(); render(); notify('글이 삭제되었어요.', 'success'); };
      }
      post.commentCount = await window.deleteCommunityComment(item.id, post.id);
      syncPost(post);
      state.myComments = state.myComments.filter(value => value.id !== item.id);
      state.threadComments = state.threadComments.filter(value => value.id !== item.id);
      return async () => {
        await loadComments(post, state.activeCommentList);
        await refreshActivity(); notify('댓글이 삭제되었어요.', 'success');
      };
    }, true);
    if (!modal) return;
    modal.fields.append(el('p', '', isPost ? '삭제한 글은 목록에서 사라지고 다시 복구할 수 없어요.' : '삭제한 댓글은 다시 복구할 수 없어요.'));
    modal.dialog.showModal(); modal.cancel.focus();
  }

  const activityKey = userId => `neulbom_community_activity_${userId}`;
  const readKey = userId => `neulbom_community_read_${userId}`;
  function readStored(key, fallback) {
    try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
  }
  function storeLocal(key, data) {
    try { localStorage.setItem(key, JSON.stringify(data)); } catch { /* Keep this session usable if browser storage is full. */ }
  }
  function ensureActivityUser() {
    const userId = window.getUserId();
    if (state.activityUser === userId) return userId;
    state.activityUser = userId;
    const cached = readStored(activityKey(userId), {});
    state.myComments = Array.isArray(cached.myComments) ? cached.myComments : [];
    state.threadComments = Array.isArray(cached.comments) ? cached.comments : [];
    const marks = readStored(readKey(userId), {});
    state.readMarks = Object.assign(Object.create(null), marks && typeof marks === 'object' && !Array.isArray(marks) ? marks : {});
    state.activityLoaded = Array.isArray(cached.myComments);
    state.activityError = false;
    return userId;
  }
  const mine = () => activityOf(state.posts, state.myComments, state.activityUser);
  const hasUnread = post => unreadFor(post.id, state.threadComments, state.readMarks[post.id], state.activityUser);
  function markRead(post, comments) {
    if (state.detailId !== post.id || document.hidden || byId('habit-salon-main').style.display === 'none') return;
    const previous = Object.hasOwn(state.readMarks, post.id) && Array.isArray(state.readMarks[post.id]) ? state.readMarks[post.id] : [];
    state.readMarks[post.id] = [...new Set([...previous, ...comments.map(comment => comment.id).filter(Boolean)])];
    storeLocal(readKey(ensureActivityUser()), state.readMarks);
    paintActivity();
  }
  function paintActivity() {
    const toggle = byId('community-activity-toggle');
    if (!toggle) return;
    const groups = mine();
    const tracked = [...new Map([...groups.posts, ...groups.comments].map(post => [post.id, post])).values()];
    const unread = tracked.filter(hasUnread).length;
    toggle.setAttribute('aria-pressed', String(state.view === 'activity'));
    byId('habit-salon-main-back-btn').setAttribute('aria-label', state.view === 'activity' ? '커뮤니티로 돌아가기' : '홈으로 돌아가기');
    toggle.setAttribute('aria-label', unread ? `내 활동, 새 댓글이 있는 글 ${unread}개` : '내 활동');
    const badge = byId('community-activity-badge');
    badge.hidden = unread === 0; badge.textContent = String(unread);
    byId('community-activity-posts').textContent = `내가 쓴 글 ${groups.posts.length}`;
    byId('community-activity-comments').textContent = `댓글 단 글 ${groups.comments.length}`;
    for (const kind of ['posts', 'comments']) byId(`community-activity-${kind}`).setAttribute('aria-pressed', String(state.activityTab === kind));
    const notice = byId('community-activity-status');
    notice.hidden = !state.activityError;
    notice.textContent = '내 활동을 새로 불러오지 못했어요. 저장된 기록이 표시될 수 있어요.';
  }
  async function refreshActivity() {
    const userId = ensureActivityUser();
    const request = ++state.activityRequest;
    try {
      const result = await window.loadCommunityActivity(userId, state.posts);
      if (request !== state.activityRequest || userId !== window.getUserId()) return;
      state.myComments = result.myComments;
      state.threadComments = result.comments;
      state.activityLoaded = true; state.activityError = false;
      storeLocal(activityKey(userId), result);
      const groups = mine();
      // On first use, existing comments become the baseline rather than all appearing new.
      for (const post of [...groups.posts, ...groups.comments]) {
        if (!Object.hasOwn(state.readMarks, post.id)) state.readMarks[post.id] = result.comments.filter(comment => comment.postId === post.id).map(comment => comment.id);
      }
      storeLocal(readKey(userId), state.readMarks);
      const active = state.posts.find(post => post.id === state.detailId);
      if (active && state.activeCommentList?.isConnected && [...groups.posts, ...groups.comments].some(post => post.id === active.id)) {
        paintComments(active, state.activeCommentList, result.comments.filter(comment => comment.postId === active.id));
      }
    } catch {
      if (request !== state.activityRequest) return;
      state.activityLoaded = true; state.activityError = true;
    }
    render();
  }
  function openActivity(push = true) {
    if (push && state.view !== 'activity') {
      history.replaceState({ ...history.state, page: 'habit-salon', communityListScroll: window.scrollY }, '', location.href);
      history.pushState({ page: 'habit-salon', communityView: 'activity', activityTab: state.activityTab }, '', '#habit-salon/activity');
    }
    state.view = 'activity'; state.query = '';
    byId('community-search-input').value = '';
    byId('community-search-form').hidden = true;
    byId('community-search-toggle').setAttribute('aria-expanded', 'false');
    render(); window.scrollTo(0, 0); refresh();
  }

  function updatePoints() {
    const points = window.pointsManager?.getPoints() ?? Number(localStorage.getItem('points') || 0);
    byId('habit-salon-my-point').textContent = points;
    byId('community-exchange').disabled = points < 5000 || !!window.couponRequestBusy;
  }

  function write(board) {
    state.nextBoard = boardOf(board);
    window.openWriteModal();
  }

  function emptyCard() {
    const card = el('div', 'community-empty');
    if (state.query.trim()) {
      card.append(el('h3', '', '검색 결과가 없어요'), el('p', '', '다른 단어로 건강 이야기를 찾아보세요.'));
      card.append(button('검색 지우기', 'community-more', () => { byId('community-search-input').value = ''; state.query = ''; render(); }));
      return card;
    }
    if (state.view === 'activity') {
      if (!state.activityLoaded) {
        card.append(el('p', '', '내 활동을 불러오는 중이에요…')); return card;
      }
      if (state.activityError) {
        card.append(el('h3', '', '내 활동을 확인하지 못했어요'), el('p', '', '연결을 확인한 뒤 다시 불러와 주세요.'));
        card.append(button('다시 불러오기', 'community-more', refresh)); return card;
      }
      card.append(el('h3', '', state.activityTab === 'posts' ? '아직 내가 쓴 글이 없어요' : '아직 댓글로 참여한 글이 없어요'),
        el('p', '', state.activityTab === 'posts' ? '나의 건강 이야기나 궁금한 점을 편하게 남겨보세요.' : '관심 있는 이야기에서 나의 경험이나 응원을 나눠보세요.'));
      card.append(button(state.activityTab === 'posts' ? '첫 이야기 남기기' : '전체 이야기 둘러보기', 'community-more', () => state.activityTab === 'posts' ? write('talk') : history.back()));
      return card;
    }
    const copy = {
      all: ['건강한 일상, 첫 이야기를 기다려요', '건강을 챙기며 겪는 일과 궁금한 점을 편하게 나눠주세요.'],
      talk: ['나의 건강 이야기를 들려주세요', '잘된 일도, 생각처럼 안 된 일도 함께 나눠요.'],
      question: ['늘봄에게 첫 질문을 남겨주세요', '건강한 일상을 위한 궁금한 점이나 늘봄에 바라는 이야기를 남겨주세요.'],
      practice: ['나를 위한 작은 시작을 기록해요', '각자의 생활에 맞는 목표와 실천 이야기를 기다려요.']
    }[state.board];
    card.append(el('h3', '', copy[0]), el('p', '', copy[1]));
    const links = el('div', 'community-empty-links');
    if (state.board === 'all') {
      links.append(button('건강 수다 · 요즘 건강을 위해 해본 일 →', '', () => write('talk')),
        button('궁금해요 · 다른 사람의 경험이 궁금할 때 →', '', () => write('question')));
    } else {
      links.append(button(`${boards[state.board]}에 첫 글 남기기 →`, '', () => write(state.board)));
    }
    card.append(links);
    return card;
  }

  function rememberAnswers(post, comments, fresh = true) {
    if (post.board !== 'question') return;
    commentVersions.set(post.id, (commentVersions.get(post.id) || 0) + 1);
    answerRecords.set(post.id, { status: fresh ? 'ready' : 'error', count: splitQuestionComments(post, comments).answers.length });
  }

  async function refreshQuestionAnswers() {
    const request = ++answerRequest;
    const questions = state.posts.filter(post => post.board === 'question');
    const versions = new Map(questions.map(post => [post.id, commentVersions.get(post.id) || 0]));
    for (const post of questions) {
      if (!answerRecords.has(post.id)) answerRecords.set(post.id, { status: 'loading', count: 0 });
    }
    if (!questions.length) return;
    try {
      const comments = await window.loadCommunityQuestionComments(questions.map(post => post.id));
      if (request !== answerRequest) return;
      for (const post of questions) {
        if (versions.get(post.id) !== (commentVersions.get(post.id) || 0)) continue;
        const thread = comments.filter(comment => comment.postId === post.id);
        if (state.detailId === post.id && state.activeCommentList?.isConnected) paintComments(post, state.activeCommentList, thread);
        else rememberAnswers(post, thread);
      }
    } catch {
      if (request !== answerRequest) return;
      for (const post of questions) {
        if (versions.get(post.id) === (commentVersions.get(post.id) || 0)) {
          answerRecords.set(post.id, { status: 'error', count: answerRecords.get(post.id)?.count || 0 });
        }
      }
    }
    render();
  }

  function answerStatus(post) {
    const record = answerRecords.get(post.id);
    const ready = record?.status === 'ready';
    const answered = ready && record.count > 0;
    const row = el('div', `community-answer-status${answered ? ' is-answered' : ''}`);
    row.append(el('span', '', answered ? '🌱 늘봄 답변' : ready ? '답변 기다리는 중' : record?.status === 'error' ? '답변 확인하기' : '답변 확인 중…'));
    if (answered || record?.status === 'error') {
      const arrow = el('span', '', '›'); arrow.setAttribute('aria-hidden', 'true'); row.append(arrow);
    }
    return row;
  }

  function paintAnswers(post, answers, fresh) {
    const section = detailShell?.querySelector('#community-operator-answers');
    if (!section || state.detailId !== post.id) return;
    section.replaceChildren();
    if (!fresh) section.append(el('p', 'community-answer-notice', '새 댓글을 확인하지 못했어요. 저장된 내용이 표시될 수 있어요.'));
    if (!answers.length) {
      if (fresh) {
        const waiting = el('div', 'community-answer-waiting');
        waiting.append(el('strong', '', '답변 기다리는 중'), el('p', '', '늘봄 운영자가 확인하고 답변할게요.'));
        section.append(waiting);
      }
      return;
    }
    for (const answer of answers) {
      const card = el('div', 'community-operator-answer');
      const header = el('div', 'community-answer-header');
      const avatar = el('span', 'community-answer-avatar', '🌱'); avatar.setAttribute('aria-hidden', 'true');
      header.append(avatar, el('strong', '', '늘봄'), el('span', 'community-operator', '운영자'), el('time', '', timeText(answer.timestamp)));
      const menu = ownerMenu('comment', answer, post); if (menu) header.append(menu);
      card.append(header, el('h2', '', '늘봄의 답변'), el('p', 'community-answer-body', answer.text ?? answer.content ?? ''));
      section.append(card);
    }
    const story = button('건강 이야기 둘러보기 →', 'community-answer-story', () => window.HealthStories?.open());
    section.lastElementChild.append(story);
  }

  function paintComments(post, list, comments, fresh = true) {
      const separated = splitQuestionComments(post, comments);
      rememberAnswers(post, comments, fresh);
      if (post.board === 'question') paintAnswers(post, separated.answers, fresh);
      list.replaceChildren();
      if (!separated.comments.length) list.append(el('p', 'community-secondary', '첫 번째 이야기를 남겨주세요.'));
      for (const comment of separated.comments) {
        const row = el('div', 'community-comment');
        const header = el('div', 'community-comment-header');
        header.append(el('strong', '', comment.nickname || comment.author || '익명'), el('time', '', timeText(comment.timestamp)));
        const menu = ownerMenu('comment', comment, post); if (menu) header.append(menu);
        row.append(header, el('p', '', comment.text ?? comment.content ?? ''));
        list.append(row);
      }
      markRead(post, comments);
      if (fresh) { post.commentCount = comments.length; syncPost(post); }
      if (state.detailId === post.id) {
        byId('community-detail-comment-heading').textContent = post.board === 'question' ? `댓글로 이야기 이어가기 ${separated.comments.length}` : `댓글 ${comments.length}`;
      }
  }
  async function loadComments(post, list) {
    if (!list) return;
    const version = (commentVersions.get(post.id) || 0) + 1;
    commentVersions.set(post.id, version);
    list.textContent = '댓글을 불러오는 중이에요…';
    try {
      const comments = post.board === 'question'
        ? await window.loadCommunityQuestionComments([post.id])
        : await window.getComments(post.type, post.id);
      if (!list.isConnected || state.detailId !== post.id || commentVersions.get(post.id) !== version) return;
      paintComments(post, list, comments);
      render();
    } catch (error) {
      if (!list.isConnected || state.detailId !== post.id || commentVersions.get(post.id) !== version) return;
      if (post.board === 'question') {
        let cached = [];
        try { cached = JSON.parse(localStorage.getItem(`cached_comments_free_${post.id}`) || '[]'); } catch {}
        paintComments(post, list, Array.isArray(cached) ? cached : [], false);
        list.prepend(el('p', '', '댓글을 새로 불러오지 못했어요.'));
        render();
      } else list.replaceChildren(el('p', '', '댓글을 불러오지 못했어요.'));
      list.append(button('다시 불러오기', 'community-more', () => loadComments(post, list)));
    }
  }

  const headlineOf = post => post.title || post.question || String(post.content ?? '').split('\n')[0].slice(0, 60) || boards[post.board];

  function postCard(post) {
    const card = el('article', 'community-post community-post-summary');
    card.dataset.postId = post.id;
    const link = el('a', 'community-post-link');
    link.href = `#habit-salon/post/${encodeURIComponent(post.id)}`;
    const unread = hasUnread(post);
    link.setAttribute('aria-label', `${headlineOf(post)} · 댓글 ${Number(post.commentCount) || 0}${unread ? ' · 새 댓글' : ''}`);
    link.addEventListener('click', event => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault(); openPost(post);
    });
    link.append(el('span', `community-chip community-chip-${post.board}`, boards[post.board]));
    if (unread) link.append(el('span', 'community-new-comment', '새 댓글'));
    const title = el('h3', '', headlineOf(post));
    link.append(title);
    const content = String(post.content ?? '').replace(/\s+/g, ' ').trim();
    if (content && content !== title.textContent) link.append(el('p', 'community-post-preview', content));
    const footer = el('div', 'community-summary-meta');
    footer.append(el('span', 'community-summary-author', post.nickname || '익명'), el('time', '', timeText(post.timestamp)));
    if (post.imageUrl) footer.append(el('span', 'community-attachment', '사진 첨부'));
    footer.append(el('span', 'community-summary-count', `댓글 ${Number(post.commentCount) || 0}`));
    link.append(footer);
    if (post.board === 'question') {
      const status = answerStatus(post); link.append(status);
      link.setAttribute('aria-label', `${link.getAttribute('aria-label')} · ${status.firstElementChild.textContent}`);
    }
    card.append(link);
    return card;
  }

  function syncPost(post) {
    const current = state.posts.find(item => item.id === post.id);
    if (current && current !== post) Object.assign(current, { likes: post.likes, isLiked: post.isLiked, commentCount: post.commentCount });
  }

  function openPost(post, push = true) {
    if (!detailShell || state.detailId === post.id) return;
    if (push) {
      state.listScroll = window.scrollY;
      state.returnPostId = post.id;
      history.replaceState({ ...history.state, page: 'habit-salon', communityListScroll: state.listScroll }, '', location.href);
      history.pushState({ page: 'habit-salon', communityPostId: post.id, communityListScroll: state.listScroll, communityView: state.view, activityTab: state.activityTab }, '', `#habit-salon/post/${encodeURIComponent(post.id)}`);
    }
    state.detailId = post.id;
    const nav = el('nav', 'community-detail-nav');
    nav.setAttribute('aria-label', '게시글 탐색');
    nav.append(button(post.board === 'question' && state.view === 'community' && state.board === 'question' ? '‹ 궁금해요' : '‹ 목록으로', 'community-detail-back', () => history.back()), el('span', '', boards[post.board]));
    detailShell.replaceChildren(nav, detailCard(post));
    listShell.hidden = true; detailShell.hidden = false;
    window.scrollTo(0, 0);
    byId('community-detail-title').focus({ preventScroll: true });
  }

  function closeDetail(restore = true) {
    if (!state.detailId) return;
    state.detailId = null;
    state.activeCommentList = null;
    detailShell.hidden = true; detailShell.replaceChildren(); listShell.hidden = false;
    render();
    if (restore) requestAnimationFrame(() => {
      if (state.detailId) return;
      const row = [...byId('community-feed').children].find(node => node.dataset.postId === state.returnPostId);
      row?.querySelector('a')?.focus({ preventScroll: true });
      window.scrollTo(0, state.listScroll);
    });
  }

  function detailCard(post) {
    const card = el('article', 'community-post community-post-detail');
    card.dataset.postId = post.id;
    card.dataset.postType = post.type;
    const meta = el('div', 'community-card-meta');
    meta.append(el('span', `community-chip community-chip-${post.board}`, boards[post.board]),
      el('span', 'community-author', post.nickname || '익명'));
    meta.append(el('time', 'community-time', timeText(post.timestamp)));
    const menu = ownerMenu('post', post); if (menu) meta.append(menu);
    card.append(meta);
    const content = String(post.content ?? '');
    const title = el('h1', '', headlineOf(post));
    title.id = 'community-detail-title'; title.tabIndex = -1;
    card.append(title);
    if (content) card.append(el('p', 'community-post-body', content));
    const imageUrl = post.imageUrl ? safeImage(post.imageUrl, document.baseURI) : '';
    if (imageUrl) {
      const photo = button('', 'community-photo', () => window.openImageModal(imageUrl));
      photo.setAttribute('aria-label', '게시글 사진 크게 보기');
      const image = el('img'); image.src = imageUrl; image.alt = '게시글에 첨부한 사진'; image.loading = 'lazy';
      image.addEventListener('error', () => { photo.hidden = true; }, { once: true });
      photo.append(image); card.append(photo);
    }
    const actions = el('div', 'community-actions');
    let liked = localStorage.getItem(`like_${post.type}_${post.id}`) === 'true' || post.isLiked === true;
    const like = button('', '', async () => {
      if (like.disabled) return;
      like.disabled = true;
      try {
        const next = await window.toggleLike(post.type, post.id);
        if (next !== liked) post.likes = Math.max(0, (Number(post.likes) || 0) + (next ? 1 : -1));
        liked = next; post.isLiked = next; syncPost(post); paintLike();
      } catch { notify('좋아요를 처리하지 못했어요.'); }
      finally { like.disabled = false; }
    });
    function paintLike() { like.textContent = `${liked ? '♥' : '♡'} ${post.likes || 0}`; like.setAttribute('aria-pressed', String(liked)); }
    paintLike(); like.setAttribute('aria-label', '좋아요');
    const comments = el('section', 'community-comments'); comments.id = 'community-detail-comments';
    const commentHeading = el('h2'); commentHeading.id = 'community-detail-comment-heading';
    comments.setAttribute('aria-labelledby', commentHeading.id);
    const list = el('div');
    state.activeCommentList = list;
    const form = el('form', 'community-comment-form');
    const writingAnswer = post.board === 'question' && isOperatorComment({ userId: window.getUserId() });
    const label = el('label', '', writingAnswer ? '늘봄 답변 남기기' : '댓글 남기기 · 등록 시 30P');
    const input = el('textarea'); input.maxLength = 200; input.placeholder = '나의 경험이나 응원을 남겨주세요.'; input.required = true;
    if (writingAnswer) input.placeholder = '질문에 대한 늘봄 운영자 답변을 남겨주세요.';
    input.id = 'community-detail-comment-input'; label.htmlFor = input.id;
    const submitLabel = writingAnswer ? '답변 등록' : '댓글 등록';
    const submit = el('button', '', submitLabel); submit.type = 'submit';
    form.append(label, input, submit);
    const paintCount = () => { commentHeading.textContent = post.board === 'question' ? '댓글로 이야기 이어가기' : `댓글 ${Number(post.commentCount) || 0}`; };
    paintCount();
    let submitting = false;
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const text = input.value.trim();
      if (submitting || !text || text.length > 200) return;
      submitting = true; submit.disabled = true; submit.textContent = '등록 중…';
      try {
        await window.addComment(post.type, post.id, text);
        input.value = ''; post.commentCount = (Number(post.commentCount) || 0) + 1; syncPost(post); paintCount(); updatePoints();
        notify('댓글이 등록되었습니다! +30P 적립 🎉', 'success');
        await loadComments(post, list);
        await refreshActivity();
      } catch { notify('댓글을 등록하지 못했어요. 입력한 내용은 유지했어요.'); }
      finally { submitting = false; submit.disabled = false; submit.textContent = submitLabel; }
    });
    comments.append(commentHeading, list, form); actions.append(like); card.append(actions);
    if (post.board === 'question') {
      const answers = el('section', 'community-operator-answers'); answers.id = 'community-operator-answers';
      answers.setAttribute('aria-label', '늘봄 운영자 답변');
      answers.append(el('p', 'community-answer-notice', '늘봄 답변을 확인하고 있어요…'));
      card.append(answers);
    }
    card.append(comments);
    loadComments(post, list);
    return card;
  }

  function render() {
    const feed = byId('community-feed');
    if (!feed) return;
    ensureActivityUser(); paintActivity();
    const inActivity = state.view === 'activity';
    for (const selector of ['.community-hero', '.community-filters', '.community-welcome', '.community-points']) listShell.querySelector(selector).hidden = inActivity;
    byId('community-activity-panel').hidden = !inActivity;
    const inQuestions = !inActivity && state.board === 'question';
    byId('community-question-invite').hidden = !inQuestions;
    listShell.querySelector('.community-welcome').hidden = inActivity || inQuestions;
    byId('community-search-toggle').hidden = inQuestions;
    if (inQuestions) {
      byId('community-search-form').hidden = false;
      byId('community-search-toggle').setAttribute('aria-expanded', 'true');
    }
    byId('community-write-label').textContent = inQuestions ? '질문 남기기' : '글쓰기';
    document.querySelectorAll('[data-community-board]').forEach(node => node.setAttribute('aria-pressed', String(node.dataset.communityBoard === state.board)));
    byId('community-feed-title').textContent = inActivity ? (state.activityTab === 'posts' ? '내가 쓴 글' : '댓글 단 글') : state.board === 'all' ? '전체 이야기' : boards[state.board];
    byId('community-practice-invite').hidden = inActivity || !['all', 'practice'].includes(state.board) || Boolean(state.query.trim());
    if (!state.loaded) return;
    const visible = select(inActivity ? mine()[state.activityTab] : state.posts, inActivity ? 'all' : state.board, state.query, state.sort);
    feed.replaceChildren(...(visible.length ? visible.map(postCard) : [emptyCard()]));
  }

  async function refresh() {
    if (state.manageDialog) return;
    const request = ++state.request;
    state.lastRefresh = Date.now();
    const feed = byId('community-feed');
    feed.setAttribute('aria-busy', 'true');
    if (!state.loaded) feed.textContent = '건강 이야기를 불러오는 중이에요…';
    try {
      const [users] = await Promise.allSettled([window.loadUserPosts()]);
      if (request !== state.request) return;
      state.posts = entries(users.status === 'fulfilled' ? users.value : []);
      state.loaded = true;
      const error = users.status === 'rejected' || window.communityReadErrors?.posts;
      const status = byId('community-status');
      status.hidden = !error && navigator.onLine;
      status.replaceChildren();
      if (error || !navigator.onLine) {
        status.append(el('span', '', '연결이 원활하지 않아 저장된 글만 보일 수 있어요. '), button('다시 불러오기', 'community-more', refresh));
      }
      render();
      await Promise.all([refreshActivity(), refreshQuestionAnswers()]);
    } finally { if (request === state.request) feed.setAttribute('aria-busy', 'false'); }
  }

  window.Community = {
    ...model,
    async open(board) {
      state.view = 'community'; closeDetail(false);
      if (board) state.board = board === 'all' ? 'all' : boardOf(board);
      byId('main-section').style.display = 'none';
      byId('habit-salon-main').style.display = 'block';
      render(); updatePoints();
      await refresh();
    },
    refresh,
    prepareWrite() {
      if (state.view === 'activity') {
        state.activityTab = 'posts';
        history.replaceState({ ...history.state, activityTab: 'posts' }, '', location.href);
      }
      const chosen = state.nextBoard || (state.board === 'all' ? 'talk' : state.board);
      byId('community-post-board').value = boardOf(chosen);
      state.nextBoard = null;
    },
    posted(board) {
      if (state.board !== 'all') state.board = boardOf(board);
      state.query = ''; byId('community-search-input').value = '';
      byId('community-post-title').value = '';
      render();
    }
  };

  document.addEventListener('DOMContentLoaded', () => {
    const root = byId('habit-salon-main');
    listShell = root.querySelector('.community-shell');
    detailShell = el('div', 'community-shell community-detail-shell');
    detailShell.hidden = true; root.append(detailShell);
    const topbarActions = el('div', 'community-topbar-actions');
    const activityToggle = button('내 활동', 'community-activity-toggle', () => state.view === 'activity' ? history.back() : openActivity());
    activityToggle.id = 'community-activity-toggle'; activityToggle.setAttribute('aria-pressed', 'false');
    const activityBadge = el('span', 'community-activity-badge');
    activityBadge.id = 'community-activity-badge'; activityBadge.hidden = true; activityBadge.setAttribute('aria-hidden', 'true');
    activityToggle.append(activityBadge);
    topbarActions.append(activityToggle, byId('community-search-toggle'));
    listShell.querySelector('.community-topbar').append(topbarActions);
    const activityPanel = el('section', 'community-activity-panel');
    activityPanel.id = 'community-activity-panel'; activityPanel.hidden = true;
    activityPanel.append(el('h1', '', '내 활동'), el('p', '', '내가 나눈 이야기와 새 댓글을 모아봐요.'));
    const activityTabs = el('div', 'community-activity-tabs'); activityTabs.setAttribute('role', 'group'); activityTabs.setAttribute('aria-label', '내 활동 보기');
    for (const kind of ['posts', 'comments']) {
      const tab = button('', '', () => {
        state.activityTab = kind;
        history.replaceState({ ...history.state, activityTab: kind }, '', location.href);
        render();
      });
      tab.id = `community-activity-${kind}`; activityTabs.append(tab);
    }
    const activityStatus = el('p', 'community-activity-status'); activityStatus.id = 'community-activity-status'; activityStatus.hidden = true; activityStatus.setAttribute('role', 'status');
    activityPanel.append(activityTabs, activityStatus, button('새로고침', 'community-activity-refresh', refresh));
    listShell.querySelector('.community-topbar').after(activityPanel);
    const observeVisibility = () => document.body.classList.toggle('community-active', root.style.display !== 'none');
    new MutationObserver(observeVisibility).observe(root, { attributes: true, attributeFilter: ['style'] });
    observeVisibility();
    document.querySelectorAll('[data-community-board]').forEach(node => node.addEventListener('click', () => { state.board = node.dataset.communityBoard; render(); }));
    byId('community-sort').addEventListener('change', event => { state.sort = event.target.value; render(); });
    byId('community-search-toggle').addEventListener('click', () => {
      const form = byId('community-search-form'); form.hidden = !form.hidden;
      byId('community-search-toggle').setAttribute('aria-expanded', String(!form.hidden));
      if (!form.hidden) byId('community-search-input').focus();
      else { state.query = ''; byId('community-search-input').value = ''; render(); }
    });
    byId('community-search-form').addEventListener('submit', event => event.preventDefault());
    byId('community-search-input').addEventListener('input', event => { state.query = event.target.value; render(); });
    byId('community-practice-write').addEventListener('click', () => write('practice'));
    byId('community-brand-link').addEventListener('click', () => window.openBrandStoryPage());
    byId('community-questions-link').addEventListener('click', () => window.openQuestionPage());
    byId('community-exchange').addEventListener('click', () => window.requestExchange());
    window.addEventListener('pointsChanged', updatePoints);
    window.addEventListener('pointsUpdated', updatePoints);
    window.addEventListener('storage', event => { if (event.key === 'points') updatePoints(); });
    window.addEventListener('online', () => { if (root.style.display !== 'none') refresh(); });
    window.addEventListener('popstate', event => {
      if (state.manageDialog && !state.manageDialog.busy) state.manageDialog.node.close();
      if (byId('image-modal').classList.contains('active')) window.closeImageModal();
      if (event.state?.page === 'habit-salon') {
        const wasDetail = Boolean(state.detailId);
        state.view = event.state.communityView === 'activity' ? 'activity' : 'community';
        state.activityTab = event.state.activityTab === 'comments' ? 'comments' : 'posts';
        state.listScroll = event.state.communityListScroll ?? state.listScroll;
        const post = state.posts.find(item => item.id === event.state.communityPostId);
        if (post) openPost(post, false);
        else closeDetail();
        render(); updatePoints();
        if (!post && !wasDetail) requestAnimationFrame(() => window.scrollTo(0, event.state.communityListScroll || 0));
      } else closeDetail(false);
    });
    const refreshWhenVisible = () => {
      if (!document.hidden && !state.manageDialog && root.style.display !== 'none' && !byId('free-write-fullscreen').classList.contains('active') && Date.now() - state.lastRefresh > 30000) refresh();
    };
    window.setInterval(refreshWhenVisible, 60000);
    window.addEventListener('focus', refreshWhenVisible);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    document.addEventListener('click', event => {
      document.querySelectorAll('.community-owner-menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
    });
    updatePoints();
    // Older page handlers also listen for Escape; handle community navigation once.
    document.addEventListener('keydown', event => {
      if (state.manageDialog) {
        if (event.key === 'Escape') {
          event.preventDefault(); event.stopImmediatePropagation();
          if (!state.manageDialog.busy) state.manageDialog.node.close();
        }
        return;
      }
      if (event.key === 'Escape' && document.querySelector('.community-owner-menu[open]')) {
        event.preventDefault(); event.stopImmediatePropagation();
        document.querySelectorAll('.community-owner-menu[open]').forEach(menu => { menu.open = false; menu.querySelector('summary').focus(); });
        return;
      }
      const modal = byId('free-write-fullscreen');
      if (modal.classList.contains('active') && event.key === 'Tab') {
        const controls = [...modal.querySelectorAll('button:not(:disabled), input:not([type="file"]), select, textarea')].filter(node => node.getClientRects().length);
        const first = controls[0], last = controls[controls.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
        return;
      }
      if (root.style.display === 'none' || (event.key !== 'Escape' && event.keyCode !== 4)) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (byId('image-modal').classList.contains('active')) window.closeImageModal();
      else if (byId('free-write-fullscreen').classList.contains('active')) window.closeWriteModal();
      else history.back();
    }, true);
    if (location.hash === '#habit-salon' || location.hash === '#habit-salon/activity' || location.hash.startsWith('#habit-salon/post/')) {
      const requestedActivity = location.hash === '#habit-salon/activity';
      let requestedPost;
      try { requestedPost = decodeURIComponent(location.hash.split('/post/')[1] || ''); } catch { requestedPost = ''; }
      history.replaceState({ page: 'habit-salon' }, '', '#habit-salon');
      window.initHabitSalon().then(() => {
        if (requestedActivity) openActivity();
        const post = state.posts.find(item => item.id === requestedPost);
        if (post) openPost(post);
      });
    }
  });
})();
