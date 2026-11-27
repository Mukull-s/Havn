"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  ArrowRight,
  Calendar,
  CheckCircle2,
  Clock,
  Stethoscope,
  XCircle,
} from "lucide-react";
import { EmptyState } from "@/components/StatusBadge";
import type { HighlightMap } from "@/lib/useDashboard";
import type { DashboardResponse, Doctor, WorkspaceTab } from "@/lib/types";

interface OverviewViewProps {
  dashboard: DashboardResponse;
  highlights: HighlightMap;
  onNavigateTab: (tab: WorkspaceTab) => void;
  onSelectDoctor: (doctor: Doctor) => void;
}

function getClinicGreeting(timezone: string): string {
  try {
    const hourStr = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      hour12: false,
    }).format(new Date());
    const hour = Number.parseInt(hourStr, 10);
    if (hour < 12) return "Good morning.";
    if (hour < 17) return "Good afternoon.";
    return "Good evening.";
  } catch {
    return "Welcome back.";
  }
}

export function OverviewView({
  dashboard,
  highlights,
  onNavigateTab,
  onSelectDoctor,
}: OverviewViewProps) {
  const [greeting, setGreeting] = useState("Welcome back.");

  useEffect(() => {
    setGreeting(getClinicGreeting(dashboard.clinic.timezone));
  }, [dashboard.clinic.timezone]);

  const upcoming = dashboard.appointments
    .filter((appt) => appt.status === "booked")
    .slice(0, 4);
  const doctorSnapshot = dashboard.doctors.slice(0, 4);
  const recentActivity = dashboard.activity.slice(0, 3);

  const metrics = [
    {
      label: "Total Appointments",
      value: dashboard.appointments.length,
      subtext: "Upcoming & recent 24h",
      icon: Calendar,
      iconClass: "text-[var(--ink-secondary)] border-[var(--border-strong)] bg-[var(--bg-subtle)]",
    },
    {
      label: "Upcoming Booked",
      value: dashboard.stats.upcoming_appointments,
      subtext: "Confirmed on schedule",
      icon: CheckCircle2,
      iconClass: "text-[var(--accent-primary)] border-[var(--accent-sage-border)] bg-[var(--accent-sage-bg)]",
    },
    {
      label: "Open Slots",
      value: dashboard.stats.available_slots,
      subtext: `Across ${dashboard.stats.doctors} clinicians`,
      icon: Clock,
      iconClass: "text-[var(--ink-secondary)] border-[var(--border-strong)] bg-[var(--bg-subtle)]",
    },
    {
      label: "Cancelled",
      value: dashboard.stats.cancelled_today,
      subtext: "Cancelled today",
      icon: XCircle,
      iconClass: "text-[var(--status-danger)] border-[var(--status-danger-border)] bg-[var(--status-danger-bg)]",
    },
  ];

  return (
    <div
      id="panel-overview"
      role="tabpanel"
      aria-labelledby="tab-overview"
      className="space-y-5"
    >
      {/* Contextual Greeting Header */}
      <header className="pt-1">
        <h1 className="font-display text-[34px] font-normal leading-[1.12] tracking-[-0.015em] text-[var(--ink-primary)] sm:text-[38px]">
          {greeting}
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-5 text-[var(--ink-secondary)]">
          Here&apos;s what&apos;s happening at {dashboard.clinic.name} today.
        </p>
      </header>

      {/* Unified 4-Column Operational Metric Strip */}
      <section aria-label="Operational summary">
        <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)] md:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric, idx) => {
            const Icon = metric.icon;
            return (
              <div
                key={metric.label}
                className={`border-[var(--border-hairline)] px-3.5 py-3.5 sm:px-4 ${
                  idx % 2 === 1 ? "border-l" : ""
                } ${idx >= 2 ? "border-t md:border-t-0 lg:border-t xl:border-t-0" : ""} ${
                  idx > 0 ? "md:border-l lg:border-l-0 xl:border-l" : ""
                } ${idx % 2 === 1 ? "lg:border-l" : ""}`}
              >
                <div className="flex items-start gap-2">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${metric.iconClass}`}
                  >
                    <Icon className="h-3 w-3" strokeWidth={1.75} />
                  </span>
                  <span className="text-[12px] font-medium leading-[1.3] text-[var(--ink-secondary)]">
                    {metric.label}
                  </span>
                </div>
                <p className="mt-2.5 pl-7 font-sans text-[24px] font-semibold leading-none tabular-nums tracking-[-0.025em] text-[var(--ink-primary)] sm:text-[26px]">
                  {metric.value}
                </p>
                <p className="mt-1.5 pl-7 text-[11.5px] leading-4 text-[var(--ink-muted)]">
                  {metric.subtext}
                </p>
              </div>
            );
          })}
        </div>
      </section>

      {/* Middle 2-Column Operational Split: Upcoming Appointments + Doctor Availability */}
      <div className="grid grid-cols-1 gap-5 xl:grid-cols-2">
        {/* Upcoming Appointments Timeline Card */}
        <section
          aria-label="Upcoming appointments"
          className="flex flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Calendar
                aria-hidden="true"
                className="h-4 w-4 text-[var(--ink-secondary)]"
                strokeWidth={1.65}
              />
              <h2 className="text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
                Upcoming Appointments
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("appointments")}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--ink-secondary)] transition-colors hover:text-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <span>View all</span>
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1">
            {upcoming.length === 0 ? (
              <EmptyState
                icon={<Calendar className="h-4 w-4" strokeWidth={1.5} />}
                title="No upcoming appointments"
                description="Bookings confirmed with Ava will appear on this schedule."
              />
            ) : (
              <div className="relative px-5 py-2">
                {/* Vertical timeline spine matching reference */}
                <span
                  aria-hidden="true"
                  className="absolute bottom-6 left-[25px] top-6 w-px bg-[var(--border-hairline)]"
                />
                <ul className="divide-y divide-[var(--border-hairline)]">
                  {upcoming.map((appt) => {
                    const highlight = highlights[appt.id];
                    const highlightClass =
                      highlight === "booked"
                        ? "row-highlight-booked"
                        : highlight === "cancelled"
                        ? "row-highlight-cancelled"
                        : "";

                    return (
                      <li
                        key={appt.id}
                        className={`relative py-1 pl-5 ${highlightClass}`}
                      >
                        <span
                          aria-hidden="true"
                          className="absolute left-[2px] top-1/2 h-2 w-2 -translate-y-1/2 rounded-full border border-[var(--bg-surface)] bg-[#B5B9B4]"
                        />

                        <button
                          type="button"
                          onClick={() => onNavigateTab("appointments")}
                          className="flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg py-2.5 pr-1 text-left transition-colors hover:bg-[#FAF9F5]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
                        >
                          <div className="flex min-w-0 flex-1 items-baseline gap-3.5">
                            <div className="w-[74px] shrink-0">
                              <p className="text-[13px] font-semibold tabular-nums text-[var(--ink-primary)]">
                                {appt.time_label}
                              </p>
                              <p className="text-[11px] text-[var(--ink-muted)]">
                                {appt.date_label}
                              </p>
                            </div>

                            <div className="min-w-0 flex-1">
                              <p className="truncate text-[13.5px] font-medium text-[var(--ink-primary)]">
                                {appt.patient_name}
                              </p>
                              <p className="mt-0.5 truncate text-xs leading-4 text-[var(--ink-secondary)]">
                                {appt.doctor.name} · {appt.doctor.specialty}
                              </p>
                            </div>
                          </div>

                          <span className="shrink-0 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-0.5 text-[11px] font-medium text-[var(--ink-secondary)]">
                            Booked
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        </section>

        {/* Doctor Availability Card */}
        <section
          aria-label="Doctor availability"
          className="flex flex-col rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)]"
        >
          <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-3.5">
            <div className="flex items-center gap-2">
              <Stethoscope
                aria-hidden="true"
                className="h-4 w-4 text-[var(--ink-secondary)]"
                strokeWidth={1.65}
              />
              <h2 className="text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
                Doctor Availability
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab("doctors")}
              className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--ink-secondary)] transition-colors hover:text-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
            >
              <span>View all doctors</span>
              <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="flex-1 divide-y divide-[var(--border-hairline)] px-5">
            {doctorSnapshot.map((doctor) => (
              <button
                key={doctor.id}
                type="button"
                onClick={() => onSelectDoctor(doctor)}
                className="flex w-full cursor-pointer items-center justify-between gap-3 py-3 text-left transition-colors hover:bg-[#FAF9F5]/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold text-white"
                    style={{ backgroundColor: doctor.accent }}
                  >
                    {doctor.initials}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13.5px] font-medium text-[var(--ink-primary)]">
                      {doctor.name}
                    </p>
                    <p className="truncate text-xs leading-4 text-[var(--ink-secondary)]">
                      {doctor.specialty}
                    </p>
                  </div>
                </div>

                <div className="shrink-0 text-right">
                  {doctor.next_available ? (
                    <>
                      <p className="text-xs text-[var(--ink-secondary)]">
                        Next:{" "}
                        <span className="font-semibold tabular-nums text-[var(--ink-primary)]">
                          {doctor.next_available.time_label}
                        </span>
                      </p>
                      <p className="text-[11px] text-[var(--ink-muted)]">
                        {doctor.next_available.date_label}
                      </p>
                    </>
                  ) : (
                    <span className="text-xs text-[var(--ink-muted)]">
                      No open slots
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </section>
      </div>

      {/* Bottom Recent Activity Card */}
      <section
        aria-label="Recent clinic activity"
        className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)]"
      >
        <div className="flex items-center justify-between gap-3 border-b border-[var(--border-hairline)] px-5 py-3.5">
          <div className="flex items-center gap-2">
            <Activity
              aria-hidden="true"
              className="h-4 w-4 text-[var(--ink-secondary)]"
              strokeWidth={1.65}
            />
            <h2 className="text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
              Recent Activity
            </h2>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab("activity")}
            className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--ink-secondary)] transition-colors hover:text-[var(--accent-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
          >
            <span>View all activity</span>
            <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
          </button>
        </div>

        {recentActivity.length === 0 ? (
          <EmptyState
            icon={<Activity className="h-4 w-4" strokeWidth={1.5} />}
            title="No activity recorded yet"
            description="Persisted bookings and cancellations will appear here."
          />
        ) : (
          <div className="grid grid-cols-1 divide-y divide-[var(--border-hairline)] md:grid-cols-3 md:divide-x md:divide-y-0 lg:grid-cols-1 lg:divide-x-0 lg:divide-y xl:grid-cols-3 xl:divide-x xl:divide-y-0">
            {recentActivity.map((item) => {
              const isCancelled = item.kind === "cancelled";
              return (
                <div key={item.id} className="flex items-start gap-3 px-5 py-4">
                  <span
                    aria-hidden="true"
                    className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border ${
                      isCancelled
                        ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                        : "border-[var(--accent-sage-border)] bg-[var(--accent-sage-bg)] text-[var(--accent-primary)]"
                    }`}
                  >
                    {isCancelled ? (
                      <XCircle className="h-3.5 w-3.5" strokeWidth={1.75} />
                    ) : (
                      <Calendar className="h-3.5 w-3.5" strokeWidth={1.75} />
                    )}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-medium leading-snug text-[var(--ink-primary)]">
                      {isCancelled
                        ? "Appointment cancelled"
                        : "New appointment booked"}
                    </p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-[var(--ink-secondary)]">
                      {item.patient_name ? `${item.patient_name} · ` : ""}
                      {item.detail}
                    </p>
                    <p className="mt-1 text-[11px] tabular-nums text-[var(--ink-muted)]">
                      {item.time_label}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
