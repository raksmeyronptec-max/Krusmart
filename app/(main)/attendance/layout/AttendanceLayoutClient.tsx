'use client'

import { useState, useCallback, useEffect, useMemo } from 'react'
import Link from 'next/link'
import { Button } from '@/components/ui/actions/Button'
import { Badge, ATTENDANCE_BADGE } from '@/components/ui/feedback/Badge'
import {
  LayoutTemplate, Save, User, X, Users, Search, Check, Grid3x3, List, Box, Lock, Unlock,
  CalendarDays, Plus, Pencil,
} from 'lucide-react'
import { saveAttendance, saveAttendanceBulk, getAttendanceForDate, getLockedDates, setDateLock } from './actions'
import ThreeClassroom from './ThreeClassroom'
import Select from '@/components/ui/forms/Select'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { ClassContextBar } from '@/components/shell/ClassContextBar'
import { BottomSheet } from '@/components/ui/overlay/BottomSheet'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { notify } from '@/components/ui/feedback/notify'
import { controlClass } from '@/components/ui/forms/fieldStyles'
import { Tabs, tabPanelProps } from '@/components/ui/navigation/Tabs'
import { RosterCheckIn, type FailedMark, type MarkStatus, type SaveState } from './RosterCheckIn'
import { RegisterTally } from './RegisterTally'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { useClassHref } from '@/lib/hooks/useClassHref'
import { markFor } from '@/lib/attendance/status'
import { nextMarkInCycle, registerSummary, type DayMarks } from '@/lib/attendance/register'
import { formatKhmerDate } from '@/lib/utils/date'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { AttendanceRecord, Student } from '@/lib/types'
import { STORAGE_KEYS } from '@/lib/constants/storage'

/**
 * The daily register.
 *
 *   open → the active class and today are already chosen → ✓ មកទាំងអស់ →
 *   correct the exceptions → it is saved as you go → done → ចាក់សោថ្ងៃនេះ.
 *
 * Three ways to write the same `attendance` rows through the same actions:
 *
 *   បញ្ជី     the list — the daily tool, and the only view at every width.
 *   ប្លង់តុ    the seating plan, from `lg` up. A desk tool that has to be
 *             arranged before it is useful; arranging it is a separate mode
 *             that cannot write a mark.
 *   ត្រីមាត្រ  the 3D room, from `lg` up. A visualisation, unchanged.
 *
 * ── Saving ────────────────────────────────────────────────────────────────
 *
 * Every mark is painted optimistically and the previous value is captured so
 * a failed save puts it back. Two things are tracked on top of that, both
 * because a register's worst failure is one that looks like success:
 *
 *   `pendingIds`  rows whose save is in flight — the row shows a spinner and
 *                 the bar says កំពុងរក្សាទុក...
 *   `failed`      rows whose save was refused, with the mark that was MEANT.
 *                 The row is reverted, says មិនទាន់បានធ្វើសមកាលកម្ម, and
 *                 offers ព្យាយាមម្តងទៀត, which re-issues that exact mark.
 *
 * The page never waits on the network: a tap returns immediately and the
 * outcome arrives on the row.
 */

/** Which view is showing. Persisted only for the session, not to storage. */
type ViewMode = 'list' | '2d' | '3d'

/** Client-side counterpart of `LOCKED_MESSAGE` in `actions.ts`. */
const LOCKED_HINT = 'ថ្ងៃនេះត្រូវបានចាក់សោ។ សូមដោះសោជាមុនសិន ដើម្បីកែប្រែវត្តមាន។'

export type { DayMarks }

const VIEW_TABS = [
  { id: 'list', label: 'បញ្ជី', icon: List },
  { id: '2d', label: 'ប្លង់តុ', icon: Grid3x3 },
  { id: '3d', label: 'ត្រីមាត្រ', icon: Box },
] as const

/** How a seat on the plan reads a mark: fill, border, and a glyph. Never colour alone. */
const SEAT_TONE: Record<string, { cls: string; glyph: string }> = {
  P: { cls: 'bg-success/15 border-success', glyph: '✓' },
  L: { cls: 'bg-warning/15 border-warning', glyph: '○' },
  A: { cls: 'bg-danger/15 border-danger', glyph: '×' },
  AP: { cls: 'bg-warning/15 border-warning', glyph: '○' },
}

