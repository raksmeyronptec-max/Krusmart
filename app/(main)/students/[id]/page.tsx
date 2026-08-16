import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  ArrowLeft, ChevronLeft, ChevronRight, CalendarCheck, TrendingUp,
  BookMarked, Edit3, IdCard, Award, Phone,
} from 'lucide-react'
import { getRosterNeighbours, getStudentDetail } from './queries'
import { PageContainer } from '@/components/shell/PageContainer'
import { Card } from '@/components/ui/layout/Card'
import { StatCard } from '@/components/ui/data/StatCard'
import { Badge, ATTENDANCE_BADGE } from '@/components/ui/feedback/Badge'
import { StudentPhoto } from './StudentPhoto'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { calculateAge, formatKhmerDate } from '@/lib/utils/date'
import { gradeFor } from '@/lib/grading/scheme'
import type { Student } from '@/lib/types'

/**
 * One pupil, whole.
 *
 * The roster answers "who is in this class"; nothing answered "how is this
 * child doing". A teacher writing a report or meeting a parent had to open the
 * roster, the attendance sheet, the score grid and the homework page and hold
 * the answer together in their head. This is that answer on one screen.
 *
 * Everything here is read-only and server-rendered. Editing still happens on
 * the screens that own it — `/enrollment` for the record, `/score/enter` for
 * marks, `/attendance/layout` for the register — which are linked rather than
 * duplicated, so there is exactly one place each fact is written.
 *
 * The route is new; no existing URL changed. `/students/[id]` is registered in
 * `lib/navigation` as a hidden child of the students module so the sidebar
 * highlight and the breadcrumb resolve without adding a menu entry for a page
 * you can only reach through a pupil.
 */

export const metadata = { title: 'ព័ត៌មានសិស្ស' }

/** A label/value pair in the record sheet. Renders `-` rather than nothing. */
function Field({ label, value }: { label: string; value: React.ReactNode }) {
  const empty = value === null || value === undefined || value === '' || value === false
  return (
    <div className="min-w-0">
      <dt className="text-xs text-text-muted">{label}</dt>
      <dd className="mt-0.5 text-sm break-words text-text-body">{empty ? '-' : value}</dd>
    </div>
  )
}

function place(v?: string | null, c?: string | null, d?: string | null, p?: string | null) {
  return [v, c, d, p].filter(Boolean).join(' ') || null
}

/**
 * Is this status column actually saying "no"?
 *
 * The two columns disagree about their own sentinel: the enrollment form
 * defaults `orphan_status` to `ទេ` and `poor_status` to `គ្មាន`, and the Excel
 * importer writes the same pair. Testing against one value alone would render
 * `គ្មាន` as a red "poor" badge on every pupil who is not poor.
 */
function isNone(v?: string | null) {
  return !v || v === 'ទេ' || v === 'គ្មាន'
}

function person(name?: string | null, job?: string | null) {
  if (!name && !job) return null
  const base = name?.trim() || 'មិនស្គាល់'
  return job?.trim() ? `${base} (${job.trim()})` : base
}

