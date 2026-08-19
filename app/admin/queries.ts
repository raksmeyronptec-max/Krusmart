import 'server-only'

import { createClient } from '@/lib/supabase/server'
import { getUserRoles } from '@/lib/rbac/server'
import { parseSchemeConfig, type GradingSchemeConfig } from '@/lib/grading/scheme'
import type {
  AcademicYear,
  AuditLogEntry,
  Class,
  School,
  Subject,
} from '@/lib/types'

/**
 * Read helpers shared by the principal console.
 *
 * Every one resolves the caller's school from their roles rather than taking it
 * as an argument, so a page cannot accidentally query a school the signed-in
 * administrator does not belong to. RLS enforces the same boundary underneath.
 */

/** The school the current administrator manages, or null if unassigned. */
export async function getAdminSchool(): Promise<School | null> {
  const ctx = await getUserRoles()
  if (!ctx?.activeSchoolId) return null

  const supabase = await createClient()
  const { data } = await supabase
    .from('schools')
    .select('*')
    .eq('id', ctx.activeSchoolId)
    .maybeSingle()

  return data ?? null
}

export interface AdminScope {
  schoolId: string
  activeYear: AcademicYear | null
  years: AcademicYear[]
}

/** School + academic years, the context nearly every admin page needs. */
export async function getAdminScope(): Promise<AdminScope | null> {
  const ctx = await getUserRoles()
  if (!ctx?.activeSchoolId) return null

  const supabase = await createClient()
  const { data: years } = await supabase
    .from('academic_years')
    .select('*')
    .eq('school_id', ctx.activeSchoolId)
    .order('name', { ascending: false })

  const list = (years ?? []) as AcademicYear[]
  return {
    schoolId: ctx.activeSchoolId,
    activeYear: list.find((y) => y.is_active) ?? list[0] ?? null,
    years: list,
  }
}

export interface SchoolStats {
  students: number
  teachers: number
  classes: number
  subjects: number
  /** Percentage of present marks across all attendance in the active year. */
  attendanceRate: number | null
  /** Mean of every recorded monthly score, 0-10. */
  averageScore: number | null
}

/**
 * School-wide counters for the dashboard.
 *
 * Uses `head: true` count queries rather than pulling rows — the dashboard needs
 * totals, not records, and a school's roster can be thousands of rows.
 */
export async function getSchoolStats(scope: AdminScope): Promise<SchoolStats> {
  const supabase = await createClient()

  const classIdsRes = await supabase
    .from('classes')
    .select('id')
    .eq('academic_year_id', scope.activeYear?.id ?? '')

  const classIds = (classIdsRes.data ?? []).map((c) => c.id)

  const [students, teachers, subjects, attendance, scores] = await Promise.all([
    supabase.from('students').select('id', { count: 'exact', head: true }).eq('school_id', scope.schoolId),
    supabase.from('teacher_assignments').select('teacher_id', { count: 'exact', head: true })
      .in('class_id', classIds.length ? classIds : ['00000000-0000-0000-0000-000000000000']),
    supabase.from('subjects').select('id', { count: 'exact', head: true }).eq('school_id', scope.schoolId),
    classIds.length
      ? supabase.from('attendance').select('status').in('class_id', classIds)
      : Promise.resolve({ data: [] as { status: string }[] }),
    classIds.length
      ? supabase.from('scores').select('score_value').in('class_id', classIds).eq('score_type', 'monthly')
      : Promise.resolve({ data: [] as { score_value: number | null }[] }),
  ])

  const marks = (attendance.data ?? []) as { status: string }[]
  const present = marks.filter((m) => m.status === 'P').length
  const attendanceRate = marks.length ? Math.round((present / marks.length) * 1000) / 10 : null

  const values = ((scores.data ?? []) as { score_value: number | null }[])
    .map((s) => s.score_value)
    .filter((v): v is number => typeof v === 'number')
  const averageScore = values.length
    ? Math.round((values.reduce((a, b) => a + b, 0) / values.length) * 100) / 100
    : null

  return {
    students: students.count ?? 0,
    teachers: teachers.count ?? 0,
    classes: classIds.length,
    subjects: subjects.count ?? 0,
    attendanceRate,
    averageScore,
  }
}

/** One row of the teachers table. */
export interface TeacherRow {
  teacherId: string
  email: string | null
  fullName: string | null
  classes: string[]
  isHomeroom: boolean
}

/** Teachers holding an assignment in the active year. */
export async function getTeachers(scope: AdminScope): Promise<TeacherRow[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('teacher_assignments')
    .select('teacher_id, is_homeroom, classes(name), profiles:teacher_id(full_name)')
    .eq('academic_year_id', scope.activeYear?.id ?? '')

  const byTeacher = new Map<string, TeacherRow>()

  for (const raw of data ?? []) {
    const row = raw as {
      teacher_id: string
      is_homeroom: boolean
      classes?: { name?: string } | { name?: string }[] | null
      profiles?: { full_name?: string } | { full_name?: string }[] | null
    }
    const cls = Array.isArray(row.classes) ? row.classes[0] : row.classes
    const prof = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles

    const existing = byTeacher.get(row.teacher_id)
    if (existing) {
      if (cls?.name) existing.classes.push(cls.name)
      existing.isHomeroom = existing.isHomeroom || row.is_homeroom
    } else {
      byTeacher.set(row.teacher_id, {
        teacherId: row.teacher_id,
        email: null, // auth.users is not readable through PostgREST
        fullName: prof?.full_name ?? null,
        classes: cls?.name ? [cls.name] : [],
        isHomeroom: row.is_homeroom,
      })
    }
  }

  return [...byTeacher.values()]
}

