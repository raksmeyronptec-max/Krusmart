import { getAdminScope, getSubjects } from '../queries'
import { AdminPage, EmptyState, NoSchool } from '../AdminPage'
import { AdminCreateForm, Field } from '../AdminForm'
import { createSubject } from '../actions'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

export default async function AdminSubjectsPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const subjects = await getSubjects(scope)

  return (
    <AdminPage title="មុខវិជ្ជា" description={`មុខវិជ្ជាសរុប ${toKhmerNumber(subjects.length)}`}>
      <AdminCreateForm title="បង្កើតមុខវិជ្ជាថ្មី" action={createSubject}>
        <Field label="ឈ្មោះមុខវិជ្ជា" name="name" required placeholder="ឧ. គណិតវិទ្យា" />
        <Field label="ឈ្មោះឡាតាំង" name="name_en" placeholder="ឧ. Mathematics" />
        <Field label="លេខកូដ" name="code" placeholder="ឧ. math_num" />
      </AdminCreateForm>

      {subjects.length === 0 ? (
        <EmptyState message="មិនទាន់មានមុខវិជ្ជាទេ" />
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {subjects.map((s) => (
            <div key={s.id} className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <p className="font-bold text-gray-800">{s.name}</p>
              {s.code && <p className="mt-1 font-mono text-xs text-gray-400">{s.code}</p>}
              {!s.is_active && (
                <span className="mt-2 inline-block rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                  មិនប្រើប្រាស់
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </AdminPage>
  )
}
