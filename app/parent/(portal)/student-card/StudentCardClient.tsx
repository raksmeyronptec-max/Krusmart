'use client'

import { PortalHeader } from '../../PortalHeader'
import { useParent } from '../../ParentContext'
import { formatKhmerDate, } from '@/lib/utils/date'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { Settings, Student } from '@/lib/types'

/** ID card, mirroring the legacy portal's 100mm x 140mm layout scaled to fit a phone. */
export default function StudentCardClient({
  student, settings,
}: {
  student: Student | null
  settings: Settings | null
}) {
  const { t } = useParent()
  if (!student) return <PortalHeader titleKey="card_title" />

  return (
    <>
      <PortalHeader titleKey="card_title" subtitle={student.name_kh} />

      <section className="px-4 py-6">
        <div className="mx-auto w-full max-w-[340px] overflow-hidden rounded-3xl bg-header-green p-1 shadow-2xl">
          <div className="rounded-[1.4rem] bg-white p-5 text-center text-[var(--pp-bg-app)]">
            <p className="kh-moul text-[13px] leading-tight text-[var(--pp-info)]">
              {settings?.school_name || t('school_name_default')}
            </p>
            <p className="mb-4 text-[10px] text-pp-muted">
              {t('academic_year_default')} {toKhmerNumber(settings?.academic_year || '')}
            </p>

            <div className="mx-auto mb-3 h-28 w-24 overflow-hidden rounded-xl border-2 border-[var(--pp-info)] bg-[var(--pp-bg-card)]">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote photo on a card surface */}
              <img
                src={student.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.id}&backgroundColor=b6e3f4`}
                alt={student.name_kh}
                className="h-full w-full object-cover"
              />
            </div>

            <h2 className="kh-moul text-lg text-[var(--pp-bg-app)]">{student.name_kh}</h2>
            {student.name_en && <p className="mb-3 text-[11px] uppercase tracking-wide text-pp-muted">{student.name_en}</p>}

            <dl className="mt-3 space-y-1.5 text-left text-[12px]">
              {[
                [t('student_id'), student.student_id],
                [t('class_label'), student.grade],
                [t('gender'), student.gender],
                [t('dob'), formatKhmerDate(student.dob)],
              ].map(([label, value]) => (
                <div key={label} className="flex justify-between gap-3 border-b border-dashed border-pp pb-1">
                  <dt className="text-pp-muted">{label}</dt>
                  <dd className="font-bold">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          </div>
        </div>
      </section>
    </>
  )
}
