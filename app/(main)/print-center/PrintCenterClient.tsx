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
  type QuickAction,
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
 *     because those four are most of what most teachers print — and not as four
 *     equal cards, because they are not four equal errands.
 *
 * ── ONE navigation level, and the shelves are it ──────────────────────────
 *
 * The first pass put a row of five shelf chips above the five shelves. Both
 * were real navigation, which made them competing navigation: the chips said
 * របាយការណ៍ផ្លូវការ · វត្តមាន · លទ្ធផលប្រចាំឆ្នាំ · … and then the very next thing
 * on the page said it again, in the same order, as headings a teacher could
 * open. Stacked under បោះពុម្ពឆាប់ៗ, a period bar and a search box, the upper
 * half of the screen was four rows of outlined controls before a single
 * document appeared.
 *
 * The chips are gone. The shelf headings ARE the navigation — they name the
 * five destinations, count what is on them and open in place. Category
 * filtering survives as a SECONDARY interaction only, reached by a deep link
 * (`?category=student`, a declared navigation destination) and always
 * reversible on screen; it is never a second permanent row.
 *
 * ── Progressive disclosure, and where it stops ────────────────────────────
 *
 * A shelf opens when it holds an everyday document that reads the rung the
 * period bar is on — so an ordinary September opens ពិន្ទុ and វត្តមាន, and
 * moving the bar to ឆ្នាំ opens the year's shelf, which is the teacher saying
 * what they came for. A shelf the teacher has opened or closed by hand keeps
 * what they chose: the page may suggest, it may not overrule. Nothing is hidden
 * behind a search that must be guessed at — a closed shelf names its groups and
 * counts its documents.
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
  /*
   * Which shelves are open — SUGGESTED by the page, DECIDED by the teacher.
   *
   * `openByDefault` below answers "is this shelf worth opening for the period
   * currently selected?", so moving the bar to ឆ្នាំ opens លទ្ធផលប្រចាំឆ្នាំ
   * without a second click. That has to be derived rather than seeded once, or
   * switching rung leaves the teacher looking at the wrong shelf open and the
   * right one shut.
   *
   * `overrides` is what stops that being the page arguing. A shelf the teacher
   * has opened or closed by hand is recorded here and never reconsidered, so a
   * suggestion is only ever made about a shelf nobody has touched.
   */
  const [overrides, setOverrides] = useState<Record<string, boolean>>({})

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

  /*
   * A deep link opens what it names, always. `?category=student` is a declared
   * navigation destination — the សិស្ស menu's ឯកសារសិស្ស entry — and landing a
   * teacher on a shut shelf with its five documents inside it is a dead end
   * reached by following a link that promised them.
   */
  const openByDefault = (shelf: ReportSection) =>
    (category !== null && shelf.groups.some((g) => g.categories.includes(category))) ||
    reportsOnShelf(shelf, null).some(
      (r) => reportPriority(r.type) === 0 && scopeForPeriodKind(r.period) === period.scope,
    )

  const isOpen = (shelf: ReportSection) => overrides[shelf.id] ?? openByDefault(shelf)

  /*
   * Category filtering is a SECONDARY interaction, so it narrows to the one
   * shelf that holds it rather than adding a permanent row of its own.
   */
  const activeSection = category ? (sectionForCategory(category)?.id ?? null) : null
  const shelves = activeSection
    ? REPORT_SECTIONS.filter((s) => s.id === activeSection)
    : REPORT_SECTIONS
  const listed = shelves.flatMap((s) => reportsOnShelf(s, category)).length

  /** One shelf, wherever it is being laid out. Both arrangements below use it. */
  const renderShelf = (shelf: ReportSection) => (
    <ShelfPanel
      key={shelf.id}
      shelf={shelf}
      only={category}
      open={isOpen(shelf)}
      onToggle={() => setOverrides((prev) => ({ ...prev, [shelf.id]: !isOpen(shelf) }))}
      periodOf={periodOf}
      onOpen={openReport}
      withClass={withClass}
    />
  )

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
      {/*
        Quieter than everything above it, and narrower. Search is the escape
        hatch for a teacher who already knows the document's name; drawn as a
        full-width outlined field it read as the page's main control, competing
        with បោះពុម្ពឆាប់ៗ for the first glance. It keeps its 44px height —
        quiet is a matter of weight, never of target size.
      */}
      <div className="relative mb-4 sm:max-w-xs">
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
          className="min-h-11 w-full rounded-lg border border-transparent bg-paper pl-9 pr-12 text-sm text-text-heading outline-none transition placeholder:text-text-muted hover:border-divider focus:border-brand focus:bg-bg-surface focus:ring-2 focus:ring-focus-ring/30"
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

      {/* Narrowed by a deep link, and reversible — otherwise `?category=student`
          is a filter with no visible off switch. This is the only categor­y
          control on the page, and it exists only once a link has asked for one. */}
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
            className="inline-flex min-h-11 cursor-pointer items-center gap-1 rounded-md px-2 font-bold text-brand underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" /> បង្ហាញឯកសារទាំងអស់
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
          One ordered list on a phone, two packed columns on a wide screen.

          BOTH arrangements render the same `renderShelf`, and the reason there
          are two of them at all is that the phone order is load-bearing. The
          five shelves are the page's one navigation level and their catalogue
          order IS that navigation — របាយការណ៍ផ្លូវការ, វត្តមាន, then the three a
          teacher reaches for occasionally. Dealt into two columns and then
          stacked by a media query, that order becomes "everything in column
          one, then everything in column two", which buried វត្តមាន beneath two
          shut shelves on the exact device most Cambodian teachers use.

          Neither obvious single-tree alternative works, because a shelf on this
          page changes height when it is opened:

            a GRID       lays out in rows, so the short shelf beside the tall one
                         leaves a hole the height of the difference. វត្តមាន
                         holds two documents and sat beside a shelf holding
                         eight, which put a screenful of nothing in the middle
                         of the page.
            CSS COLUMNS  balance themselves, and re-balance on every toggle — so
                         opening ប្រចាំឆ្នាំ can throw ឯកសារសិស្ស into the other
                         column. The page rearranging itself under the finger
                         that touched it is worse than an uneven bottom edge.

          So the wide layout deals the shelves into two fixed columns in
          catalogue order and each column packs its own contents. Which column a
          shelf is in never changes; only how tall it is does.

          The split lands at `xl` and not at `lg`, because the shell's sidebar
          is a permanent 264px: a 1024px landscape tablet leaves roughly 730px
          of content, where two columns wrap every document's one-line purpose
          onto three lines and push the button under it. A tablet gets the
          single ordered column, which is the better reading of "two columns
          where space allows".
        */
        <>
          <div className="flex flex-col gap-4 xl:hidden">
            {shelves.map(renderShelf)}
          </div>

          <div className="hidden gap-4 xl:flex xl:items-start">
            {/* An empty second column would leave a filtered view — one shelf —
                sitting at half width beside nothing. */}
            {[0, 1]
              .map((column) => shelves.filter((_, index) => index % 2 === column))
              .filter((column) => column.length > 0)
              .map((column, columnIndex) => (
                <div key={columnIndex} className="flex min-w-0 flex-1 flex-col gap-4">
                  {column.map(renderShelf)}
                </div>
              ))}
          </div>
        </>
      )}

      {!searching && !activeSection && <PlannedPanel />}

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
 * the period bar so the score card means the month on screen rather than a
 * different default hidden in a dialog. Every one of them generates —
 * `verify-reporting.mts` pins that — because the one thing the biggest buttons
 * on the page may not do is say កំពុងរៀបចំ.
 *
 * ── They are not four equal cards ─────────────────────────────────────────
 *
 * Four identical tiles is a menu, and a menu has to be read. These are ranked,
 * and the ranking is declared in the catalogue rather than inferred here:
 *
 *   primary    the month's marks. Filled, wider, and first — it is the errand
 *              a primary teacher opens this page for.
 *   secondary  the register and the ranking, the two that usually follow it.
 *   quiet      the year's totals. They belong here so they can be found in
 *              October; they are noise in February, so they are drawn as the
 *              least of the four rather than left off and hunted for.
 *
 * The label is the ERRAND (`ពិន្ទុ`), not the document (`តារាងពិន្ទុប្រចាំខែ`),
 * and the second line is the real resolved period — so the pair stays true when
 * the teacher moves the period bar, which `ពិន្ទុខែនេះ` would not.
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
  const cards = QUICK_ACTION_REPORTS.map((quick) => ({
    quick,
    report: reportDefinition(quick.type),
  })).filter((c): c is { quick: QuickAction; report: ReportDefinition } => c.report !== undefined)

  if (cards.length === 0) return null

  return (
    <section aria-labelledby="quick-print" className="mb-5">
      <h2 id="quick-print" className="mb-2 text-[13px] font-bold text-text-heading">
        បោះពុម្ពឆាប់ៗ
      </h2>

      {/*
        The primary card is wider on a desktop grid and first everywhere else.
        On a phone the four stack, which keeps every target full width and the
        order — marks, register, ranking, year — intact.
      */}
      <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-[1.5fr_1fr_1fr_1fr]">
        {cards.map(({ quick, report }) => {
          const availability = reportAvailability(report)
          const resolved = resolvePeriod(report.period, period, academicYear)
          const Icon = CATEGORY_ICON[report.category]
          const legacyHref = report.legacyHref ? withClass(report.legacyHref) : null
          const primary = quick.emphasis === 'primary'
          const quiet = quick.emphasis === 'quiet'

          const body = (
            <>
              <Icon
                className={`h-5 w-5 shrink-0 ${
                  primary ? 'text-brand-contrast' : quiet ? 'text-text-muted' : 'text-brand'
                }`}
                aria-hidden="true"
              />
              <span className="min-w-0 flex-1 text-left">
                <span
                  className={`block truncate font-bold ${
                    primary ? 'text-[15px] text-brand-contrast' : 'text-[13px] text-text-heading'
                  }`}
                >
                  {quick.label}
                </span>
                <span
                  className={`mt-0.5 block truncate text-[11px] ${
                    primary ? 'text-brand-contrast/80' : 'text-text-muted'
                  }`}
                >
                  {resolved.label}
                </span>
              </span>
              <span
                className={`shrink-0 text-[12px] font-bold ${
                  primary ? 'text-brand-contrast' : quiet ? 'text-text-muted' : 'text-brand'
                }`}
              >
                {availability.actionLabel || 'បើក'}
              </span>
            </>
          )

          /*
            One filled card, two outlined, one plain. The fill is the design
            system's `bg-brand` / `text-brand-contrast` pair rather than a brand
            ramp step, because the ramp is fixed across themes and the ink has
            to move with the ground.
          */
          const shell = [
            'flex min-h-[3.75rem] w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring',
            primary
              ? 'bg-brand text-brand-contrast shadow-sm hover:bg-brand-hover'
              : quiet
                ? 'bg-paper hover:bg-bg-surface'
                : 'border border-divider bg-bg-surface hover:border-brand-400',
          ].join(' ')

          return (
            <li key={report.type}>
              {availability.action === 'generate' ? (
                <button
                  type="button"
                  onClick={() => onOpen(report)}
                  aria-label={`${quick.label} — ${report.label} — ${resolved.label}`}
                  className={shell}
                >
                  {body}
                </button>
              ) : legacyHref ? (
                <Link
                  href={legacyHref}
                  aria-label={`${quick.label} — ${report.label} — ${resolved.label}`}
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
 * the other two. It does decide which SHELF opens, which is a suggestion the
 * teacher can overrule and not a filter they have to undo.
 *
 * No card and no border around it: this is context, the same class of thing as
 * the class strip above, and boxing it turned the top of the page into a stack
 * of outlined panels that had to be read before any document appeared. What is
 * left is a label, a segmented control and one dropdown.
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
      className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
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
      {/* The glyph alone, not a tinted square. Twenty-seven filled chips down a
          page is a texture, and the thing it was meant to help with — telling a
          ranking row from a score row — is done by the title. */}
      <Icon
        className={`hidden h-4 w-4 shrink-0 sm:block ${
          achievement ? 'text-gold' : 'text-text-muted'
        }`}
        aria-hidden="true"
      />

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
