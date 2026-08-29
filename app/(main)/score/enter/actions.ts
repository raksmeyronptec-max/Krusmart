'use server'

import { createClient } from '@/lib/supabase/server'
import { revalidatePath } from 'next/cache'
import type { ActionResult, Score, ScoreInput } from '@/lib/types'
import { logger } from '@/lib/utils/logger'
import {
    fetchScoreCalendar, resolveServerScope, rosterIdsForScope, resolveServerGradingContext,
} from '@/lib/utils/serverScope'
import { auditLogBatch } from '@/lib/audit/log'
import { clampScoreCell, splitScoreCell } from '@/lib/utils/score-value'
import { isMonthId } from '@/lib/constants/months'
import type { TemplateScoreType } from '@/lib/scores/template'

/**
 * Period locking (§11.8) is enforced HERE, not in RLS. A policy on `scores`
 * that consulted `score_calendar_periods` would be the strongest wall, but it
 * prices a subquery into every upsert on the app's hottest write path, and
 * this action is the only writer the app has. The trade-off is deliberate:
 * the server check suffices until several teachers genuinely share one class
 * — write the RLS policy the day direct-PostgREST writes matter.
 */

/**
 * `classId` is optional and mirrors `saveScores` below: omitted, the scope
 * resolver falls back to the teacher's homeroom assignment, which is what every
 * single-class account wants. Passing it matters once a teacher holds several
 * classes — without it the roster came from the requested `?class=` while the
 * marks came from the homeroom, so a subject class showed an empty grid.
 *
 * It cannot widen access: `resolveServerScope` only honours a class the caller
 * actually holds an active assignment for, and RLS is the boundary regardless.
 */
export async function getScores(scoreType: string, scorePeriod: string, classId?: string): Promise<Score[]> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return []

    // 00007: an assigned teacher reads all subjects for the class, so the
    // roster — not ownership — is the boundary. Legacy accounts keep teacher_id.
    const scope = await resolveServerScope(user.id, classId)
    const rosterIds = await rosterIdsForScope(scope)

    let query = supabase
        .from('scores')
        .select('*')
        .eq('score_type', scoreType)
        .eq('score_period', scorePeriod)

    query = rosterIds ? query.in('student_id', rosterIds) : query.eq('teacher_id', user.id)

    const { data, error } = await query

    if (error) {
        logger.error(error)
        return []
    }

    return data || []
}

/**
 * `classId` is optional: when omitted the scope resolver falls back to the
 * teacher's homeroom assignment, which is correct for every single-class
 * account. Passing it explicitly matters once a teacher holds several classes.
 */
export async function saveScores(scoreType: string, scorePeriod: string, scoresData: ScoreInput[], classId?: string): Promise<ActionResult> {
    const supabase = await createClient()

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { error: 'Unauthorized' }

    // scoresData is an array of objects: { student_id, subject, score_value }
    // We'll prepare upsert payload
    // Stamp the V2 columns so new rows join the class structure. Without this a
    // score saved today would carry no class_id and be invisible to any future
    // class-scoped read.
    const scope = await resolveServerScope(user.id, classId)
    const scopeCols = scope.mode === 'v2'
        ? { class_id: scope.classId, academic_year_id: scope.academicYearId }
        : {}

    // A locked period refuses the write — the UI's read-only grid is not the
    // boundary, this is (see the module header for the RLS trade-off). Only
    // monthly periods lock: their `score_period` is `<monthId>-<year>`, so a
    // semester ('sem1-…'), annual or homework period never parses as a month.
    // Matching by MEMBERSHIP, not key, so a direct write to an absorbed month
    // ('apr' inside a locked merged mar-apr) is refused too.
    if (scoreType === 'monthly') {
        const sep = scorePeriod.indexOf('-')
        const monthId = sep > 0 ? scorePeriod.slice(0, sep) : ''
        const year = sep > 0 ? scorePeriod.slice(sep + 1) : ''
        if (isMonthId(monthId) && year !== '') {
            const calendar = await fetchScoreCalendar(scope, year)
            const period = calendar.find(p => p.members.includes(monthId))
            if (period?.locked) {
                return { error: `វគ្គ ${period.labelKm} បានចាក់សោ — មិនអាចកែពិន្ទុបានទេ` }
            }
        }
    }

    // The clamp's server half: the client snaps 11 to 10 as it is typed, but a
    // direct call to this action is the real boundary. The maximum comes from
    // the same template resolver the entry grid reads (`maxByColumn`), so the
    // two cannot drift. A column the resolved template does not define passes
    // through unclamped — that is deliberate, not a gap: homework saves through
    // here too, and over-maximum homework marks are a documented warning, not
    // an error (see markIssue in homework/enter/scores.ts — a school marking
    // homework out of twenty is not doing anything illegal).
    const templateScoreType: TemplateScoreType =
        scoreType === 'semester' || scoreType === 'annual' || scoreType === 'homework'
            ? scoreType
            : 'monthly'
    const { maxByColumn } = await resolveServerGradingContext(user.id, classId, templateScoreType)

    const clampCell = (s: ScoreInput): string | number | null => {
        const max = maxByColumn[s.subject]
        if (max === undefined || s.score_value === null) return s.score_value
        return clampScoreCell(String(s.score_value), max)
    }

    // `splitScoreCell` decides which column the cell belongs in. This used to be
    // a bare `parseFloat`, which silently destroyed every behavioural rating:
    // parseFloat('ល្អ') is NaN, JSON.stringify turns NaN into null, and the row
    // was written as NULL with a 201 and a success toast. See migration 00012.
    // (`clampScoreCell` uses the same number-or-text rule, so a Khmer rating
    // passes through both untouched.)
    const upsertPayload = scoresData.map(s => ({
        ...scopeCols,
        teacher_id: user.id,
        student_id: s.student_id,
        subject: s.subject,
        score_type: scoreType,
        score_period: scorePeriod,
        ...splitScoreCell(clampCell(s)),
        updated_at: new Date().toISOString()
    }))

    // The conflict target must include `teacher_id` and match the
    // `scores_owner_period_uniq` index from migration 00002. Without the owner
    // in the key, two teachers assigned to the same class+subject in V2 would
    // silently overwrite each other's marks. See AUDIT.md G-2.
    const { error } = await supabase
        .from('scores')
        .upsert(upsertPayload, {
            onConflict: 'teacher_id, student_id, subject, score_type, score_period'
        })

    if (error) {
        logger.error(error)
        return { error: error.message }
    }

    // One entry per save, not per cell: a teacher saving a grid of 30 students
    // x 7 subjects is a single deliberate act, and 210 rows would bury the trail.
    await auditLogBatch('score.updated', 'score', upsertPayload.length, {
        score_type: scoreType,
        score_period: scorePeriod,
        class_id: scope.mode === 'v2' ? scope.classId : null,
    }, user.id)

    revalidatePath('/score/enter')
    return { success: true }
}
