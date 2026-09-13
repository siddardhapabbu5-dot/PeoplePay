import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { api, clearToken, getToken, setToken } from "./api";

export type Role = "SUPER_ADMIN" | "HR_ADMIN" | "PAYROLL_ADMIN" | "MANAGER" | "EMPLOYEE" | "FINANCE";

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  employee: { id: string; name: string; code: string; department?: string; designation?: string; photoPath?: string | null } | null;
};

type AuthCtx = {
  user: SessionUser | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  can: (...roles: Role[]) => boolean;
};

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<SessionUser>("/api/auth/me")
      .then(setUser)
      .catch(() => {
        clearToken();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const value = useMemo<AuthCtx>(() => ({
    user,
    loading,
    async login(email, password) {
      const res = await api<{ token: string; user: SessionUser }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      setToken(res.token);
      setUser(res.user);
    },
    logout() {
      clearToken();
      setUser(null);
      window.location.href = "/login";
    },
    can(...roles) {
      if (!user) return false;
      if (user.role === "SUPER_ADMIN") return true;
      return roles.includes(user.role);
    },
  }), [user, loading]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("AuthProvider required");
  return ctx;
}
