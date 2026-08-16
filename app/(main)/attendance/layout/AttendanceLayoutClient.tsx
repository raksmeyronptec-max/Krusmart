'use client'

import { useState, useCallback, useEffect } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { Badge, ATTENDANCE_BADGE } from '@/components/ui/feedback/Badge'
import { ArrowLeft, LayoutTemplate, Save, User, X, Users, Search, Check, Grid3x3, List, Box } from 'lucide-react'
import { saveAttendance, saveAttendanceBulk, getAttendanceForDate } from './actions'
import ThreeClassroom from './ThreeClassroom'
import Select from '@/components/ui/forms/Select'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { BottomSheet } from '@/components/ui/overlay/BottomSheet'
import { notify } from '@/components/ui/feedback/notify'
import { controlClass } from '@/components/ui/forms/fieldStyles'
import { RosterCheckIn, type MarkStatus } from './RosterCheckIn'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import type { AttendanceRecord, Student } from '@/lib/types'
import { STORAGE_KEYS } from '@/lib/constants/storage'

/**
 * Three ways to take the same register.
 *
 *   បញ្ជី     a list — one row per pupil, three labelled buttons. Works on a
 *             phone held in one hand, which is where a register is actually
 *             taken. The default below `lg`.
 *   ប្លង់តុ    the seating plan. A desk tool: 600px at its narrowest and it has
 *             to be arranged before it is useful, but it is the fastest way to
 *             mark a class you can see in front of you.
 *   ត្រីមាត្រ  the 3D view, unchanged.
 *
 * All three write the same `attendance` rows through the same actions.
 *
 * The page used to render its own navy navigation bar with a home link, a
 * `វត្តមានបញ្ជី` / `វត្តមានប្លង់តុ` pair, and a hard-coded `ថ្នាក់ទី ១២ក`
 * label that showed the same class to every teacher. The app shell provides
 * all of that now — and the class label comes from the real active class — so
 * the bar is gone.
 */

/** Which view is showing. Persisted only for the session, not to storage. */
type ViewMode = 'list' | '2d' | '3d'

