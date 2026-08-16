import PromotionListClient from '../PromotionListClient'
import { loadAnnualReportData } from '../queries'

export const metadata = { title: 'សិស្សត្រួតថ្នាក់' }

export default async function RepeatedStudentsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const { students, annualScores, settings, academicYear } = await loadAnnualReportData(searchParams)

  return (
    <PromotionListClient
      mode="repeated"
      students={students}
      annualScores={annualScores}
      settings={settings}
      academicYear={academicYear}
    />
  )
}
