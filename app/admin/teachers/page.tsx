import { getAdminScope, getTeachers, getClasses, getSubjects, getStaffOptions } from '../queries'
import { AdminPage, EmptyState, NoSchool } from '../AdminPage'
import { AdminCreateForm, SelectField } from '../AdminForm'
import { assignTeacher } from '../actions'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

export default async function AdminTeachersPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const [teachers, classes, subjects, staff] = await Promise.all([
    getTeachers(scope), getClasses(scope), getSubjects(scope), getStaffOptions(scope),
  ])

  return (
    <AdminPage
      title="គ្រប់គ្រងគ្រូបង្រៀន"
      description={`គ្រូបង្រៀនសរុប ${toKhmerNumber(teachers.length)} នាក់`}
    >
      <AdminCreateForm title="ចាត់តាំងគ្រូទៅថ្នាក់" submitLabel="ចាត់តាំង" action={assignTeacher}>
        <SelectField
          label="គ្រូបង្រៀន"
          name="teacher_id"
          required
          options={staff.map((p) => ({ value: p.id, label: p.label }))}
        />
        <SelectField
          label="ថ្នាក់"
          name="class_id"
          required
          options={classes.map((c) => ({ value: c.id, label: `${c.gradeName} › ${c.name}` }))}
        />
        <SelectField
          label="មុខវិជ្ជា (ទុកទទេ = គ្រូបន្ទុកថ្នាក់)"
          name="subject_id"
          placeholder="គ្មាន (គ្រូបន្ទុកថ្នាក់)"
          options={subjects.map((s) => ({ value: s.id, label: s.name }))}
        />
        <label className="flex items-center gap-2 self-end pb-2">
          <input type="checkbox" name="is_homeroom" className="h-4 w-4 rounded border-gray-300" />
          <span className="text-sm font-bold text-gray-700">ជាគ្រូបន្ទុកថ្នាក់</span>
        </label>
      </AdminCreateForm>

      {teachers.length === 0 ? (
        <EmptyState message="មិនទាន់មានគ្រូបង្រៀនត្រូវបានចាត់តាំងក្នុងឆ្នាំសិក្សានេះទេ" />
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="p-4 font-bold text-gray-700">ឈ្មោះគ្រូ</th>
                <th className="p-4 font-bold text-gray-700">ថ្នាក់ទទួលបន្ទុក</th>
                <th className="p-4 font-bold text-gray-700">គ្រូបន្ទុកថ្នាក់</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {teachers.map((t) => (
                <tr key={t.teacherId} className="hover:bg-slate-50">
                  <td className="p-4 font-medium text-gray-800">
                    {t.fullName || <span className="text-gray-400">(មិនទាន់មានឈ្មោះ)</span>}
                  </td>
                  <td className="p-4 text-gray-600">{t.classes.join(', ') || '—'}</td>
                  <td className="p-4">
                    {t.isHomeroom
                      ? <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-bold text-emerald-700">បាទ/ចាស</span>
                      : <span className="text-gray-400">ទេ</span>}
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
