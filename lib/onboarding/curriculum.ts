// Relative and extension-qualified so the scripts/ harnesses can run this
// module under plain node — same reason as lib/scores/template.ts.
import { toKhmerNumber } from '../utils/khmer-num.ts'

/**
 * The MoEYS education ladder, as data.
 *
 * These are not new names. They are exactly what migration `00004` backfilled
 * into every pre-existing school:
 *
 *     ('បឋមសិក្សា',            'Primary',          1)
 *     ('មធ្យមសិក្សាបឋមភូមិ',   'Lower Secondary',  2)
 *     ('មធ្យមសិក្សាទុតិយភូមិ', 'Upper Secondary',  3)
 *     grades: 'ថ្នាក់ទី' || int_to_khmer(n), filed 1–6 / 7–9 / 10–12
 *
 * Reproducing them verbatim matters more than it looks: `education_levels` is
 * UNIQUE per school and every cross-school view groups on these strings, so a
 * self-onboarded school that invented its own label — say the more colloquial
 * "វិទ្យាល័យ" for upper secondary — would sit in its own bucket in every report
 * that spans schools. The brief used that colloquial name; the schema's is
 * kept instead, deliberately.
 *
 * The ladder lives here rather than in SQL so adjusting it never needs a
 * migration — the rows are ordinary inserts the school's owner is allowed to
 * make.
 */

export interface EducationLevelSpec {
  /** Stable key for form values; never persisted. */
  key: 'primary' | 'lower_secondary' | 'upper_secondary'
  /** Persisted to `education_levels.name` — must match 00004. */
  name: string
  nameEn: string
  sortOrder: number
  /** Inclusive grade range. */
  from: number
  to: number
  description: string
  /**
   * First grade at which classes stream into tracks (ក្រុមវិទ្យាសាស្ត្រ /
   * វិទ្យាសាស្ត្រសង្គម). Curriculum data, not a rule in code — the class form
   * reads this instead of anyone writing `if (grade === 12)`. Absent means the
   * level never streams.
   */
  tracksFromGrade?: number
}

export const EDUCATION_LEVELS: readonly EducationLevelSpec[] = [
  {
    key: 'primary',
    name: 'បឋមសិក្សា',
    nameEn: 'Primary',
    sortOrder: 1,
    from: 1,
    to: 6,
    description: 'សម្រាប់សិស្សថ្នាក់ដំបូង',
  },
  {
    key: 'lower_secondary',
    name: 'មធ្យមសិក្សាបឋមភូមិ',
    nameEn: 'Lower Secondary',
    sortOrder: 2,
    from: 7,
    to: 9,
    description: 'អនុវិទ្យាល័យ',
  },
  {
    key: 'upper_secondary',
    name: 'មធ្យមសិក្សាទុតិយភូមិ',
    nameEn: 'Upper Secondary',
    sortOrder: 3,
    from: 10,
    to: 12,
    description: 'វិទ្យាល័យ',
    // ថ្នាក់ទី១១–១២ stream; the same subject carries a different full mark per
    // stream (docs/score-system-design.md §6), so the class must declare one.
    tracksFromGrade: 11,
  },
] as const

export type EducationLevelKey = EducationLevelSpec['key']

export function levelByKey(key: string): EducationLevelSpec | undefined {
  return EDUCATION_LEVELS.find((l) => l.key === key)
}

/** `ថ្នាក់ទី៥` — the exact form `00004` writes. */
export function gradeName(n: number): string {
  return `ថ្នាក់ទី${toKhmerNumber(n)}`
}

/** `ថ្នាក់ទី១ … ថ្នាក់ទី៦` for primary, etc. `sortOrder` is the grade number. */
export function gradesForLevel(level: EducationLevelSpec): { name: string; sortOrder: number }[] {
  const out: { name: string; sortOrder: number }[] = []
  for (let n = level.from; n <= level.to; n++) out.push({ name: gradeName(n), sortOrder: n })
  return out
}

/** `ថ្នាក់ទី ១ ដល់ ៦` — the range caption shown on each level card (§8). */
export function gradeRangeLabel(level: EducationLevelSpec): string {
  return `ថ្នាក់ទី ${toKhmerNumber(level.from)} ដល់ ${toKhmerNumber(level.to)}`
}

/**
 * Class sections, Khmer-alphabetical.
 *
 * The existing data names classes `១ក`, `២ខ`, `៧ក` — grade numeral followed by
 * a section letter — so that is what {@link generatedClassName} reproduces
 * rather than the Latin "5A" shape the brief sketched.
 */
export const CLASS_SECTIONS = ['ក', 'ខ', 'គ', 'ឃ', 'ង', 'ច', 'ឆ', 'ជ'] as const

/**
 * `៥ក` from grade 5, section ក.
 *
 * §10 asks that the teacher never type this. It is derived on every render from
 * the two fields above it, so the name and the grade cannot drift apart.
 */
export function generatedClassName(gradeNumber: number, section: string): string {
  return `${toKhmerNumber(gradeNumber)}${section}`
}

/** `ថ្នាក់ទី៥ ក` — the human-facing echo shown under the form and on success. */
export function classDisplayName(gradeNumber: number, section: string): string {
  return `${gradeName(gradeNumber)} ${section}`
}

/** The two upper-secondary streams, as `classes.track` stores them (00021). */
export const CLASS_TRACKS = [
  { key: 'science', label: 'ក្រុមវិទ្យាសាស្ត្រ' },
  { key: 'social_science', label: 'ក្រុមវិទ្យាសាស្ត្រសង្គម' },
] as const

export type ClassTrackKey = (typeof CLASS_TRACKS)[number]['key']

export function trackLabel(key: string | null | undefined): string | null {
  return CLASS_TRACKS.find((t) => t.key === key)?.label ?? null
}

/**
 * Does a class in this grade need a stream? Read from the level spec — the
 * one place the "grades 11–12 stream" fact lives.
 */
export function gradeNeedsTrack(level: EducationLevelSpec | undefined, gradeNumber: number): boolean {
  return level?.tracksFromGrade !== undefined && gradeNumber >= level.tracksFromGrade
}
