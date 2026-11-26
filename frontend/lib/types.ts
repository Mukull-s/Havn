export type WorkspaceTab = "overview" | "appointments" | "doctors" | "activity";

export type AppointmentStatus = "booked" | "cancelled";

export interface Slot {
  id: string;
  starts_at: string;
  duration_minutes: number;
  date: string;
  date_label: string;
  time_label: string;
  label: string;
}

export interface DoctorSummary {
  id: string;
  name: string;
  specialty: string;
  credentials: string;
  room: string;
  accent: string;
  bio: string;
}

export interface Doctor extends DoctorSummary {
  initials: string;
  availability: Slot[];
  available_count: number;
  next_available: Slot | null;
}

export interface Appointment {
  id: string;
  reference: string;
  patient_name: string;
  phone_masked: string;
  status: AppointmentStatus;
  doctor: DoctorSummary;
  slot: Slot;
  starts_at: string;
  date_label: string;
  time_label: string;
  label: string;
  created_at: string;
  cancelled_at: string | null;
}

export interface ActivityItem {
  id: number;
  kind: "booked" | "cancelled" | string;
  patient_name: string | null;
  detail: string;
  created_at: string;
  time_label: string;
}

export interface DashboardStats {
  doctors: number;
  available_slots: number;
  upcoming_appointments: number;
  cancelled_today: number;
}

export interface ClinicInfo {
  name: string;
  timezone: string;
  today: string;
}

export interface DashboardResponse {
  generated_at: string;
  clinic: ClinicInfo;
  doctors: Doctor[];
  appointments: Appointment[];
  activity: ActivityItem[];
  stats: DashboardStats;
}

export interface HealthResponse {
  ok: boolean;
  service: string;
  voice: {
    ready: boolean;
    stt: string | null;
    tts: string | null;
    llm: string | null;
    model: string;
  };
  clinic: {
    name: string;
    timezone: string;
  };
  active_calls: number;
}

export interface CallPhoneStatus {
  verified: boolean;
  pending: boolean;
  readback: string | null;
}

export interface CallSessionRecord {
  session_id: string;
  started_at: string;
  phone: CallPhoneStatus;
  events: Array<{
    kind: string;
    at: string;
    appointment_id?: string;
    reference?: string;
    doctor?: string;
    label?: string;
  }>;
}

export interface CallsResponse {
  calls: CallSessionRecord[];
}

export type VoiceCallPhase =
  | "idle"
  | "setup_needed"
  | "connecting"
  | "connected"
  | "ending"
  | "ended"
  | "error";

export interface TranscriptEntry {
  id: string;
  speaker: "ava" | "caller";
  text: string;
  final: boolean;
  timestamp: string;
  segmentId?: string;
}

export interface CallConfirmationNotice {
  kind: "booked" | "cancelled";
  reference: string;
  doctorName: string;
  patientName: string;
  label: string;
}
