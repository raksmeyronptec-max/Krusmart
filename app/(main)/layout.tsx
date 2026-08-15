import { redirect } from 'next/navigation'
import { TopNav } from '@/components/TopNav'
import { resolveActor } from '@/lib/rbac/actor'
import { SchoolContextProvider } from '@/lib/context/SchoolContext'
import { TeacherContextProvider } from '@/lib/context/TeacherContext'

/**
 * Shell for the teacher app.
 *
 * `TopNav` is rendered here rather than by each page (Phase 4). Two consequences
 * worth knowing:
 *
 *  - It now appears on all ~26 features, including the ~12 that never had it.
 *    `TopNav` carries `no-print print:hidden` so it stays out of every printed
 *    certificate, ID card, report and attendance sheet.
 *  - Pages keep their own in-content back links. Those are redundant beside the
 *    global bar but harmless, and removing them would be a visual change beyond
 *    this phase.
 *
 * Both context providers wrap the whole tree so the class switcher inside
 * `TopNav` and any feature page can read the same selection. Neither provider
 * blocks rendering: a pre-V2 account resolves to `isLegacy` and every page keeps
 * working off `teacher_id`.
 */
export default async function MainLayout({
  children,
}: {
  children: React.ReactNode
}) {
  // A parent signing in used to land here, on the full teacher dashboard,
  // because `getUserRoles()` defaults a role-less account to 'teacher' — and a
  // parent has no `user_roles` row. The pages rendered empty (every query is
  // scoped by `teacher_id`), but offering a teacher's tools to a parent at all
  // was wrong. `resolveActor` keys on the parent link instead of the absence
  // of a role, so legacy teacher accounts are unaffected.
  const actor = await resolveActor()
  if (actor?.kind === 'parent') redirect('/parent/dashboard')

  return (
    <SchoolContextProvider>
      <TeacherContextProvider>
        <div className="min-h-screen bg-bg-app transition-colors">
          <TopNav />
          <main>
            {children}
          </main>
        </div>
      </TeacherContextProvider>
    </SchoolContextProvider>
  )
}
