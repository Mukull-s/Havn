"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Filter,
  Info,
  Phone,
  Search,
  Stethoscope,
  X,
} from "lucide-react";
import { EmptyState } from "@/components/StatusBadge";
import type { Doctor, Slot } from "@/lib/types";

interface DoctorsViewProps {
  doctors: Doctor[];
  clinicToday: string;
  focusedDoctorId: string | null;
  onClearFocus: () => void;
  onStartCall?: () => void;
  voiceReady?: boolean;
}

interface DayBucket {
  isoDate: string;
  weekdayShort: string;
  monthDayShort: string;
  fullLabel: string;
  slots: Slot[];
}

function addDaysIso(baseIso: string, offset: number): string {
  const [y, m, d] = baseIso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + offset));
  return dt.toISOString().slice(0, 10);
}

function formatUtcDateParts(isoDate: string): {
  weekdayShort: string;
  monthDayShort: string;
  fullLabel: string;
} {
  const [y, m, d] = isoDate.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return {
    weekdayShort: new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
    }).format(dt),
    monthDayShort: new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      month: "short",
      day: "numeric",
    }).format(dt),
    fullLabel: new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
    }).format(dt),
  };
}

export function DoctorsView({
  doctors,
  clinicToday,
  focusedDoctorId,
  onClearFocus,
  onStartCall,
  voiceReady = true,
}: DoctorsViewProps) {
  const [query, setQuery] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState<string>("all");
  const [weekIndex, setWeekIndex] = useState<0 | 1>(0);
  const [selectedDoctorId, setSelectedDoctorId] = useState<string | null>(null);
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  const specialties = useMemo(() => {
    return Array.from(new Set(doctors.map((d) => d.specialty))).sort();
  }, [doctors]);

  const visibleDoctors = useMemo(() => {
    const q = query.trim().toLowerCase();
    return doctors.filter((doc) => {
      if (specialtyFilter !== "all" && doc.specialty !== specialtyFilter) {
        return false;
      }
      if (!q) return true;
      return (
        doc.name.toLowerCase().includes(q) ||
        doc.specialty.toLowerCase().includes(q) ||
        doc.credentials.toLowerCase().includes(q)
      );
    });
  }, [doctors, query, specialtyFilter]);

  const activeDoctor = useMemo(() => {
    if (visibleDoctors.length === 0) return null;
    if (focusedDoctorId) {
      const focused = visibleDoctors.find((d) => d.id === focusedDoctorId);
      if (focused) return focused;
    }
    if (selectedDoctorId) {
      const picked = visibleDoctors.find((d) => d.id === selectedDoctorId);
      if (picked) return picked;
    }
    return visibleDoctors[0];
  }, [focusedDoctorId, selectedDoctorId, visibleDoctors]);

  const weekRanges = useMemo(() => {
    const w0Start = clinicToday;
    const w0End = addDaysIso(clinicToday, 6);
    const w1Start = addDaysIso(clinicToday, 7);
    const w1End = addDaysIso(clinicToday, 13);
    const fmt = (iso: string) => formatUtcDateParts(iso).monthDayShort;
    return [
      { index: 0 as const, label: `${fmt(w0Start)} – ${fmt(w0End)}` },
      { index: 1 as const, label: `${fmt(w1Start)} – ${fmt(w1End)}` },
    ];
  }, [clinicToday]);

  const weekDays = useMemo<DayBucket[]>(() => {
    const slotsByDate = new Map<string, Slot[]>();
    if (activeDoctor) {
      for (const slot of activeDoctor.availability) {
        const list = slotsByDate.get(slot.date) || [];
        list.push(slot);
        slotsByDate.set(slot.date, list);
      }
    }
    const baseOffset = weekIndex * 7;
    return Array.from({ length: 7 }, (_, i) => {
      const isoDate = addDaysIso(clinicToday, baseOffset + i);
      const parts = formatUtcDateParts(isoDate);
      return {
        isoDate,
        ...parts,
        slots: slotsByDate.get(isoDate) || [],
      };
    });
  }, [activeDoctor, clinicToday, weekIndex]);

  const lastDoctorIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (weekDays.length === 0) return;
    const doctorChanged = (activeDoctor?.id ?? null) !== lastDoctorIdRef.current;
    const currentInWeek = weekDays.some((day) => day.isoDate === selectedDate);
    if (!doctorChanged && currentInWeek) return;

    lastDoctorIdRef.current = activeDoctor?.id ?? null;
    const firstWithSlots = weekDays.find((day) => day.slots.length > 0);
    setSelectedDate((firstWithSlots ?? weekDays[0]).isoDate);
    setSelectedSlotId(null);
  }, [activeDoctor?.id, weekDays, selectedDate]);

  const activeDayBucket = useMemo(() => {
    return (
      weekDays.find((day) => day.isoDate === selectedDate) ?? weekDays[0] ?? null
    );
  }, [selectedDate, weekDays]);

  const todayCount = useMemo(() => {
    if (!activeDoctor) return 0;
    return activeDoctor.availability.filter((s) => s.date === clinicToday).length;
  }, [activeDoctor, clinicToday]);

  const highlightedSlot = useMemo(() => {
    if (!activeDoctor) return null;
    if (selectedSlotId) {
      const found = activeDoctor.availability.find((s) => s.id === selectedSlotId);
      if (found) return found;
    }
    if (activeDayBucket && activeDayBucket.slots.length > 0) {
      return activeDayBucket.slots[0];
    }
    return activeDoctor.next_available;
  }, [activeDayBucket, activeDoctor, selectedSlotId]);

  function handleSelectDoctor(doctorId: string) {
    setSelectedDoctorId(doctorId);
    setSelectedSlotId(null);
    if (focusedDoctorId) onClearFocus();
  }

  return (
    <div
      id="panel-doctors"
      role="tabpanel"
      aria-labelledby="tab-doctors"
      className="space-y-5"
    >
      {/* Page Heading matching Overview & Appointments hierarchy */}
      <header className="pt-1">
        <h1 className="font-display text-[34px] font-normal leading-[1.12] tracking-[-0.015em] text-[var(--ink-primary)] sm:text-[38px]">
          Doctors &amp; Availability
        </h1>
        <p className="mt-1.5 text-[13.5px] leading-5 text-[var(--ink-secondary)]">
          Find the right doctor and inspect their open 14-day appointment slots.
        </p>
      </header>

      {/* Toolbar: Search + Specialty + Date Range */}
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
            aria-label="Search doctors by name or specialty"
            placeholder="Search doctors by name or specialty..."
            className="h-10 w-full rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] pl-10 pr-9 text-base text-[var(--ink-primary)] shadow-[var(--shadow-surface)] placeholder:text-[var(--ink-muted)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15 sm:h-9 sm:text-[13px]"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear doctor search"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 cursor-pointer rounded-full p-1 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          ) : null}
        </div>

        <div className="flex flex-col gap-2.5 sm:flex-row sm:items-center">
          <div className="relative w-full sm:w-44">
            <Filter
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-secondary)]"
              strokeWidth={1.65}
            />
            <select
              aria-label="Filter doctors by specialty"
              value={specialtyFilter}
              onChange={(e) => {
                setSpecialtyFilter(e.target.value);
                if (focusedDoctorId) onClearFocus();
              }}
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

          <div className="relative w-full sm:w-44">
            <Calendar
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--ink-secondary)]"
              strokeWidth={1.65}
            />
            <select
              aria-label="Select 7-day schedule window"
              value={weekIndex}
              onChange={(e) =>
                setWeekIndex(Number(e.target.value) === 1 ? 1 : 0)
              }
              className="h-10 w-full cursor-pointer appearance-none rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] pl-9 pr-8 text-xs font-medium text-[var(--ink-primary)] shadow-[var(--shadow-surface)] transition-colors hover:border-[var(--border-strong)] focus:border-[var(--accent-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--accent-primary)]/15 sm:h-9"
            >
              {weekRanges.map((range) => (
                <option key={range.index} value={range.index}>
                  {range.label}
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

      {/* Directory + Selected Doctor Availability Workspace */}
      {visibleDoctors.length === 0 ? (
        <div className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)]">
          <EmptyState
            icon={<Stethoscope className="h-4 w-4" strokeWidth={1.5} />}
            title="No doctors match your search"
            description="Try clearing the search query or choosing a different specialty."
            action={
              <button
                type="button"
                onClick={() => {
                  setQuery("");
                  setSpecialtyFilter("all");
                }}
                className="cursor-pointer rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
              >
                Reset filters
              </button>
            }
          />
        </div>
      ) : (
        <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-[232px_minmax(0,1fr)] lg:grid-cols-1 xl:grid-cols-[236px_minmax(0,1fr)]">
          {/* Left Panel: Our Doctors Directory */}
          <section
            aria-label="Our doctors"
            className="overflow-hidden rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)]"
          >
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-4 py-3">
              <h2 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
                Our Doctors
              </h2>
              <span className="rounded-full bg-[var(--bg-subtle)] px-2 py-0.5 text-[11px] font-medium tabular-nums text-[var(--ink-secondary)]">
                {visibleDoctors.length}
              </span>
            </div>

            <ul className="divide-y divide-[var(--border-hairline)]">
              {visibleDoctors.map((doctor) => {
                const isSelected = activeDoctor?.id === doctor.id;
                return (
                  <li key={doctor.id}>
                    <button
                      type="button"
                      aria-current={isSelected ? "true" : undefined}
                      onClick={() => handleSelectDoctor(doctor.id)}
                      className={`flex w-full cursor-pointer items-center justify-between gap-2.5 px-3.5 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--accent-primary)] ${
                        isSelected
                          ? "bg-[var(--accent-sage-bg)]/80 shadow-[inset_3px_0_0_var(--accent-primary)]"
                          : "hover:bg-[#FAF9F5]"
                      }`}
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <span
                          aria-hidden="true"
                          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold text-white"
                          style={{ backgroundColor: doctor.accent }}
                        >
                          {doctor.initials}
                        </span>
                        <div className="min-w-0">
                          <p className="truncate text-[13px] font-medium text-[var(--ink-primary)]">
                            {doctor.name}
                          </p>
                          <p className="truncate text-[11.5px] text-[var(--ink-secondary)]">
                            {doctor.specialty}
                          </p>
                        </div>
                      </div>

                      <div className="flex shrink-0 items-center gap-1.5 text-right">
                        <div>
                          <p className="text-[11.5px] font-medium tabular-nums text-[var(--ink-primary)]">
                            {doctor.available_count} slots
                          </p>
                          <p className="text-[10.5px] text-[var(--ink-muted)]">
                            available
                          </p>
                        </div>
                        <ChevronRight
                          aria-hidden="true"
                          className={`h-3.5 w-3.5 ${
                            isSelected
                              ? "text-[var(--accent-primary)]"
                              : "text-[var(--ink-muted)]"
                          }`}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>

          {/* Right Center Panel: Selected Doctor Availability Workspace */}
          {activeDoctor ? (
            <section
              aria-label={`Availability for ${activeDoctor.name}`}
              className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)]"
            >
              {/* Selected Doctor Header */}
              <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-4 pt-5">
                <div className="flex min-w-0 items-center gap-3.5">
                  <span
                    aria-hidden="true"
                    className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-semibold text-white"
                    style={{ backgroundColor: activeDoctor.accent }}
                  >
                    {activeDoctor.initials}
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-[24px] font-normal leading-tight tracking-[-0.01em] text-[var(--ink-primary)]">
                      {activeDoctor.name}
                    </h2>
                    <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
                      {activeDoctor.specialty} · {activeDoctor.credentials}
                    </p>
                  </div>
                </div>

                <span className="shrink-0 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-2.5 py-1 text-xs font-medium text-[var(--ink-secondary)]">
                  Room {activeDoctor.room}
                </span>
              </div>

              <p className="px-5 pb-4 text-xs leading-5 text-[var(--ink-secondary)]">
                {activeDoctor.bio}
              </p>

              {/* 3-Column Real Availability Summary */}
              <div className="grid grid-cols-1 divide-y divide-[var(--border-hairline)] border-y border-[var(--border-hairline)] sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                <div className="px-5 py-3">
                  <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-muted)]">
                    <Calendar className="h-3.5 w-3.5" strokeWidth={1.65} />
                    <span>Today&apos;s Availability</span>
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tabular-nums text-[var(--ink-primary)]">
                    {todayCount} {todayCount === 1 ? "slot" : "slots"}
                  </p>
                </div>

                <div className="px-5 py-3">
                  <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-muted)]">
                    <Clock className="h-3.5 w-3.5" strokeWidth={1.65} />
                    <span>Next Available</span>
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tabular-nums text-[var(--ink-primary)]">
                    {activeDoctor.next_available
                      ? activeDoctor.next_available.time_label
                      : "None"}
                    {activeDoctor.next_available &&
                    activeDoctor.next_available.date !== clinicToday ? (
                      <span className="ml-1.5 text-xs font-normal text-[var(--ink-muted)]">
                        ({activeDoctor.next_available.date_label})
                      </span>
                    ) : null}
                  </p>
                </div>

                <div className="px-5 py-3">
                  <p className="flex items-center gap-1.5 text-[11.5px] text-[var(--ink-muted)]">
                    <Calendar className="h-3.5 w-3.5" strokeWidth={1.65} />
                    <span>Next 14 Days</span>
                  </p>
                  <p className="mt-1 text-[15px] font-semibold tabular-nums text-[var(--ink-primary)]">
                    {activeDoctor.available_count}{" "}
                    {activeDoctor.available_count === 1 ? "slot" : "slots"}
                  </p>
                </div>
              </div>

              {/* 7-Day Date Strip + Week Stepper */}
              <div className="space-y-4 p-5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[14px] font-semibold text-[var(--ink-primary)]">
                    Available Slots
                  </h3>

                  <div className="flex items-center gap-2 text-xs text-[var(--ink-secondary)]">
                    <button
                      type="button"
                      disabled={weekIndex === 0}
                      onClick={() => setWeekIndex(0)}
                      aria-label="Previous 7 days"
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[var(--border-hairline)] text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <span className="min-w-[104px] text-center font-medium tabular-nums text-[var(--ink-primary)]">
                      {weekRanges[weekIndex].label}
                    </span>
                    <button
                      type="button"
                      disabled={weekIndex === 1}
                      onClick={() => setWeekIndex(1)}
                      aria-label="Next 7 days"
                      className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-md border border-[var(--border-hairline)] text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* Day Selector Grid */}
                <div
                  role="group"
                  aria-label="Select date to view open slots"
                  className="grid grid-cols-4 gap-1.5 sm:grid-cols-7"
                >
                  {weekDays.map((day) => {
                    const active = activeDayBucket?.isoDate === day.isoDate;
                    const hasSlots = day.slots.length > 0;
                    return (
                      <button
                        key={day.isoDate}
                        type="button"
                        aria-pressed={active}
                        onClick={() => {
                          setSelectedDate(day.isoDate);
                          setSelectedSlotId(null);
                        }}
                        className={`flex cursor-pointer flex-col items-center rounded-lg border px-2 py-2 text-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                          active
                            ? "border-[var(--accent-sage-border)] bg-[var(--accent-sage-bg)] text-[var(--accent-sage-ink)]"
                            : hasSlots
                            ? "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:bg-[#FAF9F5]"
                            : "border-[var(--border-hairline)] bg-[var(--bg-subtle)]/50 text-[var(--ink-muted)] hover:bg-[var(--bg-subtle)]"
                        }`}
                      >
                        <span className="text-[11px] font-medium">
                          {day.weekdayShort}
                        </span>
                        <span className="mt-0.5 text-[11px] text-[var(--ink-secondary)]">
                          {day.monthDayShort}
                        </span>
                        <span
                          className={`mt-1.5 text-[11px] font-semibold tabular-nums ${
                            active
                              ? "text-[var(--accent-sage-ink)]"
                              : hasSlots
                              ? "text-[var(--ink-primary)]"
                              : "text-[var(--ink-muted)]"
                          }`}
                        >
                          {hasSlots
                            ? `${day.slots.length} ${
                                day.slots.length === 1 ? "slot" : "slots"
                              }`
                            : "—"}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Open Slots Grid for Selected Day */}
                <div className="space-y-2.5 pt-1">
                  <p className="text-xs font-medium text-[var(--ink-secondary)]">
                    {activeDayBucket
                      ? `${activeDayBucket.fullLabel} — Available Slots`
                      : "Available Slots"}
                  </p>

                  {!activeDayBucket || activeDayBucket.slots.length === 0 ? (
                    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-4 py-5 text-center text-xs text-[var(--ink-muted)]">
                      No open 30-minute slots on{" "}
                      {activeDayBucket?.fullLabel ?? "this day"}. Select another
                      date above or ask Ava for openings.
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2 xl:grid-cols-4">
                      {activeDayBucket.slots.map((slot) => {
                        const selected = selectedSlotId === slot.id;
                        return (
                          <button
                            key={slot.id}
                            type="button"
                            aria-pressed={selected}
                            onClick={() =>
                              setSelectedSlotId((prev) =>
                                prev === slot.id ? null : slot.id
                              )
                            }
                            className={`cursor-pointer rounded-lg border px-3 py-2 text-center text-[13px] font-medium tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] ${
                              selected
                                ? "border-[var(--accent-primary)] bg-[var(--accent-sage-bg)] text-[var(--accent-sage-ink)] shadow-[inset_0_0_0_1px_var(--accent-primary)]"
                                : "border-[var(--accent-sage-border)] bg-[var(--accent-sage-bg)]/55 text-[var(--accent-sage-ink)] hover:bg-[var(--accent-sage-bg)]"
                            }`}
                          >
                            {slot.time_label}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Contextual Voice Guidance */}
                <div className="flex flex-col gap-3 rounded-lg border border-[var(--accent-sage-border)] bg-[var(--accent-sage-bg)]/65 px-3.5 py-3 text-xs text-[var(--accent-sage-ink)] sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-start gap-2.5">
                    <Info
                      aria-hidden="true"
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      strokeWidth={1.75}
                    />
                    <div>
                      <p className="font-semibold">
                        Ask Ava to book one of these slots
                      </p>
                      <p className="mt-0.5 opacity-90">
                        {highlightedSlot
                          ? `“Book an appointment with ${activeDoctor.name} on ${highlightedSlot.label}.”`
                          : `“Check upcoming openings for ${activeDoctor.specialty} with ${activeDoctor.name}.”`}
                      </p>
                    </div>
                  </div>
                  {onStartCall ? (
                    <button
                      type="button"
                      onClick={onStartCall}
                      disabled={!voiceReady}
                      className="inline-flex h-8 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--bg-sidebar)] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
                      <span>Call Ava</span>
                    </button>
                  ) : null}
                </div>
              </div>
            </section>
          ) : null}
        </div>
      )}
    </div>
  );
}
