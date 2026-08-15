'use client'

import { User, Users, Heart } from 'lucide-react'
import { PortalHeader, InfoRow } from '../../PortalHeader'
import { useParent } from '../../ParentContext'
import type { Student } from '@/lib/types'

export default function FamilyClient({ student }: { student: Student | null }) {
  const { t } = useParent()
  if (!student) return <PortalHeader titleKey="family_title" />

  const people = [
    { labelKey: 'father'   as const, name: student.father_name,   job: student.father_job,   Icon: User,  tone: 'text-pp-info',  bg: 'bg-pp-info/10' },
    { labelKey: 'mother'   as const, name: student.mother_name,   job: student.mother_job,   Icon: Heart, tone: 'text-pp-gold',  bg: 'bg-pp-gold/10' },
    { labelKey: 'guardian' as const, name: student.guardian_name, job: student.guardian_job, Icon: Users, tone: 'text-pp-warning', bg: 'bg-pp-warning/10' },
  ]

  return (
    <>
      <PortalHeader titleKey="family_title" subtitle={student.name_kh} />

      <section className="space-y-4 px-4 py-6">
        {people.map((p) => (
          <article key={p.labelKey} className="rounded-2xl border bg-card-dark p-4" style={{ borderColor: 'var(--pp-card-border)' }}>
            <div className="mb-3 flex items-center gap-3">
              <span className={`flex h-11 w-11 items-center justify-center rounded-xl ${p.bg}`}>
                <p.Icon className={`h-5 w-5 ${p.tone}`} aria-hidden="true" />
              </span>
              <h2 className="font-bold text-pp">{t(p.labelKey)}</h2>
            </div>
            <div className="px-1">
              <InfoRow label={t('full_name')}  value={p.name} />
              <InfoRow label={t('occupation')} value={p.job} />
            </div>
          </article>
        ))}
      </section>
    </>
  )
}
