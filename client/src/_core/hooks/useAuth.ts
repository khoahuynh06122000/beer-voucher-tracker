import { useAuthContext } from "@/contexts/AuthContext";

export function useAuth() {
  const { user, profile, loading, isAuthenticated, logout } = useAuthContext();

  return {
    user: profile
      ? {
          id: profile.uid,
          name: profile.restaurantName || profile.username,
          username: profile.username,
          role: profile.role,
          restaurantName: profile.restaurantName,
          email: profile.email,
        }
      : null,
    firebaseUser: user,
    loading,
    isAuthenticated,
    logout,
    refresh: () => {},
  };
}
