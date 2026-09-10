'use client'

import { useId, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  ArrowUpRight,
  Award,
  BookOpen,
  CalendarCheck,
  ClipboardList,
  FileSpreadsheet,
  FileText,
  GraduationCap,
  Printer,
  ScrollText,
  Search,
  Trophy,
  Users,
  X,
} from 'lucide-react'

import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { Badge } from '@/components/ui/feedback/Badge'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { controlClass } from '@/components/ui/forms/fieldStyles'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

import {
  REPORT_CATEGORIES, REPORT_DEFINITIONS,
  type ReportCategory, type ReportDefinition, type ReportFormat,
} from '@/lib/reporting/report-types'
import { withClassParam } from '@/lib/utils/classHref'
import { reportAvailability, type ReportAvailability } from '@/lib/reporting/report-template'
import { GenerateReportDialog } from './GenerateReportDialog'

/**
 * មជ្ឈមណ្ឌលរបាយការណ៍ និងបោះពុម្ព — the front door to every printable document.
 *
 * THIS IS THE DISCOVERY LAYER, NOT THE ENGINE (§35/§36). It renders report
 * *metadata* and routes the teacher to an action. It fetches no marks, no
 * roster and no scores — a report's data is resolved only after entering the
 * generation flow (§33), which is why the page stays fast however many reports
 * the catalogue grows to.
 *
 * WHY THE LAYOUT IS FAMILY PANELS OF COMPACT ROWS (§40/§41)
 * The centre indexes sixteen documents in six families. An earlier pass gave
 * each report a full card in a three-column grid, which reads well for four
 * items and turns into a wall at sixteen: every report shouted at the same
 * volume, and the family a document belonged to — the thing a teacher actually
 * navigates by — was the quietest signal on the page. So the family is now the
 * unit of layout and the report is a row inside it: one scan down a panel
 * answers "what can I print about ពិន្ទុ", and each row carries only what §10
 * asks for — title, purpose, period, format, availability, one action.
 *
 * A family holding exactly ONE report renders as a feature panel instead of a
 * header above a single row. That is not a special case for កិត្តិយស and
 * វិញ្ញាបនបត្រ (§44/§45) so much as the rule those two happen to satisfy: a
 * one-row list is a card wearing a list's clothes, and the certificate — a
 * per-pupil Word document, not a class table — deserves not to look like one
 * more line item.
 *
 * Search collapses the navigation: typing jumps straight to matching reports
 * across every family, so a teacher who knows the document's name never touches
 * the category row at all (§15).
 *
 * Every claim a row makes comes from `reportAvailability` (§12) — the one place
 * that knows whether a report has a resolver, a template, both, or only a
 * legacy screen. Nothing here recomputes "ready", because the moment two
 * surfaces decide that independently they start disagreeing.
 */

const CATEGORY_ICON: Record<ReportCategory, typeof FileText> = {
  scores: FileSpreadsheet,
  attendance: CalendarCheck,
  ranking: Trophy,
  honor: Award,
  certificate: ScrollText,
  yearly: ClipboardList,
  tracking: BookOpen,
  student: Users,
}

/**
 * Families whose subject is a pupil's achievement rather than a class table.
 *
 * `gold` is the design system's own achievement token — `Button`'s variant
 * documentation reserves it for rankings, honour roll and certificates — so
 * this is the palette being read, not a colour being invented (§39).
 */
const ACHIEVEMENT: ReportCategory[] = ['honor', 'certificate']

const PERIOD_LABEL: Record<ReportDefinition['period'], string> = {
  month: 'ប្រចាំខែ',
  semester: 'ប្រចាំឆមាស',
  year: 'ប្រចាំឆ្នាំ',
  none: 'គ្រប់ពេល',
}

/**
 * What the teacher gets, in words they recognise (§25).
 *
 * `html` is not a file — it is the legacy screen's browser print — so it is
 * named as the action it is rather than as a download format that does not
 * exist.
 */
const FORMAT_LABEL: Record<ReportFormat, string> = {
  xlsx: 'Excel',
  docx: 'Word',
  html: 'បោះពុម្ពពីអេក្រង់',
}

/**
 * The formats a row may honestly advertise (§25/§46).
 *
 * When the row generates, exactly one file comes out — the active template's —
 * so that is what is shown, never the definition's whole `formats` list. A
 * certificate card promising "Word · បោះពុម្ពពីអេក្រង់" would be describing two
 * different routes as though the button did both.
 */
