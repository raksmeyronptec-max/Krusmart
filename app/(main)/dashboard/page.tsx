import Link from 'next/link'
import {
  Users, UserCheck, TrendingUp, BookMarked,
  ArrowRight, AlertTriangle, CircleAlert, Info,
  CalendarCheck, UserPlus, Edit3, Send, FileBarChart, BookOpen,
} from 'lucide-react'
import { getDashboardData } from './queries'
import { resolveActor } from '@/lib/rbac/actor'
import { FeatureGrid } from './FeatureGrid'
import { StatCard } from '@/components/ui/data/StatCard'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { gradeFor } from '@/lib/grading/scheme'

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
  warning: { icon: AlertTriangle, cls: 'border-warning/30 bg-warning/10 text-warning' },
  info: { icon: Info, cls: 'border-divider bg-paper text-text-body' },
} as const

const QUICK_ACTIONS = [
  { label: 'ចុះវត្តមាន', href: '/attendance/layout', icon: CalendarCheck },
  { label: 'បន្ថែមសិស្ស', href: '/enrollment', icon: UserPlus },
  { label: 'បញ្ចូលពិន្ទុ', href: '/score/enter', icon: Edit3 },
  { label: 'បង្កើតកិច្ចការផ្ទះ', href: '/homework/send', icon: Send },
  { label: 'បង្កើតរបាយការណ៍', href: '/parent-report', icon: FileBarChart },
]

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const [{ stats, attention }, actor] = await Promise.all([
    getDashboardData(searchParams),
    resolveActor(),
  ])
  // The class's scheme, resolved once in `getDashboardData`.
  const grade = gradeFor(stats.monthAverage, stats.scheme)

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
        description={`ទិដ្ឋភាពរួមនៃថ្នាក់របស់អ្នក · ឆ្នាំសិក្សា ${stats.academicYear}`}
      />

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
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-warning/10 text-warning"
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
          href="/student-list"
        />
        <StatCard
          label="វត្តមានថ្ងៃនេះ"
          // A dash, not a zero: nobody marked yet is not the same as nobody present.
          value={stats.attendanceRate === null ? '—' : `${toKhmerNumber(stats.attendanceRate)}%`}
          hint={
            stats.attendanceRate === null
              ? 'មិនទាន់បានចុះវត្តមាន'
              : `អវត្តមាន ${toKhmerNumber(stats.todayAbsent)} · យឺត ${toKhmerNumber(stats.todayLate)}`
          }
          icon={UserCheck}
          tone={stats.attendanceRate === null ? 'warning' : 'success'}
          href="/attendance/monthly"
        />
        <StatCard
          label="មធ្យមភាគប្រចាំខែ"
          value={stats.monthAverage === null ? '—' : toKhmerNumber(stats.monthAverage.toFixed(2))}
          hint={grade ? `និទ្ទេស ${grade.letter} · ${grade.label}` : 'មិនទាន់មានពិន្ទុ'}
          icon={TrendingUp}
          tone="gold"
          href="/score/total"
        />
        <StatCard
          label="កិច្ចការផ្ទះកំពុងដំណើរការ"
          value={toKhmerNumber(stats.openHomework)}
          hint={stats.strugglingCount > 0 ? `សិស្សខ្សោយ ${toKhmerNumber(stats.strugglingCount)} នាក់` : 'គ្មានបញ្ហា'}
          icon={BookMarked}
          tone={stats.strugglingCount > 0 ? 'warning' : 'brand'}
          href="/homework/enter"
        />
      </section>

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
                    href={a.href}
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
              href={a.href}
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
