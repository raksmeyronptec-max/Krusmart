'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'
import { resolveServerScope } from '@/lib/utils/serverScope'
import type { QueryScope } from '@/lib/utils/queryFilter'
import type { ActionResult, StudentImportRow } from '@/lib/types'
import { auditLog, auditLogBatch } from '@/lib/audit/log'

/**
 * Turn a Postgres failure into something a teacher can act on.
 *
 * The raw `message` was previously concatenated into the page, so a duplicate
 * student id surfaced as `duplicate key value violates unique constraint
 * "students_teacher_id_student_id_key"` — English, and no indication that the
 * fix is to change the id. Anything unrecognised still carries the original
 * text, because a vague "something went wrong" is worse than an untranslated
 * clue.
 */
function friendlyDbError(error: { code?: string; message: string }, context: 'single' | 'import'): string {
  if (error.code === '23505') {
    return context === 'single'
      ? 'អត្តលេខនេះមានក្នុងបញ្ជីរួចហើយ។ សូមប្តូរអត្តលេខសិស្ស។'
      : 'មានអត្តលេខស្ទួនក្នុងឯកសារ ឬមានក្នុងបញ្ជីរួចហើយ។ គ្មានសិស្សណាត្រូវបានបញ្ចូលទេ។'
  }
  if (error.code === '23514' || error.code === '22007' || error.code === '22008') {
    return 'ទិន្នន័យមួយចំនួនមិនត្រឹមត្រូវ (ជាពិសេសថ្ងៃខែឆ្នាំកំណើត)។ សូមពិនិត្យឡើងវិញ។'
  }
  if (error.code === '42501') {
    return 'អ្នកមិនមានសិទ្ធិបញ្ចូលសិស្សក្នុងថ្នាក់នេះទេ។'
  }
  /*
   * The teacher gets a sentence; the DETAIL goes to the log (F15-6).
   *
   * This used to interpolate `error.message` — a raw Postgres/Supabase string,
   * in English, naming columns and sometimes policies — into a Khmer toast. The
   * mapped codes above are all handled properly; this is the path nobody
   * anticipated, which is exactly the one a teacher should not be asked to read.
   */
  logger.error('enrollment save:', error)
  return 'មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ។ សូមព្យាយាមម្តងទៀត។'
}

/**
 * In v2 the roster is read from `student_enrollments`, not `students.teacher_id`
 * (see `fetchStudentsForScope`), so a student row without an enrolment row is
 * invisible on every roster-consuming screen. This inserts the enrolments for a
 * batch of just-created students — and if it fails, deletes those students
 * again, so the pair cannot half-succeed: PostgREST offers no client-side
 * transaction, so atomicity here is by compensation. The delete is keyed on the
 * ids we just created *and* `teacher_id`, the project's second guard.
 *
 * Worst case — the compensating delete itself fails — the students exist
 * without enrolments, exactly the state the recovery action on /student-list
 * detects and repairs with `backfill_teacher_enrolments` (00018).
 */
async function enrolOrCompensate(
  supabase: Awaited<ReturnType<typeof createClient>>,
  scope: Extract<QueryScope, { mode: 'v2' }>,
  studentIds: string[],
): Promise<{ error?: string }> {
  const { error } = await supabase.from('student_enrollments').insert(
    studentIds.map((id) => ({
      student_id: id,
      class_id: scope.classId,
      academic_year_id: scope.academicYearId,
      status: 'active',
    })),
  )

  if (!error) return {}

  logger.error(error)
  const { data: undone, error: undoErr } = await supabase
    .from('students')
    .delete()
    .in('id', studentIds)
    .eq('teacher_id', scope.teacherId)
    .select('id')

  // A zero-row delete is "success" to PostgREST, so the count is checked too:
  // telling the teacher "nothing was saved" while rows survive would invite a
  // re-submit that duplicates every student. If any row survived, say what
  // actually happened and point at the recovery banner instead.
  if (undoErr || (undone?.length ?? 0) < studentIds.length) {
    if (undoErr) logger.error('compensating delete failed:', undoErr)
    return {
      error:
        'សិស្សត្រូវបានរក្សាទុក ប៉ុន្តែមិនទាន់បានភ្ជាប់ចូលថ្នាក់ទេ។ សូមបើកទំព័របញ្ជីឈ្មោះសិស្ស ដើម្បីនាំសិស្សចូលថ្នាក់វិញ។ កុំបញ្ចូលសិស្សដដែលម្តងទៀត។',
    }
  }

  return {
    error:
      error.code === '42501'
        ? 'អ្នកមិនមានសិទ្ធិបញ្ចូលសិស្សក្នុងថ្នាក់នេះទេ។'
        : 'មិនអាចភ្ជាប់សិស្សចូលថ្នាក់បានទេ។ គ្មានសិស្សណាត្រូវបានរក្សាទុកទេ។ សូមព្យាយាមម្តងទៀត។',
  }
}

