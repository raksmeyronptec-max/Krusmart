'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight, Award, BarChart3, BookOpen, CalendarDays, FileSpreadsheet,
  FileText, Printer, Search, ScrollText, Trophy, X,
} from 'lucide-react'

import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { Badge } from '@/components/ui/feedback/Badge'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { controlClass } from '@/components/ui/forms/fieldStyles'

import {
  REPORT_CATEGORIES, REPORT_DEFINITIONS,
  type ReportCategory, type ReportDefinition,
} from '@/lib/reporting/report-types'
import { activeTemplate, hasTemplate } from '@/lib/reporting/report-template'
import { GenerateReportDialog } from './GenerateReportDialog'

/**
 * The Print Center, as a workspace rather than a wall of links (§3).
 *
 * Two things a bare link list cannot do, and the reason this screen exists:
 *
 *   * it says what each document *is* — the period it covers, the format it
 *     comes out in, and whether it generates from a real template or opens the
 *     screen that has always produced it;
 *   * it carries the class and year, so a teacher picks the report and not the
 *     context, which is the same three questions they answered on every one of
 *     the sixteen screens this indexes.
 *
 * Reports that have not been migrated onto the shared engine are NOT hidden —
 * they link to the page that works today and say so on the card. Hiding them
 * until migration would make the centre less useful than the scattered menu it
 * replaces, which is §27's whole point.
 */

const CATEGORY_ICON: Record<ReportCategory, typeof FileText> = {
  scores: FileSpreadsheet,
  ranking: BarChart3,
  honor: Trophy,
  certificate: Award,
  yearly: CalendarDays,
  tracking: BookOpen,
}

export default function PrintCenterClient({
  classId,
  className,
  academicYear,
}: {
  classId: string | null
  className: string
  academicYear: string
}) {
  const [query, setQuery] = useState('')
  const [generating, setGenerating] = useState<ReportDefinition | null>(null)

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return REPORT_DEFINITIONS
    return REPORT_DEFINITIONS.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.type.includes(q),
    )
  }, [query])

  const engineCount = REPORT_DEFINITIONS.filter((r) => r.engine && hasTemplate(r.type)).length

  const withClass = (href: string) =>
    classId ? `${href}${href.includes('?') ? '&' : '?'}class=${encodeURIComponent(classId)}` : href

  return (
    <PageContainer>
      <PageHeader
        title="មជ្ឈមណ្ឌលបោះពុម្ព"
        description={
          className
            ? `ថ្នាក់ ${className} · ឆ្នាំសិក្សា ${academicYear}`
            : `ឆ្នាំសិក្សា ${academicYear}`
        }
      />

      {/* ------------------------------------------------------------ search */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ស្វែងរករបាយការណ៍..."
            aria-label="ស្វែងរករបាយការណ៍"
            className={controlClass(false, 'pl-9')}
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="សម្អាតការស្វែងរក"
              className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          )}
        </div>

        <p className="text-xs text-text-muted">
          បង្កើតដោយប្រព័ន្ធ {engineCount}/{REPORT_DEFINITIONS.length}
        </p>
      </div>

      {results.length === 0 ? (
        <div className="rounded-xl border border-divider bg-bg-surface">
          <EmptyState
            kind="filtered"
            title="រកមិនឃើញរបាយការណ៍"
            description="សាកល្បងពាក្យផ្សេង ឬសម្អាតការស្វែងរក។"
          />
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {REPORT_CATEGORIES.map((category) => {
            const reports = results.filter((r) => r.category === category.id)
            if (reports.length === 0) return null
            const Icon = CATEGORY_ICON[category.id]

            return (
              <section key={category.id} aria-labelledby={`cat-${category.id}`}>
                <div className="mb-2.5 flex items-baseline gap-2.5">
                  <h2
                    id={`cat-${category.id}`}
                    className="flex items-center gap-2 text-sm font-bold text-text-heading"
                  >
                    <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
                    {category.label}
                  </h2>
                  <p className="truncate text-xs text-text-muted">{category.description}</p>
                </div>

                {/* Desktop grid, mobile stack (§26). */}
                <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                  {reports.map((report) => (
                    <li key={report.type}>
                      <ReportCard
                        report={report}
                        onGenerate={() => setGenerating(report)}
                        legacyHref={report.legacyHref ? withClass(report.legacyHref) : null}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <GenerateReportDialog
        report={generating}
        onClose={() => setGenerating(null)}
        classId={classId}
        className={className}
        academicYear={academicYear}
      />
    </PageContainer>
  )
}

const PERIOD_LABEL: Record<ReportDefinition['period'], string> = {
  month: 'ប្រចាំខែ',
  semester: 'ប្រចាំឆមាស',
  year: 'ប្រចាំឆ្នាំ',
  none: '—',
}

function ReportCard({
  report,
  onGenerate,
  legacyHref,
}: {
  report: ReportDefinition
  onGenerate: () => void
  legacyHref: string | null
}) {
  const template = activeTemplate(report.type)
  const ready = report.engine && template !== undefined

  return (
    <div className="flex h-full flex-col rounded-xl border border-divider bg-bg-surface p-3.5 shadow-sm transition hover:border-brand-400">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-bold text-text-heading">{report.label}</h3>
        {ready ? (
          <Badge variant="success" size="sm">រួចរាល់</Badge>
        ) : (
          <Badge variant="muted" size="sm">ទំព័រដើម</Badge>
        )}
      </div>

      <p className="mb-2.5 flex-1 text-xs text-text-muted">{report.description}</p>

      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" aria-hidden="true" /> {PERIOD_LABEL[report.period]}
        </span>
        <span className="flex items-center gap-1 uppercase">
          <FileText className="h-3 w-3" aria-hidden="true" /> {report.formats.join(' · ')}
        </span>
        {/* §5 provenance, said out loud: a teacher sending paperwork upward
            needs to know whether the layout is authoritative. */}
        {template?.provenance === 'derived' && (
          <span className="flex items-center gap-1 text-warning">
            <ScrollText className="h-3 w-3" aria-hidden="true" /> ទម្រង់ដកស្រង់
          </span>
        )}
      </div>

      {ready ? (
        <button
          type="button"
          onClick={onGenerate}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Printer className="h-4 w-4" aria-hidden="true" /> បង្កើតឯកសារ
        </button>
      ) : legacyHref ? (
        <Link
          href={legacyHref}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          បើកទំព័រ <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <p className="text-[11px] text-text-muted">មិនទាន់មាន</p>
      )}
    </div>
  )
}
