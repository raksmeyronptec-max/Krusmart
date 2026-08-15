'use client'

import { useState, useCallback, useEffect } from 'react'
import { Badge, ATTENDANCE_BADGE } from '@/components/ui/feedback/Badge'
import { ArrowLeft, Calendar, Layout, LayoutTemplate, Save, User, X, Users, Search, Loader2, Check, Home } from 'lucide-react'
import Link from 'next/link'
import { saveAttendance, getAttendanceForDate } from './actions'
import ThreeClassroom from './ThreeClassroom'
import Select from '@/components/ui/forms/Select'
import type { AttendanceRecord, Student } from '@/lib/types'
import { STORAGE_KEYS } from '@/lib/constants/storage'

export default function AttendanceLayoutClient({ initialStudents}: { initialStudents: Student[] }) {
    const students = initialStudents
    const [date, setDate] = useState(() => new Date().toISOString().split('T')[0])
    
    // Layout State
    const [isEditMode, setIsEditMode] = useState(false)
    const [config, setConfig] = useState({ totalTables: 20, gridCols: 4, seatsPerTable: 2, layout: 'grid' })
    const [seatingLayout, setSeatingLayout] = useState<Record<string, string>>({})
    const [attendanceHistory, setAttendanceHistory] = useState<Record<string, Record<string, { status: string, note: string }>>>({})
    const [isSaving, setIsSaving] = useState(false)
    const [viewMode, setViewMode] = useState<'2d' | '3d'>('2d')

    // Modal State
    const [showModal, setShowModal] = useState(false)
    const [selectedSeatId, setSelectedSeatId] = useState<string | null>(null)
    const [searchQuery, setSearchQuery] = useState('')

    const loadAttendanceFromDB = useCallback(async (selectedDate: string) => {
        const records = await getAttendanceForDate(selectedDate)
        const dailyAttendance: Record<string, { status: string, note: string }> = {}
        records.forEach((r: AttendanceRecord) => {
            dailyAttendance[r.student_id] = { status: r.status, note: r.reason || '' }
        })

        setAttendanceHistory(prev => ({
            ...prev,
            [selectedDate]: dailyAttendance
        }))
    }, [])

    // Restore the saved layout and load the initial date, once on mount.
    useEffect(() => {
        const localConfig = localStorage.getItem(STORAGE_KEYS.seatingConfig)
        // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is unavailable during SSR, so the saved layout can only be read after mount
        if (localConfig) setConfig(JSON.parse(localConfig))

        const localLayout = localStorage.getItem(STORAGE_KEYS.seatingLayout)
        if (localLayout) setSeatingLayout(JSON.parse(localLayout))

        loadAttendanceFromDB(date)
        // `date` is intentionally omitted: this is the initial load, and
        // handleDateChange re-fetches whenever the teacher picks another day.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [loadAttendanceFromDB])

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
                // Toggle Attendance: P -> L -> A -> P
                const currentStatus = attendanceHistory[date]?.[studentId]?.status || 'P'
                const flow: Record<string, string> = { 'P': 'L', 'L': 'A', 'A': 'P' }
                const newStatus = flow[currentStatus]

                // Optimistic UI Update
                setAttendanceHistory(prev => ({
                    ...prev,
                    [date]: {
                        ...(prev[date] || {}),
                        [studentId]: { status: newStatus, note: '' }
                    }
                }))

                // Save to DB
                await saveAttendance(studentId, date, newStatus, '')
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

    return (
        <div className={`min-h-screen bg-paper pb-[100px] ${isEditMode ? 'bg-paper' : ''}`}>
            {/* Top Navigation Matches Original */}
            <nav className="bg-brand text-white p-3 md:p-4 shadow-lg sticky top-0 z-50 print:hidden">
                <div className="container mx-auto flex flex-col md:flex-row justify-between items-center gap-3">
                    <div className="flex items-center justify-between w-full md:w-auto gap-4">
                        <div className="flex items-center gap-2">
                            <Link href="/dashboard" className="flex items-center gap-1 md:gap-2 hover:text-gold transition font-bold text-xs md:text-sm bg-bg-surface/10 px-2 py-1.5 rounded-lg">
                                <Home className="w-4 h-4" /> <span className="hidden sm:inline">ទំព័រដើម</span>
                            </Link>
                            <h1 className="kh-moul text-sm md:text-lg hidden lg:block">ប្រព័ន្ធគ្រប់គ្រងវត្តមាន</h1>
                        </div>
                        
                        <div className="flex items-center bg-bg-surface/10 rounded px-2 py-1 border border-white/20 shrink-0">
                            <span className="text-xs md:text-sm font-bold text-white px-2">ថ្នាក់ទី ១២ក</span>
                        </div>
                    </div>

                    <div className="flex gap-2 md:gap-4 text-xs md:text-sm font-bold items-center w-full md:w-auto overflow-x-auto no-scrollbar pb-1 md:pb-0 justify-start md:justify-end whitespace-nowrap">
                        <Link href="/attendance/monthly" className="hover:text-gold flex items-center gap-1 px-2 py-1 bg-bg-surface/5 rounded md:bg-transparent transition"><Calendar className="w-4 h-4" /> វត្តមានបញ្ជី</Link>
                        <Link href="/attendance/layout" className="text-gold flex items-center gap-1 px-2 py-1 bg-bg-surface/10 rounded transition"><Layout className="w-4 h-4" /> វត្តមានប្លង់តុ</Link>
                    </div>
                </div>
            </nav>

            <div className="bg-bg-surface p-4 shadow-sm border-b border-divider flex flex-col md:flex-row justify-between items-center gap-4 z-40 relative">
                <div className="flex items-center gap-2 bg-paper p-2 rounded-lg border w-full md:w-auto justify-between">
                    <label className="font-bold text-xs md:text-sm text-text-body whitespace-nowrap">កាលបរិច្ឆេទ៖</label>
                    <input type="date" value={date} onChange={handleDateChange} className="border p-1.5 md:p-2 rounded font-bold text-brand outline-none text-sm w-32 md:w-auto cursor-pointer" />
                </div>

                    <div className="flex gap-3 w-full md:w-auto items-center">
                        <div className="flex bg-paper rounded-lg p-1 mr-2 hidden md:flex">
                            <button onClick={() => setViewMode('2d')} className={`px-3 py-1.5 text-sm font-bold rounded-md transition ${viewMode === '2d' ? 'bg-bg-surface shadow-sm text-brand' : 'text-text-muted hover:text-text-body'}`}>2D</button>
                            <button onClick={() => { setViewMode('3d'); setIsEditMode(false); }} className={`px-3 py-1.5 text-sm font-bold rounded-md transition ${viewMode === '3d' ? 'bg-bg-surface shadow-sm text-brand' : 'text-text-muted hover:text-text-body'}`}>3D</button>
                        </div>
                        {!isEditMode ? (
                            <button onClick={toggleMode} className="flex-1 md:flex-none px-4 py-2 rounded-lg font-bold text-white bg-brand-600 hover:bg-brand-700 transition flex items-center justify-center gap-2 shadow-sm">
                                <Layout className="w-4 h-4" />
                                <span>កែសម្រួលប្លង់</span>
                            </button>
                        ) : (
                            <div className="flex items-center gap-2 bg-paper p-1 rounded-xl overflow-x-auto max-w-full">
                                <button onClick={toggleMode} className="px-3 py-1.5 text-text-body hover:bg-bg-surface rounded-lg transition flex items-center gap-1 text-sm font-bold whitespace-nowrap">
                                    <ArrowLeft className="w-4 h-4" /> ត្រឡប់
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

                                <div className="flex items-center gap-1 bg-bg-surface px-2 py-1.5 rounded-lg border border-divider">
                                    <span className="text-xs text-text-muted whitespace-nowrap">តុ:</span>
                                    <input type="number" value={config.totalTables} onChange={e => handleConfigChange('totalTables', parseInt(e.target.value) || 0)} className="w-10 text-center font-bold outline-none text-sm bg-transparent" />
                                </div>
                                
                                <div className="flex items-center gap-1 bg-bg-surface px-2 py-1.5 rounded-lg border border-divider">
                                    <span className="text-xs text-text-muted whitespace-nowrap">ជួរ:</span>
                                    <input type="number" value={config.gridCols} onChange={e => handleConfigChange('gridCols', parseInt(e.target.value) || 1)} className="w-10 text-center font-bold outline-none text-sm bg-transparent" />
                                </div>

                                <Select
                                    ariaLabel="ចំនួនកៅអី per តុ"
                                    value={String(config.seatsPerTable)}
                                    onChange={v => handleConfigChange('seatsPerTable', parseInt(v) || 2)}
                                    disabled={config.layout.startsWith('group-')}
                                    options={[
                                        { value: '2', label: '២ នាក់/តុ' },
                                        { value: '1', label: '១ នាក់/តុ' },
                                    ]}
                                />
                            </div>
                        )}

                        <button onClick={isEditMode ? toggleMode : handleSave} className={`flex-1 md:flex-none px-4 py-2 rounded-lg font-bold text-white transition flex items-center justify-center gap-2 shadow-sm ${isEditMode ? 'bg-[var(--color-success)] hover:bg-[var(--color-success)]' : 'bg-brand hover:bg-[var(--brand)]'}`}>
                            {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : (isEditMode ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />)}
                            {isEditMode ? 'បញ្ចប់' : 'រក្សាទុក'}
                        </button>
                    </div>
            </div>

            {/* Main Area */}
            <main className="max-w-7xl mx-auto px-4 py-8 overflow-x-auto relative">
                {/* Teacher Desk & Blackboard */}
                <div className="flex flex-col mb-10 gap-4 min-w-[600px]">
                    <div className="flex justify-start">
                        <div className="bg-bg-surface px-6 py-3 rounded-xl shadow-sm border-b-4 border-brand flex items-center gap-3 transform -translate-y-2">
                            <User className="w-5 h-5 text-text-heading" />
                            <span className="font-bold text-text-heading text-lg kh-moul">តុគ្រូបង្រៀន</span>
                        </div>
                    </div>
                    
                    <div className="flex justify-center w-full">
                        <div className="w-full max-w-4xl bg-[var(--text-heading)] rounded-full h-10 flex items-center justify-center shadow-lg border-2 border-warning/40 relative">
                            <span className="text-text-muted font-sans tracking-[0.2em] text-xs font-bold uppercase">ក្ដារខៀន</span>
                        </div>
                    </div>
                    <div className="w-full border-b-2 border-dashed border-divider mt-2"></div>
                </div>

                {renderGrid()}
            </main>

            {/* Legend */}
            {!isEditMode && (
                <div className="fixed bottom-6 left-1/2 -translate-x-1/2 bg-bg-surface rounded-full px-6 py-3 flex items-center gap-6 shadow-[0_10px_25px_-5px_rgba(0,0,0,0.1)] border border-divider z-30">
                    {(['P', 'L', 'A'] as const).map((code) => (
                        <Badge key={code} variant={ATTENDANCE_BADGE[code].variant} size="sm">
                            {ATTENDANCE_BADGE[code].label}
                        </Badge>
                    ))}
                </div>
            )}

            {/* Student Select Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-black/50 backdrop-blur-sm" onClick={() => setShowModal(false)}>
                    <div className="bg-bg-surface rounded-t-2xl sm:rounded-xl w-full max-h-[90vh] sm:max-h-[85vh] overflow-y-auto max-w-md shadow-lg overflow-hidden flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                        <div className="p-4 border-b border-divider flex justify-between items-center bg-paper">
                            <h3 className="font-bold text-text-heading flex items-center gap-2">
                                <Users className="w-5 h-5 text-brand" />
                                ជ្រើសរើសសិស្ស
                            </h3>
                            <button onClick={() => setShowModal(false)} className="p-1 hover:bg-divider rounded-full"><X className="w-5 h-5 text-text-muted" /></button>
                        </div>
                        
                        <div className="p-3 border-b border-divider">
                            <div className="relative">
                                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-text-muted" />
                                <input type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)} placeholder="ស្វែងរកឈ្មោះ ឬអត្តលេខសិស្ស..." className="w-full pl-9 pr-4 py-2 border border-divider rounded-xl focus:outline-none focus:border-brand-500 text-sm" />
                            </div>
                        </div>

                        <div className="overflow-y-auto p-2 flex-1 space-y-1 min-h-[200px]">
                            {students.length === 0 ? (
                                <div className="p-6 text-center flex flex-col items-center gap-3">
                                    <User className="w-10 h-10 text-text-muted" />
                                    <div className="text-text-muted text-sm">មិនទាន់មានទិន្នន័យសិស្សទេ!</div>
                                </div>
                            ) : filteredStudents.length === 0 ? (
                                <div className="p-4 text-center text-text-muted text-sm">សិស្សទាំងអស់ត្រូវបានចាត់ចូលតុរួចរាល់ ឬរកមិនឃើញសិស្ស។</div>
                            ) : (
                                filteredStudents.map(s => (
                                    <div key={s.id || s.uid || ''} onClick={() => assignStudent(s.id || s.uid || '')} className="p-3 hover:bg-brand-100 cursor-pointer rounded-xl flex items-center gap-3 border border-transparent hover:border-divider transition">
                                        <div className="w-8 h-8 rounded-full bg-brand-100 text-brand flex items-center justify-center font-bold text-xs shrink-0">
                                            {s.gender === 'ស្រី' ? 'ស' : 'ប'}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="font-bold text-text-body text-sm truncate">{s.name_kh || s.full_name || 'គ្មានឈ្មោះ'}</div>
                                            <div className="text-xs text-text-muted">ID: {s.student_id || s.student_code || s.id.slice(0, 4)}</div>
                                        </div>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

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
        </div>
    )
}
