'use client'

import { useId, useMemo, useState } from 'react'
import Link from 'next/link'
import {
  Award,
  BookOpen,
  CalendarCheck,
  CalendarRange,
  ChevronDown,
  ClipboardList,
  Clock3,
  FileSpreadsheet,
  FileText,
  ScrollText,
  Search,
  Trophy,
  Users,
  X,
} from 'lucide-react'

import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { ClassContextBar } from '@/components/shell/ClassContextBar'
import { Badge } from '@/components/ui/feedback/Badge'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import Select from '@/components/ui/forms/Select'
import { controlClass } from '@/components/ui/forms/fieldStyles'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

import {
  PLANNED_DOCUMENT_GROUPS,
  FORMAT_LABELS,
  QUICK_ACTION_REPORTS,
  REPORT_CATEGORIES,
  REPORT_DEFINITIONS,
  REPORT_SECTIONS,
  reportDefinition,
  reportPriority,
  sectionForCategory,
  type ReportCategory,
  type ReportDefinition,
  type ReportFormat,
  type ReportSection,
  type ReportSectionId,
  type ReportType,
} from '@/lib/reporting/report-types'
import {
  resolvePeriod,
  scopeForPeriodKind,
  type PeriodSelection,
  type ResolvedPeriod,
} from '@/lib/reporting/print-period'
import { ACADEMIC_MONTH_OPTIONS_BY_ID, type MonthId } from '@/lib/constants/months'
import { SCORE_SCOPES, type ScoreScope } from '@/lib/scores/workspace'
import type { SemesterId } from '@/lib/scores/semester'
import { withClassParam } from '@/lib/utils/classHref'
import { reportAvailability, type ReportAvailability } from '@/lib/reporting/report-template'
import { GenerateReportDialog } from './GenerateReportDialog'

/**
 * មជ្ឈមណ្ឌលឯកសារ និងបោះពុម្ព — the teacher's document workspace.
 *
 * THIS IS THE DISCOVERY LAYER, NOT THE ENGINE. It renders report *metadata* and
 * routes the teacher to an action. It fetches no marks, no roster and no
 * scores — a report's data is resolved only after entering the generation flow,
 * which is why the page stays fast however many documents the catalogue grows
 * to. Every claim a row makes comes from `reportAvailability`; nothing here
 * recomputes "ready", because the moment two surfaces decide that independently
 * they start disagreeing.
 *
 * ── The question the page answers ─────────────────────────────────────────
 *
 * It used to be "which report CATEGORY are you looking for?" — nine families,
 * each an equal panel, each waiting to be read. That is a catalogue, and a
 * teacher does not arrive with a category in mind. They arrive with an errand,
 * almost always this month's, and the old page made them reconstruct it: scan
 * nine headings, find the row, open it, and only then discover which month the
 * dialog had defaulted to (វិច្ឆិកា — the first month of the academic year, and
 * the wrong answer for eleven months of twelve).
 *
 * Three changes turn it into a workspace, and each removes one of those steps:
 *
 *   THE ERRAND IS THE TOP LEVEL.  `REPORT_SECTIONS` groups the nine categories
 *     into five shelves by what a teacher is doing — filing official paperwork,
 *     the register, the year's results, running the room, pupil paperwork.
 *     Declared in the catalogue, never here.
 *
 *   THE PERIOD IS PAGE CONTEXT.   One control above the list says which month
 *     or semester everything is about, so a row can state its period before it
 *     is opened and the dialog opens on what the page was already showing.
 *
 *   THE COMMON FOUR ARE ONE TAP.  `បោះពុម្ពឆាប់ៗ` puts this month's score
 *     sheet, register, ranking and the year's totals above everything else,
 *     because those four are most of what most teachers print.
 *
 * ── Progressive disclosure, and where it stops ────────────────────────────
 *
 * Shelves holding an everyday document open on arrival; the rest are one tap
 * away and say what they hold while closed. Nothing is hidden behind a search
 * that must be guessed at: a closed shelf names its groups and counts its
 * documents, and any filter, search or deep link opens what it matches.
 */

const CATEGORY_ICON: Record<ReportCategory, typeof FileText> = {
  scores: FileSpreadsheet,
  attendance: CalendarCheck,
  ranking: Trophy,
  honor: Award,
  certificate: ScrollText,
  yearly: CalendarRange,
  tracking: BookOpen,
  classroom: ClipboardList,
  student: Users,
}

const SECTION_ICON: Record<ReportSectionId, typeof FileText> = {
  official: FileSpreadsheet,
  attendance: CalendarCheck,
  annual: CalendarRange,
  classAdmin: ClipboardList,
  student: Users,
}

/**
 * Shelves whose subject is a pupil's achievement rather than a class table.
 *
 * `gold` is the design system's own achievement token — `Button`'s variant
 * documentation reserves it for rankings, honour roll and certificates — so
 * this is the palette being read, not a colour being invented. It is applied to
 * the RUN, not the shelf: កិត្តិយស និងវិញ្ញាបនបត្រ shares a section with the
 * score tables, and gilding the whole section would say the monthly mark sheet
 * is an award.
 */
