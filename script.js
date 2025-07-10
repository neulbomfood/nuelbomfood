const bgList = [
  "assets/img/background/close-up-white-flowering-plant-against-wall.jpg",
  "assets/img/background/still-life-minimalist-lifestyle.jpg",
  "assets/img/background/white-rose-blooming-against-wall.jpg",
  "assets/img/background/view-rose-flowers-condensed-glass.jpg",
  "assets/img/background/modern-minimalist-living-room.jpg"
];

// 개발 중 포인트 리셋 (주석 해제하여 사용)
// localStorage.removeItem('points');

// 통합 포인트 관리 시스템
window.pointsManager = {
  // 현재 포인트 캐시
  currentPoints: 0,
  
  // 포인트 초기화
  async init() {
    try {
      // 우선순위: Firestore > localStorage
      const firestorePoints = await this.getFirestorePoints();
      const localPoints = parseInt(localStorage.getItem('points') || '0');
      
      // 더 큰 값을 사용 (데이터 손실 방지)
      this.currentPoints = Math.max(firestorePoints, localPoints);
      
      // 동기화
      await this.syncPoints();
      this.updateAllDisplays();
      
      console.log('포인트 시스템 초기화 완료:', this.currentPoints);
    } catch (error) {
      console.error('포인트 초기화 오류:', error);
      // 오류 시 localStorage 값 사용
      this.currentPoints = parseInt(localStorage.getItem('points') || '0');
      this.updateAllDisplays();
    }
  },
  
  // Firestore에서 포인트 조회
  async getFirestorePoints() {
    try {
      const userId = localStorage.getItem('userId');
      if (!userId || !window.db) return 0;
      
      const doc = await window.db.collection('users').doc(userId).get();
      return doc.exists ? (doc.data().points || 0) : 0;
    } catch (error) {
      console.error('Firestore 포인트 조회 오류:', error);
      return 0;
    }
  },
  
  // 포인트 동기화 (양방향)
  async syncPoints() {
    try {
      // localStorage 업데이트
      localStorage.setItem('points', this.currentPoints.toString());
      
      // Firestore 업데이트 (userId가 있을 때만)
      const userId = localStorage.getItem('userId');
      if (userId && window.db) {
        await window.db.collection('users').doc(userId).update({
          points: this.currentPoints,
          lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
      }
    } catch (error) {
      console.error('포인트 동기화 오류:', error);
      // 최소한 localStorage는 업데이트
      localStorage.setItem('points', this.currentPoints.toString());
    }
  },
  
  // 포인트 추가/차감
  async addPoints(amount) {
    const oldPoints = this.currentPoints;
    this.currentPoints = Math.max(0, this.currentPoints + amount);
    
    // 동기화
    await this.syncPoints();
    
    // 모든 화면 업데이트
    this.updateAllDisplays();
    
    // 변경 이벤트 발생
    this.triggerPointsChange(oldPoints, this.currentPoints, amount);
    
    return this.currentPoints;
  },
  
  // 포인트 설정 (직접 설정)
  async setPoints(newPoints) {
    const oldPoints = this.currentPoints;
    this.currentPoints = Math.max(0, newPoints);
    
    await this.syncPoints();
    this.updateAllDisplays();
    
    this.triggerPointsChange(oldPoints, this.currentPoints, newPoints - oldPoints);
    
    return this.currentPoints;
  },
  
  // 현재 포인트 반환
  getPoints() {
    return this.currentPoints;
  },
  
  // 모든 포인트 표시 요소 업데이트
  updateAllDisplays() {
    const pointsElements = [
      '#points',                    // 메인/퀴즈 페이지
      '#habit-salon-my-point',      // 습관살롱
      '#currentPoints',             // 교환 모달
      '#modalCurrentPoints',        // 교환 모달2
      '#final-points'               // 퀴즈 완료
    ];
    
    pointsElements.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        if (selector === '#points') {
          element.textContent = this.currentPoints;
        } else {
          element.textContent = this.currentPoints;
        }
      }
    });
    
    // 전환 버튼 상태 업데이트
    this.updateExchangeButtons();
    
    // script.js의 points 변수도 동기화
    if (typeof window.points !== 'undefined') {
      window.points = this.currentPoints;
    }
  },
  
  // 전환 버튼 상태 업데이트
  updateExchangeButtons() {
    const exchangeButton = document.getElementById('exchange-button');
    const exchangePointsBtn = document.getElementById('exchangePointsBtn');
    const pointsInsufficient = document.getElementById('points-insufficient');
    
    const isEligible = this.currentPoints >= 5000;
    
    // 퀴즈/메인 페이지 전환 버튼
    if (exchangeButton) {
      exchangeButton.style.display = isEligible ? 'block' : 'none';
    }
    
    // 포인트 모달 전환 버튼
    if (exchangePointsBtn) {
      exchangePointsBtn.style.display = isEligible ? 'block' : 'none';
    }
    
    // 부족 알림
    if (pointsInsufficient) {
      pointsInsufficient.style.display = isEligible ? 'none' : 'block';
    }
  },
  
  // 포인트 변경 이벤트 발생
  triggerPointsChange(oldPoints, newPoints, change) {
    // 커스텀 이벤트 발생
    const event = new CustomEvent('pointsChanged', {
      detail: { oldPoints, newPoints, change }
    });
    window.dispatchEvent(event);
    
    console.log(`포인트 변경: ${oldPoints} → ${newPoints} (${change > 0 ? '+' : ''}${change})`);
  }
};

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
// document.body.addEventListener('click', () => {
//   soundClick.play().catch(() => {}); // 보안 정책 우회
// }, { once: true });

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

