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

export type LinkedAccount = {
  id: number;
  nickname: string | null;
  name: string;
  role: string;
  active: boolean;
};

interface AuthContextValue {
  user: AuthUser | null;
  isLoaded: boolean;
  isAuthenticated: boolean;
  isAdmin: boolean;
  login: (identifier: string, password: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  accounts: LinkedAccount[];
  loadAccounts: () => Promise<void>;
  addAccount: (identifier:string,password:string) => Promise<{ok:boolean;error?:string}>;
  switchAccount: (userId:number) => Promise<{ok:boolean;error?:string}>;
  removeAccount: (userId:number) => Promise<{ok:boolean;error?:string}>;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoaded: false,
  isAuthenticated: false,
  isAdmin: false,
  login: async () => ({ ok: false }),
  logout: async () => {},
  refresh: async () => {},
  accounts: [],
  loadAccounts: async () => {},
  addAccount: async () => ({ok:false}),
  switchAccount: async () => ({ok:false}),
  removeAccount: async () => ({ok:false}),
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoaded, setIsLoaded] = useState(false);
  const [accounts,setAccounts] = useState<LinkedAccount[]>([]);

  const loadAccounts=useCallback(async()=>{
    try {
      const response=await fetch("/api/auth/accounts",{credentials:"include",cache:"no-store"});
      if(!response.ok){setAccounts([]);return;}
      const result=await response.json() as {accounts?:LinkedAccount[]};
      setAccounts(Array.isArray(result.accounts)?result.accounts:[]);
    }catch { setAccounts([]); }
  },[]);
  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/me", { credentials: "include" });
      if (res.ok) {
        setUser(await res.json());
        void loadAccounts();
      } else {
        setUser(null);
        setAccounts([]);
      }
    } catch {
      setUser(null);
    } finally {
      setIsLoaded(true);
    }
  }, [loadAccounts]);

  useEffect(() => { void refresh(); }, [refresh]);

  const login = useCallback(async (identifier: string, password: string): Promise<{ ok: boolean; error?: string }> => {
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ identifier, password }),
      });
      const data = await res.json();
      if (res.ok) { setUser(data.user); void loadAccounts(); return { ok: true }; }
      return { ok: false, error: data.error ?? "Login failed" };
    } catch {
      return { ok: false, error: "Connection error. Please try again." };
    }
  }, [loadAccounts]);

  const logout = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
    setUser(null);
    setAccounts([]);
  }, []);

  const addAccount=useCallback(async(identifier:string,password:string)=>{
    try {
      const response=await fetch("/api/auth/accounts/add",{method:"POST",credentials:"include",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({identifier,password})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)return {ok:false,error:result.error||"Could not verify this account"};
      await loadAccounts();
      return {ok:true};
    }catch{return {ok:false,error:"Connection error"};}
  },[loadAccounts]);

  const switchAccount=useCallback(async(userId:number)=>{
    try {
      const response=await fetch("/api/auth/accounts/switch",{method:"POST",credentials:"include",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({userId})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)return {ok:false,error:result.error||"Could not switch accounts"};
      // Account-bound React Query caches, permissions and forms are reset.
      window.location.replace(window.location.pathname+window.location.search+window.location.hash);
      return {ok:true};
    }catch{return {ok:false,error:"Connection error"};}
  },[]);

  const removeAccount=useCallback(async(userId:number)=>{
    try {
      const response=await fetch("/api/auth/accounts/remove",{method:"POST",credentials:"include",
        headers:{"Content-Type":"application/json"},body:JSON.stringify({userId})});
      const result=await response.json().catch(()=>({}));
      if(!response.ok)return {ok:false,error:result.error||"Could not remove linked account"};
      await loadAccounts();
      return {ok:true};
    }catch{return {ok:false,error:"Connection error"};}
  },[loadAccounts]);

  return (
    <AuthContext.Provider value={{
      user, isLoaded,
      isAuthenticated: !!user,
      isAdmin: user?.role === "admin" || user?.role === "moderator" || user?.role === "super_admin",
      login, logout, refresh, accounts, loadAccounts, addAccount, switchAccount, removeAccount,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
