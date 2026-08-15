'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  importCustomSubjects,
  listCustomSubjects,
} from '@/app/(main)/score/custom-subjects/actions'
import { readLegacyCustomSubjects, toImportPayload } from '@/lib/storage/custom-subjects'
import type { CustomSubjectRow } from '@/lib/types'
import { logger } from '@/lib/utils/logger'

/**
 * Load the teacher's custom subjects, importing the browser's old
 * `localStorage` copy the first time.
 *
 * Both score grids need the same three steps — fetch, one-time import, refetch —
 * and getting the order wrong would either lose a teacher's subjects or import
 * them repeatedly, so the sequence lives here rather than in each client.
 *
 * The import runs only when Supabase returns nothing *and* localStorage has
 * something, so it fires at most once per account: after the first run the
 * database is non-empty and the branch is never taken again. `importCustomSubjects`
 * also skips duplicate names, which covers the two-tabs-at-once case.
 */
export function useCustomSubjects(): {
  subjects: CustomSubjectRow[]
  loading: boolean
  reload: () => Promise<void>
} {
  const [subjects, setSubjects] = useState<CustomSubjectRow[]>([])
  const [loading, setLoading] = useState(true)

  const reload = useCallback(async () => {
    const rows = await listCustomSubjects()
    setSubjects(rows)
  }, [])

  useEffect(() => {
    let cancelled = false

    const run = async () => {
      try {
        const rows = await listCustomSubjects()

        if (rows.length === 0) {
          const legacy = readLegacyCustomSubjects()
          if (legacy.length > 0) {
            const result = await importCustomSubjects(legacy.map(toImportPayload))
            if (result.error) logger.error(result.error)
            const after = await listCustomSubjects()
            if (!cancelled) setSubjects(after)
            return
          }
        }

        if (!cancelled) setSubjects(rows)
      } catch (e) {
        logger.error(e)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    run()
    return () => { cancelled = true }
  }, [])

  return { subjects, loading, reload }
}
