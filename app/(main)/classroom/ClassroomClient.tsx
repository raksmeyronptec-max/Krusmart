'use client'

import { Suspense, useState } from 'react'
import Link from 'next/link'
import {
  BookOpen, CalendarCheck, Check, Edit3, GraduationCap, Plus, Printer,
  Settings2, UserPlus, Users,
} from 'lucide-react'

import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { Badge } from '@/components/ui/feedback/Badge'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { Button } from '@/components/ui/actions/Button'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { useSelectActiveClass } from '@/lib/hooks/useSelectActiveClass'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import type { ClassroomClass } from '@/lib/classroom/classes'
import { useUserRole } from '@/lib/rbac/useUserRole'
import type { GradeOption } from '@/lib/classroom/grades'
import { CreateClassDialog } from './CreateClassDialog'
import { ManageClassDialog } from './ManageClassDialog'

/**
 * ថ្នាក់របស់ខ្ញុំ — one card per class the teacher holds, and the way into each.
 *
 * ── The hub's four cards live here now ─────────────────────────────────────
 *
 * `/classroom` used to be a menu: ថ្នាក់របស់ខ្ញុំ, សិស្សក្នុងថ្នាក់, បញ្ចូលសិស្សថ្មី, មុខវិជ្ជា.
 * Three of those only mean anything *about a class*, so they moved onto the
 * card, where each carries `?class=` and names the class it will open. A menu
 * item that says "សិស្សក្នុងថ្នាក់" without saying which class is a question, not
 * a link.
 *
 * They are still links to the routes that already own those screens — nothing
 * was relocated under `/classroom/`.
 *
 * ── There is no second class switcher here ─────────────────────────────────
 *
 * "ជ្រើសជាថ្នាក់សកម្ម" calls `useSelectActiveClass`, the same hook
 * `ClassContextSwitcher` in the top bar calls, which writes `TeacherContext` and
 * `?class=` together. Two surfaces with their own idea of the active class is
 * exactly the failure this avoids — so this one owns no selection state at all.
 *
 * The active class is known twice over, on purpose. The server passed
 * `activeClassId` from `resolveServerScope`, which is what the *data* on every
 * other screen is scoped by; the context knows what the *client* has selected
 * since. They agree except in the moment between clicking and the router
 * settling, and the context is the fresher of the two, so it wins when present.
 */
interface ClassroomClientProps {
  classes: ClassroomClass[]
  activeClassId: string | null
  loadFailed: boolean
  grades: GradeOption[]
  years: { id: string; name: string }[]
}

