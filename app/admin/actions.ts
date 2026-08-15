'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac/server'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import { getErrorMessageOr } from '@/lib/utils/errors'
import type { ActionResult } from '@/lib/types'

/**
 * Write operations for the principal console.
 *
 * Every action follows the same shape:
 *   1. `requirePermission` — rejects on role,
 *   2. the school is taken from the caller's own context, never from the client,
 *      so a forged form field cannot write into another school,
 *   3. RLS independently enforces the same boundary,
 *   4. success is recorded in `audit_logs`.
 *
 * Duplicate submissions surface as Khmer messages rather than raw Postgres
 * errors — every table here carries a UNIQUE constraint that would otherwise
 * produce `23505`.
 */

/** Postgres unique_violation. */
const UNIQUE_VIOLATION = '23505'

// -----------------------------------------------------------------------------
// Academic years
// -----------------------------------------------------------------------------

export async function createAcademicYear(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('academic_years:create')
    if (!ctx.activeSchoolId) return { error: 'គណនីរបស់អ្នកមិនទាន់បានភ្ជាប់ជាមួយសាលាទេ' }

    const name = String(formData.get('name') ?? '').trim()
    if (!name) return { error: 'សូមបញ្ចូលឈ្មោះឆ្នាំសិក្សា' }

    const startDate = String(formData.get('start_date') ?? '').trim() || null
    const endDate = String(formData.get('end_date') ?? '').trim() || null

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('academic_years')
      .insert({ school_id: ctx.activeSchoolId, name, start_date: startDate, end_date: endDate, is_active: false })
      .select('id')
      .single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { error: 'ឆ្នាំសិក្សានេះមានរួចហើយ' }
      logger.error(error)
      return { error: error.message }
    }

    await auditLog({
      action: 'academic_year.created', entityType: 'academic_year', entityId: data.id,
      schoolId: ctx.activeSchoolId, newValue: { name },
    })

    revalidatePath('/admin/academic-years')
    return { success: true }
  } catch (error) {
    return { error: getErrorMessageOr(error, 'មានបញ្ហាក្នុងការបង្កើតឆ្នាំសិក្សា') }
  }
}

/**
 * Make one year current. Exactly one year per school carries `is_active`, so the
 * previous holder is cleared first.
 */
export async function setActiveAcademicYear(yearId: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('academic_years:update')
    if (!ctx.activeSchoolId) return { error: 'គណនីរបស់អ្នកមិនទាន់បានភ្ជាប់ជាមួយសាលាទេ' }

    const supabase = await createClient()

    const { error: clearErr } = await supabase
      .from('academic_years')
      .update({ is_active: false })
      .eq('school_id', ctx.activeSchoolId)
    if (clearErr) {
      logger.error(clearErr)
      return { error: clearErr.message }
    }

    const { error } = await supabase
      .from('academic_years')
      .update({ is_active: true })
      .eq('id', yearId)
      .eq('school_id', ctx.activeSchoolId)

    if (error) {
      logger.error(error)
      return { error: error.message }
    }

    await auditLog({
      action: 'academic_year.activated', entityType: 'academic_year', entityId: yearId,
      schoolId: ctx.activeSchoolId,
    })

    revalidatePath('/admin/academic-years')
    revalidatePath('/admin/dashboard')
    return { success: true }
  } catch (error) {
    return { error: getErrorMessageOr(error, 'មានបញ្ហាក្នុងការកំណត់ឆ្នាំសិក្សា') }
  }
}

// -----------------------------------------------------------------------------
// Subjects
// -----------------------------------------------------------------------------

export async function createSubject(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('subjects:create')
    if (!ctx.activeSchoolId) return { error: 'គណនីរបស់អ្នកមិនទាន់បានភ្ជាប់ជាមួយសាលាទេ' }

    const name = String(formData.get('name') ?? '').trim()
    if (!name) return { error: 'សូមបញ្ចូលឈ្មោះមុខវិជ្ជា' }

    const code = String(formData.get('code') ?? '').trim() || null
    const nameEn = String(formData.get('name_en') ?? '').trim() || null

    const supabase = await createClient()
    const { data, error } = await supabase
      .from('subjects')
      .insert({ school_id: ctx.activeSchoolId, name, name_en: nameEn, code, is_active: true })
      .select('id')
      .single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { error: 'មុខវិជ្ជានេះមានរួចហើយ' }
      logger.error(error)
      return { error: error.message }
    }

    await auditLog({
      action: 'subject.created', entityType: 'subject', entityId: data.id,
      schoolId: ctx.activeSchoolId, newValue: { name, code },
    })

    revalidatePath('/admin/subjects')
    return { success: true }
  } catch (error) {
    return { error: getErrorMessageOr(error, 'មានបញ្ហាក្នុងការបង្កើតមុខវិជ្ជា') }
  }
}

