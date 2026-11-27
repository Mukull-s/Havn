"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertCircle, RefreshCw, ServerOff } from "lucide-react";
import { ActivityView } from "@/components/ActivityView";
import { AppointmentsView } from "@/components/AppointmentsView";
import { DoctorsView } from "@/components/DoctorsView";
import { OverviewView } from "@/components/OverviewView";
import {
  clampSidebarWidth,
  Sidebar,
  SIDEBAR_DEFAULT_WIDTH,
} from "@/components/Sidebar";
import { DashboardSkeleton } from "@/components/Skeletons";
import { ToastBanner, type ToastMessage } from "@/components/ToastBanner";
import { TopBar } from "@/components/TopBar";
import { VoiceDesk, type VoiceDeskState } from "@/components/VoiceDesk";
import { fetchCalls } from "@/lib/api";
import type {
  CallConfirmationNotice,
  CallSessionRecord,
  Doctor,
  WorkspaceTab,
} from "@/lib/types";
import { useDashboard } from "@/lib/useDashboard";
import { useVoiceCall } from "@/lib/useVoiceCall";
import { INITIAL_VOICE_STATE } from "@/lib/voiceReducer";

const PREVIEW_STATES: Record<"connecting" | "connected" | "ended", VoiceDeskState> = {
  connecting: {
    phase: "connecting",
    muted: false,
    elapsedSeconds: 0,
    speakerState: "idle",
    phoneStatus: { verified: false, pending: false, readback: null },
    audioLevels: Array.from({ length: 18 }, () => 0.05),
    transcript: [],
    confirmation: null,
    errorMessage: null,
    isPreview: true,
  },
  connected: {
    phase: "connected",
    muted: false,
    elapsedSeconds: 47,
    speakerState: "ava-speaking",
    phoneStatus: {
      verified: true,
      pending: false,
      readback: "+91 98765 43210",
    },
    audioLevels: [
      0.15, 0.28, 0.45, 0.7, 0.52, 0.88, 0.64, 0.35, 0.58, 0.8, 0.44, 0.62,
      0.3, 0.48, 0.25, 0.32, 0.18, 0.12,
    ],
    transcript: [
      {
        id: "p1",
        speaker: "ava",
        text: "Thanks for calling Havn Clinic. This is Ava, the virtual receptionist. How can I help you today?",
        final: true,
        timestamp: "12:41 PM",
      },
      {
        id: "p2",
        speaker: "caller",
        text: "Hi, I need to book an appointment with Dr. Meera Iyer tomorrow morning.",
        final: true,
        timestamp: "12:41 PM",
      },
      {
        id: "p3",
        speaker: "ava",
        text: "Dr. Meera Iyer has 8:30 AM and 9:30 AM open tomorrow. Which time works best, and what phone number should I put this under?",
        final: true,
        timestamp: "12:42 PM",
      },
    ],
    confirmation: {
      kind: "booked",
      reference: "HVN-7K2M",
      doctorName: "Dr. Meera Iyer",
      patientName: "Ananya Rao",
      label: "Thu, 26 Nov at 8:30 AM",
    },
    errorMessage: null,
    isPreview: true,
  },
  ended: {
    phase: "ended",
    muted: false,
    elapsedSeconds: 82,
    speakerState: "idle",
    phoneStatus: {
      verified: true,
      pending: false,
      readback: "+91 98765 43210",
    },
    audioLevels: Array.from({ length: 18 }, () => 0),
    transcript: [
      {
        id: "e1",
        speaker: "ava",
        text: "Your appointment HVN-7K2M with Dr. Meera Iyer is confirmed for tomorrow at 8:30 AM. Thank you for calling Havn Clinic.",
        final: true,
        timestamp: "12:43 PM",
      },
    ],
    confirmation: {
      kind: "booked",
      reference: "HVN-7K2M",
      doctorName: "Dr. Meera Iyer",
      patientName: "Ananya Rao",
      label: "Thu, 26 Nov at 8:30 AM",
    },
    errorMessage: null,
    isPreview: true,
  },
};