function ClassroomClientInner({
  classes,
  activeClassId,
  loadFailed,
  grades,
  years,
}: ClassroomClientProps) {
  const selectAssignment = useSelectActiveClass()
  const { classId: contextClassId, loading } = useActiveClass()
  const [creating, setCreating] = useState(false)
  const [managing, setManaging] = useState<ClassroomClass | null>(null)

  /*
   * The same line the server draws, so the card does not offer a control that
   * would be refused. `classes` and `teacher_assignments` carry admin-only
   * write policies (00003): a self-serve teacher passes because
   * `create_teacher_organisation` made them `owner` of their own school, while
   * a teacher who joined someone else's school holds plain `teacher`, which the
   * permission table gives `classes` read-only. `requirePermission` in
   * `actions.ts` is the enforcement; this only decides what to show.
   */
  const { can } = useUserRole()
  const canManage = can('classes:update')

  const active = contextClassId ?? activeClassId

  // A teacher with no organisation holds no grade to create a class under, and
  // `createClassAndAssign` would refuse. Offering the button anyway would be a
  // control that cannot work; the empty state names the missing step instead.
  const canCreate = grades.length > 0 && years.length > 0

  return (
    <PageContainer>
      <PageHeader
        title="ថ្នាក់របស់ខ្ញុំ"
        description="បង្កើតថ្នាក់ គ្រប់គ្រងបញ្ជីសិស្ស និងកំណត់មុខវិជ្ជា"
        actions={
          canCreate && classes.length > 0 ? (
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
              បង្កើតថ្នាក់ថ្មី
            </Button>
          ) : null
        }
      />

      <p className="mb-4 text-sm font-bold text-text-body">
        ឆ្នាំសិក្សា {getCurrentAcademicYear()}
        {classes.length > 0 && (
          <span className="font-normal text-text-muted">
            {' '}· ថ្នាក់ {toKhmerNumber(classes.length)}
          </span>
        )}
      </p>

      {loadFailed ? (
        <div className="rounded-xl border border-divider bg-bg-surface">
          <EmptyState
            kind="error"
            title="មិនអាចទាញយកបញ្ជីថ្នាក់បានទេ"
            description="សូមផ្ទុកទំព័រឡើងវិញ។ បើនៅតែមិនបាន សូមពិនិត្យការតភ្ជាប់អ៊ីនធឺណិត។"
          />
        </div>
      ) : classes.length === 0 ? (
        /*
          A teacher with no active class. Deliberately *not* a redirect back to
          `/onboarding/class`: that wizard runs once, and this screen is the
          ongoing entry point — a teacher who archived their last class must be
          able to create the next one from here.
        */
        <div className="rounded-xl border border-divider bg-bg-surface">
          <EmptyState
            kind="empty"
            title="អ្នកមិនទាន់មានថ្នាក់នៅឡើយទេ"
            description={
              canCreate
                ? 'បង្កើតថ្នាក់ដំបូងរបស់អ្នក ដើម្បីចាប់ផ្តើមបញ្ចូលសិស្ស វត្តមាន និងពិន្ទុ។'
                : 'អ្នកត្រូវបង្កើតស្ថាប័នរបស់អ្នកជាមុនសិន មុននឹងបង្កើតថ្នាក់បាន។'
            }
            action={
              canCreate ? (
                <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreating(true)}>
                  បង្កើតថ្នាក់ថ្មី
                </Button>
              ) : (
                <Link
                  href="/onboarding/organisation"
                  className="inline-flex min-h-11 items-center rounded-lg bg-brand px-4 text-sm font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  បង្កើតស្ថាប័ន
                </Link>
              )
            }
          />
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {classes.map((cls) => (
            <li key={cls.classId}>
              <ClassCard
                cls={cls}
                isActive={cls.classId === active}
                selecting={loading}
                onSelect={() => selectAssignment(cls.assignmentId)}
                onManage={canManage ? () => setManaging(cls) : undefined}
              />
            </li>
          ))}
        </ul>
      )}

      <CreateClassDialog
        open={creating}
        onClose={() => setCreating(false)}
        grades={grades}
        years={years}
      />

      <ManageClassDialog
        cls={managing}
        open={managing !== null}
        onClose={() => setManaging(null)}
      />
    </PageContainer>
  )
}

/**
 * The screens that only mean something about a particular class.
 *
 * The first three are the old hub's cards. The last three are the class's
 * *day*: attendance, marks, and the documents that come out of them. They are
 * here because the card is where a teacher decides which class they are
 * working on, and making them go via the sidebar afterwards is where the class
 * used to get lost — the trip through the menu dropped `?class=` entirely.
 * That is fixed at the shell now, but the shorter route is still the right
 * one: pick the class and start the work in one click, not two.
 *
 * Six is the ceiling. A seventh turns the card back into the menu this page
 * was built to replace.
 */
const CLASS_TOOLS = [
  { label: 'បញ្ជីសិស្ស', href: '/student-list', icon: Users },
  { label: 'បញ្ចូលសិស្ស', href: '/enrollment', icon: UserPlus },
  { label: 'មុខវិជ្ជា', href: '/score/subjects', icon: BookOpen },
  { label: 'វត្តមាន', href: '/attendance/monthly', icon: CalendarCheck },
  { label: 'បញ្ចូលពិន្ទុ', href: '/score/enter', icon: Edit3 },
  { label: 'បោះពុម្ព', href: '/print-center', icon: Printer },
] as const