const ACHIEVEMENT_CATEGORIES: ReportCategory[] = ['honor', 'certificate']

/**
 * The formats a row may honestly advertise.
 *
 * Two rules, and both exist to stop a row describing two routes as though one
 * button did both:
 *
 *   IT GENERATES  exactly one file comes out — the active template's — so that
 *                 is what is shown, never the definition's whole `formats`
 *                 list. A certificate row promising "Word · បោះពុម្ពពីអេក្រង់"
 *                 offers a download and a screen from a single control.
 *   IT OPENS      `html` is dropped, because the row's badge already says
 *                 បោះពុម្ពពីអេក្រង់ and printing the same phrase twice on one
 *                 line reads as two facts. What survives is what the screen
 *                 additionally hands over — the roster's Excel export — and for
 *                 a screen that only prints, nothing does, so the meta line
 *                 carries the period alone.
 */
function formatsShown(report: ReportDefinition, availability: ReportAvailability): ReportFormat[] {
  if (availability.action === 'generate' && availability.template) {
    return [availability.template.format]
  }
  if (availability.action === 'open') return report.formats.filter((f) => f !== 'html')
  return report.formats
}

/** The documents on a shelf, filtered to one category when the URL named one. */
function reportsOnShelf(section: ReportSection, only: ReportCategory | null): ReportDefinition[] {
  const categories = new Set(
    section.groups.flatMap((g) => g.categories).filter((c) => !only || c === only),
  )
  return REPORT_DEFINITIONS.filter((r) => categories.has(r.category))
}

