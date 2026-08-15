'use client'

import { BookOpenCheck, CalendarClock } from 'lucide-react'
import { PortalHeader, EmptyState } from '../../PortalHeader'
import { useParent } from '../../ParentContext'
import type { HomeworkAssignment } from '@/lib/types'

export default function HomeworkClient({
  assignments, childName,
}: {
  assignments: HomeworkAssignment[]
  childName: string
}) {
  const { t } = useParent()

  return (
    <>
      <PortalHeader titleKey="homework_title" subtitle={childName} />

      <section className="px-4 py-6">
        {assignments.length === 0 ? (
          <EmptyState messageKey="no_homework" icon={<BookOpenCheck className="h-10 w-10" />} />
        ) : (
          <ul className="space-y-3">
            {assignments.map((a) => {
              const overdue = a.due_date ? new Date(a.due_date) < new Date() : false
              return (
                <li key={a.id} className="rounded-2xl border bg-card-dark p-4" style={{ borderColor: 'var(--pp-card-border)' }}>
                  <div className="mb-2 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <span className="mb-1 inline-block rounded-lg bg-pp-gold/10 px-2 py-0.5 text-[11px] font-bold text-pp-gold">
                        {a.subject}
                      </span>
                      <h3 className="truncate font-bold text-pp">{a.title}</h3>
                    </div>
                  </div>

                  {a.description && <p className="mb-3 text-sm text-pp-muted">{a.description}</p>}

                  {a.image_url && (
                    // eslint-disable-next-line @next/next/no-img-element -- teacher-uploaded photo on a remote host
                    <img src={a.image_url} alt={a.title} className="mb-3 max-h-48 w-full rounded-xl object-cover" />
                  )}

                  <p className={`flex items-center gap-1.5 text-xs font-semibold ${overdue ? 'text-pp-danger' : 'text-pp-muted'}`}>
                    <CalendarClock className="h-3.5 w-3.5" aria-hidden="true" />
                    {t('due_date')}: {a.due_date ? new Date(a.due_date).toLocaleDateString('km-KH') : '—'}
                  </p>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </>
  )
}
