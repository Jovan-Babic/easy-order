import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { AppState } from "react-native";
import { storage } from "@/src/utils/storage";
import { api, setAuthToken, setPasswordChangeRequiredHandler, setUnauthorizedHandler, User } from "@/src/api";

type AuthStatus = "loading" | "authenticated" | "unauthenticated";

type AuthContextType = {
  user: User | null;
  status: AuthStatus;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  status: "loading",
  login: async () => {
    throw new Error("AuthProvider not mounted");
  },
  logout: async () => {},
  changePassword: async () => {
    throw new Error("AuthProvider not mounted");
  },
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

  const storeToken = useCallback(async (token: string) => {
    setAuthToken(token);
    await storage.secureSet(TOKEN_KEY, token);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => {
      clearSession();
    });
    // e.g. an admin set a new password for this user while they were logged
    // in with a still-valid session: flip the flag so RouteGuard shows the
    // change-password screen.
    setPasswordChangeRequiredHandler(() => {
      setUser((current) => (current ? { ...current, must_change_password: true } : current));
    });
    return () => {
      setUnauthorizedHandler(null);
      setPasswordChangeRequiredHandler(null);
    };
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
        // persisting it - the account may have been deactivated, had its
        // role changed, or its password reset since the token was stored.
        const me = await api.me();
        setUser(me);
        setStatus("authenticated");
      } catch {
        await clearSession();
      }
    })();
  }, [clearSession]);

  // A session can stay open for days: when the app comes back to the
  // foreground, re-read the user so the subscription banner and the modules
  // are current (a lock shows up as the usual 401 -> logged out).
  useEffect(() => {
    if (status !== "authenticated") return;
    const sub = AppState.addEventListener("change", async (state) => {
      if (state !== "active") return;
      try {
        setUser(await api.me());
      } catch {
        // offline or a transient error: keep what we have (a 401 logs out via the handler)
      }
    });
    return () => sub.remove();
  }, [status]);

  const login = useCallback(async (email: string, password: string) => {
    const res = await api.login(email, password);
    await storeToken(res.access_token);
    setUser(res.user);
    setStatus("authenticated");
    return res.user;
  }, [storeToken]);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } catch {
      // stateless JWT - nothing server-side to worry about if this fails
    }
    await clearSession();
  }, [clearSession]);

  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    const res = await api.changePassword(currentPassword, newPassword);
    // The backend invalidates the old token on a password change and returns
    // a fresh one - store it or the next request would log the user out.
    await storeToken(res.access_token);
    setUser(res.user);
  }, [storeToken]);

  return (
    <AuthContext.Provider value={{ user, status, login, logout, changePassword }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