export default function PrintCenterClient({
  classId,
  className,
  academicYear,
  defaultMonth,
  initialCategory = null,
  initialReport = null,
  initialPeriod = null,
  initialSemester = null,
}: {
  classId: string | null
  className: string
  academicYear: string
  /**
   * The month the page opens on when nothing in the URL names one — resolved
   * SERVER-SIDE from today's date.
   *
   * Not `new Date()` in this component: that renders one month during SSR and
   * possibly another on the client, which React reports as a hydration
   * mismatch. And not the constant `nov` the flow used to fall back to, which
   * was the first month of the academic year and therefore wrong from December
   * onwards.
   */
  defaultMonth: MonthId
  /**
   * The family to open on, from `?category=` — already validated by the page.
   *
   * It is the *initial* value, not a controlled one: once here, the shelf and
   * the filter are the teacher's to change, and a URL that kept snapping them
   * back would make those controls look broken.
   */
  initialCategory?: ReportCategory | null
  /**
   * The report to open the generation flow on, from `?report=`.
   *
   * This is how a results screen hands over: a teacher who read ខែធ្នូ's ranking
   * arrives with the ranking sheet's dialog already open on ខែធ្នូ, instead of
   * re-choosing in the centre what they were just looking at.
   *
   * Still the *initial* value only, and still subject to `reportAvailability` —
   * a report that cannot produce a file opens its shelf rather than a dialog
   * over a row saying កំពុងរៀបចំ.
   */
  initialReport?: ReportType | null
  /** The month id the flow should open on, when the report takes a month. */
  initialPeriod?: string | null
  /** The semester the flow should open on, when the report takes one. */
  initialSemester?: 'sem1' | 'sem2' | null
}) {
  const initialDefinition = initialReport ? reportDefinition(initialReport) : undefined

  /*
   * The period bar, seeded from whatever the URL knew.
   *
   * A hand-off from a results screen carries the rung as well as the value: a
   * teacher clicking through from ឆមាសទី១'s ranking should find the bar already
   * on ឆមាស, not on this month with the semester hidden one control away.
   */
  const initialScope: ScoreScope =
    (initialDefinition && scopeForPeriodKind(initialDefinition.period)) ??
    (initialSemester ? 'semester' : 'monthly')

  const [period, setPeriod] = useState<PeriodSelection>(() => ({
    scope: initialScope,
    month: (initialPeriod as MonthId | null) ?? defaultMonth,
    semester: (initialSemester as SemesterId | null) ?? 'sem1',
  }))

  const [section, setSection] = useState<ReportSectionId | null>(
    initialCategory ? (sectionForCategory(initialCategory)?.id ?? null) : null,
  )
  /*
   * `?category=` narrows WITHIN its shelf rather than replacing the shelf model.
   *
   * `/print-center?category=student` is a declared navigation destination and
   * `?category=certificate` is linked from the results screens, so the
   * parameter stays exactly as canonical as it was. It simply lands on the
   * ឯកសារសិស្ស shelf with the ឯកសារសិស្ស rows showing, which is what it always
   * meant.
   */
  const [category, setCategory] = useState<ReportCategory | null>(initialCategory)
  const [query, setQuery] = useState('')

  /*
   * Which shelves are open on arrival.
   *
   * Two conditions, and the second is what stops "open the important ones" from
   * meaning "open most of the page": the shelf must hold an everyday document
   * (P0), AND that document must read the rung the period bar is currently on.
   *
   * In an ordinary September that opens របាយការណ៍ផ្លូវការ and វត្តមាន and leaves
   * លទ្ធផលប្រចាំឆ្នាំ shut — which is right, because nobody prints the year's
   * totals in September, and seven annual rows unfurled beneath this month's
   * work is the wall the redesign removes. A teacher who arrives from a link
   * carrying `?semester=`, or who is actually doing the year, gets the shelf
   * that matches what they came for.
   *
   * Seeded ONCE, not recomputed: a teacher who closes ពិន្ទុ has closed it, and
   * re-opening it on the next render because it still holds an everyday
   * document would be the page arguing. Changing the period afterwards is a
   * statement about which month, not a request to rearrange the page.
   */
  const [expanded, setExpanded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      REPORT_SECTIONS.map((section) => [
        section.id,
        /*
          A deep link opens what it names, always. `?category=student` is a
          declared navigation destination — the សិស្ស menu's ឯកសារសិស្ស entry —
          and landing a teacher on a shut shelf with its five documents inside
          it is a dead end reached by following a link that promised them.
        */
        (initialCategory !== null &&
          section.groups.some((g) => g.categories.includes(initialCategory))) ||
          reportsOnShelf(section, null).some(
            (r) =>
              reportPriority(r.type) === 0 && scopeForPeriodKind(r.period) === initialScope,
          ),
      ]),
    ),
  )

  const [generating, setGenerating] = useState<ReportDefinition | null>(() => {
    // Resolved once, during the first render, rather than in an effect: an
    // effect would paint the index first and then drop a dialog over it, which
    // reads as the page having changed its mind.
    if (!initialDefinition) return null
    return reportAvailability(initialDefinition).action === 'generate' ? initialDefinition : null
  })
  /*
   * The handed-over period applies to the report that was handed over, and to
   * nothing after it. Once the teacher opens a second report from the index
   * they are choosing again, and the page's own period bar is what that choice
   * means.
   */
  const [handoff, setHandoff] = useState<ReportType | null>(initialReport)
  const searchId = useId()

  const searching = query.trim().length > 0

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return REPORT_DEFINITIONS.filter((r) => {
      const family = REPORT_CATEGORIES.find((c) => c.id === r.category)
      const shelf = sectionForCategory(r.category)
      return (
        r.label.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.type.includes(q) ||
        (r.group ?? '').toLowerCase().includes(q) ||
        (family?.label ?? '').toLowerCase().includes(q) ||
        (shelf?.label ?? '').toLowerCase().includes(q)
      )
    })
  }, [query])

  /*
   * Every link out of this screen carries the class it was built for.
   *
   * Through the shared `withClassParam`, not a local append: that helper
   * consults `CLASS_SCOPED_ROUTES`, so a report whose screen does not read a
   * class does not get `?class=` bolted into a URL a teacher may share.
   *
   * The pure function rather than `useClassHref`, for the same reason the
   * dashboard uses it: this screen already knows which class its rows describe
   * — it was handed the id the server resolved — so it scopes to that one
   * rather than re-reading the address bar.
   */
  const withClass = (href: string) => withClassParam(href, classId)

  /** What a given report would cover right now. One answer, three renderers. */
  const periodOf = (report: ReportDefinition): ResolvedPeriod =>
    resolvePeriod(report.period, period, academicYear)

  const openReport = (report: ReportDefinition) => {
    setHandoff(null)
    setGenerating(report)
  }

  const shelves = section ? REPORT_SECTIONS.filter((s) => s.id === section) : REPORT_SECTIONS
  const listed = shelves.flatMap((s) => reportsOnShelf(s, category)).length

  return (
    <PageContainer>
      <PageHeader
        title="មជ្ឈមណ្ឌលឯកសារ និងបោះពុម្ព"
        description="បង្កើត · ពិនិត្យ · បោះពុម្ព · ទាញយក"
      />

      {/*
        The SHARED strip. This page used to render a private copy — same three
        facts, its own markup — so a class whose grade row is named unusually
        read differently here than on `/student-list`, and the one screen a
        teacher arrives at from four others stated its context in a fourth way.

        Two things the private copy knew are passed rather than dropped:

          the YEAR   this page honours `?year=`, so it can legitimately be about
                     a year that is not the active assignment's — which is what
                     `useActiveClass()` would otherwise report.
          the LEGACY a pre-V2 account has no class row and the shared strip
             CASE   renders nothing for it. Here there IS a true answer:
                    `settings.class_name`, the name that account prints on every
                    sheet, plus the fact that reports cover the whole roster.
      */}
      <ClassContextBar
        yearLabel={academicYear}
        legacy={{
          label: className || 'សិស្សរបស់អ្នក',
          note: 'របាយការណ៍ប្រើបញ្ជីសិស្សរបស់អ្នកទាំងអស់។',
        }}
      />

      {!searching && (
        <QuickPrintRow
          academicYear={academicYear}
          period={period}
          onOpen={openReport}
          withClass={withClass}
        />
      )}

      <PeriodBar selection={period} onChange={setPeriod} academicYear={academicYear} />

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
          placeholder="ស្វែងរកឯកសារ..."
          aria-label="ស្វែងរកឯកសារ"
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

      {/* ------------------------------------------------------- shelf nav */}
      {/*
        A wrapping row of five, not a scrolling tab strip and not the nine the
        page used to carry: Khmer labels do not fit one phone-width line, and a
        horizontally scrolled bar hides whichever shelf happens to be
        off-screen. Wrapping keeps every one reachable without a swipe.
      */}
      {!searching && (
        <nav aria-label="ប្រភេទឯកសារ" className="mb-4 flex flex-wrap gap-1.5">
          <ShelfTab
            label="ទាំងអស់"
            active={section === null}
            onClick={() => {
              setSection(null)
              setCategory(null)
            }}
            count={REPORT_DEFINITIONS.length}
          />
          {REPORT_SECTIONS.map((s) => (
            <ShelfTab
              key={s.id}
              label={s.label}
              icon={SECTION_ICON[s.id]}
              active={section === s.id}
              onClick={() => {
                setSection(s.id)
                setCategory(null)
                setExpanded((prev) => ({ ...prev, [s.id]: true }))
              }}
              count={reportsOnShelf(s, null).length}
            />
          ))}
        </nav>
      )}

      {/* Narrowed by a deep link, and reversible — otherwise `?category=student`
          is a filter with no visible off switch. */}
      {!searching && category && (
        <p className="mb-3 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <span>
            បង្ហាញតែ{' '}
            <span className="font-bold text-text-heading">
              {REPORT_CATEGORIES.find((c) => c.id === category)?.label}
            </span>
          </span>
          <button
            type="button"
            onClick={() => setCategory(null)}
            className="inline-flex min-h-11 items-center gap-1 rounded-md px-2 font-bold text-brand underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" /> បង្ហាញទាំងអស់
          </button>
        </p>
      )}

      <p aria-live="polite" className="sr-only">
        {searching
          ? `រកឃើញឯកសារ ${toKhmerNumber(matches.length)}`
          : `បង្ហាញឯកសារ ${toKhmerNumber(listed)}`}
      </p>

      {/* --------------------------------------------------------- content */}
      {searching ? (
        matches.length === 0 ? (
          <div className="rounded-xl border border-divider bg-bg-surface">
            <EmptyState
              kind="filtered"
              title="រកមិនឃើញឯកសារ"
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
                {toKhmerNumber(matches.length)} ឯកសារ
              </span>
            </h2>
            <ul className="divide-y divide-divider">
              {matches.map((report) => (
                <ReportRow
                  key={report.type}
                  report={report}
                  period={periodOf(report)}
                  onOpen={() => openReport(report)}
                  legacyHref={report.legacyHref ? withClass(report.legacyHref) : null}
                  showCategory
                  headingLevel="h3"
                />
              ))}
            </ul>
          </section>
        )
      ) : (
        /*
          One column on phones, two on a wide screen — and the two are real
          columns, not grid cells.

          Neither obvious alternative works here, because a shelf on this page
          changes height when it is opened:

            a GRID       lays out in rows, so the short shelf beside the tall one
                         leaves a hole the height of the difference. វត្តមាន
                         holds two documents and sat beside a shelf holding
                         eight, which put a screenful of nothing in the middle
                         of the page.
            CSS COLUMNS  balance themselves, and re-balance on every toggle — so
                         opening ប្រចាំឆ្នាំ can throw ឯកសារសិស្ស into the other
                         column. The page rearranging itself under the finger
                         that touched it is worse than an uneven edge.

          So the shelves are dealt into two fixed columns in catalogue order and
          each column packs its own contents. Which column a shelf is in never
          changes; only how tall it is does.
        */
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start">
          {/* An empty second column would leave a filtered view — one shelf —
              sitting at half width beside nothing. */}
          {[0, 1]
            .map((column) => shelves.filter((_, index) => index % 2 === column))
            .filter((column) => column.length > 0)
            .map((column, columnIndex) => (
            <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-4">
              {column
                .map((shelf) => (
                  <ShelfPanel
                    key={shelf.id}
                    shelf={shelf}
                    only={category}
                    open={expanded[shelf.id] ?? false}
                    onToggle={() =>
                      setExpanded((prev) => ({ ...prev, [shelf.id]: !(prev[shelf.id] ?? false) }))
                    }
                    periodOf={periodOf}
                    onOpen={openReport}
                    withClass={withClass}
                  />
                ))}
            </div>
          ))}
        </div>
      )}

      {!searching && !section && <PlannedPanel />}

      <GenerateReportDialog
        report={generating}
        onClose={() => setGenerating(null)}
        classId={classId}
        className={className}
        academicYear={academicYear}
        /*
          The page's period, unless a results screen named one for this exact
          report — in which case the URL wins for that one opening only, because
          the teacher is looking at the sheet they just came from.
        */
        initialPeriod={handoff && generating?.type === handoff ? initialPeriod : period.month}
        initialSemester={
          handoff && generating?.type === handoff ? initialSemester : period.semester
        }
      />
    </PageContainer>
  )
}

