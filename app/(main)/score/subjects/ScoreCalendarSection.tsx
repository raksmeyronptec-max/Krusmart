'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  CalendarDays, CalendarOff, CalendarPlus, Info, Loader2, Lock, LockOpen,
  Merge, MoveDown, MoveUp, RotateCcw, Save, Split,
} from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { Badge } from '@/components/ui/feedback/Badge'
import { Skeleton } from '@/components/ui/feedback/Skeleton'
import { controlClass, fieldLabel } from '@/components/ui/forms/fieldStyles'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { MONTHS_BY_ACADEMIC_YEAR, MONTH_LABEL_BY_ID, type MonthId } from '@/lib/constants/months'
import { semesterLabel, type SemesterId } from '@/lib/scores/semester'
import { deriveLabel, validateCalendar, type ScorePeriod } from '@/lib/scores/calendar'
import { useScoreCalendar } from '@/lib/hooks/useScoreCalendar'
import {
  countScoresForMonths, getCalendarEditAccess, resetClassCalendar, saveClassCalendar,
  setPeriodLock,
} from './calendarActions'
import { useUserRole } from '@/lib/rbac/useUserRole'

/**
 * វគ្គពិន្ទុ — the class's score-period calendar, as a timeline.
 *
 * A timeline rather than a table on purpose (§11.5): the invariant easiest to
 * break is the partition — no overlap, nothing counted twice — and a timeline
 * makes a gap or a doubled month *visible*, where table rows hide it.
 *
 * Everything edits a local draft; nothing is written until រក្សាទុក replaces
 * the whole set in one action (INV-3). The six interaction rules of §11.5 are
 * the contract here: merge only adjacent periods in one semester (with the
 * boundary move proposed automatically when the teacher's merge straddles it),
 * the anchor is always the first month and never a choice, hiding warns with
 * the real count of marks and deletes nothing, the semester boundary is a
 * single pull, dates are optional, and save is copy-on-write.
 *
 * Who may edit is a product decision recorded in the rollout ledger: the
 * homeroom teacher or a school admin — a subject teacher sees the calendar
 * read-only, because rewriting it re-grades every subject in the class,
 * including a colleague's. The server action enforces the same rule.
 */

const ACADEMIC_INDEX: Record<string, number> = Object.fromEntries(
  MONTHS_BY_ACADEMIC_YEAR.map((m, i) => [m.id, i]),
)

/** Anchor first, members academic-sorted, labels derived, sortOrder renumbered. */
function normalise(periods: ScorePeriod[]): ScorePeriod[] {
  return periods
    .map((p) => {
      const members = [...p.members].sort((a, b) => ACADEMIC_INDEX[a] - ACADEMIC_INDEX[b])
      return { ...p, members, key: members[0], labelKm: deriveLabel(members) }
    })
    .sort((a, b) => ACADEMIC_INDEX[a.key] - ACADEMIC_INDEX[b.key])
    .map((p, i) => ({ ...p, sortOrder: i }))
}

/** What a save compares and sends — the derived and lock fields stay out. */
const signature = (periods: readonly ScorePeriod[]) =>
  JSON.stringify(periods.map((p) => [p.key, p.members, p.semester, p.startsOn, p.endsOn]))

