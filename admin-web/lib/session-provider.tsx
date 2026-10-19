"use client";

import { createContext, useContext } from "react";
import type { BillingNotice } from "@/lib/billing";

export type SessionUser = {
  id: string;
  name: string;
  email: string;
  role: "superadmin" | "admin" | "warehouse";
  client_id: string | null;
  // Modules the user's client has (superadmin: all).
  modules: string[];
  // Live announcements from the system owner.
  announcements?: Array<{ id: string; level: "info" | "warning"; message_sr: string; message_en: string }>;
  // Only when the client has a subscription.
  subscription?: { status: "active" | "grace" | "locked"; ends_at: string; days_left: number; grace_ends_at: string; billing_cycle?: string; lock_reason?: string | null } | null;
  // Calendar billing: earliest unpaid due date, blocking day, amounts (admin only).
  billing?: BillingNotice | null;
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