// 유튜브 영상 시청 완료 시 50P 지급 기능
let ytPlayer = null;
let currentVideoId = null;

function loadYouTubeAPI() {
  if (window.YT && window.YT.Player) {
    return Promise.resolve();
  }
  return new Promise(resolve => {
    const tag = document.createElement('script');
    tag.src = "https://www.youtube.com/iframe_api";
    window.onYouTubeIframeAPIReady = resolve;
    document.body.appendChild(tag);
  });
}

function openVideoModal(videoId) {
  currentVideoId = videoId;
  loadYouTubeAPI().then(() => {
    if (ytPlayer) {
      ytPlayer.loadVideoById(videoId);
    } else {
      ytPlayer = new YT.Player('videoPlayer', {
        height: '220',
        width: '100%',
        videoId: videoId,
        playerVars: { rel: 0, modestbranding: 1 },
        events: {
          'onStateChange': onPlayerStateChange
        }
      });
    }
    document.getElementById('videoModal').showModal();
  });
}

function onPlayerStateChange(event) {
  if (event.data === YT.PlayerState.ENDED) {
    // 영상 끝까지 시청 시 포인트 지급 (중복 방지)
    const watchedVideos = JSON.parse(localStorage.getItem('watchedVideos') || '[]');
    if (!watchedVideos.includes(currentVideoId)) {
      addPoints(50);
      showToast('영상 시청 완료! +50P가 적립되었어요 🎉');
      watchedVideos.push(currentVideoId);
      localStorage.setItem('watchedVideos', JSON.stringify(watchedVideos));
    }
  }
}

// TWA 감지 함수
function isTWA() {
  // TWA 앱의 UserAgent에는 'TWA' 문자열이 포함되어 있음
  const userAgent = navigator.userAgent.toLowerCase();
  const isTWA = userAgent.includes('twa') || 
                userAgent.includes('android') && userAgent.includes('wv') || // Android WebView
                window.matchMedia('(display-mode: standalone)').matches && // PWA standalone 모드
                !window.navigator.standalone; // iOS standalone 모드가 아닌 경우
  
  console.log('TWA 감지 상세:', {
    userAgent: userAgent,
    isTWA: isTWA,
    isStandalone: window.matchMedia('(display-mode: standalone)').matches,
    isIOSStandalone: window.navigator.standalone
  });
  
  return isTWA;
}

// 배너 닫기 함수
function closeInstallBanner() {
  console.log('배너 닫기 실행');
  const banner = document.getElementById('install-banner');
  if (banner) {
    banner.style.display = 'none';
    try {
      localStorage.setItem('installBannerShown', 'true');
      console.log('localStorage 저장 성공');
    } catch (e) {
      console.error('localStorage 저장 실패:', e);
    }
  }
}

// 배너 표시 로직
function showInstallBanner() {
  const banner = document.getElementById('install-banner');
  if (!banner) {
    console.log('배너 엘리먼트가 없음 - 스킵');
    return;
  }

  try {
    const isTWAEnv = isTWA();
    const bannerShown = localStorage.getItem('installBannerShown');
    
    console.log('배너 표시 조건:', {
      isTWA: isTWAEnv,
      bannerShown: bannerShown,
      shouldShow: !isTWAEnv && !bannerShown
    });

    // TWA가 아니고, 아직 배너를 보지 않은 경우에만 표시
    if (!isTWAEnv && !bannerShown) {
      banner.style.display = 'block';
      console.log('배너 표시됨 (PWA 모드)');
    } else {
      banner.style.display = 'none';
      console.log('배너 숨김 처리됨 (TWA 모드 또는 이미 본 경우)');
    }
  } catch (e) {
    console.error('배너 표시 중 오류 발생:', e);
    // 오류 발생 시 기본적으로 배너를 숨김
    banner.style.display = 'none';
  }
}

// 페이지 로드 시 배너 표시
document.addEventListener('DOMContentLoaded', () => {
  console.log('페이지 로드됨 - 배너 표시 시도');
  showInstallBanner();
});

