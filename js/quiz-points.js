import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, doc, runTransaction, serverTimestamp, onSnapshot, getDocFromServer } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js?v=20261106-points1";
import { installPointPersistence } from "./point-persistence.js?v=20261106-points1";
import { watchShareBalance } from "./kakao-share.js?v=20261124-resume";
const db = getFirestore(initializeApp(firebaseConfig));
installPointPersistence(window, { db, doc, runTransaction, serverTimestamp });
const wallet = window.pointsManager.userId();
if (localStorage.getItem('neulbom_kakao_sent_' + wallet)) {
  watchShareBalance(window, { db, doc, onSnapshot, getDocFromServer }, wallet);
}
