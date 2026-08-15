'use client'

import Link from 'next/link'
import { useState } from 'react'
import {
  Bell, CalendarCheck, BarChart3, BookOpenCheck, HeartPulse,
  BookUser, Contact2, User, Users, X,
} from 'lucide-react'
import { useParent } from '../../ParentContext'
import type { TranslationKey } from '../../i18n'
import type { Notification, Student } from '@/lib/types'

/** The six tracking cards and two info cards, in the legacy portal's order and colours. */
const TRACKING: { key: TranslationKey; href: string; icon: typeof CalendarCheck; color: string; bg: string }[] = [
  { key: 'track_attendance', href: '/parent/attendance',   icon: CalendarCheck,  color: 'text-orange-400',  bg: 'bg-orange-400/10' },
  { key: 'track_grades',     href: '/parent/grades',       icon: BarChart3,      color: 'text-blue-400',    bg: 'bg-blue-400/10' },
  { key: 'track_homework',   href: '/parent/homework',     icon: BookOpenCheck,  color: 'text-purple-400',  bg: 'bg-purple-400/10' },
  { key: 'track_health',     href: '/parent/health',       icon: HeartPulse,     color: 'text-rose-400',    bg: 'bg-rose-400/10' },
  { key: 'track_library',    href: '/parent/library',      icon: BookUser,       color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
  { key: 'track_card',       href: '/parent/student-card', icon: Contact2,       color: 'text-amber-400',   bg: 'bg-amber-400/10' },
]

const INFO: typeof TRACKING = [
  { key: 'info_profile', href: '/parent/profile', icon: User,  color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
  { key: 'info_family',  href: '/parent/family',  icon: Users, color: 'text-pink-400',   bg: 'bg-pink-400/10' },
]

export default function DashboardClient({
  student,
  schoolName,
  academicYear,
  notifications,
}: {
  student: Student | null
  schoolName: string
  academicYear: string
  notifications: Notification[]
}) {
  const { t } = useParent()
  const [showNotifs, setShowNotifs] = useState(false)

  const Card = ({ item }: { item: (typeof TRACKING)[number] }) => (
    <Link
      href={item.href}
      className="feature-card flex w-full flex-col items-center justify-center gap-3 rounded-2xl border bg-card-dark p-4 text-center outline-none focus-visible:ring-2 focus-visible:ring-emerald-500"
    >
      <span className={`flex h-12 w-12 items-center justify-center rounded-xl ${item.bg}`}>
        <item.icon className={`h-6 w-6 ${item.color}`} aria-hidden="true" />
      </span>
      <span className="text-sm font-semibold text-pp">{t(item.key)}</span>
    </Link>
  )

  return (
    <>
      <header className="relative z-20 rounded-b-[2rem] bg-header-green px-6 pb-6 pt-safe shadow-md">
        <div className="mb-6 flex items-start justify-between pt-2">
          <div>
            <h2 className="text-lg font-bold text-white">{schoolName}</h2>
            <p className="text-xs font-medium text-emerald-100/90">{academicYear}</p>
          </div>

          <button
            onClick={() => setShowNotifs(true)}
            aria-label={t('notif_title')}
            className="tap-target relative rounded-full bg-white/10 p-2 outline-none transition hover:bg-white/20"
          >
            <Bell className="h-6 w-6 text-white" aria-hidden="true" />
            {notifications.length > 0 && (
              <span className="absolute right-1 top-1 flex h-2.5 w-2.5">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-400 opacity-75" />
                <span className="relative inline-flex h-2.5 w-2.5 rounded-full border border-emerald-800 bg-red-500" />
              </span>
            )}
          </button>
        </div>

        <div className="flex items-center gap-4 rounded-2xl border border-white/20 bg-white/10 p-3 backdrop-blur-sm">
          <div className="h-14 w-14 shrink-0 overflow-hidden rounded-full border-2 border-white bg-gray-300">
            {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote avatar; next/image adds nothing here */}
            <img
              src={student?.photo_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${student?.id ?? 'student'}&backgroundColor=b6e3f4`}
              alt={student?.name_kh ?? t('unknown_name')}
              className="h-full w-full object-cover"
            />
          </div>
          <div className="min-w-0 flex-1">
            <p className="mb-0.5 text-[12px] font-semibold text-emerald-100">{t('student_info_label')}</p>
            <h3 className="truncate text-base font-bold text-white">
              {student?.name_kh || t('unknown_name')}
            </h3>
            <p className="text-xs text-emerald-100/80">
              {t('class_label')} {student?.grade || '—'} · {student?.student_id || '—'}
            </p>
          </div>
        </div>
      </header>

      <section className="px-4 py-6">
        <h3 className="mb-4 px-1 text-sm font-semibold text-pp-muted">{t('tracking_features')}</h3>
        <nav className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:gap-4">
          {TRACKING.map((i) => <Card key={i.href} item={i} />)}
        </nav>

        <h3 className="mb-4 mt-8 px-1 text-sm font-semibold text-pp-muted">{t('student_info_heading')}</h3>
        <nav className="grid grid-cols-2 gap-3 md:gap-4">
          {INFO.map((i) => <Card key={i.href} item={i} />)}
        </nav>
      </section>

      {showNotifs && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-0 backdrop-blur-sm sm:items-center sm:p-4"
          onClick={() => setShowNotifs(false)}
        >
          <div
            className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border bg-card-dark p-5 sm:rounded-2xl"
            style={{ borderColor: 'var(--pp-card-border)' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="kh-moul text-lg text-pp">{t('notif_title')}</h2>
                <p className="text-xs text-pp-muted">{t('notif_subtitle')}</p>
              </div>
              <button onClick={() => setShowNotifs(false)} aria-label="close" className="tap-target rounded-lg p-1 text-pp-muted">
                <X className="h-5 w-5" />
              </button>
            </div>

            {notifications.length === 0 ? (
              <p className="py-8 text-center text-sm text-pp-muted">{t('notif_empty')}</p>
            ) : (
              <ul className="space-y-3">
                {notifications.map((n) => (
                  <li key={n.id} className="rounded-xl border p-3" style={{ borderColor: 'var(--pp-card-border)' }}>
                    <p className="font-bold text-pp">{n.title}</p>
                    <p className="mt-1 text-sm text-pp-muted">{n.message}</p>
                    <p className="mt-2 text-[11px] text-pp-muted opacity-70">
                      {new Date(n.created_at).toLocaleString('km-KH')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </>
  )
}
