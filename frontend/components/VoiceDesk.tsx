"use client";

import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  AudioLines,
  CheckCircle2,
  Mic,
  MicOff,
  Minimize2,
  MoreHorizontal,
  Phone,
  PhoneCall,
  PhoneOff,
  ShieldCheck,
  X,
} from "lucide-react";
import { StatusBadge } from "@/components/StatusBadge";
import type {
  ActivityItem,
  CallConfirmationNotice,
  CallPhoneStatus,
  CallSessionRecord,
  HealthResponse,
  TranscriptEntry,
  VoiceCallPhase,
} from "@/lib/types";
import {
  formatCallDuration,
  RESTING_AUDIO_LEVELS,
  type VoiceDeskState,
} from "@/lib/voiceReducer";

export type { VoiceDeskState };

interface VoiceDeskProps {
  health: HealthResponse | null;
  backendError: string | null;
  activity: ActivityItem[];
  activeCalls: CallSessionRecord[];
  state: VoiceDeskState;
  openPhoneSignal?: number;
  onStartCall: () => void;
  onEndCall: () => void;
  onToggleMute: () => void;
  onResetCall: () => void;
  onViewAllActivity: () => void;
}

function AvaWaveArtwork() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 320 64"
      fill="none"
      className="h-14 w-full"
      preserveAspectRatio="none"
    >
      <path
        d="M0 34C48 34 68 18 112 24C144 28 152 46 176 34C198 22 214 14 244 28C268 39 292 34 320 34"
        stroke="#215B44"
        strokeOpacity="0.45"
        strokeWidth="1.25"
      />
      <path
        d="M0 34C56 34 86 48 128 36C154 28 164 12 186 24C210 38 228 48 260 32C282 22 298 34 320 34"
        stroke="#2D6E54"
        strokeOpacity="0.65"
        strokeWidth="1.4"
      />
      <path
        d="M0 34C42 30 78 24 118 32C150 38 160 52 184 36C208 20 232 22 268 34C290 40 306 34 320 34"
        stroke="#4D856E"
        strokeOpacity="0.55"
        strokeWidth="1.1"
      />
      <path
        d="M0 34C64 38 96 16 138 26C162 32 170 42 192 26C214 10 242 40 278 34C298 30 310 34 320 34"
        stroke="#86AE9B"
        strokeOpacity="0.6"
        strokeWidth="1"
      />
    </svg>
  );
}

function PhoneVerificationStrip({ status }: { status: CallPhoneStatus }) {
  if (status.verified && status.readback) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--accent-sage-border)] bg-[var(--accent-sage-bg)] px-3 py-2 text-xs text-[var(--accent-sage-ink)]">
        <span className="inline-flex items-center gap-1.5 font-medium">
          <ShieldCheck className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          Verified caller
        </span>
        <span className="font-mono font-medium tabular-nums">
          {status.readback}
        </span>
      </div>
    );
  }

  if (status.pending) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-xs text-[var(--status-warning-ink)]">
        <span className="font-medium">Confirming spoken phone number</span>
        <span className="text-[11px]">Awaiting yes/no</span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3 py-2 text-xs text-[var(--ink-secondary)]">
      <span>Caller identity</span>
      <span className="text-[11px] text-[var(--ink-muted)]">
        Verified via spoken number
      </span>
    </div>
  );
}

const RINGING_WAVE_LEVELS = [
  0.14, 0.24, 0.36, 0.22, 0.44, 0.58, 0.32, 0.48, 0.62, 0.42, 0.52, 0.34,
  0.46, 0.28, 0.38, 0.22, 0.16, 0.12,
];

