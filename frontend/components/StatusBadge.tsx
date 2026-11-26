"use client";

import type { ReactNode } from "react";

export type BadgeTone = "success" | "warning" | "danger" | "neutral";

interface StatusBadgeProps {
  tone: BadgeTone;
  label: string;
  dot?: boolean;
  mono?: boolean;
}

const TONE_STYLES: Record<BadgeTone, { container: string; dot: string }> = {
  success: {
    container:
      "bg-[var(--status-success-bg)] text-[var(--status-success-ink)] border-[var(--accent-sage-border)]",
    dot: "bg-[var(--accent-primary)]",
  },
  warning: {
    container:
      "bg-[var(--status-warning-bg)] text-[var(--status-warning-ink)] border-[var(--status-warning-border)]",
    dot: "bg-[#B87A1F]",
  },
  danger: {
    container:
      "bg-[var(--status-danger-bg)] text-[var(--status-danger-ink)] border-[var(--status-danger-border)]",
    dot: "bg-[var(--status-danger)]",
  },
  neutral: {
    container:
      "bg-[var(--bg-subtle)] text-[var(--ink-secondary)] border-[var(--border-hairline)]",
    dot: "bg-[var(--ink-muted)]",
  },
};

export function StatusBadge({
  tone,
  label,
  dot = true,
  mono = false,
}: StatusBadgeProps) {
  const style = TONE_STYLES[tone];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium leading-4 ${style.container} ${
        mono ? "font-mono tabular-nums" : ""
      }`}
    >
      {dot ? (
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 shrink-0 rounded-full ${style.dot}`}
        />
      ) : null}
      <span>{label}</span>
    </span>
  );
}

interface EmptyStateProps {
  icon: ReactNode;
  title: string;
  description: string;
  action?: ReactNode;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--ink-muted)]">
        {icon}
      </div>
      <p className="text-sm font-medium text-[var(--ink-primary)]">{title}</p>
      <p className="mt-1 max-w-sm text-xs leading-5 text-[var(--ink-muted)]">
        {description}
      </p>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}

interface SectionHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}

export function SectionHeader({
  title,
  subtitle,
  action,
}: SectionHeaderProps) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-3">
      <div>
        <h2 className="font-display text-[24px] font-normal leading-tight tracking-[-0.01em] text-[var(--ink-primary)]">
          {title}
        </h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs text-[var(--ink-muted)]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div>{action}</div> : null}
    </div>
  );
}