function NeighbourLink({ student, dir }: { student: Student | null; dir: 'prev' | 'next' }) {
  if (!student) {
    return <span className="flex-1" aria-hidden="true" />
  }
  const Icon = dir === 'prev' ? ChevronLeft : ChevronRight
  return (
    <Link
      href={`/students/${student.id}`}
      className={`flex min-h-11 min-w-0 flex-1 items-center gap-1.5 rounded-lg px-2 text-[13px] font-bold text-text-body transition hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        dir === 'next' ? 'justify-end' : ''
      }`}
    >
      {dir === 'prev' && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
      <span className="truncate">{student.name_kh}</span>
      {dir === 'next' && <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />}
    </Link>
  )
}

export default async function StudentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const detail = await getStudentDetail(id)

  // A row belonging to another teacher resolves to `null`, not to an error —
  // so a guessed id is indistinguishable from a deleted one.
  if (!detail) notFound()

  const { student: s, academicYear, attendance, subjects, months, overallAverage, homework } = detail
  const { prev, next, position, total } = await getRosterNeighbours(id)
  const grade = gradeFor(overallAverage)
  const age = calculateAge(s.dob)

  const flags: { label: string; on: boolean }[] = [
    { label: 'សិស្សថ្មី', on: s.is_new_student },
    { label: 'សិស្សត្រួតថ្នាក់', on: s.is_repeater },
    { label: 'សិស្សពិការ', on: s.is_disabled },
    { label: 'សិស្សធម៌', on: s.is_equity },
    { label: 'អាហារូបករណ៍', on: s.is_scholarship },
  ]

  return (
    <PageContainer>
      <Link
        href="/student-list"
        className="mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-[13px] font-bold text-text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring print:hidden"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        ត្រឡប់ទៅបញ្ជីឈ្មោះសិស្ស
      </Link>

      {/* ------------------------------------------------------------ identity */}
      <Card padding="sm" className="mb-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <StudentPhoto url={s.photo_url} name={s.name_kh} />

          <div className="min-w-0 flex-1">
            <h1 className="kh-moul truncate text-lg text-brand md:text-xl">{s.name_kh}</h1>
            <p className="mt-1 text-sm text-text-muted">
              អ.ល {s.student_id || '-'} · {s.gender || '-'}
              {age !== null && <> · អាយុ {toKhmerNumber(age)} ឆ្នាំ</>}
              {s.grade && <> · ថ្នាក់ {s.grade}</>}
            </p>
            {(flags.some((f) => f.on) || !isNone(s.poor_status) || !isNone(s.orphan_status)) && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {!isNone(s.poor_status) && (
                  <Badge variant="danger" size="sm">{s.poor_status}</Badge>
                )}
                {!isNone(s.orphan_status) && (
                  <Badge variant="warning" size="sm">{s.orphan_status}</Badge>
                )}
                {flags.filter((f) => f.on).map((f) => (
                  <Badge key={f.label} variant="info" size="sm">{f.label}</Badge>
                ))}
              </div>
            )}
          </div>

          {s.phone && (
            <a
              href={`tel:${s.phone}`}
              className="flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-divider px-4 text-sm font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring print:hidden"
            >
              <Phone className="h-4 w-4" aria-hidden="true" />
              {s.phone}
            </a>
          )}
        </div>
      </Card>

      {/* roster position — moving pupil to pupil without a round trip to the list */}
      {total > 1 && (
        <nav
          aria-label="សិស្សបន្ទាប់ និងមុន"
          className="mb-4 flex items-center gap-2 rounded-xl border border-divider bg-bg-surface px-2 print:hidden"
        >
          <NeighbourLink student={prev} dir="prev" />
          <span className="shrink-0 px-2 text-xs text-text-muted tabular-nums">
            {toKhmerNumber(position)} / {toKhmerNumber(total)}
          </span>
          <NeighbourLink student={next} dir="next" />
        </nav>
      )}

      {/* --------------------------------------------------------------- stats */}
      <section aria-label="សង្ខេប" className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="វត្តមានប្រចាំឆ្នាំ"
          value={attendance.rate === null ? '—' : `${toKhmerNumber(attendance.rate)}%`}
          hint={
            attendance.total === 0
              ? 'មិនទាន់មានកំណត់ត្រា'
              : `${toKhmerNumber(attendance.total)} ថ្ងៃបានកត់ត្រា`
          }
          icon={CalendarCheck}
          tone={attendance.rate !== null && attendance.rate < 80 ? 'warning' : 'success'}
        />
        <StatCard
          label="មធ្យមភាគសរុប"
          value={overallAverage === null ? '—' : toKhmerNumber(overallAverage.toFixed(2))}
          hint={grade ? `និទ្ទេស ${grade.letter} · ${grade.label}` : 'មិនទាន់មានពិន្ទុ'}
          icon={TrendingUp}
          tone="gold"
        />
        <StatCard
          label="អវត្តមាន"
          value={toKhmerNumber(attendance.absent)}
          hint={`ច្បាប់ ${toKhmerNumber(attendance.excused)} ថ្ងៃ`}
          icon={CalendarCheck}
          tone={attendance.absent > 0 ? 'danger' : 'brand'}
        />
        <StatCard
          label="ពិន្ទុកិច្ចការផ្ទះ"
          value={toKhmerNumber(homework.length)}
          hint="ចំនួនពិន្ទុដែលបានកត់ត្រា"
          icon={BookMarked}
        />
      </section>

      {/* ------------------------------------------------------------- actions */}
      <div className="mb-5 flex flex-wrap gap-2 print:hidden">
        {[
          { label: 'បញ្ចូលពិន្ទុ', href: '/score/enter', icon: Edit3 },
          { label: 'ចុះវត្តមាន', href: '/attendance/layout', icon: CalendarCheck },
          { label: 'បណ្ណសម្គាល់ខ្លួន', href: '/id-student', icon: IdCard },
          { label: 'វិញ្ញាបនបត្រ', href: '/certificate', icon: Award },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            className="flex min-h-11 items-center gap-2 rounded-lg border border-divider bg-bg-surface px-4 text-sm font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <a.icon className="h-4 w-4" aria-hidden="true" />
            {a.label}
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* ------------------------------------------------------------ scores */}
        <Card padding="sm" as="section">
          <h2 className="mb-3 text-sm font-bold text-text-heading">
            មធ្យមភាគតាមមុខវិជ្ជា · ឆ្នាំសិក្សា {academicYear}
          </h2>
          {subjects.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">មិនទាន់មានពិន្ទុសម្រាប់ឆ្នាំនេះ</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {subjects.map((sub) => {
                const pct = sub.average === null ? 0 : Math.max(0, Math.min(100, sub.average * 10))
                return (
                  <li key={sub.subject}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-text-body">{sub.label}</span>
                      <span className="shrink-0 font-bold text-text-heading tabular-nums">
                        {sub.average === null ? '-' : toKhmerNumber(sub.average.toFixed(2))}
                      </span>
                    </div>
                    {/*
                      A bar, not a chart library: one value per row, no axes, no
                      interaction. `aria-hidden` because the number beside it is
                      the accessible value — the bar is redundant, not primary.
                    */}
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-paper" aria-hidden="true">
                      <div
                        className={`h-full rounded-full ${sub.average !== null && sub.average < 5 ? 'bg-danger' : 'bg-brand'}`}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* ------------------------------------------------------ month trend */}
        <Card padding="sm" as="section">
          <h2 className="mb-3 text-sm font-bold text-text-heading">មធ្យមភាគតាមខែ</h2>
          {months.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">មិនទាន់មានពិន្ទុប្រចាំខែ</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {months.map((m) => {
                const g = gradeFor(m.average)
                return (
                  <li
                    key={m.id}
                    className="flex min-h-9 items-center justify-between gap-3 border-b border-divider pb-1.5 text-sm last:border-0"
                  >
                    <span className="text-text-body">{m.label}</span>
                    <span className="flex items-center gap-2">
                      <span className="font-bold text-text-heading tabular-nums">
                        {m.average === null ? '-' : toKhmerNumber(m.average.toFixed(2))}
                      </span>
                      {g && (
                        <Badge size="sm" variant={g.passed ? 'success' : 'danger'}>{g.letter}</Badge>
                      )}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* -------------------------------------------------- attendance log */}
        <Card padding="sm" as="section">
          <h2 className="mb-3 text-sm font-bold text-text-heading">កំណត់ត្រាវត្តមានថ្មីៗ</h2>
          {attendance.recent.length === 0 ? (
            <p className="py-6 text-center text-sm text-text-muted">មិនទាន់មានកំណត់ត្រាវត្តមាន</p>
          ) : (
            <ul className="flex flex-col gap-1.5">
              {attendance.recent.map((r) => {
                const b = ATTENDANCE_BADGE[r.status] ?? { label: r.status, variant: 'muted' as const }
                return (
                  <li
                    key={r.id}
                    className="flex min-h-9 items-center justify-between gap-3 border-b border-divider pb-1.5 text-sm last:border-0"
                  >
                    <span className="min-w-0">
                      <span className="text-text-body">{formatKhmerDate(r.date)}</span>
                      {r.reason && (
                        <span className="block truncate text-xs text-text-muted">{r.reason}</span>
                      )}
                    </span>
                    <Badge size="sm" variant={b.variant}>{b.label}</Badge>
                  </li>
                )
              })}
            </ul>
          )}
        </Card>

        {/* -------------------------------------------------------- homework */}
        {/*
          Only when there is something to show. An empty card for a teacher who
          does not use the homework feature is noise on a page that is already
          dense.
        */}
        {homework.length > 0 && (
          <Card padding="sm" as="section">
            <h2 className="mb-3 text-sm font-bold text-text-heading">ពិន្ទុកិច្ចការផ្ទះ</h2>
            <ul className="flex flex-col gap-1.5">
              {homework.map((h, i) => (
                <li
                  key={`${h.month}-${h.day}-${i}`}
                  className="flex min-h-9 items-center justify-between gap-3 border-b border-divider pb-1.5 text-sm last:border-0"
                >
                  <span className="min-w-0 truncate text-text-body">
                    {h.day === null ? h.month : `ថ្ងៃទី ${toKhmerNumber(h.day)} ខែ${h.month}`}
                  </span>
                  <span className="font-bold text-text-heading tabular-nums">
                    {h.value === null ? '-' : toKhmerNumber(h.value)}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        )}

        {/* ----------------------------------------------------------- record */}
        <Card padding="sm" as="section">
          <h2 className="mb-3 text-sm font-bold text-text-heading">ព័ត៌មានលម្អិត</h2>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3">
            <Field label="គោត្តនាម និងនាម" value={s.name_kh} />
            <Field label="ឈ្មោះឡាតាំង" value={s.name_en} />
            <Field label="ភេទ" value={s.gender} />
            <Field label="ថ្ងៃខែឆ្នាំកំណើត" value={formatKhmerDate(s.dob)} />
            <Field label="ទីកន្លែងកំណើត" value={place(s.birth_village, s.birth_commune, s.birth_district, s.birth_province)} />
            <Field label="អាសយដ្ឋានសព្វថ្ងៃ" value={place(s.curr_village, s.curr_commune, s.curr_district, s.curr_province)} />
            <Field label="ឈ្មោះឪពុក និងមុខរបរ" value={person(s.father_name, s.father_job)} />
            <Field label="ឈ្មោះម្តាយ និងមុខរបរ" value={person(s.mother_name, s.mother_job)} />
            <Field label="អាណាព្យាបាល និងមុខរបរ" value={person(s.guardian_name, s.guardian_job)} />
            <Field label="លេខទូរសព្ទអាណាព្យាបាល" value={s.phone} />
            <Field label="ជនជាតិភាគតិច" value={s.ethnicity} />
            <Field label="លក្ខណៈពិសេស" value={s.special_features} />
            <Field label="ស្ថានភាពកំព្រា" value={isNone(s.orphan_status) ? null : s.orphan_status} />
            <Field label="ស្ថានភាពក្រីក្រ" value={isNone(s.poor_status) ? null : s.poor_status} />
            <Field label="ផ្សេងៗ" value={s.other_remarks} />
          </dl>
        </Card>
      </div>
    </PageContainer>
  )
}
