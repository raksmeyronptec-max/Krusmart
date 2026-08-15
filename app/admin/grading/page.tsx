import { getAdminScope, getGradingSchemes, getAssessments, getClassSubjectOptions } from '../queries'
import { AdminPage, EmptyState, NoSchool } from '../AdminPage'
import { AdminCreateForm, Field, SelectField } from '../AdminForm'
import { createAssessment } from '../actions'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

/** Assessment types offered by the creation form. */
const ASSESSMENT_TYPES = [
  { value: 'quiz', label: 'សំណួរខ្លី' },
  { value: 'assignment', label: 'កិច្ចការ' },
  { value: 'midterm', label: 'ប្រឡងពាក់កណ្តាលឆមាស' },
  { value: 'final', label: 'ប្រឡងបញ្ចប់' },
  { value: 'project', label: 'គម្រោង' },
  { value: 'monthly', label: 'ប្រចាំខែ' },
  { value: 'semester', label: 'ប្រចាំឆមាស' },
  { value: 'yearly', label: 'ប្រចាំឆ្នាំ' },
]

export default async function AdminGradingPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const [schemes, assessments, classSubjects] = await Promise.all([
    getGradingSchemes(scope),
    getAssessments(scope),
    getClassSubjectOptions(scope),
  ])

  return (
    <AdminPage
      title="ការវាយតម្លៃ និងនិទ្ទេស"
      description="កំណត់មាត្រដ្ឋាននិទ្ទេសតាមកម្រិតសិក្សា និងគ្រប់គ្រងការវាយតម្លៃ"
    >
      <section className="space-y-4">
        <h2 className="font-bold text-text-heading">មាត្រដ្ឋាននិទ្ទេស</h2>
        {schemes.length === 0 ? (
          <EmptyState message="មិនទាន់មានមាត្រដ្ឋាននិទ្ទេសទេ" />
        ) : (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            {schemes.map((s) => (
              <div key={s.id} className="rounded-xl border border-divider bg-white p-5 shadow-sm">
                <div className="mb-3 flex items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-text-heading">{s.levelName}</p>
                    <p className="text-xs text-text-muted">{s.name}</p>
                  </div>
                  {s.isDefault && (
                    <span className="shrink-0 rounded-full bg-brand-100 px-2 py-0.5 text-xs font-bold text-brand">
                      លំនាំដើម
                    </span>
                  )}
                </div>

                <p className="mb-3 text-xs text-text-muted">
                  ពិន្ទុពេញ {toKhmerNumber(s.config.maxScore)} · ជាប់ពី {toKhmerNumber(s.config.passMark)}
                </p>

                <ul className="space-y-1">
                  {s.config.bands.map((b) => (
                    <li key={b.letter} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span className="inline-flex h-6 w-6 items-center justify-center rounded-md bg-paper text-xs font-bold text-text-body">
                          {b.letter}
                        </span>
                        <span className="text-text-body">{b.label}</span>
                      </span>
                      <span className="font-mono text-xs text-text-muted">
                        {toKhmerNumber(b.min)}–{toKhmerNumber(b.max)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="space-y-4">
        <h2 className="font-bold text-text-heading">ការវាយតម្លៃ</h2>

        <AdminCreateForm title="បង្កើតការវាយតម្លៃថ្មី" action={createAssessment}>
          <Field label="ឈ្មោះការវាយតម្លៃ" name="name" required placeholder="ឧ. ប្រឡងឆមាសទី១" />
          <SelectField
            label="ថ្នាក់ និងមុខវិជ្ជា"
            name="class_subject_id"
            required
            options={classSubjects.map((cs) => ({ value: cs.id, label: cs.label }))}
          />
          <SelectField label="ប្រភេទ" name="type" required options={ASSESSMENT_TYPES} />
          <Field label="ពិន្ទុអតិបរមា" name="max_score" type="number" placeholder="10" />
          <Field label="ទម្ងន់" name="weight" type="number" placeholder="1" />
          <Field label="ថ្ងៃប្រឡង" name="date" type="date" />
        </AdminCreateForm>

        {assessments.length === 0 ? (
          <EmptyState message="មិនទាន់មានការវាយតម្លៃក្នុងឆ្នាំសិក្សានេះទេ" />
        ) : (
          <div className="overflow-x-auto rounded-xl border border-divider bg-white shadow-sm">
            <table className="w-full text-sm">
              <thead className="bg-paper text-left">
                <tr>
                  <th className="p-4 font-bold text-text-body">ឈ្មោះ</th>
                  <th className="p-4 font-bold text-text-body">ថ្នាក់ / មុខវិជ្ជា</th>
                  <th className="p-4 font-bold text-text-body">ប្រភេទ</th>
                  <th className="p-4 text-right font-bold text-text-body">ពិន្ទុពេញ</th>
                  <th className="p-4 text-right font-bold text-text-body">ទម្ងន់</th>
                  <th className="p-4 font-bold text-text-body">ថ្ងៃ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-divider">
                {assessments.map((a) => (
                  <tr key={a.id} className="hover:bg-paper">
                    <td className="p-4 font-bold text-text-heading">{a.name}</td>
                    <td className="p-4 text-text-body">{a.className} › {a.subjectName}</td>
                    <td className="p-4 text-text-body">
                      {ASSESSMENT_TYPES.find((t) => t.value === a.type)?.label ?? a.type}
                    </td>
                    <td className="p-4 text-right text-text-heading">{toKhmerNumber(a.maxScore)}</td>
                    <td className="p-4 text-right text-text-heading">{toKhmerNumber(a.weight)}</td>
                    <td className="p-4 text-xs text-text-muted">{a.date ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </AdminPage>
  )
}
