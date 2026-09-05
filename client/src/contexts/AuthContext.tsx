/**
 * Đăng nhập bằng Google (Firebase Auth).
 *
 * Thay cho cách cũ: 4 nút "đăng nhập 1-click" dùng chung mật khẩu "123456" nằm
 * ngay trong mã nguồn của một repo công khai — ai mở link cũng bấm vào thẳng
 * được tài khoản Ban Quản Lý.
 *
 * Luồng mới:
 *   1. Bấm "Đăng nhập bằng Google".
 *   2. Client gửi ID token lên /api/session. Server tự xác minh chữ ký và TRA
 *      QUYỀN Ở PHÍA SERVER — client không bao giờ tự khai vai trò của mình.
 *   3. Email lạ -> trạng thái "pending", chọn nhà hàng muốn xin vào, chờ chủ hệ
 *      thống duyệt. Chưa duyệt thì không đọc được dữ liệu nào.
 */
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { auth, googleProvider } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  signOut,
  User,
} from "firebase/auth";
import { authFetchJson } from "@/lib/authFetch";
import type { UserProfile } from "@/lib/firestoreService";

export type AppRole = "super_admin" | "admin" | "restaurant" | "pending";

export interface SessionUser {
  email: string;
  role: AppRole;
  restaurantId: string | null;
  restaurantName: string;
  requestedRestaurantId: string | null;
  displayName: string | null;
}

export interface RestaurantOption {
  id: string;
  name: string;
}

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  session: SessionUser | null;
  restaurants: RestaurantOption[];
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  /** Đã đăng nhập Google nhưng chưa được cấp quyền xem dữ liệu. */
  isPending: boolean;
  loginWithGoogle: () => Promise<void>;
  /** Người dùng chờ duyệt chọn nhà hàng muốn xin vào. */
  requestAccess: (restaurantId: string) => Promise<void>;
  refreshSession: () => Promise<void>;
  logout: () => Promise<void>;
}

/** Người dùng tự đóng popup — không phải lỗi, đừng hiện gì. */
const USER_CANCELLED = ["auth/popup-closed-by-user", "auth/cancelled-popup-request", "auth/user-cancelled"];

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/** Đổi hồ sơ phiên sang UserProfile để phần giao diện cũ dùng lại được.
 *  `username` mang restaurantId vì các màn hình hiện có đang truyền
 *  `user.username` xuống làm khoá nhà hàng. */
function toProfile(s: SessionUser): UserProfile | null {
  if (s.role === "pending") return null;
  const isAdmin = s.role === "admin" || s.role === "super_admin";
  return {
    uid: s.email,
    username: isAdmin ? "admin" : s.restaurantId || "",
    role: isAdmin ? "admin" : "restaurant",
    restaurantName: s.restaurantName || (isAdmin ? "Ban Quản Lý" : ""),
    email: s.email,
  };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<SessionUser | null>(null);
  const [restaurants, setRestaurants] = useState<RestaurantOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadSession = useCallback(async (requestRestaurantId?: string) => {
    try {
      const data = await authFetchJson<{
        success: boolean;
        user: SessionUser;
        restaurants: RestaurantOption[];
      }>("/api/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestRestaurantId ? { requestRestaurantId } : {}),
      });
      setSession(data.user);
      setRestaurants(data.restaurants || []);
      setError(null);
    } catch (e: any) {
      setSession(null);
      setError(e?.message || "Không lấy được thông tin phiên đăng nhập.");
    }
  }, []);

  // Sau khi Google chuyển trang trả về, lấy kết quả để BẮT ĐƯỢC LỖI. Không gọi
  // hàm này thì lỗi của luồng chuyển trang biến mất im lặng, người dùng chỉ thấy
  // màn hình đăng nhập hiện lại mà không hiểu vì sao.
  useEffect(() => {
    getRedirectResult(auth).catch((e: any) => {
      if (!USER_CANCELLED.includes(e?.code)) {
        setError(e?.message || "Đăng nhập Google thất bại khi quay lại từ Google.");
      }
    });
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setUser(fbUser);
      if (fbUser) {
        await loadSession();
      } else {
        setSession(null);
      }
      setLoading(false);
    });
    return () => unsub();
  }, [loadSession]);

  const loginWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      // onAuthStateChanged sẽ tự gọi loadSession.
    } catch (e: any) {
      const code = e?.code || "";

      if (USER_CANCELLED.includes(code)) {
        setError(null);
        setLoading(false);
        return;
      }

      if (code === "auth/unauthorized-domain") {
        setError(
          "Tên miền này chưa được cho phép trong Firebase Console (Authentication → Settings → Authorized domains)."
        );
        setLoading(false);
        return;
      }

      // MỌI lỗi popup còn lại đều thử lại bằng cách CHUYỂN TRANG.
      //
      // Vì sao: luồng popup cần cookie bên thứ ba và gọi thẳng
      // identitytoolkit.googleapis.com — proxy công ty hoặc trình duyệt siết chặt
      // hay cắt mất, cho ra "auth/internal-error" hoặc trang Google báo 401. Máy
      // khác vẫn vào bình thường nên rất khó đoán. Luồng chuyển trang không cần
      // popup, không phụ thuộc cookie bên thứ ba, nên sống được ở những máy đó.
      console.warn("Popup đăng nhập lỗi, chuyển sang cách chuyển trang:", code, e?.message);
      try {
        await signInWithRedirect(auth, googleProvider);
        return; // trình duyệt rời trang, không chạy tiếp
      } catch (e2: any) {
        setError(
          `Không đăng nhập được (${code || "lỗi không rõ"}). Thử mở bằng Chrome, hoặc dùng mạng 4G thay vì wifi công ty.`
        );
        setLoading(false);
      }
    }
  };

  const requestAccess = async (restaurantId: string) => {
    setLoading(true);
    await loadSession(restaurantId);
    setLoading(false);
  };

  const refreshSession = async () => {
    await loadSession();
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth).catch(() => {});
      setUser(null);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const profile = session ? toProfile(session) : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        session,
        restaurants,
        loading,
        error,
        isAuthenticated: Boolean(user && profile),
        isPending: Boolean(user && session && session.role === "pending"),
        loginWithGoogle,
        requestAccess,
        refreshSession,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export function useAuthContext() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used within an AuthProvider");
  }
  return context;
}