// -----------------------------------------------------------------------------
// Classes
// -----------------------------------------------------------------------------

export async function createClass(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('classes:create')
    if (!ctx.activeSchoolId) return { error: 'គណនីរបស់អ្នកមិនទាន់បានភ្ជាប់ជាមួយសាលាទេ' }

    const name = String(formData.get('name') ?? '').trim()
    const gradeId = String(formData.get('grade_id') ?? '').trim()
    const yearId = String(formData.get('academic_year_id') ?? '').trim()
    const capacityRaw = String(formData.get('capacity') ?? '').trim()

    if (!name) return { error: 'សូមបញ្ចូលឈ្មោះថ្នាក់' }
    if (!gradeId) return { error: 'សូមជ្រើសរើសកម្រិតថ្នាក់' }
    if (!yearId) return { error: 'សូមជ្រើសរើសឆ្នាំសិក្សា' }

    const supabase = await createClient()

    // The year must belong to the caller's school; a forged id must not create a
    // class inside somebody else's school.
    const { data: year } = await supabase
      .from('academic_years')
      .select('id')
      .eq('id', yearId)
      .eq('school_id', ctx.activeSchoolId)
      .maybeSingle()

    if (!year) return { error: 'ឆ្នាំសិក្សាមិនត្រឹមត្រូវទេ' }

    const { data, error } = await supabase
      .from('classes')
      .insert({
        name,
        grade_id: gradeId,
        academic_year_id: yearId,
        capacity: capacityRaw ? Number(capacityRaw) : null,
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { error: 'ថ្នាក់នេះមានរួចហើយក្នុងឆ្នាំសិក្សានេះ' }
      logger.error(error)
      return { error: error.message }
    }

    await auditLog({
      action: 'class.created', entityType: 'class', entityId: data.id,
      schoolId: ctx.activeSchoolId, newValue: { name, grade_id: gradeId, academic_year_id: yearId },
    })

    revalidatePath('/admin/classes')
    return { success: true }
  } catch (error) {
    return { error: getErrorMessageOr(error, 'មានបញ្ហាក្នុងការបង្កើតថ្នាក់') }
  }
}

// -----------------------------------------------------------------------------
// Teacher assignments
// -----------------------------------------------------------------------------

export async function assignTeacher(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('teachers:update')
    if (!ctx.activeSchoolId) return { error: 'គណនីរបស់អ្នកមិនទាន់បានភ្ជាប់ជាមួយសាលាទេ' }

    const teacherId = String(formData.get('teacher_id') ?? '').trim()
    const classId = String(formData.get('class_id') ?? '').trim()
    const subjectId = String(formData.get('subject_id') ?? '').trim() || null
    const isHomeroom = formData.get('is_homeroom') === 'on'

    if (!teacherId) return { error: 'សូមជ្រើសរើសគ្រូបង្រៀន' }
    if (!classId) return { error: 'សូមជ្រើសរើសថ្នាក់' }

    const supabase = await createClient()

    const { data: cls } = await supabase
      .from('classes')
      .select('id, academic_year_id, academic_years!inner(school_id)')
      .eq('id', classId)
      .maybeSingle()

    if (!cls) return { error: 'រកមិនឃើញថ្នាក់ទេ' }

    const year = cls as { academic_year_id: string; academic_years?: { school_id?: string } | { school_id?: string }[] }
    const rel = Array.isArray(year.academic_years) ? year.academic_years[0] : year.academic_years
    if (rel?.school_id !== ctx.activeSchoolId) {
      return { error: 'ថ្នាក់នេះមិនស្ថិតក្នុងសាលារបស់អ្នកទេ' }
    }

    const { data, error } = await supabase
      .from('teacher_assignments')
      .insert({
        teacher_id: teacherId,
        class_id: classId,
        subject_id: subjectId,
        academic_year_id: cls.academic_year_id,
        is_homeroom: isHomeroom,
        status: 'active',
      })
      .select('id')
      .single()

    if (error) {
      if (error.code === UNIQUE_VIOLATION) return { error: 'គ្រូនេះត្រូវបានចាត់តាំងរួចហើយ' }
      logger.error(error)
      return { error: error.message }
    }

    await auditLog({
      action: 'teacher_assignment.created', entityType: 'teacher_assignment', entityId: data.id,
      schoolId: ctx.activeSchoolId,
      newValue: { teacher_id: teacherId, class_id: classId, subject_id: subjectId, is_homeroom: isHomeroom },
    })

    revalidatePath('/admin/teachers')
    return { success: true }
  } catch (error) {
    return { error: getErrorMessageOr(error, 'មានបញ្ហាក្នុងការចាត់តាំងគ្រូ') }
  }
}

