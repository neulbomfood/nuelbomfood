/* Native health stories; comments use the existing browser identity and reward service. */
(() => {
  const categories = { knowledge: '건강 바로알기', habits: '작은 습관', thoughts: '늘봄의 생각' };
  const posts = window.NEULBOM_HEALTH_STORIES || [];
  const byId = id => document.getElementById(id);
  const root = byId('health-story-section');
  if (!root) return;
  const listView = byId('health-story-list-view');
  const detailView = byId('health-story-detail-view');
  const grid = byId('health-stories-grid');
  const pageSize = 24, feedPageSize = 6;
  const batchSize = () => state.category === 'all' ? feedPageSize : pageSize;
  const state = { category: 'all', query: '', limit: feedPageSize, postId: null, returnId: null, scroll: 0 };
  const mediaObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    entries.forEach(entry => { if (!entry.isIntersecting) entry.target.pause(); });
  }, { threshold: 0 }) : null;
  const moreObserver = typeof IntersectionObserver === 'function' ? new IntersectionObserver(entries => {
    if (entries.some(entry => entry.isIntersecting) && state.category === 'all'
      && document.body.classList.contains('health-stories-active')) loadMore(true);
  }, { rootMargin: '600px 0px' }) : null;
  const searchText = value => value.normalize('NFC').toLocaleLowerCase().trim();
  const searchable = new Map(posts.map(post => [post.id, searchText(`${post.title} ${post.caption}`)]));
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const validCategory = value => Object.hasOwn(categories, value) ? value : 'all';
  const route = () => location.hash.match(/^#health-story(?:\/post\/([\w-]+))?$/);
  const categoryTag = post => el('span', 'health-stories-category', categories[post.category]);
  const button = (label, className, action) => {
    const node = el('button', className, label); node.type = 'button';
    node.addEventListener('click', action); return node;
  };
  const backButton = (label, action) => {
    const node = button('', 'health-stories-back', action);
    const arrow = el('span', '', '‹'); arrow.setAttribute('aria-hidden', 'true');
    node.append(arrow, document.createTextNode(label)); return node;
  };
  function stopMedia() {
    root.querySelectorAll('video').forEach(video => video.pause());
  }
  function updateVisibility() {
    const visible = root.style.display !== 'none' && byId('main-section').style.display === 'none'
      && !document.querySelector('.fullscreen-page.active');
    document.body.classList.toggle('health-stories-active', visible);
    if (!visible) { stopMedia(); moreObserver?.disconnect(); }
    else observeMore();
  }
  function showRoot() {
    byId('main-section').style.display = 'none';
    byId('habit-salon-main').style.display = 'none';
    byId('shorts-section').style.display = 'none';
    root.style.display = 'block'; updateVisibility();
  }
  function rememberList(resetPosition = false) {
    if (resetPosition) { state.scroll = 0; state.returnId = null; }
    history.replaceState({ ...history.state, storyCategory: state.category,
      storyQuery: state.query, storyLimit: state.limit,
      ...(resetPosition ? { storyScroll: 0, storyReturnId: null } : {}) }, '', location.href);
  }
  function renderFeedPost(post) {
    const article = el('article', 'health-stories-feed-post');
    article.dataset.storyId = post.id;
    const header = el('header', 'health-stories-feed-header');
    const avatar = el('span', 'health-stories-feed-avatar', '늘봄'); avatar.setAttribute('aria-hidden', 'true');
    const author = el('div', 'health-stories-feed-author');
    author.append(el('strong', '', '늘봄식품'));
    if (post.publishedAt) {
      const date = el('time', '', new Date(post.publishedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }));
      date.dateTime = post.publishedAt; author.append(date);
    }
    header.append(avatar, author, categoryTag(post)); article.append(header);
    addMedia(post, article, true);
    const body = el('div', 'health-stories-feed-body');
    const title = el('h3', 'health-stories-feed-title', post.title);
    title.id = `health-feed-title-${post.id}`; article.setAttribute('aria-labelledby', title.id);
    body.append(title);
    const text = post.caption.trim();
    if (text) {
      const caption = el('p', 'health-stories-feed-caption', text);
      caption.id = `health-feed-caption-${post.id}`;
      // Keep the full caption in the page; the control only expands its presentation.
      if (text.length > 110 || text.split('\n').length > 3) {
        caption.classList.add('is-collapsed');
        const expand = button('더 보기', 'health-stories-feed-expand', () => {
          const expanded = expand.getAttribute('aria-expanded') !== 'true';
          caption.classList.toggle('is-collapsed', !expanded);
          expand.setAttribute('aria-expanded', String(expanded));
          expand.textContent = expanded ? '접기' : '더 보기';
        });
        expand.setAttribute('aria-expanded', 'false'); expand.setAttribute('aria-controls', caption.id);
        body.append(caption, expand);
      } else body.append(caption);
    }
    const comments = el('div', 'health-stories-feed-comments');
    comments.id = `health-feed-comments-${post.id}`; comments.hidden = true;
    let mounted = false;
    const toggle = button('댓글 보기 · 남기기', 'health-stories-feed-comment-toggle', () => {
      const open = comments.hidden;
      comments.hidden = !open; toggle.setAttribute('aria-expanded', String(open));
      toggle.textContent = open ? '댓글 접기' : '댓글 보기 · 남기기';
      if (open && !mounted) { window.HealthStoryComments.mount(post, comments); mounted = true; }
    });
    toggle.setAttribute('aria-expanded', 'false'); toggle.setAttribute('aria-controls', comments.id);
    body.append(toggle, comments); article.append(body); return article;
  }
  function loadMore(automatic = false) {
    const more = byId('health-stories-load-more');
    if (more.hidden || listView.hidden || root.style.display === 'none') return;
    const firstNew = grid.children.length;
    state.limit += batchSize(); rememberList(); renderList(true);
    if (!automatic) {
      const added = grid.children[firstNew];
      if (state.category === 'all') { added.tabIndex = -1; added.focus({ preventScroll: true }); }
      else added?.querySelector('a')?.focus({ preventScroll: true });
    }
  }
  function observeMore() {
    if (!moreObserver) return;
    moreObserver.disconnect();
    const more = byId('health-stories-load-more');
    if (state.category === 'all' && !more.hidden && !listView.hidden && root.style.display !== 'none') moreObserver.observe(more);
  }

  function renderList(append = false) {
    document.querySelectorAll('[data-health-category]').forEach(node => {
      node.setAttribute('aria-pressed', String(node.dataset.healthCategory === state.category));
    });
    const isFeed = state.category === 'all';
    grid.classList.toggle('health-stories-feed', isFeed);
    const offset = append ? grid.children.length : 0;
    if (!append) {
      grid.querySelectorAll('video').forEach(video => { video.pause(); mediaObserver?.unobserve(video); });
      grid.replaceChildren();
    }
    const query = searchText(state.query);
    const visible = posts.filter(post => (state.category === 'all' || post.category === state.category)
      && (!query || searchable.get(post.id).includes(query)));
    visible.slice(offset, state.limit).forEach(post => {
      if (isFeed) { grid.append(renderFeedPost(post)); return; }
      const card = el('article', 'health-stories-card');
      const link = el('a', 'health-stories-card-link');
      link.href = `#health-story/post/${post.id}`; link.dataset.storyId = post.id;
      link.setAttribute('aria-label', `${categories[post.category]} · ${post.title}`);
      link.addEventListener('click', event => {
        if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
        event.preventDefault(); openPost(post);
      });
      const cover = el('div', 'health-stories-cover'); cover.dataset.tone = post.tone || 'dark';
      const image = el('img'); image.src = post.cover; image.alt = ''; image.loading = 'lazy'; image.decoding = 'async';
      image.width = post.width; image.height = post.height;
      cover.append(image);
      const icon = el('span', 'health-stories-media-icon'); icon.setAttribute('aria-hidden', 'true');
      icon.innerHTML = post.kind === 'reel'
        ? '<svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="1.5"/><path d="m10 7 7 5-7 5Z" fill="currentColor"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><rect x="3" y="3" width="14" height="14" rx="2"/><path d="M8 21h11a2 2 0 0 0 2-2V8"/></svg>';
      cover.append(icon);
      const title = el('h3', 'health-stories-card-title', post.title);
      link.append(cover, categoryTag(post), title); card.append(link); grid.append(card);
    });
    const count = Math.min(state.limit, visible.length);
    byId('health-stories-status').textContent = `${query ? '검색 결과' : state.category === 'all' ? '전체' : categories[state.category]} ${visible.length}개`;
    const more = byId('health-stories-load-more');
    more.hidden = count >= visible.length;
    more.textContent = `이야기 더 보기 (${count} / ${visible.length})`;
    byId('health-stories-empty').hidden = visible.length > 0;
    if (byId('health-stories-search').value !== state.query) byId('health-stories-search').value = state.query;
    observeMore();
  }
  function addMedia(post, article, inFeed = false) {
    if (post.kind === 'reel' && post.video) {
      const video = el('video', 'health-stories-video');
      video.controls = true; video.playsInline = true; video.preload = inFeed ? 'none' : 'metadata';
      video.poster = post.cover; video.src = post.video;
      video.width = post.videoWidth || post.width; video.height = post.videoHeight || post.height;
      video.setAttribute('aria-label', post.title);
      const note = el('p', 'health-stories-media-note'); note.hidden = true;
      note.setAttribute('role', 'status');
      video.addEventListener('error', () => {
        note.hidden = false; note.textContent = '영상을 불러오지 못했어요. 새로고침 후 다시 시도해 주세요.';
      });
      video.addEventListener('play', () => {
        root.querySelectorAll('video').forEach(other => { if (other !== video) other.pause(); });
      });
      if (inFeed) mediaObserver?.observe(video);
      article.append(video, note);
      return;
    }
    const slides = post.slides?.length ? post.slides : [
      { src: post.cover, width: post.width, height: post.height, alt: post.title }
    ];
    const gallery = el('section', 'health-stories-gallery');
    gallery.setAttribute('aria-label', `${post.title} 카드뉴스`);
    gallery.setAttribute('aria-roledescription', '슬라이드');
    const image = el('img', 'health-stories-slide'); image.decoding = 'async';
    if (inFeed) image.loading = 'lazy';
    image.dataset.tone = post.tone || 'dark'; image.draggable = false;
    const controls = el('div', 'health-stories-gallery-controls');
    const counter = el('span', 'health-stories-gallery-count');
    counter.setAttribute('aria-live', 'polite'); counter.setAttribute('aria-atomic', 'true');
    let index = 0;
    const previous = button('‹', 'health-stories-gallery-arrow', () => show(index - 1));
    const next = button('›', 'health-stories-gallery-arrow', () => show(index + 1));
    previous.setAttribute('aria-label', '이전 카드'); next.setAttribute('aria-label', '다음 카드');
    // Keep focus on an arrow at either end so keyboard navigation remains usable.
    function show(value) {
      index = Math.max(0, Math.min(slides.length - 1, value));
      const slide = slides[index];
      image.src = slide.src; image.width = slide.width; image.height = slide.height;
      image.alt = `${index + 1}번째 카드: ${slide.alt || post.title}`;
      counter.textContent = `${index + 1} / ${slides.length}`;
      previous.setAttribute('aria-disabled', String(index === 0));
      next.setAttribute('aria-disabled', String(index === slides.length - 1));
    }
    gallery.addEventListener('keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); show(index + (event.key === 'ArrowRight' ? 1 : -1));
    });
    let touchStart;
    image.addEventListener('touchstart', event => {
      touchStart = event.touches.length === 1 ? { x: event.touches[0].clientX, y: event.touches[0].clientY } : null;
    }, { passive: true });
    image.addEventListener('touchend', event => {
      if (!touchStart || !event.changedTouches.length) return;
      const dx = event.changedTouches[0].clientX - touchStart.x;
      const dy = event.changedTouches[0].clientY - touchStart.y;
      touchStart = null;
      if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy) * 1.5) show(index + (dx < 0 ? 1 : -1));
    }, { passive: true });
    image.addEventListener('touchcancel', () => { touchStart = null; }, { passive: true });
    controls.append(previous, counter, next); controls.hidden = slides.length < 2;
    gallery.append(image, controls); article.append(gallery); show(0);
  }

  function renderDetail(post, focus = true) {
    stopMedia(); moreObserver?.disconnect(); state.postId = post.id;
    listView.hidden = true; detailView.hidden = false; detailView.replaceChildren();
    root.setAttribute('aria-labelledby', 'health-story-detail-title');
    const topbar = el('nav', 'health-stories-topbar'); topbar.setAttribute('aria-label', '콘텐츠 탐색');
    topbar.append(backButton('건강 이야기', backToList), el('span', 'health-stories-wordmark', '늘봄'));
    const article = el('article');
    const header = el('header', 'health-stories-detail-header');
    const title = el('h1', '', post.title); title.id = 'health-story-detail-title'; title.tabIndex = -1;
    const credit = el('p', 'health-stories-credit', '늘봄식품 · @neulbom_food');
    if (post.publishedAt) {
      const date = el('time', '', new Date(post.publishedAt).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' }));
      date.dateTime = post.publishedAt; credit.append(document.createTextNode(' · '), date);
    }
    header.append(categoryTag(post), title, credit);
    article.append(header); addMedia(post, article);
    const caption = el('section', 'health-stories-caption');
    caption.append(el('h2', '', '함께 읽는 이야기'));
    post.caption.split(/\n\s*\n/).filter(Boolean).forEach(text => caption.append(el('p', '', text.trim())));
    if (post.caption.trim()) article.append(caption);
    window.HealthStoryComments.mount(post, article);
    const footer = el('div', 'health-stories-detail-footer'); footer.append(backButton('목록으로 돌아가기', backToList));
    detailView.append(topbar, article, footer);
    if (focus) { window.scrollTo(0, 0); title.focus({ preventScroll: true }); }
  }
  function showList(restore = false) {
    const returnId = state.returnId;
    stopMedia(); state.postId = null; detailView.replaceChildren();
    detailView.hidden = true; listView.hidden = false; root.setAttribute('aria-labelledby', 'health-story-title');
    renderList();
    requestAnimationFrame(() => {
      if (state.postId || root.style.display === 'none') return;
      const link = [...grid.querySelectorAll('a')].find(node => node.dataset.storyId === returnId);
      (restore && link ? link : byId('health-story-title')).focus({ preventScroll: true });
      window.scrollTo(0, restore ? state.scroll : 0);
    });
  }
  function openPost(post) {
    state.scroll = window.scrollY; state.returnId = post.id;
    rememberList();
    history.replaceState({ ...history.state, storyScroll: state.scroll, storyReturnId: post.id }, '', location.href);
    history.pushState({ page: 'health-story', storyPostId: post.id, storyCategory: state.category,
      storyQuery: state.query, storyLimit: state.limit, storyFromList: true }, '', `#health-story/post/${post.id}`);
    showRoot(); renderDetail(post);
  }
  function backToList() {
    if (history.state?.storyFromList) { history.back(); return; }
    history.replaceState({ page: 'health-story', storyCategory: state.category }, '', '#health-story');
    showRoot(); showList();
  }
  function backHome() {
    if (history.state?.storyFromHome) { history.back(); return; }
    stopMedia(); root.style.display = 'none'; byId('main-section').style.display = 'block';
    history.replaceState({ page: 'main' }, '', location.pathname + location.search);
    updateVisibility(); window.scrollTo(0, 0); byId('home-brand').focus({ preventScroll: true });
  }
  function syncRoute() {
    const match = route();
    if (!match) {
      if (root.style.display === 'none') {
        stopMedia(); state.postId = null; detailView.replaceChildren(); detailView.hidden = true; listView.hidden = false;
      }
      updateVisibility(); return;
    }
    state.category = validCategory(history.state?.storyCategory);
    state.query = typeof history.state?.storyQuery === 'string' ? history.state.storyQuery : '';
    state.limit = Math.max(batchSize(), Math.min(posts.length, Number(history.state?.storyLimit) || batchSize()));
    showRoot();
    const post = posts.find(item => item.id === match[1]);
    if (post) {
      if (state.postId !== post.id || detailView.hidden) renderDetail(post);
    } else {
      state.scroll = history.state?.storyScroll || 0; state.returnId = history.state?.storyReturnId || null;
      showList(Boolean(state.returnId));
    }
  }
  window.HealthStories = {
    open() {
      state.category = 'all'; state.query = ''; state.limit = feedPageSize; state.scroll = 0; state.returnId = null;
      history.pushState({ page: 'health-story', storyFromHome: true, storyCategory: 'all' }, '', '#health-story');
      showRoot(); showList();
    },
    backHome
  };
  document.addEventListener('DOMContentLoaded', () => {
    renderList();
    document.querySelectorAll('[data-health-category]').forEach(node => node.addEventListener('click', () => {
      state.category = validCategory(node.dataset.healthCategory);
      state.limit = batchSize(); rememberList(true);
      renderList();
    }));
    byId('health-stories-search').addEventListener('input', event => {
      state.query = event.target.value; state.limit = batchSize();
      rememberList(true); renderList();
    });
    byId('health-stories-search-form').addEventListener('submit', event => event.preventDefault());
    byId('health-stories-load-more').addEventListener('click', () => loadMore());
    const visibilityObserver = new MutationObserver(updateVisibility);
    [root, byId('main-section'), ...document.querySelectorAll('.fullscreen-page')].forEach(node => {
      visibilityObserver.observe(node, { attributes: true, attributeFilter: ['style', 'class'] });
    });
    window.addEventListener('pagehide', stopMedia);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopMedia(); });
    window.addEventListener('popstate', syncRoute);
    window.addEventListener('hashchange', syncRoute);
    document.addEventListener('keydown', event => {
      if ((event.key !== 'Escape' && event.keyCode !== 4) || !document.body.classList.contains('health-stories-active') || byId('home-nickname-dialog').open) return;
      event.preventDefault(); event.stopImmediatePropagation();
      if (state.postId) backToList(); else backHome();
    }, true);
    const match = route();
    if (match) {
      history.replaceState({ ...history.state, page: 'health-story', storyPostId: match[1] || null }, '', location.href);
      syncRoute();
    } else updateVisibility();
  });
})();
