import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import firebaseConfigData from "../../../firebase-applet-config.json";

/**
 * Firebase ở dự án này CHỈ làm một việc: đăng nhập Google.
 * Dữ liệu voucher nằm ở Supabase, ảnh bill nằm ở Cloudinary — không dùng
 * Firestore hay Firebase Storage, nên không khởi tạo hai thứ đó nữa.
 */
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

export default app;
