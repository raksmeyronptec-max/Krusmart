'use client'

import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/actions/Button'
import { ArrowLeft, Printer, Award, Calendar, Bookmark } from 'lucide-react'
import { notify } from '@/components/ui/feedback/notify'
import { getAllScoresByPeriod, getMonthlyScoresForYear } from '../score/total/actions'
import Select from '@/components/ui/forms/Select'
import type { Settings, Student } from '@/lib/types'
import { MONTHS_BY_CALENDAR } from '@/lib/constants/months'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { letterFor } from '@/lib/grading/scheme'
import { useScoreTemplate } from '@/lib/hooks/useScoreTemplate'
import { maxScoreByColumn, resolveTemplate, SYSTEM_PRIMARY_TEMPLATE } from '@/lib/scores/template'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { FALLBACK_NUMERIC_KEYS, numericColumnKeys } from '@/lib/scores/aggregate'
import { buildPeriodResults } from '@/lib/scores/periodResults'
import { defaultHonorCriteria, evaluateHonor, HONOR_CRITERIA_PROVENANCE } from '@/lib/scores/honor'
import { periodKeysForSemester } from '@/lib/scores/calendar'
import { useScoreCalendar } from '@/lib/hooks/useScoreCalendar'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import type { ScoreScope } from '@/lib/scores/workspace'
import { PageContainer } from '@/components/shell/PageContainer'
import { ScoreWorkspaceHeader } from '@/components/score/ScoreWorkspaceHeader'
import { ResultDocumentLink } from '@/components/reporting/ResultDocumentLink'

/** A student decorated with the per-period scores and the derived ranking fields. */
type RankedStudent = Student & {
    scores: Record<string, number | string | null>
    total: number
    average: string
    finalAverageForRank: number
    rank: number
}