function ClassCard({
  cls,
  isActive,
  selecting,
  onSelect,
  onManage,
}: {
  cls: ClassroomClass
  isActive: boolean
  selecting: boolean
  onSelect: () => void
  /** Absent when the teacher may not write to `classes` — see `canManage`. */
  onManage?: () => void
}) {
  // ថ្នាក់ទី៥ · បឋមសិក្សា — skipping whichever a school without the canonical
  // level names does not resolve, rather than printing a stray separator.
  const gradeLine = [cls.gradeName, cls.levelName].filter(Boolean).join(' · ')
  const scoped = (href: string) => `${href}?class=${encodeURIComponent(cls.classId)}`

  return (
    <div
      className={`flex h-full flex-col rounded-xl border bg-bg-surface p-4 shadow-sm transition ${
        isActive ? 'border-brand ring-1 ring-brand' : 'border-divider hover:border-brand-400'
      }`}
    >
      <div className="mb-1.5 flex items-start gap-2">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand dark:bg-brand-900/40">
          <GraduationCap className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-sm font-bold text-text-heading">{cls.className}</h2>
          {gradeLine && <p className="truncate text-xs text-text-muted">{gradeLine}</p>}
        </div>
        {isActive && (
          <Badge variant="success" size="sm">
            ថ្នាក់សកម្ម
          </Badge>
        )}
      </div>

      <dl className="mb-3 space-y-1 text-xs">
        <div className="flex items-center gap-1.5">
          <dt className="text-text-muted">ឆ្នាំសិក្សា</dt>
          <dd className="font-bold text-text-body">{cls.academicYearName || '—'}</dd>
        </div>
        <div className="flex items-center gap-1.5">
          <dt className="sr-only">ចំនួនសិស្ស</dt>
          <dd className="flex items-center gap-1.5 text-text-body">
            <Users className="h-3.5 w-3.5 text-text-muted" aria-hidden="true" />
            សិស្ស <span className="font-bold tabular-nums">{toKhmerNumber(cls.studentCount)}</span> នាក់
          </dd>
        </div>
        {/*
          What this teacher *is* to the class, which decides what every other
          screen will show them: a homeroom teacher marks the whole curriculum,
          a subject teacher sees only their own subjects on `/score/enter` and
          only their own columns on the totals table. Saying it on the card
          means a missing subject two clicks later reads as somebody else's
          responsibility rather than as a bug.

          The subjects are counted, not named — see `ClassroomClass.subjectKeys`
          for why naming them would be an N+1 on this page.
        */}
        <div>
          <dt className="sr-only">តួនាទី</dt>
          <dd className="flex flex-wrap items-center gap-1.5">
            {cls.isHomeroom ? (
              <Badge variant="info" size="sm">គ្រូបន្ទុកថ្នាក់</Badge>
            ) : (
              <Badge variant="muted" size="sm">គ្រូមុខវិជ្ជា</Badge>
            )}
            {cls.subjectKeys.length > 0 && (
              <span className="text-text-muted">
                មុខវិជ្ជា {toKhmerNumber(cls.subjectKeys.length)}
              </span>
            )}
          </dd>
        </div>
      </dl>

      {/*
        The old hub's cards, attached to the class they act on. Real anchors, not
        buttons with a router push: they open in a new tab on a middle click and
        show their target in the status bar. `?class=` scopes the screen without
        disturbing which class the rest of the app considers active — that is
        what the button below is for.
      */}
      <nav aria-label={`ឧបករណ៍សម្រាប់ថ្នាក់ ${cls.className}`} className="mb-3 flex-1">
        <ul className="grid grid-cols-3 gap-1.5">
          {CLASS_TOOLS.map((tool) => (
            <li key={tool.href}>
              <Link
                href={scoped(tool.href)}
                className="flex min-h-11 flex-col items-center justify-center gap-1 rounded-lg border border-divider px-1 py-1.5 text-[11px] font-bold text-text-body transition hover:border-brand-400 hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <tool.icon className="h-4 w-4 text-text-muted" aria-hidden="true" />
                <span className="truncate">{tool.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <div className="flex flex-wrap items-center gap-2 border-t border-divider pt-3">
        {isActive ? (
          <span className="inline-flex min-h-11 items-center gap-1.5 text-[13px] font-bold text-success sm:min-h-8">
            <Check className="h-3.5 w-3.5" aria-hidden="true" />
            កំពុងប្រើ
          </span>
        ) : (
          <Button variant="secondary" size="sm" onClick={onSelect} disabled={selecting}>
            ជ្រើសជាថ្នាក់សកម្ម
          </Button>
        )}
        {onManage && (
          <button
            type="button"
            onClick={onManage}
            aria-label={`កែថ្នាក់ ${cls.className}`}
            className="ml-auto inline-flex min-h-11 items-center gap-1.5 rounded-lg px-2 text-[13px] font-bold text-text-muted transition hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:min-h-8"
          >
            <Settings2 className="h-3.5 w-3.5" aria-hidden="true" />
            កែ
          </button>
        )}
      </div>
    </div>
  )
}

/**
 * `useSelectActiveClass` reads `useSearchParams`, which opts the tree into
 * client rendering and which Next.js refuses to prerender without a boundary.
 * Same reason `ClassContextSwitcher` carries one.
 */
export default function ClassroomClient(props: ClassroomClientProps) {
  return (
    <Suspense fallback={null}>
      <ClassroomClientInner {...props} />
    </Suspense>
  )
}