const YES = 'បាទ/ចាស'
const NO = 'ទេ'

/**
 * The pupil's demographic record, read out of the enrolment form.
 *
 * Shared by `createStudent` and `updateStudent` so the two cannot drift about
 * which fields exist — thirty-odd columns extracted twice by hand is how one
 * path quietly stops saving a field the other still writes.
 *
 * `teacher_id` is deliberately NOT here. It is the ownership guard every write
 * in this file filters on, and an update that could set it would be a transfer
 * of the pupil to another account dressed as an edit.
 *
 * Returns `null` when a required field is missing, so both callers refuse the
 * same payload with the same message.
 */
function studentFieldsFromForm(formData: FormData) {
  const text = (k: string) => (formData.get(k) as string | null) ?? ''
  const bool = (k: string) => formData.get(k) === YES

  const fields = {
    student_id: text('studentId'),
    grade: text('grade'),
    name_kh: text('studentName'),
    name_en: text('latinName'),
    gender: text('gender'),
    dob: text('dob'),
    phone: text('phone'),

    birth_province: text('birthProvince'),
    birth_district: text('birthDistrict'),
    birth_commune: text('birthCommune'),
    birth_village: text('birthVillage'),

    curr_province: text('currProvince'),
    curr_district: text('currDistrict'),
    curr_commune: text('currCommune'),
    curr_village: text('currVillage'),

    is_new_student: bool('isNewStudent'),
    is_repeater: bool('isRepeater'),
    orphan_status: text('orphanStatus'),
    is_disabled: bool('isDisabled'),
    poor_status: text('poorStatus'),
    is_equity: bool('isEquity'),
    is_scholarship: bool('isScholarship'),

    father_name: text('fatherName'),
    father_job: text('fatherJob'),
    mother_name: text('motherName'),
    mother_job: text('motherJob'),
    guardian_name: text('guardianName'),
    guardian_job: text('guardianJob'),

    ethnicity: text('ethnicity'),
    special_features: text('specialFeatures'),
    other_remarks: text('otherRemarks'),
    photo_url: text('photoUrl'),
  }

  const { student_id, grade, name_kh, gender, dob } = fields
  if (!student_id || !grade || !name_kh || !gender || !dob) return null
  return fields
}

