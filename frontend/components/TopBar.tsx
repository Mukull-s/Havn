"use client";

import { useEffect, useState } from "react";
import { Menu, RotateCcw, Search } from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type { ClinicInfo, HealthResponse, WorkspaceTab } from "@/lib/types";

interface TopBarProps {
  activeTab: WorkspaceTab;
  clinic?: ClinicInfo;
  health: HealthResponse | null;
  backendError: string | null;
  isCallActive: boolean;
  resetting: boolean;
  onGoHome: () => void;
  onRequestReset: () => void;
  onOpenMobileNav: () => void;
  onQuickSearch: () => void;
}

const TAB_TITLES: Record<WorkspaceTab, string> = {
  overview: "Overview",
  appointments: "Appointments",
  doctors: "Doctors & Availability",
  activity: "Activity",
};

function formatClinicClock(timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    })
      .format(new Date())
      .replace(", ", ", ")
      .replace(/, (\d{1,2}:)/, " · $1");
  } catch {
    return "";
  }
}

export function TopBar({
  activeTab,
  clinic,
  health,
  backendError,
  isCallActive,
  resetting,
  onGoHome,
  onRequestReset,
  onOpenMobileNav,
  onQuickSearch,
}: TopBarProps) {
  const timezone = clinic?.timezone || health?.clinic.timezone || "Asia/Kolkata";
  const [clockLabel, setClockLabel] = useState("");

  useEffect(() => {
    setClockLabel(formatClinicClock(timezone));
    const timer = setInterval(() => {
      setClockLabel(formatClinicClock(timezone));
    }, 30000);
    return () => clearInterval(timer);
  }, [timezone]);

  const activeCalls = health?.active_calls ?? 0;
  const resetDisabled =
    resetting || Boolean(backendError) || isCallActive || activeCalls > 0;

  let statusBadge: { tone: "success" | "warning" | "danger"; label: string } = {
    tone: "warning",
    label: "Connecting",
  };
  if (backendError) {
    statusBadge = { tone: "danger", label: "System Offline" };
  } else if (health) {
    statusBadge = { tone: "success", label: "System Online" };
  }

  return (
    <header className="border-b border-[var(--border-hairline)] bg-[var(--bg-canvas)]/90">
      <div className="flex h-14 items-center justify-between gap-4 px-5 sm:px-8 lg:px-10 xl:px-12">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={onOpenMobileNav}
            aria-label="Open navigation menu"
            className="inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)] lg:hidden"
          >
            <Menu className="h-4 w-4" strokeWidth={1.75} />
          </button>

          <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[14px]">
            {activeTab !== "overview" ? (
              <>
                <a
                  href="#overview"
                  onClick={(event) => {
                    event.preventDefault();
                    onGoHome();
                  }}
                  className="hidden text-[13px] font-medium text-[var(--ink-muted)] transition-colors hover:text-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] sm:inline"
                >
                  Home
                </a>
                <span
                  aria-hidden="true"
                  className="hidden text-xs text-[var(--ink-muted)] sm:inline"
                >
                  /
                </span>
              </>
            ) : null}
            <span className="truncate text-[15px] font-medium text-[var(--ink-primary)]">
              {TAB_TITLES[activeTab]}
            </span>
          </nav>

          {health && !health.voice.ready && !backendError ? (
            <span className="hidden rounded-full border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--status-warning-ink)] md:inline-flex">
              Voice keys needed
            </span>
          ) : null}
        </div>

        <div className="flex items-center gap-2.5 sm:gap-3">
          {clockLabel ? (
            <span className="hidden text-xs tabular-nums text-[var(--ink-secondary)] md:inline">
              {clockLabel}
            </span>
          ) : null}

          <StatusBadge tone={statusBadge.tone} label={statusBadge.label} />

          <button
            type="button"
            onClick={onRequestReset}
            disabled={resetDisabled}
            title={
              isCallActive || activeCalls > 0
                ? "Finish active voice call before resetting demo data"
                : "Restore seeded doctors, slots, and demo appointment"
            }
            className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RotateCcw
              aria-hidden="true"
              className={`h-3.5 w-3.5 ${resetting ? "animate-spin" : ""}`}
              strokeWidth={1.65}
            />
            <span className="hidden sm:inline">
              {resetting ? "Resetting" : "Reset demo"}
            </span>
          </button>

          <button
            type="button"
            onClick={onQuickSearch}
            aria-label="Search appointments"
            title="Search appointments"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-full bg-[var(--bg-sidebar)] text-white transition-colors hover:bg-[var(--accent-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2"
          >
            <Search className="h-3.5 w-3.5" strokeWidth={1.85} />
          </button>
        </div>
      </div>
    </header>
  );
}
