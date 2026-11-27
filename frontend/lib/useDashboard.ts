"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchDashboard, fetchHealth, resetDemo } from "@/lib/api";
import type {
  AppointmentStatus,
  DashboardResponse,
  HealthResponse,
} from "@/lib/types";

const IDLE_POLL_MS = 8000;
const ACTIVE_CALL_POLL_MS = 2000;
const HIGHLIGHT_MS = 2400;

export interface HighlightMap {
  [appointmentId: string]: AppointmentStatus;
}

export function useDashboard(isCallActive: boolean) {
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetting, setResetting] = useState(false);
  const [highlights, setHighlights] = useState<HighlightMap>({});

  const hasLoadedRef = useRef(false);
  const previousStatusesRef = useRef<Map<string, AppointmentStatus> | null>(
    null
  );
  const highlightTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map()
  );

  const scheduleHighlight = useCallback(
    (id: string, status: AppointmentStatus) => {
      const existingTimer = highlightTimersRef.current.get(id);
      if (existingTimer) {
        clearTimeout(existingTimer);
      }
      setHighlights((prev) => ({ ...prev, [id]: status }));
      const timer = setTimeout(() => {
        setHighlights((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
        highlightTimersRef.current.delete(id);
      }, HIGHLIGHT_MS);
      highlightTimersRef.current.set(id, timer);
    },
    []
  );

  const refresh = useCallback(
    async (silent = true) => {
      if (!silent) {
        if (!hasLoadedRef.current) {
          setLoading(true);
        } else {
          setRetrying(true);
        }
        if (hasLoadedRef.current || error !== null) {
          setRetrying(true);
        }
      }
      try {
        const [dashData, healthData] = await Promise.all([
          fetchDashboard(),
          fetchHealth(),
        ]);

        const nextMap = new Map<string, AppointmentStatus>();
        for (const appt of dashData.appointments) {
          nextMap.set(appt.id, appt.status);
        }

        if (previousStatusesRef.current !== null) {
          for (const appt of dashData.appointments) {
            const prior = previousStatusesRef.current.get(appt.id);
            if (!prior && appt.status === "booked") {
              scheduleHighlight(appt.id, "booked");
            } else if (prior === "booked" && appt.status === "cancelled") {
              scheduleHighlight(appt.id, "cancelled");
            }
          }
        }
        previousStatusesRef.current = nextMap;
        hasLoadedRef.current = true;

        setDashboard(dashData);
        setHealth(healthData);
        setError(null);
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Unable to reach the Havn clinic backend.";
        setError(message);
      } finally {
        setLoading(false);
        setRetrying(false);
      }
    },
    [error, scheduleHighlight]
  );

  useEffect(() => {
    void refresh(false);
  }, []);

  useEffect(() => {
    const intervalMs = isCallActive ? ACTIVE_CALL_POLL_MS : IDLE_POLL_MS;
    const id = setInterval(() => {
      void refresh(true);
    }, intervalMs);
    return () => clearInterval(id);
  }, [isCallActive, refresh]);

  useEffect(() => {
    return () => {
      for (const timer of highlightTimersRef.current.values()) {
        clearTimeout(timer);
      }
      highlightTimersRef.current.clear();
    };
  }, []);

  const handleResetDemo = useCallback(async () => {
    setResetting(true);
    try {
      const res = await resetDemo();
      previousStatusesRef.current = null;
      await refresh(true);
      return { ok: true as const, message: res.message };
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not reset demo data.";
      return { ok: false as const, message };
    } finally {
      setResetting(false);
    }
  }, [refresh]);

  return {
    dashboard,
    health,
    loading,
    retrying,
    error,
    resetting,
    highlights,
    refresh,
    resetDemo: handleResetDemo,
  };
}
