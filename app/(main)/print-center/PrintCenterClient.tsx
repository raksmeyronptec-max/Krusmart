'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight, Award, BookOpen, CalendarDays, ClipboardList,
  FileSpreadsheet, FileText, Printer, ScrollText, Search, Trophy, X,
} from 'lucide-react'

import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { Badge } from '@/components/ui/feedback/Badge'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { controlClass } from '@/components/ui/forms/fieldStyles'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

import {
  REPORT_CATEGORIES, REPORT_DEFINITIONS,
  type ReportCategory, type ReportDefinition,
} from '@/lib/reporting/report-types'
import { reportAvailability } from '@/lib/reporting/report-template'
import { GenerateReportDialog } from './GenerateReportDialog'

/**
 * មជ្ឈមណ្ឌលរបាយការណ៍ និងបោះពុម្ព — the front door to every printable document.
 *
 * THIS IS THE DISCOVERY LAYER, NOT THE ENGINE (§35). It renders report
 * *metadata* and routes the teacher to an action. It fetches no marks, no
 * roster and no scores — a report's data is resolved only after entering its
 * generation flow (§30), which is why this page is fast regardless of how many
 * reports it lists.
 *
 * Two levels, because sixteen reports in six families is too many to scan flat
 * and too few to bury behind navigation:
 *
 *   overview   one card per family, saying what it is for and what it holds
 *   category   the reports in one family, each with its own status and action
 *
 * Search collapses both: typing jumps straight to matching reports across every
 * category, so a teacher who knows the document's name never touches the
 * navigation at all (§19).
 *
 * Every card's claim comes from `reportAvailability` (§11) — the one place that
 * knows whether a report has a resolver, a template, both, or only a legacy
 * screen. Nothing here recomputes "ready", because the moment two surfaces
 * decide that independently they start disagreeing.
 */

const CATEGORY_ICON: Record<ReportCategory, typeof FileText> = {
  scores: FileSpreadsheet,
  ranking: Trophy,
  honor: Award,
  certificate: ScrollText,
  yearly: ClipboardList,
  tracking: BookOpen,
}

const PERIOD_LABEL: Record<ReportDefinition['period'], string> = {
  month: 'ប្រចាំខែ',
  semester: 'ប្រចាំឆមាស',
  year: 'ប្រចាំឆ្នាំ',
  none: '—',
}

