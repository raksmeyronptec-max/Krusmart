'use client'

import { useCallback, useEffect, useState } from 'react'
import { Download, FileCheck2, Loader2, Users } from 'lucide-react'

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
import { generateReport, previewReport } from './actions'

/**
 * The shared generation flow (§14): period → preview → template → generate.
 *
 * One dialog for every report, because the flow is the same for all of them and
 * sixteen bespoke generate screens is the thing this architecture replaces. What
 * differs per report is declared, not coded: `report.period` decides which
 * selector appears, `templatesFor` decides whether a version picker is needed.
 *
 * The preview is not decoration (§15). A teacher printing the wrong month
 * discovers it on paper, after the class has been handed the sheets; "៣២ សិស្ស ·
 * ៣ មុខវិជ្ជា · មធ្យមភាគ ៨.២៤" is the check that catches it beforehand. It runs
 * on open and on every period change, from the same resolver the document is
 * built from — so it cannot describe a document different from the one that
 * generates.
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
  } | null>(null)
  const [loading, setLoading] = useState(false)
  const [busy, setBusy] = useState(false)

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
    setTemplateId(templates[0]?.id ?? '')
  }

  const loadPreview = useCallback(async () => {
    if (!report) return
    setLoading(true)
    try {
      const res = await previewReport({
        reportType: report.type,
        classId: classId ?? undefined,
        academicYear,
        period: periodValue,
      })
      if (res.error) {
        notify.error(res.error)
        setSummary(null)
        return
      }
      setSummary(res.summary ?? null)
    } finally {
      setLoading(false)
    }
  }, [report, classId, academicYear, periodValue])

  useEffect(() => {
    if (!report) return
    // eslint-disable-next-line react-hooks/set-state-in-effect -- async fetch: state is set after await, not synchronously during the effect
    loadPreview()
  }, [report, loadPreview])

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
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = res.fileName
      document.body.appendChild(a)
      a.click()
      a.remove()
      URL.revokeObjectURL(url)

      notify.success(`បានបង្កើត ${res.fileName}`)
      onClose()
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
      footer={
        <>
          <Button variant="secondary" printHidden={false} onClick={onClose}>
            បោះបង់
          </Button>
          <Button printHidden={false} onClick={submit} loading={busy} disabled={loading}>
            <Download className="h-4 w-4" aria-hidden="true" /> បង្កើត និងទាញយក
          </Button>
        </>
      }
    >
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
            </dl>
          ) : (
            <p className="text-xs text-text-muted">មិនអាចពិនិត្យទិន្នន័យបានទេ។</p>
          )}

          {!loading && summary && !hasData && (
            <p className="mt-2 flex items-center gap-1.5 text-[11px] text-warning">
              <Users className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              ថ្នាក់នេះមិនទាន់មានសិស្សទេ — ឯកសារនឹងចេញជាទម្រង់ទទេសម្រាប់បំពេញដោយដៃ។
            </p>
          )}

          {!loading && summary && hasData && summary.subjectCount === 0 && (
            <p className="mt-2 text-[11px] text-warning">
              មិនទាន់មានមុខវិជ្ជាក្នុង Template ទេ — ជួរឈរមុខវិជ្ជានឹងទទេ។
            </p>
          )}
        </div>

        {busy && (
          <p className="flex items-center gap-2 text-xs text-text-muted" role="status">
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            កំពុងបង្កើតឯកសារ...
          </p>
        )}
      </div>
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
