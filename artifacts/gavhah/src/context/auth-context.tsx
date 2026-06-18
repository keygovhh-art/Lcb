import { createContext, useContext, useState, useEffect, useCallback, ReactNode } from "react";

export interface AuthUser {
  id: number;
  name: string;
  nickname: string | null;
  email: string | null;
  phone: string | null;
  role: string;
  status: string;
  location: string | null;
  bio: string | null;
  avatarUrl: string | null;
  preferredLanguage: string;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  isLoaded: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoaded: false,
  isAuthenticated: false,
  isAdmin: false,
  login: async () => ({ ok: false }),
  logout: async () => {},
  refresh: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        setUser(await res.json());
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoaded(true);
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  const login = useCallback(async (identifier: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (res.ok) { setUser(data.user); return { ok: true }; }
      return { ok: false, error: data.error ?? "Login failed" };
    } catch {
      return { ok: false, error: "Connection error. Please try again." };
    }
  }, []);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{
      user, isLoaded,
      isAuthenticated: !!user,
      isAdmin: user?.role === "admin" || user?.role === "moderator",
      login, logout, refresh,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
