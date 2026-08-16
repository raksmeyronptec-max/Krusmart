'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { listScoreTemplateSubjects } from '@/app/(main)/score/template/actions'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import {
  resolveTemplate,
  SYSTEM_PRIMARY_TEMPLATE,
  type EffectiveSubject,
  type TemplateScoreType,
} from '@/lib/scores/template'
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
  subjects: EffectiveSubject[]
  rows: ScoreTemplateSubjectRow[]
  loading: boolean
  reload: () => Promise<void>
} {
  const { classId, loading: classLoading } = useActiveClass()

  const [rows, setRows] = useState<ScoreTemplateSubjectRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    setRows(await listScoreTemplateSubjects(classId ?? undefined))
  }, [classId])

  useEffect(() => {
    // Wait for the class context: fetching first with no class and again with
    // one would issue two requests to render the same list in the common case.
    // The fallback covers the interval, so nothing is blank meanwhile.
    if (classLoading) return

    let cancelled = false

    const run = async () => {
      try {
        const fetched = await listScoreTemplateSubjects(classId ?? undefined)
        if (!cancelled) setRows(fetched)
      } catch (e) {
        logger.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [classId, classLoading])

  const subjects = useMemo(
    () => resolveTemplate(rows.length > 0 ? rows : SYSTEM_PRIMARY_TEMPLATE, scoreType),
    [rows, scoreType],
  )

  return { subjects, rows, loading: loading || classLoading, reload }
}
