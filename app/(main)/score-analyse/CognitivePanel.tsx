'use client'

import { useEffect, useMemo, useState } from 'react'
import { Brain, Printer, Save } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import { notify } from '@/components/ui/feedback/notify'
import { getCognitiveAssessments, saveCognitiveAssessment } from './actions'
import { COGNITIVE_LEVELS, type CognitiveAssessment, type Settings, type Student } from '@/lib/types'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { letterFor } from '@/lib/grading/scheme'
import { logger } from '@/lib/utils/logger'

/** The subset of the page's analytics this panel prints. */
export interface StudentSummary {
    attRate: number
    overallAvg: number | null
    p: number
    l: number
    a: number
}

type Ratings = Record<string, number>

const EMPTY: Ratings = { knowing: 0, applying: 0, analyzing: 0, evaluating: 0 }

/** Each level gets its own colour so the printed bars stay distinguishable. */
const LEVEL_COLOURS: Record<string, string> = {
    knowing: '#0054a6',
    applying: '#16A36A',
    analyzing: '#D99614',
    evaluating: '#7c3aed',
}

/**
 * Per-pupil cognitive assessment, restored from the legacy analysis page.
 *
 * Four 0-100 sliders rating a pupil across Bloom-style levels, saved to
 * `cognitive_assessments` (migration 00015) and printable as a one-page detail
 * sheet alongside the pupil's marks and attendance.
 *
 * Kept out of `ScoreAnalyseClient` because that component is already a large
 * analytics pass over the whole class; this is per-pupil state with its own
 * fetch and its own print surface.
 */
