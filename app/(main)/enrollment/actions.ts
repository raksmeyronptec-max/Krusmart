'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'
import { resolveServerScope } from '@/lib/utils/serverScope'
import type { QueryScope } from '@/lib/utils/queryFilter'
import type { StudentImportRow } from '@/lib/types'
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
  return `មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ៖ ${error.message}`
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

  // extract data
  const student_id = formData.get('studentId') as string
  const grade = formData.get('grade') as string
  const name_kh = formData.get('studentName') as string
  const name_en = formData.get('latinName') as string
  const gender = formData.get('gender') as string
  const dob = formData.get('dob') as string
  const phone = formData.get('phone') as string

  const birth_province = formData.get('birthProvince') as string
  const birth_district = formData.get('birthDistrict') as string
  const birth_commune = formData.get('birthCommune') as string
  const birth_village = formData.get('birthVillage') as string

  const curr_province = formData.get('currProvince') as string
  const curr_district = formData.get('currDistrict') as string
  const curr_commune = formData.get('currCommune') as string
  const curr_village = formData.get('currVillage') as string

  const is_new_student = formData.get('isNewStudent') === 'បាទ/ចាស'
  const is_repeater = formData.get('isRepeater') === 'បាទ/ចាស'
  const orphan_status = formData.get('orphanStatus') as string
  const is_disabled = formData.get('isDisabled') === 'បាទ/ចាស'
  const poor_status = formData.get('poorStatus') as string
  const is_equity = formData.get('isEquity') === 'បាទ/ចាស'
  const is_scholarship = formData.get('isScholarship') === 'បាទ/ចាស'

  const father_name = formData.get('fatherName') as string
  const father_job = formData.get('fatherJob') as string
  const mother_name = formData.get('motherName') as string
  const mother_job = formData.get('motherJob') as string
  const guardian_name = formData.get('guardianName') as string
  const guardian_job = formData.get('guardianJob') as string

  const ethnicity = formData.get('ethnicity') as string
  const special_features = formData.get('specialFeatures') as string
  const other_remarks = formData.get('otherRemarks') as string
  const photo_url = formData.get('photoUrl') as string

  if (!student_id || !grade || !name_kh || !gender || !dob) {
    return { error: 'សូមបំពេញព័ត៌មានដែលមានសញ្ញា * ឱ្យបានគ្រប់គ្រាន់!' }
  }

  const row = {
    teacher_id: user.id,
    student_id,
    grade,
    name_kh,
    name_en,
    gender,
    dob,
    phone,
    birth_province,
    birth_district,
    birth_commune,
    birth_village,
    curr_province,
    curr_district,
    curr_commune,
    curr_village,
    is_new_student,
    is_repeater,
    orphan_status,
    is_disabled,
    poor_status,
    is_equity,
    is_scholarship,
    father_name,
    father_job,
    mother_name,
    mother_job,
    guardian_name,
    guardian_job,
    ethnicity,
    special_features,
    other_remarks,
    photo_url
  }

  if (scope.mode === 'legacy') {
    // Pre-V2 account: exactly the write this action always made. teacher_id
    // is the only boundary there is; no enrolment row exists or is needed.
    const { error } = await supabase.from('students').insert(row)

    if (error) {
      logger.error(error)
      return { error: friendlyDbError(error, 'single') }
    }
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
  return { success: true }
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
