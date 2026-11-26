import type {
  CallsResponse,
  DashboardResponse,
  HealthResponse,
} from "@/lib/types";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:7860"
).replace(/\/+$/, "");

export class ApiError extends Error {
  status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

async function requestJson<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers || {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    let detail = `Request failed (${response.status})`;
    try {
      const payload = (await response.json()) as { detail?: string };
      if (payload?.detail) {
        detail = payload.detail;
      }
    } catch {
      // Ignore JSON parsing failure on non-JSON error responses.
    }
    throw new ApiError(detail, response.status);
  }

  return (await response.json()) as T;
}

export function fetchHealth(): Promise<HealthResponse> {
  return requestJson<HealthResponse>("/api/health");
}

export function fetchDashboard(): Promise<DashboardResponse> {
  return requestJson<DashboardResponse>("/api/dashboard");
}

export function fetchCalls(): Promise<CallsResponse> {
  return requestJson<CallsResponse>("/api/calls");
}

export function resetDemo(): Promise<{ ok: boolean; message: string }> {
  return requestJson<{ ok: boolean; message: string }>("/api/demo/reset", {
    method: "POST",
  });
}
