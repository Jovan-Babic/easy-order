"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || "Invalid email or password");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg bg-surfaceSecondary p-8 shadow-sm">
        <h1 className="mb-8 text-center text-2xl font-extrabold text-brand">Easy Order Admin</h1>

        <label className="mb-1 block text-sm font-semibold text-onSurfaceSecondary">Email</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="username"
          className="mb-4 w-full rounded-md border border-border px-3 py-2 text-onSurface outline-none focus:border-brand"
          placeholder="you@company.com"
        />

        <label className="mb-1 block text-sm font-semibold text-onSurfaceSecondary">Password</label>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
          className="mb-4 w-full rounded-md border border-border px-3 py-2 text-onSurface outline-none focus:border-brand"
          placeholder="••••••••"
        />

        {error && <p className="mb-4 text-sm text-error">{error}</p>}

        <button
          type="submit"
          disabled={submitting || !email || !password}
          className="w-full rounded-md bg-brand py-2.5 font-bold text-onBrand disabled:opacity-50"
        >
          {submitting ? "Logging in..." : "Log in"}
        </button>
      </form>
    </div>
  );
}
