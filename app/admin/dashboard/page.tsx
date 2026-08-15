import { getAdminScope, getSchoolStats, getAdminSchool, getAuditLogs } from '../queries'
import { AdminPage, NoSchool } from '../AdminPage'
import { GraduationCap, Users, BookOpenCheck, LayoutDashboard, CheckSquare, BarChart2 } from 'lucide-react'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

/**
 * School-wide overview.
 *
 * Replaces the mock constants this page previously rendered (AUDIT.md D3) with
 * real aggregates scoped to the administrator's own school.
 */
export default async function AdminDashboardPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const [school, stats, recent] = await Promise.all([
    getAdminSchool(),
    getSchoolStats(scope),
    getAuditLogs(scope, 8),
  ])

  const cards = [
    { label: 'សិស្សសរុប', value: toKhmerNumber(stats.students), icon: GraduationCap, tone: 'bg-brand-100 text-brand' },
    { label: 'គ្រូបង្រៀន', value: toKhmerNumber(stats.teachers), icon: Users, tone: 'bg-success/10 text-success' },
    { label: 'ថ្នាក់រៀន', value: toKhmerNumber(stats.classes), icon: LayoutDashboard, tone: 'bg-brand-100 text-brand' },
    { label: 'មុខវិជ្ជា', value: toKhmerNumber(stats.subjects), icon: BookOpenCheck, tone: 'bg-warning/10 text-warning' },
    {
      label: 'អត្រាវត្តមាន',
      value: stats.attendanceRate === null ? '—' : `${toKhmerNumber(stats.attendanceRate)}%`,
      icon: CheckSquare, tone: 'bg-brand-100 text-brand-500',
    },
    {
      label: 'មធ្យមភាគសរុប',
      value: stats.averageScore === null ? '—' : toKhmerNumber(stats.averageScore),
      icon: BarChart2, tone: 'bg-danger/10 text-danger',
    },
  ]

  return (
    <AdminPage
      title={school?.name || 'ផ្ទាំងទិន្នន័យរួម'}
      description={scope.activeYear ? `ឆ្នាំសិក្សា ${scope.activeYear.name}` : 'មិនទាន់មានឆ្នាំសិក្សា'}
    >
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-divider bg-white p-5 shadow-sm">
            <div className={`mb-3 inline-flex h-10 w-10 items-center justify-center rounded-xl ${c.tone}`}>
              <c.icon className="h-5 w-5" aria-hidden="true" />
            </div>
            <p className="text-sm text-text-muted">{c.label}</p>
            <p className="mt-1 text-2xl font-bold text-text-heading">{c.value}</p>
          </div>
        ))}
      </div>

      <section className="rounded-xl border border-divider bg-white p-6 shadow-sm">
        <h2 className="mb-4 font-bold text-text-heading">សកម្មភាពថ្មីៗ</h2>
        {recent.length === 0 ? (
          <p className="py-8 text-center text-sm text-text-muted">មិនទាន់មានសកម្មភាពត្រូវបានកត់ត្រាទេ</p>
        ) : (
          <ul className="divide-y divide-divider">
            {recent.map((log) => (
              <li key={log.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <span className="font-medium text-text-body">{log.action}</span>
                <span className="shrink-0 text-xs text-text-muted">
                  {new Date(log.created_at).toLocaleString('km-KH')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </AdminPage>
  )
}
