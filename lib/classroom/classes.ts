// Relative, with the extension, so node can load this module directly — the
// same shape `lib/scores/semester.ts` uses for the same reason. The `@/` alias
// is a bundler feature; `scripts/verify-classroom.mts` has no bundler.
import { orderAssignments } from '../utils/defaultClass.ts'

/**
 * The teacher's own classes, as `/classroom/classes` renders them.
 *
 * Pure and free of `server-only` so the rules below can be checked without a
 * database — they are the ones that go wrong silently:
 *
 *   * an archived assignment must disappear from the list, but the class and
 *     everything behind it must survive (§18: archive, never delete);
 *   * a withdrawn pupil must not be counted, while a *promoted* or
 *     *transferred* one must — past years stamp those, and filtering on
 *     `status = 'active'` would render every historical class empty. Every
 *     roster read in this codebase uses `.neq('status','withdrawn')` and this
 *     count has to agree with them, or the card lies about the screen it opens;
 *   * one card per **class**, not per assignment. A teacher holding both the
 *     homeroom row and a subject row on the same class holds two rows and has
 *     one class.
 */

/** PostgREST returns an embedded to-one relation as either an object or a 1-element array. */
function one<T>(rel: T | T[] | null | undefined): T | undefined {
  return Array.isArray(rel) ? rel[0] : (rel ?? undefined)
}

/** A `teacher_assignments` row with the names the card needs embedded. */
export interface ClassAssignmentRow {
  id: string
  class_id: string
  academic_year_id: string
  is_homeroom: boolean
  subject_key?: string | null
  status?: string
  created_at?: string
  classes?: ClassRel | ClassRel[] | null
  academic_years?: YearRel | YearRel[] | null
}

interface ClassRel {
  id?: string
  name?: string
  track?: string | null
  grades?: GradeRel | GradeRel[] | null
}

interface GradeRel {
  name?: string
  sort_order?: number | null
  education_levels?: { name?: string } | { name?: string }[] | null
}

interface YearRel {
  name?: string
}

/** An enrolment row, reduced to what a head count needs. */
export interface EnrolmentCountRow {
  class_id: string
  student_id: string
  status?: string | null
}

/** One class the teacher holds, ready to render. */
export interface ClassroomClass {
  classId: string
  className: string
  gradeName: string
  gradeNumber: number | null
  levelName: string
  academicYearId: string
  academicYearName: string
  /** The teacher is this class's form master — they hold a homeroom row on it. */
  isHomeroom: boolean
  studentCount: number
  /**
   * The assignment the active-class switcher should select for this class.
   * The homeroom row when there is one, by `orderAssignments` — the same rule
   * `resolveServerScope` uses to pick a default, so the card and the server
   * agree about what selecting this class means.
   */
  assignmentId: string
  /**
   * *Every* active assignment this teacher holds on the class. Archiving is
   * per-assignment, and leaving a second row active would keep the class in a
   * list the teacher just removed it from.
   */
  assignmentIds: string[]
}

/**
 * Head count per class, excluding withdrawals.
 *
 * Deduplicated by pupil: two non-withdrawn rows for one pupil in one class is
 * not something the schema should allow, but a count is the wrong place to find
 * out, and "39 pupils, 40 in the list" is a bug report nobody can act on.
 */
export function countEnrolments(rows: EnrolmentCountRow[]): Map<string, number> {
  const seen = new Map<string, Set<string>>()
  for (const row of rows) {
    // The roster rule, restated rather than assumed of the caller: `withdrawn`
    // is the only status that means "not in this class".
    if (row.status === 'withdrawn') continue
    let pupils = seen.get(row.class_id)
    if (!pupils) {
      pupils = new Set()
      seen.set(row.class_id, pupils)
    }
    pupils.add(row.student_id)
  }
  return new Map([...seen].map(([classId, pupils]) => [classId, pupils.size]))
}

/**
 * Collapse the caller's assignments into one card per class.
 *
 * Only `status = 'active'` rows survive — that is what archiving writes to, so
 * an archived assignment leaves the list here and nowhere else. Rows are also
 * dropped when the embedded class is missing, which is what RLS filtering a
 * class the caller may not read looks like from this side.
 *
 * Ordered newest year first, then by class name, so a teacher's current classes
 * lead — the reverse of the *default*-class rule, deliberately: a list is read
 * top-down and the current year is what a teacher is looking for, while a
 * default must not move when a class is added.
 */
export function buildClassList(
  assignments: ClassAssignmentRow[],
  enrolments: EnrolmentCountRow[],
): ClassroomClass[] {
  const counts = countEnrolments(enrolments)
  const byClass = new Map<string, ClassAssignmentRow[]>()

  for (const row of assignments) {
    if (row.status !== undefined && row.status !== 'active') continue
    if (!one(row.classes)) continue
    const list = byClass.get(row.class_id)
    if (list) list.push(row)
    else byClass.set(row.class_id, [row])
  }

  const classes: ClassroomClass[] = []

  for (const [classId, rows] of byClass) {
    // Homeroom first, then oldest — the same total order the default class uses,
    // so "the assignment for this class" means one thing across the app.
    const ordered = orderAssignments(rows)
    const cls = one(ordered[0].classes)!
    const grade = one(cls.grades)
    const level = one(grade?.education_levels)
    const sortOrder = grade?.sort_order

    classes.push({
      classId,
      className: cls.name ?? '',
      gradeName: grade?.name ?? '',
      gradeNumber: typeof sortOrder === 'number' ? sortOrder : null,
      levelName: level?.name ?? '',
      academicYearId: ordered[0].academic_year_id,
      academicYearName: one(ordered[0].academic_years)?.name ?? '',
      isHomeroom: ordered.some((r) => r.is_homeroom),
      studentCount: counts.get(classId) ?? 0,
      assignmentId: ordered[0].id,
      assignmentIds: ordered.map((r) => r.id),
    })
  }

  return classes.sort((a, b) => {
    const byYear = b.academicYearName.localeCompare(a.academicYearName)
    if (byYear !== 0) return byYear
    const byGrade = (a.gradeNumber ?? 99) - (b.gradeNumber ?? 99)
    if (byGrade !== 0) return byGrade
    return a.className.localeCompare(b.className, 'km')
  })
}