document.addEventListener("DOMContentLoaded", async () => {
  // 통합 포인트 시스템 초기화
  await window.pointsManager.init();
  
  // 통합 네비게이션 시스템 초기화
  console.log('🧭 통합 네비게이션 시스템 초기화 완료');
  console.log('현재 위치:', window.navigationManager.getCurrentLocation());
  console.log('');
  console.log('🔧 네비게이션 테스트 명령어:');
  console.log('  window.navigationManager.debugStack()        // 네비게이션 스택 확인');
  console.log('  window.navigationManager.getCurrentLocation() // 현재 위치 확인');
  console.log('  window.navigationManager.safeGoBack()        // 안전한 뒤로가기');
  console.log('  window.navigationManager.emergencyGoHome()   // 강제로 홈으로 이동');
  console.log('');
  console.log('📱 모바일 디버깅:');
  console.log('  - 뒤로가기 문제 발생 시 emergencyGoHome() 실행');
  console.log('  - 콘솔에서 🔙, 🏠, 🎯 이모지가 있는 로그 확인');
  console.log('  - DOM 상태는 🔍 이모지 로그에서 확인');
  console.log('');
  
  // 앱 종료 방지는 navigationManager.safeGoBack()으로만 처리
  // beforeunload 팝업은 사용자 경험에 좋지 않으므로 제거
  
  // 방문 포인트 지급
  giveDailyVisitPoints();
  // 초대 리워드 지급
  handleReferralReward();
  // 맞춤 퀴즈 리마인드 메시지
  showDailyQuizReminder();

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

  // 유튜브 영상 리스트 동적 로딩
  loadVideoList();
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

  const timerBar = document.getElementById("timer-bar");
  if (timerBar) timerBar.style.display = "none";
}

async function handleAnswer(selected, question) {
  if (isAnswering) return;
  isAnswering = true;
  clearInterval(timer);

  // try {
  //   soundClick.play().catch(() => {});
  // } catch (e) {}

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
    await addPoints(15);  // 통합 시스템 사용
    
    const currentPoints = window.pointsManager ? window.pointsManager.getPoints() : points;
    
    popupEmoji.textContent = "🎉";
    popupResult.textContent = "정답이에요!";
    popupExplanation.textContent = question.explanation;
    popupPoints.innerHTML = `
      <div class="point-change">+15P</div>
      <div class="total-points">현재 총 ${currentPoints}P</div>
    `;
    popupPoints.style.color = "#28a745";
    
    try {
      soundCorrect.play().catch(() => {});
    } catch (e) {}
  } else {
    await addPoints(-5);  // 통합 시스템 사용
    
    const currentPoints = window.pointsManager ? window.pointsManager.getPoints() : points;
    
    popupEmoji.textContent = "💪";
    popupResult.textContent = "아쉽지만 틀렸어요";
    popupExplanation.textContent = `정답: ${question.correct}\n${question.explanation}`;
    popupPoints.innerHTML = `
      <div class="point-change">-5P</div>
      <div class="total-points">현재 총 ${currentPoints}P</div>
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
  // 통합 포인트 관리자를 사용하여 모든 표시 업데이트
  if (window.pointsManager) {
    window.pointsManager.updateAllDisplays();
  }
  
  // 애니메이션 효과를 위해 기존 로직 유지
  const pointsDisplay = document.getElementById("points");
  if (pointsDisplay) {
    const currentPoints = window.pointsManager ? window.pointsManager.getPoints() : points;
    const oldPoints = parseInt(pointsDisplay.textContent);
    const diff = currentPoints - oldPoints;
    
    if (diff > 0) {
      animatePoints(oldPoints, currentPoints, 1000);
    } else {
      pointsDisplay.textContent = currentPoints;
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
  
  const currentPoints = window.pointsManager ? window.pointsManager.getPoints() : points;
  document.getElementById('final-points').textContent = currentPoints;
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
  if (currentPoints >= 5000) {
    exchangeBox.style.display = 'block';
    exchangeBox.innerHTML = `
      <div style="margin-bottom: 16px">
        🎉 축하합니다! ${currentPoints}P를 모으셨네요!<br/>
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
        (현재 ${currentPoints}P / 목표 5,000P)
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

  // 퀴즈 결과 저장 및 다음날 맞춤 메시지 표시 기능
  saveQuizResult(accuracy, null);
}

function requestExchange() {
  if (confirm('포인트는 초기화됩니다. 정말 전환 신청하시겠습니까?')) {
    window.open('https://docs.google.com/forms/d/e/1FAIpQLSf79U4uayn49L_SMV3KgjnAp8vlP7gx-XJ-v6AnBxveqlIPxg/viewform?usp=dialog', '_blank');
    localStorage.setItem('points', '0');
    location.reload();
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

function showToast(message, customClass) {
  const toast = document.createElement('div');
  toast.className = 'toast-message' + (customClass ? ' ' + customClass : '');
  toast.textContent = message;
  document.body.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('show');
  }, 100);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => {
      document.body.removeChild(toast);
    }, 600);
  }, customClass === 'attendance' ? 1800 : 3000);
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

function handleReferralReward() {
  const urlParams = new URLSearchParams(window.location.search);
  const ref = urlParams.get('ref');
  if (!ref) return;
  // 이미 이 ref로 리워드를 받은 적이 있는지 확인
  const rewardedRefs = JSON.parse(localStorage.getItem('rewardedRefs') || '[]');
  if (!rewardedRefs.includes(ref)) {
    addPoints(200);
    showToast('초대 링크로 방문! +200P가 적립되었어요 💚');
    rewardedRefs.push(ref);
    localStorage.setItem('rewardedRefs', JSON.stringify(rewardedRefs));
  }
}

function giveDailyVisitPoints() {
  const today = new Date().toISOString().slice(0, 10); // 'YYYY-MM-DD'
  const lastVisit = localStorage.getItem('lastVisitDate');
  if (lastVisit !== today) {
    addPoints(100);
    showToast('출석 완료  +100P', 'attendance');
    localStorage.setItem('lastVisitDate', today);
  }
}

// 퀴즈 결과 저장 및 다음날 맞춤 메시지 표시 기능
function saveQuizResult(score, lastWrongCategory) {
  const today = new Date().toISOString().slice(0, 10);
  localStorage.setItem('lastQuizDate', today);
  localStorage.setItem('lastScore', score);
  if (lastWrongCategory) {
    localStorage.setItem('lastWrongCategory', lastWrongCategory);
  }
}

