import { getAdminScope, getTeachers, getClasses, getStaffOptions } from '../queries'
import { AdminPage, NoSchool } from '../AdminPage'
import { TeachersTable } from './TeachersTable'
import { AssignSubjectFields } from './AssignSubjectFields'
import { AdminCreateForm, SelectField } from '../AdminForm'
import { assignTeacher } from '../actions'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

export default async function AdminTeachersPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const [teachers, classes, staff] = await Promise.all([
    getTeachers(scope), getClasses(scope), getStaffOptions(scope),
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
        {/* Class + dependent subject picker: the options are the chosen
            class's resolved template — the same list /score/collect shows —
            not the free-typed `subjects` catalogue. */}
        <AssignSubjectFields
          classes={classes.map((c) => ({ id: c.id, label: `${c.gradeName} › ${c.name}` }))}
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
