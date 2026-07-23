"use client";

import { createContext, useContext } from "react";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin";
  client_id: string | null;
};

const SessionContext = createContext<SessionUser | null>(null);

// Populated once from the server-fetched user in (dashboard)/layout.tsx -
// pages read it via useSession() instead of each re-fetching /auth/me.
export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionUser {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