/* ------------------------------------------------------------ quick print */

/**
 * The four documents most of this month's printing actually is.
 *
 * Not a second index: a fixed, catalogue-declared four, each resolved against
 * the period bar so `ពិន្ទុខែនេះ` means the month on screen rather than a
 * different default hidden in a dialog. Every one of them generates —
 * `verify-reporting.mts` pins that — because the one thing the biggest buttons
 * on the page may not do is say កំពុងរៀបចំ.
 */
function QuickPrintRow({
  academicYear,
  period,
  onOpen,
  withClass,
}: {
  academicYear: string
  period: PeriodSelection
  onOpen: (report: ReportDefinition) => void
  withClass: (href: string) => string
}) {
  const cards = QUICK_ACTION_REPORTS.map((type) => reportDefinition(type)).filter(
    (r): r is ReportDefinition => r !== undefined,
  )
  if (cards.length === 0) return null

  return (
    <section aria-labelledby="quick-print" className="mb-4">
      <h2
        id="quick-print"
        className="mb-2 flex items-center gap-1.5 text-[13px] font-bold text-text-heading"
      >
        <Clock3 className="h-4 w-4 text-brand" aria-hidden="true" />
        បោះពុម្ពឆាប់ៗ
      </h2>

      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((report) => {
          const availability = reportAvailability(report)
          const resolved = resolvePeriod(report.period, period, academicYear)
          const Icon = CATEGORY_ICON[report.category]
          const legacyHref = report.legacyHref ? withClass(report.legacyHref) : null

          const body = (
            <>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand dark:bg-brand-900/40">
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1 text-left">
                <span className="block truncate text-[13px] font-bold text-text-heading">
                  {report.label}
                </span>
                <span className="mt-0.5 block truncate text-[11px] text-text-muted">
                  {resolved.label}
                </span>
              </span>
              <span className="shrink-0 rounded-md bg-brand px-3 py-1.5 text-[12px] font-bold text-brand-contrast">
                {availability.actionLabel || 'បើក'}
              </span>
            </>
          )

          const shell =
            'flex min-h-[4.5rem] w-full items-center gap-3 rounded-xl border border-divider bg-bg-surface p-3 text-left shadow-sm transition hover:border-brand-400 hover:shadow focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

          return (
            <li key={report.type}>
              {availability.action === 'generate' ? (
                <button
                  type="button"
                  onClick={() => onOpen(report)}
                  aria-label={`${report.label} — ${resolved.label}`}
                  className={`${shell} cursor-pointer`}
                >
                  {body}
                </button>
              ) : legacyHref ? (
                <Link
                  href={legacyHref}
                  aria-label={`${report.label} — ${resolved.label}`}
                  className={shell}
                >
                  {body}
                </Link>
              ) : null}
            </li>
          )
        })}
      </ul>
    </section>
  )
}

