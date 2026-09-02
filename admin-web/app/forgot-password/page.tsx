"use client";

import Link from "next/link";
import { useState } from "react";
import { useLanguage } from "@/lib/i18n";

export default function ForgotPasswordPage() {
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, channel: "web" }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || t("resetRequestFailed"));
        return;
      }
      const body = await res.json().catch(() => ({}));
      setMessage(body.message || t("resetEmailSent"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg bg-surfaceSecondary p-8 shadow-sm">
        <h1 className="mb-3 text-center text-2xl font-extrabold text-brand">{t("forgotPasswordTitle")}</h1>
        <p className="mb-6 text-center text-sm text-onSurfaceSecondary">{t("forgotPasswordDescription")}</p>

        <label className="mb-1 block text-sm font-semibold text-onSurfaceSecondary">{t("email")}</label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
          className="mb-4 w-full rounded-md border border-border px-3 py-2 text-onSurface outline-none focus:border-brand"
          placeholder="you@company.com"
        />

        {error && <p className="mb-4 text-sm text-error">{error}</p>}
        {message && <p className="mb-4 text-sm text-success">{message}</p>}

        <button
          type="submit"
          disabled={submitting || !email}
          className="w-full rounded-md bg-brand py-2.5 font-bold text-onBrand disabled:opacity-50"
        >
          {submitting ? t("loading") : t("sendResetLink")}
        </button>

        <div className="mt-4 text-center">
          <Link href="/login" className="text-sm font-semibold text-brand hover:underline">
            {t("backToLogin")}
          </Link>
        </div>
      </form>
    </div>
  );
}
