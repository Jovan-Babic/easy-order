"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n";

export default function ResetPasswordPage() {
  const { t } = useLanguage();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token") || "", [searchParams]);

  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);

    if (!token) {
      setError(t("missingResetToken"));
      return;
    }
    if (newPassword.length < 8) {
      setError(t("passwordTooShort"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, new_password: newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || t("resetFailed"));
        return;
      }

      setMessage(t("resetPasswordSuccess"));
      setTimeout(() => {
        router.push("/login");
      }, 800);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg bg-surfaceSecondary p-8 shadow-sm">
        <h1 className="mb-6 text-center text-2xl font-extrabold text-brand">{t("resetPasswordTitle")}</h1>

        <label className="mb-1 block text-sm font-semibold text-onSurfaceSecondary">{t("newPassword")}</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          className="mb-4 w-full rounded-md border border-border px-3 py-2 text-onSurface outline-none focus:border-brand"
          placeholder="••••••••"
        />

        <label className="mb-1 block text-sm font-semibold text-onSurfaceSecondary">{t("confirmPassword")}</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          className="mb-4 w-full rounded-md border border-border px-3 py-2 text-onSurface outline-none focus:border-brand"
          placeholder="••••••••"
        />

        {error && <p className="mb-4 text-sm text-error">{error}</p>}
        {message && <p className="mb-4 text-sm text-success">{message}</p>}

        <button
          type="submit"
          disabled={submitting || !newPassword || !confirmPassword}
          className="w-full rounded-md bg-brand py-2.5 font-bold text-onBrand disabled:opacity-50"
        >
          {submitting ? t("loading") : t("resetPassword")}
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
