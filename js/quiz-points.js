import { initializeApp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-app.js";
import { getFirestore, doc, runTransaction, serverTimestamp } from "https://www.gstatic.com/firebasejs/11.8.1/firebase-firestore.js";
import { firebaseConfig } from "./firebase-config.js?v=20261106-points1";
import { installPointPersistence } from "./point-persistence.js?v=20261106-points1";
installPointPersistence(window, { db: getFirestore(initializeApp(firebaseConfig)), doc, runTransaction, serverTimestamp });
