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
        <div className="overflow-hidden rounded-xl border border-divider bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-paper text-left">
              <tr>
                <th className="p-4 font-bold text-text-body">ឆ្នាំសិក្សា</th>
                <th className="p-4 font-bold text-text-body">ចាប់ផ្តើម</th>
                <th className="p-4 font-bold text-text-body">បញ្ចប់</th>
                <th className="p-4 font-bold text-text-body">ស្ថានភាព</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-divider">
              {scope.years.map((y) => (
                <tr key={y.id} className="hover:bg-paper">
                  <td className="p-4 font-bold text-text-heading">{y.name}</td>
                  <td className="p-4 text-text-body">{y.start_date || '—'}</td>
                  <td className="p-4 text-text-body">{y.end_date || '—'}</td>
                  <td className="p-4">
                    {y.is_active
                      ? <span className="rounded-full bg-success/10 px-3 py-1 text-xs font-bold text-success">កំពុងប្រើប្រាស់</span>
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