function showDailyQuizReminder() {
  const today = new Date().toISOString().slice(0, 10);
  const lastQuizDate = localStorage.getItem('lastQuizDate');
  const lastScore = localStorage.getItem('lastScore');
  const lastWrongCategory = localStorage.getItem('lastWrongCategory');
  const lastReminderDate = localStorage.getItem('lastReminderDate');
  // 오늘 이미 리마인드 메시지를 본 적이 없고, 마지막 퀴즈가 오늘이 아니면
  if (lastQuizDate && lastQuizDate !== today && lastReminderDate !== today) {
    let msg = '';
    if (lastWrongCategory) {
      msg = `어제 ${lastWrongCategory} 문제 틀리셨죠? 오늘 다시 도전해보세요!`;
    } else if (lastScore) {
      msg = `어제 정답률이 ${lastScore}%였어요. 오늘 80%에 도전해보세요!`;
    } else {
      msg = '어제 퀴즈 복습, 오늘 다시 도전해보세요!';
    }
    showToast(msg);
    localStorage.setItem('lastReminderDate', today);
  }
}

// 기존 addPoints 함수를 통합 시스템으로 리다이렉트
async function addPoints(amount) {
  await window.pointsManager.addPoints(amount);
}

function showShortsSection() {
  const section = document.getElementById('shorts-section');
  if (section) {
    section.style.display = 'block';
    section.scrollIntoView({behavior: 'smooth'});
  }
}

function openVideoFullScreen(videoId) {
  const section = document.getElementById('shorts-section');
  section.innerHTML = `
    <div id="fullscreenVideoWrap" style="width:100vw; max-width:100vw; height:calc(100vh - 60px); display:flex; flex-direction:column; align-items:center; justify-content:center; background:#111;">
      <iframe id="fullscreenYoutube" width="100%" height="100%" style="flex:1; min-height:300px; border:none;" src="https://www.youtube.com/embed/${videoId}?autoplay=1&playsinline=1" allowfullscreen></iframe>
      <button onclick="loadVideoList()" class="secondary-button" style="margin:24px auto 0 auto;display:block;">← 목록으로</button>
    </div>
  `;
  // FullScreen API 적용
  setTimeout(() => {
    const wrap = document.getElementById('fullscreenVideoWrap');
    if (wrap && wrap.requestFullscreen) {
      wrap.requestFullscreen();
    } else if (wrap && wrap.webkitRequestFullscreen) {
      wrap.webkitRequestFullscreen();
    } else if (wrap && wrap.mozRequestFullScreen) {
      wrap.mozRequestFullScreen();
    } else if (wrap && wrap.msRequestFullscreen) {
      wrap.msRequestFullscreen();
    }
  }, 100);
}

function loadVideoList() {
  fetch('./videos.json')
    .then(res => res.json())
    .then(videos => {
      const section = document.getElementById('shorts-section');
      if (!section) {
        console.log('shorts-section 엘리먼트가 없음 - 스킵');
        return;
      }
      
      section.innerHTML = `
        <h3 class="video-title">🎥 1분 건강 숏츠</h3>
        <ul id="videoList" class="video-list"></ul>
        <button onclick="goBackMain()" class="secondary-button" style="margin-top:20px;">← 뒤로가기</button>
      `;
      const list = document.getElementById('videoList');
      if (!list) {
        console.log('videoList 엘리먼트가 없음 - 스킵');
        return;
      }
      
      videos.forEach(video => {
        const li = document.createElement('li');
        li.className = 'video-item';
        li.innerHTML = `
          <div class="video-card">
            <img src="https://img.youtube.com/vi/${video.id}/hqdefault.jpg" alt="썸네일" class="video-thumb">
            <div class="video-info">
              <div class="video-title-text">${video.title}</div>
              <span class="play-arrow">▶</span>
            </div>
          </div>
        `;
        li.onclick = () => openVideoFullScreen(video.id);
        list.appendChild(li);
      });
    })
    .catch(error => {
      console.log('videos.json 로드 실패:', error);
    });
}

function goToShorts() {
  // 통합 네비게이션 시스템 사용
  window.navigationManager.pushPage({
    page: 'shorts',
    state: { section: 'shorts' }
  });
  window.navigationManager.navigateToPage('shorts');
}

function goBackMain() {
  document.getElementById('main-section').style.display = 'block';
  document.getElementById('shorts-section').style.display = 'none';
  history.back();
}

// 모바일 뒤로가기 지원 강화 - popstate 이벤트 리스너
window.addEventListener('popstate', function(event) {
  console.log('📱 모바일 뒤로가기 감지:', event.state);
  console.log('📱 현재 스택 상태:', window.navigationManager.navigationStack.map(item => item.page));
  console.log('📱 현재 URL:', window.location.href);
  
  // 네비게이션 중이면 잠시 대기 후 처리
  if (window.navigationManager.isNavigating) {
    console.log('📱 네비게이션 중 - 100ms 후 재시도');
    setTimeout(() => {
      if (!window.navigationManager.isNavigating) {
        window.navigationManager.safeGoBack();
      }
    }, 100);
    return;
  }
  
  // 강제로 뒤로가기 처리 (모바일 환경 고려)
  console.log('📱 강제 뒤로가기 실행');
  const success = window.navigationManager.safeGoBack();
  
  // 뒤로가기가 실패하면 홈으로 이동
  if (!success) {
    console.log('📱 뒤로가기 실패 - 홈으로 이동');
    window.navigationManager.emergencyGoHome();
  }
});

// 모바일 환경에서 추가 뒤로가기 지원
let backPressedOnce = false;

