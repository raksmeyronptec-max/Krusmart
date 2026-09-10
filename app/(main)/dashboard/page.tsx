import Link from 'next/link'
import {
  Users, UserCheck, TrendingUp, BookMarked,
  ArrowRight, AlertTriangle, CircleAlert, Info,
  CalendarCheck, UserPlus, Edit3, Send, FileBarChart, BookOpen,
  GraduationCap, LayoutGrid,
} from 'lucide-react'
import { getDashboardData } from './queries'
import { resolveActor } from '@/lib/rbac/actor'
import { FeatureGrid } from './FeatureGrid'
import { StatCard } from '@/components/ui/data/StatCard'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { gradeFor } from '@/lib/grading/scheme'
import { formatKhmerDate } from '@/lib/utils/date'
import { withClassParam } from '@/lib/utils/classHref'

export const metadata = { title: 'ទំព័រដើម' }

/**
 * The teacher's landing page.
 *
 * It used to be a grid of 29 equal-weight tiles — every feature shouted at the
 * same volume, and nothing on the page told a teacher what had actually
 * happened in their class today. Now the page answers four questions in order:
 *
 *   1. What is happening today?    the attendance row
 *   2. What needs my attention?    the alert list, only when there is something
 *   3. How is my class doing?      the month's average and its grade
 *   4. What should I do next?      five quick actions
 *
 * The tile grid survives underneath as "មុខងារទាំងអស់" — navigation moved to
 * the sidebar in Phase 3, so the grid is no longer how you get around, but it
 * is still the fastest jump to a named tool.
 *
 * A server component: every figure is fetched before render, so there is no
 * loading flash and no client-side fetch waterfall.
 */

const SEVERITY = {
  danger: { icon: CircleAlert, cls: 'border-danger/30 bg-danger/10 text-danger' },
  warning: { icon: AlertTriangle, cls: 'border-warning/30 bg-warning/10 text-warning-text' },
  info: { icon: Info, cls: 'border-divider bg-paper text-text-body' },
} as const

/**
 * The four things a primary teacher does in a day, plus the one place every
 * document is printed from.
 *
 * `/print-center` replaces the old `/parent-report` slot deliberately: the
 * Print Center is the product's single document hub, and a quick action that
 * jumped past it to one particular report taught the opposite — that reports
 * are found by remembering which screen holds them. The parent report is still
 * one row inside the centre, one click further and correctly filed.
 */
