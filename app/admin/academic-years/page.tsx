import { getAdminScope } from '../queries'
import { AdminPage, EmptyState, NoSchool } from '../AdminPage'
import { AdminCreateForm, Field } from '../AdminForm'
import { createAcademicYear } from '../actions'
import ActivateYearButton from './ActivateYearButton'

export default async function AdminAcademicYearsPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  return (
    <AdminPage title="ឆ្នាំសិក្សា" description="ឆ្នាំសិក្សាទាំងអស់របស់សាលា">
      <AdminCreateForm title="បង្កើតឆ្នាំសិក្សាថ្មី" action={createAcademicYear}>
        <Field label="ឈ្មោះឆ្នាំសិក្សា" name="name" required placeholder="ឧ. 2026-2027" />
        <div className="hidden sm:block" />
        <Field label="ថ្ងៃចាប់ផ្តើម" name="start_date" type="date" />
        <Field label="ថ្ងៃបញ្ចប់" name="end_date" type="date" />
      </AdminCreateForm>

      {scope.years.length === 0 ? (
        <EmptyState message="មិនទាន់មានឆ្នាំសិក្សាទេ" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-4 font-bold text-gray-700">ឆ្នាំសិក្សា</th>
                <th className="p-4 font-bold text-gray-700">ចាប់ផ្តើម</th>
                <th className="p-4 font-bold text-gray-700">បញ្ចប់</th>
                <th className="p-4 font-bold text-gray-700">ស្ថានភាព</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {scope.years.map((y) => (
                <tr key={y.id} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-gray-800">{y.name}</td>
                  <td className="p-4 text-gray-600">{y.start_date || '—'}</td>
                  <td className="p-4 text-gray-600">{y.end_date || '—'}</td>
                  <td className="p-4">
                    {y.is_active
                      ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">កំពុងប្រើប្រាស់</span>
                      : <ActivateYearButton yearId={y.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  )
}
