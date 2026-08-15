'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import { logger } from '@/lib/utils/logger'
import type { StudentImportRow } from '@/lib/types'
import { auditLog, auditLogBatch } from '@/lib/audit/log'

export async function createStudent(formData: FormData) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return { error: 'មិនមានសិទ្ធិ (Unauthorized)' }
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

  const { error } = await supabase.from('students').insert({
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
  })

  if (error) {
    logger.error(error)
    return { error: 'មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ៖ ' + error.message }
  }

  // Identity fields only. The trail records that a student was enrolled and by
  // whom — copying the full demographic record (parents, address, poverty
  // status) into an admin-readable log would be a needless second store of it.
  await auditLog({
    action: 'student.created', entityType: 'student', entityId: null, actorId: user.id,
    newValue: { student_id, name_kh, grade },
  })

  revalidatePath('/student-list')
  return { success: true }
}

export async function importStudents(students: StudentImportRow[]) {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()

  if (authError || !user) {
    return { error: 'មិនមានសិទ្ធិបញ្ចូលទិន្នន័យទេ' }
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

  const { error } = await supabase.from('students').insert(studentsToInsert)

  if (error) {
    logger.error(error)
    return { error: 'មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ៖ ' + error.message }
  }

  await auditLogBatch('student.imported', 'student', studentsToInsert.length, undefined, user.id)

  revalidatePath('/student-list')
  return { success: true }
}