export async function createStudent(formData: FormData, classId?: string) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'មិនមានសិទ្ធិ (Unauthorized)' }
  }

  // Same contract as deleteAllStudents: the client's active class arrives as a
  // parameter and is validated against the caller's own assignments inside
  // resolveServerScope. Legacy accounts resolve to legacy and are untouched.
  const scope = await resolveServerScope(user.id, classId)
  // Unreachable via resolveServerScope today (assignments carry a NOT NULL
  // year), but student_enrollments.academic_year_id is NOT NULL — failing here
  // beats a 23502 after the student insert triggering a destructive undo.
  if (scope.mode === 'v2' && !scope.academicYearId) {
    return { error: 'មិនអាចកំណត់ឆ្នាំសិក្សាបានទេ។ សូមព្យាយាមម្តងទៀត។' }
  }

  const fields = studentFieldsFromForm(formData)
  if (!fields) {
    return { error: 'សូមបំពេញព័ត៌មានដែលមានសញ្ញា * ឱ្យបានគ្រប់គ្រាន់!' }
  }
  const { student_id, grade, name_kh } = fields

  const row = { teacher_id: user.id, ...fields }

  /*
   * The id is returned to the caller, and that is the point of selecting it on
   * BOTH paths (see the `return` at the foot of this action).
   *
   * The v2 branch already read it back because `enrolOrCompensate` needs it.
   * The legacy branch did not, so a pre-V2 account had no id to hand back and
   * `/student-list` could not mark the pupil it had just been sent to find.
   * Reading it costs the insert nothing — `students_select_own` gates on
   * `teacher_id = auth.uid()`, which is the row just written.
   */
  let createdId: string | null = null

  if (scope.mode === 'legacy') {
    // Pre-V2 account: exactly the write this action always made. teacher_id
    // is the only boundary there is; no enrolment row exists or is needed.
    const { data: created, error } = await supabase
      .from('students')
      .insert(row)
      .select('id')
      .single()

    if (error) {
      logger.error(error)
      return { error: friendlyDbError(error, 'single') }
    }
    createdId = created?.id ?? null
  } else {
    const { data: created, error } = await supabase
      .from('students')
      .insert(row)
      .select('id')
      .single()

    if (error) {
      logger.error(error)
      return { error: friendlyDbError(error, 'single') }
    }
    if (!created) {
      return { error: 'មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ។ សូមព្យាយាមម្តងទៀត។' }
    }

    // Without this row the student is invisible in v2 — see enrolOrCompensate.
    const enrol = await enrolOrCompensate(supabase, scope, [created.id])
    if (enrol.error) return { error: enrol.error }
    createdId = created.id
  }

  // Identity fields only. The trail records that a student was enrolled and by
  // whom — copying the full demographic record (parents, address, poverty
  // status) into an admin-readable log would be a needless second store of it.
  // One entry covers both writes: the class metadata records the enrolment, so
  // a reader never has to pair two rows to count one event.
  await auditLog({
    action: 'student.created', entityType: 'student', entityId: null, actorId: user.id,
    newValue: { student_id, name_kh, grade },
    metadata: scope.mode === 'v2'
      ? { class_id: scope.classId, academic_year_id: scope.academicYearId }
      : undefined,
  })

  revalidatePath('/student-list')
  /*
   * `studentId` is what lets the roster answer "did that work?".
   *
   * A teacher returned to `/student-list` after saving used to be shown a list
   * sorted oldest-first and paged at twenty, so on a class of thirty-five the
   * pupil they had just spent forty fields creating was the last row of page
   * two — off-screen, unmarked, and indistinguishable from not having saved at
   * all (Phase 12 F1). The toast answered the question; the screen did not.
   *
   * Nullable rather than optional: a caller must be able to tell "no id came
   * back" from "the id is coming later", and `/enrollment` falls back to the
   * plain roster link when it is null rather than putting `new=null` in a URL.
   */
  return { success: true, studentId: createdId }
}

