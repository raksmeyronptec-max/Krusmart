import { getAdminSchool, getAdminScope } from '../queries'
import { AdminPage, NoSchool } from '../AdminPage'

export default async function AdminSettingsPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const school = await getAdminSchool()

  const rows: { label: string; value: string | null | undefined }[] = [
    { label: 'ឈ្មោះសាលា', value: school?.name },
    { label: 'លេខកូដសាលា', value: school?.code },
    { label: 'លេខទូរស័ព្ទ', value: school?.phone },
    { label: 'អ៊ីមែល', value: school?.email },
    { label: 'អាសយដ្ឋាន', value: school?.address },
    {
      label: 'ទីតាំង GPS',
      value: school?.location
        ? `${school.location.latitude}, ${school.location.longitude} (ចម្ងាយ ${school.location.radius} ម៉ែត្រ)`
        : null,
    },
  ]

  return (
    <AdminPage title="ការកំណត់សាលា" description="ព័ត៌មានទូទៅរបស់សាលារៀន">
      <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
        <dl className="divide-y divide-gray-100">
          {rows.map((r) => (
            <div key={r.label} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-center">
              <dt className="w-56 shrink-0 text-sm font-bold text-gray-600">{r.label}</dt>
              <dd className="text-sm text-gray-800">
                {r.value || <span className="text-gray-400">មិនទាន់កំណត់</span>}
              </dd>
            </div>
          ))}
        </dl>
      </div>

      <p className="text-center text-xs text-gray-400">
        ការកែសម្រួលព័ត៌មានសាលា នឹងត្រូវបានបន្ថែមនៅដំណាក់កាលបន្ទាប់។
      </p>
    </AdminPage>
  )
}
