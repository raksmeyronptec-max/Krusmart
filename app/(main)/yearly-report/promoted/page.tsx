import PromotionListClient from '../PromotionListClient'
import { loadAnnualReportData } from '../queries'

export const metadata = { title: 'សិស្សឡើងថ្នាក់' }

export default async function PromotedStudentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { students, annualScores, settings, academicYear } = await loadAnnualReportData(searchParams)

  return (
    <PromotionListClient
      mode="promoted"
      students={students}
      annualScores={annualScores}
      settings={settings}
      academicYear={academicYear}
    />
  )
}
