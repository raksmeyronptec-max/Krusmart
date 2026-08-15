import { redirect } from 'next/navigation'
import { resolveActor, homeRouteFor } from '@/lib/rbac/actor'

/**
 * Entry point. Sends each account to its own app rather than assuming the
 * teacher dashboard — a parent hitting `/` used to be dropped into the teacher
 * tree. Signed-out visitors fall through to `/dashboard`, which `proxy.ts`
 * redirects to `/login`.
 */
export default async function Home() {
  const actor = await resolveActor()
  redirect(actor ? homeRouteFor(actor.kind) : '/dashboard')
}
