import { redirect } from 'next/navigation'
import { getUserRoles } from '@/lib/rbac/server'
import { isSchoolAdmin } from '@/lib/rbac/permissions'
import AdminShell from './AdminShell'

/**
 * Server-side authorization gate for the whole principal console.
 *
 * Closes AUDIT.md G-3: until now `app/admin/**` had no role check anywhere, and
 * `proxy.ts` only asserts that *a* session exists — so any signed-in teacher
 * could open the admin tree. That was low impact while these pages rendered
 * mock constants; from this phase on they carry school-wide data.
 *
 * The check runs on the server, before any child renders, so no admin markup or
 * data reaches a browser that is not entitled to it. RLS remains the real
 * boundary on the data itself — this gate is defence in depth, not a substitute.
 */
export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const ctx = await getUserRoles()

  if (!ctx) redirect('/login')

  // A plain teacher lands back on their own dashboard rather than seeing a
  // permission error for a console they were never offered.
  if (!isSchoolAdmin(ctx.roles)) redirect('/dashboard')

  return <AdminShell>{children}</AdminShell>
}
