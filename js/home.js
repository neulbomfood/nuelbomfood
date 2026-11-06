/* Home presentation only; registration, rewards and content use the existing services. */
(() => {
  const byId = id => document.getElementById(id);
  const dialog = byId('home-nickname-dialog');
  const form = byId('nickname-form');
  const input = byId('nicknameInput');
  const opener = byId('home-nickname-open');
  const greeting = byId('home-greeting');
  const error = byId('home-nickname-error');
  const submit = byId('home-nickname-submit');
  let returnFocus;

  window.setNicknameError = message => {
    error.textContent = message;
    error.hidden = !message;
    input.setAttribute('aria-invalid', message ? 'true' : 'false');
  };

  const closeNickname = () => {
    if (dialog.open) dialog.close();
  };

  const refreshNickname = () => {
    const nickname = localStorage.getItem('nickname');
    opener.hidden = Boolean(nickname);
    greeting.hidden = !nickname;
    greeting.textContent = nickname ? `${nickname}님, 반가워요` : '';
    if (nickname) closeNickname();
  };

  const openNickname = () => {
    if (localStorage.getItem('nickname')) return;
    returnFocus = document.activeElement;
    form.style.display = 'flex';
    window.setNicknameError('');
    dialog.showModal();
    document.body.classList.add('home-dialog-open');
    sessionStorage.setItem('neulbomNicknamePromptSeen', 'true');
    input.focus();
  };

  opener.addEventListener('click', openNickname);
  byId('home-nickname-close').addEventListener('click', closeNickname);
  dialog.addEventListener('close', () => {
    document.body.classList.remove('home-dialog-open');
    const focusTarget = returnFocus && !returnFocus.hidden && returnFocus !== document.body
      ? returnFocus : byId('home-brand');
    focusTarget.focus();
  });
  // Legacy screens also listen for Escape. A dialog close must not navigate away.
  document.addEventListener('keydown', event => {
    if (dialog.open && (event.key === 'Escape' || event.keyCode === 4)) {
      event.preventDefault();
      event.stopImmediatePropagation();
      closeNickname();
    }
  }, true);
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled) return;
    window.setNicknameError('');
    if (!input.value.trim()) {
      window.setNicknameError('닉네임을 입력해주세요.');
      input.focus();
      return;
    }
    if (typeof window.registerNickname !== 'function') {
      window.setNicknameError('연결을 확인하고 잠시 후 다시 시도해주세요.');
      return;
    }
    submit.disabled = true;
    submit.textContent = '등록 중…';
    try {
      await window.registerNickname();
      refreshNickname();
    } catch (e) {
      window.setNicknameError('등록하지 못했어요. 잠시 후 다시 시도해주세요.');
    } finally {
      submit.disabled = false;
      submit.textContent = '등록하고 시작하기';
    }
  });
  window.addEventListener('nicknameUpdated', refreshNickname);
  window.addEventListener('storage', event => {
    if (event.key === 'nickname') refreshNickname();
  });

  byId('health-story-enter-btn').addEventListener('click', () => {
    if (window.HealthStories) { window.HealthStories.open(); return; }
    byId('main-section').style.display = 'none';
    byId('health-story-section').style.display = 'block';
    history.pushState({ page: 'health-story' }, '', '#health-story');
    window.scrollTo(0, 0);
    byId('health-story-title').focus();
  });
  byId('health-story-back').addEventListener('click', () => window.HealthStories ? window.HealthStories.backHome() : history.back());
  byId('health-brand-link').addEventListener('click', () => window.openBrandStoryPage());
  byId('health-shorts-link').addEventListener('click', () => {
    byId('health-story-section').style.display = 'none';
    window.goToShorts();
  });

  // Keep the existing floating balance in subpages, without duplicating it on home.
  const updateHomeVisibility = () => {
    document.body.classList.toggle('home-active', byId('main-section').style.display !== 'none');
  };
  new MutationObserver(updateHomeVisibility).observe(byId('main-section'), {
    attributes: true, attributeFilter: ['style']
  });
  updateHomeVisibility();
  refreshNickname();
  if (!localStorage.getItem('nickname') && !sessionStorage.getItem('neulbomNicknamePromptSeen')) {
    openNickname();
  }
})();
