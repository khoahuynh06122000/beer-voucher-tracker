import React, { createContext, useContext, useEffect, useState } from "react";
import { auth } from "@/lib/firebase";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut,
  User,
} from "firebase/auth";
import {
  getUserProfile,
  createUserProfile,
  PRESET_USERS,
  UserProfile,
} from "@/lib/firestoreService";

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  error: string | null;
  isAuthenticated: boolean;
  loginWithEmailOrUsername: (u: string, p: string) => Promise<void>;
  loginAsPreset: (presetKey: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        try {
          const userProf = await getUserProfile(firebaseUser.uid, firebaseUser.email || undefined);
          setProfile(userProf);
        } catch (e) {
          console.error("Error loading user profile:", e);
        }
      } else {
        setProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const formatEmailAndPassword = (input: string, pass: string) => {
    const trimmed = input.trim();
    const email = trimmed.includes("@") ? trimmed : `${trimmed.toLowerCase()}@beervoucher.app`;
    // Ensure password meets Firebase 6-char minimum requirement
    const password = pass.length < 6 ? pass.padEnd(6, "0") : pass;
    return { email, password, username: trimmed.toLowerCase() };
  };

  const loginWithEmailOrUsername = async (u: string, p: string) => {
    setError(null);
    setLoading(true);
    const { email, password, username } = formatEmailAndPassword(u, p);

    try {
      // 1. Try to sign in
      const cred = await signInWithEmailAndPassword(auth, email, password);
      const userProf = await getUserProfile(cred.user.uid, email);
      setProfile(userProf);
    } catch (err: any) {
      // 2. If user doesn't exist yet, auto-register preset or user
      if (
        err.code === "auth/user-not-found" ||
        err.code === "auth/invalid-credential" ||
        err.code === "auth/invalid-login-credentials"
      ) {
        try {
          const cred = await createUserWithEmailAndPassword(auth, email, password);
          const presetData = PRESET_USERS[username] || {
            username: u,
            role: username === "admin" ? "admin" : "restaurant",
            restaurantName: username === "admin" ? "Ban Quản Lý" : `Nhà Hàng ${u}`,
            email,
          };
          const userProf = await createUserProfile(cred.user.uid, presetData);
          setProfile(userProf);
          return;
        } catch (createErr: any) {
          console.error("Auto registration error:", createErr);
        }
      }

      let errorMsg = "Tên đăng nhập hoặc mật khẩu không chính xác.";
      if (err.code === "auth/wrong-password") {
        errorMsg = "Mật khẩu không chính xác.";
      } else if (err.code === "auth/network-request-failed") {
        errorMsg = "Lỗi kết nối mạng đến Firebase Auth.";
      }
      setError(errorMsg);
      throw new Error(errorMsg);
    } finally {
      setLoading(false);
    }
  };

  const loginAsPreset = async (presetKey: string) => {
    const pass = "123456";
    await loginWithEmailOrUsername(presetKey, pass);
  };

  const logout = async () => {
    setLoading(true);
    try {
      await signOut(auth);
      setUser(null);
      setProfile(null);
    } catch (e) {
      console.error("Signout error:", e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        profile,
        loading,
        error,
        isAuthenticated: Boolean(user && profile),
        loginWithEmailOrUsername,
        loginAsPreset,
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
