/**
 * Shared row types for the Supabase tables.
 *
 * The SQL under `supabase/` is a stale snapshot (see CLAUDE.md) — these types
 * follow what the app actually reads and writes, which is the live schema.
 * Where the two disagree the divergence is called out inline.
 */

/** `students` row. */
export interface Student {
  id: string
  teacher_id: string
  student_id: string
  /** Class the student sits in, e.g. `១ក` — not a letter grade. */
  grade: string
  name_kh: string
  name_en: string | null
  gender: string
  dob: string
  phone: string | null

  birth_province: string | null
  birth_district: string | null
  birth_commune: string | null
  birth_village: string | null

  curr_province: string | null
  curr_district: string | null
  curr_commune: string | null
  curr_village: string | null

  is_new_student: boolean
  is_repeater: boolean
  orphan_status: string
  is_disabled: boolean
  poor_status: string
  is_equity: boolean
  is_scholarship: boolean

  father_name: string | null
  father_job: string | null
  mother_name: string | null
  mother_job: string | null
  guardian_name: string | null
  guardian_job: string | null

  ethnicity: string | null
  special_features: string | null
  other_remarks: string | null
  photo_url: string | null

  order_index: number | null
  created_at: string
  updated_at: string

  /**
   * Legacy columns carried over from the pre-Supabase (Firebase) data. None of
   * them are written by this app — several views still read them as fallbacks
   * for old rows (`name_kh || full_name`, `id || uid`,
   * `student_id || student_code`).
   */
  full_name?: string | null
  uid?: string | null
  student_code?: string | null
}

/** Attendance mark: present / late / absent-with-leave / absent. */
export type AttendanceStatus = 'P' | 'L' | 'A' | 'AP'

/** `attendance` row. Unique on (student_id, date). */
export interface AttendanceRecord {
  id: string
  teacher_id: string
  student_id: string
  date: string
  status: AttendanceStatus | string
  created_at: string
}

/**
 * What the `scores` row is discriminated by. See CLAUDE.md — one table carries
 * monthly, semester, annual and homework marks.
 */
export type ScoreType = 'monthly' | 'semester' | 'annual' | 'homework'

/**
 * `scores` row.
 *
 * The live table uses `score_period` / `score_value`; the SQL snapshot still
 * declares the original `month` / `score`. The column names below are the ones
 * the app reads and upserts against
 * (`onConflict: 'student_id, subject, score_type, score_period'`).
 */
export interface Score {
  id: string
  teacher_id: string
  student_id: string
  subject: string
  score_type: ScoreType | string
  /**
   * `${month}-${academicYear}` | `${semester}-${academicYear}` |
   * `annual-${academicYear}` | `${year}_${month}` (homework, underscore).
   */
  score_period: string
  score_value: number | null
  created_at?: string
  updated_at?: string
}

/** Payload accepted by `saveScores` — the score is still a raw input string. */
export interface ScoreInput {
  student_id: string
  subject: string
  score_value: string | number | null
}

/**
 * `settings` row, keyed by teacher. Every field is optional: the row is created
 * incrementally from the profile form, and several columns (`photo_url`,
 * `school_code`, `school_logo`, `director_name`, `manager_name`,
 * `teacher_name`, `province_date`) exist live but are absent from the SQL
 * snapshot.
 */
export interface Settings {
  teacher_id?: string
  surname?: string | null
  name?: string | null
  teacher_name?: string | null
  management_unit_1?: string | null
  management_unit_2?: string | null
  school_name?: string | null
  school_code?: string | null
  school_logo?: string | null
  class_name?: string | null
  homeroom_teacher?: string | null
  director_name?: string | null
  manager_name?: string | null
  manager_role?: string | null
  province_for_date?: string | null
  province_date?: string | null
  academic_year?: string | null
  photo_url?: string | null
  created_at?: string
  updated_at?: string
}

/** `notifications` row. `target` is a student id or a broadcast keyword. */
export interface Notification {
  id: string
  teacher_id: string
  target: string
  title: string
  message: string
  type: string
  created_at: string
}

/** Fields the notification form submits; `teacher_id` is added server-side. */
export type NotificationInput = Omit<Notification, 'id' | 'teacher_id' | 'created_at'>

/** `homework_assignments` row. */
export interface HomeworkAssignment {
  id: string
  teacher_id: string
  subject: string
  title: string
  description: string | null
  due_date: string
  image_url: string | null
  status: string
  created_at: string
}

/** Fields the assignment form submits; `teacher_id` is added server-side. */
export type HomeworkAssignmentInput = Omit<
  HomeworkAssignment,
  'id' | 'teacher_id' | 'created_at' | 'status'
> & { status?: string }

/**
 * One student slot in the cleaning roster. This is the app's own persisted JSON
 * shape, not a student row — `name`/`image` are snapshots of the student's
 * `name_kh`/`photo_url` taken when they were assigned.
 */
export interface CleaningMember {
  id: string
  name: string
  image?: string | null
}

/** `cleaning_schedules.leaders` JSONB. */
export interface CleaningLeaders {
  pres: CleaningMember | null
  vp1: CleaningMember | null
  vp2: CleaningMember | null
}

/** `cleaning_schedules.groups` JSONB — day id → assigned members. */
export type CleaningGroups = Record<string, CleaningMember[]>

/** `seating_layout.config` JSONB. */
export interface SeatingConfig {
  totalTables: number
  gridCols: number
  seatsPerTable: number
  layout: string
  [key: string]: string | number | boolean
}

/** `seating_layout.assignments` JSONB — seat id → student id. */
export type SeatingAssignments = Record<string, string>

/**
 * Shape returned by the mutation server actions in this app. Callers check
 * `if (res?.error)` rather than narrowing on `success`, so both fields stay
 * optional instead of forming a discriminated union.
 */
export type ActionResult = { success?: true; error?: string }