export function HavnWorkspace() {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>("overview");
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT_WIDTH);
  const [focusSearchTrigger, setFocusSearchTrigger] = useState(0);
  const [openPhoneSignal, setOpenPhoneSignal] = useState(0);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [focusedDoctorId, setFocusedDoctorId] = useState<string | null>(null);
  const [confirmResetOpen, setConfirmResetOpen] = useState(false);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [previewState, setPreviewState] = useState<VoiceDeskState | null>(null);
  const [activeCalls, setActiveCalls] = useState<CallSessionRecord[]>([]);
  const [livePhaseHint, setLivePhaseHint] = useState(false);

  const navigateTab = useCallback((nextTab: WorkspaceTab) => {
    setActiveTab(nextTab);
    if (typeof window !== "undefined") {
      const targetHash = `#${nextTab}`;
      if (window.location.hash !== targetHash) {
        window.history.replaceState(null, "", targetHash);
      }
    }
  }, []);

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem("havn.sidebar.width");
      if (saved) {
        const parsed = Number.parseInt(saved, 10);
        if (Number.isFinite(parsed)) {
          setSidebarWidth(clampSidebarWidth(parsed));
        }
      }
    } catch {
      // Ignore storage access restrictions.
    }

    const syncTabFromHash = () => {
      const rawHash = window.location.hash.replace(/^#/, "");
      if (
        rawHash === "overview" ||
        rawHash === "appointments" ||
        rawHash === "doctors" ||
        rawHash === "activity"
      ) {
        setActiveTab(rawHash);
      }
    };
    syncTabFromHash();
    window.addEventListener("hashchange", syncTabFromHash);

    const params = new URLSearchParams(window.location.search);
    const preview = params.get("callPreview");
    if (
      preview === "connecting" ||
      preview === "connected" ||
      preview === "ended"
    ) {
      setPreviewState(PREVIEW_STATES[preview]);
      setOpenPhoneSignal((n) => n + 1);
    }

    return () => {
      window.removeEventListener("hashchange", syncTabFromHash);
    };
  }, []);

  const handleSidebarWidthChange = useCallback((nextWidth: number) => {
    const clamped = clampSidebarWidth(nextWidth);
    setSidebarWidth(clamped);
    try {
      window.localStorage.setItem("havn.sidebar.width", String(clamped));
    } catch {
      // Ignore storage access restrictions.
    }
  }, []);

  const {
    dashboard,
    health,
    loading,
    retrying,
    error,
    resetting,
    highlights,
    refresh,
    resetDemo,
  } = useDashboard(livePhaseHint);

  const pollCalls = useCallback(async () => {
    try {
      const res = await fetchCalls();
      setActiveCalls(res.calls);
    } catch {
      // Backend offline state is already surfaced by useDashboard.
    }
  }, []);

  const pushToast = useCallback(
    (tone: ToastMessage["tone"], title: string, detail?: string) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev.slice(-1), { id, tone, title, detail }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((item) => item.id !== id));
      }, 4000);
    },
    []
  );

  const handleAppointmentChange = useCallback(
    (notice: CallConfirmationNotice) => {
      pushToast(
        notice.kind === "booked" ? "success" : "danger",
        notice.kind === "booked"
          ? `Appointment booked · ${notice.reference}`
          : `Appointment cancelled · ${notice.reference}`,
        `${notice.patientName} · ${notice.doctorName} · ${notice.label}`
      );
    },
    [pushToast]
  );

  const handleRefreshDashboard = useCallback(() => refresh(true), [refresh]);

  const voice = useVoiceCall({
    voiceReady: Boolean(health?.voice.ready) && !error,
    hasHealth: Boolean(health),
    backendError: error,
    activeCalls,
    enabled: previewState === null,
    onRefreshDashboard: handleRefreshDashboard,
    onSyncCalls: pollCalls,
    onAppointmentChange: handleAppointmentChange,
  });

  const voiceState = previewState ?? voice.voiceState;
  const isCallActive =
    previewState === null &&
    (voiceState.phase === "connecting" ||
      voiceState.phase === "connected" ||
      voiceState.phase === "ending");

  useEffect(() => {
    setLivePhaseHint(isCallActive);
  }, [isCallActive]);

  useEffect(() => {
    void pollCalls();
    const timer = setInterval(() => void pollCalls(), isCallActive ? 1500 : 8000);
    return () => {
      clearInterval(timer);
    };
  }, [isCallActive, pollCalls]);

  const handleSelectDoctor = useCallback(
    (doctor: Doctor) => {
      setFocusedDoctorId(doctor.id);
      navigateTab("doctors");
    },
    [navigateTab]
  );

  async function confirmReset() {
    setConfirmResetOpen(false);
    const result = await resetDemo();
    if (result.ok) {
      pushToast("success", "Demo schedule restored", result.message);
    } else {
      pushToast("danger", "Reset blocked", result.message);
    }
  }

  function handleStartCall() {
    setOpenPhoneSignal((n) => n + 1);
    if (previewState) {
      setPreviewState(PREVIEW_STATES.connected);
      return;
    }
    void voice.startCall();
  }

  function handleEndCall() {
    if (previewState) {
      setPreviewState(PREVIEW_STATES.ended);
      return;
    }
    void voice.endCall();
  }

  function handleToggleMute() {
    if (previewState) {
      setPreviewState((prev) =>
        prev ? { ...prev, muted: !prev.muted } : prev
      );
      return;
    }
    voice.toggleMute();
  }

  function handleResetCall() {
    if (previewState) {
      setPreviewState({ ...INITIAL_VOICE_STATE, isPreview: true });
      return;
    }
    voice.resetCall();
  }

  const bookedCount =
    dashboard?.appointments.filter((a) => a.status === "booked").length ?? 0;

  return (
    <div className="havn-workspace-bg relative min-h-screen lg:flex">
      {/* Subtle paper-grain texture across main workspace only */}
      <div
        aria-hidden="true"
        className="havn-paper-grain pointer-events-none fixed inset-0 z-0 opacity-[0.032]"
      />

      {/* Forest-green dynamically resizable sidebar */}
      <Sidebar
        activeTab={activeTab}
        onSelectTab={navigateTab}
        clinic={dashboard?.clinic}
        counts={{
          appointments: bookedCount,
          doctors: dashboard?.doctors.length ?? 0,
        }}
        width={sidebarWidth}
        onWidthChange={handleSidebarWidthChange}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
      />

      {/* Main Content Shell */}
      <div className="relative z-10 flex min-w-0 flex-1 flex-col pb-24 lg:pb-14">
        <TopBar
          activeTab={activeTab}
          clinic={dashboard?.clinic}
          health={health}
          backendError={error}
          isCallActive={isCallActive}
          resetting={resetting}
          onGoHome={() => navigateTab("overview")}
          onRequestReset={() => setConfirmResetOpen(true)}
          onOpenMobileNav={() => setMobileNavOpen(true)}
          onQuickSearch={() => {
            navigateTab("appointments");
            setFocusSearchTrigger((n) => n + 1);
          }}
        />

        <main className="relative mx-auto w-full max-w-[1440px] flex-1 px-5 pt-7 sm:px-8 lg:px-10 xl:px-12">
          {/* Subtle top-right botanical shadow behind greeting/title */}
          <svg
            aria-hidden="true"
            viewBox="0 0 280 180"
            fill="none"
            className="havn-botanical-sway pointer-events-none absolute right-6 top-0 hidden h-44 w-72 opacity-[0.075] md:block lg:right-[360px]"
          >
            <path
              d="M275 8C232 34 196 66 150 112"
              stroke="#3A5448"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              d="M214 54C186 42 162 48 154 70C178 78 202 72 214 54Z"
              fill="#445E51"
            />
            <path
              d="M192 78C204 102 196 128 172 136C166 112 172 88 192 78Z"
              fill="#445E51"
            />
            <path
              d="M238 36C222 14 196 14 182 34C204 46 224 46 238 36Z"
              fill="#5A7467"
            />
            <path
              d="M168 96C144 92 124 102 120 124C144 128 162 118 168 96Z"
              fill="#5A7467"
            />
          </svg>

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-start lg:gap-8 xl:gap-10">
            {/* Primary Workspace View */}
            <div className="min-w-0 flex-1 space-y-6">
              {error ? (
                <div
                  role="alert"
                  className="flex flex-col gap-3 rounded-xl border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-4 py-3.5 text-sm text-[var(--status-danger-ink)] sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-2.5">
                    <AlertCircle
                      aria-hidden="true"
                      className="mt-0.5 h-4 w-4 shrink-0"
                      strokeWidth={1.75}
                    />
                    <div>
                      <p className="font-medium">
                        Unable to connect to the Havn clinic backend
                      </p>
                      <p className="mt-0.5 text-xs opacity-90">{error}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void refresh(false)}
                    disabled={retrying}
                    className="inline-flex h-9 w-fit shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--status-danger-border)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--status-danger-ink)] hover:bg-[#FAF9F5] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`}
                      strokeWidth={1.75}
                    />
                    <span>{retrying ? "Retrying..." : "Retry"}</span>
                  </button>
                </div>
              ) : null}

              {loading && !dashboard ? (
                <DashboardSkeleton />
              ) : !dashboard && error ? (
                <section
                  aria-label="Backend connection unavailable"
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-6 py-10 text-center shadow-[var(--shadow-surface)]"
                >
                  <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger)]">
                    <ServerOff className="h-5 w-5" strokeWidth={1.65} />
                  </span>
                  <h2 className="mt-4 font-display text-[26px] font-normal leading-tight text-[var(--ink-primary)]">
                    Clinic server unavailable
                  </h2>
                  <p className="mx-auto mt-1.5 max-w-md text-xs leading-5 text-[var(--ink-secondary)]">
                    Havn needs the FastAPI backend running on port{" "}
                    <code className="font-mono text-[var(--ink-primary)]">7860</code>{" "}
                    to load doctors, appointment slots, and the Pipecat voice line.
                  </p>
                  <div className="mt-5 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => void refresh(false)}
                      disabled={retrying}
                      className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full bg-[var(--bg-sidebar)] px-4 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      <RefreshCw
                        className={`h-3.5 w-3.5 ${retrying ? "animate-spin" : ""}`}
                        strokeWidth={1.75}
                      />
                      <span>{retrying ? "Checking server..." : "Retry connection"}</span>
                    </button>
                  </div>
                </section>
              ) : dashboard ? (
                <div key={activeTab} className="havn-view-enter">
                  {activeTab === "overview" ? (
                    <OverviewView
                      dashboard={dashboard}
                      highlights={highlights}
                      onNavigateTab={navigateTab}
                      onSelectDoctor={handleSelectDoctor}
                    />
                  ) : null}

                  {activeTab === "appointments" ? (
                    <AppointmentsView
                      appointments={dashboard.appointments}
                      doctors={dashboard.doctors}
                      clinicToday={dashboard.clinic.today}
                      highlights={highlights}
                      focusSearchTrigger={focusSearchTrigger}
                    />
                  ) : null}

                  {activeTab === "doctors" ? (
                    <DoctorsView
                      doctors={dashboard.doctors}
                      clinicToday={dashboard.clinic.today}
                      focusedDoctorId={focusedDoctorId}
                      onClearFocus={() => setFocusedDoctorId(null)}
                      onStartCall={handleStartCall}
                      voiceReady={Boolean(health?.voice.ready) && !error}
                    />
                  ) : null}

                  {activeTab === "activity" ? (
                    <ActivityView
                      activity={dashboard.activity}
                      appointments={dashboard.appointments}
                      activeCalls={activeCalls}
                      clinicToday={dashboard.clinic.today}
                      clinicTimezone={dashboard.clinic.timezone}
                    />
                  ) : null}
                </div>
              ) : null}
            </div>

            {/* Right Voice Receptionist Column */}
            <VoiceDesk
              health={health}
              backendError={error}
              activity={dashboard?.activity ?? []}
              activeCalls={activeCalls}
              state={voiceState}
              openPhoneSignal={openPhoneSignal}
              onStartCall={handleStartCall}
              onEndCall={handleEndCall}
              onToggleMute={handleToggleMute}
              onResetCall={handleResetCall}
              onViewAllActivity={() => navigateTab("activity")}
            />
          </div>
        </main>
      </div>

      {/* Reset Demo Confirmation Dialog */}
      {confirmResetOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-[#181B1A]/35 p-4"
        >
          <div className="w-full max-w-sm rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-overlay)]">
            <h2
              id="reset-dialog-title"
              className="font-display text-[22px] font-normal leading-snug tracking-[-0.01em] text-[var(--ink-primary)]"
            >
              Restore demo schedule?
            </h2>
            <p className="mt-1.5 text-xs leading-5 text-[var(--ink-secondary)]">
              This resets the clinic database to the 6 seeded doctors, 14-day
              openings, and the initial demo appointment for Ananya Rao.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmResetOpen(false)}
                className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 text-xs font-medium text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmReset()}
                className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-[var(--accent-primary)] px-3.5 text-xs font-medium text-white hover:bg-[var(--accent-primary-hover)]"
              >
                Restore data
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ToastBanner
        toasts={toasts}
        onDismiss={(id) =>
          setToasts((prev) => prev.filter((item) => item.id !== id))
        }
      />
    </div>
  );
}