/** Classes in the active year, with their grade and roster size. */
export interface ClassRow extends Class {
  gradeName: string
  levelName: string
  studentCount: number
}

export async function getClasses(scope: AdminScope): Promise<ClassRow[]> {
  const supabase = await createClient()

  const { data } = await supabase
    .from('classes')
    .select('id, grade_id, academic_year_id, name, capacity, created_at, grades(name, sort_order, education_levels(name))')
    .eq('academic_year_id', scope.activeYear?.id ?? '')

  const rows = (data ?? []) as unknown as (Class & {
    grades?: {
      name?: string
      sort_order?: number
      education_levels?: { name?: string } | { name?: string }[]
    } | null
  })[]

  const counts = await Promise.all(
    rows.map((c) =>
      supabase
        .from('student_enrollments')
        .select('id', { count: 'exact', head: true })
        .eq('class_id', c.id)
        .eq('status', 'active'),
    ),
  )

  return rows
    .map((c, i) => {
      const level = Array.isArray(c.grades?.education_levels)
        ? c.grades?.education_levels[0]
        : c.grades?.education_levels
      return {
        ...c,
        gradeName: c.grades?.name ?? '',
        levelName: level?.name ?? '',
        studentCount: counts[i].count ?? 0,
      }
    })
    .sort((a, b) => a.gradeName.localeCompare(b.gradeName, 'km') || a.name.localeCompare(b.name, 'km'))
}

export async function getSubjects(scope: AdminScope): Promise<Subject[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('subjects')
    .select('*')
    .eq('school_id', scope.schoolId)
    .order('name', { ascending: true })
  return (data ?? []) as Subject[]
}

export async function getAuditLogs(scope: AdminScope, limit = 100): Promise<AuditLogEntry[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('audit_logs')
    .select('*')
    .eq('school_id', scope.schoolId)
    .order('created_at', { ascending: false })
    .limit(limit)
  return (data ?? []) as AuditLogEntry[]
}

/** Grade options for the class-creation form, ordered by stage then grade. */
export interface GradeOption {
  id: string
  name: string
  levelName: string
  sortOrder: number
}

export async function getGradeOptions(scope: AdminScope): Promise<GradeOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('grades')
    .select('id, name, sort_order, education_levels!inner(name, school_id, sort_order)')
    .eq('education_levels.school_id', scope.schoolId)

  const rows = (data ?? []) as unknown as {
    id: string
    name: string
    sort_order: number
    education_levels?: { name?: string; sort_order?: number } | { name?: string; sort_order?: number }[]
  }[]

  return rows
    .map((g) => {
      const lvl = Array.isArray(g.education_levels) ? g.education_levels[0] : g.education_levels
      return {
        id: g.id,
        name: g.name,
        levelName: lvl?.name ?? '',
        sortOrder: (lvl?.sort_order ?? 0) * 100 + g.sort_order,
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
}

/** Staff in this school, for the teacher-assignment form. */
export interface StaffOption {
  id: string
  label: string
}

export async function getStaffOptions(scope: AdminScope): Promise<StaffOption[]> {
  const supabase = await createClient()
  // Readable since migration 00008 widened `profiles` for school administrators.
  const { data } = await supabase
    .from('profiles')
    .select('id, full_name, role')
    .eq('school_id', scope.schoolId)

  return ((data ?? []) as { id: string; full_name: string | null; role: string | null }[])
    .map((p) => ({
      id: p.id,
      label: p.full_name?.trim() || `(គណនី ${p.id.slice(0, 8)})`,
    }))
    .sort((a, b) => a.label.localeCompare(b.label, 'km'))
}

/** A grading scheme with its education level resolved. */
export interface GradingSchemeRow {
  id: string
  name: string
  isDefault: boolean
  levelName: string
  config: GradingSchemeConfig
}

export async function getGradingSchemes(scope: AdminScope): Promise<GradingSchemeRow[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('grading_schemes')
    .select('id, name, is_default, config, education_levels(name, sort_order)')
    .eq('school_id', scope.schoolId)

  const rows = (data ?? []) as unknown as {
    id: string
    name: string
    is_default: boolean
    config: unknown
    education_levels?: { name?: string; sort_order?: number } | { name?: string; sort_order?: number }[]
  }[]

  return rows
    .map((r) => {
      const lvl = Array.isArray(r.education_levels) ? r.education_levels[0] : r.education_levels
      return {
        id: r.id,
        name: r.name,
        isDefault: r.is_default,
        levelName: lvl?.name ?? 'ទូទៅ',
        sortOrder: lvl?.sort_order ?? 99,
        config: parseSchemeConfig(r.config),
      }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .map((r): GradingSchemeRow => ({
      id: r.id, name: r.name, isDefault: r.isDefault, levelName: r.levelName, config: r.config,
    }))
}
