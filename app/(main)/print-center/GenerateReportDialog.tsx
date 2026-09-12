'use client'

import { useCallback, useEffect, useId, useState } from 'react'
import Link from 'next/link'
import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileCheck2,
  Loader2,
  Sliders,
  Users,
} from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { notify } from '@/components/ui/feedback/notify'
import { Skeleton } from '@/components/ui/feedback/Skeleton'
import Select from '@/components/ui/forms/Select'
import { fieldLabel } from '@/components/ui/forms/fieldStyles'

import { ACADEMIC_MONTH_OPTIONS_BY_ID } from '@/lib/constants/months'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { activeTemplate, templatesFor } from '@/lib/reporting/report-template'
import { FORMAT_LABELS, type ReportDefinition } from '@/lib/reporting/report-types'
import { generateReport, listCertificateCandidates, previewReport } from './actions'
import { ReportPreviewSheet } from './ReportPreviewSheet'
import type { SheetPreview } from '@/lib/reporting/xlsx-preview'
import type { CertificateCandidate } from '@/lib/reporting/report-data'

/**
 * The shared generation flow: document → period → options → check → download.
 *
 * One dialog for every report, because the flow is the same for all of them and
 * twenty-seven bespoke generate screens is the thing this architecture replaces.
 * What differs per report is declared, not coded: `report.period` decides which
 * selector appears, `templatesFor` decides whether a version picker is needed,
 * and only the certificate asks *who*.
 *
 * ── The five steps are a rail, not a wizard ───────────────────────────────
 *
 * Generating a document is one decision and a confirmation, so splitting it
 * across five screens with Back and Next would add four clicks to buy nothing.
 * What the teacher needs is to know where they are and what is left — so the
 * steps are stated as a rail and the panel below shows all of them, with the
 * one genuinely optional step (ជម្រើស) folded away until it is wanted.
 *
 * Only ONE step opens closed, and only when it holds nothing required: the
 * certificate's pupil selection lives in that step and is the whole point of
 * that report, so it opens with the dialog.
 *
 * ── The period arrives already chosen ─────────────────────────────────────
 *
 * The Print Center's period bar seeds it, so a teacher who set ខែកញ្ញា on the
 * index does not set it again here. It stays editable, because changing your
 * mind at the last moment is a normal thing to do and walking back to the index
 * to do it is not.
 *
 * ── The preview is not decoration ─────────────────────────────────────────
 *
 * A teacher printing the wrong month discovers it on paper, after the class has
 * been handed the sheets; "៣២ សិស្ស · ៣ មុខវិជ្ជា · មធ្យមភាគ ៨.២៤" is the check
 * that catches it beforehand. It runs on open and on every change, from the
 * same resolver the document is built from — so it cannot describe a document
 * different from the one that generates. It draws the SHEET too, because the
 * counts answer "is this the right class and month?" and cannot answer "is this
 * the right document?", which is exactly what the version selector beside them
 * asks and whose whole consequence is visual.
 *
 * ── Download is not print ─────────────────────────────────────────────────
 *
 * This flow produces a FILE. It never says បោះពុម្ព, because nothing here sends
 * anything to a printer — the teacher opens the downloaded workbook and prints
 * it from there, or uses the report's own screen, which is what the index's
 * `បោះពុម្ពពីអេក្រង់` rows are. A button that says "print" and fills the
 * downloads folder is the confusion §26 asks to remove.
 *
 * Generating does not close the dialog. The file downloads once — a browser
 * that saves silently to a Downloads folder gives no evidence anything
 * happened — and the dialog then states what was produced, with the download
 * available again.
 */
