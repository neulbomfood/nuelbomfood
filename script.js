const bgList = [
  "assets/img/background/close-up-white-flowering-plant-against-wall.jpg",
  "assets/img/background/still-life-minimalist-lifestyle.jpg",
  "assets/img/background/white-rose-blooming-against-wall.jpg",
  "assets/img/background/view-rose-flowers-condensed-glass.jpg",
  "assets/img/background/modern-minimalist-living-room.jpg"
];

// 개발 중 포인트 리셋 (주석 해제하여 사용)
// localStorage.removeItem('points');

let currentIndex = 0;
let points = parseInt(localStorage.getItem('points')) || 0;
let questions = [];
let usedQuestions = new Set(); // 풀었던 문제들을 기록할 Set
let allQuestions = []; // 전체 문제 풀을 저장할 배열
let timer;
let timeLeft = 15;
let isAnswering = false;
let startTime;
let correctAnswers = 0;

// 효과음 초기화
const soundClick = new Audio('assets/sounds/click.mp3');
const soundCorrect = new Audio('assets/sounds/correct.mp3');
const soundWrong = new Audio('assets/sounds/wrong.mp3');

// 사용자 상호작용 후 효과음 활성화
document.body.addEventListener('click', () => {
  soundClick.play().catch(() => {}); // 보안 정책 우회
}, { once: true });

// 응원 메시지 목록
const feedbackTexts = {
  correct: [
    "정답이에요! +15점 적립 🎯",
    "좋은 선택이에요! 건강 지식이 쌓여가요 ✨",
    "완벽해요! 오늘도 건강한 선택 💚",
    "정답입니다! 건강 루틴이 만들어지고 있어요 🌱"
  ],
  wrong: [
    "조금 아쉽지만 괜찮아요! -5점 😅 다음엔 꼭 맞힐 수 있어요",
    "틀렸지만 배우는 과정이에요! 함께 성장해요 💪",
    "아쉽네요, 하지만 도전하는 당신이 멋져요 ✨",
    "괜찮아요, 틀린 문제는 더 오래 기억된답니다 💡"
  ]
};

document.addEventListener("DOMContentLoaded", () => {
  // 카카오톡 공유 버튼 초기화
  if (window.Kakao) {
    Kakao.Link.createDefaultButton({
      container: '#kakao-share-btn',
      objectType: 'feed',
      content: {
        title: '늘봄 건강 퀴즈',
        description: '나를 위한 작은 습관의 변화, 늘봄과 함께 건강한 습관을 만들어보세요!',
        imageUrl: 'http://localhost:8000/assets/img/share-preview.jpg',
        link: {
          mobileWebUrl: 'http://localhost:8000',
          webUrl: 'http://localhost:8000',
        },
      },
      buttons: [
        {
          title: '퀴즈 풀러가기',
          link: {
            mobileWebUrl: 'http://localhost:8000',
            webUrl: 'http://localhost:8000',
          },
        },
      ],
      success: function(response) {
        addPoints(200);
        showToast('공유 감사합니다! +200P가 적립되었어요 💚');
      },
      fail: function(error) {
        console.log('카카오톡 공유 실패:', error);
      }
    });
  }

  // 현재 페이지가 quiz.html인 경우에만 퀴즈 관련 코드 실행
  if (window.location.pathname.includes('quiz.html')) {
    // 배경 이미지 랜덤 적용
    const selectedBg = bgList[Math.floor(Math.random() * bgList.length)];
    document.body.style.backgroundImage = `url('${selectedBg}')`;
    document.body.style.backgroundPosition = 'center';
    document.body.style.backgroundSize = 'cover';
    
    startTime = Date.now();
    showLoading(true);
    
    Promise.all([
      fetch("health_quiz_set_all.json").then(res => res.json()),
      fetch("quiz1.json").then(res => res.json()),
      fetch("quiz2.json").then(res => res.json()),
      fetch("quiz3.json").then(res => res.json())
    ])
    .then(([allList, quiz1List, quiz2List, quiz3List]) => {
      const merged = [...allList, ...quiz1List, ...quiz2List, ...quiz3List];
      const uniqueQuestions = Array.from(new Map(merged.map(q => [q.question, q])).values());
      allQuestions = uniqueQuestions.sort(() => Math.random() - 0.5);
      questions = allQuestions;
      showLoading(false);
      showQuestion();
      updatePoints();
      updateProgress();
    });
  }
});

function showLoading(show) {
  const loading = document.getElementById('loading');
  const quizContent = document.getElementById('quiz-box').children;
  
  loading.style.display = show ? 'block' : 'none';
  Array.from(quizContent).forEach(element => {
    if (element.id !== 'loading') {
      element.style.opacity = show ? '0.5' : '1';
    }
  });
}

function updateProgress() {
  const progressText = document.getElementById('progress-text');
  const progressFill = document.getElementById('progress-fill');
  const progress = ((currentIndex + 1) / questions.length) * 100;
  
  progressText.textContent = `${currentIndex + 1}/${questions.length}`;
  progressFill.style.width = `${progress}%`;
}

