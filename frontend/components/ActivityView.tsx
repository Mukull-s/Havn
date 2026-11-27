"use client";

import { useMemo, useState } from "react";
import {
  Activity,
  Calendar,
  ChevronDown,
  PhoneCall,
  Search,
  X,
  XCircle,
} from "lucide-react";
import { EmptyState, StatusBadge } from "@/components/StatusBadge";
import type {
  ActivityItem,
  Appointment,
  CallSessionRecord,
} from "@/lib/types";

interface ActivityViewProps {
  activity: ActivityItem[];
  appointments: Appointment[];
  activeCalls: CallSessionRecord[];
  clinicToday: string;
  clinicTimezone: string;
}

type ActivityFilter = "all" | "booked" | "cancelled" | "call";

interface UnifiedEvent {
  uid: string;
  category: "booked" | "cancelled" | "call";
  title: string;
  badgeLabel: string;
  patientName: string | null;
  detail: string;
  reference: string | null;
  doctorName: string | null;
  specialty: string | null;
  createdAt: string;
  isoDate: string;
  timeLabel: string;
}

function toClinicIsoDate(isoTimestamp: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(isoTimestamp));
  } catch {
    return isoTimestamp.slice(0, 10);
  }
}

function toClinicTimeLabel(isoTimestamp: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(isoTimestamp));
  } catch {
    return "";
  }
}

function addDaysIso(baseIso: string, offset: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offset));
  return dt.toISOString().slice(0, 10);
}

