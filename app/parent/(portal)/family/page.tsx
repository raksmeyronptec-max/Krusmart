import { childIdFromSearchParams, resolveActiveChild } from '../../queries'
import FamilyClient from './FamilyClient'

export default async function ParentFamilyPage({
  searchParams,
}: { searchParams?: Promise<Record<string, string | string[] | undefined>> }) {
  const { child } = await resolveActiveChild(await childIdFromSearchParams(searchParams))
  return <FamilyClient student={child?.student ?? null} />
}
