import type {
  CallConfirmationNotice,
  CallPhoneStatus,
  CallSessionRecord,
  TranscriptEntry,
  VoiceCallPhase,
} from "./types";

export type SpeakerState = "idle" | "listening" | "ava-speaking";

export interface VoiceDeskState {
  phase: VoiceCallPhase;
  muted: boolean;
  elapsedSeconds: number;
  speakerState: SpeakerState;
  phoneStatus: CallPhoneStatus;
  audioLevels: number[];
  transcript: TranscriptEntry[];
  confirmation: CallConfirmationNotice | null;
  errorMessage: string | null;
  isPreview: boolean;
}

export const RESTING_AUDIO_LEVELS: number[] = Array.from({ length: 18 }, () => 0);

export const INITIAL_VOICE_STATE: VoiceDeskState = {
  phase: "idle",
  muted: false,
  elapsedSeconds: 0,
  speakerState: "idle",
  phoneStatus: { verified: false, pending: false, readback: null },
  audioLevels: RESTING_AUDIO_LEVELS,
  transcript: [],
  confirmation: null,
  errorMessage: null,
  isPreview: false,
};

export function formatCallDuration(totalSeconds: number): string {
  const safe = Math.max(0, Math.floor(totalSeconds));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export function formatClockTimestamp(date = new Date()): string {
  return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export function deriveDisplayPhase(
  phase: VoiceCallPhase,
  options: { voiceReady: boolean; hasHealth: boolean; backendError: string | null; isPreview: boolean }
): VoiceCallPhase {
  if (options.isPreview) return phase;
  if (phase === "idle" && options.hasHealth && !options.backendError && !options.voiceReady) {
    return "setup_needed";
  }
  if (phase === "setup_needed" && (options.voiceReady || options.backendError)) {
    return "idle";
  }
  return phase;
}

export function shouldIgnoreBotOutput(outputType?: string): boolean {
  return outputType === "word" || outputType === "token";
}

export interface IncomingTranscript {
  speaker: "ava" | "caller";
  text: string;
  final: boolean;
  timestamp?: string;
  segmentId?: string;
  id?: string;
}

export function upsertTranscriptEntry(
  entries: TranscriptEntry[],
  incoming: IncomingTranscript
): TranscriptEntry[] {
  const normalized = incoming.text.trim();
  if (!normalized) return entries;

  const timestamp = incoming.timestamp || formatClockTimestamp();

  // Bot output messages carry a segmentId across new / in_progress / completed updates.
  if (incoming.segmentId) {
    const existingIndex = entries.findIndex(
      (entry) => entry.speaker === incoming.speaker && entry.segmentId === incoming.segmentId
    );
    if (existingIndex >= 0) {
      const existing = entries[existingIndex];
      const next = [...entries];
      next[existingIndex] = {
        ...existing,
        text: normalized,
        final: incoming.final || existing.final,
      };
      return next;
    }
  }

  // Caller interim transcripts update the trailing pending caller turn in place.
  if (incoming.speaker === "caller" && entries.length > 0) {
    const lastIndex = entries.length - 1;
    const last = entries[lastIndex];
    if (last.speaker === "caller" && !last.final) {
      const next = [...entries];
      next[lastIndex] = {
        ...last,
        text: normalized,
        final: incoming.final,
        timestamp,
      };
      return next;
    }
  }

  // Avoid duplicate consecutive identical final turns (e.g. from redundant events).
  if (entries.length > 0) {
    const last = entries[entries.length - 1];
    if (
      last.speaker === incoming.speaker &&
      last.text === normalized &&
      (last.final || incoming.final)
    ) {
      if (last.final === incoming.final) return entries;
      const next = [...entries];
      next[next.length - 1] = { ...last, final: true };
      return next;
    }
  }

  const nextId =
    incoming.id ??
    (incoming.segmentId
      ? `${incoming.speaker}-${incoming.segmentId}`
      : `${incoming.speaker}-${Date.now()}-${entries.length}`);

  return [
    ...entries,
    {
      id: nextId,
      speaker: incoming.speaker,
      text: normalized,
      final: incoming.final,
      timestamp,
      segmentId: incoming.segmentId,
    },
  ];
}

export function parseAppointmentChangeMessage(data: unknown): CallConfirmationNotice | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  if (payload.type !== "havn_appointment_change") return null;
  const kind = payload.kind;
  if (kind !== "booked" && kind !== "cancelled") return null;
  const rawAppt = payload.appointment;
  if (!rawAppt || typeof rawAppt !== "object") return null;
  const appt = rawAppt as Record<string, unknown>;

  const reference = typeof appt.reference === "string" ? appt.reference : "";
  const doctorObj =
    appt.doctor && typeof appt.doctor === "object"
      ? (appt.doctor as Record<string, unknown>)
      : null;
  const doctorName =
    typeof appt.doctor_name === "string"
      ? appt.doctor_name
      : typeof appt.doctor === "string"
      ? appt.doctor
      : doctorObj && typeof doctorObj.name === "string"
      ? doctorObj.name
      : "";
  const patientName =
    typeof appt.patient_name === "string" && appt.patient_name.trim()
      ? appt.patient_name
      : "Caller";
  const label =
    typeof appt.slot_label === "string"
      ? appt.slot_label
      : typeof appt.label === "string"
      ? appt.label
      : "";

  if (!reference || !doctorName || !label) return null;

  return {
    kind,
    reference,
    doctorName,
    patientName,
    label,
  };
}

export function parsePhoneStatusMessage(data: unknown): CallPhoneStatus | null {
  if (!data || typeof data !== "object") return null;
  const payload = data as Record<string, unknown>;
  if (payload.type !== "havn_phone_status") return null;
  const rawPhone = payload.phone;
  if (!rawPhone || typeof rawPhone !== "object") return null;
  const phone = rawPhone as Record<string, unknown>;
  if (
    typeof phone.verified !== "boolean" ||
    typeof phone.pending !== "boolean"
  ) {
    return null;
  }
  return {
    verified: phone.verified,
    pending: phone.pending,
    readback: typeof phone.readback === "string" ? phone.readback : null,
  };
}

export function extractLatestCallSnapshot(calls: CallSessionRecord[]): {
  phoneStatus: CallPhoneStatus | null;
  confirmation: CallConfirmationNotice | null;
} {
  if (!calls.length) {
    return { phoneStatus: null, confirmation: null };
  }
  const latestCall = calls[calls.length - 1];
  let confirmation: CallConfirmationNotice | null = null;
  for (let i = latestCall.events.length - 1; i >= 0; i -= 1) {
    const evt = latestCall.events[i];
    if (evt.kind === "booked" || evt.kind === "cancelled") {
      const record = evt as Record<string, unknown>;
      confirmation = parseAppointmentChangeMessage({
        type: "havn_appointment_change",
        kind: evt.kind,
        appointment: record.appointment ?? record,
      });
      if (confirmation) break;
    }
  }
  return {
    phoneStatus: latestCall.phone,
    confirmation,
  };
}

export function formatVoiceErrorMessage(err: unknown): string {
  if (err && typeof err === "object") {
    const record = err as Record<string, unknown>;
    const type = typeof record.type === "string" ? record.type : "";
    const status = typeof record.status === "number" ? record.status : undefined;
    const message = typeof record.message === "string" ? record.message : "";

    if (type === "permissions") {
      return "Microphone permission was denied. Allow microphone access in your browser and try again.";
    }
    if (type === "not-found") {
      return "No microphone was found on this device. Connect a microphone and try again.";
    }
    if (type === "in-use") {
      return "Your microphone is currently in use by another application.";
    }
    if (type === "undefined-mediadevices") {
      return "Microphone capture is unavailable in this browser context. Use localhost or HTTPS.";
    }
    if (
      status === 503 ||
      message.includes("with status 503") ||
      message.includes("Voice is not configured")
    ) {
      return "Voice keys are not configured on the backend. Add ELEVENLABS_API_KEY and either GROQ_API_KEY or GOOGLE_API_KEY in .env.";
    }
    if (message.includes("503") || message.includes("UNAVAILABLE")) {
      return "The AI voice provider is temporarily busy. Please try again in a moment.";
    }
    if (message.includes("429") || message.includes("RESOURCE_EXHAUSTED")) {
      return "AI provider rate or quota limit reached. Wait briefly and try again, or switch GROQ_MODEL / GEMINI_MODEL in .env.";
    }
    if (status && status >= 400) {
      return `Unable to negotiate the voice session (HTTP ${status}). Verify the backend is running.`;
    }
    if (message.includes("paid_plan_required") || message.includes("402")) {
      return "Selected ElevenLabs voice requires a paid plan. Switch ELEVENLABS_VOICE_ID in .env (e.g. EXAVITQu4vr4xnSDxMaL).";
    }
    if (message.includes("no longer available") || message.includes("models/gemini")) {
      return "Configured Gemini model was rejected by Google API. Update GEMINI_MODEL in .env (e.g. gemini-3-flash-preview) and restart the backend.";
    }
    if (message.trim()) {
      return message.trim();
    }
  }
  if (typeof err === "string" && err.trim()) {
    return err.trim();
  }
  return "The voice connection closed unexpectedly. Please try again.";
}
