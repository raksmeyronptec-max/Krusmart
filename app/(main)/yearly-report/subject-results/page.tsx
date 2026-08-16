import SubjectResultsClient from './SubjectResultsClient'
import { loadAnnualReportData } from '../queries'

export const metadata = { title: 'លទ្ធផលតាមមុខវិជ្ជា' }

export default async function SubjectResultsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  // The roster and letterhead come from the shared loader; the marks are fetched
  // client-side because this report switches period without a navigation.
  const { students, settings, academicYear } = await loadAnnualReportData(searchParams)

  return <SubjectResultsClient students={students} settings={settings} academicYear={academicYear} />
}