export async function importStudents(students: StudentImportRow[], classId?: string) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'មិនមានសិទ្ធិបញ្ចូលទិន្នន័យទេ' }
  }

  const scope = await resolveServerScope(user.id, classId)
  // See createStudent: fail before the batch insert, not with a 23502 after.
  if (scope.mode === 'v2' && !scope.academicYearId) {
    return { error: 'មិនអាចកំណត់ឆ្នាំសិក្សាបានទេ។ សូមព្យាយាមម្តងទៀត។' }
  }

  const studentsToInsert = students.map(s => {
    return {
      teacher_id: user.id,
      student_id: s.student_id,
      grade: s.grade,
      name_kh: s.name_kh,
      name_en: s.name_latin,
      gender: s.gender,
      dob: s.dob || null,
      phone: s.phone,
      birth_province: s.birth_province,
      birth_district: s.birth_district,
      birth_commune: s.birth_commune,
      birth_village: s.birth_village,
      curr_province: s.curr_province,
      curr_district: s.curr_district,
      curr_commune: s.curr_commune,
      curr_village: s.curr_village,
      
      photo_url: s.photo_url || '',
      is_new_student: s.is_new_student ?? false,
      is_repeater: s.is_repeater ?? false,
      orphan_status: s.orphan_status || 'ទេ',
      is_disabled: s.is_disabled ?? false,
      poor_status: s.poor_status || 'គ្មាន',
      is_equity: s.is_equity ?? false,
      is_scholarship: s.is_scholarship ?? false,
      ethnicity: s.ethnicity || '',
      special_features: s.special_features || '',
      other_remarks: s.other_remarks || '',
      
      father_name: s.father_name || '',
      father_job: s.father_job || '',
      mother_name: s.mother_name || '',
      mother_job: s.mother_job || '',
      guardian_name: s.guardian_name || '',
      guardian_job: s.guardian_job || ''
    }
  })

  if (scope.mode === 'legacy') {
    // Pre-V2 account: exactly the write this action always made.
    const { error } = await supabase.from('students').insert(studentsToInsert)

    if (error) {
      logger.error(error)
      return { error: friendlyDbError(error, 'import') }
    }
  } else {
    const { data: created, error } = await supabase
      .from('students')
      .insert(studentsToInsert)
      .select('id')

    if (error) {
      logger.error(error)
      return { error: friendlyDbError(error, 'import') }
    }
    if (!created || created.length === 0) {
      return { error: 'មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ។ គ្មានសិស្សណាត្រូវបានបញ្ចូលទេ។' }
    }

    // One batch insert for the whole import, not a round-trip per student —
    // and all-or-nothing with the students above, via enrolOrCompensate.
    const enrol = await enrolOrCompensate(supabase, scope, created.map((r) => r.id))
    if (enrol.error) return { error: enrol.error }
  }

  // One summary entry for the whole operation; class metadata records the
  // enrolments, so one logical event is one audit row.
  await auditLogBatch('student.imported', 'student', studentsToInsert.length, {
    scope: scope.mode, class_id: scope.mode === 'v2' ? scope.classId : null,
  }, user.id)

  revalidatePath('/student-list')
  return { success: true }
}

/* ===========================================================================
 * EDITING A PUPIL
 *
 * Until this existed, no surface in the product could change a pupil's record —
 * not the teacher app, not the admin console, not the parent portal. The only
 * `students` update anywhere was `order_index`, for dragging the roster into
 * order. A typo in a name could be fixed one way: delete the pupil and enter
 * them again, which mints a NEW `students.id` and orphans every score,
 * attendance row and enrolment attached to the old one.
 *
 * Meanwhile `/student-list` had shown a pencil on every row since it was built,
 * pushing `/students/<id>?edit=true` — a parameter that page has never read.
 *
 * ── What an edit is NOT ────────────────────────────────────────────────────
 *
 * It does not move the pupil. `class_id` and `student_enrollments` are
 * untouched here, because "a misplaced pupil is corrected by a transfer, not by
 * an edit" is this product's rule and a transfer is a different operation with
 * a different history. Nor does it change `teacher_id`: that is the ownership
 * guard, and an update that could set it would be a hand-over dressed as an
 * edit.
 * ========================================================================= */

/** The pupil's record as the enrolment form's own field names. */
export interface StudentEditValues {
  id: string
  values: Record<string, string>
}

/**
 * Load one pupil for editing.
 *
 * Owner-guarded with `teacher_id`, matching the RLS policy (`auth.uid() =
 * teacher_id`) and the second-guard convention every write in this file
 * follows. A subject teacher may READ a colleague's pupils — 00006 widens that
 * deliberately — but editing one is not reading it, so this is narrower than
 * the roster on purpose.
 */
