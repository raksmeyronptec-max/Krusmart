import { getAdminScope, getClasses, getGradeOptions } from '../queries'
import { AdminPage, EmptyState, NoSchool } from '../AdminPage'
import { AdminCreateForm, Field, SelectField } from '../AdminForm'
import { createClass } from '../actions'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

export default async function AdminClassesPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const [classes, grades] = await Promise.all([getClasses(scope), getGradeOptions(scope)])
  const totalStudents = classes.reduce((sum, c) => sum + c.studentCount, 0)

  return (
    <AdminPage
      title="គ្រប់គ្រងថ្នាក់រៀន"
      description={`ថ្នាក់សរុប ${toKhmerNumber(classes.length)} · សិស្សសរុប ${toKhmerNumber(totalStudents)}`}
    >
      <AdminCreateForm title="បង្កើតថ្នាក់ថ្មី" action={createClass}>
        <Field label="ឈ្មោះថ្នាក់" name="name" required placeholder="ឧ. ១ក" />
        <SelectField
          label="កម្រិតថ្នាក់"
          name="grade_id"
          required
          options={grades.map((g) => ({ value: g.id, label: `${g.levelName} › ${g.name}` }))}
        />
        <SelectField
          label="ឆ្នាំសិក្សា"
          name="academic_year_id"
          required
          options={scope.years.map((y) => ({ value: y.id, label: y.name }))}
        />
        <Field label="ចំណុះអតិបរមា" name="capacity" type="number" placeholder="ឧ. 45" />
      </AdminCreateForm>

      {classes.length === 0 ? (
        <EmptyState message="មិនទាន់មានថ្នាក់រៀនក្នុងឆ្នាំសិក្សានេះទេ" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-4 font-bold text-gray-700">ថ្នាក់</th>
                <th className="p-4 font-bold text-gray-700">កម្រិត</th>
                <th className="p-4 font-bold text-gray-700">ដំណាក់កាល</th>
                <th className="p-4 text-right font-bold text-gray-700">ចំនួនសិស្ស</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {classes.map((c) => (
                <tr key={c.id} className="hover:bg-slate-50">
                  <td className="p-4 font-bold text-gray-800">{c.name}</td>
                  <td className="p-4 text-gray-600">{c.gradeName || '—'}</td>
                  <td className="p-4 text-gray-600">{c.levelName || '—'}</td>
                  <td className="p-4 text-right font-medium text-gray-800">{toKhmerNumber(c.studentCount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AdminPage>
  )
}
