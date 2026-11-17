(() => {
  const labels = {agree: '찬성', disagree: '반대', unsure: '잘 모르겠어요'};
  const options = Object.keys(labels);
  const isPoll = post => post?.kind === 'health-debate' && post.poll?.version === 1 &&
    typeof post.poll.question === 'string' && JSON.stringify(post.poll.options) === JSON.stringify(options);
  const sourceUrl = value => {
    try { const url = new URL(value); return url.protocol === 'https:' ? url.href : ''; } catch { return ''; }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = {labels, isPoll, sourceUrl};
  if (typeof document === 'undefined') return;
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  };
  function body(post) {
    const host = el('div', 'community-debate-body');
    for (const item of post.debateSections || []) {
      const section = el('section', 'community-debate-argument');
      section.append(el('h2', '', String(item.heading || '')), el('p', '', String(item.body || '')));
      const sources = el('div', 'community-debate-sources');
      sources.append(el('span', '', '근거: '));
      for (const source of item.sources || []) {
        const href = sourceUrl(source.url);
        if (!href) continue;
        const link = el('a', '', `${source.label || '연구 자료'} ↗`);
        link.href = href; link.target = '_blank'; link.rel = 'noopener noreferrer';
        sources.append(link);
      }
      section.append(sources); host.append(section);
    }
    return host;
  }
  function mount(post) {
    const host = el('section', 'community-poll');
    host.setAttribute('aria-label', '건강 토론 설문');
    const eyebrow = el('p', 'community-poll-eyebrow', '건강 토론 · 첫 참여 30P');
    const question = el('h2', 'community-poll-question', post.poll.question);
    const description = el('p', 'community-poll-description', '각 주장의 근거를 읽고, 위 문장에 대한 의견을 선택해주세요.');
    const choices = el('div', 'community-poll-choices'); choices.setAttribute('role', 'group'); choices.setAttribute('aria-label', '설문 선택지');
    const status = el('p', 'community-poll-status', '참여 정보를 불러오는 중이에요…'); status.setAttribute('role', 'status'); status.setAttribute('aria-live', 'polite');
    const results = el('div', 'community-poll-results'); results.hidden = true;
    const retry = el('button', 'community-poll-retry', '다시 불러오기'); retry.type = 'button'; retry.hidden = true;
    const note = el('p', 'community-poll-note', '투표 보상은 안건당 1회이며, 선택을 바꿔도 추가 지급되지 않습니다. 댓글은 기존 댓글 보상 기준을 적용합니다. 투표 결과는 참여자의 의견이며 의학적 정답을 뜻하지 않습니다.');
    host.append(eyebrow, question, description, choices, status, retry, results, note);
    let data = null, busy = false, failed = false;
    const buttons = new Map();
    function paint() {
      for (const [key, button] of buttons) {
        button.disabled = busy || !data || !data.open;
        button.setAttribute('aria-pressed', String(data?.choice === key));
      }
      host.setAttribute('aria-busy', String(busy));
      retry.hidden = busy || !failed;
      results.replaceChildren(); results.hidden = !data?.choice;
      if (!data?.choice) return;
      const total = options.reduce((sum, key) => sum + (Number(data.counts[key]) || 0), 0);
      results.append(el('h3', '', `참여 결과 · ${total.toLocaleString('ko-KR')}명`));
      for (const key of options) {
        const count = Number(data.counts[key]) || 0;
        const percentage = total ? Math.round(count / total * 100) : 0;
        const row = el('div', 'community-poll-result');
        row.append(el('span', '', `${labels[key]}${key === data.choice ? ' · 내 선택' : ''}`), el('span', '', `${percentage}% (${count}명)`));
        const bar = el('div', 'community-poll-bar'); bar.setAttribute('aria-hidden', 'true');
        const fill = el('span'); fill.style.width = `${percentage}%`; bar.append(fill); row.append(bar); results.append(row);
      }
    }
    function message(saved = false) {
      if (!data.open) return '참여가 마감된 설문이에요.';
      if (!data.choice) return '어떤 의견을 선택해도 첫 참여에 30P를 받아요.';
      if (data.reward?.status === 'pending') return '투표는 저장됐어요. 30P 적립 확인이 지연되고 있어요. 다시 불러오면 확인할 수 있어요.';
      if (saved && data.reward?.newlyCredited) return '투표가 저장됐어요. 첫 참여 30P가 적립됐어요.';
      return `내 선택: ${labels[data.choice]} · 첫 참여 30P 지급 완료. 의견을 바꿀 수 있어요.`;
    }
    async function load() {
      if (busy) return;
      busy = true; failed = false; paint();
      try {
        data = await window.communityPollStore.load(post.id);
        status.textContent = message(); failed = data.reward?.status === 'pending';
      } catch { failed = true; status.textContent = '설문을 불러오지 못했어요. 연결을 확인한 뒤 다시 시도해주세요.'; }
      finally { busy = false; paint(); }
    }
    for (const key of options) {
      const button = el('button', 'community-poll-choice', labels[key]); button.type = 'button'; button.disabled = true;
      button.addEventListener('click', async () => {
        if (busy || !data?.open) return;
        busy = true; failed = false; status.textContent = '선택을 저장하고 있어요…'; paint();
        try {
          data = await window.communityPollStore.vote(post.id, key);
          post.pollCounts = data.counts; status.textContent = message(true); failed = data.reward?.status === 'pending';
        } catch (error) {
          failed = true;
          status.textContent = /^[가-힣]/.test(error.message || '') ? error.message : '저장을 확인하지 못했어요. 다시 불러와 참여 상태를 확인해주세요.';
        } finally { busy = false; paint(); }
      });
      buttons.set(key, button); choices.append(button);
    }
    retry.addEventListener('click', load);
    void load();
    return host;
  }
  window.CommunityPolls = {isPoll, body, mount};
})();