/* ----------------------------------------------------------- period context */

/**
 * រយៈពេល — which month, semester or year everything below is about.
 *
 * The rungs and their Khmer names come from `SCORE_SCOPES`, the ladder every
 * score screen renders. Restating them here as three literals is how `annual`
 * acquired a fourth name last time.
 *
 * Changing the rung does NOT filter the list. A teacher switching to ឆមាស is
 * saying which semester they mean, not that monthly documents have stopped
 * existing — hiding half the index on a period change would be a filter wearing
 * a context control's clothes. Each row reads the rung it declares and ignores
 * the other two.
 */
function PeriodBar({
  selection,
  onChange,
  academicYear,
}: {
  selection: PeriodSelection
  onChange: (next: PeriodSelection) => void
  academicYear: string
}) {
  const monthId = useId()
  const semesterId = useId()

  return (
    <section
      aria-label="រយៈពេល"
      className="mb-3 flex flex-col gap-2 rounded-xl border border-divider bg-bg-surface p-3 sm:flex-row sm:items-center sm:gap-3"
    >
      <span className="text-[13px] font-bold text-text-heading">រយៈពេល</span>

      <div
        role="group"
        aria-label="ជ្រើសរយៈពេល"
        className="flex flex-wrap gap-1 rounded-lg bg-paper p-1"
      >
        {SCORE_SCOPES.map((scope) => {
          const active = selection.scope === scope.id
          return (
            <button
              key={scope.id}
              type="button"
              aria-pressed={active}
              title={scope.hint}
              onClick={() => onChange({ ...selection, scope: scope.id as ScoreScope })}
              className={`min-h-11 cursor-pointer rounded-md px-3 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                active
                  ? 'bg-brand text-brand-contrast shadow-sm'
                  : 'text-text-body hover:bg-bg-surface hover:text-brand'
              }`}
            >
              {scope.label}
            </button>
          )
        })}
      </div>

      {/* Only the rung that has a choice gets a control. ប្រចាំឆ្នាំ has one
          year and states it; a disabled dropdown holding a single option is a
          decision presented where none exists. */}
      <div className="min-w-0 sm:w-56">
        {selection.scope === 'monthly' && (
          <>
            <label className="sr-only" htmlFor={monthId}>
              ខែ
            </label>
            <Select
              id={monthId}
              ariaLabel="ខែ"
              value={selection.month}
              onChange={(value) => onChange({ ...selection, month: value as MonthId })}
              options={ACADEMIC_MONTH_OPTIONS_BY_ID}
            />
          </>
        )}
        {selection.scope === 'semester' && (
          <>
            <label className="sr-only" htmlFor={semesterId}>
              ឆមាស
            </label>
            <Select
              id={semesterId}
              ariaLabel="ឆមាស"
              value={selection.semester}
              onChange={(value) => onChange({ ...selection, semester: value as SemesterId })}
              options={[
                { value: 'sem1', label: 'ឆមាសទី១' },
                { value: 'sem2', label: 'ឆមាសទី២' },
              ]}
            />
          </>
        )}
        {selection.scope === 'annual' && (
          <p className="text-[13px] font-bold text-text-heading">
            {toKhmerNumber(academicYear)}
          </p>
        )}
      </div>
    </section>
  )
}

