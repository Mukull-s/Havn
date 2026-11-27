"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  X,
} from "lucide-react";
import { EmptyState, StatusBadge } from "@/components/StatusBadge";
import type { HighlightMap } from "@/lib/useDashboard";
import type { Appointment, Doctor } from "@/lib/types";

interface AppointmentsViewProps {
  appointments: Appointment[];
  doctors: Doctor[];
  clinicToday: string;
  highlights: HighlightMap;
  focusSearchTrigger?: number;
}

type StatusFilter = "all" | "booked" | "cancelled";

const PAGE_SIZE = 8;

export function AppointmentsView({
  appointments,
  doctors,
  clinicToday,
  highlights,
  focusSearchTrigger = 0,
}: AppointmentsViewProps) {
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [specialtyFilter, setSpecialtyFilter] = useState<string>("all");
  const [dateFilter, setDateFilter] = useState<string>("all");
  const [page, setPage] = useState(1);

  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (focusSearchTrigger > 0) {
      searchInputRef.current?.focus();
    }
  }, [focusSearchTrigger]);

  const counts = useMemo(() => {
    let booked = 0;
    let cancelled = 0;
    for (const appt of appointments) {
      if (appt.status === "booked") booked += 1;
      else if (appt.status === "cancelled") cancelled += 1;
    }
    return { all: appointments.length, booked, cancelled };
  }, [appointments]);

  const specialties = useMemo(() => {
    const set = new Set<string>();
    for (const doc of doctors) set.add(doc.specialty);
    for (const appt of appointments) set.add(appt.doctor.specialty);
    return Array.from(set).sort();
  }, [appointments, doctors]);

  const dateOptions = useMemo(() => {
    const map = new Map<string, string>();
    for (const appt of appointments) {
      if (!map.has(appt.slot.date)) {
        map.set(appt.slot.date, appt.date_label);
      }
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, label]) => ({
        date,
        label: date === clinicToday ? `Today (${label})` : label,
      }));
  }, [appointments, clinicToday]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return appointments.filter((appt) => {
      if (statusFilter !== "all" && appt.status !== statusFilter) {
        return false;
      }
      if (
        specialtyFilter !== "all" &&
        appt.doctor.specialty !== specialtyFilter
      ) {
        return false;
      }
      if (dateFilter !== "all" && appt.slot.date !== dateFilter) {
        return false;
      }
      if (!q) return true;
      return (
        appt.patient_name.toLowerCase().includes(q) ||
        appt.doctor.name.toLowerCase().includes(q) ||
        appt.doctor.specialty.toLowerCase().includes(q) ||
        appt.reference.toLowerCase().includes(q)
      );
    });
  }, [appointments, dateFilter, query, specialtyFilter, statusFilter]);

  useEffect(() => {
    setPage(1);
  }, [query, statusFilter, specialtyFilter, dateFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const paginated = useMemo(() => {
    const start = (safePage - 1) * PAGE_SIZE;
    return filtered.slice(start, start + PAGE_SIZE);
  }, [filtered, safePage]);

  const hasFilters =
    query.trim().length > 0 ||
    statusFilter !== "all" ||
    specialtyFilter !== "all" ||
    dateFilter !== "all";

  function clearAllFilters() {
    setQuery("");
    setStatusFilter("all");
    setSpecialtyFilter("all");
    setDateFilter("all");
    setPage(1);
  }

  const startIndex = filtered.length === 0 ? 0 : (safePage - 1) * PAGE_SIZE + 1;
  const endIndex = Math.min(safePage * PAGE_SIZE, filtered.length);

  return (
    <div
      id="panel-appointments"
      role="tabpanel"
      aria-labelledby="tab-appointments"
      className="space-y-5"
    >
      {/* Page Heading matching Overview hierarchy */}
      <header className="pt-1">
        <h1 className="font-display text-[34px] font-normal leading-[1.12] tracking-[-0.015em] text-[var(--ink-primary)] sm:text-[38px]">
          Appointments
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-5 text-[var(--ink-secondary)]">
          View upcoming bookings and recent cancellations managed through Ava.
        </p>
      </header>

      {/* Toolbar: Status Segmentation + Date Filter, then Search + Specialty Filter */}
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {/* Status segmented bar */}
          <div
            role="group"
            aria-label="Filter appointments by status"
            className="inline-flex w-fit max-w-full flex-wrap items-center gap-1 rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-1 shadow-[var(--shadow-surface)]"
          >
            {(
              [
                { id: "all", label: "All", count: counts.all },
                { id: "booked", label: "Booked", count: counts.booked },
                { id: "cancelled", label: "Cancelled", count: counts.cancelled },
              ] as const
            ).map((option) => {
              const active = statusFilter === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setStatusFilter(option.id)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                    active
                      ? "bg-[var(--bg-sidebar)] text-white"
                      : "text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
                  }`}
                >
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

          {/* Date filter backed by real appointment slot dates */}
          <div className="relative w-full sm:w-auto sm:min-w-[196px]">
            <Calendar
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-secondary)]"
              strokeWidth={1.65}
            />
            <select
              aria-label="Filter appointments by date"
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
              className="h-9 w-full cursor-pointer appearance-none rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] pl-9 pr-8 text-xs font-medium text-[var(--ink-primary)] shadow-[var(--shadow-surface)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15"
            >
              <option value="all">All dates</option>
              {dateOptions.map((opt) => (
                <option key={opt.date} value={opt.date}>
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

        {/* Search + Specialty filter */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <div className="relative flex-1">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ink-muted)]"
              strokeWidth={1.65}
            />
            <input
              ref={searchInputRef}
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              aria-label="Search by patient, doctor, specialty, or reference"
              placeholder="Search by patient, doctor, specialty, or reference..."
              className="h-10 w-full rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] pl-10 pr-9 text-base text-[var(--ink-primary)] shadow-[var(--shadow-surface)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15 sm:h-9 sm:text-[13px]"
            />
            {query ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            ) : null}
          </div>

          <div className="relative w-full sm:w-52">
            <Filter
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-secondary)]"
              strokeWidth={1.65}
            />
            <select
              aria-label="Filter appointments by specialty"
              value={specialtyFilter}
              onChange={(e) => setSpecialtyFilter(e.target.value)}
              className="h-10 w-full cursor-pointer appearance-none rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] pl-9 pr-8 text-xs font-medium text-[var(--ink-primary)] shadow-[var(--shadow-surface)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15 sm:h-9"
            >
              <option value="all">All Specialties</option>
              {specialties.map((spec) => (
                <option key={spec} value={spec}>
                  {spec}
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

      {/* Appointments Ledger Surface */}
      <div className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)]">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Calendar className="h-4 w-4" strokeWidth={1.5} />}
            title={
              hasFilters
                ? "No appointments match those filters"
                : "No appointments on the ledger"
            }
            description={
              hasFilters
                ? "Adjust your search term, date, specialty, or status filter to view other appointments."
                : "Start a voice call with Ava to book a patient consultation."
            }
            action={
              hasFilters ? (
                <button
                  type="button"
                  onClick={clearAllFilters}
                  className="cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                >
                  Clear filters
                </button>
              ) : undefined
            }
          />
        ) : (
          <>
            {/* Desktop & tablet ledger table (768px md, 1280px+ xl) */}
            <div className="hidden overflow-x-auto md:block lg:hidden xl:block">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] text-[11.5px] font-medium text-[var(--ink-muted)]">
                    <th scope="col" className="px-5 py-3 font-medium">
                      Time
                    </th>
                    <th scope="col" className="px-3.5 py-3 font-medium">
                      Patient
                    </th>
                    <th scope="col" className="px-3.5 py-3 font-medium">
                      Doctor
                    </th>
                    <th scope="col" className="px-3.5 py-3 font-medium">
                      Specialty
                    </th>
                    <th scope="col" className="px-3.5 py-3 font-medium">
                      Reference
                    </th>
                    <th
                      scope="col"
                      className="px-5 py-3 text-right font-medium"
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {paginated.map((appt) => {
                    const isCancelled = appt.status === "cancelled";
                    const highlight = highlights[appt.id];
                    const highlightClass =
                      highlight === "booked"
                        ? "row-highlight-booked"
                        : highlight === "cancelled"
                        ? "row-highlight-cancelled"
                        : "";

                    return (
                      <tr
                        key={appt.id}
                        className={`transition-colors hover:bg-[#FAF9F5] ${highlightClass}`}
                      >
                        <td className="whitespace-nowrap px-5 py-3 align-middle">
                          <p
                            className={`text-[13px] font-semibold tabular-nums ${
                              isCancelled
                                ? "text-[var(--ink-muted)] line-through"
                                : "text-[var(--ink-primary)]"
                            }`}
                          >
                            {appt.time_label}
                          </p>
                          <p className="text-[11px] text-[var(--ink-muted)]">
                            {appt.date_label}
                          </p>
                        </td>

                        <td className="px-3.5 py-3 align-middle">
                          <p className="text-[13.5px] font-medium text-[var(--ink-primary)]">
                            {appt.patient_name}
                          </p>
                          <p className="font-mono text-[11px] text-[var(--ink-muted)]">
                            {appt.phone_masked}
                          </p>
                        </td>

                        <td className="px-3.5 py-3 align-middle">
                          <div className="flex items-center gap-2">
                            <span
                              aria-hidden="true"
                              className="h-2 w-2 shrink-0 rounded-full"
                              style={{ backgroundColor: appt.doctor.accent }}
                            />
                            <span className="text-[13px] font-medium text-[var(--ink-primary)]">
                              {appt.doctor.name}
                            </span>
                          </div>
                          <p className="pl-4 text-[11px] text-[var(--ink-muted)]">
                            Room {appt.doctor.room}
                          </p>
                        </td>

                        <td className="whitespace-nowrap px-3.5 py-3 align-middle text-[13px] text-[var(--ink-secondary)]">
                          {appt.doctor.specialty}
                        </td>

                        <td className="whitespace-nowrap px-3.5 py-3 align-middle">
                          <span className="font-mono text-xs font-medium tabular-nums text-[var(--ink-secondary)]">
                            {appt.reference}
                          </span>
                        </td>

                        <td className="whitespace-nowrap px-5 py-3 text-right align-middle">
                          <StatusBadge
                            tone={isCancelled ? "danger" : "success"}
                            label={isCancelled ? "Cancelled" : "Booked"}
                            dot={false}
                          />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Mobile & compact 1024px stacked ledger */}
            <ul className="divide-y divide-[var(--border-hairline)] md:hidden lg:block xl:hidden">
              {paginated.map((appt) => {
                const isCancelled = appt.status === "cancelled";
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
                    className={`space-y-2 px-4 py-3.5 ${highlightClass}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-baseline gap-2">
                        <span
                          className={`text-[13.5px] font-semibold tabular-nums ${
                            isCancelled
                              ? "text-[var(--ink-muted)] line-through"
                              : "text-[var(--ink-primary)]"
                          }`}
                        >
                          {appt.time_label}
                        </span>
                        <span className="text-xs text-[var(--ink-muted)]">
                          {appt.date_label}
                        </span>
                      </div>
                      <StatusBadge
                        tone={isCancelled ? "danger" : "success"}
                        label={isCancelled ? "Cancelled" : "Booked"}
                        dot={false}
                      />
                    </div>

                    <div className="flex items-baseline justify-between gap-2">
                      <p className="text-[13.5px] font-medium text-[var(--ink-primary)]">
                        {appt.patient_name}
                      </p>
                      <span className="font-mono text-xs font-medium tabular-nums text-[var(--ink-secondary)]">
                        {appt.reference}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--ink-secondary)]">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: appt.doctor.accent }}
                        />
                        {appt.doctor.name} · {appt.doctor.specialty} · Room{" "}
                        {appt.doctor.room}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--ink-muted)]">
                        {appt.phone_masked}
                      </span>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Footer summary + conditional pagination */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] px-5 py-3 text-xs text-[var(--ink-muted)]">
              <p className="tabular-nums">
                Showing {startIndex}–{endIndex} of {filtered.length}{" "}
                {filtered.length === 1 ? "appointment" : "appointments"}
                {hasFilters ? " (filtered)" : ""}
              </p>

              {totalPages > 1 ? (
                <div
                  role="navigation"
                  aria-label="Appointments pagination"
                  className="flex items-center gap-1.5"
                >
                  <button
                    type="button"
                    disabled={safePage <= 1}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    aria-label="Previous page"
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[var(--border-hairline)] text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                  </button>
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                    (pageNum) => {
                      const active = pageNum === safePage;
                      return (
                        <button
                          key={pageNum}
                          type="button"
                          aria-current={active ? "page" : undefined}
                          onClick={() => setPage(pageNum)}
                          className={`inline-flex h-7 min-w-7 cursor-pointer items-center justify-center rounded-md border px-2 text-xs font-medium tabular-nums transition-colors ${
                            active
                              ? "border-[var(--border-strong)] bg-[var(--bg-subtle)] text-[var(--ink-primary)]"
                              : "border-transparent text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)]"
                          }`}
                        >
                          {pageNum}
                        </button>
                      );
                    }
                  )}
                  <button
                    type="button"
                    disabled={safePage >= totalPages}
                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                    aria-label="Next page"
                    className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[var(--border-hairline)] text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:cursor-not-allowed disabled:opacity-45"
                  >
                    <ChevronRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
