// 모달 관련 함수들
window.openWriteModal = function() {
  const writeFullscreen = document.getElementById('free-write-fullscreen');
  const textarea = document.getElementById('habit-salon-free-content');
  const submitBtn = document.querySelector('#habit-salon-free-form .submit-btn');
  const overlay = document.getElementById('page-transition-overlay');
  
  if (!writeFullscreen || !textarea || !submitBtn || !overlay) return;
  
  overlay.classList.add('active');
  setTimeout(() => {
    overlay.classList.remove('active');
    writeFullscreen.classList.add('active');
    document.body.style.overflow = 'hidden';
    textarea.value = '';
    textarea.focus();
    updateCharCounter();
  }, 200);
};

window.closeWriteModal = function() {
  const writeFullscreen = document.getElementById('free-write-fullscreen');
  const overlay = document.getElementById('page-transition-overlay');
  
  if (!writeFullscreen || !overlay) return;
  
  overlay.classList.add('active');
  writeFullscreen.classList.remove('active');
  setTimeout(() => {
    overlay.classList.remove('active');
    document.body.style.overflow = 'auto';
  }, 200);
};

// 글자수 카운터 업데이트
function updateCharCounter() {
  const textarea = document.getElementById('habit-salon-free-content');
  const counter = document.querySelector('.char-counter');
  const submitBtn = document.querySelector('#habit-salon-free-form .submit-btn');
  const charCountGuide = document.querySelector('.char-count-guide');
  
  if (!textarea || !counter || !submitBtn || !charCountGuide) return;
  
  const charCount = textarea.value.length;
  counter.textContent = `${charCount}/500`;
  
  // 글자수에 따른 UI 업데이트
  if (charCount < 100) {
    counter.style.color = '#f44336';
    submitBtn.disabled = true;
    charCountGuide.textContent = `더 자세한 이야기를 들려주세요! (${100 - charCount}자 더 필요)`;
    charCountGuide.style.color = '#f44336';
  } else {
    counter.style.color = '#4CAF50';
    submitBtn.disabled = false;
    charCountGuide.textContent = '충분한 내용이네요! 이대로 공유해주세요 ✨';
    charCountGuide.style.color = '#4CAF50';
  }
}

// 이벤트 리스너 설정
document.addEventListener('DOMContentLoaded', function() {
  // 글쓰기 폼 이벤트
  const freeForm = document.getElementById('habit-salon-free-form');
  if (freeForm) {
    const textarea = freeForm.querySelector('#habit-salon-free-content');
    const submitBtn = freeForm.querySelector('.submit-btn');
    
    textarea.addEventListener('input', function() {
      updateCharCounter();
    });
    
    freeForm.addEventListener('submit', async function(e) {
      e.preventDefault();
      const content = textarea.value.trim();
      
      if (content.length < 100) {
        window.showSalonToast('100자 이상 작성해주세요. 더 자세한 이야기를 들려주세요!', 'warning');
        return;
      }
      
      try {
        submitBtn.disabled = true;
        submitBtn.innerHTML = '<span>공유하는 중...</span>';
        
        // 글 작성 처리
        await window.submitFreePost(content);
        window.closeWriteModal();
        await window.loadFreeSection();
        window.showSalonToast('건강 이야기가 공유되었습니다! (+100P)', 'success');
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (error) {
        console.error('글쓰기 제출 오류:', error);
        window.showSalonToast('글쓰기 중 오류가 발생했습니다.', 'error');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<span>건강 이야기 공유하기</span><span>+100P</span>';
      }
    });
  }
  
  // ESC 키 이벤트
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      const writeFullscreen = document.getElementById('free-write-fullscreen');
      if (writeFullscreen?.classList.contains('active')) {
        window.closeWriteModal();
      }
    }
  });
  
  // 플로팅 버튼 이벤트
  document.addEventListener('click', function(e) {
    if (e.target.closest('#floating-write-btn')) {
      e.preventDefault();
      window.openWriteModal();
    }
  });
}); 