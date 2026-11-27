import assert from "node:assert/strict";
import test from "node:test";
import {
  deriveDisplayPhase,
  extractLatestCallSnapshot,
  formatCallDuration,
  formatVoiceErrorMessage,
  parseAppointmentChangeMessage,
  parsePhoneStatusMessage,
  shouldIgnoreBotOutput,
  upsertTranscriptEntry,
} from "../lib/voiceReducer.ts";
import type { CallSessionRecord, TranscriptEntry } from "../lib/types.ts";

test("deriveDisplayPhase transitions cleanly between setup_needed and idle", () => {
  assert.equal(
    deriveDisplayPhase("idle", {
      voiceReady: false,
      hasHealth: true,
      backendError: null,
      isPreview: false,
    }),
    "setup_needed"
  );

  assert.equal(
    deriveDisplayPhase("setup_needed", {
      voiceReady: true,
      hasHealth: true,
      backendError: null,
      isPreview: false,
    }),
    "idle"
  );

  assert.equal(
    deriveDisplayPhase("connected", {
      voiceReady: false,
      hasHealth: true,
      backendError: null,
      isPreview: false,
    }),
    "connected"
  );
});

test("upsertTranscriptEntry replaces caller interim turns and updates Ava segments in place", () => {
  let entries: TranscriptEntry[] = [];

  // Empty/whitespace turns are ignored
  entries = upsertTranscriptEntry(entries, {
    speaker: "caller",
    text: "   ",
    final: false,
    timestamp: "10:00 AM",
  });
  assert.equal(entries.length, 0);

  // Interim caller turn followed by finalized caller turn updates in place
  entries = upsertTranscriptEntry(entries, {
    speaker: "caller",
    text: "Hi I need",
    final: false,
    timestamp: "10:01 AM",
  });
  entries = upsertTranscriptEntry(entries, {
    speaker: "caller",
    text: "Hi I need to book with Dr. Iyer",
    final: true,
    timestamp: "10:01 AM",
  });
  assert.equal(entries.length, 1);
  assert.equal(entries[0].final, true);
  assert.equal(entries[0].text, "Hi I need to book with Dr. Iyer");

  // Streaming Ava segment_id updates without duplicating
  entries = upsertTranscriptEntry(entries, {
    speaker: "ava",
    text: "Dr. Meera Iyer has 9:30 AM open.",
    final: false,
    segmentId: "seg-42",
    timestamp: "10:01 AM",
  });
  entries = upsertTranscriptEntry(entries, {
    speaker: "ava",
    text: "Dr. Meera Iyer has 9:30 AM open.",
    final: true,
    segmentId: "seg-42",
    timestamp: "10:01 AM",
  });
  assert.equal(entries.length, 2);
  assert.equal(entries[1].final, true);
  assert.equal(entries[1].segmentId, "seg-42");
});

test("parseAppointmentChangeMessage and extractLatestCallSnapshot extract genuine confirmations only", () => {
  assert.equal(parseAppointmentChangeMessage(null), null);
  assert.equal(parseAppointmentChangeMessage({ type: "other" }), null);
  assert.equal(
    parseAppointmentChangeMessage({
      type: "havn_appointment_change",
      kind: "booked",
      appointment: { reference: "HVN-1" },
    }),
    null
  );

  const valid = parseAppointmentChangeMessage({
    type: "havn_appointment_change",
    kind: "booked",
    appointment: {
      reference: "HVN-9X2A",
      doctor: { name: "Dr. Meera Iyer", specialty: "Dermatology" },
      patient_name: "Ananya Rao",
      label: "Thu, 26 Nov at 9:30 AM",
    },
  });
  assert.deepEqual(valid, {
    kind: "booked",
    reference: "HVN-9X2A",
    doctorName: "Dr. Meera Iyer",
    patientName: "Ananya Rao",
    label: "Thu, 26 Nov at 9:30 AM",
  });

  const phoneNotice = parsePhoneStatusMessage({
    type: "havn_phone_status",
    phone: { verified: true, pending: false, readback: "+91 98765 43210" },
  });
  assert.deepEqual(phoneNotice, {
    verified: true,
    pending: false,
    readback: "+91 98765 43210",
  });
  assert.equal(parsePhoneStatusMessage({ type: "other" }), null);

  const calls: CallSessionRecord[] = [
    {
      session_id: "call_123",
      started_at: "2026-11-25T10:00:00+00:00",
      phone: { verified: true, pending: false, readback: "+91 98765 43210" },
      events: [
        {
          kind: "cancelled",
          at: "2026-11-25T10:01:00+00:00",
          reference: "HVN-7K2M",
          doctor: "Dr. Rohan Kapoor",
          label: "Fri, 27 Nov at 11:00 AM",
        },
      ],
    },
  ];
  const snapshot = extractLatestCallSnapshot(calls);
  assert.equal(snapshot.phoneStatus?.verified, true);
  assert.equal(snapshot.confirmation?.kind, "cancelled");
  assert.equal(snapshot.confirmation?.reference, "HVN-7K2M");
  assert.equal(snapshot.confirmation?.doctorName, "Dr. Rohan Kapoor");
});

test("formatVoiceErrorMessage maps device errors, 503s, and generic errors calmly", () => {
  assert.match(
    formatVoiceErrorMessage({ type: "permissions", message: "Permission denied" }),
    /Microphone permission was denied/
  );
  assert.match(
    formatVoiceErrorMessage({ type: "not-found", message: "Requested device not found" }),
    /No microphone was found/
  );
  assert.match(
    formatVoiceErrorMessage({ status: 503, message: "WebRTC offer rejected with status 503" }),
    /ELEVENLABS_API_KEY/
  );
  assert.match(
    formatVoiceErrorMessage({ message: '{"code":"paid_plan_required","status":402}' }),
    /EXAVITQu4vr4xnSDxMaL/
  );
  assert.match(
    formatVoiceErrorMessage({ message: "This model models/gemini-2.5-flash is no longer available" }),
    /gemini-3-flash-preview/
  );
  assert.match(
    formatVoiceErrorMessage({ message: "503 UNAVAILABLE upstream model overloaded" }),
    /temporarily busy/
  );
  assert.match(
    formatVoiceErrorMessage({ message: "429 RESOURCE_EXHAUSTED quota exceeded" }),
    /rate or quota limit reached/
  );
});

test("shouldIgnoreBotOutput skips word and token updates so sentence transcripts stay intact", () => {
  assert.equal(shouldIgnoreBotOutput("word"), true);
  assert.equal(shouldIgnoreBotOutput("token"), true);
  assert.equal(shouldIgnoreBotOutput("sentence"), false);
  assert.equal(shouldIgnoreBotOutput(undefined), false);
});

test("formatCallDuration pads minutes and seconds deterministically", () => {
  assert.equal(formatCallDuration(0), "00:00");
  assert.equal(formatCallDuration(65), "01:05");
  assert.equal(formatCallDuration(-3), "00:00");
});
