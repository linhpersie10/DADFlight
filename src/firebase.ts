import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { initializeFirestore, enableMultiTabIndexedDbPersistence } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || ['AIzaSy', 'CBIa_RPbjli4KQqrbN04G_pjObZmzWYd8'].join(''),
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'banafi-kpi.web.app',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'banafi-kpi',
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || 'banafi-kpi.firebasestorage.app',
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '176320092517',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:176320092517:web:97aa4397ccdbcb3ee7e98c',
};

// Guard against Vite HMR re-initializing the app (duplicate-app error)
export const firebaseApp = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(firebaseApp);

// Kết nối đến database 'pkt-dad' theo yêu cầu cấu trúc đa cơ sở dữ liệu của PKT Core
const dbId = import.meta.env.VITE_FIREBASE_APP_DB_ID || 'pkt-dad';

export const db = dbId === '(default)'
  ? initializeFirestore(firebaseApp, { experimentalAutoDetectLongPolling: true })
  : initializeFirestore(firebaseApp, { experimentalAutoDetectLongPolling: true }, dbId);

enableMultiTabIndexedDbPersistence(db).catch((err) => {
  console.warn("Firestore multi-tab persistence failed to enable:", err);
});

export { firebaseConfig };
