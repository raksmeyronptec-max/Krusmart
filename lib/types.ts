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

/**
 * One spreadsheet row accepted by `importStudents`.
 *
 * This is the parsed-Excel shape, not a `students` row: every field is optional
 * because the sheet may omit columns, and the Latin name arrives as
 * `name_latin` rather than the column's `name_en`.
 */
export interface StudentImportRow {
  student_id?: string
  grade?: string
  name_kh?: string
  name_latin?: string
  gender?: string
  dob?: string | null
  phone?: string

  birth_province?: string
  birth_district?: string
  birth_commune?: string
  birth_village?: string
  curr_province?: string
  curr_district?: string
  curr_commune?: string
  curr_village?: string

  photo_url?: string
  is_new_student?: boolean
  is_repeater?: boolean
  orphan_status?: string
  is_disabled?: boolean
  poor_status?: string
  is_equity?: boolean
  is_scholarship?: boolean

  ethnicity?: string
  special_features?: string
  other_remarks?: string

  father_name?: string
  father_job?: string
  mother_name?: string
  mother_job?: string
  guardian_name?: string
  guardian_job?: string
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
  /**
   * Free-text note for an absence. Written by `saveAttendance` and read by the
   * seating-layout view; absent from the SQL snapshot like several other live
   * columns.
   */
  reason?: string | null
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
  /**
   * Non-numeric mark — the behavioural ratings (ល្អ / ល្អបង្គួរ / មធ្យម / ខ្សោយ)
   * on the `sem_eval_*` columns. `score_value` is NUMERIC, so these used to be
   * coerced with `parseFloat`, turn into NaN, serialise as `null`, and vanish
   * without an error. Added in migration 00012; a row carries this or
   * `score_value`, never both. Read with `scoreCellValue()`.
   */
  score_text?: string | null
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
  /**
   * `ប្រធាន` / `អនុប្រធាន` / `សមាជិក`, set by the automatic assignment in
   * `lib/utils/cleaning-random.ts`. Absent on members added by hand.
   */
  role?: string | null
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

// =============================================================================
// Enterprise V2
// =============================================================================
// Rows introduced by migrations 00002-00003. The single-teacher types above are
// unchanged and still authoritative for the legacy query paths — see
// `lib/utils/queryFilter.ts` for how the two coexist during the migration.

/** `schools` row. `location` drives the GPS check-in radius in `TopNav`. */
export interface School {
  id: string
  name: string
  code?: string | null
  logo_url?: string | null
  phone?: string | null
  email?: string | null
  address?: string | null
  /** `{ latitude, longitude, radius }` — radius is in metres. */
  location?: SchoolLocation | null
  /** Free-form per-school config (EmailJS credentials, notification prefs). */
  settings?: Record<string, unknown> | null
  created_at?: string
  updated_at?: string
}

export interface SchoolLocation {
  latitude: number
  longitude: number
  /** Metres from the school within which a check-in is accepted. */
  radius: number
}

/** `academic_years` row. Cambodian school years run November → October. */
export interface AcademicYear {
  id: string
  school_id: string
  /** e.g. `'2025-2026'`. */
  name: string
  start_date?: string | null
  end_date?: string | null
  is_active: boolean
  created_at?: string
}

/** `education_levels` row — បឋមសិក្សា / មធ្យមសិក្សាបឋមភូមិ / មធ្យមសិក្សាទុតិយភូមិ. */
export interface EducationLevel {
  id: string
  school_id: string
  name: string
  name_en?: string | null
  sort_order: number
}

/** `grades` row — ថ្នាក់ទី១ … ថ្នាក់ទី១២. `sort_order` is the grade number. */
export interface Grade {
  id: string
  education_level_id: string
  name: string
  name_en?: string | null
  sort_order: number
}

/** `classes` row, e.g. `១ក`. Unique per (grade, academic year, name). */
export interface Class {
  id: string
  grade_id: string
  academic_year_id: string
  name: string
  capacity?: number | null
  created_at?: string
}

/** `subjects` row, scoped to a school. */
export interface Subject {
  id: string
  school_id: string
  name: string
  name_en?: string | null
  code?: string | null
  is_active: boolean
}

/** `class_subjects` row — per-class scoring bounds for one subject. */
export interface ClassSubject {
  id: string
  class_id: string
  subject_id: string
  max_score: number
  passing_score: number
  is_active: boolean
}

/**
 * `teacher_assignments` row.
 *
 * `subject_id` is null for a homeroom assignment. Uniqueness is enforced by two
 * partial indexes rather than one constraint, because `NULL <> NULL` would
 * otherwise let duplicate homeroom rows accumulate.
 */
export interface TeacherAssignment {
  id: string
  teacher_id: string
  class_id: string
  subject_id?: string | null
  academic_year_id: string
  is_homeroom: boolean
  status: string
  created_at?: string
}

/** A teacher assignment joined to the names needed to render the context switcher. */
export interface TeacherAssignmentDetail extends TeacherAssignment {
  class_name: string
  subject_name?: string | null
  academic_year_name: string
  school_id: string
  school_name: string
}

/** Where a student sits for one academic year. History is append-only. */
export type EnrollmentStatus = 'active' | 'promoted' | 'transferred' | 'withdrawn'

/** `student_enrollments` row. */
export interface StudentEnrollment {
  id: string
  student_id: string
  class_id: string
  academic_year_id: string
  status: EnrollmentStatus | string
  enrolled_at: string
  left_at?: string | null
}

/** The seven seeded role names. */
export type RoleName =
  | 'owner'
  | 'principal'
  | 'school_admin'
  | 'teacher'
  // Present in the `roles` table since 00003; the union omitted them, which is
  // why a parent could not be told apart from a role-less legacy teacher.
  | 'staff'
  | 'parent'
  | 'student'
  | 'staff'
  | 'parent'
  | 'student'

/** `roles` row. `display_name` is the Khmer label shown in the UI. */
export interface Role {
  id: string
  name: RoleName | string
  display_name?: string | null
  sort_order: number
}

/** `user_roles` row. A null `school_id` denotes a global (platform owner) grant. */
export interface UserRole {
  id: string
  user_id: string
  role_id: string
  school_id?: string | null
  created_at?: string
}

/** `permissions` row — one (resource, action) pair granted to a role. */
export interface Permission {
  id: string
  role_id: string
  resource: string
  action: string
}

/** `grading_schemes` row. `config` holds score ranges, letters and weights. */
export interface GradingScheme {
  id: string
  school_id: string
  education_level_id?: string | null
  name: string
  config: Record<string, unknown>
  is_default: boolean
  created_at?: string
}

/** `assessments` row. */
export interface Assessment {
  id: string
  class_subject_id: string
  academic_year_id: string
  name: string
  type: string
  max_score: number
  weight: number
  term?: string | null
  date?: string | null
  status: string
  created_at?: string
}

/** `report_cards` row. */
export interface ReportCard {
  id: string
  enrollment_id: string
  academic_year_id: string
  term?: string | null
  data: Record<string, unknown>
  status: 'draft' | 'published' | 'approved' | string
  created_at?: string
  updated_at?: string
}

/** `attendance_locks` row — a class-day closed to further edits. */
export interface AttendanceLock {
  id: string
  class_id: string
  date: string
  locked_by?: string | null
  locked_at: string
}

/** `audit_logs` row. Append-only: there is no UPDATE or DELETE policy. */
export interface AuditLogEntry {
  id: string
  school_id?: string | null
  actor_id: string
  action: string
  entity_type: string
  entity_id?: string | null
  old_value?: Record<string, unknown> | null
  new_value?: Record<string, unknown> | null
  metadata?: Record<string, unknown> | null
  created_at: string
}

/** `announcements` row. */
export interface Announcement {
  id: string
  school_id: string
  author_id: string
  title: string
  content?: string | null
  audience: 'all' | 'teachers' | 'parents' | 'students' | string
  status: string
  created_at?: string
}

/** `premium_requests` row — carries the Firestore subscription workflow. */
export interface PremiumRequest {
  id: string
  user_id: string
  plan: string
  status: 'pending' | 'approved' | 'rejected' | string
  requested_at: string
  reviewed_at?: string | null
  reviewed_by?: string | null
  metadata?: Record<string, unknown> | null
  notes?: string | null
}

/** `profiles` row. Subscription fields carry over from Firestore `users/{uid}`. */
export interface Profile {
  id: string
  school_id?: string | null
  full_name?: string | null
  phone?: string | null
  avatar_url?: string | null
  role?: string | null
  subscription_plan?: string | null
  subscription_status?: string | null
  trial_ends_at?: string | null
  created_at?: string
  updated_at?: string
}

// =============================================================================
// Phase 11.5 — legacy features moved off localStorage (migration 00012)
// =============================================================================

/** Which score grid a custom subject appears in. */
export type CustomSubjectScope = 'monthly' | 'semester' | 'both'

/** One column inside a custom subject. `id` is what `scores.subject` stores. */
export interface CustomSubjectColumn {
  id: string
  label: string
  width?: string
}

/**
 * `custom_subjects` row — a teacher-defined subject group.
 *
 * Replaces the `custom_subjects` localStorage key. `columns` keeps the legacy
 * JSON shape so an existing browser's value imports verbatim; rewriting a
 * column id would orphan every score already recorded against it.
 */
export interface CustomSubjectRow {
  id: string
  teacher_id: string
  class_id?: string | null
  name: string
  scope: CustomSubjectScope
  columns: CustomSubjectColumn[]
  order_index: number
  created_at?: string
  updated_at?: string
}

/** `inventory_items` row — classroom equipment, previously `inventoryItems`. */
export interface InventoryItemRow {
  id: string
  teacher_id: string
  class_id?: string | null
  name: string
  qty: number
  unit?: string | null
  note?: string | null
  order_index: number
  created_at?: string
  updated_at?: string
}

/**
 * `class_admin_entries` row — one record in one of the 13 administration books.
 *
 * Row-list books (recommendations, demo classes, ...) use one row per record
 * ordered by `seq`; single-document books (class committee, teacher plan, ...)
 * use one row with `seq = 0` and everything in `data`. The per-book shape of
 * `data` is described in `lib/class-admin/books.ts`.
 */
export interface ClassAdminEntry {
  id: string
  teacher_id: string
  class_id?: string | null
  academic_year_id?: string | null
  book: string
  entry_date?: string | null
  seq: number
  data: Record<string, unknown>
  created_at?: string
  updated_at?: string
}