export type DayMarks = Record<string, { status: string, note: string }>

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
    const { classId, className } = useActiveClass()
    const [date, setDate] = useState(initialDate)

    // Layout State
    const [isEditMode, setIsEditMode] = useState(false)
    const [config, setConfig] = useState({ totalTables: 20, gridCols: 4, seatsPerTable: 2, layout: 'grid' })
    const [seatingLayout, setSeatingLayout] = useState<Record<string, string>>({})
    const [attendanceHistory, setAttendanceHistory] = useState<Record<string, DayMarks>>(
        { [initialDate]: initialAttendance },
    )
    const [isSaving, setIsSaving] = useState(false)
    // The list is the safe default: it is the only view that works at every
    // width, and a teacher who wants the plan is one tap away from it.
    const [viewMode, setViewMode] = useState<ViewMode>('list')

    // Modal State
    const [showModal, setShowModal] = useState(false)
    const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

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

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const newDate = e.target.value
        setDate(newDate)
        loadAttendanceFromDB(newDate)
    }

    const toggleMode = () => {
        if (isEditMode) {
            handleSave()
        }
        if (!isEditMode && viewMode === '3d') {
            setViewMode('2d')
        }
        setIsEditMode(!isEditMode)
    }

    /** `layout` is the only string-valued key; the rest are counts. */
    const handleConfigChange = (key: string, value: string | number) => {
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

    /**
     * Write one mark, optimistically.
     *
     * The previous value is captured before the update so a failed save can put
     * it back. Without that, a dropped request left the seat showing a mark the
     * database never received — the worst possible failure for a register,
     * because it looks exactly like success.
     */
    const markStudent = useCallback(async (studentId: string, status: string, note: string) => {
        const previous = attendanceHistory[date]?.[studentId]

        setAttendanceHistory(prev => ({
            ...prev,
            [date]: { ...(prev[date] || {}), [studentId]: { status, note } }
        }))

        const res = await saveAttendance(studentId, date, status, note, classId ?? undefined)

        if (res.error) {
            setAttendanceHistory(prev => {
                const day = { ...(prev[date] || {}) }
                if (previous) day[studentId] = previous
                else delete day[studentId]
                return { ...prev, [date]: day }
            })
        }
        return res
    }, [attendanceHistory, date, classId])

    const markAllStudents = useCallback(async (status: MarkStatus) => {
        const previousDay = attendanceHistory[date]
        const ids = students.map(s => s.id)

        setAttendanceHistory(prev => ({
            ...prev,
            [date]: Object.fromEntries(ids.map(id => [id, { status, note: '' }]))
        }))

        const res = await saveAttendanceBulk(ids, date, status, classId ?? undefined)
        if (res.error) {
            setAttendanceHistory(prev => ({ ...prev, [date]: previousDay || {} }))
        }
        return res
    }, [attendanceHistory, date, students, classId])

    const handleSeatClick = async (seatId: string) => {
        const studentId = seatingLayout[seatId]

        if (!studentId) {
            if (isEditMode) {
                setSelectedSeatId(seatId)
                setShowModal(true)
                setSearchQuery('')
            }
        } else {
            if (!isEditMode) {
                // Cycle P -> L -> A -> P. The plan has one target per pupil, so
                // cycling is the only way to reach three states from one tap;
                // the list view offers the three as separate buttons instead.
                const currentStatus = attendanceHistory[date]?.[studentId]?.status || 'P'
                const flow: Record<string, string> = { 'P': 'L', 'L': 'A', 'A': 'P' }
                const newStatus = flow[currentStatus]

                // The existing note is carried across the status change. Passing
                // `''` here used to wipe a reason a teacher had typed on the
                // list view the moment they touched the same seat on the plan.
                const note = attendanceHistory[date]?.[studentId]?.note || ''
                const res = await markStudent(studentId, newStatus, note)
                if (res.error) notify.error('រក្សាទុកវត្តមានមិនបាន')
            }
        }
    }

    const removeStudentFromSeat = (e: React.MouseEvent, seatId: string) => {
        e.stopPropagation()
        if (!isEditMode) return
        const newLayout = { ...seatingLayout }
        delete newLayout[seatId]
        setSeatingLayout(newLayout)
    }

    const assignStudent = (studentId: string) => {
        if (selectedSeatId) {
            setSeatingLayout(prev => ({ ...prev, [selectedSeatId]: studentId }))
            setShowModal(false)
            setSelectedSeatId(null)
        }
    }

    const handleSave = async () => {
        setIsSaving(true)
        localStorage.setItem(STORAGE_KEYS.seatingConfig, JSON.stringify(config))
        localStorage.setItem(STORAGE_KEYS.seatingLayout, JSON.stringify(seatingLayout))
        
        setTimeout(() => setIsSaving(false), 1000)
    }

    // Modal logic
    const seatedIds = Object.values(seatingLayout)
    const availableStudents = students.filter(s => !seatedIds.includes(s.id || s.uid || ''))
    const filteredStudents = availableStudents.filter(s => {
        const name = (s.name_kh || s.full_name || '').toLowerCase()
        const id = (s.student_id || s.student_code || s.id || '').toLowerCase()
        return name.includes(searchQuery.toLowerCase()) || id.includes(searchQuery.toLowerCase())
    })

    // Renders
    const renderSeat = (tableNum: number, seatNum: number, isCircular = false) => {
        const seatId = `t${tableNum}-s${seatNum}`
        const studentId = seatingLayout[seatId]
        const student = students.find(s => (s.id || s.uid || '') === studentId)
        const extraClasses = isCircular ? 'w-full h-full shadow-sm absolute' : 'flex-1 relative'
        
        if (student) {
            const status = attendanceHistory[date]?.[studentId]?.status || 'P'
            // Status is carried by the seat's fill and border; the student's
            // name stays on the heading colour so it is legible at 11px and does
            // not depend on colour vision to be read.
            const statusColors: Record<string, string> = {
                'P': 'bg-success/15 border-success text-text-heading',
                'L': 'bg-warning/15 border-warning text-text-heading',
                'A': 'bg-danger/15 border-danger text-text-heading'
            }

            return (
                <div key={seatId} onClick={() => handleSeatClick(seatId)} 
                     className={`seat filled ${extraClasses} min-h-[44px] border-2 rounded-xl p-1 flex flex-col items-center justify-center text-center cursor-pointer transition-transform hover:scale-105 ${statusColors[status]} ${isEditMode ? 'hover:shadow-lg z-10' : ''}`}>
                    
                    {isEditMode && (
                        <div onClick={(e) => removeStudentFromSeat(e, seatId)} 
                             className="absolute -top-2 -right-2 bg-danger text-white rounded-full p-0.5 w-5 h-5 flex items-center justify-center text-xs z-20 hover:opacity-90 transition-colors">
                            <X className="w-3 h-3" />
                        </div>
                    )}
                    <div className="font-bold text-[11px] leading-tight line-clamp-2" title={student.name_kh || student.full_name || ''}>{student.name_kh || student.full_name}</div>
                    <div className="text-[9px] opacity-80">{student.student_id || student.student_code || student.id.slice(0, 4)}</div>
                </div>
            )
        }

        return (
            <div key={seatId} onClick={() => handleSeatClick(seatId)} 
                 className={`seat empty ${extraClasses} border-2 border-dashed border-divider bg-paper text-text-muted rounded-xl flex items-center justify-center text-xs font-bold cursor-pointer transition-colors hover:border-brand-500 hover:bg-brand-100 hover:text-brand-500`}>
                <span>+</span>
            </div>
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
            <div key={i} className="bg-bg-surface rounded-xl p-4 shadow-sm border border-divider flex flex-col gap-3 flex-1 min-w-[150px]">
                <div className="text-center text-xs font-bold text-text-muted uppercase tracking-wider">តុទី {i}</div>
                <div className="flex gap-3 h-24 relative">
                    {Array.from({ length: config.seatsPerTable }).map((_, idx) => renderSeat(i, idx + 1))}
                </div>
            </div>
        )
    }

    const renderGrid = () => {
        const tables = Array.from({ length: config.totalTables }).map((_, i) => renderTable(i + 1))
        
        let gridClass = "grid gap-6 min-w-[600px] w-full"
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
                    <div key="bottom" style={{ gridColumn: `span ${cols}` }} className="flex justify-center gap-6">
                        {bottomHtml}
                    </div>
                )
            }
            return <div className={gridClass} style={gridStyle}>{uShapeItems}</div>
        }

        return <div className={gridClass} style={gridStyle}>{tables}</div>
    }

    const viewOptions: { id: ViewMode; label: string; icon: typeof List }[] = [
        { id: 'list', label: 'បញ្ជី', icon: List },
        { id: '2d', label: 'ប្លង់តុ', icon: Grid3x3 },
        { id: '3d', label: 'ត្រីមាត្រ', icon: Box },
    ]

    return (
        <PageContainer>
            <PageHeader
                title="ចុះវត្តមានសិស្ស"
                description={className ? `ថ្នាក់ ${className}` : 'ជ្រើសរើសកាលបរិច្ឆេទ រួចសម្គាល់វត្តមានសិស្ស'}
                actions={
                    <div className="flex flex-wrap items-center gap-2">
                        <label className="sr-only" htmlFor="attendance-date">កាលបរិច្ឆេទ</label>
                        <input
                            id="attendance-date"
                            type="date"
                            value={date}
                            onChange={handleDateChange}
                            className={controlClass(false, 'w-auto font-bold text-brand')}
                        />
                    </div>
                }
            />

            {/*
              The view switcher. `2d` and `3d` are hidden below `lg` rather than
              disabled: the seating plan has a 600px minimum width and the 3D
              canvas needs a pointer to orbit, so offering either on a phone
              would be offering something that does not work.
            */}
            <div className="mb-4 flex flex-wrap items-center gap-2 print:hidden">
                <div role="tablist" aria-label="របៀបបង្ហាញ" className="flex gap-1 rounded-xl border border-divider bg-paper p-1">
                    {viewOptions.map((v) => {
                        const Icon = v.icon
                        const on = viewMode === v.id
                        return (
                            <button
                                key={v.id}
                                type="button"
                                role="tab"
                                aria-selected={on}
                                onClick={() => { setViewMode(v.id); if (v.id !== '2d') setIsEditMode(false) }}
                                className={`flex min-h-11 items-center gap-1.5 rounded-lg px-3 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                                    on ? 'bg-bg-surface text-brand shadow-sm' : 'text-text-muted hover:text-text-body'
                                } ${v.id === 'list' ? '' : 'hidden lg:flex'}`}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {v.label}
                            </button>
                        )
                    })}
                </div>

                {viewMode === '2d' && (
                    isEditMode ? (
                        <div className="flex flex-wrap items-center gap-2 rounded-xl bg-paper p-1">
                            <button onClick={toggleMode} className="flex min-h-11 items-center gap-1 whitespace-nowrap rounded-lg px-3 text-sm font-bold text-text-body transition hover:bg-bg-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                                <ArrowLeft className="h-4 w-4" /> ត្រឡប់
                            </button>

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

                            <div className="flex min-h-11 items-center gap-1 rounded-lg border border-divider bg-bg-surface px-2">
                                <span className="whitespace-nowrap text-xs text-text-muted">តុ:</span>
                                <input type="number" aria-label="ចំនួនតុ" value={config.totalTables} onChange={e => handleConfigChange('totalTables', parseInt(e.target.value) || 0)} className="w-10 bg-transparent text-center text-sm font-bold outline-none" />
                            </div>

                            <div className="flex min-h-11 items-center gap-1 rounded-lg border border-divider bg-bg-surface px-2">
                                <span className="whitespace-nowrap text-xs text-text-muted">ជួរ:</span>
                                <input type="number" aria-label="ចំនួនជួរ" value={config.gridCols} onChange={e => handleConfigChange('gridCols', parseInt(e.target.value) || 1)} className="w-10 bg-transparent text-center text-sm font-bold outline-none" />
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

                            <Button variant="success" printHidden={false} onClick={toggleMode} loading={isSaving} icon={<Check className="h-4 w-4" />}>
                                បញ្ចប់
                            </Button>
                        </div>
                    ) : (
                        <>
                            <Button variant="secondary" printHidden={false} onClick={toggleMode} icon={<LayoutTemplate className="h-4 w-4" />}>
                                កែសម្រួលប្លង់
                            </Button>
                            <Button printHidden={false} onClick={handleSave} loading={isSaving} icon={<Save className="h-4 w-4" />}>
                                រក្សាទុក
                            </Button>
                        </>
                    )
                )}
            </div>

            {viewMode === 'list' && (
                <RosterCheckIn
                    students={students}
                    marks={attendanceHistory[date] || {}}
                    onMark={(id, status, note) => markStudent(id, status, note)}
                    onMarkAll={markAllStudents}
                />
            )}

            {viewMode === '2d' && (
                <div className="relative overflow-x-auto pb-28">
                    {/* Teacher desk and blackboard — the plan's orientation cues */}
                    <div className="mb-10 flex min-w-[600px] flex-col gap-4">
                        <div className="flex justify-start">
                            <div className="flex -translate-y-2 items-center gap-3 rounded-xl border-b-4 border-brand bg-bg-surface px-6 py-3 shadow-sm">
                                <User className="h-5 w-5 text-text-heading" />
                                <span className="kh-moul text-lg font-bold text-text-heading">តុគ្រូបង្រៀន</span>
                            </div>
                        </div>

                        <div className="flex w-full justify-center">
                            <div className="relative flex h-10 w-full max-w-4xl items-center justify-center rounded-full border-2 border-warning/40 bg-[var(--text-heading)] shadow-lg">
                                <span className="font-sans text-xs font-bold tracking-[0.2em] text-text-muted uppercase">ក្ដារខៀន</span>
                            </div>
                        </div>
                        <div className="mt-2 w-full border-b-2 border-dashed border-divider"></div>
                    </div>

                    {renderGrid()}

                    {!isEditMode && (
                        <div className="sticky bottom-4 mx-auto mt-6 flex w-max items-center gap-4 rounded-full border border-divider bg-bg-surface px-6 py-3 shadow-lg">
                            {(['P', 'L', 'A'] as const).map((code) => (
                                <Badge key={code} variant={ATTENDANCE_BADGE[code].variant} size="sm">
                                    {ATTENDANCE_BADGE[code].label}
                                </Badge>
                            ))}
                        </div>
                    )}
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
                            placeholder="ស្វែងរកឈ្មោះ ឬអត្តលេខសិស្ស"
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
                        <p className="p-4 text-center text-sm text-text-muted">សិស្សទាំងអស់ត្រូវបានចាត់ចូលតុរួចរាល់ ឬរកមិនឃើញសិស្ស។</p>
                    ) : (
                        filteredStudents.map(s => (
                            <button
                                key={s.id || s.uid || ''}
                                type="button"
                                onClick={() => assignStudent(s.id || s.uid || '')}
                                className="flex min-h-11 w-full items-center gap-3 rounded-xl border border-transparent p-3 text-left transition hover:border-divider hover:bg-brand-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring dark:hover:bg-brand-900/40"
                            >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-100 text-xs font-bold text-brand dark:bg-brand-900/60 dark:text-brand-300">
                                    {s.gender === 'ស្រី' ? 'ស' : 'ប'}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="block truncate text-sm font-bold text-text-body">{s.name_kh || s.full_name || 'គ្មានឈ្មោះ'}</span>
                                    <span className="block text-xs text-text-muted">{s.student_id || s.student_code || s.id.slice(0, 4)}</span>
                                </span>
                            </button>
                        ))
                    )}
                </div>
            </BottomSheet>

            {viewMode === '3d' && (
                <ThreeClassroom
                    config={config}
                    seatingLayout={seatingLayout}
                    students={students}
                    attendanceHistory={attendanceHistory}
                    date={date}
                    onSeatClick={handleSeatClick}
                    onClose={() => setViewMode('2d')}
                />
            )}
        </PageContainer>
    )
}