export default function HonorRollClient({ initialStudents, settings}: { initialStudents: Student[], settings: Settings | null }) {
  /*
   * The class every mark below is fetched for.
   *
   * `getAllScoresByPeriod` resolves the caller's *default* class when it is not
   * told which one — so a teacher holding two classes saw this screen's roster
   * (resolved from `?class=` by the page) beside the other class's marks. The
   * page and the fetch have to name the same class.
   *
   * `?? undefined` keeps a pre-V2 account on `teacher_id` scoping, unchanged.
   */
  const scopeClassId = useActiveClass().classId ?? undefined
    // Was the literal `'2025-2026'`, which silently became the wrong year every
    // November — the same defect `/score/enter` and `/ranking` were corrected for.
    const [academicYear, setAcademicYear] = useState(getCurrentAcademicYear)
    // `annual`, not `yearly`: the name the schema, the shared layer and the
    // report all use. This screen was translating its own vocabulary.
    const [currentMode, setCurrentMode] = useState<ScoreScope>('monthly')
    const [currentPeriod, setCurrentPeriod] = useState('jan')
    /** Why a pupil is or is not listed — shown beside the podium. */
    const [criteriaLabel, setCriteriaLabel] = useState('')
    /** Pupils who cleared the criteria but do not fit the five podium cards. */
    const [alsoEligible, setAlsoEligible] = useState<RankedStudent[]>([])
    const [loading, setLoading] = useState(false)
    const [showPreview, setShowPreview] = useState(false)
    const [topStudents, setTopStudents] = useState<RankedStudent[]>([])

    /**
     * Same resolution as /score/total: honour-roll qualification is the final
     * effective average — the /50 coefficient average for a class on a level
     * template, never a raw total of mixed denominators (§10). The shared
     * denominators live in lib/scores/aggregate.ts.
     */
    const { rows: templateRows, context: templateContext, scheme, levelCurriculum } = useScoreTemplate('monthly')

    /** The class's own period calendar (00029) — never a compiled-in split. */
    const { calendar } = useScoreCalendar()

    /**
     * The period this screen is showing, in the two shapes it is asked for.
     *
     * `honorPeriod` goes to `resultDocument`, which decides WHICH report the
     * link produces; `headerSelection` goes to the shared header, which says
     * which rung the teacher is on. Both read the same two pieces of state, so
     * the sentence in the header and the document behind the button describe
     * one period.
     */
    const honorPeriod = useMemo(() => ({
        scope: currentMode,
        monthId: currentMode === 'monthly' ? currentPeriod : null,
        semester: currentPeriod === 'sem2' ? ('sem2' as const) : ('sem1' as const),
    }), [currentMode, currentPeriod])

    const headerSelection = useMemo(() => ({
        scope: currentMode,
        monthLabel: MONTHS_BY_CALENDAR.find(m => m.id === currentPeriod)?.label ?? null,
        semester: currentPeriod === 'sem2' ? ('sem2' as const) : ('sem1' as const),
    }), [currentMode, currentPeriod])

    /** The current year plus one either side, so the list follows the calendar. */
    const academicYearOptions = useMemo(() => {
        const start = parseInt(getCurrentAcademicYear().split('-')[0], 10)
        return [start - 1, start, start + 1].map((y) => `${y}-${y + 1}`)
    }, [])

    const keysForMode = (mode: 'monthly' | 'semester') => {
        if (!levelCurriculum) return FALLBACK_NUMERIC_KEYS[mode]
        return numericColumnKeys(resolveTemplate(
            templateRows.length > 0 ? templateRows : SYSTEM_PRIMARY_TEMPLATE, mode, templateContext,
        ))
    }

    /**
     * Load one period and decide who is honoured.
     *
     * ── Two defects closed here ───────────────────────────────────────────
     *
     * THE YEAR. The annual branch read `sem1_avg` / `sem2_avg` off the stored
     * sheet, added them, and divided by a hand-counted divisor. Nothing in this
     * application writes an annual row, so it honoured five pupils on `0.00`
     * each, ranked equal. It now composes the year through `buildPeriodResults`
     * — `deriveSemesterAverages` then `buildAnnualResult`, the same pair
     * `/score/total` and the printed annual sheets use.
     *
     * THE RULE. Eligibility was `.slice(0, 5)` after ranking — a property of the
     * podium's five cards, not a criterion. A class where everybody failed
     * still produced five honourees; a class where twenty pupils scored 9.5
     * honoured five of them; and a teacher asking "why is this pupil not on the
     * list?" could only be told "someone else was fifth", which is not a reason
     * a parent can be given. `evaluateHonor` decides now, against criteria whose
     * defaults are read from the class's own grading scheme
     * (`lib/scores/honor.ts`) — the same rule the printed `honor` report applies,
     * so screen and sheet finally name the same pupils.
     *
     * The podium is still five cards, because that is what the layout holds.
     * Everyone else who qualified is listed under it rather than silently
     * dropped, which is the difference between a layout and a policy.
     */
    const loadData = async (mode: ScoreScope, period: string) => {
        setLoading(true)
        setCurrentMode(mode)
        setCurrentPeriod(period)

        const fetchPeriod = mode === 'annual'
            ? `annual-${academicYear}`
            : `${period}-${academicYear}`

        // The three extra reads a derived year needs, made only in annual mode.
        const [records, sem1Rows, sem2Rows, monthlyRows] = await Promise.all([
            getAllScoresByPeriod(mode, fetchPeriod, scopeClassId),
            mode === 'annual'
                ? getAllScoresByPeriod('semester', `sem1-${academicYear}`, scopeClassId)
                : Promise.resolve([]),
            mode === 'annual'
                ? getAllScoresByPeriod('semester', `sem2-${academicYear}`, scopeClassId)
                : Promise.resolve([]),
            mode === 'annual'
                ? getMonthlyScoresForYear(academicYear, scopeClassId)
                : Promise.resolve([]),
        ])

        const templateFor = (m: 'monthly' | 'semester') => resolveTemplate(
            templateRows.length > 0 ? templateRows : SYSTEM_PRIMARY_TEMPLATE, m, templateContext,
        )
        const effectiveMode = mode === 'annual' ? 'semester' : mode
        const maxByColumn = maxScoreByColumn(templateFor(effectiveMode))
        const monthlyMaxByColumn = maxScoreByColumn(templateFor('monthly'))
        const numericKeys = keysForMode(effectiveMode)

        // Every figure and every rank comes from the shared builder; this screen
        // owns no arithmetic of its own.
        const results = buildPeriodResults({
            studentIds: initialStudents.map(s => s.id),
            mode,
            academicYear,
            records,
            numericKeys,
            maxByColumn,
            scheme,
            sem1Exams: sem1Rows,
            sem2Exams: sem2Rows,
            monthlyRecords: monthlyRows,
            monthlyMaxByColumn,
            sem1Months: periodKeysForSemester(calendar, 'sem1'),
            sem2Months: periodKeysForSemester(calendar, 'sem2'),
        })

        const criteria = defaultHonorCriteria(scheme)

        const eligible: RankedStudent[] = []
        for (const r of results) {
            const student = initialStudents.find(s => s.id === r.studentId)
            if (!student) continue

            const verdict = evaluateHonor({
                average: r.average,
                scores: r.scores,
                subjectKeys: numericKeys,
                maxByColumn,
            }, criteria, scheme)
            if (!verdict.eligible) continue

            eligible.push({
                ...student,
                scores: r.scores,
                total: r.total,
                average: r.average === null ? '0.00' : r.average.toFixed(2),
                finalAverageForRank: r.average ?? 0,
                rank: r.rank,
                grade: letterFor(r.average ?? 0, scheme),
            })
        }

        // Best first — this IS a league table, unlike the register the builder
        // hands back in roster order.
        eligible.sort((a, b) => a.rank - b.rank || b.finalAverageForRank - a.finalAverageForRank)

        if (eligible.length === 0) {
            /*
             * A class can honour nobody, and saying so is the point of a
             * criterion. The old message blamed missing data because the old
             * rule could only fail that way; this one distinguishes "no marks
             * yet" from "nobody cleared the bar", which are different answers
             * and lead to different actions.
             */
            const anyMarks = results.some(r => r.average !== null)
            notify.error(anyMarks
                ? `គ្មានសិស្សណាឈានដល់លក្ខខណ្ឌទេ (${criteria.label})`
                : 'មិនទាន់មានទិន្នន័យពិន្ទុគ្រប់គ្រាន់ទេ សូមបញ្ចូលពិន្ទុជាមុនសិន')
            setLoading(false)
            return
        }

        setCriteriaLabel(criteria.label)
        setTopStudents(eligible.slice(0, 5))
        setAlsoEligible(eligible.slice(5))
        setLoading(false)
        setShowPreview(true)
    }

    return (
        <PageContainer className="font-battambang relative">
            <style jsx global>{`
                .font-battambang { font-family: 'Battambang', cursive; }
                
                :root { 
                    --primary: #0a2351; 
                    --gold-main: #bf953f;
                    --gold-grad: linear-gradient(135deg, #BF953F 0%, #FCF6BA 25%, #B38728 50%, #FBF5B7 75%, #AA771C 100%);
                }

                @media print {
                    @page { size: A4 portrait; margin: 0; }
                    body { overflow: hidden; }
                    .print-container { 
                        display: block !important; 
                        width: 210mm !important; 
                        height: 297mm !important; 
                        margin: 0 !important;
                        box-shadow: none !important;
                        overflow: hidden !important;
                        padding: 5px !important;
                    }
                    .gold-border-inner { padding: 8mm 10mm 8mm 10mm !important; }
                }

                /*
                  Screen decoration only — the printed certificate below keeps
                  its literal gold and white, which paper needs and a theme must
                  not touch.
                */
                .bg-animate { 
                    position: absolute; inset: 0; z-index: 0; pointer-events: none; opacity: 0.5;
                    background: radial-gradient(circle at 10% 20%, var(--brand-100) 0%, transparent 40%), 
                                radial-gradient(circle at 90% 80%, var(--color-gold) 0%, transparent 40%), 
                                radial-gradient(circle at 50% 50%, var(--color-warning) 0%, transparent 50%); 
                    animation: moveBg 20s infinite alternate ease-in-out; 
                }
                @media (prefers-reduced-motion: reduce) { .bg-animate { animation: none; } }
                @keyframes moveBg { from { transform: scale(1); } to { transform: scale(1.1); } }

                .gold-border-outer {
                    width: 100%; height: 100%;
                    background: var(--gold-grad);
                    padding: 6px; border-radius: 4px; box-sizing: border-box; position: relative;
                }
                .white-inner-bg {
                    width: 100%; height: 100%;
                    background: #ffffff; background-image: radial-gradient(circle, #ffffff 40%, #fcfbf8 100%);
                    padding: 4px; box-sizing: border-box;
                }
                .gold-border-inner {
                    width: 100%; height: 100%;
                    border: 2px solid var(--gold-main); box-sizing: border-box;
                    padding: 10mm 12mm 8mm 12mm; position: relative;
                    display: flex; flex-direction: column; align-items: center; overflow: hidden;
                }
                .top-crown {
                    position: absolute; top: -18px; left: 50%; transform: translateX(-50%);
                    width: 45px; height: auto; z-index: 10;
                }

                .student-card {
                    width: 190px; background: #ffffff; border-radius: 10px; position: relative;
                    display: flex; flex-direction: column; align-items: center;
                    padding: 18px 10px 8px 10px;
                    border: 1px solid rgba(191, 149, 63, 0.25);
                    box-shadow: 0 6px 15px rgba(0,0,0,0.05);
                }
                .pos-1 {
                    border: 2px solid var(--gold-main); box-shadow: 0 10px 25px rgba(191, 149, 63, 0.20);
                    background: radial-gradient(circle at top, #ffffff, #fffcf0);
                    width: 210px; padding-top: 24px; grid-column: 1 / span 2; justify-self: center; margin-bottom: 4px;
                }
                .pos-2 { grid-column: 1; justify-self: end; }
                .pos-3 { grid-column: 2; justify-self: start; }
                .pos-4 { grid-column: 1; justify-self: end; }
                .pos-5 { grid-column: 2; justify-self: start; }

                .card-pattern {
                    position: absolute; top: 0; left: 0; right: 0; height: 4px;
                    background: var(--gold-grad); border-top-left-radius: 9px; border-top-right-radius: 9px;
                }
                .rank-badge {
                    position: absolute; top: -14px; left: 50%; transform: translateX(-50%);
                    width: 30px; height: 30px; background: var(--gold-grad); color: white;
                    border-radius: 50%; display: flex; align-items: center; justify-content: center;
                    font-weight: bold; font-size: 15px; box-shadow: 0 4px 8px rgba(191, 149, 63, 0.3);
                    z-index: 2; border: 2px solid white;
                }
                .card-crown { position: absolute; top: -38px; color: var(--gold-main); width: 25px; height: 25px; }

                .student-name { 
                    font-family: 'Moul', cursive; font-size: 15px; color: var(--primary);
                    margin-bottom: 2px; margin-top: 0px; text-align: center; width: 100%; line-height: 1.4;
                }
                .pos-1 .student-name { font-size: 17px; }

                .honor-grid {
                    display: grid; grid-template-columns: auto auto; justify-content: center;
                    row-gap: 12px; column-gap: 25px; width: 100%; margin: 0 auto; margin-top: 5px;
                }

                .select-btn {
                    display: flex; align-items: center; justify-content: center; gap: 8px;
                    padding: 12px 24px; background-color: var(--surface); border-radius: 12px; font-weight: bold;
                    transition: all 0.2s; cursor: pointer; color: var(--text-muted);
                }
                .select-btn:hover { background-color: var(--surface-muted); }
            `}</style>

            {!showPreview ? (
                <>
                    <div className="bg-animate"></div>
                    <div className="no-print relative z-10">
                        {/*
                          ── The way out ────────────────────────────────────
                          This screen carried a `PageHeader` and a
                          `ClassContextBar` and no link of any kind: it was the
                          only member of the លទ្ធផល module without the workspace
                          strip, so a teacher who arrived could leave only
                          through the sidebar or the browser's back button
                          (Phase 12 F7). It wears the same header its three
                          siblings wear now, which is both the way out and — via
                          `ResultDocumentLink` — the way on to the sheet.

                          The `ClassContextBar` went with it, not in spite of
                          R4 but because of it: `ScoreWorkspaceHeader` states
                          class · grade · year itself, so a second strip beneath
                          it would say the same three facts twice. Same reason
                          `/score-analyse` carries none.
                        */}
                        <ScoreWorkspaceHeader
                            title="តារាងកិត្តិយស"
                            description="សិស្សដែលបំពេញលក្ខខណ្ឌកិត្តិយសសម្រាប់វគ្គដែលបានជ្រើស"
                            academicYear={academicYear}
                            selection={headerSelection}
                            monthId={currentMode === 'monthly' ? currentPeriod : undefined}
                            actions={
                                <ResultDocumentLink
                                    surface="honor"
                                    period={honorPeriod}
                                    academicYear={academicYear}
                                />
                            }
                        />

                        {loading && (
                            <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-bg-surface/80 backdrop-blur-sm">
                                <div className="w-16 h-16 border-4 border-divider border-t-blue-600 rounded-full animate-spin"></div>
                                <p className="mt-4 kh-moul text-brand animate-pulse">កំពុងទាញយកទិន្នន័យ...</p>
                            </div>
                        )}
                        
                        <div className="rounded-[1.5rem] border-t-4 border-gold bg-bg-surface/95 p-6 text-center shadow-[0_10px_30px_rgba(0,0,0,0.05)] backdrop-blur-md md:p-10">
                            <div className="flex justify-center mb-4">
                                <div className="p-4 bg-gold/10 rounded-full text-gold border border-gold/30">
                                    <Award className="w-8 h-8 text-gold" />
                                </div>
                            </div>
                            <p className="text-text-muted font-bold mb-8">រចនាបថស៊ុមពណ៌មាស សម្រាប់សិស្សឆ្នើម</p>

                            <div className="mb-6 flex justify-center w-full overflow-x-auto pb-2">
                                <div className="inline-flex bg-paper p-1 rounded-xl whitespace-nowrap">
                                    <button onClick={() => setCurrentMode('monthly')} className={`select-btn ${currentMode === 'monthly' ? 'bg-bg-surface shadow text-brand' : 'text-text-muted hover:bg-paper'}`}>
                                        <Calendar className="w-4 h-4" /> ប្រចាំខែ
                                    </button>
                                    <button onClick={() => setCurrentMode('semester')} className={`select-btn ${currentMode === 'semester' ? 'bg-bg-surface shadow text-brand' : 'text-text-muted hover:bg-paper'}`}>
                                        <Bookmark className="w-4 h-4" /> ប្រចាំឆមាស
                                    </button>
                                    <button onClick={() => setCurrentMode('annual')} className={`select-btn ${currentMode === 'annual' ? 'bg-bg-surface shadow text-brand' : 'text-text-muted hover:bg-paper'}`}>
                                        <Award className="w-4 h-4" /> ប្រចាំឆ្នាំ
                                    </button>
                                </div>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left mb-8 max-w-2xl mx-auto">
                                <div>
                                    <label className="block font-bold text-text-body mb-2">ឆ្នាំសិក្សា</label>
                                    <Select
                                        ariaLabel="ឆ្នាំសិក្សា"
                                        value={academicYear}
                                        onChange={setAcademicYear}
                                        options={academicYearOptions}
                                    />
                                </div>

                                {currentMode !== 'annual' && (
                                    <div>
                                        <label className="block font-bold text-text-body mb-2">{currentMode === 'monthly' ? 'ជ្រើសរើសខែ' : 'ជ្រើសរើសឆមាស'}</label>
                                        <Select
                                            ariaLabel={currentMode === 'monthly' ? 'ជ្រើសរើសខែ' : 'ជ្រើសរើសឆមាស'}
                                            value={currentPeriod}
                                            onChange={setCurrentPeriod}
                                            options={currentMode === 'monthly'
                                                ? MONTHS_BY_CALENDAR.map(m => ({ value: m.id, label: m.label }))
                                                : [
                                                    { value: 'sem1', label: 'ឆមាសទី១' },
                                                    { value: 'sem2', label: 'ឆមាសទី២' },
                                                ]}
                                        />
                                    </div>
                                )}
                            </div>

                            <div className="flex justify-center">
                                <Button size="lg" printHidden={false} onClick={() => loadData(currentMode, currentPeriod)}>
                                    <Printer className="w-5 h-5" /> មើលគំរូ និង បោះពុម្ព
                                </Button>
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <div className="relative pt-8 pb-8 bg-divider min-h-[80vh] preview-mode">
                    {/* The preview backdrop no longer claims the viewport: it
                        sits inside the shell's content region, which already
                        fills the page. */}
                    <div className="fixed top-4 right-4 flex flex-col gap-3 z-50 no-print">
                        {/*
                          The honour SHEET, produced by the engine from the same
                          `evaluateHonor` rule this screen applied — so the names
                          on the paper and the names on the podium cannot differ.
                          The button below prints this preview.
                        */}
                        <ResultDocumentLink
                            shape="icon"
                            surface="honor"
                            period={honorPeriod}
                            academicYear={academicYear}
                        />
                        <Button printHidden={false} onClick={() => window.print()} title="បោះពុម្ពអេក្រង់នេះ" aria-label="បោះពុម្ពអេក្រង់នេះ">
                            <Printer className="w-6 h-6" />
                        </Button>
                        <button onClick={() => setShowPreview(false)} className="bg-text-muted text-white p-3 rounded-full shadow-lg hover:opacity-90 hover:scale-105 transition" title="បិទ">
                            <ArrowLeft className="w-6 h-6" />
                        </button>
                    </div>

                    <div className="print-container mx-auto">
                        <div className="gold-border-outer">
                            <div className="white-inner-bg">
                                <div className="gold-border-inner text-slate-900">
                                    
                                    <svg width="0" height="0" className="absolute">
                                        <defs>
                                            <linearGradient id="goldGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                                                <stop offset="0%" stopColor="#BF953F" />
                                                <stop offset="25%" stopColor="#FCF6BA" />
                                                <stop offset="50%" stopColor="#B38728" />
                                                <stop offset="75%" stopColor="#FBF5B7" />
                                                <stop offset="100%" stopColor="#AA771C" />
                                            </linearGradient>
                                        </defs>
                                    </svg>

                                    <svg className="top-crown" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg" style={{ fill: 'url(#goldGradient)' }}>
                                        <path d="M496 128c-17.7 0-32 14.3-32 32s14.3 32 32 32c21.8 0 40.5-14.7 46.5-34.8L444.6 363.5c-2.3 8.1-9.6 13.9-18 14L85.4 378c-8.4 .1-15.8-5.7-18-13.8L-9.7 172.9c10-8.9 16.4-21.9 16.4-36.4c0-26.5-21.5-48-48-48s-48 21.5-48 48c0 23.3 16.7 42.7 38.6 47.1l66 226.7C24.4 435.5 45.4 456 71.4 456H440.6c26 0 47-20.5 55.1-45.7l66-226.7C583.6 179.2 600 159.8 600 136.5c0-26.5-21.5-48-48-48z" transform="translate(48 20) scale(0.8)"/>
                                        <path d="M256 128c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zM80 128c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32zm352 0c-17.7 0-32 14.3-32 32s14.3 32 32 32 32-14.3 32-32-14.3-32-32-32z"/>
                                    </svg>

                                    <div className="w-full relative z-10">
                                        <div className="text-center w-full mb-1">
                                            <h3 className="kh-moul text-[11pt] mb-1">ព្រះរាជាណាចក្រកម្ពុជា</h3>
                                            <h3 className="kh-moul text-[11pt] mb-1">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                                            <div className="text-[10px] mt-1 text-center">❧❧❧ ❖ ☙☙☙</div>
                                        </div>
                                        
                                        <div className="absolute top-[35px] left-0 text-left font-bold text-[9pt] leading-[1.5]">
                                            <p>{settings?.management_unit_1 || "មន្ទីរអប់រំ យុវជន និងកីឡា..."}</p>
                                            <p>{settings?.management_unit_2 || "ការិយាល័យអប់រំ..."}</p>
                                            <p className="mt-1">{settings?.school_name || "សាលា..."}</p>
                                            <p>{settings?.class_name || "ថ្នាក់..."}</p>
                                        </div>
                                    </div>

                                    <div className="text-center w-full mt-0 mb-1 z-10">
                                        <h2 className="kh-moul text-[15pt] mb-1 text-gold tracking-wide" style={{ textShadow: '1px 1px 0px rgba(0,0,0,0.1)' }}>តារាងកិត្តិយស</h2>
                                        <h3 className="kh-moul text-[10pt] text-brand">
                                            {currentMode === 'monthly' ? `ប្រចាំខែ ${MONTHS_BY_CALENDAR.find(m => m.id === currentPeriod)?.label}` : currentMode === 'semester' ? `ប្រចាំឆមាសទី${currentPeriod === 'sem1' ? '១' : '២'}` : 'ប្រចាំឆ្នាំ'}
                                        </h3>
                                        {/*
                                          THE RULE, PRINTED ON THE SHEET.
                                          The product has no official honour
                                          criterion, and these thresholds are
                                          derived from the class's own grading
                                          scheme rather than chosen by anyone —
                                          `HONOR_CRITERIA_PROVENANCE` says so.
                                          A sheet that lists pupils without
                                          stating why invites the reader to
                                          assume a ministry rule; the printed
                                          `honor` report carries the same
                                          sentence, so screen and document make
                                          the same claim.
                                        */}
                                        {criteriaLabel && (
                                            <p className="mt-0.5 text-[8pt] font-normal text-text-muted">
                                                លក្ខខណ្ឌ៖ {criteriaLabel}
                                                {HONOR_CRITERIA_PROVENANCE === 'derived' && ' (កំណត់តាមមាត្រដ្ឋានពិន្ទុរបស់ថ្នាក់)'}
                                            </p>
                                        )}
                                    </div>

                                    <div className="honor-grid w-full flex-1 z-10">
                                        {topStudents.map((stu, i) => {
                                            const posClass = `pos-${i + 1}`
                                            return (
                                                <div key={stu.id} className={`student-card ${posClass}`}>
                                                    <div className="card-pattern"></div>
                                                    <div className="rank-badge">{stu.rank}</div>
                                                    {i === 0 && <Award className="card-crown" />}
                                                    <div className="w-[60px] h-[60px] mb-2 mt-2 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200">
                                                        <svg className="w-8 h-8 text-text-muted" fill="none" stroke="currentColor" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"></path></svg>
                                                    </div>
                                                    <h4 className="student-name">{stu.name_kh || stu.full_name}</h4>
                                                    <div className="text-[10px] text-slate-500 mb-2">អត្តលេខ៖ {toKhmerNumber(stu.id)}</div>
                                                    <div className="flex items-center gap-4 border-t border-slate-100 pt-2 w-full justify-center">
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-0.5">និទ្ទេស</span>
                                                            <span className={`font-bold text-[14px] ${stu.grade === 'A' ? 'text-gold' : stu.grade === 'B' ? 'text-brand-500' : stu.grade === 'C' ? 'text-warning-text' : 'text-brand'}`}>{stu.grade}</span>
                                                        </div>
                                                        <div className="flex flex-col items-center">
                                                            <span className="text-[9px] text-text-muted font-bold uppercase tracking-wider mb-0.5">មធ្យមភាគ</span>
                                                            <span className="font-bold text-[14px] text-slate-700">{toKhmerNumber(stu.average)}</span>
                                                        </div>
                                                    </div>
                                                </div>
                                            )
                                        })}
                                    </div>

                                    {/*
                                      Everyone else who cleared the criteria.
                                      The podium holds five cards and a class
                                      can honour more than five pupils —
                                      dropping the rest silently is exactly how
                                      a layout turns into a policy. Listed as
                                      names rather than cards, because they are
                                      the same claim at a smaller size.
                                    */}
                                    {alsoEligible.length > 0 && (
                                        <div className="w-full z-10 mb-2 px-2">
                                            <p className="text-[9pt] font-normal leading-relaxed">
                                                <span className="kh-moul text-[9pt]">សិស្សដែលឈានដល់លក្ខខណ្ឌផងដែរ៖ </span>
                                                {alsoEligible
                                                    .map((stu) => `${stu.name_kh || stu.full_name} (${toKhmerNumber(stu.average)})`)
                                                    .join(' · ')}
                                            </p>
                                        </div>
                                    )}

                                    <div className="w-full mt-auto mb-0 z-10 flex flex-col items-center">
                                        <div className="flex justify-end w-full mb-1">
                                            <div className="text-center w-[50%]">
                                                <p className="mb-1 text-[8pt] font-normal">ថ្ងៃ................ខែ..........ឆ្នាំ..........ព.ស.២៥៦...</p>
                                                <p className="text-[8pt] font-normal">ធ្វើនៅ {settings?.province_date || ".............."}, ថ្ងៃទី........ ខែ........... ឆ្នាំ ២០២...</p>
                                            </div>
                                        </div>
                                        <div className="flex justify-between w-full items-start">
                                            <div className="text-center w-[45%]">
                                                <p className="text-[10pt] font-normal">បានឃើញ និងឯកភាព</p>
                                                <p className="kh-moul text-[10pt] mt-1">នាយកសាលា</p>
                                            </div>
                                            <div className="text-center w-[45%]">
                                                <p className="mb-1 kh-moul text-[10pt]">គ្រូបន្ទុកថ្នាក់</p>
                                                <p className="kh-moul text-[10pt] mt-[20px]">{settings?.teacher_name || "ឈ្មោះគ្រូ"}</p>
                                            </div>
                                        </div>
                                    </div>

                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </PageContainer>
    )
}
