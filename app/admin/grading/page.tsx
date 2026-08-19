import { getAdminScope, getGradingSchemes } from '../queries'
import { AdminPage, EmptyState, NoSchool } from '../AdminPage'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

export default async function AdminGradingPage() {
  const scope = await getAdminScope()
  if (!scope) return <NoSchool />

  const schemes = await getGradingSchemes(scope)

  return (
    <AdminPage
      title="មាត្រដ្ឋាននិទ្ទេស"
      description="មាត្រដ្ឋាននិទ្ទេសតាមកម្រិតសិក្សា"
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

    </AdminPage>
  )
}
