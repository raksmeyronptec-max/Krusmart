/**
 * The teacher-profile field contract, shared by the client form and the
 * server actions so inline validation and server validation cannot diverge.
 *
 * Keep this module PURE — no server-only imports. The client bundles it.
 *
 * Every save is per-section: a section declares exactly which columns it owns
 * on `settings` and/or `teacher_profiles`, and the server action strips
 * anything else. That is what guarantees one section's save can never
 * overwrite another section's columns with stale client state.
 */
import { z } from 'zod'
import { fromKhmerNumber } from '@/lib/utils/khmer-num'

/* ----------------------------------------------------------------------------
 * Primitives
 * ------------------------------------------------------------------------- */

/** Trimmed free text; '' is treated as "not provided". */
const text = (max = 200) => z.string().trim().max(max).default('')

/**
 * Cambodian phone number. Accepts Khmer numerals, spaces and dashes as
 * teachers actually type them, then canonicalises to bare digits with an
 * optional +855 prefix. Stored canonical; formatted at render.
 */
const phone = z
  .string()
  .trim()
  .transform((v) => fromKhmerNumber(v).replace(/[\s-]/g, ''))
  .refine((v) => v === '' || /^(\+855|0)\d{7,9}$/.test(v), {
    message: 'លេខទូរស័ព្ទមិនត្រឹមត្រូវ (ឧ. 012 345 678)',
  })
  .default('')

/** ISO date (what `<input type="date">` submits) or empty. Stored as DATE. */
const isoDate = z
  .string()
  .trim()
  .refine((v) => v === '' || /^\d{4}-\d{2}-\d{2}$/.test(v), {
    message: 'កាលបរិច្ឆេទមិនត្រឹមត្រូវ',
  })
  .default('')

/** Digits, accepting Khmer numerals; canonicalised to Latin digits. */
const numericText = (max = 30) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => fromKhmerNumber(v))
    .refine((v) => v === '' || /^[\d/.\- ]+$/.test(v), {
      message: 'បញ្ចូលជាលេខ',
    })
    .default('')

/**
 * An image as a data URL (the app's established storage pattern — see
 * `settings.photo_url` / `school_logo`). Server-side guard: must be a real
 * `data:image/*;base64` payload under the size cap, so a hand-crafted request
 * cannot smuggle arbitrary text into an <img src>.
 *
 * OPTIONAL, not defaulted: the client omits an image field whose value it
 * did not change, so a pre-00020 stored value the guard would reject (an
 * external URL, an oversized legacy logo) can never make its whole section
 * unsavable — and an omitted key is simply not written by the upsert.
 * Sending '' explicitly clears the image.
 */
export const MAX_IMAGE_DATA_URL_BYTES = 1_500_000 // ~1.1MB of image after base64 overhead
export const IMAGE_FIELDS = ['photo_url', 'school_logo', 'director_seal', 'teacher_signature'] as const
const imageDataUrl = z
  .string()
  .trim()
  .max(MAX_IMAGE_DATA_URL_BYTES, 'រូបភាពធំពេក — សូមជ្រើសរើសរូបតូចជាងនេះ')
  .refine((v) => v === '' || /^data:image\/[a-z0-9.+-]+;base64,[A-Za-z0-9+/=]+$/i.test(v), {
    message: 'រូបភាពមិនត្រឹមត្រូវ',
  })
  .optional()

const childSchema = z.object({
  name: z.string().trim().max(120).default(''),
  gender: z.string().trim().max(10).default(''),
  dob: isoDate,
})
export type ChildInput = z.infer<typeof childSchema>

/* ----------------------------------------------------------------------------
 * Per-section schemas
 * ------------------------------------------------------------------------- */

/** Tab 1 — identity basics (→ settings). */
export const personalSettingsSchema = z.object({
  surname: text(80),
  name: text(80),
  gender: text(10),
  phone,
  photo_url: imageDataUrl,
})

/** Tab 1 — identity extras, ID card and both addresses (→ teacher_profiles). */
export const personalProfileSchema = z.object({
  date_of_birth: isoDate,
  nationality: text(60),
  ethnicity: text(60),
  disability_type: text(120),
  id_card_type: text(60),
  id_card_number: numericText(30),
  id_card_expiry: isoDate,
  birth_province: text(80),
  birth_district: text(80),
  birth_commune: text(80),
  birth_village: text(80),
  res_province: text(80),
  res_district: text(80),
  res_commune: text(80),
  res_village: text(80),
})

/** Tab 2 — work (→ teacher_profiles). */
export const workSchema = z
  .object({
    specialized_subjects: z.array(z.string().trim().min(1).max(80)).max(20).default([]),
    grade_levels: text(120),
    teacher_code: numericText(40),
    service_start_date: isoDate,
    teaching_type: text(80),
    shift: text(40),
    teacher_status: text(80),
    appointment_start_date: isoDate,
    appointment_end_date: isoDate,
  })
  .refine(
    (v) =>
      !v.appointment_start_date ||
      !v.appointment_end_date ||
      v.appointment_start_date <= v.appointment_end_date,
    {
      message: 'កាលបរិច្ឆេទចាប់ផ្ដើម ត្រូវមុនកាលបរិច្ឆេទបញ្ចប់',
      path: ['appointment_end_date'],
    },
  )

