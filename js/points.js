// 포인트 교환 요청 관련 함수들
async function requestPointExchange(points) {
  try {
    if (!auth.currentUser) {
      throw new Error('로그인이 필요합니다.');
    }

    if (points < 5000) {
      throw new Error('최소 5,000포인트부터 교환 신청이 가능합니다.');
    }

    const userId = auth.currentUser.uid;
    const userDoc = await getDoc(doc(db, 'users', userId));
    const userData = userDoc.data();
    const currentPoints = userData.points || 0;
    const userNickname = userData.nickname || '사용자';

    if (currentPoints < points) {
      throw new Error('보유 포인트가 부족합니다.');
    }

    // 교환 요청 생성
    const exchangeRequest = {
      userId: userId,
      points: points,
      status: 'pending',
      nickname: userNickname,
      pointsAtRequest: currentPoints,  // 교환 신청 시점의 총 보유 포인트
      remainingPoints: currentPoints - points,  // 교환 후 남은 포인트
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    };

    // Firestore에 교환 요청 추가
    const docRef = await addDoc(collection(db, 'exchangeRequests'), exchangeRequest);

    // 사용자의 포인트 차감
    await updateDoc(doc(db, 'users', userId), {
      points: currentPoints - points
    });

    alert('포인트 교환 신청이 완료되었습니다.');
    return docRef.id;

  } catch (error) {
    console.error('포인트 교환 요청 오류:', error);
    alert(error.message);
    throw error;
  }
}

// 교환 요청 상태 확인
async function checkExchangeRequestStatus(requestId) {
  try {
    const requestDoc = await getDoc(doc(db, 'exchangeRequests', requestId));
    if (!requestDoc.exists()) {
      throw new Error('존재하지 않는 교환 요청입니다.');
    }
    return requestDoc.data().status;
  } catch (error) {
    console.error('교환 요청 상태 확인 오류:', error);
    throw error;
  }
}

// 교환 요청 취소
async function cancelExchangeRequest(requestId) {
  try {
    if (!auth.currentUser) {
      throw new Error('로그인이 필요합니다.');
    }

    const requestDoc = await getDoc(doc(db, 'exchangeRequests', requestId));
    if (!requestDoc.exists()) {
      throw new Error('존재하지 않는 교환 요청입니다.');
    }

    const requestData = requestDoc.data();
    if (requestData.userId !== auth.currentUser.uid) {
      throw new Error('자신의 교환 요청만 취소할 수 있습니다.');
    }

    if (requestData.status !== 'pending') {
      throw new Error('처리 중이거나 완료된 요청은 취소할 수 없습니다.');
    }

    // 교환 요청 상태 업데이트
    await updateDoc(doc(db, 'exchangeRequests', requestId), {
      status: 'cancelled',
      updatedAt: serverTimestamp()
    });

    // 차감된 포인트 반환
    const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
    const currentPoints = userDoc.data().points || 0;
    await updateDoc(doc(db, 'users', auth.currentUser.uid), {
      points: currentPoints + requestData.points
    });

    alert('포인트 교환 신청이 취소되었습니다.');
  } catch (error) {
    console.error('교환 요청 취소 오류:', error);
    alert(error.message);
    throw error;
  }
}

// 사용자의 진행 중인 교환 요청 확인
async function getActiveExchangeRequests() {
  try {
    if (!auth.currentUser) {
      throw new Error('로그인이 필요합니다.');
    }

    const userId = auth.currentUser.uid;
    const q = query(
      collection(db, 'exchangeRequests'),
      where('userId', '==', userId),
      where('status', '==', 'pending'),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    }));
  } catch (error) {
    console.error('진행 중인 교환 요청 조회 오류:', error);
    throw error;
  }
}



// UI 요소
const pointsDisplay = document.getElementById('pointsDisplay');
const currentPointsSpan = document.getElementById('currentPoints');
const exchangePointsBtn = document.getElementById('exchangePointsBtn');
const exchangeModal = document.getElementById('exchangeModal');
const modalCurrentPoints = document.getElementById('modalCurrentPoints');
const exchangeAmount = document.getElementById('exchangeAmount');
const submitExchange = document.getElementById('submitExchange');
const closeModal = document.querySelector('.close');
const activeExchangeRequests = document.getElementById('activeExchangeRequests');
const requestsList = document.getElementById('requestsList');

// 포인트 표시 업데이트
async function updatePointsDisplay() {
  if (!auth.currentUser) return;

  const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
  const points = userDoc.data()?.points || 0;
  
  currentPointsSpan.textContent = points.toLocaleString();
  modalCurrentPoints.textContent = points.toLocaleString();
  
  // 5000포인트 이상일 때만 교환 버튼 표시
  exchangePointsBtn.style.display = points >= 5000 ? 'block' : 'none';
}

// 진행 중인 교환 요청 목록 업데이트
async function updateActiveRequests() {
  try {
    const requests = await getActiveExchangeRequests();
    
    if (requests.length > 0) {
      activeExchangeRequests.style.display = 'block';
      requestsList.innerHTML = requests.map(request => `
        <div class="exchange-request-item">
          <div class="request-info">
            <p><strong>${request.nickname}</strong>님의 교환 신청</p>
            <p>신청 금액: ${request.points.toLocaleString()} 포인트</p>
            <p>신청 시점 보유 포인트: ${request.pointsAtRequest.toLocaleString()} 포인트</p>
            <p>교환 후 잔여 포인트: ${request.remainingPoints.toLocaleString()} 포인트</p>
            <p>신청 일시: ${new Date(request.createdAt.toDate()).toLocaleString()}</p>
          </div>
          <div class="request-actions">
            <button class="cancel-request-btn" data-request-id="${request.id}">취소</button>
          </div>
        </div>
      `).join('');

      // 취소 버튼 이벤트 리스너 추가
      document.querySelectorAll('.cancel-request-btn').forEach(btn => {
        btn.addEventListener('click', async (e) => {
          const requestId = e.target.dataset.requestId;
          await cancelExchangeRequest(requestId);
          await updateActiveRequests();
          await updatePointsDisplay();
        });
      });
    } else {
      activeExchangeRequests.style.display = 'none';
    }
  } catch (error) {
    console.error('교환 요청 목록 업데이트 오류:', error);
  }
}

// 이벤트 리스너
exchangePointsBtn.addEventListener('click', () => {
  exchangeModal.style.display = 'block';
});

closeModal.addEventListener('click', () => {
  exchangeModal.style.display = 'none';
});

window.addEventListener('click', (e) => {
  if (e.target === exchangeModal) {
    exchangeModal.style.display = 'none';
  }
});

submitExchange.addEventListener('click', async () => {
  const amount = parseInt(exchangeAmount.value);
  if (!amount || amount < 5000) {
    alert('최소 5,000포인트부터 교환 가능합니다.');
    return;
  }

  try {
    await requestPointExchange(amount);
    exchangeModal.style.display = 'none';
    exchangeAmount.value = '';
    await updatePointsDisplay();
    await updateActiveRequests();
  } catch (error) {
    console.error('포인트 교환 신청 오류:', error);
  }
});

// 인증 상태 변경 시 UI 업데이트
auth.onAuthStateChanged(async (user) => {
  if (user) {
    pointsDisplay.style.display = 'flex';
    await updatePointsDisplay();
    await updateActiveRequests();
  } else {
    pointsDisplay.style.display = 'none';
    activeExchangeRequests.style.display = 'none';
  }
}); 