function AudioWaveformStrip({
  phase,
  speakerState,
  muted,
  levels,
}: {
  phase: VoiceCallPhase;
  speakerState: VoiceDeskState["speakerState"];
  muted: boolean;
  levels: number[];
}) {
  const bars =
    phase === "connecting"
      ? RINGING_WAVE_LEVELS
      : levels.length === 18
      ? levels
      : RESTING_AUDIO_LEVELS;
  const activeColor =
    phase === "connecting"
      ? "bg-[#6C9E88] animate-pulse"
      : speakerState === "ava-speaking"
      ? "bg-[var(--accent-primary)]"
      : speakerState === "listening" && !muted
      ? "bg-[var(--ink-secondary)]"
      : "bg-[var(--border-strong)]";

  let statusCopy = "Line idle";
  if (phase === "connecting") statusCopy = "Connecting & ringing Ava...";
  else if (phase === "ending") statusCopy = "Ending call...";
  else if (phase === "ended") statusCopy = "Call ended";
  else if (phase === "connected") {
    if (muted) statusCopy = "Microphone muted";
    else if (speakerState === "ava-speaking") statusCopy = "Ava speaking";
    else statusCopy = "Listening to caller";
  }

  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-subtle)] px-3.5 py-2.5">
      <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-[var(--ink-secondary)]">
        <span>{statusCopy}</span>
        <span className="text-[var(--ink-muted)]">
          {phase === "connected" ? "Live WebRTC audio" : "Audio channel"}
        </span>
      </div>
      <div
        aria-hidden="true"
        className="flex h-8 items-center justify-center gap-1"
      >
        {bars.map((level, idx) => {
          const clamped = Math.max(0, Math.min(1, level));
          const heightPx = Math.round(4 + clamped * 24);
          return (
            <span
              key={idx}
              className={`w-[3px] rounded-full transition-[height] duration-75 ${activeColor}`}
              style={{ height: `${heightPx}px` }}
            />
          );
        })}
      </div>
    </div>
  );
}