// Android 환경에서 뒤로가기 버튼 감지 강화
document.addEventListener('keydown', function(event) {
  // Android 뒤로가기 키 (keyCode 4) 또는 ESC 키
  if (event.keyCode === 4 || event.key === 'Escape') {
    event.preventDefault();
    console.log('📱 하드웨어 뒤로가기 키 감지');
    
    const success = window.navigationManager.safeGoBack();
    if (!success && !backPressedOnce) {
      // 메인 페이지에서 첫 번째 뒤로가기 시 앱 종료 확인
      backPressedOnce = true;
      if (typeof showToast === 'function') {
        showToast('한 번 더 누르시면 앱이 종료됩니다');
      } else if (typeof window.showSalonToast === 'function') {
        window.showSalonToast('한 번 더 누르시면 앱이 종료됩니다', 'warning');
      } else {
        alert('한 번 더 누르시면 앱이 종료됩니다');
      }
      setTimeout(() => {
        backPressedOnce = false;
      }, 2000);
    } else if (!success && backPressedOnce) {
      // 두 번째 뒤로가기 시 앱 종료 (또는 홈으로)
      if (window.confirm('앱을 종료하시겠습니까?')) {
        window.close();
      }
      backPressedOnce = false;
    }
    
    return false;
  }
});

// 통합 네비게이션 관리 시스템
window.navigationManager = {
  // 네비게이션 스택
  navigationStack: [{
    page: 'main',
    state: { section: 'main' }
  }],
  
  // 현재 페이지 상태
  currentState: {
    page: 'main',
    section: 'main'
  },
  
  // 네비게이션 중인지 체크 (중복 실행 방지)
  isNavigating: false,
  
  // 페이지 이동
  pushPage(pageInfo) {
    if (this.isNavigating) {
      console.log('⚠️ pushPage 호출됐지만 이미 네비게이션 중 - 무시');
      return;
    }
    
    this.isNavigating = true;
    
    try {
      console.log('➡️ pushPage 호출:', pageInfo.page);
      console.log('➡️ 현재 스택:', this.navigationStack.map(item => item.page));
      
      // 현재 상태를 스택에 추가
      this.navigationStack.push({
        page: pageInfo.page,
        state: pageInfo.state || {},
        timestamp: Date.now()
      });
      
      // 브라우저 히스토리에 추가
      const stateData = {
        page: pageInfo.page,
        ...pageInfo.state,
        fromNavigationManager: true  // 우리가 추가한 것임을 표시
      };
      
      history.pushState(stateData, '', `#${pageInfo.page}`);
      this.currentState = { page: pageInfo.page, ...pageInfo.state };
      
      console.log('✅ 네비게이션 푸시 완료:', pageInfo.page, '스택 길이:', this.navigationStack.length);
      console.log('✅ 새로운 스택:', this.navigationStack.map(item => item.page));
    } catch (error) {
      console.error('❌ 네비게이션 푸시 오류:', error);
    } finally {
      setTimeout(() => {
        this.isNavigating = false;
      }, 100);
    }
  },
  
  // 뒤로가기
  goBack() {
    console.log('🔙 goBack 호출, 현재 스택 길이:', this.navigationStack.length);
    console.log('🔙 isNavigating:', this.isNavigating);
    
    if (this.isNavigating) {
      console.log('🔙 이미 네비게이션 중 - 무시');
      return false;
    }
    
    if (this.navigationStack.length <= 1) {
      console.log('🔙 스택이 1개 이하 - 뒤로갈 곳이 없음');
      return false;
    }
    
    this.isNavigating = true;
    
    try {
      console.log('🔙 goBack 진행 중...');
      console.log('🔙 제거하기 전 스택:', this.navigationStack.map(item => item.page));
      
      // 현재 페이지를 스택에서 제거
      const removedPage = this.navigationStack.pop();
      console.log('🔙 제거된 페이지:', removedPage ? removedPage.page : 'null');
      
      // 이전 페이지 정보 가져오기
      const previousPage = this.navigationStack[this.navigationStack.length - 1];
      console.log('🔙 이동할 이전 페이지:', previousPage ? previousPage.page : 'null');
      console.log('🔙 제거 후 스택:', this.navigationStack.map(item => item.page));
      console.log('🔙 새로운 스택 길이:', this.navigationStack.length);
      
      if (!previousPage) {
        console.error('🔙 ❌ 이전 페이지가 없습니다! 강제로 메인 페이지로 이동');
        this.navigationStack = [{ page: 'main', state: { section: 'main' } }];
        this.navigateToPage('main');
        return true;
      }
      
      // 페이지 전환 실행
      console.log('🔙 ➡️ 페이지 전환 시작:', previousPage.page);
      this.navigateToPage(previousPage.page, previousPage.state);
      console.log('🔙 ✅ 페이지 전환 완료');
      
      return true;
    } catch (error) {
      console.error('🔙 ❌ 네비게이션 백 오류:', error);
      console.error('🔙 ❌ 오류 스택:', error.stack);
      
      // 오류 발생 시 안전하게 메인으로
      console.log('🔙 🛡️ 오류 복구: 메인 페이지로 강제 이동');
      this.navigationStack = [{ page: 'main', state: { section: 'main' } }];
      this.navigateToPage('main');
      return false;
    } finally {
      setTimeout(() => {
        console.log('🔙 🔓 네비게이션 잠금 해제');
        this.isNavigating = false;
      }, 200);
    }
  },
  
  // 특정 페이지로 이동
  navigateToPage(page, state = {}) {
    console.log(`🎯 navigateToPage 시작: ${page}`, state);
    console.log(`🎯 현재 스택 길이: ${this.navigationStack.length}`);
    console.log(`🎯 현재 스택: [${this.navigationStack.map(item => item.page).join(' → ')}]`);
    
    this.currentState = { page, ...state };
    
    // 페이지 전환 애니메이션
    const overlay = document.getElementById('page-transition-overlay');
    if (overlay) {
      overlay.classList.add('active');
      setTimeout(() => overlay.classList.remove('active'), 200);
    }
    
    // 모든 페이지/모달 초기화
    this.closeAllPages();
    
    // 특정 페이지 활성화
    switch (page) {
      case 'main':
        console.log('🏠 메인 페이지로 이동 중...');
        this.showMainPage();
        console.log('🏠 메인 페이지 표시 완료');
        break;
      case 'habit-salon':
        console.log('🌿 습관살롱 페이지로 이동 중...');
        this.showHabitSalon(state.section);
        console.log('🌿 습관살롱 페이지 표시 완료');
        break;
      case 'brand-story':
        console.log('📖 브랜드 스토리 페이지로 이동 중...');
        this.showBrandStoryPage();
        console.log('📖 브랜드 스토리 페이지 표시 완료');
        break;
      case 'question':
        console.log('❓ 질문 페이지로 이동 중...');
        this.showQuestionPage();
        console.log('❓ 질문 페이지 표시 완료');
        break;
      case 'free':
        console.log('💬 자유게시판 페이지로 이동 중...');
        this.showFreePage();
        console.log('💬 자유게시판 페이지 표시 완료');
        break;
      case 'shorts':
        console.log('🎥 숏츠 페이지로 이동 중...');
        this.showShortsPage();
        console.log('🎥 숏츠 페이지 표시 완료');
        break;
      case 'quiz':
        console.log('🧠 퀴즈 페이지로 이동 중...');
        this.showQuizPage();
        console.log('🧠 퀴즈 페이지 표시 완료');
        break;
      case 'write':
        console.log('✏️ 글쓰기 페이지로 이동 중...');
        this.showWritePage();
        console.log('✏️ 글쓰기 페이지 표시 완료');
        break;
      default:
        console.log('🏠 알 수 없는 페이지 - 메인으로 리다이렉트');
        this.showMainPage();
    }
    
    console.log(`✅ navigateToPage 완료: ${page}`);
    
    // DOM 상태 확인
    setTimeout(() => {
      const mainSection = document.getElementById('main-section');
      const habitSalonMain = document.getElementById('habit-salon-main');
      console.log(`🔍 DOM 상태 확인:`, {
        mainSection: mainSection ? mainSection.style.display : 'null',
        habitSalonMain: habitSalonMain ? habitSalonMain.style.display : 'null',
        currentPage: page
      });
    }, 100);
  },
  
  // 모든 페이지/모달 닫기
  closeAllPages() {
    // 습관살롱 메인
    const habitSalonMain = document.getElementById('habit-salon-main');
    if (habitSalonMain) habitSalonMain.style.display = 'none';
    
    // 브랜드 스토리 전체화면
    const brandStoryPage = document.getElementById('brand-story-fullscreen');
    if (brandStoryPage) brandStoryPage.classList.remove('active');
    
    // 질문 전체화면
    const questionPage = document.getElementById('question-fullscreen');
    if (questionPage) questionPage.classList.remove('active');
    
    // 자유게시판 전체화면
    const freePage = document.getElementById('habit-salon-free');
    if (freePage) {
      freePage.classList.remove('fullscreen');
      freePage.style.position = '';
      freePage.style.width = '';
      freePage.style.height = '';
      freePage.style.top = '';
      freePage.style.left = '';
      freePage.style.background = '';
      freePage.style.zIndex = '';
      freePage.style.overflowY = '';
      freePage.style.margin = '';
      freePage.style.padding = '';
    }
    
    // 글쓰기 모달
    const writeModal = document.getElementById('free-write-fullscreen');
    if (writeModal) writeModal.classList.remove('active');
    
    // 숏츠 섹션
    const shortsSection = document.getElementById('shorts-section');
    if (shortsSection) shortsSection.style.display = 'none';
    
    // 퀴즈 박스 (quiz.html용)
    const quizBox = document.getElementById('quiz-box');
    if (quizBox) quizBox.style.display = 'none';
    
    // 바디 스크롤 복원
    document.body.style.overflow = '';
    
    // 페이지 전환 오버레이 숨김
    const overlay = document.getElementById('page-transition-overlay');
    if (overlay) overlay.classList.remove('active');
  },
  
  // 메인 페이지 표시
  showMainPage() {
    console.log('🏠 showMainPage 시작');
    
    const mainSection = document.getElementById('main-section');
    const habitSalonMain = document.getElementById('habit-salon-main');
    
    console.log('🏠 DOM 요소 확인:', {
      mainSection: mainSection ? 'found' : 'NOT FOUND',
      habitSalonMain: habitSalonMain ? 'found' : 'NOT FOUND'
    });
    
    if (mainSection) {
      mainSection.style.display = 'block';
      console.log('🏠 ✅ 메인 섹션 표시됨');
    } else {
      console.error('🏠 ❌ main-section 요소를 찾을 수 없습니다!');
    }
    
    // 다른 섹션들 확실히 숨기기
    if (habitSalonMain) {
      habitSalonMain.style.display = 'none';
      console.log('🏠 습관살롱 메인 숨김');
    }
    
    // 다른 모든 전체화면 요소들도 숨기기
    const allFullscreenElements = [
      'brand-story-fullscreen',
      'question-fullscreen', 
      'habit-salon-free',
      'free-write-fullscreen',
      'shorts-section'
    ];
    
    allFullscreenElements.forEach(id => {
      const element = document.getElementById(id);
      if (element) {
        element.style.display = 'none';
        element.classList.remove('active', 'fullscreen');
        console.log(`🏠 ${id} 숨김 처리됨`);
      }
    });
    
    // 바디 스크롤 복원
    document.body.style.overflow = '';
    
    console.log('🏠 showMainPage 완료');
    
    // 2초 후 다시 한번 확인
    setTimeout(() => {
      const mainCheck = document.getElementById('main-section');
      const habitCheck = document.getElementById('habit-salon-main');
      console.log('🏠 🔍 2초 후 재확인:', {
        mainDisplay: mainCheck ? mainCheck.style.display : 'null',
        habitDisplay: habitCheck ? habitCheck.style.display : 'null',
        bodyOverflow: document.body.style.overflow
      });
      
      // 혹시 메인이 안 보이고 있다면 강제로 다시 표시
      if (mainCheck && (mainCheck.style.display === 'none' || mainCheck.style.display === '')) {
        console.log('🏠 🛡️ 메인 섹션 강제 표시');
        mainCheck.style.display = 'block';
        mainCheck.style.visibility = 'visible';
        mainCheck.style.opacity = '1';
      }
    }, 2000);
  },
  
  // 습관살롱 표시
  showHabitSalon(section = 'main') {
    const habitSalonMain = document.getElementById('habit-salon-main');
    const mainSection = document.getElementById('main-section');
    
    if (habitSalonMain) habitSalonMain.style.display = 'block';
    if (mainSection) mainSection.style.display = 'none';
    
    // 특정 섹션이 있으면 해당 섹션으로
    if (section !== 'main' && window.showHabitSalonSection) {
      window.showHabitSalonSection(section);
    }
  },
  
  // 브랜드 스토리 페이지 표시
  showBrandStoryPage() {
    if (window.openBrandStoryPage) {
      window.openBrandStoryPage();
    }
  },
  
  // 질문 페이지 표시
  showQuestionPage() {
    if (window.openQuestionPage) {
      window.openQuestionPage();
    }
  },
  
  // 자유게시판 페이지 표시
  showFreePage() {
    if (window.openFreePage) {
      window.openFreePage();
    }
  },
  
  // 숏츠 페이지 표시
  showShortsPage() {
    const mainSection = document.getElementById('main-section');
    const shortsSection = document.getElementById('shorts-section');
    
    if (mainSection) mainSection.style.display = 'none';
    if (shortsSection) {
      shortsSection.style.display = 'block';
      if (typeof loadVideoList === 'function') {
        loadVideoList();
      }
    }
  },
  
  // 퀴즈 페이지 표시
  showQuizPage() {
    const quizBox = document.getElementById('quiz-box');
    if (quizBox) quizBox.style.display = 'block';
  },
  
  // 글쓰기 모달 표시
  showWritePage() {
    const writeModal = document.getElementById('free-write-fullscreen');
    if (writeModal) {
      writeModal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  },
  
  // 현재 위치 정보 반환
  getCurrentLocation() {
    return {
      page: this.currentState.page,
      section: this.currentState.section,
      stackDepth: this.navigationStack.length
    };
  },
  
  // 디버깅용 - 네비게이션 스택 출력
  debugStack() {
    console.log('네비게이션 스택:', this.navigationStack);
    console.log('현재 상태:', this.currentState);
  },
  
  // 안전한 뒤로가기 (앱 종료 방지)
  safeGoBack() {
    console.log('🔙 safeGoBack 호출, 현재 스택 길이:', this.navigationStack.length);
    console.log('🔙 현재 스택:', this.navigationStack.map(item => item.page));
    console.log('🔙 현재 페이지:', this.currentState.page);
    
    // 스택 상태 검증
    if (!this.navigationStack || this.navigationStack.length === 0) {
      console.error('🔙 ❌ 네비게이션 스택이 비어있음! 강제 초기화');
      this.navigationStack = [{ page: 'main', state: { section: 'main' } }];
      this.navigateToPage('main');
      return false;
    }
    
    // 스택이 2개 이상이면 정상적인 뒤로가기 수행
    if (this.navigationStack.length > 1) {
      console.log('📱 정상적인 뒤로가기 수행');
      const result = this.goBack();
      
      // 만약 goBack이 실패했다면 안전하게 메인으로
      if (!result) {
        console.log('🔙 ⚠️ goBack 실패 - 안전하게 메인으로 이동');
        this.navigationStack = [{ page: 'main', state: { section: 'main' } }];
        this.navigateToPage('main');
      }
      
      return result;
    }
    
    // 스택이 1개뿐이면 (메인 페이지에 있으면) 앱 종료 방지
    console.log('📱 메인 페이지에서 뒤로가기 - 앱 종료 방지');
    
    // 현재 페이지가 메인이 아니라면 강제로 메인으로
    if (this.currentState.page !== 'main') {
      console.log('🔙 🛡️ 현재 페이지가 메인이 아님 - 강제로 메인으로 이동');
      this.navigationStack = [{ page: 'main', state: { section: 'main' } }];
      this.navigateToPage('main');
    } else {
      console.log('🔙 ✅ 이미 메인 페이지 - 아무 동작 없음');
    }
    
    return false;
  },
  
  // 모바일 환경에서 추가 안전장치
  emergencyGoHome() {
    console.log('🚨 emergencyGoHome 호출 - 강제로 홈으로 이동');
    
    // 모든 상태 초기화
    this.navigationStack = [{ page: 'main', state: { section: 'main' } }];
    this.currentState = { page: 'main', section: 'main' };
    this.isNavigating = false;
    
    // 강제로 모든 페이지 숨기고 메인만 표시
    this.closeAllPages();
    this.showMainPage();
    
    // URL도 초기화
    try {
      history.replaceState({ page: 'main', fromNavigationManager: true }, '', '#main');
    } catch (e) {
      console.error('URL 초기화 실패:', e);
    }
    
    console.log('🚨 emergencyGoHome 완료');
  }
};

// 모바일 환경 추가 지원 기능들
// PWA 및 모바일 브라우저에서 뒤로가기 동작 개선
let lastBackTime = 0;
const BACK_COOLDOWN = 300; // 300ms 쿨다운

// 페이지 가시성 변경 감지 (앱이 백그라운드로 가거나 돌아올 때)
document.addEventListener('visibilitychange', function() {
  if (document.visibilityState === 'visible') {
    console.log('📱 앱이 포그라운드로 돌아옴');
    // 네비게이션 상태 검증
    if (window.navigationManager && window.navigationManager.currentState.page !== 'main') {
      const currentElement = document.getElementById('main-section');
      if (currentElement && currentElement.style.display === 'none') {
        console.log('📱 메인 페이지가 숨겨져 있음 - 복원 시도');
        window.navigationManager.showMainPage();
      }
    }
  } else {
    console.log('📱 앱이 백그라운드로 이동');
  }
});

// beforeunload 이벤트로 의도치 않은 앱 종료 방지
window.addEventListener('beforeunload', function(event) {
  // 메인 페이지가 아닌 곳에서 새로고침이나 종료 시도 시에만 경고
  if (window.navigationManager && window.navigationManager.navigationStack.length > 1) {
    const message = '페이지를 벗어나시겠습니까? 진행 중인 내용이 사라질 수 있습니다.';
    event.returnValue = message;
    return message;
  }
});

// 모바일 환경에서 스와이프 제스처 감지 (뒤로가기)
let touchStartX = 0;
let touchStartY = 0;
let touchEndX = 0;
let touchEndY = 0;

document.addEventListener('touchstart', function(event) {
  touchStartX = event.changedTouches[0].screenX;
  touchStartY = event.changedTouches[0].screenY;
}, { passive: true });

document.addEventListener('touchend', function(event) {
  touchEndX = event.changedTouches[0].screenX;
  touchEndY = event.changedTouches[0].screenY;
  
  // 화면 왼쪽 가장자리에서 시작하는 오른쪽 스와이프 감지
  const swipeDistance = touchEndX - touchStartX;
  const verticalDistance = Math.abs(touchEndY - touchStartY);
  
  // 조건: 화면 왼쪽 10% 이내에서 시작, 100px 이상 오른쪽으로 스와이프, 세로 이동은 50px 이하
  if (touchStartX < window.innerWidth * 0.1 && 
      swipeDistance > 100 && 
      verticalDistance < 50) {
    
    console.log('📱 왼쪽 가장자리 스와이프 감지 - 뒤로가기 실행');
    const currentTime = Date.now();
    
    // 쿨다운 체크
    if (currentTime - lastBackTime > BACK_COOLDOWN) {
      lastBackTime = currentTime;
      window.navigationManager.safeGoBack();
    }
  }
}, { passive: true });

// 모바일에서 더블탭으로 홈 가기 (비상용)
let lastTapTime = 0;
let tapCount = 0;

document.addEventListener('touchend', function(event) {
  const currentTime = Date.now();
  const tapLength = currentTime - lastTapTime;
  
  if (tapLength < 500 && tapLength > 0) {
    tapCount++;
    if (tapCount === 3) { // 3번 연속 탭
      console.log('📱 3번 연속 탭 감지 - 홈으로 이동');
      window.navigationManager.emergencyGoHome();
      tapCount = 0;
    }
  } else {
    tapCount = 1;
  }
  
  lastTapTime = currentTime;
}, { passive: true });

// 모바일에서 장시간 터치로 응급 홈 가기
let longPressTimer;
let isLongPressing = false;

document.addEventListener('touchstart', function(event) {
  isLongPressing = false;
  longPressTimer = setTimeout(() => {
    isLongPressing = true;
    console.log('📱 장시간 터치 감지 - 응급 홈 가기 대기 중');
    
    // 진동이 지원되면 진동으로 알림
    if (navigator.vibrate) {
      navigator.vibrate([100, 50, 100]);
    }
  }, 2000); // 2초 장압
}, { passive: true });

document.addEventListener('touchend', function(event) {
  clearTimeout(longPressTimer);
  
  if (isLongPressing) {
    console.log('📱 장시간 터치 종료 - 응급 홈 가기 실행');
    window.navigationManager.emergencyGoHome();
    
    if (typeof showToast === 'function') {
      showToast('응급 모드: 홈으로 이동됨');
    }
  }
  
  isLongPressing = false;
}, { passive: true });

document.addEventListener('touchmove', function(event) {
  // 터치가 이동하면 장압 취소
  clearTimeout(longPressTimer);
  isLongPressing = false;
}, { passive: true }); 