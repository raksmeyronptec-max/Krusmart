'use client'

import { PortalHeader, InfoRow } from '../../PortalHeader'
import { useParent } from '../../ParentContext'
import { calculateAge, formatKhmerDate } from '@/lib/utils/date'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { Student } from '@/lib/types'

export default function ProfileClient({ student }: { student: Student | null }) {
  const { t } = useParent()
  if (!student) return <PortalHeader titleKey="profile_title" />

  const place = [student.birth_village, student.birth_commune, student.birth_district, student.birth_province]
    .filter(Boolean).join(' ')
  const current = [student.curr_village, student.curr_commune, student.curr_district, student.curr_province]
    .filter(Boolean).join(' ')
  const age = calculateAge(student.dob)

  return (
    <>
      <PortalHeader titleKey="profile_title" subtitle={student.name_kh} />

      <section className="px-4 py-6">
        <div className="mb-5 flex flex-col items-center rounded-2xl border bg-card-dark p-6" style={{ borderColor: 'var(--pp-card-border)' }}>
          <div className="mb-3 h-24 w-24 overflow-hidden rounded-full border-4" style={{ borderColor: 'var(--pp-accent)' }}>
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote avatar */}
            <img
              src={student.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student.id}&backgroundColor=b6e3f4`}
              alt={student.name_kh}
              className="h-full w-full object-cover"
            />
          </div>
          <h2 className="kh-moul text-xl text-pp">{student.name_kh}</h2>
          {student.name_en && <p className="text-sm text-pp-muted">{student.name_en}</p>}
          {age !== null && <p className="mt-1 text-xs text-pp-muted">{toKhmerNumber(age)} ឆ្នាំ</p>}
        </div>

        <div className="rounded-2xl border bg-card-dark px-4" style={{ borderColor: 'var(--pp-card-border)' }}>
          <InfoRow label={t('student_id')}  value={student.student_id} />
          <InfoRow label={t('class_label')} value={student.grade} />
          <InfoRow label={t('gender')}      value={student.gender} />
          <InfoRow label={t('dob')}         value={formatKhmerDate(student.dob)} />
          <InfoRow label={t('phone')}       value={student.phone} />
          <InfoRow label={t('birth_place')} value={place} />
          <InfoRow label={t('address')}     value={current} />
        </div>
      </section>
    </>
  )
}