export default function AttendanceLayoutClient({
    initialStudents,
    initialDate,
    initialAttendance,
}: {
    initialStudents: Student[]
    /** Today, resolved on the server so both sides name the same day. */
    initialDate: string
    /** Today's marks, so the first paint is the real register. */
    initialAttendance: DayMarks
}) {
    const students = initialStudents
    const { classId } = useActiveClass()
    const href = useClassHref()
    const { confirm, dialog } = useConfirm()
    const [date, setDate] = useState(initialDate)
    const isToday = date === initialDate

    // Layout State
    const [isEditMode, setIsEditMode] = useState(false)
    const [config, setConfig] = useState({ totalTables: 20, gridCols: 4, seatsPerTable: 2, layout: 'grid' })
    const [seatingLayout, setSeatingLayout] = useState<Record<string, string>>({})
    const [attendanceHistory, setAttendanceHistory] = useState<Record<string, DayMarks>>(
        { [initialDate]: initialAttendance },
    )
    const [layoutSaved, setLayoutSaved] = useState<'clean' | 'dirty' | 'saved'>('clean')
    // Days closed to further edits. Held as a Set of ISO dates so switching date
    // is a lookup rather than another round trip.
    const [lockedDates, setLockedDates] = useState<Set<string>>(new Set())
    const [isTogglingLock, setIsTogglingLock] = useState(false)
    const isLocked = lockedDates.has(date)
    // The list is the safe default: it is the only view that works at every
    // width, and a teacher who wants the plan is one tap away from it.
    const [viewMode, setViewMode] = useState<ViewMode>('list')

    // Save tracking — see the header comment.
    const [pendingIds, setPendingIds] = useState<Set<string>>(new Set())
    const [failed, setFailed] = useState<Record<string, FailedMark>>({})
    const [lastOutcome, setLastOutcome] = useState<'none' | 'ok'>('none')

    // Modal State
    const [showModal, setShowModal] = useState(false)
    const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    const marks = useMemo(() => attendanceHistory[date] ?? {}, [attendanceHistory, date])
    const summary = useMemo(() => registerSummary(students, marks), [students, marks])

    const saveState: SaveState =
        pendingIds.size > 0 ? 'saving'
        : Object.keys(failed).length > 0 ? 'failed'
        : lastOutcome === 'ok' ? 'saved'
        : 'idle'

    const loadAttendanceFromDB = useCallback(async (selectedDate: string) => {
        const records = await getAttendanceForDate(selectedDate)
        const dailyAttendance: DayMarks = {}
        records.forEach((r: AttendanceRecord) => {
            dailyAttendance[r.student_id] = { status: r.status, note: r.reason || '' }
        })

        setAttendanceHistory(prev => ({
            ...prev,
            [selectedDate]: dailyAttendance
        }))
    }, [])

    // Restore the saved seating layout. Only the layout — today's marks came
    // with the page, so there is no attendance fetch on mount any more.
    useEffect(() => {
        const localConfig = localStorage.getItem(STORAGE_KEYS.seatingConfig)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unavailable during SSR, so the saved layout can only be read after mount
        if (localConfig) setConfig(JSON.parse(localConfig))

        const localLayout = localStorage.getItem(STORAGE_KEYS.seatingLayout)
        if (localLayout) setSeatingLayout(JSON.parse(localLayout))
    }, [])

    const refreshLock = useCallback(async (forDate: string) => {
        const locked = await getLockedDates([forDate], classId ?? undefined)
        setLockedDates(prev => {
            const next = new Set(prev)
            if (locked.includes(forDate)) next.add(forDate)
            else next.delete(forDate)
            return next
        })
    }, [classId])

    // The lock for the initial day, and again whenever the active class changes
    // — a lock belongs to a class, so switching class can change the answer.
    useEffect(() => {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: refreshLock awaits getLockedDates before setting state, so nothing is set synchronously during the effect
        refreshLock(date)
        // Deliberately not keyed on `date`: changeDate already refreshes on
        // switch, and re-running here would double the request on every pick.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [refreshLock])

    const changeDate = (newDate: string) => {
        if (!newDate) return
        setDate(newDate)
        setFailed({})
        setLastOutcome('none')
        loadAttendanceFromDB(newDate)
        refreshLock(newDate)
    }

    /**
     * Close the day, or reopen it.
     *
     * Confirmation is asked only when unlocking. Locking is trivially
     * reversible; unlocking reopens a register someone deliberately closed, and
     * on a shared class that may be a colleague's decision.
     */
    const toggleLock = async () => {
        const next = !isLocked

        if (!next) {
            const ok = await confirm({
                title: 'ដោះសោវត្តមាន?',
                message: `ថ្ងៃទី ${formatKhmerDate(date)} នឹងអាចកែប្រែបានម្តងទៀត។`,
                confirmLabel: 'ដោះសោ',
                tone: 'warning',
            })
            if (!ok) return
        }

        setIsTogglingLock(true)
        const res = await setDateLock(date, next, classId ?? undefined)
        setIsTogglingLock(false)

        if (res.error) {
            notify.error(res.error)
            return
        }

        setLockedDates(prev => {
            const updated = new Set(prev)
            if (next) updated.add(date)
            else updated.delete(date)
            return updated
        })
        notify.success(next ? 'បានចាក់សោវត្តមានថ្ងៃនេះ' : 'បានដោះសោវត្តមានថ្ងៃនេះ')
    }

    /** `layout` is the only string-valued key; the rest are counts. */
    const handleConfigChange = (key: string, value: string | number) => {
        setLayoutSaved('dirty')
        setConfig(prev => {
            const newConfig = { ...prev, [key]: value }

            // Auto adjust seats per table for groups
            if (key === 'layout' && typeof value === 'string') {
                newConfig.seatsPerTable = value.startsWith('group-')
                    ? parseInt(value.split('-')[1])
                    : 2
            }
            return newConfig
        })
    }

    const setPending = (id: string, on: boolean) =>
        setPendingIds(prev => {
            const next = new Set(prev)
            if (on) next.add(id); else next.delete(id)
            return next
        })

    /**
     * Write one mark, optimistically.
     *
     * The previous value is captured before the update so a failed save can put
     * it back. Without that, a dropped request left the seat showing a mark the
     * database never received — the worst possible failure for a register,
     * because it looks exactly like success. The failure is also remembered
     * with the mark that was meant, so the row can offer a retry.
     */
    const markStudent = useCallback(async (studentId: string, status: MarkStatus, note: string) => {
        // Refused here as well as on the server. The server is the boundary that
        // matters, but stopping it client-side means no optimistic mark is ever
        // painted and then rolled back — a flicker that reads as a lost tap.
        if (lockedDates.has(date)) {
            notify.error(LOCKED_HINT)
            return { error: LOCKED_HINT }
        }

        const previous = attendanceHistory[date]?.[studentId]

        setAttendanceHistory(prev => ({
            ...prev,
            [date]: { ...(prev[date] || {}), [studentId]: { status, note } }
        }))
        setPending(studentId, true)

        const res = await saveAttendance(studentId, date, status, note, classId ?? undefined)

        setPending(studentId, false)
        if (res.error) {
            setAttendanceHistory(prev => {
                const day = { ...(prev[date] || {}) }
                if (previous) day[studentId] = previous
                else delete day[studentId]
                return { ...prev, [date]: day }
            })
            setFailed(prev => ({ ...prev, [studentId]: { status, note } }))
            // A lock refusal is a message, not a network failure: say it.
            if (res.error === LOCKED_HINT) { notify.error(res.error); refreshLock(date) }
        } else {
            setFailed(prev => {
                if (!(studentId in prev)) return prev
                const next = { ...prev }
                delete next[studentId]
                return next
            })
            setLastOutcome('ok')
        }
        return res
    }, [attendanceHistory, date, classId, lockedDates, refreshLock])

    const retryStudent = useCallback((studentId: string) => {
        const meant = failed[studentId]
        if (meant) void markStudent(studentId, meant.status, meant.note)
    }, [failed, markStudent])

    const markAllStudents = useCallback(async (status: MarkStatus) => {
        if (lockedDates.has(date)) {
            notify.error(LOCKED_HINT)
            return { error: LOCKED_HINT }
        }

        const previousDay = attendanceHistory[date]
        const ids = students.map(s => s.id)

        setAttendanceHistory(prev => ({
            ...prev,
            [date]: Object.fromEntries(ids.map(id => [id, { status, note: '' }]))
        }))
        setPendingIds(new Set(ids))

        const res = await saveAttendanceBulk(ids, date, status, classId ?? undefined)

        setPendingIds(new Set())
        if (res.error) {
            setAttendanceHistory(prev => ({ ...prev, [date]: previousDay || {} }))
            notify.error(res.error === LOCKED_HINT ? res.error : 'រក្សាទុកមិនបាន។ សូមពិនិត្យអ៊ីនធឺណិត រួចព្យាយាមម្តងទៀត។')
            if (res.error === LOCKED_HINT) refreshLock(date)
        } else {
            setFailed({})
            setLastOutcome('ok')
        }
        return res
    }, [attendanceHistory, date, students, classId, lockedDates, refreshLock])

    /**
     * A tap on a seat. In edit mode it assigns a pupil and can never write a
     * mark; otherwise it cycles the pupil's mark (see `nextMarkInCycle`).
     */
    const handleSeatClick = async (seatId: string) => {
        const studentId = seatingLayout[seatId]

        if (isEditMode) {
            if (!studentId) {
                setSelectedSeatId(seatId)
                setShowModal(true)
                setSearchQuery('')
            }
            return
        }
        if (!studentId) return

        const current = attendanceHistory[date]?.[studentId]
        const newStatus = nextMarkInCycle(current?.status)

        // The existing note is carried across the status change. Passing
        // `''` here used to wipe a reason a teacher had typed on the
        // list view the moment they touched the same seat on the plan.
        const res = await markStudent(studentId, newStatus, current?.note || '')
        if (res.error && res.error !== LOCKED_HINT) notify.error('រក្សាទុកមិនបាន')
    }

    const removeStudentFromSeat = (e: React.MouseEvent, seatId: string) => {
        e.stopPropagation()
        if (!isEditMode) return
        setLayoutSaved('dirty')
        const newLayout = { ...seatingLayout }
        delete newLayout[seatId]
        setSeatingLayout(newLayout)
    }

    const assignStudent = (studentId: string) => {
        if (selectedSeatId) {
            setLayoutSaved('dirty')
            setSeatingLayout(prev => ({ ...prev, [selectedSeatId]: studentId }))
            setShowModal(false)
            setSelectedSeatId(null)
        }
    }

    const saveLayout = () => {
        localStorage.setItem(STORAGE_KEYS.seatingConfig, JSON.stringify(config))
        localStorage.setItem(STORAGE_KEYS.seatingLayout, JSON.stringify(seatingLayout))
        setLayoutSaved('saved')
    }

    const finishEditing = () => {
        saveLayout()
        setIsEditMode(false)
    }

    // Modal logic
    const seatedIds = Object.values(seatingLayout)
    const availableStudents = students.filter(s => !seatedIds.includes(s.id))
    const filteredStudents = availableStudents.filter(s => {
        const name = (s.name_kh || '').toLowerCase()
        const id = (s.student_id || s.id || '').toLowerCase()
        return name.includes(searchQuery.toLowerCase()) || id.includes(searchQuery.toLowerCase())
    })
    const unseatedCount = availableStudents.length

    // Renders
    const renderSeat = (tableNum: number, seatNum: number, isCircular = false) => {
        const seatId = `t${tableNum}-s${seatNum}`
        const studentId = seatingLayout[seatId]
        const student = students.find(s => s.id === studentId)
        const extraClasses = isCircular ? 'w-full h-full shadow-sm absolute' : 'flex-1 relative'

        if (student) {
            const mark = markFor(attendanceHistory[date]?.[studentId]?.status)
            const tone = mark ? SEAT_TONE[mark.code] : null
            // Status is carried by the seat's fill, its border AND a glyph; an
            // unmarked pupil is dashed and grey, distinct from marked present.
            const statusCls = tone ? tone.cls : 'border-dashed border-divider bg-bg-surface'
            const label = isEditMode
                ? `${student.name_kh} · ដកចេញពីកៅអី`
                : `${student.name_kh} · ${mark ? mark.label : 'មិនទាន់សម្គាល់'} · ចុចដើម្បីប្តូរ`

            return (
                <div key={seatId} className={`${extraClasses} min-h-[44px]`}>
                    <button
                        type="button"
                        onClick={() => handleSeatClick(seatId)}
                        disabled={!isEditMode && isLocked}
                        aria-label={label}
                        className={`seat filled flex h-full w-full cursor-pointer flex-col items-center justify-center rounded-xl border-2 p-1 text-center text-text-heading transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed ${statusCls} ${isEditMode ? 'hover:shadow-lg' : 'hover:brightness-95'}`}
                    >
                        <span className="kh-truncate w-full text-[11px] font-bold leading-tight" title={student.name_kh}>{student.name_kh}</span>
                        <span className="text-[10px] tabular-nums opacity-80">
                            {mark ? (
                                <span className="font-bold" aria-hidden="true">{tone?.glyph} </span>
                            ) : (
                                <span aria-hidden="true">— </span>
                            )}
                            {student.student_id || student.id.slice(0, 4)}
                        </span>
                    </button>
                    {isEditMode && (
                        <button
                            type="button"
                            onClick={(e) => removeStudentFromSeat(e, seatId)}
                            aria-label={`ដក ${student.name_kh} ចេញពីកៅអី`}
                            className="absolute -top-2 -right-2 z-20 flex h-6 w-6 items-center justify-center rounded-full bg-danger text-white shadow hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                            <X className="h-3 w-3" aria-hidden="true" />
                        </button>
                    )}
                </div>
            )
        }

        return (
            <button
                key={seatId}
                type="button"
                onClick={() => handleSeatClick(seatId)}
                disabled={!isEditMode}
                aria-label={isEditMode ? 'កៅអីទំនេរ · ដាក់សិស្ស' : 'កៅអីទំនេរ'}
                className={`seat empty ${extraClasses} flex min-h-[44px] items-center justify-center gap-1 rounded-xl border-2 border-dashed border-divider bg-paper text-[11px] font-bold text-text-muted transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${isEditMode ? 'cursor-pointer hover:border-brand-500 hover:bg-brand-soft hover:text-brand-on-soft' : 'cursor-default'}`}
            >
                {isEditMode ? <><Plus className="h-3.5 w-3.5" aria-hidden="true" />ដាក់សិស្ស</> : 'ទំនេរ'}
            </button>
        )
    }

    const renderTable = (i: number) => {
        if (config.layout.startsWith('group-')) {
            const radius = 105
            const seatsHtml = Array.from({ length: config.seatsPerTable }).map((_, idx) => {
                const s = idx + 1
                let startAngleOffset = -90
                if (config.seatsPerTable === 6) startAngleOffset = 0
                else if (config.seatsPerTable === 8) startAngleOffset = -90

                const angleDeg = (360 / config.seatsPerTable) * (s - 1) + startAngleOffset
                const angleRad = angleDeg * (Math.PI / 180)
                const x = Math.cos(angleRad) * radius
                const y = Math.sin(angleRad) * radius

                return (
                    <div key={s} className="absolute transition-all duration-200" style={{ top: `calc(50% + ${y}px)`, left: `calc(50% + ${x}px)`, transform: 'translate(-50%, -50%)', width: '75px', height: '50px', zIndex: 20 }}>
                        {renderSeat(i, s, true)}
                    </div>
                )
            })

            return (
                <div key={i} className="relative w-[300px] h-[300px] shrink-0 flex items-center justify-center mx-auto">
                    <div className="w-[84px] h-[84px] rounded-full border-2 border-divider bg-paper flex items-center justify-center z-10 shadow-sm relative">
                        <span className="font-bold text-text-body text-sm">តុទី {i}</span>
                    </div>
                    {seatsHtml}
                </div>
            )
        }

        return (
            <div key={i} className="bg-bg-surface rounded-xl p-3 shadow-sm border border-divider flex flex-col gap-2 flex-1 min-w-[150px]">
                <div className="text-center text-xs font-bold text-text-muted uppercase tracking-wider">តុទី {i}</div>
                <div className="flex gap-2 h-20 relative">
                    {Array.from({ length: config.seatsPerTable }).map((_, idx) => renderSeat(i, idx + 1))}
                </div>
            </div>
        )
    }

    const renderGrid = () => {
        const tables = Array.from({ length: config.totalTables }).map((_, i) => renderTable(i + 1))

        let gridClass = "grid gap-4 min-w-[600px] w-full"
        let gridStyle = { gridTemplateColumns: `repeat(${config.gridCols}, minmax(0, 1fr))` }

        if (config.layout.startsWith('group-')) {
            gridClass = "grid gap-y-12 gap-x-8 mt-12 w-max mx-auto pb-16 min-w-[600px]"
            gridStyle = { gridTemplateColumns: `repeat(${config.gridCols}, 300px)` }
        } else if (config.layout === 'u-shape') {
            const cols = Math.max(3, config.gridCols)
            gridStyle = { gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }
            // Custom render for U-shape is complex, fallback to grid if needed or implement simplified U-shape
            // For brevity, we map tables normally but add empty div spacers.
            const bottomCount = config.totalTables % 2 === 0 ? 2 : 1
            const sideRows = Math.floor((config.totalTables - bottomCount) / 2)
            const spacerSpan = cols - 2

            const uShapeItems = []
            let currentTable = 1

            for (let r = 0; r < sideRows; r++) {
                uShapeItems.push(renderTable(currentTable++))
                if (spacerSpan > 0) {
                    uShapeItems.push(<div key={`spacer-${r}`} style={{ gridColumn: `span ${spacerSpan}` }}></div>)
                }
                uShapeItems.push(renderTable(currentTable++))
            }

            if (bottomCount > 0) {
                const bottomHtml = []
                for(let i=0; i<bottomCount; i++) {
                    bottomHtml.push(renderTable(currentTable++))
                }
                uShapeItems.push(
                    <div key="bottom" style={{ gridColumn: `span ${cols}` }} className="flex justify-center gap-4">
                        {bottomHtml}
                    </div>
                )
            }
            return <div className={gridClass} style={gridStyle}>{uShapeItems}</div>
        }

        return <div className={gridClass} style={gridStyle}>{tables}</div>
    }

    const lockControl = (
        <Button
            variant={isLocked ? 'warning' : 'secondary'}
            size="sm"
            printHidden={false}
            onClick={toggleLock}
            loading={isTogglingLock}
            icon={isLocked ? <Lock className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
        >
            {isLocked ? 'ដោះសោ' : 'ចាក់សោ'}
        </Button>
    )

    return (
        <PageContainer>
            <PageHeader
                title="វត្តមាន"
                description={
                    <span className="inline-flex flex-wrap items-center gap-x-2">
                        <CalendarDays className="h-4 w-4 text-brand" aria-hidden="true" />
                        <span className="font-bold text-text-heading">{formatKhmerDate(date)}</span>
                        {isToday && <span>· ថ្ងៃនេះ</span>}
                        {summary.total > 0 && !summary.complete && (
                            <span className="tabular-nums">· នៅសល់ {toKhmerNumber(summary.unmarked)} នាក់</span>
                        )}
                    </span>
                }
                actions={
                    <>
                        <label className="sr-only" htmlFor="attendance-date">កាលបរិច្ឆេទ</label>
                        <input
                            id="attendance-date"
                            type="date"
                            value={date}
                            max={initialDate}
                            onChange={(e) => changeDate(e.target.value)}
                            className={controlClass(false, 'w-auto font-bold text-brand')}
                        />
                        {!isToday && (
                            <Button variant="ghost" size="sm" printHidden={false} onClick={() => changeDate(initialDate)}>
                                ថ្ងៃនេះ
                            </Button>
                        )}
                        {/* Locking is a finalisation, not the main action: it is
                            offered quietly here and prominently only once the
                            register is complete. */}
                        {(isLocked || !summary.complete) && lockControl}
                    </>
                }
            />

            {/* Which class is being marked present. Self-gating: renders only on class-scoped routes,
                and nothing at all for a pre-V2 account. */}
            <ClassContextBar />

            {isLocked && (
                <div
                    role="status"
                    className="mb-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2.5 text-[13px] text-warning-text print:hidden"
                >
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{LOCKED_HINT}</span>
                </div>
            )}

            {/* Have I finished? Above the switcher, so all three views answer it. */}
            <RegisterTally students={students} marks={marks} />

            {/*
              The view switcher, from `lg` up only. The seating plan has a 600px
              minimum width and the 3D canvas needs a pointer to orbit, so on a
              phone the list is the whole screen and a one-tab strip would be
              noise.
            */}
            <div className="mb-3 hidden flex-wrap items-center gap-2 lg:flex print:hidden">
                <Tabs
                    label="របៀបបង្ហាញ"
                    idBase="attendance-view"
                    fill={false}
                    items={VIEW_TABS}
                    value={viewMode}
                    onChange={(v) => { setViewMode(v); if (v !== '2d') setIsEditMode(false) }}
                />
                {viewMode === '2d' && !isEditMode && (
                    <Button variant="secondary" size="sm" printHidden={false} onClick={() => setIsEditMode(true)} icon={<Pencil className="h-4 w-4" />}>
                        រៀបចំប្លង់តុ
                    </Button>
                )}
            </div>

            {viewMode === 'list' && (
                <div {...tabPanelProps('attendance-view', 'list')}>
                    <RosterCheckIn
                        students={students}
                        marks={marks}
                        pendingIds={pendingIds}
                        failed={failed}
                        saveState={saveState}
                        locked={isLocked}
                        onMark={markStudent}
                        onMarkAll={markAllStudents}
                        onRetry={retryStudent}
                        completionAction={
                            !isLocked && (
                                <Button
                                    variant="primary"
                                    size="sm"
                                    printHidden={false}
                                    onClick={toggleLock}
                                    loading={isTogglingLock}
                                    icon={<Lock className="h-4 w-4" />}
                                >
                                    ចាក់សោថ្ងៃនេះ
                                </Button>
                            )
                        }
                        emptyAction={
                            <Link
                                href={href('/enrollment')}
                                className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                <Plus className="h-4 w-4" aria-hidden="true" />
                                បញ្ចូលសិស្សថ្មី
                            </Link>
                        }
                    />
                </div>
            )}

            {viewMode === '2d' && (
                <div {...tabPanelProps('attendance-view', '2d')} className="relative">
                    {/*
                      Arranging the room is a MODE, framed and named, so a tap
                      while arranging can never write a mark and a tap while
                      marking can never move a pupil.
                    */}
                    {isEditMode ? (
                        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-brand/40 bg-brand-soft p-2 text-brand-on-soft">
                            <span className="inline-flex items-center gap-1.5 px-1 text-[13px] font-bold">
                                <Pencil className="h-4 w-4" aria-hidden="true" />
                                កំពុងរៀបចំប្លង់តុ
                                <span className="font-normal opacity-80">· មិនប៉ះពាល់វត្តមាន</span>
                            </span>

                            <Select
                                ariaLabel="ប្លង់តុ"
                                value={config.layout}
                                onChange={(v) => handleConfigChange('layout', v)}
                                options={[
                                    { value: 'grid', label: 'ប្លង់ធម្មតា' },
                                    { value: 'u-shape', label: 'រាង U' },
                                    { value: 'group-4', label: 'ក្រុម ៤នាក់ (រង្វង់)' },
                                    { value: 'group-5', label: 'ក្រុម ៥នាក់ (រង្វង់)' },
                                    { value: 'group-6', label: 'ក្រុម ៦នាក់ (រង្វង់)' },
                                    { value: 'group-7', label: 'ក្រុម ៧នាក់ (រង្វង់)' },
                                    { value: 'group-8', label: 'ក្រុម ៨នាក់ (រង្វង់)' },
                                ]}
                                leadingIcon={<LayoutTemplate />}
                                wrapperClassName="w-[180px]"
                            />

                            <div className="flex min-h-11 items-center gap-1 rounded-lg border border-divider bg-bg-surface px-2 text-text-heading">
                                <span className="whitespace-nowrap text-xs text-text-muted">តុ:</span>
                                <input type="number" min={1} aria-label="ចំនួនតុ" value={config.totalTables} onChange={e => handleConfigChange('totalTables', parseInt(e.target.value) || 0)} className="w-10 bg-transparent text-center text-sm font-bold outline-none" />
                            </div>

                            <div className="flex min-h-11 items-center gap-1 rounded-lg border border-divider bg-bg-surface px-2 text-text-heading">
                                <span className="whitespace-nowrap text-xs text-text-muted">ជួរ:</span>
                                <input type="number" min={1} aria-label="ចំនួនជួរ" value={config.gridCols} onChange={e => handleConfigChange('gridCols', parseInt(e.target.value) || 1)} className="w-10 bg-transparent text-center text-sm font-bold outline-none" />
                            </div>

                            <Select
                                ariaLabel="ចំនួនកៅអីក្នុងមួយតុ"
                                value={String(config.seatsPerTable)}
                                onChange={v => handleConfigChange('seatsPerTable', parseInt(v) || 2)}
                                disabled={config.layout.startsWith('group-')}
                                options={[
                                    { value: '2', label: '២ នាក់/តុ' },
                                    { value: '1', label: '១ នាក់/តុ' },
                                ]}
                            />

                            <span className="ml-auto inline-flex items-center gap-2 text-xs">
                                <span className="tabular-nums opacity-80">
                                    {unseatedCount > 0 ? `${toKhmerNumber(unseatedCount)} នាក់មិនទាន់មានកៅអី` : 'សិស្សទាំងអស់មានកៅអី'}
                                </span>
                                <Button variant="secondary" size="sm" printHidden={false} onClick={saveLayout} icon={<Save className="h-4 w-4" />}>
                                    រក្សាទុក
                                </Button>
                                <Button variant="success" size="sm" printHidden={false} onClick={finishEditing} icon={<Check className="h-4 w-4" />}>
                                    បញ្ចប់
                                </Button>
                            </span>
                        </div>
                    ) : (
                        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-muted">
                            <span>ចុចកៅអី ដើម្បីប្តូរវត្តមាន៖ មិនទាន់ → ✓ → ○ → ×</span>
                            {unseatedCount > 0 && (
                                <span className="tabular-nums">
                                    · {toKhmerNumber(unseatedCount)} នាក់មិនទាន់មានកៅអី — សម្គាល់ពួកគេនៅបញ្ជី
                                </span>
                            )}
                            {layoutSaved === 'saved' && <span className="text-success">· បានរក្សាទុកប្លង់</span>}
                            {layoutSaved === 'dirty' && <span className="text-warning-text">· ប្លង់មិនទាន់រក្សាទុក</span>}
                        </div>
                    )}

                    <div className="overflow-x-auto pb-24">
                        {/* Teacher desk and blackboard — the plan's orientation cues */}
                        <div className="mb-8 flex min-w-[600px] flex-col gap-3">
                            <div className="flex justify-start">
                                <div className="flex -translate-y-2 items-center gap-3 rounded-xl border-b-4 border-brand bg-bg-surface px-6 py-2.5 shadow-sm">
                                    <User className="h-5 w-5 text-text-heading" aria-hidden="true" />
                                    <span className="kh-moul text-base font-bold text-text-heading">តុគ្រូបង្រៀន</span>
                                </div>
                            </div>

                            <div className="flex w-full justify-center">
                                <div className="relative flex h-9 w-full max-w-4xl items-center justify-center rounded-full border-2 border-warning/40 bg-[var(--text-heading)] shadow-lg">
                                    <span className="font-sans text-xs font-bold tracking-[0.2em] text-text-muted uppercase">ក្ដារខៀន</span>
                                </div>
                            </div>
                            <div className="mt-1 w-full border-b-2 border-dashed border-divider"></div>
                        </div>

                        {renderGrid()}

                        {!isEditMode && (
                            <div className="sticky bottom-4 mx-auto mt-6 flex w-max items-center gap-3 rounded-full border border-divider bg-bg-surface px-5 py-2.5 shadow-lg">
                                {(['P', 'L', 'A'] as const).map((code) => (
                                    <Badge key={code} variant={ATTENDANCE_BADGE[code].variant} size="sm">
                                        <span aria-hidden="true">{SEAT_TONE[code].glyph}</span> {ATTENDANCE_BADGE[code].label}
                                    </Badge>
                                ))}
                                <Badge variant="muted" size="sm"><span aria-hidden="true">—</span> មិនទាន់</Badge>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/*
              Seat assignment. A bottom sheet rather than the previous
              hand-rolled overlay: it traps focus, closes on Escape, restores
              focus to the seat afterwards, and rises from the bottom of a
              phone where a thumb already is.
            */}
            <BottomSheet
                open={showModal}
                onClose={() => setShowModal(false)}
                title="ជ្រើសរើសសិស្ស"
                description="ជ្រើសរើសសិស្សដែលត្រូវដាក់ក្នុងកៅអីនេះ"
            >
                <div className="mb-3">
                    <div className="relative">
                        <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                        <input
                            type="search"
                            value={searchQuery}
                            onChange={e => setSearchQuery(e.target.value)}
                            placeholder="ស្វែងរកឈ្មោះ ឬលេខសិស្ស"
                            aria-label="ស្វែងរកសិស្ស"
                            className={controlClass(false, 'pl-9')}
                        />
                    </div>
                </div>

                <div className="flex min-h-[200px] flex-col gap-1 pb-2">
                    {students.length === 0 ? (
                        <div className="flex flex-col items-center gap-3 p-6 text-center">
                            <Users className="h-10 w-10 text-text-muted" aria-hidden="true" />
                            <p className="text-sm text-text-muted">មិនទាន់មានទិន្នន័យសិស្សទេ</p>
                        </div>
                    ) : filteredStudents.length === 0 ? (
                        <p className="p-4 text-center text-sm text-text-muted">សិស្សទាំងអស់មានកៅអីរួចហើយ ឬរកមិនឃើញសិស្ស។</p>
                    ) : (
                        filteredStudents.map(s => (
                            <button
                                key={s.id}
                                type="button"
                                onClick={() => assignStudent(s.id)}
                                className="flex min-h-11 w-full cursor-pointer items-center gap-3 rounded-xl border border-transparent p-3 text-left transition hover:border-divider hover:bg-brand-soft focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-soft text-xs font-bold text-brand-on-soft">
                                    {s.gender === 'ស្រី' ? 'ស' : 'ប'}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="kh-truncate block text-sm font-bold text-text-body">{s.name_kh || 'គ្មានឈ្មោះ'}</span>
                                    <span className="block text-xs text-text-muted">{s.student_id || s.id.slice(0, 4)}</span>
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </BottomSheet>

            {viewMode === '3d' && (
                <div {...tabPanelProps('attendance-view', '3d')}>
                    <ThreeClassroom
                        config={config}
                        seatingLayout={seatingLayout}
                        students={students}
                        attendanceHistory={attendanceHistory}
                        date={date}
                        onSeatClick={handleSeatClick}
                        onClose={() => setViewMode('2d')}
                    />
                </div>
            )}

            {dialog}
        </PageContainer>
    )
}
