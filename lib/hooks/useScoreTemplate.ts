'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listScoreTemplateSubjects } from '@/app/(main)/score/template/actions'
import { getClassTeachingRole } from '@/app/(main)/score/template/roleActions'
import { listClassSelection } from '@/app/(main)/score/subjects/selectionActions'
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
import {
  applySelection,
  hasConfiguredSelection,
  type ClassSubjectSelection,
} from '@/lib/scores/selection'
import { schemeForLevel } from '@/lib/grading/levelSchemes'
import type { GradingSchemeConfig } from '@/lib/grading/scheme'
import type { ScoreTemplateSubjectRow } from '@/lib/types'
import { logger } from '@/lib/utils/logger'

/**
 * The subjects the active class enters marks for.
 *
 * Fetch, loading, reload — with one property that matters: the *rows* are
 * fetched once and re-resolved on every score-type change, so flipping between
 * monthly and semester costs nothing. The fetch depends only on which class is
 * active. Since 00027 this is the only source of a class's subject list; there
 * is no second store to merge.
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
  /**
   * What the CLASS teaches — the template narrowed by its own selection, but
   * NOT by who is looking.
   *
   * This is the list every results and aggregation surface wants: `/score/total`
   * must show the class's whole configured curriculum whether a homeroom
   * teacher or a subject teacher opens it, because a ranking that divides by
   * one teacher's own subject is not the class's ranking. `mySubjects` narrows
   * further, by role, and only score *entry* wants that.
   */
  classSubjects: EffectiveSubject[]
  /** The subset this teacher may enter marks for. Score entry uses this. */
  mySubjects: EffectiveSubject[]
  /** The class's chosen subjects (00028). Empty when it has not configured any. */
  selection: ClassSubjectSelection[]
  /**
   * Has this class configured the current score type's subject list?
   *
   * False drives the first-visit setup state on `/score/enter` (§12). It means
   * "never configured", which is never the same as "teaches nothing".
   */
  configured: boolean
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
  const [selection, setSelection] = useState<ClassSubjectSelection[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const [next, nextRole, nextSelection] = await Promise.all([
      listScoreTemplateSubjects(classId ?? undefined),
      getClassTeachingRole(classId ?? undefined),
      listClassSelection(classId ?? undefined),
    ])
    setRows(next.rows)
    setContext(next.context)
    setRole(nextRole)
    setSelection(nextSelection)
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
        const [fetched, fetchedRole, fetchedSelection] = await Promise.all([
          listScoreTemplateSubjects(classId ?? undefined),
          getClassTeachingRole(classId ?? undefined),
          listClassSelection(classId ?? undefined),
        ])
        if (!cancelled) {
          setRows(fetched.rows)
          setContext(fetched.context)
          setRole(fetchedRole)
          setSelection(fetchedSelection)
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
  // Narrow to what the class teaches. `applySelection` returns the full list
  // untouched when the class has configured nothing, so an account that never
  // opens the configuration screen keeps exactly today's list.
  const classSubjects = useMemo(
    () => applySelection(subjects, selection),
    [subjects, selection],
  )

  const mySubjects = useMemo(() => {
    if (role.coversWholeClass) return classSubjects
    const mine = new Set(role.subjectKeys)
    return classSubjects.filter((s) => mine.has(s.subjectKey))
  }, [classSubjects, role])

  /**
   * Whether the class has configured *this* score type.
   *
   * Per score type, not per class: a teacher who set up their monthly subjects
   * and has not yet opened the semester grid must not find it empty, so the
   * semester grid keeps resolving the whole template until configured itself.
   */
  const configured = useMemo(
    () => hasConfiguredSelection(subjects, selection),
    [subjects, selection],
  )

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
    subjects, classSubjects, mySubjects, selection, configured, rows, context,
    role, scheme, levelCurriculum, loading: loading || classLoading, reload,
  }
}
