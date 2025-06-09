import { initializeApp } from "firebase/app";
import { getFirestore, collection, doc, setDoc, getDocs, query, where, getDoc, updateDoc, addDoc, serverTimestamp, orderBy, limit } from "firebase/firestore";
import { firebaseConfig } from "./firebase-config.js";

// Firebase 초기화
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

// 닉네임 중복 체크
export async function isNicknameTaken(nickname, excludeUserId = null) {
  const usersRef = collection(db, "users");
  const q = query(usersRef, where("nickname", "==", nickname));
  const querySnapshot = await getDocs(q);
  
  if (excludeUserId) {
    // 자신의 현재 닉네임은 중복 체크에서 제외
    return querySnapshot.docs.some(doc => doc.id !== excludeUserId);
  }
  return !querySnapshot.empty;
}

// 닉네임 등록
export async function registerNickname(nickname) {
  try {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      throw new Error("사용자 ID가 없습니다.");
    }

    // 닉네임 중복 체크 (자신의 현재 닉네임은 제외)
    if (await isNicknameTaken(nickname, userId)) {
      throw new Error("이미 사용 중인 닉네임입니다.");
    }

    // Firestore에 저장
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      // 기존 문서 업데이트
      await updateDoc(userRef, { nickname });
    } else {
      // 새 문서 생성
      await setDoc(userRef, {
        userId,
        nickname,
        points: 0,
        createdAt: new Date()
      });
    }

    // 로컬 스토리지에 저장
    localStorage.setItem("nickname", nickname);
    return true;
  } catch (error) {
    console.error("닉네임 등록 실패:", error);
    throw error;
  }
}

// 현재 사용자의 닉네임 가져오기
export async function getCurrentNickname() {
  const userId = localStorage.getItem("userId");
  if (!userId) {
    return "익명";
  }

  // 먼저 로컬 스토리지 확인
  const localNickname = localStorage.getItem("nickname");
  if (localNickname) {
    return localNickname;
  }

  // Firestore에서 확인
  const userRef = doc(db, "users", userId);
  const userDoc = await getDoc(userRef);
  
  if (userDoc.exists() && userDoc.data().nickname) {
    const nickname = userDoc.data().nickname;
    localStorage.setItem("nickname", nickname); // 로컬 캐시 업데이트
    return nickname;
  }

  return "익명";
}

// 포인트 조회
export async function getMyPoints() {
  const userId = localStorage.getItem("userId");
  if (!userId) {
    throw new Error("로그인이 필요합니다.");
  }

  const userRef = doc(db, "users", userId);
  const userSnap = await getDoc(userRef);
  
  if (!userSnap.exists()) {
    throw new Error("사용자 정보를 찾을 수 없습니다.");
  }

  return userSnap.data().points || 0;
}

// 사용자 정보 가져오기
export async function getUserInfo(userId) {
  try {
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      return { nickname: "익명" };
    }

    const userData = userDoc.data();
    return {
      nickname: userData.nickname || "익명",
      points: userData.points || 0,
      createdAt: userData.createdAt
    };
  } catch (error) {
    console.error("사용자 정보 조회 실패:", error);
    return { nickname: "익명" };
  }
}

// 포인트 전환 신청
export async function requestPointExchange() {
  try {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      throw new Error("로그인이 필요합니다.");
    }

    // 현재 사용자 정보 조회
    const userRef = doc(db, "users", userId);
    const userDoc = await getDoc(userRef);
    
    if (!userDoc.exists()) {
      throw new Error("사용자 정보를 찾을 수 없습니다.");
    }

    const userData = userDoc.data();
    const currentPoints = userData.points || 0;
    const nickname = userData.nickname || "익명";

    // 최소 전환 포인트 체크
    if (currentPoints < 1000) {
      throw new Error("전환 가능한 최소 포인트는 1,000P 입니다.");
    }

    // 이전 전환 신청 내역 확인 (24시간 이내 중복 신청 방지)
    const recentRequestQuery = query(
      collection(db, "exchangeRequests"),
      where("userId", "==", userId),
      where("requestedAt", ">=", new Date(Date.now() - 24 * 60 * 60 * 1000)),
      orderBy("requestedAt", "desc"),
      limit(1)
    );
    
    const recentRequests = await getDocs(recentRequestQuery);
    if (!recentRequests.empty) {
      throw new Error("24시간 이내에 이미 전환 신청을 하셨습니다.");
    }

    // 전환 신청 기록 저장
    await addDoc(collection(db, "exchangeRequests"), {
      userId,
      nickname,
      points: currentPoints,
      requestedAt: serverTimestamp(),
      status: "pending"
    });

    // 포인트 차감 (옵션 - 필요한 경우 주석 해제)
    // await updateDoc(userRef, {
    //   points: 0
    // });

    return {
      success: true,
      message: "포인트 전환 신청이 완료되었습니다.",
      exchangedPoints: currentPoints
    };
  } catch (error) {
    console.error("포인트 전환 신청 실패:", error);
    throw error;
  }
}

// 내 전환 신청 내역 조회
export async function getMyExchangeRequests() {
  try {
    const userId = localStorage.getItem("userId");
    if (!userId) {
      throw new Error("로그인이 필요합니다.");
    }

    const requestsQuery = query(
      collection(db, "exchangeRequests"),
      where("userId", "==", userId),
      orderBy("requestedAt", "desc"),
      limit(10)
    );

    const querySnapshot = await getDocs(requestsQuery);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data(),
      requestedAt: doc.data().requestedAt?.toDate() || null
    }));
  } catch (error) {
    console.error("전환 신청 내역 조회 실패:", error);
    throw error;
  }
} 