/** Tab 2 — civil-servant record (→ teacher_profiles). */
export const civilServantSchema = z.object({
  civil_servant_id: numericText(40),
  rank_position: text(160),
  function_role: text(160),
  work_type: text(80),
  framework_category: text(80),
  rank_class: text(40),
  rank_step: text(40),
  rank_type: text(80),
  appointment_decree_number: text(80),
  appointment_decree_date: isoDate,
  salary_rank: text(120),
})

/** Tab 2 — training. Splits across both tables (00013 vs 00020). */
export const trainingSettingsSchema = z.object({
  education_level: text(120),
  training_level: text(120),
  seniority_years: text(40),
})
export const trainingProfileSchema = z.object({
  diploma: text(160),
})

/** Tab 3 — family (→ teacher_profiles). */
export const familySchema = z.object({
  marital_status: text(40),
  spouse_name: text(120),
  spouse_occupation: text(120),
  spouse_phone: phone,
  children_count: z
    .string()
    .trim()
    .transform((v) => fromKhmerNumber(v))
    .refine((v) => v === '' || /^\d{1,2}$/.test(v), { message: 'បញ្ចូលជាលេខ' })
    .default(''),
  // Rows with no name are the repeater's empty placeholders — dropped on save.
  children: z
    .array(childSchema)
    .max(20)
    .transform((rows) => rows.filter((r) => r.name !== ''))
    .default([]),
})

/** Tab 4 — school & report header (→ settings). Paired columns are expanded
 * server-side: writing only one half is exactly what broke printing before
 * 00013, so the action mirrors homeroom_teacher → teacher_name,
 * director_name → manager_name, province_for_date → province_date. */
export const schoolSchema = z.object({
  management_unit_1: text(160),
  management_unit_2: text(160),
  school_name: text(160),
  school_code: numericText(30),
  class_name: text(80),
  homeroom_teacher: text(120),
  manager_role: text(120),
  director_name: text(120),
  province_for_date: text(80),
  academic_year: text(20),
  principal_phone: phone,
  admin_province: text(80),
  admin_district: text(80),
  admin_commune: text(80),
  school_logo: imageDataUrl,
  director_seal: imageDataUrl,
  teacher_signature: imageDataUrl,
})

/* ----------------------------------------------------------------------------
 * Section registry — the single list both the form and the actions iterate
 * ------------------------------------------------------------------------- */

export const SECTION_SCHEMAS = {
  personal: { settings: personalSettingsSchema, profile: personalProfileSchema },
  work: { settings: null, profile: workSchema },
  civil: { settings: null, profile: civilServantSchema },
  training: { settings: trainingSettingsSchema, profile: trainingProfileSchema },
  family: { settings: null, profile: familySchema },
  school: { settings: schoolSchema, profile: null },
} as const

export type SectionId = keyof typeof SECTION_SCHEMAS

/**
 * One concept, two columns (see ProfileClient's history): the save action
 * writes both halves so no print view can ever read a stale twin again.
 */
export const PAIRED_SETTINGS_COLUMNS: Record<string, string> = {
  homeroom_teacher: 'teacher_name',
  province_for_date: 'province_date',
  director_name: 'manager_name',
}

/**
 * The letterhead contract: every printable in the app (ReportFrame,
 * ScorePrintClient, BookClient, …) reads exactly these `settings` columns.
 * A teacher missing one of them prints a row of dots on an official document,
 * so the UI surfaces them as "blocks report generation".
 */
export const REPORT_REQUIRED_FIELDS: { key: string; label: string }[] = [
  { key: 'management_unit_1', label: 'អង្គភាពគ្រប់គ្រង ១' },
  { key: 'management_unit_2', label: 'អង្គភាពគ្រប់គ្រង ២' },
  { key: 'school_name', label: 'ឈ្មោះសាលា' },
  { key: 'class_name', label: 'ឈ្មោះថ្នាក់' },
  { key: 'homeroom_teacher', label: 'ឈ្មោះគ្រូបន្ទុក' },
  { key: 'manager_role', label: 'តួនាទីអ្នកគ្រប់គ្រង' },
  { key: 'director_name', label: 'ឈ្មោះនាយក' },
  { key: 'province_for_date', label: 'ខេត្ត (សម្រាប់ថ្ងៃខែ)' },
  { key: 'academic_year', label: 'ឆ្នាំសិក្សា' },
]

/** True when a form value counts as "filled" for a completion badge. */
export function isFilled(value: unknown): boolean {
  if (Array.isArray(value)) return value.length > 0
  return typeof value === 'string' ? value.trim() !== '' : value != null
}