export function ScoreCalendarSection({ classId }: { classId: string | null }) {
  const { calendar, academicYear, configured, loading, reload } = useScoreCalendar()
  const { confirm, dialog } = useConfirm()
  // Unlocking is admin-only (§11.8): a lock a teacher can quietly remove is
  // not a lock. Rendering only — the server re-checks either way.
  const { isAdmin } = useUserRole()

  const [draft, setDraft] = useState<ScorePeriod[] | null>(null)
  const [selectedKey, setSelectedKey] = useState<MonthId | null>(null)
  const [access, setAccess] = useState<{ canEdit: boolean; reason?: string } | null>(null)
  const [saving, setSaving] = useState(false)
  const [datesFor, setDatesFor] = useState<ScorePeriod | null>(null)
  const [datesStart, setDatesStart] = useState('')
  const [datesEnd, setDatesEnd] = useState('')

  useEffect(() => {
    let cancelled = false
    getCalendarEditAccess(classId ?? undefined).then((a) => { if (!cancelled) setAccess(a) })
    return () => { cancelled = true }
  }, [classId])

  const working = draft ?? calendar
  const dirty = draft !== null && signature(draft) !== signature(calendar)
  const problems = useMemo(() => validateCalendar([...working]), [working])
  const canEdit = access?.canEdit === true

  const selected = useMemo(
    () => working.find((p) => p.key === selectedKey) ?? null,
    [working, selectedKey],
  )

  const apply = useCallback((next: ScorePeriod[]) => { setDraft(normalise(next)) }, [])

  // ------------------------------------------------------------ row layout

  /**
   * The boundary: the last academic month sem1 covers. Off months sit in the
   * row their position implies, so a disabled ខែតុលា still renders at the end
   * of semester 2 instead of vanishing.
   */
  const sem1End = useMemo(() => {
    const sem1 = working.filter((p) => p.semester === 'sem1')
    if (sem1.length === 0) return -1
    return Math.max(...sem1.flatMap((p) => p.members.map((m) => ACADEMIC_INDEX[m])))
  }, [working])

  const covered = useMemo(() => new Set(working.flatMap((p) => p.members)), [working])

  type Block = { kind: 'period'; period: ScorePeriod } | { kind: 'off'; monthId: MonthId }

  const rows = useMemo(() => {
    const bySemester: Record<SemesterId, Block[]> = { sem1: [], sem2: [] }
    const periodByFirst = new Map(working.map((p) => [p.members[0], p]))
    for (const m of MONTHS_BY_ACADEMIC_YEAR) {
      const period = periodByFirst.get(m.id)
      if (period) {
        bySemester[period.semester].push({ kind: 'period', period })
      } else if (!covered.has(m.id)) {
        bySemester[ACADEMIC_INDEX[m.id] <= sem1End ? 'sem1' : 'sem2'].push({ kind: 'off', monthId: m.id })
      }
      // A non-first member renders inside its period's block; nothing to add.
    }
    return bySemester
  }, [working, covered, sem1End])

  // -------------------------------------------------------------- actions

  const nextPeriodAfter = useCallback((period: ScorePeriod): ScorePeriod | null => {
    const after = working
      .filter((p) => ACADEMIC_INDEX[p.key] > ACADEMIC_INDEX[period.key])
      .sort((a, b) => ACADEMIC_INDEX[a.key] - ACADEMIC_INDEX[b.key])
    return after[0] ?? null
  }, [working])

  /** §11.5 rule 3: hiding warns with the real number of marks, never deletes. */
  const confirmHiddenMarks = useCallback(async (months: MonthId[], what: string) => {
    const count = await countScoresForMonths(months, academicYear, classId ?? undefined)
    const labels = months.map((m) => MONTH_LABEL_BY_ID[m]).join(', ')
    const marksLine = count > 0
      ? `ពិន្ទុ ${toKhmerNumber(count)} ក្រឡាដែលបានបញ្ចូលរួចក្នុង${labels} នឹងលាក់ពីតារាងបញ្ចូល — មិនលុប មិនផ្លាស់ទីទេ។ `
      : ''
    return confirm({
      title: what,
      message:
        marksLine +
        'ការផ្លាស់ប្តូរវគ្គនឹងគណនាមធ្យមភាគឆមាសរបស់សិស្សទាំងអស់ឡើងវិញ គ្រប់មុខវិជ្ជា។',
      tone: 'warning',
      confirmLabel: 'បន្ត',
    })
  }, [academicYear, classId, confirm])

  const mergeWithNext = useCallback(async (period: ScorePeriod) => {
    const next = nextPeriodAfter(period)
    if (!next) return
    if (period.locked || next.locked) {
      notify.error('វគ្គដែលបានចាក់សោមិនអាចរួមបានទេ')
      return
    }

    // Rule 1: merging across the semester boundary needs the boundary moved
    // first — proposed as the automatic first step, never a silent refusal.
    if (next.semester !== period.semester) {
      const ok = await confirm({
        title: 'ផ្លាស់ព្រំដែនឆមាសជាមុន',
        message:
          `${next.labelKm} ស្ថិតក្នុង${semesterLabel(next.semester)}។ ដើម្បីរួម ` +
          `ព្រំដែនឆមាសត្រូវផ្លាស់ទៅក្រោយ${next.labelKm}ជាមុន — វគ្គនោះនឹងក្លាយជា${semesterLabel(period.semester)}។`,
        tone: 'warning',
        confirmLabel: 'ផ្លាស់ព្រំដែន រួចរួម',
      })
      if (!ok) return
    }

    if (!(await confirmHiddenMarks(next.members, `រួម ${period.labelKm} ជាមួយ ${next.labelKm}`))) return

    apply([
      ...working.filter((p) => p.key !== period.key && p.key !== next.key),
      {
        ...period,
        members: [...period.members, ...next.members],
        // The merged window spans both, when both are known.
        endsOn: next.endsOn ?? period.endsOn,
      },
    ])
    setSelectedKey(period.key)
  }, [working, nextPeriodAfter, confirm, confirmHiddenMarks, apply])

  const split = useCallback((period: ScorePeriod) => {
    if (period.locked) {
      notify.error('វគ្គដែលបានចាក់សោមិនអាចបំបែកបានទេ')
      return
    }
    apply([
      ...working.filter((p) => p.key !== period.key),
      ...period.members.map((m) => ({
        key: m,
        labelKm: MONTH_LABEL_BY_ID[m],
        members: [m],
        semester: period.semester,
        startsOn: null,
        endsOn: null,
        locked: false,
        sortOrder: 0,
      })),
    ])
  }, [working, apply])

  /**
   * Rule 4: the boundary is a single pull. Only the period touching it can
   * cross, which keeps each semester one contiguous block by construction.
   */
  const boundaryMove = useMemo(() => {
    if (!selected || selected.locked) return null
    const semPeriods = working.filter((p) => p.semester === selected.semester)
    if (semPeriods.length <= 1) return null // a semester must keep at least one period
    const idx = ACADEMIC_INDEX[selected.key]
    if (selected.semester === 'sem1' && idx === Math.max(...semPeriods.map((p) => ACADEMIC_INDEX[p.key]))) {
      return 'sem2' as const
    }
    if (selected.semester === 'sem2' && idx === Math.min(...semPeriods.map((p) => ACADEMIC_INDEX[p.key]))) {
      return 'sem1' as const
    }
    return null
  }, [selected, working])

  const moveAcrossBoundary = useCallback((period: ScorePeriod, to: SemesterId) => {
    apply(working.map((p) => (p.key === period.key ? { ...p, semester: to } : p)))
  }, [working, apply])

  const disablePeriod = useCallback(async (period: ScorePeriod) => {
    if (period.locked) {
      notify.error('វគ្គដែលបានចាក់សោមិនអាចបិទបានទេ')
      return
    }
    if (working.length <= 1) return
    if (!(await confirmHiddenMarks(period.members, `បិទ ${period.labelKm} (មិនស្រង់ពិន្ទុ)`))) return
    apply(working.filter((p) => p.key !== period.key))
    setSelectedKey(null)
  }, [working, confirmHiddenMarks, apply])

  const enableMonth = useCallback((monthId: MonthId) => {
    apply([
      ...working,
      {
        key: monthId,
        labelKm: MONTH_LABEL_BY_ID[monthId],
        members: [monthId],
        semester: ACADEMIC_INDEX[monthId] <= sem1End ? 'sem1' : 'sem2',
        startsOn: null,
        endsOn: null,
        locked: false,
        sortOrder: 0,
      },
    ])
    setSelectedKey(monthId)
  }, [working, sem1End, apply])

  /**
   * Lock or unlock the selected period — a direct write, not a draft edit,
   * so it is disabled while a draft is dirty (a lock must stamp the calendar
   * that is actually stored). Locking closes the period to score writes;
   * unlocking is offered to admins only, and both directions are audited.
   */
  const toggleLock = useCallback(async (period: ScorePeriod) => {
    const locking = !period.locked
    const ok = await confirm(locking
      ? {
          title: `ចាក់សោ ${period.labelKm}`,
          message:
            'បន្ទាប់ពីចាក់សោ ពិន្ទុក្នុងវគ្គនេះមើលបានតែប៉ុណ្ណោះ — ការកែ ការរួម ' +
            'ឬការផ្លាស់ទីវគ្គនឹងត្រូវបដិសេធ រហូតដល់អ្នកគ្រប់គ្រងសាលាដោះសោ។',
          tone: 'warning' as const,
          confirmLabel: 'ចាក់សោ',
        }
      : {
          title: `ដោះសោ ${period.labelKm}`,
          message:
            'ការដោះសោបើកការកែពិន្ទុក្នុងវគ្គនេះឡើងវិញ។ ក្រដាសដែលបានបោះពុម្ពរួច ' +
            'អាចលែងត្រូវនឹងទិន្នន័យ។ ការដោះសោត្រូវបានកត់ត្រាក្នុងបញ្ជីសកម្មភាព។',
          tone: 'danger' as const,
          confirmLabel: 'ដោះសោ',
        })
    if (!ok) return

    setSaving(true)
    try {
      const res = await setPeriodLock(academicYear, period.key, locking, classId ?? undefined)
      if (res.error) {
        notify.error(res.error)
        return
      }
      await reload()
      // The stored calendar changed under any (clean) draft — rebuild from it.
      setDraft(null)
      notify.success(locking ? `បានចាក់សោ ${period.labelKm}` : `បានដោះសោ ${period.labelKm}`)
    } finally {
      setSaving(false)
    }
  }, [confirm, academicYear, classId, reload])

  // ----------------------------------------------------------- dates dialog

  const openDates = (period: ScorePeriod) => {
    setDatesFor(period)
    setDatesStart(period.startsOn ?? '')
    setDatesEnd(period.endsOn ?? '')
  }

  const submitDates = () => {
    if (!datesFor) return
    if (datesStart && datesEnd && datesEnd < datesStart) {
      notify.error('កាលបរិច្ឆេទបញ្ចប់មុនកាលបរិច្ឆេទចាប់ផ្តើម')
      return
    }
    apply(working.map((p) =>
      p.key === datesFor.key
        ? { ...p, startsOn: datesStart || null, endsOn: datesEnd || null }
        : p,
    ))
    setDatesFor(null)
  }

  // ------------------------------------------------------------ save/reset

  const save = useCallback(async () => {
    if (problems.length > 0 || !dirty || draft === null) return
    setSaving(true)
    try {
      const res = await saveClassCalendar(
        academicYear,
        draft.map((p) => ({
          key: p.key,
          members: p.members,
          semester: p.semester,
          startsOn: p.startsOn,
          endsOn: p.endsOn,
        })),
        classId ?? undefined,
      )
      if (res.error) {
        notify.error(res.error)
        return
      }
      await reload()
      setDraft(null)
      notify.success('បានរក្សាទុកវគ្គពិន្ទុ')
    } finally {
      setSaving(false)
    }
  }, [problems, dirty, draft, academicYear, classId, reload])

  const reset = useCallback(async () => {
    const ok = await confirm({
      title: 'ត្រឡប់ទៅលំនាំដើម',
      message:
        'វគ្គពិន្ទុផ្ទាល់របស់ថ្នាក់នេះនឹងត្រូវលុប ហើយថ្នាក់នឹងប្រើប្រតិទិនរបស់សាលា ' +
        'ឬលំនាំដើម (១២ ខែ, ឆមាសទី១ = វិច្ឆិកា–មីនា) វិញ។ មធ្យមភាគឆមាសនឹងគណនាឡើងវិញតាមនោះ។ ' +
        'ពិន្ទុសិស្សមិនត្រូវបានលុបទេ។',
      tone: 'danger',
      confirmLabel: 'ត្រឡប់ទៅលំនាំដើម',
    })
    if (!ok) return
    setSaving(true)
    try {
      const res = await resetClassCalendar(academicYear, classId ?? undefined)
      if (res.error) {
        notify.error(res.error)
        return
      }
      await reload()
      setDraft(null)
      setSelectedKey(null)
      notify.success('បានត្រឡប់ទៅលំនាំដើម')
    } finally {
      setSaving(false)
    }
  }, [confirm, academicYear, classId, reload])

  // ---------------------------------------------------------------- render

  if (loading || access === null) {
    return (
      <div className="flex flex-col gap-3">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-28 w-full" />
        <Skeleton className="h-28 w-full" />
      </div>
    )
  }

  const blockButton = (block: Block) => {
    if (block.kind === 'off') {
      return (
        <button
          key={`off-${block.monthId}`}
          type="button"
          disabled={!canEdit}
          onClick={() => enableMonth(block.monthId)}
          title={canEdit ? 'ចុចដើម្បីបើកវគ្គនេះឡើងវិញ' : undefined}
          className="flex min-h-16 min-w-[86px] flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-divider px-2 py-1.5 text-text-muted opacity-70 transition enabled:hover:border-brand-400 enabled:hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span className="text-[13px] font-bold line-through">{MONTH_LABEL_BY_ID[block.monthId]}</span>
          <span className="text-[10px]">មិនស្រង់ពិន្ទុ</span>
        </button>
      )
    }

    const p = block.period
    const isSelected = selectedKey === p.key
    const merged = p.members.length > 1
    return (
      <button
        key={p.key}
        type="button"
        onClick={() => setSelectedKey(isSelected ? null : p.key)}
        aria-pressed={isSelected}
        className={`flex min-h-16 flex-col items-center justify-center gap-0.5 rounded-lg border px-2 py-1.5 transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
          merged ? 'min-w-[130px]' : 'min-w-[86px]'
        } ${
          isSelected
            ? 'border-brand bg-brand text-brand-contrast shadow-md'
            : merged
              ? 'border-brand-400 bg-brand-100 text-text-heading hover:border-brand dark:bg-brand-900/30'
              : 'border-divider bg-bg-surface text-text-heading hover:border-brand-400'
        }`}
      >
        <span className="flex items-center gap-1 text-[13px] font-bold">
          {p.locked && <Lock className="h-3 w-3" aria-hidden="true" />}
          {p.labelKm}
          {merged && <Merge className="h-3 w-3" aria-hidden="true" />}
        </span>
        <span className={`text-[10px] ${isSelected ? 'opacity-80' : 'text-text-muted'}`}>
          {p.startsOn && p.endsOn ? `${p.startsOn} – ${p.endsOn}` : merged ? `${toKhmerNumber(p.members.length)} ខែ` : ' '}
        </span>
      </button>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-wrap items-center gap-2.5 rounded-xl border border-divider bg-bg-surface p-3 text-sm">
        <span className="flex items-center gap-2 font-bold text-text-heading">
          <CalendarDays className="h-4 w-4 text-brand" aria-hidden="true" />
          ឆ្នាំសិក្សា {academicYear}
        </span>
        {configured
          ? <Badge variant="info" size="sm">បានកំណត់ផ្ទាល់</Badge>
          : <Badge variant="muted" size="sm">លំនាំដើម</Badge>}
        <span className="ml-auto flex items-center gap-1.5 text-xs text-text-muted">
          <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          ការរួមខែប្តូរចំនួនវគ្គ — មធ្យមភាគឆមាសនឹងគណនាឡើងវិញ
        </span>
      </div>

      {!canEdit && (
        <div className="flex items-start gap-2.5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-text-body">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-warning-text" aria-hidden="true" />
          {access.reason ?? 'អ្នកអាចមើលវគ្គពិន្ទុបាន ប៉ុន្តែមិនអាចកែបានទេ។'}
        </div>
      )}

      {/* -------------------------------------------------------- timeline */}
      {(['sem1', 'sem2'] as SemesterId[]).map((sem) => (
        <div key={sem} className="rounded-xl border border-divider bg-bg-surface p-3">
          <p className="mb-2 text-xs font-bold text-text-muted">{semesterLabel(sem)}</p>
          <div className="flex flex-wrap gap-1.5">
            {rows[sem].length === 0
              ? <span className="text-xs text-text-muted">គ្មានវគ្គ</span>
              : rows[sem].map(blockButton)}
          </div>
        </div>
      ))}

      {/* ------------------------------------------------- selected actions */}
      {canEdit && selected && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-400 bg-brand-100 p-3 dark:bg-brand-900/30">
          <span className="mr-1 text-sm font-bold text-text-heading">{selected.labelKm}</span>
          <Button
            size="sm" variant="secondary" printHidden={false}
            disabled={nextPeriodAfter(selected) === null || selected.locked}
            onClick={() => mergeWithNext(selected)}
          >
            <Merge className="h-3.5 w-3.5" aria-hidden="true" /> រួមជាមួយវគ្គបន្ទាប់
          </Button>
          {selected.members.length > 1 && (
            <Button size="sm" variant="secondary" printHidden={false} disabled={selected.locked} onClick={() => split(selected)}>
              <Split className="h-3.5 w-3.5" aria-hidden="true" /> បំបែក
            </Button>
          )}
          {boundaryMove !== null && (
            <Button size="sm" variant="secondary" printHidden={false} onClick={() => moveAcrossBoundary(selected, boundaryMove)}>
              {boundaryMove === 'sem2'
                ? <><MoveDown className="h-3.5 w-3.5" aria-hidden="true" /> ផ្លាស់ទៅឆមាសទី២</>
                : <><MoveUp className="h-3.5 w-3.5" aria-hidden="true" /> ផ្លាស់ទៅឆមាសទី១</>}
            </Button>
          )}
          <Button size="sm" variant="secondary" printHidden={false} onClick={() => openDates(selected)}>
            <CalendarPlus className="h-3.5 w-3.5" aria-hidden="true" /> កាលបរិច្ឆេទ…
          </Button>
          <Button
            size="sm" variant="secondary" printHidden={false}
            disabled={working.length <= 1 || selected.locked}
            onClick={() => disablePeriod(selected)}
          >
            <CalendarOff className="h-3.5 w-3.5" aria-hidden="true" /> បិទវគ្គនេះ
          </Button>
          {!selected.locked ? (
            <Button
              size="sm" variant="secondary" printHidden={false}
              disabled={saving || dirty}
              title={dirty ? 'សូមរក្សាទុកការកែជាមុនសិន' : undefined}
              onClick={() => toggleLock(selected)}
            >
              <Lock className="h-3.5 w-3.5" aria-hidden="true" /> ចាក់សោ
            </Button>
          ) : isAdmin && (
            <Button
              size="sm" variant="secondary" printHidden={false}
              disabled={saving || dirty}
              onClick={() => toggleLock(selected)}
            >
              <LockOpen className="h-3.5 w-3.5" aria-hidden="true" /> ដោះសោ
            </Button>
          )}
        </div>
      )}

      {/* -------------------------------------------------------- problems */}
      {problems.length > 0 && (
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-text-body">
          <ul className="flex list-disc flex-col gap-1 pl-5">
            {problems.map((p, i) => <li key={i}>{p.messageKm}</li>)}
          </ul>
        </div>
      )}

      {/* -------------------------------------------------------- save bar */}
      {canEdit && (
        <div className="flex flex-wrap items-center gap-2">
          <Button
            printHidden={false}
            disabled={!dirty || problems.length > 0 || saving}
            onClick={save}
            icon={saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          >
            រក្សាទុកវគ្គពិន្ទុ
          </Button>
          {dirty && (
            <Button variant="secondary" printHidden={false} disabled={saving} onClick={() => { setDraft(null); setSelectedKey(null) }}>
              បោះបង់ការកែ
            </Button>
          )}
          <Button variant="secondary" printHidden={false} disabled={saving || !configured} onClick={reset}>
            <RotateCcw className="h-4 w-4" aria-hidden="true" /> ត្រឡប់ទៅលំនាំដើម
          </Button>
        </div>
      )}

      {/* ----------------------------------------------------- dates dialog */}
      <Dialog
        open={datesFor !== null}
        onClose={() => setDatesFor(null)}
        title="កាលបរិច្ឆេទប្រមូលពិន្ទុ"
        description={`${datesFor?.labelKm ?? ''} — ជាជម្រើស៖ ទុកទទេបាន`}
        footer={
          <>
            <Button variant="secondary" printHidden={false} onClick={() => setDatesFor(null)}>បោះបង់</Button>
            <Button printHidden={false} onClick={submitDates}>យល់ព្រម</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <div>
            <label className={fieldLabel} htmlFor="period-starts">ចាប់ផ្តើម</label>
            <input
              id="period-starts"
              type="date"
              value={datesStart}
              onChange={(e) => setDatesStart(e.target.value)}
              className={controlClass(false)}
            />
          </div>
          <div>
            <label className={fieldLabel} htmlFor="period-ends">បញ្ចប់</label>
            <input
              id="period-ends"
              type="date"
              value={datesEnd}
              onChange={(e) => setDatesEnd(e.target.value)}
              className={controlClass(false)}
            />
          </div>
          <p className="text-xs text-text-muted">
            កាលបរិច្ឆេទគ្រាន់តែណែនាំវគ្គលំនាំដើមក្នុងតារាងបញ្ចូល — វាមិនផ្លាស់ទីពិន្ទុទេ។
          </p>
        </div>
      </Dialog>

      {dialog}
    </div>
  )
}

export default ScoreCalendarSection