function showQuestion() {
  if (isAnswering) return;
  
  clearInterval(timer);
  timeLeft = 15;
  document.getElementById("timer-fill").style.width = "100%";

  const q = questions[currentIndex];
  if (!q) {
    finishQuiz();
    return;
  }

  // 현재 문제를 usedQuestions에 추가
  usedQuestions.add(q.question);

  updateProgress();
  
  const quizBox = document.getElementById("quiz-box");
  
  document.getElementById("question").textContent = q.question;
  const answersList = document.getElementById("answers");
  answersList.innerHTML = "";
  document.getElementById("explanation").innerHTML = "";
  document.getElementById("explanation").classList.remove("show");

  const options = [q.correct, ...q.wrong].sort(() => Math.random() - 0.5);
  options.forEach(option => {
    const li = document.createElement("li");
    li.textContent = option;
    li.onclick = () => {
      if (isAnswering) return;
      handleAnswer(option, q);
    };
    answersList.appendChild(li);
  });

  quizBox.style.opacity = "1";

  timer = setInterval(() => {
    timeLeft--;
    document.getElementById("timer-fill").style.width = (timeLeft * 6.67) + "%";
    if (timeLeft <= 0) {
      clearInterval(timer);
      handleAnswer(null, q);
    }
  }, 1000);
}

function handleAnswer(selected, question) {
  if (isAnswering) return;
  isAnswering = true;
  clearInterval(timer);

  try {
    soundClick.play().catch(() => {});
  } catch (e) {}

  const popup = document.getElementById("explanation-popup");
  const popupEmoji = document.getElementById("popup-emoji");
  const popupResult = document.getElementById("popup-result");
  const popupExplanation = document.getElementById("popup-explanation");
  const popupPoints = document.getElementById("popup-points");
  
  const answers = document.querySelectorAll("#answers li");
  
  answers.forEach(li => {
    if (li.textContent === question.correct) {
      li.classList.add("correct");
    } else if (li.textContent === selected) {
      li.classList.add("wrong");
    }
    li.style.pointerEvents = "none";
  });

  if (selected === question.correct) {
    correctAnswers++;
    points += 15;
    if (points < 0) points = 0;
    localStorage.setItem("points", points);
    
    popupEmoji.textContent = "🎉";
    popupResult.textContent = "정답이에요!";
    popupExplanation.textContent = question.explanation;
    popupPoints.innerHTML = `
      <div class="point-change">+15P</div>
      <div class="total-points">현재 총 ${points}P</div>
    `;
    popupPoints.style.color = "#28a745";
    
    try {
      soundCorrect.play().catch(() => {});
    } catch (e) {}
  } else {
    points -= 5;
    if (points < 0) points = 0;
    localStorage.setItem("points", points);
    
    popupEmoji.textContent = "💪";
    popupResult.textContent = "아쉽지만 틀렸어요";
    popupExplanation.textContent = `정답: ${question.correct}\n${question.explanation}`;
    popupPoints.innerHTML = `
      <div class="point-change">-5P</div>
      <div class="total-points">현재 총 ${points}P</div>
    `;
    popupPoints.style.color = "#dc3545";
    
    try {
      soundWrong.play().catch(() => {});
    } catch (e) {}
  }

  popup.classList.add("show");
  updatePoints();

  // 3초 후 팝업 닫고 다음 문제로
  setTimeout(() => {
    popup.classList.remove("show");
    currentIndex++;
    isAnswering = false;
    showQuestion();
  }, 3000);
}

function updatePoints() {
  const pointsDisplay = document.getElementById("points");
  if (!pointsDisplay) return;  // points 요소가 없으면 함수 종료
  
  const oldPoints = parseInt(pointsDisplay.textContent);
  const diff = points - oldPoints;
  
  if (diff > 0) {
    animatePoints(oldPoints, points, 1000);
  } else {
    pointsDisplay.textContent = points;
  }

  // 현재 페이지가 quiz.html인 경우에만 exchange 버튼 업데이트
  if (window.location.pathname.includes('quiz.html')) {
    const pointsAction = document.getElementById("points-action");
    const exchangeButton = document.getElementById("exchange-button");
    const pointsInsufficient = document.getElementById("points-insufficient");
    
    if (pointsAction) {
      pointsAction.style.display = "block";
      
      if (exchangeButton && pointsInsufficient) {
        if (points >= 5000) {
          exchangeButton.style.display = "block";
          pointsInsufficient.style.display = "none";
        } else {
          exchangeButton.style.display = "none";
          pointsInsufficient.style.display = "block";
        }
      }
    }
  }
}

function animatePoints(start, end, duration) {
  const pointsDisplay = document.getElementById("points");
  const startTime = performance.now();
  
  function update(currentTime) {
    const elapsed = currentTime - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    const currentPoints = Math.floor(start + (end - start) * progress);
    pointsDisplay.textContent = currentPoints;
    
    if (progress < 1) {
      requestAnimationFrame(update);
    }
  }
  
  requestAnimationFrame(update);
}

