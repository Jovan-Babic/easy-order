import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { storage } from "@/src/utils/storage";
import { api, User } from "@/src/api";
import { setAuthToken, setUnauthorizedHandler } from "@/src/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextType = {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  status: "loading",
  login: async () => {
    throw new Error("AuthProvider not mounted");
  },
  logout: async () => {},
});

const TOKEN_KEY = "easyorder_auth_token";

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const clearSession = useCallback(async () => {
    setAuthToken(null);
    await storage.secureRemove(TOKEN_KEY);
    setUser(null);
    setStatus("unauthenticated");
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
    return () => setUnauthorizedHandler(null);
  }, [clearSession]);

  useEffect(() => {
    (async () => {
      const token = await storage.secureGet<string>(TOKEN_KEY, "");
      if (!token) {
        setStatus("unauthenticated");
        return;
      }
      setAuthToken(token);
      try {
        // Re-derive the user from the server on every cold start rather than
        // persisting it - the in-memory backend wipes on restart, so a stale
        // token's user.id may no longer exist there.
        const me = await api.me();
        setUser(me);
        setStatus("authenticated");
      } catch {
        await clearSession();
      }
    })();
  }, [clearSession]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    setAuthToken(res.access_token);
    await storage.secureSet(TOKEN_KEY, res.access_token);
    setUser(res.user);
    setStatus("authenticated");
    return res.user;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // stateless JWT - nothing server-side to worry about if this fails
    }
    await clearSession();
  }, [clearSession]);

  return (
    <AuthContext.Provider value={{ user, status, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