const QUICK_ACTIONS = [
  { label: 'ចុះវត្តមាន', href: '/attendance/layout', icon: CalendarCheck },
  { label: 'បញ្ចូលពិន្ទុ', href: '/score/enter', icon: Edit3 },
  { label: 'បន្ថែមសិស្ស', href: '/enrollment', icon: UserPlus },
  { label: 'បង្កើតកិច្ចការផ្ទះ', href: '/homework/send', icon: Send },
  { label: 'បោះពុម្ពរបាយការណ៍', href: '/print-center', icon: FileBarChart },
]

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ stats, attention, activity }, actor] = await Promise.all([
    getDashboardData(searchParams),
    resolveActor(),
  ])
  // The class's scheme, resolved once in `getDashboardData`.
  const grade = gradeFor(stats.monthAverage, stats.scheme)

  /*
   * Every link below carries the class the figures above were computed for.
   *
   * The dashboard is where a teacher starts their day, so it is where the
   * class context is set for everything they do next. Without this a tile
   * reading "សិស្សសរុប ៤២" for ៥ខ linked to a roster that `resolveServerScope`
   * would resolve to the *default* class — the number and the page it opened
   * described different classes. `withClassParam` leaves a non-scoped route
   * (`/tutorial`) untouched.
   */
  const href = (target: string) => withClassParam(target, stats.classId)

  // The dashboard is the resume surface for onboarding now — a teacher with an
  // organisation but no class lands here, not in the wizard, so the next step
  // has to be said out loud. Two classless situations, two different truths:
  // the self-serve creator's next move is theirs to make; the approved joiner
  // is waiting on their school's administrator.
  const classless = actor?.kind === 'teacher' && !actor.hasAssignments && !actor.hasLegacyRoster
  const needsClass = classless && actor.selfServeSchoolIds.length > 0
  const awaitingAssignment =
    classless && !needsClass && actor.memberSchoolIds.length > 0

  return (
    <PageContainer>
      <PageHeader
        title="សួស្តី លោកគ្រូ/អ្នកគ្រូ"
        description="ទិដ្ឋភាពរួមនៃការងារថ្ងៃនេះ"
      />

      {/*
        WHICH CLASS, WHICH YEAR — said once, at the top, before any number.
        The page answers "what do I need to do for this class today", and it
        cannot ask that question without naming the class: forty-two pupils and
        an average of 7.4 are meaningless attached to the wrong one. Every link
        below inherits the same class, so the heading is a promise the page
        keeps rather than a label beside it.
      */}
      {/* Absent, not empty, for a teacher who has no class yet: a bar reading
          "ថ្នាក់ —" above a banner that says "create your class" states the
          problem twice and answers it neither time. */}
      {(stats.className || stats.classId) && (
      <section
        aria-label="បរិបទបច្ចុប្បន្ន"
        className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-divider bg-bg-surface px-4 py-3"
      >
        <span className="flex items-center gap-2 text-sm">
          <GraduationCap className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="text-text-muted">ថ្នាក់</span>
          <span className="font-bold text-text-heading">{stats.className || '—'}</span>
        </span>
        {stats.classContext && (
          <span className="text-sm text-text-muted">{stats.classContext}</span>
        )}
        <span className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">ឆ្នាំសិក្សា</span>
          <span className="font-bold text-text-heading">{stats.academicYear}</span>
        </span>
        <Link
          href={href('/classroom')}
          className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-bold text-brand transition hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:min-h-9"
        >
          <LayoutGrid className="h-3.5 w-3.5" aria-hidden="true" />
          ប្តូរថ្នាក់
        </Link>
      </section>
      )}

      {needsClass && (
        <section
          aria-label="បង្កើតថ្នាក់"
          className="mb-5 flex flex-wrap items-center gap-4 rounded-xl border border-brand-400/50 bg-brand-100 p-4 dark:bg-brand-900/30"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-brand text-brand-contrast shadow-sm"
          >
            <BookOpen className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-bold text-text-heading">ស្ថាប័នរួចរាល់ — នៅសល់តែថ្នាក់</p>
            <p className="mt-0.5 text-sm text-text-muted">
              បង្កើតថ្នាក់របស់អ្នក (ជ្រើសរើសថ្នាក់ទី និងផ្នែក) រួចបញ្ចូលសិស្ស — បន្ទាប់មក
              គ្រប់មុខងារនឹងដំណើរការពេញលេញ។
            </p>
          </div>
          <Link
            href="/onboarding/class"
            className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            បង្កើតថ្នាក់ <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </Link>
        </section>
      )}

      {awaitingAssignment && (
        <section
          aria-label="រង់ចាំការចាត់តាំង"
          className="mb-5 flex items-start gap-4 rounded-xl border border-divider bg-bg-surface p-4"
        >
          <span
            aria-hidden="true"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning-text"
          >
            <Info className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <p className="font-bold text-text-heading">កំពុងរង់ចាំការចាត់តាំងថ្នាក់</p>
            <p className="mt-0.5 text-sm leading-relaxed text-text-muted">
              អ្នកជាសមាជិកនៃស្ថាប័នរួចហើយ។ អ្នកគ្រប់គ្រងសាលានឹងចាត់តាំងថ្នាក់ជូនអ្នក —
              បន្ទាប់ពីនោះ ទិន្នន័យថ្នាក់នឹងបង្ហាញនៅទីនេះដោយស្វ័យប្រវត្តិ។
            </p>
          </div>
        </section>
      )}

      {/* 1 — what is happening today */}
      <section aria-label="ស្ថិតិសង្ខេប" className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="សិស្សសរុប"
          value={toKhmerNumber(stats.totalStudents)}
          hint={`ស្រី ${toKhmerNumber(stats.female)} នាក់`}
          icon={Users}
          href={href('/student-list')}
        />
        <StatCard
          label="វត្តមានថ្ងៃនេះ"
          // A dash, not a zero: nobody marked yet is not the same as nobody present.
          value={stats.attendanceRate === null ? '—' : `${toKhmerNumber(stats.attendanceRate)}%`}
          hint={
            stats.attendanceRate === null
              ? 'មិនទាន់បានចុះវត្តមាន'
              : `អវត្តមាន ${toKhmerNumber(stats.todayAbsent)} · ច្បាប់ ${toKhmerNumber(stats.todayExcused)}`
          }
          icon={UserCheck}
          tone={stats.attendanceRate === null ? 'warning' : 'success'}
          href={href('/attendance/monthly')}
        />
        <StatCard
          label={stats.periodLabel ? `មធ្យមភាគ ${stats.periodLabel}` : 'មធ្យមភាគប្រចាំខែ'}
          value={stats.monthAverage === null ? '—' : toKhmerNumber(stats.monthAverage.toFixed(2))}
          hint={grade ? `និទ្ទេស ${grade.letter} · ${grade.label}` : 'មិនទាន់មានពិន្ទុ'}
          icon={TrendingUp}
          tone="gold"
          href={href('/score/total')}
        />
        <StatCard
          label="កិច្ចការផ្ទះកំពុងដំណើរការ"
          value={toKhmerNumber(stats.openHomework)}
          hint={stats.strugglingCount > 0 ? `សិស្សខ្សោយ ${toKhmerNumber(stats.strugglingCount)} នាក់` : 'គ្មានបញ្ហា'}
          icon={BookMarked}
          tone={stats.strugglingCount > 0 ? 'warning' : 'brand'}
          href={href('/homework/enter')}
        />
      </section>

      {/* 1b — how far through this period's marking the class is (§7). */}
      {/*
        A bar, not a fifth tile. The four figures above are each one number; this
        is a fraction with three parts to it, and the thing a teacher wants from
        it — "am I nearly done, and what is left" — is a shape rather than a
        value. It links to `/score/collect`, which is the screen that names the
        missing subjects; the bar says how much, that page says which.

        Absent when the class has no configured subjects at all: 0/0 is not
        "nothing done", it is "nothing to do", and a full-width empty bar would
        assert the first.
      */}
      {stats.completion.subjects > 0 && (
        <section aria-labelledby="marking" className="mb-5">
          <div className="rounded-xl border border-divider bg-bg-surface p-4">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
              <h2 id="marking" className="text-sm font-bold text-text-heading">
                ការបញ្ចូលពិន្ទុ{stats.periodLabel ? ` ${stats.periodLabel}` : ''}
              </h2>
              <Link
                href={href('/score/collect')}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-bold text-brand transition hover:text-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:min-h-8"
              >
                មើលតាមមុខវិជ្ជា <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            {/*
              `role="progressbar"` with the real numbers, because the visual bar
              is the only thing carrying this information and a percentage read
              aloud as "50" needs its scale. The text below repeats it in words
              for everyone else.
            */}
            <div
              role="progressbar"
              aria-valuenow={stats.completion.percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="ភាគរយនៃការបញ្ចូលពិន្ទុ"
              className="h-2 overflow-hidden rounded-full bg-divider"
            >
              <div
                className="h-full rounded-full bg-success transition-all duration-300"
                style={{ width: `${stats.completion.percent}%` }}
              />
            </div>

            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-text-muted">
              <span className="font-bold text-text-heading tabular-nums">
                {toKhmerNumber(stats.completion.percent)}%
              </span>
              <span>
                គ្រប់ {toKhmerNumber(stats.completion.complete)} · មិនគ្រប់{' '}
                {toKhmerNumber(stats.completion.partial)} · មិនទាន់{' '}
                {toKhmerNumber(stats.completion.empty)}
                {' '}ក្នុងចំណោម {toKhmerNumber(stats.completion.subjects)} មុខវិជ្ជា
              </span>
            </p>
          </div>
        </section>
      )}

      {/* 2 — what needs attention. Absent entirely when nothing does. */}
      {attention.length > 0 && (
        <section aria-labelledby="attention" className="mb-5">
          <h2 id="attention" className="mb-2 text-sm font-bold text-text-heading">ត្រូវការការយកចិត្តទុកដាក់</h2>
          <ul className="flex flex-col gap-2">
            {attention.map((a) => {
              const { icon: Icon, cls } = SEVERITY[a.severity]
              return (
                <li key={a.id}>
                  <Link
                    href={href(a.href)}
                    className={`flex min-h-11 items-center gap-3 rounded-xl border px-4 py-2.5 text-sm font-bold transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${cls}`}
                  >
                    <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 flex-1">{a.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 opacity-70" aria-hidden="true" />
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {/* 4 — what to do next */}
      <section aria-labelledby="quick-actions" className="mb-6">
        <h2 id="quick-actions" className="mb-2 text-sm font-bold text-text-heading">សកម្មភាពរហ័ស</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {QUICK_ACTIONS.map((a) => (
            <Link
              key={a.href}
              href={href(a.href)}
              className="flex min-h-11 items-center gap-2.5 rounded-xl border border-divider bg-bg-surface px-3 py-3 text-sm font-bold text-text-body shadow-sm transition hover:border-brand-400 hover:text-brand hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand dark:bg-brand-900/60 dark:text-brand-300">
                <a.icon className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="min-w-0 leading-tight">{a.label}</span>
            </Link>
          ))}
        </div>
      </section>

      {/* 5 — what I last did. Absent when there is nothing to report. */}
      {activity.length > 0 && (
        <section aria-labelledby="activity" className="mb-6">
          <h2 id="activity" className="mb-2 text-sm font-bold text-text-heading">សកម្មភាពថ្មីៗ</h2>
          {/*
            An ordered list: these are events in sequence, newest first, and the
            order is the information. `<time>` carries the machine-readable
            stamp while the text stays short enough to scan.
          */}
          <ol className="flex flex-col gap-1.5 rounded-xl border border-divider bg-bg-surface p-3">
            {activity.map((a) => (
              <li key={a.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
                <span className="min-w-0 text-text-body">{a.label}</span>
                {/*
                  `formatKhmerDate` takes `YYYY-MM-DD`; `created_at` is a full
                  ISO timestamp, and handing it over whole renders the day as
                  "06T12:34:56.789Z". The attribute keeps the precise instant
                  for anything reading the markup; the text is the date.
                */}
                <time dateTime={a.at} className="shrink-0 text-xs text-text-muted">
                  {formatKhmerDate(a.at.slice(0, 10))}
                </time>
              </li>
            ))}
          </ol>
        </section>
      )}

      <Link
        href="/tutorial"
        className="mb-6 flex items-center justify-between gap-4 rounded-xl bg-gradient-to-r from-brand-800 to-brand-500 px-5 py-4 text-white shadow-md transition hover:shadow-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring print:hidden"
      >
        <span className="flex items-center gap-3">
          <BookOpen className="h-6 w-6 shrink-0" aria-hidden="true" />
          <span>
            <span className="kh-moul block text-sm">ការប្រើប្រាស់</span>
            <span className="text-xs text-white/85">សៀវភៅណែនាំអំពីរបៀបប្រើប្រាស់ KruSmart</span>
          </span>
        </span>
        <ArrowRight className="h-5 w-5 shrink-0" aria-hidden="true" />
      </Link>

      <FeatureGrid />
    </PageContainer>
  )
}