function ConfirmationCard({
  confirmation,
}: {
  confirmation: CallConfirmationNotice;
}) {
  const isBooked = confirmation.kind === "booked";
  return (
    <div
      className={`havn-modal-enter rounded-lg border px-3.5 py-2.5 text-xs ${
        isBooked
          ? "border-[var(--accent-sage-border)] bg-[var(--accent-sage-bg)] text-[var(--accent-sage-ink)]"
          : "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger-ink)]"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-1.5 font-semibold">
          <CheckCircle2 className="h-3.5 w-3.5 shrink-0" strokeWidth={1.75} />
          {isBooked ? "Appointment booked" : "Appointment cancelled"}
        </span>
        <span className="font-mono font-medium">{confirmation.reference}</span>
      </div>
      <p className="mt-1 text-[11px] opacity-90">
        {confirmation.patientName} · {confirmation.doctorName} ·{" "}
        {confirmation.label}
      </p>
    </div>
  );
}

function TranscriptStream({
  entries,
  phase,
}: {
  entries: TranscriptEntry[];
  phase: VoiceCallPhase;
}) {
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [entries]);

  return (
    <div className="flex min-h-[190px] max-h-[300px] flex-1 flex-col overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)]">
      <div className="flex items-center justify-between border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--ink-muted)]">
          Live call transcript
        </span>
        <span className="text-[11px] tabular-nums text-[var(--ink-muted)]">
          {entries.length} {entries.length === 1 ? "turn" : "turns"}
        </span>
      </div>

      <div
        ref={scrollRef}
        role="log"
        aria-live="polite"
        aria-label="Voice call transcript"
        className="flex-1 space-y-3 overflow-y-auto px-3.5 py-3"
      >
        {entries.length === 0 ? (
          <p className="py-6 text-center text-xs text-[var(--ink-muted)]">
            {phase === "connecting"
              ? "Waiting for Ava to join the line..."
              : "Conversation transcript will appear here once speaking begins."}
          </p>
        ) : (
          entries.map((entry) => {
            const isAva = entry.speaker === "ava";
            return (
              <div
                key={entry.id}
                className={`transcript-enter space-y-0.5 ${
                  entry.final ? "opacity-100" : "opacity-65"
                }`}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-[10px] font-semibold uppercase tracking-[0.06em] ${
                      isAva
                        ? "text-[var(--accent-primary)]"
                        : "text-[var(--ink-secondary)]"
                    }`}
                  >
                    {isAva ? "Ava" : "Caller"}
                  </span>
                  <span className="text-[10px] tabular-nums text-[var(--ink-muted)]">
                    {entry.timestamp}
                  </span>
                </div>
                <p className="max-w-[62ch] text-[13.5px] leading-[1.45] text-[var(--ink-primary)]">
                  {entry.text}
                </p>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function CallHeroCard({
  health,
  backendError,
  state,
  onStartCall,
  onEndCall,
  onToggleMute,
  onResetCall,
  onExpandPhone,
  showExpandButton,
  onCloseModal,
  isModal,
}: Omit<
  VoiceDeskProps,
  "activity" | "activeCalls" | "onViewAllActivity" | "openPhoneSignal"
> & {
  onExpandPhone?: () => void;
  showExpandButton?: boolean;
  onCloseModal?: () => void;
  isModal?: boolean;
}) {
  const voiceReady = Boolean(health?.voice.ready) && !backendError;
  const isIdle = state.phase === "idle";
  const isSetupNeeded = state.phase === "setup_needed";
  const isConnecting = state.phase === "connecting";
  const isConnected = state.phase === "connected";
  const isEnding = state.phase === "ending";
  const isEnded = state.phase === "ended";
  const isError = state.phase === "error";

  let pillTone: "success" | "warning" | "danger" | "neutral" = "neutral";
  let pillLabel = "Checking line";
  if (state.isPreview) {
    pillTone = isConnected ? "success" : isConnecting ? "warning" : "neutral";
    pillLabel = `UI Preview · ${state.phase}`;
  } else if (backendError) {
    pillTone = "danger";
    pillLabel = "Backend offline";
  } else if (isConnected) {
    pillTone = "success";
    pillLabel = "Connected";
  } else if (isConnecting) {
    pillTone = "warning";
    pillLabel = "Connecting";
  } else if (isEnding) {
    pillTone = "neutral";
    pillLabel = "Ending call";
  } else if (isEnded) {
    pillTone = "neutral";
    pillLabel = "Call ended";
  } else if (isError) {
    pillTone = "danger";
    pillLabel = "Call error";
  } else if (voiceReady) {
    pillTone = "success";
    pillLabel = "Ready for calls";
  } else {
    pillTone = "warning";
    pillLabel = "Voice setup needed";
  }

  return (
    <div
      className={`flex flex-col overflow-hidden bg-[var(--bg-surface)] ${
        isModal
          ? "rounded-t-2xl border border-[var(--border-hairline)] shadow-[var(--shadow-overlay)] sm:rounded-3xl"
          : "rounded-xl border border-[var(--border-hairline)] shadow-[var(--shadow-surface)]"
      }`}
    >
      {/* Phone Bezel Strip inside focused Phone-Style Call Screen */}
      {isModal ? (
        <div className="flex items-center justify-between gap-2 bg-[var(--bg-sidebar)] px-5 py-3 text-white">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${
                isConnected
                  ? "bg-[#7EC9A2]"
                  : isConnecting
                  ? "animate-pulse bg-[#F4C46D]"
                  : "bg-white/45"
              }`}
            />
            <span className="text-xs font-medium tracking-[0.01em] text-white/95">
              Havn Clinic · Reception Line
            </span>
          </div>

          <div className="flex items-center gap-2">
            <span className="font-mono text-xs tabular-nums text-white/85">
              {formatCallDuration(state.elapsedSeconds)}
            </span>
            {onCloseModal ? (
              <button
                type="button"
                onClick={onCloseModal}
                aria-label={
                  isConnected || isConnecting
                    ? "Minimize phone screen"
                    : "Close phone screen"
                }
                title={
                  isConnected || isConnecting
                    ? "Minimize to sidebar while keeping call active"
                    : "Close phone screen"
                }
                className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-white/10 text-white/85 transition-colors hover:bg-white/20 hover:text-white"
              >
                {isConnected || isConnecting ? (
                  <Minimize2 className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <X className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
              </button>
            ) : null}
          </div>
        </div>
      ) : (
        /* Docked Card Header */
        <div className="flex items-center justify-between gap-2 px-5 pt-4">
          <div className="flex items-center gap-2">
            <AudioLines
              aria-hidden="true"
              className="h-4 w-4 text-[var(--ink-primary)]"
              strokeWidth={1.75}
            />
            <h2 className="text-[14.5px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
              Voice Receptionist
            </h2>
          </div>

          <div className="flex items-center gap-1">
            {showExpandButton && onExpandPhone ? (
              <button
                type="button"
                onClick={onExpandPhone}
                aria-label="Open phone call screen"
                title="Open phone call screen"
                className="inline-flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg text-[var(--ink-secondary)] transition-colors hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)]"
              >
                <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
              </button>
            ) : null}
          </div>
        </div>
      )}

      {isIdle || isSetupNeeded || isError ? (
        <div className="px-5 pb-5 pt-2">
          {/* Sage-tinted Ava wave stage matching reference */}
          <div className="rounded-xl bg-[radial-gradient(ellipse_at_50%_45%,rgba(222,235,227,0.72)_0%,rgba(244,247,245,0.45)_65%,transparent_100%)] pb-3 pt-4 text-center">
            <h3 className="font-display text-[34px] font-normal leading-[1.08] tracking-[-0.015em] text-[var(--ink-primary)]">
              Ava
            </h3>
            <p className="mt-0.5 text-xs text-[var(--ink-secondary)]">
              Your AI receptionist
            </p>
            <div className="mt-2">
              <AvaWaveArtwork />
            </div>
          </div>

          <div className="mt-2 flex flex-col items-center text-center">
            <StatusBadge tone={pillTone} label={pillLabel} />

            <p className="mt-3 max-w-[260px] text-xs leading-[1.55] text-[var(--ink-secondary)]">
              Ava can help with appointments, availability, and cancellations
              through a natural conversation.
            </p>
          </div>

          {!backendError && health && !health.voice.ready ? (
            <div className="mt-3.5 rounded-lg border border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] px-3 py-2 text-[11px] leading-4 text-[var(--status-warning-ink)]">
              Add <code className="font-mono">ELEVENLABS_API_KEY</code> and{" "}
              <code className="font-mono">GROQ_API_KEY</code> (or{" "}
              <code className="font-mono">GOOGLE_API_KEY</code>) in{" "}
              <code className="font-mono">.env</code> to enable live calls.
            </div>
          ) : null}

          {state.errorMessage ? (
            <div
              role="alert"
              className="mt-3.5 space-y-1.5 rounded-lg border border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] px-3 py-2.5 text-[11px] leading-4 text-[var(--status-danger-ink)]"
            >
              <p>{state.errorMessage}</p>
              <button
                type="button"
                onClick={onResetCall}
                className="cursor-pointer font-medium underline underline-offset-2 hover:opacity-80"
              >
                Dismiss error
              </button>
            </div>
          ) : null}

          <button
            type="button"
            onClick={onStartCall}
            disabled={!voiceReady && !state.isPreview}
            className="mt-4 inline-flex h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--bg-sidebar)] px-5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-55"
          >
            <Phone className="h-4 w-4" strokeWidth={1.75} />
            <span>{isError ? "Call Ava again" : "Call Ava · Reception"}</span>
          </button>
        </div>
      ) : (
        /* Structured Active / Connecting / Ending / Ended Call State */
        <div className="flex flex-1 flex-col gap-3 p-5 pt-4">
          {/* Phone Call Header Strip */}
          <div className="flex items-center justify-between gap-2 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors ${
                  isConnecting
                    ? "havn-ring-pulse bg-[var(--accent-sage-bg)] text-[var(--accent-primary)]"
                    : isConnected
                    ? "bg-[var(--bg-sidebar)] text-white"
                    : "bg-[var(--bg-subtle)] text-[var(--ink-secondary)]"
                }`}
              >
                <PhoneCall className="h-4 w-4" strokeWidth={1.85} />
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-semibold text-[var(--ink-primary)]">
                  {state.phoneStatus.verified && state.phoneStatus.readback
                    ? `Ava · ${state.phoneStatus.readback}`
                    : "Ava · AI Receptionist"}
                </p>
                <p className="truncate text-[11px] text-[var(--ink-muted)]">
                  {isConnecting
                    ? "Ringing reception desk..."
                    : isConnected
                    ? state.speakerState === "ava-speaking"
                      ? "Ava is speaking..."
                      : "Listening on the line"
                    : isEnding
                    ? "Disconnecting..."
                    : "Call completed"}
                </p>
              </div>
            </div>

            <div className="flex shrink-0 items-center gap-1.5">
              <StatusBadge tone={pillTone} label={pillLabel} />
              {!isModal ? (
                <span className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2 py-0.5 font-mono text-xs font-medium tabular-nums text-[var(--ink-primary)]">
                  {formatCallDuration(state.elapsedSeconds)}
                </span>
              ) : null}
            </div>
          </div>

          <PhoneVerificationStrip status={state.phoneStatus} />

          <AudioWaveformStrip
            phase={state.phase}
            speakerState={state.speakerState}
            muted={state.muted}
            levels={state.audioLevels}
          />

          {state.confirmation ? (
            <ConfirmationCard confirmation={state.confirmation} />
          ) : null}

          <TranscriptStream entries={state.transcript} phase={state.phase} />

          {isEnded ? (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onStartCall}
                className="inline-flex h-10 flex-1 cursor-pointer items-center justify-center gap-2 rounded-full bg-[var(--bg-sidebar)] px-4 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
              >
                <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>Start new call</span>
              </button>
              <button
                type="button"
                onClick={onResetCall}
                className="inline-flex h-10 cursor-pointer items-center justify-center rounded-full border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3.5 text-xs font-medium text-[var(--ink-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--ink-primary)]"
              >
                Done
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={onToggleMute}
                disabled={!isConnected}
                aria-pressed={state.muted}
                aria-label={state.muted ? "Unmute microphone" : "Mute microphone"}
                className={`inline-flex h-10 min-w-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
                  state.muted
                    ? "border-[var(--status-warning-border)] bg-[var(--status-warning-bg)] text-[var(--status-warning-ink)]"
                    : "border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--ink-primary)] hover:bg-[var(--bg-subtle)]"
                }`}
              >
                {state.muted ? (
                  <MicOff className="h-3.5 w-3.5" strokeWidth={1.75} />
                ) : (
                  <Mic className="h-3.5 w-3.5" strokeWidth={1.75} />
                )}
                <span>{state.muted ? "Muted" : "Mute"}</span>
              </button>

              <button
                type="button"
                onClick={onEndCall}
                disabled={isEnding}
                aria-label="End voice call"
                className="inline-flex h-10 min-w-10 flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-full bg-[var(--status-danger)] px-3 text-xs font-medium text-white transition-colors hover:bg-[var(--status-danger-hover)] disabled:cursor-not-allowed disabled:opacity-55"
              >
                <PhoneOff className="h-3.5 w-3.5" strokeWidth={1.75} />
                <span>
                  {isEnding ? "Ending..." : isConnecting ? "Cancel" : "End call"}
                </span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function RecentCallsCard({
  activity,
  activeCalls,
  onViewAllActivity,
}: {
  activity: ActivityItem[];
  activeCalls: CallSessionRecord[];
  onViewAllActivity: () => void;
}) {
  const recentItems = activity.slice(0, 3);

  return (
    <section
      aria-label="Recent calls and voice outcomes"
      className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] shadow-[var(--shadow-surface)]"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--border-hairline)] px-5 py-3.5">
        <h3 className="text-[14px] font-semibold tracking-[-0.01em] text-[var(--ink-primary)]">
          Recent Calls
        </h3>
        <button
          type="button"
          onClick={onViewAllActivity}
          className="inline-flex cursor-pointer items-center gap-1 text-xs font-medium text-[var(--ink-secondary)] transition-colors hover:text-[var(--accent-primary)]"
        >
          <span>View all</span>
          <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
        </button>
      </div>

      {activeCalls.length === 0 && recentItems.length === 0 ? (
        <p className="px-5 py-6 text-center text-xs text-[var(--ink-muted)]">
          No active or recent call actions yet.
        </p>
      ) : (
        <ul className="divide-y divide-[var(--border-hairline)] px-5">
          {activeCalls.map((call) => (
            <li
              key={call.session_id}
              className="flex items-center justify-between gap-3 py-3"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span
                  aria-hidden="true"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--accent-sage-border)] bg-[var(--accent-sage-bg)] text-[var(--accent-primary)]"
                >
                  <PhoneCall className="h-3.5 w-3.5" strokeWidth={1.75} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-[var(--ink-primary)]">
                    {call.phone.readback || "Live browser call"}
                  </p>
                  <p className="truncate text-[11px] text-[var(--accent-sage-ink)]">
                    {call.phone.verified
                      ? "Phone verified"
                      : call.phone.pending
                      ? "Confirming number"
                      : "In progress"}
                  </p>
                </div>
              </div>
              <span className="shrink-0 text-[11px] font-medium text-[var(--accent-primary)]">
                Live
              </span>
            </li>
          ))}

          {recentItems.map((item) => {
            const isCancelled = item.kind === "cancelled";
            return (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 py-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border ${
                      isCancelled
                        ? "border-[var(--status-danger-border)] bg-[var(--status-danger-bg)] text-[var(--status-danger)]"
                        : "border-[var(--accent-sage-border)] bg-[var(--accent-sage-bg)] text-[var(--accent-primary)]"
                    }`}
                  >
                    <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-medium text-[var(--ink-primary)]">
                      {item.patient_name || "Caller"}
                    </p>
                    <p className="truncate text-[11px] text-[var(--ink-secondary)]">
                      {isCancelled ? "Cancelled" : "Booked"} ·{" "}
                      {item.detail}
                    </p>
                  </div>
                </div>
                <span className="shrink-0 text-[11px] tabular-nums text-[var(--ink-muted)]">
                  {item.time_label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

export function VoiceDesk(props: VoiceDeskProps) {
  const [phoneModalOpen, setPhoneModalOpen] = useState(false);
  const lastSignalRef = useRef(0);

  const isCallInProgress =
    props.state.phase === "connecting" || props.state.phase === "connected";

  useEffect(() => {
    const signal = props.openPhoneSignal ?? 0;
    if (signal > 0 && signal !== lastSignalRef.current) {
      lastSignalRef.current = signal;
      setPhoneModalOpen(true);
    }
  }, [props.openPhoneSignal]);

  useEffect(() => {
    if (!phoneModalOpen) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setPhoneModalOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [phoneModalOpen]);

  return (
    <>
      {/* Desktop right-side Voice Receptionist column */}
      <aside
        aria-label="Voice receptionist panel"
        className="hidden lg:flex lg:w-[300px] lg:shrink-0 lg:flex-col lg:gap-6 xl:w-[332px]"
      >
        <CallHeroCard
          health={props.health}
          backendError={props.backendError}
          state={props.state}
          onStartCall={props.onStartCall}
          onEndCall={props.onEndCall}
          onToggleMute={props.onToggleMute}
          onResetCall={props.onResetCall}
          showExpandButton
          onExpandPhone={() => setPhoneModalOpen(true)}
        />
        <RecentCallsCard
          activity={props.activity}
          activeCalls={props.activeCalls}
          onViewAllActivity={props.onViewAllActivity}
        />
      </aside>

      {/* Mobile / Tablet sticky bottom call bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2.5 shadow-[var(--shadow-overlay)] lg:hidden">
        <div className="flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--ink-primary)]">
              Ava · Voice Receptionist
            </p>
            <p className="truncate text-xs text-[var(--ink-muted)]">
              {isCallInProgress
                ? `${
                    props.state.phase === "connected"
                      ? "Connected"
                      : "Connecting"
                  } · ${formatCallDuration(props.state.elapsedSeconds)}`
                : props.backendError
                ? "Backend offline"
                : props.health?.voice.ready
                ? "Ready for calls"
                : "Voice setup needed in .env"}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setPhoneModalOpen(true)}
            className="inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full bg-[var(--bg-sidebar)] px-4 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--accent-primary)] focus-visible:ring-offset-2"
          >
            <Phone className="h-3.5 w-3.5" strokeWidth={1.75} />
            <span>{isCallInProgress ? "Open call" : "Start voice call"}</span>
          </button>
        </div>
      </div>

      {/* Focused Phone-Style Call Screen Modal / Mobile Sheet */}
      {phoneModalOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Phone call with Ava"
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#181B1A]/45 p-0 backdrop-blur-[1px] sm:items-center sm:p-4"
        >
          <div className="havn-modal-enter w-full max-w-md overflow-hidden rounded-t-2xl sm:rounded-3xl">
            <CallHeroCard
              isModal
              health={props.health}
              backendError={props.backendError}
              state={props.state}
              onStartCall={props.onStartCall}
              onEndCall={props.onEndCall}
              onToggleMute={props.onToggleMute}
              onResetCall={() => {
                props.onResetCall();
                setPhoneModalOpen(false);
              }}
              onCloseModal={() => setPhoneModalOpen(false)}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
