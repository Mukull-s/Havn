"use client";

import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Building2,
  Calendar,
  Home,
  Stethoscope,
  X,
} from "lucide-react";
import type { ClinicInfo, WorkspaceTab } from "@/lib/types";

export const SIDEBAR_MIN_WIDTH = 72;
export const SIDEBAR_MAX_WIDTH = 340;
export const SIDEBAR_DEFAULT_WIDTH = 220;
const SIDEBAR_COMPACT_THRESHOLD = 136;

interface SidebarProps {
  activeTab: WorkspaceTab;
  onSelectTab: (tab: WorkspaceTab) => void;
  clinic?: ClinicInfo;
  counts: {
    appointments: number;
    doctors: number;
  };
  width: number;
  onWidthChange: (nextWidth: number) => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

const NAV_ITEMS: Array<{
  id: WorkspaceTab;
  label: string;
  icon: typeof Home;
}> = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "appointments", label: "Appointments", icon: Calendar },
  { id: "doctors", label: "Doctors & Availability", icon: Stethoscope },
  { id: "activity", label: "Activity", icon: Activity },
];

export function clampSidebarWidth(value: number): number {
  return Math.round(
    Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, value))
  );
}

function SidebarContent({
  activeTab,
  onSelectTab,
  clinic,
  counts,
  width,
  onCloseMobile,
  isMobile,
}: SidebarProps & { isMobile?: boolean }) {
  const clinicName = clinic?.name || "Havn Clinic";
  const isCompact = !isMobile && width < SIDEBAR_COMPACT_THRESHOLD;

  return (
    <div className="relative flex h-full flex-col overflow-hidden bg-[var(--bg-sidebar)] text-[var(--ink-sidebar)]">
      {/* Subtle botanical silhouette in bottom-left of sidebar */}
      <svg
        aria-hidden="true"
        viewBox="0 0 220 260"
        fill="none"
        className={`pointer-events-none absolute bottom-12 left-0 h-56 w-48 transition-opacity duration-200 ${
          isCompact ? "opacity-[0.06]" : "opacity-[0.11]"
        }`}
      >
        <path
          d="M-10 250C25 195 55 150 112 96"
          stroke="#A6C8B7"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M36 196C18 164 26 122 66 106C70 144 58 178 36 196Z"
          fill="#95BCA8"
        />
        <path
          d="M68 158C96 140 132 142 146 172C116 184 86 180 68 158Z"
          fill="#95BCA8"
        />
        <path
          d="M84 128C72 98 84 64 118 54C122 86 108 114 84 128Z"
          fill="#95BCA8"
        />
        <path
          d="M112 96C136 80 164 82 176 106C152 118 128 114 112 96Z"
          fill="#7CA893"
        />
      </svg>

      {/* Brand Wordmark (Home link) */}
      <div
        className={`flex items-center pb-4 pt-5 ${
          isCompact ? "justify-center px-3" : "justify-between px-4"
        }`}
      >
        <a
          href="#overview"
          aria-label="Havn Home — go to Overview"
          title="Havn Home (Overview)"
          onClick={(event) => {
            event.preventDefault();
            onSelectTab("overview");
            if (isMobile) onCloseMobile();
          }}
          className="group flex min-w-0 items-center gap-2.5 rounded-lg px-1 py-0.5 transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9CC7B1]"
        >
          <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            fill="none"
            className="h-5 w-5 shrink-0 text-[#9CC7B1]"
          >
            <path
              d="M5 19C5 11.5 10.5 5 19 4C18 12.5 12.5 18.5 5 19Z"
              fill="currentColor"
              fillOpacity="0.9"
            />
            <path
              d="M5 19C9 14.5 13 11 18.5 5.5"
              stroke="#17382B"
              strokeWidth="1.5"
              strokeLinecap="round"
            />
          </svg>
          {!isCompact ? (
            <span className="truncate font-display text-[24px] font-normal leading-none tracking-[-0.01em] text-[var(--ink-sidebar)]">
              Havn
            </span>
          ) : null}
        </a>

        {isMobile ? (
          <button
            type="button"
            onClick={onCloseMobile}
            aria-label="Close navigation menu"
            className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[var(--ink-sidebar-muted)] hover:bg-[var(--bg-sidebar-elevated)] hover:text-white"
          >
            <X className="h-4 w-4" strokeWidth={1.75} />
          </button>
        ) : null}
      </div>

      {/* Clinic context badge */}
      <div className={isCompact ? "px-2.5 pb-4" : "px-3.5 pb-4"}>
        <div
          title={`${clinicName} (${clinic?.timezone || "Asia/Kolkata"})`}
          className={`flex items-center rounded-lg border border-[var(--border-sidebar)] bg-[var(--bg-sidebar-elevated)] text-xs text-[var(--ink-sidebar)] ${
            isCompact
              ? "mx-auto h-9 w-9 justify-center"
              : "justify-between gap-2 px-3 py-2"
          }`}
        >
          <span className="flex min-w-0 items-center gap-2">
            <Building2
              aria-hidden="true"
              className="h-3.5 w-3.5 shrink-0 text-[#9CC7B1]"
              strokeWidth={1.65}
            />
            {!isCompact ? (
              <span className="truncate font-medium">{clinicName}</span>
            ) : null}
          </span>
          {!isCompact ? (
            <span
              aria-hidden="true"
              className="h-2 w-2 shrink-0 rounded-full bg-[#7EC9A2]"
            />
          ) : null}
        </div>
      </div>

      {/* Scrollable Primary Navigation */}
      <nav
        aria-label="Primary navigation"
        className="relative z-10 flex-1 overflow-y-auto px-2.5 py-1"
      >
        <ul className="space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = activeTab === item.id;
            const badgeCount =
              item.id === "appointments"
                ? counts.appointments
                : item.id === "doctors"
                ? counts.doctors
                : null;

            const tooltip =
              badgeCount !== null ? `${item.label} (${badgeCount})` : item.label;

            return (
              <li key={item.id}>
                <a
                  id={`tab-${item.id}`}
                  href={`#${item.id}`}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  title={isCompact ? tooltip : undefined}
                  onClick={(event) => {
                    event.preventDefault();
                    onSelectTab(item.id);
                    if (isMobile) onCloseMobile();
                  }}
                  className={`flex w-full cursor-pointer items-center rounded-lg text-[13.5px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#9CC7B1] ${
                    isCompact
                      ? "mx-auto h-10 w-10 justify-center px-0"
                      : "justify-between gap-2 px-3 py-2.5 text-left"
                  } ${
                    active
                      ? "bg-[var(--bg-sidebar-active)] font-medium text-white shadow-[inset_0_0_0_1px_rgba(255,255,255,0.12)]"
                      : "font-normal text-[var(--ink-sidebar-muted)] hover:bg-[var(--bg-sidebar-elevated)] hover:text-white"
                  }`}
                >
                  <span className="flex min-w-0 items-center gap-2.5">
                    <Icon
                      aria-hidden="true"
                      className={`h-4 w-4 shrink-0 ${
                        active ? "text-white" : "text-[#A7C4B6]"
                      }`}
                      strokeWidth={1.65}
                    />
                    {!isCompact ? (
                      <span className="truncate">{item.label}</span>
                    ) : null}
                  </span>
                  {!isCompact && badgeCount !== null ? (
                    <span
                      className={`shrink-0 text-[11px] tabular-nums ${
                        active ? "text-white/90" : "text-white/55"
                      }`}
                    >
                      {badgeCount}
                    </span>
                  ) : null}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Clinic Desk Profile Footer */}
      <div
        className={`relative z-10 border-t border-[var(--border-sidebar)] py-3.5 ${
          isCompact ? "px-2.5" : "px-4"
        }`}
      >
        <div
          title={isCompact ? "Clinic Desk · Reception Operations" : undefined}
          className={`flex items-center ${
            isCompact ? "justify-center" : "gap-2.5"
          }`}
        >
          <span
            aria-hidden="true"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-[11px] font-semibold tracking-tight text-[var(--bg-sidebar)]"
          >
            HC
          </span>
          {!isCompact ? (
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium text-white">
                Clinic Desk
              </p>
              <p className="truncate text-[11px] text-[var(--ink-sidebar-muted)]">
                Reception Operations
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const [dragging, setDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; startWidth: number } | null>(null);

  useEffect(() => {
    if (!dragging) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragStartRef.current) return;
      const delta = event.clientX - dragStartRef.current.x;
      props.onWidthChange(clampSidebarWidth(dragStartRef.current.startWidth + delta));
    };

    const stopDragging = () => {
      setDragging(false);
      dragStartRef.current = null;
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", stopDragging);
    window.addEventListener("pointercancel", stopDragging);
    return () => {
      stopDragging();
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", stopDragging);
      window.removeEventListener("pointercancel", stopDragging);
    };
  }, [dragging, props.onWidthChange]);

  return (
    <>
      {/* Desktop flexible, scrollable & drag-resizable sidebar */}
      <aside
        aria-label="Workspace sidebar"
        style={{ width: `${props.width}px` }}
        className={`relative hidden lg:flex lg:shrink-0 lg:flex-col ${
          dragging ? "" : "lg:transition-[width] lg:duration-150 lg:ease-out"
        }`}
      >
        <SidebarContent {...props} />

        {/* Continuous drag-resize handle along right edge */}
        <div
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Drag to resize sidebar"
          aria-valuemin={SIDEBAR_MIN_WIDTH}
          aria-valuemax={SIDEBAR_MAX_WIDTH}
          aria-valuenow={props.width}
          title="Drag to resize sidebar (double-click to reset)"
          onPointerDown={(event) => {
            event.preventDefault();
            dragStartRef.current = { x: event.clientX, startWidth: props.width };
            setDragging(true);
          }}
          onDoubleClick={() => props.onWidthChange(SIDEBAR_DEFAULT_WIDTH)}
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") {
              event.preventDefault();
              props.onWidthChange(clampSidebarWidth(props.width - 16));
            } else if (event.key === "ArrowRight") {
              event.preventDefault();
              props.onWidthChange(clampSidebarWidth(props.width + 16));
            } else if (event.key === "Home") {
              event.preventDefault();
              props.onWidthChange(SIDEBAR_MIN_WIDTH);
            } else if (event.key === "End") {
              event.preventDefault();
              props.onWidthChange(SIDEBAR_DEFAULT_WIDTH);
            }
          }}
          className="group absolute inset-y-0 -right-1.5 z-30 flex w-3 cursor-col-resize items-center justify-center focus-visible:outline-none"
        >
          <span
            aria-hidden="true"
            className={`h-full w-[2px] transition-colors ${
              dragging
                ? "bg-[#9CC7B1]"
                : "bg-transparent group-hover:bg-[#9CC7B1]/65 group-focus-visible:bg-[#9CC7B1]"
            }`}
          />
          <span
            aria-hidden="true"
            className={`pointer-events-none absolute top-1/2 h-10 w-1 -translate-y-1/2 rounded-full transition-opacity ${
              dragging
                ? "bg-[#9CC7B1] opacity-100"
                : "bg-[#9CC7B1]/80 opacity-0 group-hover:opacity-100"
            }`}
          />
        </div>
      </aside>

      {/* Mobile / Tablet slide-over drawer */}
      {props.mobileOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Navigation menu"
          className="fixed inset-0 z-50 flex lg:hidden"
        >
          <div
            onClick={props.onCloseMobile}
            className="fixed inset-0 bg-[#181B1A]/40"
            aria-hidden="true"
          />
          <div className="relative z-10 h-full w-72 max-w-[82vw] shadow-[var(--shadow-overlay)]">
            <SidebarContent {...props} isMobile />
          </div>
        </div>
      ) : null}
    </>
  );
}
