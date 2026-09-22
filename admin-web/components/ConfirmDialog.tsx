"use client";

import { useEffect } from "react";
import { useLanguage } from "@/lib/i18n";

type ConfirmDialogProps = {
  itemName: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ConfirmDialog({ itemName, onCancel, onConfirm }: ConfirmDialogProps) {
  const { t } = useLanguage();

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel]);

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-[2px]"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        className="w-full max-w-md rounded-xl border border-border bg-surfaceSecondary p-6 shadow-2xl"
      >
        <div className="mb-5 flex items-start gap-4">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-red-100 text-error">
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M5.0 19h14a1 1 0 0 0 .87-1.5l-7-12a1 1 0 0 0-1.74 0l-7 12A1 1 0 0 0 5 19Z" />
            </svg>
          </div>
          <div className="min-w-0">
            <h2 id="confirm-dialog-title" className="text-lg font-extrabold text-onSurface">
              {t("confirmDeleteTitle")}
            </h2>
            <p className="mt-1 text-sm leading-6 text-onSurfaceSecondary">
              {t("confirmDeleteDescription")}
            </p>
            <p className="mt-2 truncate text-sm font-bold text-onSurface" title={itemName}>
              {itemName}
            </p>
          </div>
        </div>
        <div className="flex justify-end gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md border border-border px-4 py-2 text-sm font-bold text-onSurfaceSecondary transition hover:bg-surfaceTertiary"
          >
            {t("cancel")}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="rounded-md bg-error px-4 py-2 text-sm font-bold text-white transition hover:brightness-95"
          >
            {t("delete")}
          </button>
        </div>
      </div>
    </div>
  );
}