function formatsShown(report: ReportDefinition, availability: ReportAvailability): ReportFormat[] {
  return availability.action === 'generate' && availability.template
    ? [availability.template.format]
    : report.formats
}

export default function PrintCenterClient({
  classId,
  className,
  gradeNumber,
  academicYear,
  initialCategory = null,
}: {
  classId: string | null
  className: string
  gradeNumber: number | null
  academicYear: string
  /**
   * The family to open on, from `?category=` — already validated by the page.
   *
   * It is the *initial* value, not a controlled one: once here, the category
   * row is the teacher's to change, and a URL that kept snapping the filter
   * back would make those buttons look broken.
   */
  initialCategory?: ReportCategory | null
}) {
  const [category, setCategory] = useState<ReportCategory | null>(initialCategory)
  const [query, setQuery] = useState('')
  const [generating, setGenerating] = useState<ReportDefinition | null>(null)
  const searchId = useId()

  const searching = query.trim().length > 0

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return REPORT_DEFINITIONS.filter(
      (r) =>
        r.label.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.type.includes(q) ||
        (r.group ?? '').toLowerCase().includes(q) ||
        (REPORT_CATEGORIES.find((c) => c.id === r.category)?.label ?? '').toLowerCase().includes(q),
    )
  }, [query])

  /*
   * Every link out of this screen carries the class it was built for.
   *
   * Through the shared `withClassParam`, not a local append: that helper
   * consults `CLASS_SCOPED_ROUTES`, so a report whose screen does not read a
   * class does not get `?class=` bolted into a URL a teacher may share. The
   * hand-rolled version here appended it to everything.
   *
   * The pure function rather than `useClassHref`, for the same reason the
   * dashboard uses it: this screen already knows which class its cards describe
   * — it was handed the id the server resolved — so it scopes to that one
   * rather than re-reading the address bar.
   */
  const withClass = (href: string) => withClassParam(href, classId)

  const families = category
    ? REPORT_CATEGORIES.filter((c) => c.id === category)
    : REPORT_CATEGORIES

  const openGenerate = (report: ReportDefinition) => setGenerating(report)

  return (
    <PageContainer>
      <PageHeader
        title="មជ្ឈមណ្ឌលរបាយការណ៍ និងបោះពុម្ព"
        description="បង្កើត ពិនិត្យ បោះពុម្ព និងទាញយកឯកសារសិក្សា"
      />

      <ContextBar
        className={className}
        gradeNumber={gradeNumber}
        academicYear={academicYear}
        scoped={classId !== null}
      />

      {/* ---------------------------------------------------------- search */}
      <div className="relative mb-3">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted"
          aria-hidden="true"
        />
        <input
          id={searchId}
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="ស្វែងរករបាយការណ៍..."
          aria-label="ស្វែងរករបាយការណ៍"
          className={controlClass(false, 'pl-9 pr-12')}
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery('')}
            aria-label="សម្អាតការស្វែងរក"
            className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-md text-text-muted transition hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        )}
      </div>

      {/* -------------------------------------------------- category nav (§8) */}
      {/*
        A wrapping row of buttons rather than a scrolling tab strip: six Khmer
        labels do not fit one phone-width line, and a horizontally scrolled tab
        bar hides whichever family happens to be off-screen. Wrapping keeps
        every category reachable and discoverable without a swipe.
      */}
      {!searching && (
        <nav aria-label="ប្រភេទរបាយការណ៍" className="mb-5 flex flex-wrap gap-1.5">
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
              icon={CATEGORY_ICON[c.id]}
              active={category === c.id}
              onClick={() => setCategory(c.id)}
              count={REPORT_DEFINITIONS.filter((r) => r.category === c.id).length}
            />
          ))}
        </nav>
      )}

      {/* --------------------------------------------------------- content */}
      <p aria-live="polite" className="sr-only">
        {searching
          ? `រកឃើញរបាយការណ៍ ${toKhmerNumber(matches.length)}`
          : `បង្ហាញរបាយការណ៍ ${toKhmerNumber(
              REPORT_DEFINITIONS.filter((r) => !category || r.category === category).length,
            )}`}
      </p>

      {searching ? (
        matches.length === 0 ? (
          <div className="rounded-xl border border-divider bg-bg-surface">
            <EmptyState
              kind="filtered"
              title="រកមិនឃើញរបាយការណ៍"
              description="សាកល្បងពាក្យផ្សេង ឬសម្អាតការស្វែងរក។"
            />
          </div>
        ) : (
          <section
            aria-label="លទ្ធផលស្វែងរក"
            className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm"
          >
            <h2 className="border-b border-divider bg-paper px-4 py-2.5 text-[13px] font-bold text-text-heading">
              លទ្ធផលស្វែងរក
              <span className="ml-1.5 font-normal text-text-muted">
                {toKhmerNumber(matches.length)} របាយការណ៍
              </span>
            </h2>
            <ul className="divide-y divide-divider">
              {matches.map((report) => (
                <ReportRow
                  key={report.type}
                  report={report}
                  onGenerate={() => openGenerate(report)}
                  legacyHref={report.legacyHref ? withClass(report.legacyHref) : null}
                  showCategory
                />
              ))}
            </ul>
          </section>
        )
      ) : (
        /*
          One column on phones, two on a wide screen (§16/§34). CSS columns
          rather than a grid because the families are genuinely different
          heights — ranking holds three reports, the yearly family seven — and a
          grid row stretched to its tallest member leaves a hole beside every
          short panel. `break-inside-avoid` keeps a family whole; the browser
          balances the two columns itself.
        */
        <div className={category ? '' : 'lg:columns-2 lg:gap-4'}>
          {families.map((family) => {
            const reports = REPORT_DEFINITIONS.filter((r) => r.category === family.id)
            return (
              <div key={family.id} className="mb-4 break-inside-avoid last:mb-0">
                {reports.length === 1 ? (
                  <FeaturePanel
                    family={family}
                    report={reports[0]}
                    onGenerate={() => openGenerate(reports[0])}
                    legacyHref={reports[0].legacyHref ? withClass(reports[0].legacyHref) : null}
                  />
                ) : (
                  <FamilyPanel
                    family={family}
                    reports={reports}
                    onGenerate={openGenerate}
                    withClass={withClass}
                  />
                )}
              </div>
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

/* ------------------------------------------------------------------ context */

/**
 * Which class, grade and year every document on this page will be about (§7).
 *
 * Read-only on purpose. The app shell already carries a class switcher in the
 * top bar on every breakpoint, and a second selector here would be two controls
 * for one piece of state — the drift §7 warns about. This states the answer and
 * says where to change it.
 */
function ContextBar({
  className,
  gradeNumber,
  academicYear,
  scoped,
}: {
  className: string
  gradeNumber: number | null
  academicYear: string
  /** True when a class is resolved; false for a pre-V2, roster-scoped account. */
  scoped: boolean
}) {
  return (
    <section
      aria-label="បរិបទរបាយការណ៍"
      className="mb-4 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-divider bg-bg-surface px-4 py-3 shadow-sm"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand dark:bg-brand-900/40">
        <GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>

      <dl className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-3">
        <ContextField
          label="ថ្នាក់"
          value={className || (scoped ? '—' : 'សិស្សរបស់អ្នក')}
        />
        <ContextField
          label="ថ្នាក់ទី"
          value={gradeNumber ? toKhmerNumber(gradeNumber) : '—'}
        />
        <ContextField label="ឆ្នាំសិក្សា" value={academicYear} />
      </dl>

      <p className="ml-auto max-w-full text-[11px] text-text-muted">
        {scoped
          ? 'ប្ដូរថ្នាក់នៅរបារខាងលើ។'
          : 'របាយការណ៍ប្រើបញ្ជីសិស្សរបស់អ្នកទាំងអស់។'}
      </p>
    </section>
  )
}

function ContextField({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11px] text-text-muted">{label}</dt>
      <dd className="truncate text-sm font-bold text-text-heading">{value}</dd>
    </div>
  )
}

/* --------------------------------------------------------------- navigation */

function CategoryTab({
  label, active, onClick, count, icon: Icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  count: number
  icon?: typeof FileText
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
      {Icon && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      {label}
      <span className={`text-[11px] tabular-nums ${active ? 'opacity-80' : 'text-text-muted'}`}>
        {toKhmerNumber(count)}
      </span>
    </button>
  )
}

/* ------------------------------------------------------------------ panels */

type Family = (typeof REPORT_CATEGORIES)[number]

/** The heading strip both panel shapes share, so they cannot drift apart. */
function PanelHeader({
  family,
  trailing,
  achievement,
}: {
  family: Family
  trailing?: React.ReactNode
  achievement: boolean
}) {
  const Icon = CATEGORY_ICON[family.id]
  return (
    <div className="flex items-start gap-3 border-b border-divider bg-paper px-4 py-3">
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
          achievement
            ? 'bg-gold/15 text-gold'
            : 'bg-brand-100 text-brand dark:bg-brand-900/40'
        }`}
      >
        <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <h2 className="text-sm font-bold text-text-heading">{family.label}</h2>
        <p className="mt-0.5 text-xs text-text-muted">{family.description}</p>
      </div>
      {trailing}
    </div>
  )
}

/**
 * A family of reports: one heading, then a compact row per document (§41).
 *
 * `group` splits a long family into labelled runs (§42) — the yearly family's
 * seven reports are three separate errands, and a flat list of seven makes the
 * teacher read all of them to find which. Families without groups list flat;
 * nothing here decides what the groups are, the catalogue does.
 */
function FamilyPanel({
  family,
  reports,
  onGenerate,
  withClass,
}: {
  family: Family
  reports: ReportDefinition[]
  onGenerate: (report: ReportDefinition) => void
  withClass: (href: string) => string
}) {
  // Preserves catalogue order; a group's position is its first member's.
  const groups: { label: string | null; reports: ReportDefinition[] }[] = []
  for (const report of reports) {
    const label = report.group ?? null
    const last = groups[groups.length - 1]
    if (last && last.label === label) last.reports.push(report)
    else groups.push({ label, reports: [report] })
  }

  return (
    <section
      aria-label={family.label}
      className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm"
    >
      <PanelHeader
        family={family}
        achievement={ACHIEVEMENT.includes(family.id)}
        trailing={
          <span className="shrink-0 text-[11px] text-text-muted">
            {toKhmerNumber(reports.length)} របាយការណ៍
          </span>
        }
      />

      {groups.map((group) => (
        <div key={group.label ?? '—'}>
          {group.label && (
            <h3 className="border-b border-divider bg-bg-surface px-4 pb-1.5 pt-3 text-[11px] font-bold tracking-wide text-text-muted">
              {group.label}
            </h3>
          )}
          <ul className="divide-y divide-divider">
            {group.reports.map((report) => (
              <ReportRow
                key={report.type}
                report={report}
                onGenerate={() => onGenerate(report)}
                legacyHref={report.legacyHref ? withClass(report.legacyHref) : null}
                headingLevel={group.label ? 'h4' : 'h3'}
              />
            ))}
          </ul>
        </div>
      ))}
    </section>
  )
}

/**
 * A family holding a single report (§44/§45).
 *
 * Rendered as the document itself rather than a heading above one row: the
 * family name and the report name are the same errand, and repeating it twice
 * to keep the list shape uniform would be structure for its own sake. The
 * achievement families get the `gold` accent the design system already reserves
 * for them, which is what stops វិញ្ញាបនបត្រ reading as one more score table.
 */
function FeaturePanel({
  family,
  report,
  onGenerate,
  legacyHref,
}: {
  family: Family
  report: ReportDefinition
  onGenerate: () => void
  legacyHref: string | null
}) {
  const availability = reportAvailability(report)
  const Icon = CATEGORY_ICON[family.id]
  const achievement = ACHIEVEMENT.includes(family.id)

  return (
    <section
      aria-label={family.label}
      className={`rounded-xl border bg-bg-surface p-4 shadow-sm ${
        achievement ? 'border-gold/40' : 'border-divider'
      }`}
    >
      <div className="flex items-start gap-3">
        <span
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
            achievement ? 'bg-gold/15 text-gold' : 'bg-brand-100 text-brand dark:bg-brand-900/40'
          }`}
        >
          <Icon className="h-5 w-5" aria-hidden="true" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-bold text-text-heading">{family.label}</h2>
            <StatusBadge availability={availability} />
          </div>
          <p className="mt-1 text-xs text-text-muted">{report.description}</p>
          <MetaLine report={report} availability={availability} />

          {/* Aligned under the text rather than spanning the card. A full-width
              gold bar on two adjacent panels reads as an advertisement; the
              accent belongs on the icon and the button, not on a stripe. */}
          <div className="mt-3">
            <ReportAction
              availability={availability}
              onGenerate={onGenerate}
              legacyHref={legacyHref}
              reportLabel={report.label}
              tone={achievement ? 'gold' : 'brand'}
            />
          </div>
        </div>
      </div>
    </section>
  )
}

/* -------------------------------------------------------------------- rows */

/**
 * One report (§10): what it is, what it is for, when it covers, what comes out,
 * whether it can run, and exactly one thing to do about it.
 *
 * The badge and the button both come from `reportAvailability`, so a row can
 * never offer "បង្កើតរបាយការណ៍" for a report with no template — the dishonesty
 * §11 and §12 exist to prevent.
 */
function ReportRow({
  report,
  onGenerate,
  legacyHref,
  showCategory = false,
  headingLevel = 'h3',
}: {
  report: ReportDefinition
  onGenerate: () => void
  legacyHref: string | null
  /** Search results span families, so each row names its own. */
  showCategory?: boolean
  headingLevel?: 'h3' | 'h4'
}) {
  const availability = reportAvailability(report)
  const Heading = headingLevel
  const categoryLabel = REPORT_CATEGORIES.find((c) => c.id === report.category)?.label

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3 transition hover:bg-paper sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Heading className="text-[13px] font-bold text-text-heading">{report.label}</Heading>
          <StatusBadge availability={availability} />
          {showCategory && categoryLabel && (
            <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-bold text-text-muted">
              {categoryLabel}
            </span>
          )}
        </div>
        <p className="mt-0.5 text-xs text-text-muted">{report.description}</p>
        <MetaLine report={report} availability={availability} />
      </div>

      <div className="shrink-0 sm:w-44">
        <ReportAction
          availability={availability}
          onGenerate={onGenerate}
          legacyHref={legacyHref}
          reportLabel={report.label}
          tone="brand"
          block
        />
      </div>
    </li>
  )
}

/**
 * Format · period · document template (§10/§13).
 *
 * The template line is deliberately the quietest thing in the row: a teacher
 * needs to know which official layout will be used and whether it is
 * authoritative, but the provenance of a layout is never the reason they came
 * to this page.
 */
function MetaLine({
  report,
  availability,
}: {
  report: ReportDefinition
  availability: ReportAvailability
}) {
  return (
    /*
      The separator is a `::before` on each following item rather than an
      element of its own: a standalone "·" that lands at a line break leaves the
      previous line ending in a dangling dot, which on a phone is every second
      row.
    */
    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted [&>span+span]:before:mr-2 [&>span+span]:before:content-['·']">
      <span className="inline-flex items-center gap-1">
        <FileText className="h-3 w-3" aria-hidden="true" />
        {formatsShown(report, availability).map((f) => FORMAT_LABEL[f]).join(' · ')}
      </span>
      <span>{PERIOD_LABEL[report.period]}</span>

      {availability.template && (
        <span className="min-w-0">
          ទម្រង់ {availability.template.label}
          {availability.template.provenance === 'derived' && (
            <span className="ml-1 text-warning-text">· ដកស្រង់</span>
          )}
        </span>
      )}
    </p>
  )
}

/** Restrained, never colour-only: the badge always carries its Khmer word (§20/§32). */
function StatusBadge({ availability }: { availability: ReportAvailability }) {
  return (
    <Badge
      size="sm"
      variant={
        availability.tone === 'success' ? 'success'
        : availability.tone === 'warning' ? 'warning'
        : 'muted'
      }
    >
      {availability.label}
    </Badge>
  )
}

/**
 * The single primary control a report gets (§11).
 *
 * One action, chosen by the availability model — never Print beside Export
 * beside Download beside View. What the button says and whether it exists at
 * all is `reportAvailability`'s answer, rendered.
 */
function ReportAction({
  availability,
  onGenerate,
  legacyHref,
  reportLabel,
  tone,
  block,
}: {
  availability: ReportAvailability
  onGenerate: () => void
  legacyHref: string | null
  /** Named in the accessible label, since several rows share a visible one. */
  reportLabel: string
  tone: 'brand' | 'gold'
  block?: boolean
}) {
  const base = `inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
    block ? 'w-full' : ''
  }`

  if (availability.action === 'generate') {
    return (
      <button
        type="button"
        onClick={onGenerate}
        aria-label={`${availability.actionLabel} — ${reportLabel}`}
        className={`${base} ${
          tone === 'gold'
            ? 'bg-gold text-brand-950 hover:opacity-90'
            : 'bg-brand text-brand-contrast hover:bg-brand-hover'
        }`}
      >
        <Printer className="h-4 w-4" aria-hidden="true" /> {availability.actionLabel}
      </button>
    )
  }

  if (availability.action === 'open' && legacyHref) {
    return (
      <Link
        href={legacyHref}
        aria-label={`${availability.actionLabel} — ${reportLabel}`}
        className={`${base} border border-divider bg-bg-surface text-text-body hover:border-brand-400 hover:text-brand`}
      >
        {availability.actionLabel} <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
      </Link>
    )
  }

  // Nothing to offer yet. Stated, not disguised as a disabled button that looks
  // like it might work on a second click (§46).
  return (
    <p className={`text-[11px] text-text-muted ${block ? 'text-center sm:text-left' : ''}`}>
      មិនទាន់មាន
    </p>
  )
}
