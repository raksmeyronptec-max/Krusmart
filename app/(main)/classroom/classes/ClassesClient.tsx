'use client'

import { Suspense } from 'react'
import Link from 'next/link'
import { Check, GraduationCap, Users } from 'lucide-react'

import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { Badge } from '@/components/ui/feedback/Badge'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { Button } from '@/components/ui/actions/Button'
import { useActiveClass } from '@/lib/hooks/useActiveClass'
import { useSelectActiveClass } from '@/lib/hooks/useSelectActiveClass'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { ClassroomClass } from '@/lib/classroom/classes'

/**
 * ថ្នាក់របស់ខ្ញុំ — one card per class the teacher holds.
 *
 * ★ There is no second class switcher here. The "ជ្រើសជាថ្នាក់សកម្ម" button
 * calls `useSelectActiveClass`, the same hook `ClassContextSwitcher` in the top
 * bar calls, which writes `TeacherContext` and `?class=` together. Two surfaces
 * with their own idea of the active class is exactly the failure this avoids —
 * so this one owns no selection state at all.
 *
 * The active class is known twice over, on purpose. The server passed
 * `activeClassId` from `resolveServerScope`, which is what the *data* on every
 * other screen is scoped by; the context knows what the *client* has selected
 * since. They agree except in the moment between clicking and the router
 * settling, and the context is the fresher of the two, so it wins when present.
 */
function ClassesClientInner({
  classes,
  activeClassId,
  loadFailed,
}: {
  classes: ClassroomClass[]
  activeClassId: string | null
  loadFailed: boolean
}) {
  const selectAssignment = useSelectActiveClass()
  const { classId: contextClassId, loading } = useActiveClass()

  const active = contextClassId ?? activeClassId

  return (
    <PageContainer>
      <PageHeader
        title="ថ្នាក់របស់ខ្ញុំ"
        description="ថ្នាក់ដែលអ្នកទទួលបន្ទុក ឬបង្រៀន"
      />

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
            description="បង្កើតថ្នាក់ដំបូងរបស់អ្នក ដើម្បីចាប់ផ្តើមបញ្ចូលសិស្ស វត្តមាន និងពិន្ទុ។"
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
              />
            </li>
          ))}
        </ul>
      )}
    </PageContainer>
  )
}

function ClassCard({
  cls,
  isActive,
  selecting,
  onSelect,
}: {
  cls: ClassroomClass
  isActive: boolean
  selecting: boolean
  onSelect: () => void
}) {
  // ថ្នាក់ទី៥ · បឋមសិក្សា — skipping whichever a school without the canonical
  // level names does not resolve, rather than printing a stray separator.
  const gradeLine = [cls.gradeName, cls.levelName].filter(Boolean).join(' · ')

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

      <dl className="mb-3 flex-1 space-y-1 text-xs">
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
        {cls.isHomeroom && (
          <div>
            <dt className="sr-only">តួនាទី</dt>
            <dd>
              <Badge variant="info" size="sm">
                គ្រូបន្ទុកថ្នាក់
              </Badge>
            </dd>
          </div>
        )}
      </dl>

      <div className="flex flex-wrap items-center gap-2">
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
        {/*
          A real link, not a button with a router push: it opens in a new tab on
          a middle click and shows its target in the status bar. `?class=` scopes
          the roster without disturbing the active selection.
        */}
        <Link
          href={`/student-list?class=${encodeURIComponent(cls.classId)}`}
          className="inline-flex min-h-11 items-center rounded-lg px-2 text-[13px] font-bold text-text-body underline-offset-2 transition hover:text-brand hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring sm:min-h-8"
        >
          មើលបញ្ជីសិស្ស
        </Link>
      </div>
    </div>
  )
}

/**
 * `useSelectActiveClass` reads `useSearchParams`, which opts the tree into
 * client rendering and which Next.js refuses to prerender without a boundary.
 * Same reason `ClassContextSwitcher` carries one.
 */
export default function ClassesClient(props: {
  classes: ClassroomClass[]
  activeClassId: string | null
  loadFailed: boolean
}) {
  return (
    <Suspense fallback={null}>
      <ClassesClientInner {...props} />
    </Suspense>
  )
}