function formatDateGroupLabel(
  isoDate: string,
  clinicToday: string,
  timezone: string
): string {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const formatted = new Intl.DateTimeFormat("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(dt);

  const yesterdayIso = addDaysIso(clinicToday, -1);
  if (isoDate === clinicToday) {
    return `Today, ${formatted}`;
  }
  if (isoDate === yesterdayIso) {
    return `Yesterday, ${formatted}`;
  }
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(new Date(Date.UTC(y, m - 1, d, 12, 0, 0)));
  return `${weekday}, ${formatted}`;
}

function matchAppointmentMeta(
  item: ActivityItem,
  appointments: Appointment[]
): {
  reference: string | null;
  doctorName: string | null;
  specialty: string | null;
} {
  const refMatch = item.detail.match(/\bHVN-[A-Z0-9]{4}\b/);
  const matchedByRef = refMatch
    ? appointments.find((a) => a.reference === refMatch[0])
    : undefined;
  const matchedByTime =
    matchedByRef ??
    appointments.find(
      (a) =>
        a.created_at === item.created_at ||
        (a.cancelled_at !== null && a.cancelled_at === item.created_at)
    );

  return {
    reference: matchedByTime?.reference ?? refMatch?.[0] ?? null,
    doctorName: matchedByTime?.doctor.name ?? null,
    specialty: matchedByTime?.doctor.specialty ?? null,
  };
}

export function ActivityView({
  activity,
  appointments,
  activeCalls,
  clinicToday,
  clinicTimezone,
}: ActivityViewProps) {
  const [typeFilter, setTypeFilter] = useState<ActivityFilter>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const events = useMemo<UnifiedEvent[]>(() => {
    const persisted: UnifiedEvent[] = activity.map((item) => {
      const category: UnifiedEvent["category"] =
        item.kind === "cancelled" ? "cancelled" : "booked";
      const meta = matchAppointmentMeta(item, appointments);
      return {
        uid: `act-${item.id}`,
        category,
        title:
          category === "cancelled"
            ? "Appointment cancelled"
            : "New appointment booked",
        badgeLabel: category === "cancelled" ? "Cancelled" : "Booked",
        patientName: item.patient_name,
        detail: item.detail,
        reference: meta.reference,
        doctorName: meta.doctorName,
        specialty: meta.specialty,
        createdAt: item.created_at,
        isoDate: toClinicIsoDate(item.created_at, clinicTimezone),
        timeLabel: item.time_label,
      };
    });

    const liveCallEvents: UnifiedEvent[] = activeCalls.map((call) => {
      const phoneLabel = call.phone.readback
        ? `${call.phone.readback}${call.phone.verified ? " · Verified" : ""}`
        : call.phone.pending
        ? "Confirming spoken phone number"
        : "Awaiting caller phone number";
      return {
        uid: `call-${call.session_id}`,
        category: "call",
        title: "Voice call in progress",
        badgeLabel: "Call active",
        patientName: null,
        detail: phoneLabel,
        reference: null,
        doctorName: null,
        specialty: null,
        createdAt: call.started_at,
        isoDate: toClinicIsoDate(call.started_at, clinicTimezone),
        timeLabel: toClinicTimeLabel(call.started_at, clinicTimezone),
      };
    });

    return [...liveCallEvents, ...persisted].sort((a, b) =>
      b.createdAt.localeCompare(a.createdAt)
    );
  }, [activeCalls, activity, appointments, clinicTimezone]);

  const counts = useMemo(() => {
    let booked = 0;
    let cancelled = 0;
    let call = 0;
    for (const ev of events) {
      if (ev.category === "booked") booked += 1;
      else if (ev.category === "cancelled") cancelled += 1;
      else call += 1;
    }
    return { all: events.length, booked, cancelled, call };
  }, [events]);

  const dateOptions = useMemo(() => {
    const unique = Array.from(new Set(events.map((e) => e.isoDate))).sort(
      (a, b) => b.localeCompare(a)
    );
    return unique.map((isoDate) => ({
      isoDate,
      label: formatDateGroupLabel(isoDate, clinicToday, clinicTimezone),
    }));
  }, [clinicTimezone, clinicToday, events]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((ev) => {
      if (typeFilter !== "all" && ev.category !== typeFilter) return false;
      if (dateFilter !== "all" && ev.isoDate !== dateFilter) return false;
      if (!q) return true;
      return (
        ev.title.toLowerCase().includes(q) ||
        ev.detail.toLowerCase().includes(q) ||
        (ev.patientName?.toLowerCase().includes(q) ?? false) ||
        (ev.reference?.toLowerCase().includes(q) ?? false) ||
        (ev.doctorName?.toLowerCase().includes(q) ?? false) ||
        (ev.specialty?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [dateFilter, events, query, typeFilter]);

  const grouped = useMemo(() => {
    const map = new Map<string, UnifiedEvent[]>();
    for (const ev of filtered) {
      const list = map.get(ev.isoDate) || [];
      list.push(ev);
      map.set(ev.isoDate, list);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([isoDate, items]) => ({
        isoDate,
        label: formatDateGroupLabel(isoDate, clinicToday, clinicTimezone),
        items,
      }));
  }, [clinicTimezone, clinicToday, filtered]);

  const hasFilters =
    typeFilter !== "all" || dateFilter !== "all" || query.trim().length > 0;

  function clearFilters() {
    setTypeFilter("all");
    setDateFilter("all");
    setQuery("");
  }

  return (
    <div
      id="panel-activity"
      role="tabpanel"
      aria-labelledby="tab-activity"
      className="space-y-5"
    >
      {/* Page Heading matching Overview, Appointments & Doctors */}
      <header className="pt-1">
        <h1 className="font-display text-[34px] font-normal leading-[1.12] tracking-[-0.015em] text-[var(--ink-primary)] sm:text-[38px]">
          Activity
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-5 text-[var(--ink-secondary)]">
          Chronological operational log of bookings, cancellations, and active
          voice calls.
        </p>
      </header>

      {/* Toolbar: Event Type Filter Pills + Search & Date Filter */}
      <div className="space-y-3">
        <div
          role="group"
          aria-label="Filter activity by event type"
          className="flex flex-wrap items-center gap-2"
        >
          {(
            [
              { id: "all", label: "All Activity", count: counts.all, icon: null },
              {
                id: "booked",
                label: "Bookings",
                count: counts.booked,
                icon: Calendar,
              },
              {
                id: "cancelled",
                label: "Cancellations",
                count: counts.cancelled,
                icon: XCircle,
              },
              {
                id: "call",
                label: "Calls",
                count: counts.call,
                icon: PhoneCall,
              },
            ] as const
          ).map((option) => {
            const active = typeFilter === option.id;
            const Icon = option.icon;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={active}
                onClick={() => setTypeFilter(option.id)}
                className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                  active
                    ? "border-[var(--bg-sidebar)] bg-[var(--bg-sidebar)] text-white"
                    : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-secondary)] shadow-[var(--shadow-surface)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
                }`}
              >
                {Icon ? (
                  <Icon
                    aria-hidden="true"
                    className="h-3.5 w-3.5"
                    strokeWidth={1.65}
                  />
                ) : null}
                <span>{option.label}</span>
                <span
                  className={`rounded-full px-1.5 py-0.5 text-[11px] leading-none tabular-nums ${
                    active
                      ? "bg-white/15 text-white"
                      : "bg-[var(--bg-subtle)] text-[var(--ink-secondary)]"
                  }`}
                >
                  {option.count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
              strokeWidth={1.65}
            />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search activity by patient, doctor, reference, or event"
              placeholder="Search by patient, doctor, reference, or event..."
              className="h-10 w-full rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] pl-10 pr-9 text-base text-[var(--ink-primary)] shadow-[var(--shadow-surface)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15 sm:h-9 sm:text-[13px]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear activity search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="relative w-full sm:w-52">
            <Calendar
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-secondary)]"
              strokeWidth={1.65}
            />
            <select
              aria-label="Filter activity by date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-10 w-full cursor-pointer appearance-none rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] pl-9 pr-8 text-xs font-medium text-[var(--ink-primary)] shadow-[var(--shadow-surface)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15 sm:h-9"
            >
              <option value="all">All dates</option>
              {dateOptions.map((opt) => (
                <option key={opt.isoDate} value={opt.isoDate}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown
              aria-hidden="true"
              className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-muted)]"
            />
          </div>
        </div>
      </div>

      {/* Chronological Date-Grouped Activity Ledger */}
      {grouped.length === 0 ? (
        <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)]">
          <EmptyState
            icon={<Activity className="h-4 w-4" strokeWidth={1.5} />}
            title={
              hasFilters
                ? "No activity matches those filters"
                : "No clinic activity recorded yet"
            }
            description={
              hasFilters
                ? "Try clearing your search query or switching event type and date filters."
                : "Persisted bookings, cancellations, and live call events will appear here."
            }
            action={
              hasFilters ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map((group) => (
            <section
              key={group.isoDate}
              aria-label={group.label}
              className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)]"
            >
              <div className="border-b border-[var(--border-hairline)] bg-[#FAF9F5] px-5 py-2.5">
                <h2 className="text-[13px] font-medium text-[var(--ink-primary)]">
                  {group.label}
                </h2>
              </div>

              <ul className="divide-y divide-[var(--border-hairline)]">
                {group.items.map((ev) => {
                  const isCancelled = ev.category === "cancelled";
                  const isCall = ev.category === "call";

                  return (
                    <li
                      key={ev.uid}
                      className="flex flex-col gap-2.5 px-4 py-3.5 transition-colors hover:bg-[#FAF9F5] sm:flex-row sm:items-center sm:justify-between sm:px-5"
                    >
                      <div className="flex min-w-0 items-start gap-3">
                        <span
                          aria-hidden="true"
                          className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                            isCancelled
                              ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                              : isCall
                              ? "border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[var(--ink-secondary)]"
                              : "border-[var(--accent-sage-border)] bg-[var(--accent-sage-bg)] text-[var(--accent-primary)]"
                          }`}
                        >
                          {isCancelled ? (
                            <XCircle
                              className="h-4 w-4"
                              strokeWidth={1.65}
                            />
                          ) : isCall ? (
                            <PhoneCall
                              className="h-4 w-4"
                              strokeWidth={1.65}
                            />
                          ) : (
                            <Calendar
                              className="h-4 w-4"
                              strokeWidth={1.65}
                            />
                          )}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="text-[13.5px] font-medium text-[var(--ink-primary)]">
                              {ev.title}
                            </p>
                            <StatusBadge
                              tone={
                                isCancelled
                                  ? "danger"
                                  : isCall
                                  ? "neutral"
                                  : "success"
                              }
                              label={ev.badgeLabel}
                              dot={false}
                            />
                          </div>

                          <p className="mt-0.5 text-xs leading-5 text-[var(--ink-secondary)]">
                            {ev.patientName ? (
                              <span className="font-medium text-[var(--ink-primary)]">
                                {ev.patientName} ·{" "}
                              </span>
                            ) : null}
                            <span>{ev.detail}</span>
                            {ev.specialty ? (
                              <span className="text-[var(--ink-muted)]">
                                {" "}
                                · {ev.specialty}
                              </span>
                            ) : null}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center justify-between gap-3 pl-11 sm:shrink-0 sm:justify-end sm:pl-0">
                        {ev.reference ? (
                          <span className="rounded-md bg-[var(--bg-subtle)] px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-[var(--ink-secondary)]">
                            {ev.reference}
                          </span>
                        ) : null}
                        <span className="text-xs tabular-nums text-[var(--ink-muted)]">
                          {ev.timeLabel}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
