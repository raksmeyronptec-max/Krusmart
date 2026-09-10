'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, Download, FileCheck2, Loader2, Users } from 'lucide-react'

import { Button } from '@/components/ui/actions/Button'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { notify } from '@/components/ui/feedback/notify'
import { Skeleton } from '@/components/ui/feedback/Skeleton'
import Select from '@/components/ui/forms/Select'
import { fieldLabel } from '@/components/ui/forms/fieldStyles'

import { ACADEMIC_MONTH_OPTIONS_BY_ID } from '@/lib/constants/months'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { templatesFor } from '@/lib/reporting/report-template'
import type { ReportDefinition } from '@/lib/reporting/report-types'
import { generateReport, listCertificateCandidates, previewReport } from './actions'
import { ReportPreviewSheet } from './ReportPreviewSheet'
import type { SheetPreview } from '@/lib/reporting/xlsx-preview'
import type { CertificateCandidate } from '@/lib/reporting/report-data'

/**
 * The shared generation flow (§14): period → preview → template → generate.
 *
 * One dialog for every report, because the flow is the same for all of them and
 * sixteen bespoke generate screens is the thing this architecture replaces. What
 * differs per report is declared, not coded: `report.period` decides which
 * selector appears, `templatesFor` decides whether a version picker is needed.
 *
 * The preview is not decoration (§15/§23). A teacher printing the wrong month
 * discovers it on paper, after the class has been handed the sheets; "៣២ សិស្ស ·
 * ៣ មុខវិជ្ជា · មធ្យមភាគ ៨.២៤" is the check that catches it beforehand. It runs
 * on open and on every period change, from the same resolver the document is
 * built from — so it cannot describe a document different from the one that
 * generates.
 *
 * It draws the SHEET too, not only the counts. The counts answer "is this the
 * right class and month?"; they cannot answer "is this the right document?" —
 * which is exactly what the ទម្រង់ឯកសារ selector beside them asks, and whose
 * whole consequence is visual. So the panel fills the chosen template through
 * the same writer the download uses and renders the result. Spreadsheet reports
 * only: a Word document has no sheet to draw, and it says so rather than
 * showing an approximation of one.
 *
 * Generating does not close the dialog (§24). The file downloads once — a
 * browser that saves silently to a Downloads folder gives no evidence anything
 * happened — and the dialog then states what was produced, with the download
 * available again.
 */
