"use client";

import Link from "next/link";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useLanguage } from "@/lib/i18n";

// Mirrors the backend rule (server.py _password_is_strong_enough).
function isStrongEnough(password: string) {
  return password.length >= 8 && /[A-Za-z]/.test(password) && /\d/.test(password);
}

function ChangePasswordContent() {
  const { t } = useLanguage();
  const router = useRouter();
  // ?required=1 when the dashboard layout sent the user here after an
  // invite/admin reset; then there's no way back until the change is done.
  const required = useSearchParams().get("required") === "1";

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!isStrongEnough(newPassword)) {
      setError(t("passwordRules"));
      return;
    }
    if (newPassword !== confirmPassword) {
      setError(t("passwordMismatch"));
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/change-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ current_password: currentPassword, new_password: newPassword }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.detail || t("changePasswordFailed"));
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError(t("backendUnavailable"));
    } finally {
      setSubmitting(false);
    }
  };

  const logout = async () => {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  };

  const inputClass = "mb-4 w-full rounded-md border border-border px-3 py-2 text-onSurface outline-none focus:border-brand";

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={onSubmit} className="w-full max-w-sm rounded-lg bg-surfaceSecondary p-8 shadow-sm">
        <h1 className="mb-2 text-center text-2xl font-extrabold text-brand">{t("changePassword")}</h1>
        {required && <p className="mb-6 text-center text-sm text-onSurfaceSecondary">{t("changePasswordRequired")}</p>}

        <label className="mb-1 block text-sm font-semibold text-onSurfaceSecondary">{t("currentPassword")}</label>
        <input
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          required
          className={inputClass}
        />

        <label className="mb-1 block text-sm font-semibold text-onSurfaceSecondary">{t("newPassword")}</label>
        <input
          type="password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          autoComplete="new-password"
          required
          className="mb-1 w-full rounded-md border border-border px-3 py-2 text-onSurface outline-none focus:border-brand"
        />
        <p className="mb-4 text-xs text-muted">{t("passwordRules")}</p>

        <label className="mb-1 block text-sm font-semibold text-onSurfaceSecondary">{t("confirmPassword")}</label>
        <input
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          autoComplete="new-password"
          required
          className={inputClass}
        />

        {error && <p className="mb-4 text-sm text-error">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full rounded-md bg-brand py-2.5 font-bold text-onBrand disabled:opacity-50"
        >
          {submitting ? t("loading") : t("changePassword")}
        </button>

        <div className="mt-4 text-center">
          {required ? (
            <button type="button" onClick={logout} className="text-sm font-semibold text-brand hover:underline">
              {t("logout")}
            </button>
          ) : (
            <Link href="/dashboard" className="text-sm font-semibold text-brand hover:underline">
              {t("cancel")}
            </Link>
          )}
        </div>
      </form>
    </div>
  );
}

export default function ChangePasswordPage() {
  return (
    <Suspense fallback={null}>
      <ChangePasswordContent />
    </Suspense>
  );
}