export async function getStudentForEdit(
  studentId: string,
): Promise<{ student?: StudentEditValues; error?: string }> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'មិនមានសិទ្ធិ (Unauthorized)' }

  const { data, error } = await supabase
    .from('students')
    .select('*')
    .eq('id', studentId)
    .eq('teacher_id', user.id)
    .maybeSingle()

  if (error) {
    logger.error(error)
    return { error: 'ទាញយកព័ត៌មានសិស្សមិនបានសម្រេច' }
  }
  if (!data) return { error: 'រកមិនឃើញសិស្សនេះ ឬអ្នកមិនមានសិទ្ធិកែព័ត៌មានទេ' }

  const t = (v: unknown) => (typeof v === 'string' ? v : v === null || v === undefined ? '' : String(v))
  const yn = (v: unknown) => (v === true ? YES : NO)

  return {
    student: {
      id: data.id,
      // Keyed by the FORM's names, not the column names — `formState.ts` owns
      // that vocabulary and the reducer restores straight from it.
      values: {
        studentId: t(data.student_id),
        grade: t(data.grade),
        studentName: t(data.name_kh),
        latinName: t(data.name_en),
        gender: t(data.gender),
        dob: t(data.dob),
        phone: t(data.phone),
        birthProvince: t(data.birth_province),
        birthDistrict: t(data.birth_district),
        birthCommune: t(data.birth_commune),
        birthVillage: t(data.birth_village),
        currProvince: t(data.curr_province),
        currDistrict: t(data.curr_district),
        currCommune: t(data.curr_commune),
        currVillage: t(data.curr_village),
        isNewStudent: yn(data.is_new_student),
        isRepeater: yn(data.is_repeater),
        orphanStatus: t(data.orphan_status),
        isDisabled: yn(data.is_disabled),
        poorStatus: t(data.poor_status),
        isEquity: yn(data.is_equity),
        isScholarship: yn(data.is_scholarship),
        fatherName: t(data.father_name),
        fatherJob: t(data.father_job),
        motherName: t(data.mother_name),
        motherJob: t(data.mother_job),
        guardianName: t(data.guardian_name),
        guardianJob: t(data.guardian_job),
        ethnicity: t(data.ethnicity),
        specialFeatures: t(data.special_features),
        otherRemarks: t(data.other_remarks),
        photoUrl: t(data.photo_url),
      },
    },
  }
}

/**
 * Save an edited pupil.
 *
 * The same field mapper `createStudent` uses, so the two paths write the same
 * columns. No class, no enrolment, no `teacher_id` — see the block comment
 * above for why each of those is excluded rather than merely unused.
 */
export async function updateStudent(
  studentId: string,
  formData: FormData,
): Promise<ActionResult> {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { error: 'មិនមានសិទ្ធិ (Unauthorized)' }

  const fields = studentFieldsFromForm(formData)
  if (!fields) {
    return { error: 'សូមបំពេញព័ត៌មានដែលមានសញ្ញា * ឱ្យបានគ្រប់គ្រាន់!' }
  }

  /*
   * `.select('id')` on the update, and a zero-row result treated as a refusal.
   *
   * The owner filter is applied by this query AND by RLS. Postgres reports a
   * policy-blocked UPDATE as zero rows affected, not as an error — so without
   * reading the result back, editing somebody else's pupil would return a
   * success toast and change nothing.
   */
  const { data: updated, error } = await supabase
    .from('students')
    .update(fields)
    .eq('id', studentId)
    .eq('teacher_id', user.id)
    .select('id')

  if (error) {
    logger.error(error)
    return { error: friendlyDbError(error, 'single') }
  }
  if (!updated || updated.length === 0) {
    return { error: 'រកមិនឃើញសិស្សនេះ ឬអ្នកមិនមានសិទ្ធិកែព័ត៌មានទេ' }
  }

  // Identity fields only, for the reason `student.created` gives: the trail
  // says who changed which pupil, not a second copy of their family's details.
  await auditLog({
    action: 'student.updated', entityType: 'student', entityId: studentId, actorId: user.id,
    newValue: { student_id: fields.student_id, name_kh: fields.name_kh, grade: fields.grade },
  })

  revalidatePath('/student-list')
  revalidatePath(`/students/${studentId}`)
  return { success: true }
}
