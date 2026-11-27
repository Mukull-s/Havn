"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  PipecatClient,
  type BotOutputData,
  type DeviceError,
  type Participant,
  type RTVIMessage,
  type TransportState,
  type UserInputData,
} from "@pipecat-ai/client-js";
import { SmallWebRTCTransport } from "@pipecat-ai/small-webrtc-transport";
import { API_BASE_URL } from "@/lib/api";
import type {
  CallConfirmationNotice,
  CallSessionRecord,
  VoiceCallPhase,
} from "@/lib/types";
import {
  deriveDisplayPhase,
  extractLatestCallSnapshot,
  formatClockTimestamp,
  formatVoiceErrorMessage,
  INITIAL_VOICE_STATE,
  parseAppointmentChangeMessage,
  parsePhoneStatusMessage,
  RESTING_AUDIO_LEVELS,
  shouldIgnoreBotOutput,
  upsertTranscriptEntry,
  type VoiceDeskState,
} from "@/lib/voiceReducer";

const CONNECT_TIMEOUT_MS = 25_000;
const BAR_COUNT = 18;

interface UseVoiceCallOptions {
  voiceReady: boolean;
  hasHealth: boolean;
  backendError: string | null;
  activeCalls: CallSessionRecord[];
  enabled: boolean;
  onRefreshDashboard: () => void | Promise<void>;
  onSyncCalls: () => void | Promise<void>;
  onAppointmentChange?: (notice: CallConfirmationNotice) => void;
}

function sampleFrequencyBins(analyser: AnalyserNode): number[] {
  const data = new Uint8Array(analyser.frequencyBinCount);
  analyser.getByteFrequencyData(data);
  if (data.length === 0) return RESTING_AUDIO_LEVELS;

  const usableBins = Math.max(1, Math.floor(data.length * 0.75));
  const step = Math.max(1, Math.floor(usableBins / BAR_COUNT));
  const bars: number[] = [];

  for (let i = 0; i < BAR_COUNT; i += 1) {
    const start = Math.min(usableBins - 1, i * step);
    const end = Math.min(usableBins, start + step);
    let peak = 0;
    for (let j = start; j < end; j += 1) {
      if (data[j] > peak) peak = data[j];
    }
    bars.push(Math.min(1, peak / 210));
  }
  return bars;
}