export function GenerateReportDialog({
  report,
  onClose,
  classId,
  className,
  academicYear,
  initialPeriod = null,
  initialSemester = null,
}: {
  /** `null` closes the dialog. */
  report: ReportDefinition | null
  onClose: () => void
  classId: string | null
  className: string
  academicYear: string
  /**
   * The period the Print Center is currently showing, or the one a results
   * screen handed over.
   *
   * Applied only on the re-seed below, never as a controlled value: once the
   * dialog is open the selector belongs to the teacher, and a prop that kept
   * snapping the month back would make it look broken.
   */
  initialPeriod?: string | null
  initialSemester?: 'sem1' | 'sem2' | null
}) {
  const [period, setPeriod] = useState(initialPeriod ?? 'nov')
  const [semester, setSemester] = useState<string>(initialSemester ?? 'sem1')
  const [templateId, setTemplateId] = useState('')
  const [summary, setSummary] = useState<{
    studentCount: number; subjectCount: number; average: number | null
    periodLabel: string; className: string
    honorCount?: number; criteriaLabel?: string; criteriaProvisional?: boolean
  } | null>(null)
  /*
   * The filled sheet, and why there isn't one when there isn't. Held beside
   * `summary` rather than inside it because the counts still answer their own
   * question when the picture cannot be drawn — a preview that fails to build
   * must not take the rest of the panel down with it, nor block generation.
   */
  const [sheet, setSheet] = useState<SheetPreview | null>(null)
  const [sheetMissing, setSheetMissing] = useState<'docx' | 'failed' | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Step ៣, folded away unless it holds a choice the teacher must make. */
  const [optionsOpen, setOptionsOpen] = useState(false)
  const optionsId = useId()

  /**
   * The finished document, held in memory until the dialog closes.
   *
   * Kept as a Blob rather than an object URL so nothing leaks when the teacher
   * downloads twice: each save mints a URL and revokes it immediately.
   */
  const [generated, setGenerated] = useState<{
    blob: Blob; fileName: string
    rowCount: number; subjectCount: number; templateLabel: string
  } | null>(null)

  /**
   * The certificate's pupil selection — the one report whose flow asks *who* as
   * well as *when*. `null` means "not loaded yet"; an empty array is a real,
   * deliberate choice of nobody.
   */
  const [candidates, setCandidates] = useState<CertificateCandidate[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const needsStudents = report?.type === 'certificate'

  const templates = report ? templatesFor(report.type) : []
  const chosenTemplate = templates.find((t) => t.id === templateId) ?? null
  /** Exactly one file comes out, and this is it — never the definition's list. */
  const outputFormat = chosenTemplate?.format ?? report?.formats[0] ?? 'xlsx'

  /** The version picker is a real choice; the pupil list is a required one. */
  const hasOptions = templates.length > 1 || needsStudents

  /** The period value the resolver expects, per the report's own declaration. */
  const periodValue =
    report?.period === 'month' ? period
    : report?.period === 'semester' ? semester
    : academicYear

  // Re-seed on open: the previous report's period must not carry over. Adjusted
  // during render rather than in an effect so the first painted frame is right.
  const key = report ? `${report.type}` : null
  const [seeded, setSeeded] = useState<string | null>(null)
  if (key !== seeded) {
    setSeeded(key)
    // The Print Center's period applies on open; after that the selectors are
    // the teacher's. `?? 'nov'` rather than leaving the previous report's month
    // in place — re-seeding is what stops one report's choice leaking into the
    // next one's flow.
    setPeriod(initialPeriod ?? 'nov')
    setSemester(initialSemester ?? 'sem1')
    setSummary(null)
    setSheet(null)
    setSheetMissing(null)
    /*
     * The ACTIVE version, not the newest one.
     *
     * `templatesFor` sorts newest-version-first, so seeding from `[0]` picked
     * whichever layout had the highest version number — including a superseded
     * one, and including a version added as `isActive: false` precisely because
     * it is not the one to print onto. The index's row advertises the active
     * template's format and `reportAvailability` names the active template, so
     * a flow defaulting to a different file made the row and the dialog
     * disagree about what the button produces. `[0]` stays as the fallback for
     * a report whose registry entries are all inactive.
     */
    setTemplateId(report ? (activeTemplate(report.type)?.id ?? templates[0]?.id ?? '') : '')
    setCandidates(null)
    setChosen(new Set())
    setGenerated(null)
    // Open only where the step holds something the teacher has to answer.
    setOptionsOpen(report?.type === 'certificate')
  }

  const loadPreview = useCallback(async () => {
    if (!report) return
    setLoading(true)
    try {
      const res = await previewReport(
        {
          reportType: report.type,
          classId: classId ?? undefined,
          academicYear,
          period: periodValue,
        },
        // The version the teacher picked, so switching v1/v2 redraws rather
        // than leaving a sheet on screen that is not the one about to be built.
        templateId || undefined,
      )
      if (res.error) {
        notify.error(res.error)
        setSummary(null)
        setSheet(null)
        setSheetMissing(null)
        return
      }
      setSummary(res.summary ?? null)
      setSheet(res.preview ?? null)
      setSheetMissing(res.previewUnavailable ?? null)
    } finally {
      setLoading(false)
    }
  }, [report, classId, academicYear, periodValue, templateId])

  useEffect(() => {
    if (!report) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
    loadPreview()
  }, [report, loadPreview])

  // Only the certificate loads a roster, and only when it is the open report.
  useEffect(() => {
    if (!report || report.type !== 'certificate') return
    let alive = true
    listCertificateCandidates({
      reportType: report.type,
      classId: classId ?? undefined,
      academicYear,
      period: periodValue,
    }).then((res) => {
      if (!alive) return
      if (res.error) {
        notify.error(res.error)
        return
      }
      const list = res.candidates ?? []
      setCandidates(list)
      // Pre-selected to the default cohort — the pupils who passed the year —
      // so the dialog opens on the same set generating without a selection
      // would produce. The teacher adjusts from there rather than starting
      // from an empty list and wondering what the rule was.
      setChosen(new Set(list.filter((c) => c.eligible).map((c) => c.id)))
    })
    return () => { alive = false }
  }, [report, classId, academicYear, periodValue])

  /**
   * Hand a file to the browser.
   *
   * The object URL is minted and revoked around the single click, so repeating
   * the download from the success panel cannot accumulate blob URLs for the
   * lifetime of the page.
   */
  const save = (blob: Blob, fileName: string) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  const submit = async () => {
    if (!report) return
    setBusy(true)
    try {
      const res = await generateReport(
        {
          reportType: report.type,
          classId: classId ?? undefined,
          academicYear,
          period: periodValue,
          // Sent only where it means something. The server checks every id
          // against the roster regardless — this list is a request, not proof.
          studentIds: needsStudents ? [...chosen] : undefined,
        },
        templateId || undefined,
      )

      if (res.error || !res.file || !res.fileName) {
        notify.error(res.error ?? 'បង្កើតឯកសារមិនបានសម្រេច')
        return
      }

      // The document crosses the action boundary as base64; turn it back into
      // bytes and hand it to the browser. Nothing is persisted server-side —
      // the file is the teacher's, and keeping copies of every generated sheet
      // is storage nobody asked for.
      const bytes = Uint8Array.from(atob(res.file), (c) => c.charCodeAt(0))
      const blob = new Blob([bytes], { type: res.mimeType })

      save(blob, res.fileName)
      setGenerated({
        blob,
        fileName: res.fileName,
        rowCount: res.meta?.rowCount ?? 0,
        subjectCount: res.meta?.subjectCount ?? 0,
        templateLabel:
          templates.find((t) => t.id === res.meta?.templateId)?.label ?? '',
      })
      notify.success(`បានបង្កើត ${res.fileName}`)
    } finally {
      setBusy(false)
    }
  }

  if (!report) return null

  const hasStudents = (summary?.studentCount ?? 0) > 0
  const hasMarks = summary !== null && summary.average !== null
  /** A result sheet with nobody marked prints a blank grid, which is legitimate
      and never what a teacher expected when they pressed the button. */
  const expectsMarks = report.period !== 'none' && report.category !== 'attendance'
  const downloadLabel = `ទាញយក ${FORMAT_LABELS[outputFormat]}`

  return (
    <Dialog
      open={report !== null}
      onClose={onClose}
      title={report.label}
      description={report.description}
      /* A landscape sheet needs the room; every other state keeps the dialog
         the size it has always been. */
      size={sheet ? '2xl' : 'md'}
      footer={
        generated ? (
          <>
            <Button variant="secondary" printHidden={false} onClick={onClose}>
              បិទ
            </Button>
            <Button
              printHidden={false}
              onClick={() => save(generated.blob, generated.fileName)}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> ទាញយកម្ដងទៀត
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" printHidden={false} onClick={onClose}>
              បោះបង់
            </Button>
            <Button
              printHidden={false}
              onClick={submit}
              loading={busy}
              /* An empty pupil selection would produce a certificate document
                 with no certificates in it — valid, and useless. */
              disabled={loading || (needsStudents && chosen.size === 0)}
            >
              <Download className="h-4 w-4" aria-hidden="true" /> {downloadLabel}
            </Button>
          </>
        )
      }
    >
      {generated ? (
        /* ------------------------------------------------------- generated */
        <div
          className="flex flex-col gap-3 rounded-lg border border-success/40 bg-success/5 p-4"
          role="status"
        >
          <p className="flex items-center gap-2 text-sm font-bold text-text-heading">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden="true" />
            បង្កើតឯកសារបានសម្រេច
          </p>

          <p className="break-all text-xs text-text-body">{generated.fileName}</p>

          <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
            <Stat label="ជួរដេក" value={`${toKhmerNumber(generated.rowCount)}`} />
            <Stat label="មុខវិជ្ជា" value={`${toKhmerNumber(generated.subjectCount)}`} />
            {generated.templateLabel && (
              <div className="col-span-2">
                <dt className="text-text-muted">ទម្រង់ឯកសារ</dt>
                <dd className="font-bold text-text-heading">{generated.templateLabel}</dd>
              </div>
            )}
          </dl>

          <p className="text-[11px] text-text-muted">
            ឯកសារត្រូវបានទាញយករួចហើយ។ ប្រសិនបើរកមិនឃើញ សូមចុច «ទាញយកម្ដងទៀត»។
          </p>
        </div>
      ) : (
      <div className="flex flex-col gap-4">
        <StepRail
          period={report.period !== 'none'}
          options={hasOptions}
          ready={!loading && summary !== null}
        />

        {/* ------------------------------------------------ ១ · the document */}
        <Step n={1} title="ឯកសារ">
          <div className="rounded-lg border border-divider bg-paper p-3 text-xs">
            <p className="font-bold text-text-heading">
              ថ្នាក់ {className || '—'} · ឆ្នាំសិក្សា {toKhmerNumber(academicYear)}
            </p>
            <p className="mt-0.5 text-text-muted">
              ថ្នាក់ត្រូវបានកំណត់ដោយប្រព័ន្ធតាមការចាត់តាំងរបស់អ្នក។
            </p>

            {/*
              Whether the layout is authoritative, stated where it is a claim
              the teacher is about to make. It used to sit on the index's rows,
              which was the wrong moment twice over: it is the loudest piece of
              build vocabulary on a page a teacher scans, and it is not a fact
              about the DOCUMENT until one is being produced. A sheet filed
              upward carries whatever this says, so it is said here.
            */}
            {chosenTemplate && (
              <p className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-divider pt-2 text-[11px]">
                <span
                  className={`rounded px-1.5 py-0.5 font-bold ${
                    chosenTemplate.provenance === 'official'
                      ? 'bg-gold/15 text-gold'
                      : 'bg-paper text-text-muted'
                  }`}
                >
                  {chosenTemplate.provenance === 'official' ? 'ឯកសារផ្លូវការ' : 'ដកស្រង់'}
                </span>
                <span className="min-w-0 text-text-muted">{chosenTemplate.label}</span>
              </p>
            )}
          </div>
        </Step>

        {/* -------------------------------------------------- ២ · the period */}
        {report.period === 'month' && (
          <Step n={2} title="រយៈពេល">
            <label className={fieldLabel} htmlFor="report-month">ខែ</label>
            <Select
              id="report-month"
              ariaLabel="ខែ"
              value={period}
              onChange={setPeriod}
              options={ACADEMIC_MONTH_OPTIONS_BY_ID}
            />
          </Step>
        )}

        {report.period === 'semester' && (
          <Step n={2} title="រយៈពេល">
            <label className={fieldLabel} htmlFor="report-semester">ឆមាស</label>
            <Select
              id="report-semester"
              ariaLabel="ឆមាស"
              value={semester}
              onChange={setSemester}
              options={[
                { value: 'sem1', label: 'ឆមាសទី១' },
                { value: 'sem2', label: 'ឆមាសទី២' },
              ]}
            />
          </Step>
        )}

        {report.period === 'year' && (
          <Step n={2} title="រយៈពេល">
            <p className="rounded-lg border border-divider bg-paper p-3 text-xs font-bold text-text-heading">
              ឆ្នាំសិក្សា {toKhmerNumber(academicYear)}
            </p>
          </Step>
        )}

        {/* ------------------------------------------------- ៣ · the options */}
        {hasOptions && (
          <div>
            <button
              type="button"
              onClick={() => setOptionsOpen((prev) => !prev)}
              aria-expanded={optionsOpen}
              aria-controls={optionsId}
              className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-lg border border-divider px-3 text-left text-xs font-bold text-text-heading transition hover:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
            >
              <Sliders className="h-3.5 w-3.5 shrink-0 text-brand" aria-hidden="true" />
              <span className="flex-1">
                <span className="text-text-muted" aria-hidden="true">{toKhmerNumber(3)} </span>
                ជម្រើស
              </span>
              <span className="text-[11px] font-normal text-text-muted">
                {needsStudents
                  ? `សិស្ស ${toKhmerNumber(chosen.size)} នាក់`
                  : `ទម្រង់ ${toKhmerNumber(templates.length)}`}
              </span>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${
                  optionsOpen ? 'rotate-180' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            <div id={optionsId} hidden={!optionsOpen} className="mt-3 flex flex-col gap-3">
              {/* Only when there is a choice to make — a single version is not a
                  decision worth a control. */}
              {templates.length > 1 && (
                <div>
                  <label className={fieldLabel} htmlFor="report-template">ទម្រង់ឯកសារ</label>
                  <Select
                    id="report-template"
                    ariaLabel="ទម្រង់ឯកសារ"
                    value={templateId}
                    onChange={setTemplateId}
                    options={templates.map((t) => ({ value: t.id, label: t.label }))}
                  />
                </div>
              )}

              {needsStudents && (
                <div className="rounded-lg border border-divider">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider px-3 py-2">
                    <p className="text-xs font-bold text-text-heading">
                      សិស្សទទួលបណ្ណសរសើរ ({toKhmerNumber(chosen.size)} នាក់)
                    </p>
                    {candidates && candidates.length > 0 && (
                      <div className="flex gap-1.5">
                        <ChipButton onClick={() => setChosen(new Set(candidates.filter((c) => c.eligible).map((c) => c.id)))}>
                          សិស្សឡើងថ្នាក់
                        </ChipButton>
                        <ChipButton onClick={() => setChosen(new Set(candidates.map((c) => c.id)))}>
                          ទាំងអស់
                        </ChipButton>
                        <ChipButton onClick={() => setChosen(new Set())}>សម្អាត</ChipButton>
                      </div>
                    )}
                  </div>

                  {candidates === null ? (
                    <div className="p-3"><Skeleton className="h-16 w-full" /></div>
                  ) : candidates.length === 0 ? (
                    /* Not an error: a class nobody has been assessed in has
                       nobody to certify, and saying so beats an empty box. */
                    <p className="p-3 text-xs text-text-muted">
                      មិនទាន់មានសិស្សណាមានលទ្ធផលប្រចាំឆ្នាំនៅឡើយទេ។
                    </p>
                  ) : (
                    <ul className="max-h-52 overflow-auto">
                      {candidates.map((c) => (
                        <li key={c.id}>
                          <label className="flex cursor-pointer items-center gap-2.5 px-3 py-1.5 text-xs transition hover:bg-paper">
                            <input
                              type="checkbox"
                              className="h-4 w-4 shrink-0 rounded border-divider text-brand"
                              checked={chosen.has(c.id)}
                              onChange={() => setChosen((prev) => {
                                const next = new Set(prev)
                                if (next.has(c.id)) next.delete(c.id)
                                else next.add(c.id)
                                return next
                              })}
                            />
                            <span className="min-w-0 flex-1 truncate font-bold text-text-heading">{c.name}</span>
                            <span className="shrink-0 text-text-muted">
                              ចំណាត់ថ្នាក់ {toKhmerNumber(c.rank)} · ម.ភាគ {c.average ?? '—'}
                            </span>
                            {/* A pupil who repeated the year can still be chosen
                                deliberately; the label says what they are so the
                                choice is informed rather than accidental. */}
                            <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                              c.eligible
                                ? 'bg-success/15 text-success'
                                : 'bg-warning/15 text-warning-text'
                            }`}>
                              {c.statusLabel}
                            </span>
                          </label>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {/* --------------------------------------------------- ៤ · the check */}
        <Step n={4} title="ពិនិត្យ">
          <div className="rounded-lg border border-divider p-3">
            <p className="mb-2 flex items-center gap-1.5 text-xs font-bold text-text-heading">
              <FileCheck2 className="h-3.5 w-3.5 text-brand" aria-hidden="true" />
              ពិនិត្យទិន្នន័យមុនបង្កើត
            </p>

            {loading ? (
              <div className="flex flex-col gap-1.5" role="status" aria-busy="true">
                <span className="sr-only">កំពុងពិនិត្យទិន្នន័យ...</span>
                <Skeleton className="h-4 w-2/3 rounded" />
                <Skeleton className="h-4 w-1/2 rounded" />
              </div>
            ) : summary ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                <Stat label="សិស្ស" value={`${toKhmerNumber(summary.studentCount)} នាក់`} />
                <Stat label="មុខវិជ្ជា" value={`${toKhmerNumber(summary.subjectCount)}`} />
                <Stat
                  label="មធ្យមភាគថ្នាក់"
                  value={summary.average === null ? '—' : summary.average.toFixed(2)}
                />
                <Stat label="គ្រា" value={summary.periodLabel} />
                {/* An honour report's headline figure is how many qualified,
                    which is not derivable from the other three. */}
                {summary.honorCount !== undefined && (
                  <Stat label="ទទួលកិត្តិយស" value={`${toKhmerNumber(summary.honorCount)} នាក់`} />
                )}
              </dl>
            ) : (
              <p className="text-xs text-text-muted">មិនអាចពិនិត្យទិន្នន័យបានទេ។</p>
            )}

            {/* The rule, and whether it is official — stated before the teacher
                generates, not discovered on the printed sheet. */}
            {!loading && summary?.criteriaLabel && (
              <div className="mt-2 rounded-md border border-warning/40 bg-warning/5 p-2">
                <p className="text-[11px] text-text-body">
                  លក្ខណៈវិនិច្ឆ័យ៖ {summary.criteriaLabel}
                </p>
                {summary.criteriaProvisional && (
                  <p className="mt-0.5 text-[11px] font-bold text-warning-text">
                    លក្ខណៈវិនិច្ឆ័យនេះជាបណ្ដោះអាសន្ន — មិនមែនច្បាប់ផ្លូវការពីក្រសួងទេ។
                  </p>
                )}
              </div>
            )}

            {/*
              The three honest empty states. Each says what is missing and,
              where there is one, the screen that fixes it — an empty document
              is a legitimate output and never a surprise a teacher should meet
              on paper.
            */}
            {!loading && summary && !hasStudents && (
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warning-text">
                <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                មិនទាន់មានសិស្សក្នុងថ្នាក់ — ឯកសារនឹងចេញជាទម្រង់ទទេសម្រាប់បំពេញដោយដៃ។
              </p>
            )}

            {!loading && summary && hasStudents && summary.subjectCount === 0 && (
              <p className="mt-2 text-[11px] text-warning-text">
                មិនទាន់មានមុខវិជ្ជាក្នុងទម្រង់ពិន្ទុទេ — ជួរឈរមុខវិជ្ជានឹងទទេ។{' '}
                <Link
                  href={classId ? `/score/subjects?class=${encodeURIComponent(classId)}` : '/score/subjects'}
                  className="font-bold underline underline-offset-2 hover:text-brand"
                >
                  ទៅកំណត់មុខវិជ្ជា
                </Link>
              </p>
            )}

            {!loading && summary && hasStudents && summary.subjectCount > 0
              && expectsMarks && !hasMarks && (
              <p className="mt-2 text-[11px] text-warning-text">
                មិនទាន់មានពិន្ទុក្នុងគ្រានេះទេ — តារាងនឹងចេញជាទម្រង់ទទេ។{' '}
                <Link
                  href={classId ? `/score/enter?class=${encodeURIComponent(classId)}` : '/score/enter'}
                  className="font-bold underline underline-offset-2 hover:text-brand"
                >
                  ទៅបញ្ចូលពិន្ទុ
                </Link>
              </p>
            )}
          </div>
        </Step>

        {/* ------------------------------------------------- the sheet itself */}
        {loading ? (
          <div className="rounded-lg border border-divider p-3" role="status" aria-busy="true">
            <span className="sr-only">កំពុងរៀបចំឯកសារជាមុន...</span>
            <Skeleton className="mb-2 h-4 w-1/3 rounded" />
            <Skeleton className="h-40 w-full rounded" />
          </div>
        ) : sheet ? (
          <ReportPreviewSheet
            sheet={sheet}
            templateLabel={chosenTemplate?.label}
            documentLabel={report.label}
            contextLabel={`${className || '—'} · ${summary?.periodLabel ?? ''}`}
          />
        ) : sheetMissing === 'docx' ? (
          /* A Word document is a page per pupil, not a sheet — say that rather
             than draw an approximation of a layout nobody will receive. */
          <p className="rounded-lg border border-divider p-3 text-[11px] text-text-muted">
            ការមើលឯកសារជាមុនមានសម្រាប់ឯកសារ Excel។ ឯកសារ Word នេះនឹងបង្កើត ១ ទំព័រក្នុងមួយសិស្ស។
          </p>
        ) : sheetMissing === 'failed' ? (
          <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-[11px] text-text-body">
            មិនអាចបង្ហាញឯកសារជាមុនបានទេ — ប៉ុន្តែការបង្កើតឯកសារនៅដំណើរការធម្មតា។
          </p>
        ) : null}

        {/* ------------------------------------------------ ៥ · the hand-over */}
        {!loading && summary && (
          <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 rounded-lg border border-divider bg-paper p-3 text-[11px] text-text-muted">
            <span className="font-bold text-text-heading">ត្រៀមរួចរាល់</span>
            <span aria-hidden="true">·</span>
            <span>សិស្ស {toKhmerNumber(summary.studentCount)} នាក់</span>
            <span aria-hidden="true">·</span>
            <span>{summary.periodLabel}</span>
            <span aria-hidden="true">·</span>
            <span>{FORMAT_LABELS[outputFormat]}</span>
          </p>
        )}

        {busy && (
          <p className="flex items-center gap-2 text-xs text-text-muted" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            កំពុងបង្កើតឯកសារ...
          </p>
        )}
      </div>
      )}
    </Dialog>
  )
}

/**
 * Where you are in the flow, and what is left of it.
 *
 * Steps that this report does not have are not drawn — a `none`-period document
 * has no period to choose, and a greyed-out "រយៈពេល" would be a question the
 * teacher has to work out is not being asked.
 */
function StepRail({
  period,
  options,
  ready,
}: {
  period: boolean
  options: boolean
  ready: boolean
}) {
  const steps = [
    { n: 1, label: 'ឯកសារ', done: true },
    ...(period ? [{ n: 2, label: 'រយៈពេល', done: true }] : []),
    ...(options ? [{ n: 3, label: 'ជម្រើស', done: true }] : []),
    { n: 4, label: 'ពិនិត្យ', done: ready },
    { n: 5, label: 'ទាញយក', done: false },
  ]

  return (
    <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px]">
      {steps.map((step, index) => (
        <li key={step.n} className="flex items-center gap-1.5">
          {index > 0 && <span aria-hidden="true" className="text-text-muted">›</span>}
          <span
            className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold ${
              step.done ? 'bg-brand text-brand-contrast' : 'bg-paper text-text-muted'
            }`}
            aria-hidden="true"
          >
            {toKhmerNumber(step.n)}
          </span>
          <span className={step.done ? 'font-bold text-text-body' : 'text-text-muted'}>
            {step.label}
          </span>
        </li>
      ))}
    </ol>
  )
}

/** One numbered step of the flow, headed so the rail above has something to
    point at. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-label={title}>
      <h3 className="mb-1.5 flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-text-muted">
        <span aria-hidden="true">{toKhmerNumber(n)}</span>
        {title}
      </h3>
      {children}
    </section>
  )
}

function ChipButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="cursor-pointer rounded-md border border-divider px-2 py-1 text-[11px] font-bold text-text-body transition hover:bg-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
    >
      {children}
    </button>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-bold text-text-heading tabular-nums">{value}</dd>
    </div>
  )
}