export function CognitivePanel({
    students,
    summaries,
    settings,
    academicYear,
    classId,
}: {
    students: Student[]
    /** `studentId` → the roll-up computed by the page. */
    summaries: Record<string, StudentSummary>
    settings: Settings | null
    academicYear: string
    classId?: string | null
}) {
    const [studentId, setStudentId] = useState('')
    const [saved, setSaved] = useState<Record<string, CognitiveAssessment>>({})
    /**
     * Unsaved slider positions, tagged with the pupil they belong to.
     *
     * Tagging is what lets the displayed ratings be *derived* rather than copied
     * into state by an effect: when the selection changes the draft no longer
     * matches, so the stored row shows through automatically and a half-made
     * adjustment cannot leak onto the next pupil.
     */
    const [draft, setDraft] = useState<{ id: string; values: Ratings } | null>(null)
    const [isSaving, setIsSaving] = useState(false)
    const [loading, setLoading] = useState(true)

    useEffect(() => {
        let cancelled = false
        getCognitiveAssessments(classId ?? undefined)
            .then((rows) => { if (!cancelled) setSaved(rows) })
            .catch((err: unknown) => logger.error('Failed to load cognitive assessments:', err))
            .finally(() => { if (!cancelled) setLoading(false) })
        return () => { cancelled = true }
    }, [classId])

    const ratings = useMemo<Ratings>(() => {
        if (draft && draft.id === studentId) return draft.values

        const row = saved[studentId]
        return row
            ? { knowing: row.knowing, applying: row.applying, analyzing: row.analyzing, evaluating: row.evaluating }
            : EMPTY
    }, [draft, studentId, saved])

    const setRating = (key: string, value: number) => {
        setDraft({ id: studentId, values: { ...ratings, [key]: value } })
    }

    const student = useMemo(
        () => students.find((s) => s.id === studentId) ?? null,
        [students, studentId],
    )

    const summary = studentId ? summaries[studentId] : undefined
    const average = useMemo(
        () => Math.round(COGNITIVE_LEVELS.reduce((sum, l) => sum + (ratings[l.key] ?? 0), 0) / COGNITIVE_LEVELS.length),
        [ratings],
    )

    const handleSave = async () => {
        if (!studentId) return

        setIsSaving(true)
        const res = await saveCognitiveAssessment(studentId, {
            knowing: ratings.knowing,
            applying: ratings.applying,
            analyzing: ratings.analyzing,
            evaluating: ratings.evaluating,
        }, classId ?? undefined)
        setIsSaving(false)

        if (res.error) {
            notify.error(`រក្សាទុកមិនបាន៖ ${res.error}`)
            return
        }

        // Fold the save back into local state rather than refetching: the row we
        // just wrote is exactly what the server now holds.
        setSaved((prev) => ({
            ...prev,
            [studentId]: {
                ...(prev[studentId] ?? { id: '', teacher_id: '', student_id: studentId }),
                ...ratings,
            } as CognitiveAssessment,
        }))
        // Drop the draft so the sliders now read from the stored row — otherwise
        // a stale draft would keep shadowing it for this pupil.
        setDraft(null)
        notify.success('បានរក្សាទុកការវាយតម្លៃ')
    }

    const grade = summary?.overallAvg != null ? letterFor(summary.overallAvg) : null

    return (
        <div className="bg-bg-surface p-5 border-t-4 border-brand rounded-xl shadow-sm">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-divider pb-2 print:hidden">
                <h2 className="flex items-center gap-2 font-bold text-brand">
                    <Brain className="h-5 w-5" aria-hidden="true" />
                    ការវាយតម្លៃសមត្ថភាពយល់ដឹង
                </h2>
                <div className="flex items-center gap-2">
                    <Button
                        variant="secondary"
                        printHidden={false}
                        disabled={!studentId}
                        onClick={() => window.print()}
                        icon={<Printer className="h-4 w-4" />}
                    >
                        បោះពុម្ពលម្អិត
                    </Button>
                    <Button
                        printHidden={false}
                        disabled={!studentId}
                        loading={isSaving}
                        onClick={handleSave}
                        icon={<Save className="h-4 w-4" />}
                    >
                        រក្សាទុក
                    </Button>
                </div>
            </div>

            <div className="mb-5 print:hidden">
                <SearchableSelect
                    label="ជ្រើសរើសសិស្ស"
                    value={studentId}
                    onChange={setStudentId}
                    loading={loading}
                    clearable
                    placeholder="ជ្រើសរើសសិស្សដើម្បីវាយតម្លៃ"
                    options={students.map((s) => ({
                        value: s.id,
                        // A tick marks pupils already rated, so a teacher working
                        // down the roster can see where they stopped.
                        label: `${saved[s.id] ? '✓ ' : ''}${s.name_kh || s.full_name || '—'}`,
                    }))}
                />
            </div>

            {!studentId ? (
                <p className="py-8 text-center text-sm italic text-text-muted print:hidden">
                    សូមជ្រើសរើសសិស្សជាមុនសិន។
                </p>
            ) : (
                <div className="space-y-5 print:hidden">
                    {COGNITIVE_LEVELS.map((level) => (
                        <div key={level.key}>
                            <div className="mb-1.5 flex items-center justify-between">
                                <label htmlFor={`cog-${level.key}`} className="text-sm font-bold text-text-body">
                                    {level.label}
                                </label>
                                <span className="text-sm font-bold tabular-nums" style={{ color: LEVEL_COLOURS[level.key] }}>
                                    {toKhmerNumber(ratings[level.key] ?? 0)}%
                                </span>
                            </div>
                            <input
                                id={`cog-${level.key}`}
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={ratings[level.key] ?? 0}
                                onChange={(e) => setRating(level.key, Number(e.target.value))}
                                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-divider accent-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                style={{ accentColor: LEVEL_COLOURS[level.key] }}
                                aria-valuetext={`${ratings[level.key] ?? 0}%`}
                            />
                        </div>
                    ))}

                    <div className="rounded-xl bg-paper p-4 text-center">
                        <p className="text-xs font-bold uppercase text-text-muted">មធ្យមភាគសមត្ថភាព</p>
                        <p className="text-2xl font-bold text-brand">{toKhmerNumber(average)}%</p>
                    </div>
                </div>
            )}

            {/*
              Per-student detail sheet.
              Hidden on screen and revealed only for print, so the teacher prints
              one pupil rather than the whole analytics dashboard behind it.
            */}
            {student && (
                <div className="hidden print:block">
                    <div className="mb-4 text-center">
                        <p className="kh-moul text-[12pt]">ព្រះរាជាណាចក្រកម្ពុជា</p>
                        <p className="kh-moul text-[12pt]">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
                    </div>

                    <div className="mb-4 text-[10pt] leading-relaxed">
                        <p>{settings?.school_name || 'សាលា......................'}</p>
                        <p>ថ្នាក់៖ {settings?.class_name || '..........'} · ឆ្នាំសិក្សា {academicYear}</p>
                    </div>

                    <h2 className="kh-moul mb-4 text-center text-[14pt] uppercase">
                        របាយការណ៍វាយតម្លៃសមត្ថភាពសិស្ស
                    </h2>

                    <table className="mb-5 w-full border-collapse text-[11pt]">
                        <tbody>
                            <tr>
                                <td className="border border-[#444] p-2 font-bold">គោត្តនាម និងនាម</td>
                                <td className="border border-[#444] p-2">{student.name_kh || student.full_name}</td>
                                <td className="border border-[#444] p-2 font-bold">ភេទ</td>
                                <td className="border border-[#444] p-2">{student.gender}</td>
                            </tr>
                            <tr>
                                <td className="border border-[#444] p-2 font-bold">មធ្យមភាគសរុប</td>
                                <td className="border border-[#444] p-2">
                                    {summary?.overallAvg != null ? summary.overallAvg.toFixed(2) : '—'}
                                    {grade ? ` (${grade})` : ''}
                                </td>
                                <td className="border border-[#444] p-2 font-bold">អត្រាវត្តមាន</td>
                                <td className="border border-[#444] p-2">
                                    {summary ? `${summary.attRate.toFixed(1)}%` : '—'}
                                </td>
                            </tr>
                            <tr>
                                <td className="border border-[#444] p-2 font-bold">មក / ច្បាប់ / អវត្តមាន</td>
                                <td className="border border-[#444] p-2" colSpan={3}>
                                    {summary
                                        ? `${toKhmerNumber(summary.p)} / ${toKhmerNumber(summary.l)} / ${toKhmerNumber(summary.a)}`
                                        : '—'}
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <h3 className="kh-moul mb-2 text-[12pt]">សមត្ថភាពយល់ដឹង</h3>
                    <table className="w-full border-collapse text-[11pt]">
                        <thead>
                            <tr>
                                <th className="border border-[#444] bg-[#f1f5f9] p-2 text-left">កម្រិត</th>
                                <th className="w-24 border border-[#444] bg-[#f1f5f9] p-2">ភាគរយ</th>
                                <th className="border border-[#444] bg-[#f1f5f9] p-2">សូចនាករ</th>
                            </tr>
                        </thead>
                        <tbody>
                            {COGNITIVE_LEVELS.map((level) => (
                                <tr key={level.key}>
                                    <td className="border border-[#444] p-2 font-bold">{level.label}</td>
                                    <td className="border border-[#444] p-2 text-center">
                                        {toKhmerNumber(ratings[level.key] ?? 0)}%
                                    </td>
                                    <td className="border border-[#444] p-2">
                                        {/*
                                          A plain div rather than a chart: recharts renders to SVG
                                          that browsers routinely drop from print, and a bar is one
                                          rectangle. `print-color-adjust` keeps the fill.
                                        */}
                                        <div className="h-3 w-full bg-[#e2e8f0]">
                                            <div
                                                className="h-3"
                                                style={{
                                                    width: `${ratings[level.key] ?? 0}%`,
                                                    backgroundColor: LEVEL_COLOURS[level.key],
                                                    printColorAdjust: 'exact',
                                                    WebkitPrintColorAdjust: 'exact',
                                                }}
                                            />
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            <tr>
                                <td className="border border-[#444] p-2 font-bold">មធ្យមភាគ</td>
                                <td className="border border-[#444] p-2 text-center font-bold" colSpan={2}>
                                    {toKhmerNumber(average)}%
                                </td>
                            </tr>
                        </tbody>
                    </table>

                    <div className="mt-10 flex justify-between text-[11pt]">
                        <div className="text-center">
                            <p className="kh-moul">{settings?.manager_role || 'នាយកសាលា'}</p>
                            <p className="mt-12">{settings?.manager_name || settings?.director_name || ''}</p>
                        </div>
                        <div className="text-center">
                            <p className="kh-moul">គ្រូបន្ទុកថ្នាក់</p>
                            <p className="mt-12">{settings?.homeroom_teacher || settings?.teacher_name || ''}</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    )
}

export default CognitivePanel