export function useVoiceCall({
  voiceReady,
  hasHealth,
  backendError,
  activeCalls,
  enabled,
  onRefreshDashboard,
  onSyncCalls,
  onAppointmentChange,
}: UseVoiceCallOptions) {
  const [state, setState] = useState<VoiceDeskState>(INITIAL_VOICE_STATE);

  const clientRef = useRef<PipecatClient | null>(null);
  const phaseRef = useRef<VoiceCallPhase>("idle");
  const speakerRef = useRef<VoiceDeskState["speakerState"]>("idle");
  const mutedRef = useRef(false);
  const manualCancelRef = useRef(false);
  const lastConfirmationRef = useRef<string | null>(null);
  const callbacksRef = useRef({
    onRefreshDashboard,
    onSyncCalls,
    onAppointmentChange,
  });

  useEffect(() => {
    callbacksRef.current = {
      onRefreshDashboard,
      onSyncCalls,
      onAppointmentChange,
    };
  }, [onRefreshDashboard, onSyncCalls, onAppointmentChange]);

  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const ringIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rafRef = useRef<number | null>(null);

  const audioElRef = useRef<HTMLAudioElement | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const remoteAnalyserRef = useRef<AnalyserNode | null>(null);
  const localAnalyserRef = useRef<AnalyserNode | null>(null);
  const remoteSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const localSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

  const setPhaseSafe = useCallback((nextPhase: VoiceCallPhase) => {
    phaseRef.current = nextPhase;
    setState((prev) => ({ ...prev, phase: nextPhase }));
  }, []);

  const stopRingTone = useCallback(() => {
    if (ringIntervalRef.current) {
      clearInterval(ringIntervalRef.current);
      ringIntervalRef.current = null;
    }
  }, []);

  const clearTimers = useCallback(() => {
    stopRingTone();
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current);
      connectTimeoutRef.current = null;
    }
    if (durationTimerRef.current) {
      clearInterval(durationTimerRef.current);
      durationTimerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, [stopRingTone]);

  const cleanupMedia = useCallback(
    async (deferAudioClose = false) => {
      clearTimers();

      try {
        remoteSourceRef.current?.disconnect();
      } catch {
        // Ignore already-disconnected audio nodes.
      }
      remoteSourceRef.current = null;
      remoteAnalyserRef.current = null;

      try {
        localSourceRef.current?.disconnect();
      } catch {
        // Ignore already-disconnected audio nodes.
      }
      localSourceRef.current = null;
      localAnalyserRef.current = null;

      if (audioElRef.current) {
        audioElRef.current.pause();
        audioElRef.current.srcObject = null;
        audioElRef.current.remove();
        audioElRef.current = null;
      }

      if (audioCtxRef.current) {
        const ctx = audioCtxRef.current;
        audioCtxRef.current = null;
        if (deferAudioClose) {
          setTimeout(() => {
            void ctx.close().catch(() => { });
          }, 260);
        } else {
          try {
            await ctx.close();
          } catch {
            // Ignore close errors if context was already closed.
          }
        }
      }
    },
    [clearTimers]
  );

  const disposeClient = useCallback(
    async (deferAudioClose = false) => {
      const client = clientRef.current;
      clientRef.current = null;
      if (client) {
        try {
          await client.disconnect();
        } catch {
          // Ignore disconnect errors while cleaning up.
        }
      }
      await cleanupMedia(deferAudioClose);
    },
    [cleanupMedia]
  );

  const ensureAudioContext = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (audioCtxRef.current) {
      if (audioCtxRef.current.state === "suspended") {
        void audioCtxRef.current.resume().catch(() => { });
      }
      return audioCtxRef.current;
    }
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    try {
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      return ctx;
    } catch {
      return null;
    }
  }, []);

  const playRingBurst = useCallback(() => {
    const ctx = ensureAudioContext();
    if (!ctx || phaseRef.current !== "connecting") return;
    try {
      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(0.022, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.34);
      gain.connect(ctx.destination);

      for (const freq of [440, 480]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(freq, now);
        osc.connect(gain);
        osc.start(now);
        osc.stop(now + 0.36);
      }
    } catch {
      // Non-fatal if browser audio output is blocked.
    }
  }, [ensureAudioContext]);

  const startRingTone = useCallback(() => {
    stopRingTone();
    playRingBurst();
    ringIntervalRef.current = setInterval(() => {
      if (phaseRef.current !== "connecting") {
        stopRingTone();
        return;
      }
      playRingBurst();
    }, 2200);
  }, [playRingBurst, stopRingTone]);

  const playEndTone = useCallback(() => {
    const ctx = audioCtxRef.current;
    if (!ctx) return;
    try {
      const now = ctx.currentTime;
      const notes = [
        { freq: 480, start: 0, len: 0.09 },
        { freq: 360, start: 0.095, len: 0.13 },
      ];
      for (const note of notes) {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now + note.start);
        gain.gain.exponentialRampToValueAtTime(0.026, now + note.start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + note.start + note.len);
        gain.connect(ctx.destination);

        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.setValueAtTime(note.freq, now + note.start);
        osc.connect(gain);
        osc.start(now + note.start);
        osc.stop(now + note.start + note.len + 0.01);
      }
    } catch {
      // Ignore tone playback errors.
    }
  }, []);

  const attachTrackAnalyser = useCallback(
    (track: MediaStreamTrack, isLocal: boolean) => {
      const ctx = ensureAudioContext();
      if (!ctx) return;
      try {
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.7;
        const source = ctx.createMediaStreamSource(new MediaStream([track]));
        source.connect(analyser);

        if (isLocal) {
          localSourceRef.current?.disconnect();
          localSourceRef.current = source;
          localAnalyserRef.current = analyser;
        } else {
          remoteSourceRef.current?.disconnect();
          remoteSourceRef.current = source;
          remoteAnalyserRef.current = analyser;
        }
      } catch {
        // Non-fatal: waveform stays flat if browser blocks Web Audio analysis.
      }
    },
    [ensureAudioContext]
  );

  const attachRemoteAudioPlayback = useCallback(
    (track: MediaStreamTrack) => {
      if (typeof document === "undefined") return;
      if (!audioElRef.current) {
        const audio = document.createElement("audio");
        audio.autoplay = true;
        audio.muted = false;
        audio.volume = 1;
        audio.setAttribute("playsinline", "true");
        audio.style.display = "none";
        document.body.appendChild(audio);
        audioElRef.current = audio;
      }
      audioElRef.current.muted = false;
      audioElRef.current.volume = 1;
      audioElRef.current.srcObject = new MediaStream([track]);
      void audioElRef.current.play().catch(() => {
        // Browser autoplay guard if triggered asynchronously; user click unlocks normally.
      });
      attachTrackAnalyser(track, false);
    },
    [attachTrackAnalyser]
  );

  const handleConfirmation = useCallback((notice: CallConfirmationNotice) => {
    const key = `${notice.kind}:${notice.reference}`;
    if (lastConfirmationRef.current === key) return;
    lastConfirmationRef.current = key;
    setState((prev) => ({ ...prev, confirmation: notice }));
    callbacksRef.current.onAppointmentChange?.(notice);
    void callbacksRef.current.onRefreshDashboard();
    void callbacksRef.current.onSyncCalls();
  }, []);

  // Fallback sync from /api/calls when only one call is active
  useEffect(() => {
    if (!enabled) return;
    if (phaseRef.current !== "connected" && phaseRef.current !== "ending") {
      return;
    }
    if (activeCalls.length > 1) {
      return;
    }
    const snapshot = extractLatestCallSnapshot(activeCalls);
    const nextPhone = snapshot.phoneStatus;
    if (nextPhone) {
      setState((prev) => {
        if (
          prev.phoneStatus.verified === nextPhone.verified &&
          prev.phoneStatus.pending === nextPhone.pending &&
          prev.phoneStatus.readback === nextPhone.readback
        ) {
          return prev;
        }
        return {
          ...prev,
          phoneStatus: nextPhone,
        };
      });
    }
    if (snapshot.confirmation) {
      handleConfirmation(snapshot.confirmation);
    }
  }, [activeCalls, enabled, handleConfirmation]);

  // Real audio frequency sampler & call duration timer while connected
  useEffect(() => {
    if (!enabled || state.phase !== "connected") {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    durationTimerRef.current = setInterval(() => {
      setState((prev) => ({
        ...prev,
        elapsedSeconds: prev.elapsedSeconds + 1,
      }));
    }, 1000);

    const reducedMotion =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;

    if (!reducedMotion) {
      let lastSampleMs = 0;
      const tick = (now: number) => {
        if (phaseRef.current !== "connected") return;
        if (now - lastSampleMs >= 60) {
          lastSampleMs = now;
          const activeAnalyser =
            speakerRef.current === "ava-speaking"
              ? remoteAnalyserRef.current
              : mutedRef.current
                ? null
                : localAnalyserRef.current;

          const levels = activeAnalyser
            ? sampleFrequencyBins(activeAnalyser)
            : RESTING_AUDIO_LEVELS;

          setState((prev) => ({ ...prev, audioLevels: levels }));
        }
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    }

    return () => {
      if (durationTimerRef.current) {
        clearInterval(durationTimerRef.current);
        durationTimerRef.current = null;
      }
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
  }, [enabled, state.phase]);

  // Clean teardown when workspace unmounts
  useEffect(() => {
    return () => {
      void disposeClient();
    };
  }, [disposeClient]);

  const startCall = useCallback(async () => {
    if (!enabled) return;
    if (
      phaseRef.current === "connecting" ||
      phaseRef.current === "connected" ||
      phaseRef.current === "ending"
    ) {
      return;
    }
    if (!voiceReady) {
      setPhaseSafe("setup_needed");
      return;
    }

    manualCancelRef.current = false;
    lastConfirmationRef.current = null;
    speakerRef.current = "idle";
    mutedRef.current = false;
    phaseRef.current = "connecting";

    setState({
      ...INITIAL_VOICE_STATE,
      phase: "connecting",
    });

    // Unlock audio output, play ringback while connecting, and prepare audio element.
    ensureAudioContext();
    startRingTone();
    if (typeof document !== "undefined" && !audioElRef.current) {
      const audio = document.createElement("audio");
      audio.autoplay = true;
      audio.setAttribute("playsinline", "true");
      audio.style.display = "none";
      document.body.appendChild(audio);
      audioElRef.current = audio;
    }

    const transport = new SmallWebRTCTransport({
      webrtcRequestParams: {
        endpoint: `${API_BASE_URL}/api/offer`,
      },
    });

    const handleFailure = async (message: string) => {
      if (manualCancelRef.current) return;
      await disposeClient();
      speakerRef.current = "idle";
      phaseRef.current = "error";
      setState((prev) => ({
        ...prev,
        phase: "error",
        speakerState: "idle",
        audioLevels: RESTING_AUDIO_LEVELS,
        errorMessage: message,
      }));
    };

    const client = new PipecatClient({
      transport,
      enableMic: true,
      enableCam: false,
      callbacks: {
        onTransportStateChanged: (transportState: TransportState) => {
          if (transportState === "connected" && phaseRef.current === "connecting") {
            void callbacksRef.current.onSyncCalls();
          }
        },
        onBotReady: () => {
          if (manualCancelRef.current) return;
          stopRingTone();
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
          phaseRef.current = "connected";
          speakerRef.current = "listening";
          setState((prev) => ({
            ...prev,
            phase: "connected",
            speakerState: "listening",
            errorMessage: null,
          }));
          try {
            const localAudio = client.tracks()?.local?.audio;
            if (localAudio) {
              attachTrackAnalyser(localAudio, true);
            }
          } catch {
            // Track analyser attaches via onTrackStarted if tracks() is unavailable.
          }
          void callbacksRef.current.onSyncCalls();
        },
        onConnected: () => {
          if (manualCancelRef.current) return;
          stopRingTone();
          if (connectTimeoutRef.current) {
            clearTimeout(connectTimeoutRef.current);
            connectTimeoutRef.current = null;
          }
          if (phaseRef.current === "connecting") {
            phaseRef.current = "connected";
            speakerRef.current = "listening";
            setState((prev) => ({
              ...prev,
              phase: "connected",
              speakerState: "listening",
              errorMessage: null,
            }));
          }
          void callbacksRef.current.onSyncCalls();
        },
        onDisconnected: () => {
          if (manualCancelRef.current) return;
          const wasConnected = phaseRef.current === "connected";
          if (wasConnected) {
            playEndTone();
          }
          void cleanupMedia(wasConnected);
          clientRef.current = null;
          speakerRef.current = "idle";
          const nextPhase: VoiceCallPhase = wasConnected ? "ended" : "error";
          phaseRef.current = nextPhase;
          setState((prev) => ({
            ...prev,
            phase: nextPhase,
            speakerState: "idle",
            audioLevels: RESTING_AUDIO_LEVELS,
            errorMessage:
              nextPhase === "error" && !prev.errorMessage
                ? "Voice connection ended before Ava joined."
                : prev.errorMessage,
          }));
          void callbacksRef.current.onRefreshDashboard();
          void callbacksRef.current.onSyncCalls();
        },
        onTrackStarted: (track: MediaStreamTrack, participant?: Participant) => {
          if (track.kind !== "audio") return;
          if (participant?.local) {
            attachTrackAnalyser(track, true);
          } else {
            attachRemoteAudioPlayback(track);
          }
        },
        onBotStartedSpeaking: () => {
          speakerRef.current = "ava-speaking";
          setState((prev) => ({ ...prev, speakerState: "ava-speaking" }));
        },
        onBotStoppedSpeaking: () => {
          speakerRef.current = "listening";
          setState((prev) => ({ ...prev, speakerState: "listening" }));
          void callbacksRef.current.onSyncCalls();
        },
        onBotInterrupted: () => {
          speakerRef.current = "listening";
          setState((prev) => ({ ...prev, speakerState: "listening" }));
        },
        onUserStartedSpeaking: () => {
          if (speakerRef.current !== "ava-speaking") {
            speakerRef.current = "listening";
            setState((prev) => ({ ...prev, speakerState: "listening" }));
          }
        },
        onUserInput: (data: UserInputData) => {
          setState((prev) => ({
            ...prev,
            transcript: upsertTranscriptEntry(prev.transcript, {
              speaker: "caller",
              text: data.text,
              final: Boolean(data.final),
              timestamp: formatClockTimestamp(),
            }),
          }));
          if (data.final) {
            void callbacksRef.current.onSyncCalls();
          }
        },
        onBotOutput: (data: BotOutputData) => {
          if (shouldIgnoreBotOutput(data.output_type)) {
            return;
          }
          const isFinal =
            data.spoken_status === "completed" ||
            data.will_be_spoken === false ||
            data.output_type === "sentence";
          setState((prev) => ({
            ...prev,
            transcript: upsertTranscriptEntry(prev.transcript, {
              speaker: "ava",
              text: data.text,
              final: isFinal,
              segmentId:
                data.segment_id !== undefined ? String(data.segment_id) : undefined,
              timestamp: formatClockTimestamp(),
            }),
          }));
          if (isFinal) {
            void callbacksRef.current.onSyncCalls();
          }
        },
        onServerMessage: (data: unknown) => {
          const phoneStatus = parsePhoneStatusMessage(data);
          if (phoneStatus) {
            setState((prev) => ({
              ...prev,
              phoneStatus,
            }));
          }
          const notice = parseAppointmentChangeMessage(data);
          if (notice) {
            handleConfirmation(notice);
          }
        },
        onDeviceError: (error: DeviceError) => {
          void handleFailure(formatVoiceErrorMessage(error));
        },
        onError: (message: RTVIMessage) => {
          const errData = message.data as Record<string, unknown> | undefined;
          const text =
            typeof errData?.message === "string"
              ? errData.message
              : typeof errData?.error === "string"
                ? errData.error
                : "The voice assistant reported an error.";
          void handleFailure(formatVoiceErrorMessage({ message: text }));
        },
      },
    });

    clientRef.current = client;

    connectTimeoutRef.current = setTimeout(() => {
      if (phaseRef.current === "connecting") {
        void handleFailure(
          "Timed out waiting for the WebRTC connection to establish. Ensure the backend is running."
        );
      }
    }, CONNECT_TIMEOUT_MS);

    try {
      await client.initDevices();
      if (manualCancelRef.current || clientRef.current !== client) return;
      await client.connect();
    } catch (err) {
      if (!manualCancelRef.current && clientRef.current === client) {
        await handleFailure(formatVoiceErrorMessage(err));
      }
    }
  }, [
    attachRemoteAudioPlayback,
    attachTrackAnalyser,
    cleanupMedia,
    disposeClient,
    enabled,
    ensureAudioContext,
    handleConfirmation,
    playEndTone,
    setPhaseSafe,
    startRingTone,
    stopRingTone,
    voiceReady,
  ]);

  const endCall = useCallback(async () => {
    const current = phaseRef.current;
    if (
      current !== "connecting" &&
      current !== "connected"
    ) {
      return;
    }

    manualCancelRef.current = true;
    const wasConnected = current === "connected";
    stopRingTone();
    if (wasConnected) {
      playEndTone();
    }
    phaseRef.current = "ending";
    speakerRef.current = "idle";

    setState((prev) => ({
      ...prev,
      phase: "ending",
      speakerState: "idle",
      audioLevels: RESTING_AUDIO_LEVELS,
    }));

    await disposeClient(wasConnected);

    const finalPhase: VoiceCallPhase = wasConnected ? "ended" : "idle";
    phaseRef.current = finalPhase;
    setState((prev) => ({
      ...(finalPhase === "idle" ? INITIAL_VOICE_STATE : prev),
      phase: finalPhase,
      speakerState: "idle",
      audioLevels: RESTING_AUDIO_LEVELS,
    }));

    void callbacksRef.current.onRefreshDashboard();
    void callbacksRef.current.onSyncCalls();
  }, [disposeClient, playEndTone, stopRingTone]);

  const toggleMute = useCallback(() => {
    const client = clientRef.current;
    if (!client || phaseRef.current !== "connected") return;
    const nextMuted = !mutedRef.current;
    mutedRef.current = nextMuted;
    client.enableMic(!nextMuted);
    setState((prev) => ({
      ...prev,
      muted: nextMuted,
      audioLevels: nextMuted ? RESTING_AUDIO_LEVELS : prev.audioLevels,
    }));
  }, []);

  const resetCall = useCallback(() => {
    if (phaseRef.current === "connecting" || phaseRef.current === "connected") {
      return;
    }
    phaseRef.current = "idle";
    speakerRef.current = "idle";
    mutedRef.current = false;
    lastConfirmationRef.current = null;
    setState(INITIAL_VOICE_STATE);
  }, []);

  const displayPhase = deriveDisplayPhase(state.phase, {
    voiceReady,
    hasHealth,
    backendError,
    isPreview: !enabled,
  });

  return {
    voiceState: {
      ...state,
      phase: displayPhase,
    },
    startCall,
    endCall,
    toggleMute,
    resetCall,
  };
}