export function GenerateReportDialog({
  report,
  onClose,
  classId,
  className,
  academicYear,
}: {
  /** `null` closes the dialog. */
  report: ReportDefinition | null
  onClose: () => void
  classId: string | null
  className: string
  academicYear: string
}) {
  const [period, setPeriod] = useState('nov')
  const [semester, setSemester] = useState('sem1')
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

  /**
   * The finished document, held in memory until the dialog closes (§24).
   *
   * Kept as a Blob rather than an object URL so nothing leaks when the teacher
   * downloads twice: each save mints a URL and revokes it immediately.
   */
  const [generated, setGenerated] = useState<{
    blob: Blob; fileName: string
    rowCount: number; subjectCount: number; templateLabel: string
  } | null>(null)

  /**
   * The certificate's pupil selection (§10) — the one report whose flow asks
   * *who* as well as *when*. `null` means "not loaded yet"; an empty array is a
   * real, deliberate choice of nobody.
   */
  const [candidates, setCandidates] = useState<CertificateCandidate[] | null>(null)
  const [chosen, setChosen] = useState<Set<string>>(new Set())
  const needsStudents = report?.type === 'certificate'

  const templates = report ? templatesFor(report.type) : []

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
    setSummary(null)
    setSheet(null)
    setSheetMissing(null)
    setTemplateId(templates[0]?.id ?? '')
    setCandidates(null)
    setChosen(new Set())
    setGenerated(null)
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

  const hasData = (summary?.studentCount ?? 0) > 0

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
              <Download className="h-4 w-4" aria-hidden="true" /> បង្កើត និងទាញយក
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
        {/* ------------------------------------------------------- context */}
        <div className="rounded-lg border border-divider bg-paper p-3 text-xs">
          <p className="font-bold text-text-heading">
            ថ្នាក់ {className || '—'} · ឆ្នាំសិក្សា {academicYear}
          </p>
          <p className="mt-0.5 text-text-muted">
            ថ្នាក់ត្រូវបានកំណត់ដោយប្រព័ន្ធតាមការចាត់តាំងរបស់អ្នក។
          </p>
        </div>

        {/* --------------------------------------------- pupil selection */}
        {needsStudents && (
          <div className="rounded-lg border border-divider">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-divider px-3 py-2">
              <p className="text-xs font-bold text-text-heading">
                សិស្សទទួលបណ្ណសរសើរ ({toKhmerNumber(chosen.size)} នាក់)
              </p>
              {candidates && candidates.length > 0 && (
                <div className="flex gap-1.5">
                  <button
                    type="button"
                    className="rounded-md border border-divider px-2 py-1 text-[11px] font-bold text-text-body transition hover:bg-paper"
                    onClick={() => setChosen(new Set(candidates.filter((c) => c.eligible).map((c) => c.id)))}
                  >
                    សិស្សឡើងថ្នាក់
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-divider px-2 py-1 text-[11px] font-bold text-text-body transition hover:bg-paper"
                    onClick={() => setChosen(new Set(candidates.map((c) => c.id)))}
                  >
                    ទាំងអស់
                  </button>
                  <button
                    type="button"
                    className="rounded-md border border-divider px-2 py-1 text-[11px] font-bold text-text-body transition hover:bg-paper"
                    onClick={() => setChosen(new Set())}
                  >
                    សម្អាត
                  </button>
                </div>
              )}
            </div>

            {candidates === null ? (
              <div className="p-3"><Skeleton className="h-16 w-full" /></div>
            ) : candidates.length === 0 ? (
              /* Not an error: a class nobody has been assessed in has nobody to
                 certify, and saying so beats an empty box (§35). */
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

        {/* -------------------------------------------------------- period */}
        {report.period === 'month' && (
          <div>
            <label className={fieldLabel} htmlFor="report-month">ខែ</label>
            <Select
              id="report-month"
              ariaLabel="ខែ"
              value={period}
              onChange={setPeriod}
              options={ACADEMIC_MONTH_OPTIONS_BY_ID}
            />
          </div>
        )}

        {report.period === 'semester' && (
          <div>
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
          </div>
        )}

        {/* Only when there is a choice to make — a single version is not a
            decision worth a control (§25). */}
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

        {/* ------------------------------------------------------- preview */}
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
              {/* §14: an honour report's headline figure is how many qualified,
                  which is not derivable from the other three. */}
              {summary.honorCount !== undefined && (
                <Stat label="ទទួលកិត្តិយស" value={`${toKhmerNumber(summary.honorCount)} នាក់`} />
              )}
            </dl>
          ) : (
            <p className="text-xs text-text-muted">មិនអាចពិនិត្យទិន្នន័យបានទេ។</p>
          )}

          {/* The rule, and whether it is official — stated before the teacher
              generates, not discovered on the printed sheet (§14/§25). */}
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

          {!loading && summary && !hasData && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warning-text">
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ថ្នាក់នេះមិនទាន់មានសិស្សទេ — ឯកសារនឹងចេញជាទម្រង់ទទេសម្រាប់បំពេញដោយដៃ។
            </p>
          )}

          {/* §21: an empty subject list is not a dead end — the screen that
              fixes it is one link away, and it is the score template that needs
              configuring, never the document template. */}
          {!loading && summary && hasData && summary.subjectCount === 0 && (
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
        </div>

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
            templateLabel={templates.find((t) => t.id === templateId)?.label}
          />
        ) : sheetMissing === 'docx' ? (
          /* A Word document is a page per pupil, not a sheet — say that rather
             than draw an approximation of a layout nobody will receive (§46). */
          <p className="rounded-lg border border-divider p-3 text-[11px] text-text-muted">
            ការមើលឯកសារជាមុនមានសម្រាប់ឯកសារ Excel។ ឯកសារ Word នេះនឹងបង្កើត ១ ទំព័រក្នុងមួយសិស្ស។
          </p>
        ) : sheetMissing === 'failed' ? (
          <p className="rounded-lg border border-warning/40 bg-warning/5 p-3 text-[11px] text-text-body">
            មិនអាចបង្ហាញឯកសារជាមុនបានទេ — ប៉ុន្តែការបង្កើតឯកសារនៅដំណើរការធម្មតា។
          </p>
        ) : null}

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-text-muted">{label}</dt>
      <dd className="font-bold text-text-heading tabular-nums">{value}</dd>
    </div>
  )
}
