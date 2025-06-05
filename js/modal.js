// 모달 관련 함수들
window.openWriteModal = function() {
  const writeFullscreen = document.getElementById('free-write-fullscreen');
  const textarea = document.getElementById('habit-salon-free-content');
  const submitBtn = document.querySelector('#habit-salon-free-form .submit-btn');
  const overlay = document.getElementById('page-transition-overlay');
  
  if (!writeFullscreen || !textarea || !submitBtn || !overlay) {
    console.error('글쓰기 모달 요소를 찾을 수 없습니다.');
    return;
  }
  
  // 모달 열 때 초기화
  textarea.value = '';
  updateCharCounter();
  
  overlay.classList.add('active');
  setTimeout(() => {
    overlay.classList.remove('active');
    writeFullscreen.classList.add('active');
    document.body.style.overflow = 'hidden';
    textarea.focus();
  }, 200);
};

window.closeWriteModal = function() {
  const writeFullscreen = document.getElementById('free-write-fullscreen');
  const overlay = document.getElementById('page-transition-overlay');
  
  if (!writeFullscreen || !overlay) {
    console.error('글쓰기 모달 요소를 찾을 수 없습니다.');
    return;
  }
  
  // 닫을 때 애니메이션
  writeFullscreen.classList.add('closing');
  overlay.classList.add('active');
  
  setTimeout(() => {
    writeFullscreen.classList.remove('active', 'closing');
    overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
    
    // 폼 초기화
    const textarea = document.getElementById('habit-salon-free-content');
    if (textarea) {
      textarea.value = '';
      updateCharCounter();
    }
  }, 200);
};

// 글자수 카운터 업데이트 (디바운스 적용)
let charCountTimeout;
function updateCharCounter() {
  const textarea = document.getElementById('habit-salon-free-content');
  const counter = document.querySelector('.char-counter');
  const submitBtn = document.querySelector('#habit-salon-free-form .submit-btn');
  const charCountGuide = document.querySelector('.char-count-guide');
  
  if (!textarea || !counter || !submitBtn || !charCountGuide) return;
  
  clearTimeout(charCountTimeout);
  charCountTimeout = setTimeout(() => {
    const charCount = textarea.value.trim().length;
    counter.textContent = `${charCount}/500`;
    
    // 글자수에 따른 UI 업데이트
    if (charCount < 100) {
      counter.style.color = '#f44336';
      submitBtn.disabled = true;
      const remaining = 100 - charCount;
      charCountGuide.textContent = `더 자세한 이야기를 들려주세요! (${remaining}자 더 필요)`;
      charCountGuide.style.color = '#f44336';
      
      // 프로그레스 표시 (선택적)
      const progress = (charCount / 100) * 100;
      charCountGuide.style.background = `linear-gradient(to right, #f4433633 ${progress}%, transparent ${progress}%)`;
    } else {
      counter.style.color = '#4CAF50';
      submitBtn.disabled = false;
      charCountGuide.textContent = '충분한 내용이네요! 공유하고 100P를 받아보세요 ✨';
      charCountGuide.style.color = '#4CAF50';
      charCountGuide.style.background = 'none';
    }
  }, 100); // 100ms 디바운스
}

// 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', function() {
  // 글쓰기 폼 이벤트
  const freeForm = document.getElementById('habit-salon-free-form');
  if (freeForm) {
    const textarea = freeForm.querySelector('#habit-salon-free-content');
    const submitBtn = freeForm.querySelector('.submit-btn');
    
    // 입력 이벤트 (모바일 대응)
    ['input', 'keyup', 'paste', 'change'].forEach(eventType => {
      textarea.addEventListener(eventType, updateCharCounter);
    });
    
    // 모바일에서 포커스 시 스크롤 조정
    textarea.addEventListener('focus', function() {
      if (window.innerWidth <= 768) {
        setTimeout(() => {
          textarea.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }, 300);
      }
    });
    
    // 폼 제출 이벤트
    freeForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const content = textarea.value.trim();
      
      if (content.length < 100) {
        window.showSalonToast('100자 이상 작성해야 공유할 수 있어요!', 'warning');
        return;
      }
      
      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>공유하는 중...</span>';
        
        // 글 작성 처리
        await window.addUserPost(content);
        window.closeWriteModal();
        await window.loadFreeSection();
        window.showSalonToast('건강 이야기가 공유되었습니다! 100P가 적립되었어요 🎉', 'success');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        console.error('글쓰기 제출 오류:', error);
        window.showSalonToast('글쓰기 중 오류가 발생했습니다.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = `
          <span>건강 이야기 공유하기</span>
          <span class="point-badge">+100P</span>
        `;
      }
    });
  }
  
  // ESC 키 이벤트 (전역)
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const writeFullscreen = document.getElementById('free-write-fullscreen');
      if (writeFullscreen?.classList.contains('active')) {
        e.preventDefault(); // 다른 ESC 이벤트 방지
        window.closeWriteModal();
      }
    }
  });
  
  // 모달 외부 클릭 시 닫기
  const writeFullscreen = document.getElementById('free-write-fullscreen');
  if (writeFullscreen) {
    writeFullscreen.addEventListener('click', function(e) {
      if (e.target === this) {
        window.closeWriteModal();
      }
    });
  }
}); 