function finishQuiz() {
  const quizBox = document.getElementById('quiz-box');
  const quizComplete = document.getElementById('quiz-complete');
  const timeTaken = Math.floor((Date.now() - startTime) / 1000);
  const accuracy = Math.round((correctAnswers / currentIndex) * 100);
  
  document.getElementById('final-points').textContent = points;
  document.getElementById('accuracy').textContent = accuracy;
  document.getElementById('time-taken').textContent = timeTaken;
  
  // 계속하기 버튼 추가
  quizComplete.innerHTML += `
    <div style="margin-top: 20px">
      <button onclick="continueQuiz()" class="primary-button">
        계속해서 풀기
      </button>
    </div>
  `;
  
  quizBox.style.display = 'none';
  quizComplete.style.display = 'block';
  
  // 환전 버튼 표시 조건
  const exchangeBox = document.getElementById('exchange-box');
  if (points >= 5000) {
    exchangeBox.style.display = 'block';
    exchangeBox.innerHTML = `
      <div style="margin-bottom: 16px">
        🎉 축하합니다! ${points}P를 모으셨네요!<br/>
        늘봄몰에서 적립금으로 전환하실 수 있습니다.
      </div>
      <button onclick="requestExchange()" class="primary-button">
        적립금으로 전환하기
      </button>
    `;
  } else {
    exchangeBox.style.display = 'block';
    exchangeBox.innerHTML = `
      <div style="color: #666; margin: 16px 0">
        5,000P 이상이면 늘봄몰에서 적립금으로 바꿀 수 있어요!<br/>
        (현재 ${points}P / 목표 5,000P)
      </div>
    `;
  }
  
  // 통계 카드 애니메이션
  const statCards = document.querySelectorAll('.stat-card');
  statCards.forEach((card, index) => {
    setTimeout(() => {
      card.classList.add('fade-in');
    }, index * 200);
  });
}

function requestExchange() {
  const amount = Math.floor(points / 5000) * 5000;
  if (confirm(`${amount}P를 적립금으로 전환하시겠습니까?`)) {
    alert('전환 신청이 접수되었습니다.\n관리자 확인 후 적립금으로 지급됩니다.');
  }
}

function showExplanation(isCorrect, explanation) {
  const explanationEl = document.getElementById('explanation');
  explanationEl.textContent = explanation;
  explanationEl.style.display = 'block';
  
  // 자동으로 설명이 보이도록 스크롤
  setTimeout(() => {
    explanationEl.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }, 100);
}

// 새로운 문제 선택 함수
function selectNewQuestions() {
  // 모든 문제를 랜덤으로 섞기
  questions = allQuestions.sort(() => Math.random() - 0.5);
}

// 계속 풀기 함수 수정
function continueQuiz() {
  const quizBox = document.getElementById('quiz-box');
  const quizComplete = document.getElementById('quiz-complete');
  
  // 새로운 문제 선택
  selectNewQuestions();
  currentIndex = 0;
  startTime = Date.now();
  correctAnswers = 0;
  
  quizComplete.style.display = 'none';
  quizBox.style.display = 'block';
  
  showQuestion();
  updateProgress();
}

// 홈으로 돌아가기 함수 추가
function goHome() {
  window.location.href = 'index.html';
}

// 공유 관련 함수들
function shareApp() {
  if (navigator.share) {
    navigator.share({
      title: '늘봄 건강 퀴즈',
      text: '나를 위한 작은 습관의 변화, 늘봄과 함께 건강한 습관을 만들어보세요!',
      url: window.location.href
    })
    .then(() => {
      // 공유 성공 시 포인트 지급
      addPoints(50);
      showToast('공유 감사합니다! +50P가 적립되었어요 💚');
    })
    .catch((error) => {
      console.log('공유 실패:', error);
    });
  } else {
    // Web Share API를 지원하지 않는 경우 기존 복사 기능 사용
    copyLink();
  }
}

function shareToInstagram() {
  const url = encodeURIComponent(window.location.href);
  const text = encodeURIComponent('나를 위한 작은 습관의 변화, 늘봄과 함께 건강한 습관을 만들어보세요!');
  window.open(`https://www.instagram.com/share?url=${url}&caption=${text}`, 'instagram-share-dialog', 'width=800,height=600');
  addPoints(200);
  showToast('공유 감사합니다! +200P가 적립되었어요 💚');
}

function showToast(message) {
  const toast = document.createElement('div');
  toast.className = 'toast-message';
  toast.textContent = message;
  document.body.appendChild(toast);
  
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);
  
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 300);
  }, 3000);
}

function shareAppInstall() {
  const shareUrl = "https://play.google.com/store/apps/details?id=com.neulbom.neulbomquiz";
  if (navigator.share) {
    navigator.share({
      title: "늘봄 건강 퀴즈 풀어봐!",
      text: "퀴즈 풀고 포인트 받아요 🎁",
      url: shareUrl
    }).then(() => {
      addPoints(200);
      showToast('공유 감사합니다! +200P가 적립되었어요 💚');
    }).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareUrl);
    showToast('링크가 복사되었습니다!');
  }
} 