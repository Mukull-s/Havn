"use client";

import { AlertCircle, CheckCircle2, X } from "lucide-react";

export interface ToastMessage {
  id: string;
  tone: "success" | "danger";
  title: string;
  detail?: string;
}

interface ToastBannerProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastBanner({ toasts, onDismiss }: ToastBannerProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      aria-live="polite"
      className="pointer-events-none fixed bottom-20 left-4 right-4 z-50 flex flex-col gap-2 sm:bottom-6 sm:left-auto sm:right-6 sm:w-96"
    >
      {toasts.map((toast) => {
        const isDanger = toast.tone === "danger";
        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-start gap-3 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3 shadow-[var(--shadow-overlay)]"
          >
            {isDanger ? (
              <AlertCircle
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-danger)]"
                strokeWidth={1.75}
              />
            ) : (
              <CheckCircle2
                aria-hidden="true"
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]"
                strokeWidth={1.75}
              />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--ink-primary)]">
                {toast.title}
              </p>
              {toast.detail ? (
                <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
                  {toast.detail}
                </p>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss notification"
              className="cursor-pointer rounded-md p-1 text-[var(--ink-muted)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
            >
              <X className="h-3.5 w-3.5" strokeWidth={1.75} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
