import { getAdminScope, getTeachers, getClasses, getSubjects, getStaffOptions } from '../queries'
import { AdminPage, NoSchool } from '../AdminPage'
import { TeachersTable } from './TeachersTable'
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
          <input type="checkbox" name="is_homeroom" className="h-4 w-4 rounded border-divider" />
          <span className="text-sm font-bold text-text-body">ជាគ្រូបន្ទុកថ្នាក់</span>
        </label>
      </AdminCreateForm>

      <TeachersTable teachers={teachers} />
    </AdminPage>
  )
}
