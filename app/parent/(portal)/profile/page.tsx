import { childIdFromSearchParams, resolveActiveChild } from '../../queries'
import ProfileClient from './ProfileClient'

export default async function ParentProfilePage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { child } = await resolveActiveChild(await childIdFromSearchParams(searchParams))
  return <ProfileClient student={child?.student ?? null} />
}
