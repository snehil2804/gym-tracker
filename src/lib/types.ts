// Row types mirroring the Supabase schema (supabase/migrations).
// Money is integer paise; dates are 'YYYY-MM-DD' strings in the user's local calendar.

export type GymStatus = "attended" | "absent" | "rest" | "unverified";
export type PtStatus =
  | "completed"
  | "chargeable_absence"
  | "missed_unconfirmed"
  | "trainer_cancelled"
  | "client_cancelled"
  | "rescheduled"
  | "not_scheduled"
  | "unverified";
export type AbsenceReason = "work" | "illness" | "travel" | "tired" | "personal" | "other";
export type LedgerKind =
  | "completed"
  | "forfeited"
  | "credit"
  | "refund"
  | "expired"
  | "transfer_in"
  | "transfer_out"
  | "adjustment";
export type PackageStatus = "active" | "completed" | "closed" | "cancelled";
export type UnusedTreatment = "undecided" | "still_usable" | "rolled_over" | "forfeited" | "refunded";
export type BlockKind = "vacation" | "rest" | "trainer_unavailable" | "holiday" | "pause";

export interface Reminders {
  upcoming_session: boolean;
  package_exhaustion: boolean;
  package_expiry: boolean;
  membership_expiry: boolean;
  pending_payments: boolean;
  attendance_confirmation: boolean;
  weekly_review: boolean;
}

export interface Profile {
  id: string;
  display_name: string | null;
  timezone: string;
  currency: string;
  date_format: string;
  theme: "system" | "light" | "dark";
  weekly_workout_goal: number;
  renewal_warning_days: number;
  membership_warning_days: number;
  reminders: Reminders;
  tracking_start_date: string | null;
  seeded_at: string | null;
  onboarded_at: string | null;
  pt_enabled: boolean;
  membership_enabled: boolean;
  birth_date: string | null;
  height_cm: number | null;
  avatar_path: string | null;
}

export interface Membership {
  id: string;
  gym_name: string;
  start_date: string;
  duration_months: number;
  estimated_end_date: string;
  confirmed_end_date: string | null;
  price_paise: number;
  price_is_approximate: boolean;
  payment_status: "paid" | "pending" | "unconfirmed";
  paid_on: string | null;
  notes: string | null;
  created_at: string;
}

export interface Trainer {
  id: string;
  name: string;
  phone: string | null;
  notes: string | null;
  is_active: boolean;
}

/** Row of the package_summary view: package + balances derived from the ledger. */
export interface PackageSummary {
  id: string;
  trainer_id: string;
  trainer_name: string;
  label: string | null;
  price_paise: number;
  sessions_purchased: number;
  purchased_on: string | null;
  start_date: string;
  expiry_date: string | null;
  schedule_days: number[];
  exclude_sundays: boolean;
  sessions_per_week: number | null;
  rollover_allowed: boolean;
  pausable: boolean;
  extension_allowed: boolean;
  status: PackageStatus;
  closed_on: string | null;
  unused_sessions_treatment: UnusedTreatment;
  renewed_from_id: string | null;
  notes: string | null;
  created_at: string;
  completed: number;
  forfeited: number;
  credited: number;
  refunded: number;
  expired: number;
  transferred_in: number;
  transferred_out: number;
  adjusted: number;
  remaining: number;
  last_session_date: string | null;
  trainer_cancelled: number;
  client_cancelled: number;
  rescheduled: number;
  missed_unconfirmed: number;
  paid_paise: number;
  refunded_paise: number;
  pending_paise: number;
  outstanding_paise: number;
}

export interface Payment {
  id: string;
  package_id: string;
  kind: "payment" | "refund";
  amount_paise: number;
  status: "paid" | "pending";
  paid_on: string | null;
  due_on: string | null;
  method: string | null;
  note: string | null;
  created_at: string;
}

export interface Attendance {
  id: string;
  date: string;
  gym_status: GymStatus;
  pt_status: PtStatus;
  pt_package_id: string | null;
  rescheduled_to: string | null;
  absence_reason: AbsenceReason | null;
  notes: string | null;
  source: string;
  created_at: string;
  updated_at: string;
}

export interface LedgerEntry {
  id: string;
  package_id: string;
  kind: LedgerKind;
  sessions: number;
  session_date: string | null;
  attendance_id: string | null;
  note: string | null;
  voided_at: string | null;
  void_reason: string | null;
  created_at: string;
}

export interface ScheduleBlock {
  id: string;
  kind: BlockKind;
  start_date: string;
  end_date: string;
  package_id: string | null;
  note: string | null;
}

export interface Exercise {
  id: string;
  name: string;
  primary_muscle: string;
  secondary_muscles: string[];
  category: "strength" | "cardio" | "mobility" | "other";
  equipment: string | null;
  notes: string | null;
  is_archived: boolean;
}

export interface WorkoutTemplate {
  id: string;
  name: string;
  workout_type: string | null;
  muscle_groups: string[];
  exercise_names: string[];
  is_builtin: boolean;
}

export interface WorkoutSet {
  id?: string;
  set_number: number;
  reps: number | null;
  weight_kg: number | null;
  duration_sec: number | null;
  is_warmup: boolean;
}

export interface WorkoutExercise {
  id: string;
  exercise_id: string;
  position: number;
  rest_seconds: number | null;
  notes: string | null;
  exercise: Pick<Exercise, "id" | "name" | "primary_muscle" | "category"> | null;
  sets: WorkoutSet[];
}

export interface Workout {
  id: string;
  workout_date: string;
  start_time: string | null;
  title: string | null;
  workout_type: string | null;
  muscle_groups: string[];
  duration_min: number | null;
  cardio_type: string | null;
  cardio_min: number | null;
  distance_km: number | null;
  energy_level: number | null;
  with_trainer: boolean;
  trainer_notes: string | null;
  personal_notes: string | null;
  discomfort_notes: string | null;
  created_at: string;
  updated_at: string;
  exercises: WorkoutExercise[];
}

export interface Measurement {
  id: string;
  measured_on: string;
  metric: string;
  value: number;
  unit: string;
  note: string | null;
}

export interface Goal {
  id: string;
  kind: "weekly_attendance" | "workout_count" | "exercise_weight" | "streak" | "measurement" | "custom";
  title: string;
  target_value: number | null;
  exercise_id: string | null;
  metric: string | null;
  start_date: string;
  end_date: string | null;
  is_active: boolean;
}

export interface ProgressPhoto {
  id: string;
  taken_on: string;
  storage_path: string;
  note: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: number;
  table_name: string;
  record_id: string | null;
  action: "insert" | "update" | "delete";
  old_data: Record<string, unknown> | null;
  new_data: Record<string, unknown> | null;
  changed: string[] | null;
  created_at: string;
}
