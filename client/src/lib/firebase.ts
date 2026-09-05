import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import firebaseConfigData from "../../../firebase-applet-config.json";

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || firebaseConfigData.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || firebaseConfigData.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || firebaseConfigData.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || firebaseConfigData.storageBucket,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || firebaseConfigData.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || firebaseConfigData.appId,
};

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);

export const auth = getAuth(app);

/** Đăng nhập Google. `prompt: select_account` để đổi tài khoản được, không dính
 *  cứng vào tài khoản Google đầu tiên của trình duyệt. */
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

const dbId = firebaseConfigData.firestoreDatabaseId;

export const db = dbId && dbId !== "(default)" ? getFirestore(app, dbId) : getFirestore(app);

export default app;
