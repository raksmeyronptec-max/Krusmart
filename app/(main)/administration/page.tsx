import { redirect } from 'next/navigation'
import AdministrationClient from './AdministrationClient'
import { resolveActor } from '@/lib/rbac/actor'

/**
 * The principal's school-wide analytics view.
 *
 * It lives under `(main)` rather than `app/admin/`, so it never inherited the
 * admin console's role gate — any signed-in account, including a parent, could
 * open it. The data is still mock constants, but the surface is a principal's,
 * so it takes the same check the console does.
 */
export default async function AdministrationPage() {
  const actor = await resolveActor()

  if (!actor) redirect('/login')
  if (actor.kind === 'parent') redirect('/parent/dashboard')
  if (actor.kind !== 'admin') redirect('/dashboard')

  return <AdministrationClient />
}
