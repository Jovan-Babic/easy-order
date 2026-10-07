"use client";

import { createContext, useContext } from "react";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "warehouse";
  client_id: string | null;
  // Modules the user's client has (superadmin: all).
  modules: string[];
  // Only when the client has a subscription.
  subscription?: { status: "active" | "grace"; ends_at: string; days_left: number; grace_ends_at: string } | null;
};

const SessionContext = createContext<SessionUser | null>(null);

// Populated once from the server-fetched user in (dashboard)/layout.tsx -
// pages read it via useSession() instead of each re-fetching /auth/me.
export function SessionProvider({ user, children }: { user: SessionUser; children: React.ReactNode }) {
  return <SessionContext.Provider value={user}>{children}</SessionContext.Provider>;
}

export function useHasModule(module: string): boolean {
  return useSession().modules.includes(module);
}

export function useSession(): SessionUser {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used within SessionProvider");
  return ctx;
}
