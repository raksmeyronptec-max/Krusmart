'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listScoreTemplateSubjects } from '@/app/(main)/score/template/actions'
import { getClassTeachingRole } from '@/app/(main)/score/template/roleActions'
import type { ClassTeachingRole } from '@/lib/utils/serverScope'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import {
  resolveTemplate,
  usesLevelCurriculum,
  SYSTEM_PRIMARY_TEMPLATE,
  type EffectiveSubject,
  type TemplateContext,
  type TemplateScoreType,
} from '@/lib/scores/template'
import { schemeForLevel } from '@/lib/grading/levelSchemes'
import type { GradingSchemeConfig } from '@/lib/grading/scheme'
import type { ScoreTemplateSubjectRow } from '@/lib/types'
import { logger } from '@/lib/utils/logger'

/**
 * The subjects the active class enters marks for.
 *
 * Same shape as `useCustomSubjects` — fetch, loading, reload — with one
 * difference that matters: the *rows* are fetched once and re-resolved on every
 * score-type change, so flipping between monthly and semester costs nothing.
 * The fetch depends only on which class is active.
 *
 * Falls back to `SYSTEM_PRIMARY_TEMPLATE` whenever the fetch has not produced
 * rows: during the first render, while `TeacherContext` is still resolving,
 * for a legacy account with no class, and on a database where migration 00016
 * has not been applied. All four cases render exactly the list the app shipped
 * with. The picker is never empty — to a teacher mid-entry, an empty picker is
 * indistinguishable from having lost their subjects.
 */
export function useScoreTemplate(scoreType: TemplateScoreType): {
  /** The class's whole effective template — what every aggregation must weigh. */
  subjects: EffectiveSubject[]
  /** The subset this teacher may enter marks for. Score entry uses this. */
  mySubjects: EffectiveSubject[]
  rows: ScoreTemplateSubjectRow[]
  context: TemplateContext | null
  /**
   * What this teacher is to the class — whole-class (homeroom, primary or
   * legacy) or a subject teacher. Derived from `teacher_assignments`.
   */
  role: ClassTeachingRole
  /**
   * The grading scheme the class's education level uses. Legacy accounts and
   * unresolved contexts get the primary default — grading exactly as before
   * levels existed.
   */
  scheme: GradingSchemeConfig
  /** True when a level-specific curriculum (hs_* etc.) is in effect, not the primary fallback. */
  levelCurriculum: boolean
  loading: boolean
  reload: () => Promise<void>
} {
  const { classId, loading: classLoading } = useActiveClass()

  const [rows, setRows] = useState<ScoreTemplateSubjectRow[]>([])
  // The class's curriculum context (level / grade / track, 00021). Null for a
  // legacy account, which is exactly the fallback `filterRowsForContext` wants.
  const [context, setContext] = useState<TemplateContext | null>(null)
  // Whole-class until proven otherwise: a teacher must never be narrowed to
  // nothing by a slow or failed read.
  const [role, setRole] = useState<ClassTeachingRole>({
    isHomeroom: false, subjectKeys: [], coversWholeClass: true,
  })
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [next, nextRole] = await Promise.all([
      listScoreTemplateSubjects(classId ?? undefined),
      getClassTeachingRole(classId ?? undefined),
    ])
    setRows(next.rows)
    setContext(next.context)
    setRole(nextRole)
  }, [classId])

  useEffect(() => {
    // Wait for the class context: fetching first with no class and again with
    // one would issue two requests to render the same list in the common case.
    // The fallback covers the interval, so nothing is blank meanwhile.
    if (classLoading) return

    let cancelled = false

    const run = async () => {
      try {
        // One round trip each, in parallel — the template and the role are
        // independent reads and neither blocks the other.
        const [fetched, fetchedRole] = await Promise.all([
          listScoreTemplateSubjects(classId ?? undefined),
          getClassTeachingRole(classId ?? undefined),
        ])
        if (!cancelled) {
          setRows(fetched.rows)
          setContext(fetched.context)
          setRole(fetchedRole)
        }
      } catch (e) {
        logger.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [classId, classLoading])

  /**
   * The class's whole effective template.
   *
   * Deliberately NOT narrowed by the caller's assignments: every aggregation
   * surface — totals, ranking, certificate, honour roll, parent report,
   * tracking — must weigh the class's full curriculum whoever is looking at
   * it. Narrowing here would make a subject teacher's ranking screen divide by
   * their own subject alone.
   */
  const subjects = useMemo(
    () => resolveTemplate(rows.length > 0 ? rows : SYSTEM_PRIMARY_TEMPLATE, scoreType, context),
    [rows, context, scoreType],
  )

  /**
   * What this teacher may actually enter — the score-entry picker's list, and
   * only that.
   *
   * A subject teacher gets their assigned subjects; a homeroom teacher, a
   * primary teacher and a legacy account all cover the whole class and get the
   * full template. The mode comes from the assignments, never from the
   * education level.
   */
  const mySubjects = useMemo(() => {
    if (role.coversWholeClass) return subjects
    const mine = new Set(role.subjectKeys)
    return subjects.filter((s) => mine.has(s.subjectKey))
  }, [subjects, role])

  // Scheme awareness rides on the *curriculum actually in effect*, not the
  // level alone: a grade-12 class whose track is unset falls back to the
  // primary subject list, and grading it /50 while showing /10 subjects would
  // be worse than either world.
  const levelCurriculum = useMemo(() => usesLevelCurriculum(rows, context), [rows, context])
  const scheme = useMemo(
    () => (levelCurriculum ? schemeForLevel(context?.levelKey) : schemeForLevel(null)),
    [levelCurriculum, context],
  )

  return {
    subjects, mySubjects, rows, context, role, scheme, levelCurriculum,
    loading: loading || classLoading, reload,
  }
}
