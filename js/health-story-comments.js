/* Comment UI for the native health-story detail view. User content is rendered as text. */
(() => {
  const el = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const button = (text, action, className = '') => {
    const node = el('button', className, text); node.type = 'button';
    node.addEventListener('click', action); return node;
  };
  function ready() {
    if (window.healthStoryComments) return Promise.resolve(window.healthStoryComments);
    return new Promise((resolve, reject) => {
      const finish = () => { clearTimeout(timer); window.removeEventListener('healthStoryCommentsReady', finish); resolve(window.healthStoryComments); };
      const timer = setTimeout(() => {
        window.removeEventListener('healthStoryCommentsReady', finish);
        reject(new Error('댓글 연결을 확인하지 못했어요. 다시 시도해주세요.'));
      }, 8000);
      window.addEventListener('healthStoryCommentsReady', finish);
    });
  }
  const errorText = error => /^[가-힣]/.test(error.message || '') ? error.message : '처리하지 못했어요. 인터넷 연결을 확인하고 다시 시도해주세요.';
  let instance = 0;
  window.HealthStoryComments = {
    mount(post, parent) {
      const prefix = `health-comment-${post.id}-${++instance}`;
      const section = el('section', 'health-story-comments');
      section.setAttribute('aria-labelledby', `${prefix}-title`);
      const heading = el('h2', '', '댓글'); heading.id = `${prefix}-title`;
      const list = el('div', 'health-story-comments-list');
      const status = el('p', 'health-story-comment-status'); status.setAttribute('role', 'status'); status.hidden = true;
      const form = el('form', 'health-story-comment-form');
      const label = el('label', '', '댓글 남기기'); label.htmlFor = `${prefix}-input`;
      const input = el('textarea'); input.id = `${prefix}-input`;
      input.maxLength = 200; input.rows = 3; input.required = true;
      input.placeholder = '이 이야기를 읽고 떠오른 생각을 나눠주세요.';
      const formFooter = el('div', 'health-story-comment-form-footer');
      const counter = el('span', 'health-story-comment-counter', '0/200');
      const submit = el('button', 'health-story-comment-submit', '등록'); submit.type = 'submit';
      formFooter.append(counter, submit); form.append(label, input, formFooter);
      section.append(heading, list, form, status); parent.append(section);
      let rows = [], busy = false, request = 0, pendingId = null;
      function message(text) { status.textContent = text; status.hidden = !text; }
      function controls() {
        counter.textContent = `${input.value.length}/200`;
        input.readOnly = busy;
        submit.disabled = busy || !input.value.trim() || input.value.length > 200;
        submit.textContent = busy ? '등록 중…' : '등록';
      }
      input.addEventListener('input', controls); controls();
      function paint() {
        heading.textContent = `댓글 ${rows.length}`;
        list.replaceChildren();
        if (!rows.length) list.append(el('p', 'health-story-comments-empty', '아직 댓글이 없어요. 첫 이야기를 남겨주세요.'));
        for (const comment of rows) {
          const row = el('article', 'health-story-comment');
          const header = el('div', 'health-story-comment-header');
          header.append(el('strong', '', comment.nickname || '익명'));
          if (comment.timestamp?.seconds) {
            const date = new Date(comment.timestamp.seconds * 1000);
            const time = el('time', '', date.toLocaleDateString('ko-KR'));
            time.dateTime = date.toISOString(); header.append(time);
          }
          if (comment.userId === window.getUserId?.()) {
            const menu = el('details', 'health-story-comment-menu');
            const summary = el('summary', '', '⋯'); summary.setAttribute('aria-label', '내 댓글 관리');
            const actions = el('div', 'health-story-comment-options');
            actions.append(button('수정', () => { menu.open = false; manage(comment, row, false); }),
              button('삭제', () => { menu.open = false; manage(comment, row, true); }));
            menu.append(summary, actions); header.append(menu);
          }
          row.append(header, el('p', 'health-story-comment-text', comment.text || ''));
          list.append(row);
        }
      }
      function manage(comment, row, deleting) {
        if (row.querySelector('form')) return;
        const editor = el('form', 'health-story-comment-editor');
        const field = el('textarea'); field.value = comment.text; field.maxLength = 200; field.rows = 3; field.required = true;
        field.setAttribute('aria-label', '댓글 수정 내용');
        const note = el('p', '', deleting ? '이 댓글을 삭제할까요?' : '댓글 수정');
        const error = el('p', 'health-story-comment-error'); error.setAttribute('role', 'alert'); error.hidden = true;
        const footer = el('div', 'health-story-comment-form-footer');
        const cancel = button('취소', () => { editor.remove(); row.querySelector('summary')?.focus(); });
        const save = el('button', 'health-story-comment-submit', deleting ? '삭제하기' : '수정 저장'); save.type = 'submit';
        footer.append(cancel, save); editor.append(note);
        if (!deleting) editor.append(field);
        editor.append(error, footer); row.append(editor);
        (deleting ? cancel : field).focus();
        let saving = false;
        editor.addEventListener('submit', async event => {
          event.preventDefault(); if (saving) return;
          if (!deleting && (!field.value.trim() || field.value.length > 200)) { error.textContent = '댓글은 1~200자로 입력해주세요.'; error.hidden = false; return; }
          saving = true; request++; error.hidden = true; save.disabled = cancel.disabled = true; field.readOnly = true;
          try {
            const api = await ready();
            if (deleting) { await api.remove(post.id, comment.id); rows = rows.filter(item => item.id !== comment.id); }
            else { const updated = await api.update(post.id, comment.id, field.value); rows = rows.map(item => item.id === comment.id ? updated : item); }
            if (!section.isConnected) return;
            paint(); message(deleting ? '댓글을 삭제했어요.' : '댓글을 수정했어요.');
            input.focus({ preventScroll: true });
          } catch (reason) { error.textContent = errorText(reason); error.hidden = false; }
          finally { saving = false; save.disabled = cancel.disabled = false; field.readOnly = false; }
        });
      }
      async function load() {
        const version = ++request;
        list.setAttribute('aria-busy', 'true');
        if (!rows.length) list.replaceChildren(el('p', 'health-story-comments-empty', '댓글을 불러오는 중이에요…'));
        try {
          const api = await ready();
          if (!section.isConnected || version !== request) return;
          const result = await api.list(post.id);
          if (!section.isConnected || version !== request) return;
          rows = result.rows; paint();
          if (result.cached) message('연결이 원활하지 않아 이전에 불러온 댓글을 보여드려요.');
          if (result.cached) list.append(button('다시 불러오기', load, 'health-story-comment-retry'));
        } catch {
          if (!section.isConnected || version !== request) return;
          if (rows.length) paint(); else list.replaceChildren();
          list.append(el('p', 'health-story-comments-empty', '댓글을 새로 불러오지 못했어요.'), button('다시 불러오기', load, 'health-story-comment-retry'));
        } finally { if (version === request) list.setAttribute('aria-busy', 'false'); }
      }
      form.addEventListener('submit', async event => {
        event.preventDefault(); if (busy || !input.value.trim()) return;
        if (!localStorage.getItem('nickname')?.trim()) {
          message('닉네임을 등록한 뒤 댓글을 남겨주세요.');
          document.getElementById('home-nickname-open')?.click(); return;
        }
        busy = true; request++; list.setAttribute('aria-busy', 'false'); controls(); message('');
        try {
          const api = await ready();
          pendingId ||= api.newId();
          const result = await api.create(post.id, input.value, pendingId);
          pendingId = null;
          if (!section.isConnected) return;
          rows = [result.comment, ...rows.filter(item => item.id !== result.comment.id)];
          if (input.value.trim() === result.comment.text) input.value = '';
          paint();
          message(result.rewardPending ? '댓글은 등록됐지만 포인트 적립을 확인하지 못했어요.' : '댓글을 등록했어요.');
          load();
          input.focus({ preventScroll: true });
        } catch (reason) { if (section.isConnected) message(errorText(reason)); }
        finally { busy = false; controls(); }
      });
      load();
    }
  };
})();