export async function removeAssignment(assignmentId: string): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('teachers:update')

    const supabase = await createClient()
    const { error } = await supabase.from('teacher_assignments').delete().eq('id', assignmentId)

    if (error) {
      logger.error(error)
      return { error: error.message }
    }

    await auditLog({
      action: 'teacher_assignment.deleted', entityType: 'teacher_assignment',
      entityId: assignmentId, schoolId: ctx.activeSchoolId,
    })

    revalidatePath('/admin/teachers')
    return { success: true }
  } catch (error) {
    return { error: getErrorMessageOr(error, 'មានបញ្ហាក្នុងការលុបការចាត់តាំង') }
  }
}

// -----------------------------------------------------------------------------
// Assessments
// -----------------------------------------------------------------------------

/**
 * Create an assessment against a class+subject.
 *
 * Assessments are the V2 path. They coexist with the legacy `score_type` /
 * `score_period` discrimination rather than replacing it: nothing here touches
 * the monthly, semester, annual or homework rows the app already writes.
 */
export async function createAssessment(formData: FormData): Promise<ActionResult> {
  try {
    const ctx = await requirePermission('assessments:create')
    if (!ctx.activeSchoolId) return { error: 'គណនីរបស់អ្នកមិនទាន់បានភ្ជាប់ជាមួយសាលាទេ' }

    const name = String(formData.get('name') ?? '').trim()
    const classSubjectId = String(formData.get('class_subject_id') ?? '').trim()
    const type = String(formData.get('type') ?? '').trim()

    if (!name) return { error: 'សូមបញ្ចូលឈ្មោះការវាយតម្លៃ' }
    if (!classSubjectId) return { error: 'សូមជ្រើសរើសថ្នាក់ និងមុខវិជ្ជា' }
    if (!type) return { error: 'សូមជ្រើសរើសប្រភេទ' }

    const maxScore = Number(formData.get('max_score') ?? 10) || 10
    const weight = Number(formData.get('weight') ?? 1) || 1
    const term = String(formData.get('term') ?? '').trim() || null
    const date = String(formData.get('date') ?? '').trim() || null

    if (maxScore <= 0) return { error: 'ពិន្ទុអតិបរមាត្រូវតែធំជាងសូន្យ' }
    if (weight <= 0) return { error: 'តម្លៃទម្ងន់ត្រូវតែធំជាងសូន្យ' }

    const supabase = await createClient()

    // The class_subject must sit in the caller's school; a forged id must not
    // create an assessment inside somebody else's school.
    const { data: cs } = await supabase
      .from('class_subjects')
      .select('id, classes!inner(academic_year_id, academic_years!inner(school_id))')
      .eq('id', classSubjectId)
      .maybeSingle()

    if (!cs) return { error: 'រកមិនឃើញថ្នាក់ និងមុខវិជ្ជាទេ' }

    const rel = cs as { classes?: { academic_year_id?: string; academic_years?: { school_id?: string } | { school_id?: string }[] } | { academic_year_id?: string; academic_years?: unknown }[] }
    const cls = Array.isArray(rel.classes) ? rel.classes[0] : rel.classes
    const year = Array.isArray(cls?.academic_years) ? cls?.academic_years[0] : cls?.academic_years
    if ((year as { school_id?: string })?.school_id !== ctx.activeSchoolId) {
      return { error: 'ថ្នាក់នេះមិនស្ថិតក្នុងសាលារបស់អ្នកទេ' }
    }

    const { data, error } = await supabase
      .from('assessments')
      .insert({
        class_subject_id: classSubjectId,
        academic_year_id: cls?.academic_year_id,
        name, type, max_score: maxScore, weight, term, date, status: 'active',
      })
      .select('id')
      .single()

    if (error) {
      logger.error(error)
      return { error: error.message }
    }

    await auditLog({
      action: 'assessment.created', entityType: 'assessment', entityId: data.id,
      schoolId: ctx.activeSchoolId, newValue: { name, type, max_score: maxScore, weight },
    })

    revalidatePath('/admin/grading')
    return { success: true }
  } catch (error) {
    return { error: getErrorMessageOr(error, 'មានបញ្ហាក្នុងការបង្កើតការវាយតម្លៃ') }
  }
}