export default function PrintCenterClient({
  classId,
  className,
  gradeNumber,
  academicYear,
}: {
  classId: string | null
  className: string
  gradeNumber: number | null
  academicYear: string
}) {
  const [category, setCategory] = useState<ReportCategory | null>(null)
  const [query, setQuery] = useState('')
  const [generating, setGenerating] = useState<ReportDefinition | null>(null)

  const searching = query.trim().length > 0

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return REPORT_DEFINITIONS.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.type.includes(q) ||
        (REPORT_CATEGORIES.find((c) => c.id === r.category)?.label ?? '').toLowerCase().includes(q),
    )
  }, [query])

  const withClass = (href: string) =>
    classId ? `${href}${href.includes('?') ? '&' : '?'}class=${encodeURIComponent(classId)}` : href

  /** The context line: class · grade · year, skipping whatever is unknown (§6). */
  const contextLine = [
    className ? `ថ្នាក់ ${className}` : null,
    gradeNumber ? `ថ្នាក់ទី ${toKhmerNumber(gradeNumber)}` : null,
    `ឆ្នាំសិក្សា ${academicYear}`,
  ].filter(Boolean).join(' · ')

  const active = category ? REPORT_CATEGORIES.find((c) => c.id === category) : null
  const shown = searching
    ? matches
    : category
      ? REPORT_DEFINITIONS.filter((r) => r.category === category)
      : []

  return (
    <PageContainer>
      <PageHeader
        title="មជ្ឈមណ្ឌលរបាយការណ៍ និងបោះពុម្ព"
        description="បង្កើត មើលជាមុន បោះពុម្ព និងទាញយកឯកសារសិក្សា"
      />

      <p className="mb-4 text-sm font-bold text-text-body">{contextLine}</p>

      {/* -------------------------------------------------------- search */}
      <div className="relative mb-4">
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
          className={controlClass(false, 'pl-9 pr-10')}
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

      {/* ------------------------------------------------ category nav (§7) */}
      {/*
        A wrapping row of buttons rather than a scrolling tab strip: six Khmer
        labels do not fit one phone-width line, and a horizontally scrolled tab
        bar hides whichever category happens to be off-screen. Wrapping keeps
        every family reachable without a swipe (§20).
      */}
      {!searching && (
        <nav aria-label="ប្រភេទរបាយការណ៍" className="mb-4 flex flex-wrap gap-1.5">
          <CategoryTab
            label="ទាំងអស់"
            active={category === null}
            onClick={() => setCategory(null)}
            count={REPORT_DEFINITIONS.length}
          />
          {REPORT_CATEGORIES.map((c) => (
            <CategoryTab
              key={c.id}
              label={c.label}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
              count={REPORT_DEFINITIONS.filter((r) => r.category === c.id).length}
            />
          ))}
        </nav>
      )}

      {/* ------------------------------------------------------- content */}
      {searching && matches.length === 0 ? (
        <div className="rounded-xl border border-divider bg-bg-surface">
          <EmptyState
            kind="filtered"
            title="រកមិនឃើញរបាយការណ៍"
            description="សាកល្បងពាក្យផ្សេង ឬសម្អាតការស្វែងរក។"
          />
        </div>
      ) : !searching && category === null ? (
        /* Overview: one card per family (§8). */
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {REPORT_CATEGORIES.map((c) => (
            <li key={c.id}>
              <CategoryCard category={c} onOpen={() => setCategory(c.id)} />
            </li>
          ))}
        </ul>
      ) : (
        <>
          {active && (
            <h2 className="mb-2.5 flex items-center gap-2 text-sm font-bold text-text-heading">
              {(() => {
                const Icon = CATEGORY_ICON[active.id]
                return <Icon className="h-4 w-4 text-brand" aria-hidden="true" />
              })()}
              {active.label}
              <span className="font-normal text-text-muted">· {active.description}</span>
            </h2>
          )}

          <ul className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((report) => (
              <li key={report.type}>
                <ReportCard
                  report={report}
                  onGenerate={() => setGenerating(report)}
                  legacyHref={report.legacyHref ? withClass(report.legacyHref) : null}
                  showCategory={searching}
                />
              </li>
            ))}
          </ul>
        </>
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

function CategoryTab({
  label, active, onClick, count,
}: {
  label: string; active: boolean; onClick: () => void; count: number
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex min-h-11 items-center gap-1.5 rounded-lg border px-3 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        active
          ? 'border-brand bg-brand text-brand-contrast shadow-sm'
          : 'border-divider bg-bg-surface text-text-body hover:border-brand-400 hover:text-brand'
      }`}
    >
      {label}
      <span className={`text-[11px] tabular-nums ${active ? 'opacity-80' : 'text-text-muted'}`}>
        {toKhmerNumber(count)}
      </span>
    </button>
  )
}

/** One report family, with what it holds and a way in (§8). */
function CategoryCard({
  category,
  onOpen,
}: {
  category: (typeof REPORT_CATEGORIES)[number]
  onOpen: () => void
}) {
  const Icon = CATEGORY_ICON[category.id]
  const reports = REPORT_DEFINITIONS.filter((r) => r.category === category.id)
  const ready = reports.filter((r) => reportAvailability(r).status === 'engine_ready').length

  return (
    <div className="flex h-full flex-col rounded-xl border border-divider bg-bg-surface p-4 shadow-sm transition hover:border-brand-400">
      <div className="mb-1.5 flex items-center gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand dark:bg-brand-900/40">
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <h2 className="text-sm font-bold text-text-heading">{category.label}</h2>
      </div>

      <p className="mb-2.5 text-xs text-text-muted">{category.description}</p>

      <ul className="mb-3 flex-1 space-y-1">
        {reports.map((r) => (
          <li key={r.type} className="truncate text-xs text-text-body">
            · {r.label}
          </li>
        ))}
      </ul>

      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] text-text-muted">
          {ready > 0
            ? `បង្កើតដោយប្រព័ន្ធ ${toKhmerNumber(ready)}/${toKhmerNumber(reports.length)}`
            : 'ប្រើទំព័រដើម'}
        </span>
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-divider bg-bg-surface px-3 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          មើលរបាយការណ៍ <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}

/**
 * One report (§9/§24): what it is, what period, what format, whether it can run.
 *
 * The status badge and the button both come from `reportAvailability`, so a
 * card can never offer "បង្កើតរបាយការណ៍" for a report with no template — the
 * dishonesty §10 and §11 are about.
 */
function ReportCard({
  report,
  onGenerate,
  legacyHref,
  showCategory,
}: {
  report: ReportDefinition
  onGenerate: () => void
  legacyHref: string | null
  /** Search results span categories, so each card names its own. */
  showCategory: boolean
}) {
  const availability = reportAvailability(report)
  const categoryLabel = REPORT_CATEGORIES.find((c) => c.id === report.category)?.label

  return (
    <div className="flex h-full flex-col rounded-xl border border-divider bg-bg-surface p-3.5 shadow-sm transition hover:border-brand-400">
      <div className="mb-2 flex items-start justify-between gap-2">
        <h3 className="text-[13px] font-bold text-text-heading">{report.label}</h3>
        <Badge variant={availability.tone === 'success' ? 'success' : availability.tone === 'warning' ? 'warning' : 'muted'} size="sm">
          {availability.label}
        </Badge>
      </div>

      <p className="mb-2.5 flex-1 text-xs text-text-muted">{report.description}</p>

      <div className="mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-text-muted">
        {showCategory && categoryLabel && (
          <span className="rounded bg-paper px-1.5 py-0.5 font-bold">{categoryLabel}</span>
        )}
        <span className="flex items-center gap-1">
          <CalendarDays className="h-3 w-3" aria-hidden="true" /> {PERIOD_LABEL[report.period]}
        </span>
        <span className="flex items-center gap-1 uppercase">
          <FileText className="h-3 w-3" aria-hidden="true" /> {report.formats.join(' · ')}
        </span>
      </div>

      {/* §28: the teacher sees which official layout will be used and its
          version — never a file path, and never the score template. */}
      {availability.template && (
        <p className="mb-2.5 truncate text-[11px] text-text-muted">
          ទម្រង់៖ <span className="font-bold text-text-body">{availability.template.label}</span>
          {availability.template.provenance === 'derived' && (
            <span className="ml-1.5 text-warning">· ដកស្រង់</span>
          )}
        </p>
      )}

      {availability.action === 'generate' ? (
        <button
          type="button"
          onClick={onGenerate}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Printer className="h-4 w-4" aria-hidden="true" /> {availability.actionLabel}
        </button>
      ) : availability.action === 'open' && legacyHref ? (
        <Link
          href={legacyHref}
          className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-[13px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {availability.actionLabel} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      ) : (
        <p className="text-[11px] text-text-muted">មិនទាន់មាន</p>
      )}
    </div>
  )
}