/* --------------------------------------------------------------- navigation */

function ShelfTab({
  label,
  active,
  onClick,
  count,
  icon: Icon,
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
      className={`flex min-h-11 cursor-pointer items-center gap-1.5 rounded-lg border px-3 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
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

/* ------------------------------------------------------------------ shelves */

/**
 * One shelf: a heading that says what is on it, and the documents when opened.
 *
 * The heading is the disclosure control — a whole-width target, not a chevron
 * the size of a fingernail — and it states the count and the runs it holds
 * while closed, so choosing whether to open it never requires opening it.
 *
 * Runs come from the section's own `groups`, subdivided further by each
 * report's `group` where the catalogue declares one: the seven annual reports
 * are three separate errands and a flat list of seven makes the teacher read
 * all of them to find which. Nothing here decides what the runs are.
 */
function ShelfPanel({
  shelf,
  only,
  open,
  onToggle,
  periodOf,
  onOpen,
  withClass,
}: {
  shelf: ReportSection
  only: ReportCategory | null
  open: boolean
  onToggle: () => void
  periodOf: (report: ReportDefinition) => ResolvedPeriod
  onOpen: (report: ReportDefinition) => void
  withClass: (href: string) => string
}) {
  const panelId = useId()
  const Icon = SECTION_ICON[shelf.id]

  const runs = shelf.groups
    .map((group) => ({
      label: group.label,
      categories: group.categories.filter((c) => !only || c === only),
    }))
    .filter((g) => g.categories.length > 0)
    .map((group) => ({
      ...group,
      reports: REPORT_DEFINITIONS.filter((r) => group.categories.includes(r.category)),
    }))
    .filter((g) => g.reports.length > 0)

  const total = runs.reduce((sum, g) => sum + g.reports.length, 0)
  if (total === 0) return null

  /*
   * What a closed shelf tells you. The runs where it has them, and otherwise
   * the sub-headings the catalogue declares on the documents themselves — so
   * ប្រចាំឆ្នាំ reads "លទ្ធផលសិក្សា · តាមមុខវិជ្ជា · លទ្ធផលឡើងថ្នាក់" while shut,
   * which is the whole of §7's progressive disclosure in one line.
   */
  const runLabels = runs.some((g) => g.label)
    ? runs.map((g) => g.label).filter((l): l is string => Boolean(l))
    : [...new Set(runs.flatMap((g) => g.reports.map((r) => r.group)))].filter(
        (l): l is string => Boolean(l),
      )

  return (
    <section
      aria-label={shelf.label}
      className="overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-sm"
    >
      <h2>
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex w-full cursor-pointer items-start gap-3 bg-paper px-4 py-3 text-left transition hover:bg-bg-app focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand dark:bg-brand-900/40">
            <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
          </span>

          <span className="min-w-0 flex-1">
            <span className="block text-sm font-bold text-text-heading">{shelf.label}</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              {open || runLabels.length === 0 ? shelf.description : runLabels.join(' · ')}
            </span>
          </span>

          <span className="flex shrink-0 items-center gap-1.5 pt-0.5 text-[11px] text-text-muted">
            <span className="tabular-nums">{toKhmerNumber(total)} ឯកសារ</span>
            <ChevronDown
              className={`h-4 w-4 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
              aria-hidden="true"
            />
          </span>
        </button>
      </h2>

      <div id={panelId} hidden={!open}>
        {runs.map((run, index) => (
          <ShelfRun
            key={run.label ?? `run-${index}`}
            label={run.label}
            reports={run.reports}
            achievement={run.categories.every((c) => ACHIEVEMENT_CATEGORIES.includes(c))}
            periodOf={periodOf}
            onOpen={onOpen}
            withClass={withClass}
          />
        ))}
      </div>
    </section>
  )
}

/** A labelled run of documents inside a shelf, split again by `group`. */
function ShelfRun({
  label,
  reports,
  achievement,
  periodOf,
  onOpen,
  withClass,
}: {
  label: string | null
  reports: ReportDefinition[]
  achievement: boolean
  periodOf: (report: ReportDefinition) => ResolvedPeriod
  onOpen: (report: ReportDefinition) => void
  withClass: (href: string) => string
}) {
  // Preserves catalogue order; a group's position is its first member's.
  const groups: { label: string | null; reports: ReportDefinition[] }[] = []
  for (const report of reports) {
    const groupLabel = report.group ?? null
    const last = groups[groups.length - 1]
    if (last && last.label === groupLabel) last.reports.push(report)
    else groups.push({ label: groupLabel, reports: [report] })
  }

  return (
    <div className="border-t border-divider first:border-t-0">
      {label && (
        <h3
          className={`px-4 pb-1.5 pt-3 text-[11px] font-bold tracking-wide ${
            achievement ? 'text-gold' : 'text-text-muted'
          }`}
        >
          {label}
        </h3>
      )}

      {groups.map((group, index) => (
        <div key={group.label ?? `flat-${index}`}>
          {group.label && (
            <h3 className="border-b border-divider px-4 pb-1.5 pt-3 text-[11px] font-bold tracking-wide text-text-muted">
              {group.label}
            </h3>
          )}
          <ul className="divide-y divide-divider">
            {group.reports.map((report) => (
              <ReportRow
                key={report.type}
                report={report}
                period={periodOf(report)}
                onOpen={() => onOpen(report)}
                legacyHref={report.legacyHref ? withClass(report.legacyHref) : null}
                headingLevel="h4"
                achievement={achievement}
              />
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}

/* -------------------------------------------------------------------- rows */

/**
 * One document: what it is, what it is for, what it covers, what comes out, and
 * exactly one thing to do about it.
 *
 * Four things the old row carried are gone, because none of them was about the
 * document: the template's name, its provenance, the period KIND (`ប្រចាំខែ` —
 * which the title already says) and a `រួចរាល់` badge on every working row. A
 * badge that appears twenty-three times out of twenty-seven is noise; it shows
 * only where the answer is not simply "yes", which is the case a teacher needs
 * warning about. The template and its provenance moved into the dialog, where
 * they are a choice with consequences rather than a fact about the build.
 *
 * The period is now stated INSTEAD: `ខែកញ្ញា ២០២៦ · Excel` says what this row
 * would produce if pressed, which is the only thing on the line that changes
 * with the page's state.
 */
function ReportRow({
  report,
  period,
  onOpen,
  legacyHref,
  showCategory = false,
  headingLevel = 'h3',
  achievement = false,
}: {
  report: ReportDefinition
  period: ResolvedPeriod
  onOpen: () => void
  legacyHref: string | null
  /** Search results span shelves, so each row names its own family. */
  showCategory?: boolean
  headingLevel?: 'h3' | 'h4'
  achievement?: boolean
}) {
  const availability = reportAvailability(report)
  const Heading = headingLevel
  const categoryLabel = REPORT_CATEGORIES.find((c) => c.id === report.category)?.label
  const Icon = CATEGORY_ICON[report.category]
  const formats = formatsShown(report, availability)

  return (
    <li className="flex flex-col gap-2.5 px-4 py-3 transition hover:bg-paper sm:flex-row sm:items-center sm:gap-4">
      <span
        className={`hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg sm:flex ${
          achievement ? 'bg-gold/15 text-gold' : 'bg-paper text-text-muted'
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <Heading className="text-[13px] font-bold text-text-heading">{report.label}</Heading>
          {/* Only where the answer is not "yes". See the note above. */}
          {availability.status !== 'engine_ready' && (
            <Badge size="sm" variant="muted">
              {availability.label}
            </Badge>
          )}
          {showCategory && categoryLabel && (
            <span className="rounded bg-paper px-1.5 py-0.5 text-[10px] font-bold text-text-muted">
              {categoryLabel}
            </span>
          )}
        </div>

        <p className="mt-0.5 text-xs text-text-muted">{report.description}</p>

        {/*
          The separator is a `::before` on each following item rather than an
          element of its own: a standalone "·" that lands at a line break leaves
          the previous line ending in a dangling dot, which on a phone is every
          second row.
        */}
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-text-muted [&>span+span]:before:mr-2 [&>span+span]:before:content-['·']">
          <span className="font-bold text-text-body">{period.label}</span>
          {formats.length > 0 && <span>{formats.map((f) => FORMAT_LABELS[f]).join(' · ')}</span>}
        </p>
      </div>

      <div className="shrink-0 sm:w-36">
        <ReportAction
          availability={availability}
          onOpen={onOpen}
          legacyHref={legacyHref}
          reportLabel={report.label}
          periodLabel={period.label}
          tone={achievement ? 'gold' : 'brand'}
        />
      </div>
    </li>
  )
}

/**
 * The single primary control a document gets.
 *
 * One action, chosen by the availability model — never Print beside Export
 * beside Download beside View. What the button says, and whether it exists at
 * all, is `reportAvailability`'s answer rendered.
 */
function ReportAction({
  availability,
  onOpen,
  legacyHref,
  reportLabel,
  periodLabel,
  tone,
}: {
  availability: ReportAvailability
  onOpen: () => void
  legacyHref: string | null
  /** Named in the accessible label, since every row shares a visible one. */
  reportLabel: string
  periodLabel: string
  tone: 'brand' | 'gold'
}) {
  const base =
    'inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-2 rounded-lg px-4 text-[13px] font-bold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring'

  if (availability.action === 'generate') {
    return (
      <button
        type="button"
        onClick={onOpen}
        aria-label={`${availability.actionLabel} ${reportLabel} — ${periodLabel}`}
        className={`${base} ${
          tone === 'gold'
            ? 'bg-gold text-brand-950 hover:opacity-90'
            : 'bg-brand text-brand-contrast hover:bg-brand-hover'
        }`}
      >
        {availability.actionLabel}
      </button>
    )
  }

  if (availability.action === 'open' && legacyHref) {
    return (
      <Link
        href={legacyHref}
        aria-label={`${availability.actionLabel} ${reportLabel}`}
        className={`${base} border border-divider bg-bg-surface text-text-body hover:border-brand-400 hover:text-brand`}
      >
        {availability.actionLabel}
      </Link>
    )
  }

  // Nothing to offer yet. Stated, not disguised as a disabled button that looks
  // like it might work on a second click.
  return <p className="text-center text-[11px] text-text-muted sm:text-left">កំពុងរៀបចំ</p>
}

/* ------------------------------------------------------------ the roadmap */

/**
 * Documents KruSmart does not print yet, said once and quietly.
 *
 * They carry no `ReportType`, no availability and no control, because the
 * catalogue's own invariant is that every entry in it is actionable — a row
 * that offers nothing is the dead end `reportAvailability`'s four states exist
 * to prevent. Announcing four planned families by minting fourteen schema
 * identifiers for documents with no screen, no data and no template would break
 * that for a roadmap.
 *
 * So this is a roadmap: collapsed, last on the page, and honest. It costs the
 * teacher one line and answers the question — "is my GEIP plan coming?" — that
 * would otherwise be answered by a fruitless search. When one of these is
 * built it gains a screen or a resolver and MOVES into `REPORT_DEFINITIONS`.
 */
function PlannedPanel() {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const count = PLANNED_DOCUMENT_GROUPS.reduce((sum, g) => sum + g.documents.length, 0)

  return (
    <section aria-label="ឯកសារកំពុងរៀបចំ" className="mt-4">
      <h2>
        <button
          type="button"
          onClick={() => setOpen((prev) => !prev)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-11 w-full cursor-pointer items-center gap-2 rounded-xl border border-dashed border-divider px-4 py-3 text-left transition hover:border-brand-400 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Clock3 className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold text-text-heading">កំពុងរៀបចំ</span>
            <span className="mt-0.5 block text-xs text-text-muted">
              ឯកសារ {toKhmerNumber(count)} ដែលនឹងអាចប្រើបាននៅពេលក្រោយ
            </span>
          </span>
          <ChevronDown
            className={`h-4 w-4 shrink-0 text-text-muted transition-transform duration-200 ${
              open ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      </h2>

      <div
        id={panelId}
        hidden={!open}
        className="mt-2 grid gap-2 sm:grid-cols-2 xl:grid-cols-4"
      >
        {PLANNED_DOCUMENT_GROUPS.map((group) => (
          <div key={group.id} className="rounded-xl border border-divider bg-bg-surface p-3">
            <h3 className="text-[13px] font-bold text-text-heading">{group.label}</h3>
            <p className="mt-0.5 text-[11px] text-text-muted">{group.description}</p>
            <ul className="mt-2 flex flex-col gap-1">
              {group.documents.map((document) => (
                <li key={document} className="text-xs text-text-body">
                  {document}
                </li>
              ))}
            </ul>
            {group.note && (
              <p className="mt-2 border-t border-divider pt-2 text-[11px] text-text-muted">
                {group.note}
              </p>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
