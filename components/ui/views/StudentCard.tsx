import React, { useState, useRef } from 'react'
import Link from 'next/link'
import { Eye, Edit3, CalendarCheck, TrendingUp, Trash2 } from 'lucide-react'
import type { Student } from '@/lib/types'
import { getDriveImageUrl } from '@/lib/utils/drive-image'
import { calculateAge } from '@/lib/utils/date'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

interface StudentCardProps {
  student: Student
  isSelected: boolean
  onToggleSelect: (id: string) => void
  onDelete: (student: Student) => void
  className?: string
  index?: number // For staggered animation
  /**
   * This is the pupil `/enrollment` just created (Phase 12 F1).
   *
   * Carried by a ទើបបញ្ចូល badge as well as the tint — colour alone says
   * nothing to a teacher who cannot see it, and the grid is the DEFAULT view on
   * a phone, which is exactly where the pupil was hardest to find.
   */
  highlighted?: boolean
}

export function StudentCard({ student, isSelected, onToggleSelect, onDelete, className = '', index = 0, highlighted = false }: StudentCardProps) {
  const [isSwiped, setIsSwiped] = useState(false)
  const touchStartX = useRef<number | null>(null)
  
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return
    const currentX = e.touches[0].clientX
    const diff = touchStartX.current - currentX

    if (diff > 50) {
      setIsSwiped(true)
    } else if (diff < -50) {
      setIsSwiped(false)
    }
  }

  const handleTouchEnd = () => {
    touchStartX.current = null
  }

  const badges = []
  // First, so `slice(0, 3)` below can never drop it — a pupil with three
  // standing badges is exactly the case where the teacher needs this one.
  // Distinct from `សិស្សថ្មី`, which is a fact about the pupil's year rather
  // than about the last few seconds.
  if (highlighted) badges.push({ label: 'ទើបបញ្ចូល', color: 'bg-success/15 text-success' })
  if (student.is_new_student) badges.push({ label: 'សិស្សថ្មី', color: 'bg-brand/10 text-brand' })
  if (student.poor_status && student.poor_status !== 'គ្មាន') badges.push({ label: student.poor_status, color: 'bg-danger/10 text-danger' })
  if (student.orphan_status && student.orphan_status !== 'ទេ') badges.push({ label: student.orphan_status, color: 'bg-warning/10 text-warning-text' })
  if (student.is_disabled) badges.push({ label: 'ពិការ', color: 'bg-paper text-text-body' })
  if (student.is_equity) badges.push({ label: 'សមធម៌', color: 'bg-success/10 text-success' })
  if (student.is_scholarship) badges.push({ label: 'អាហារូបករណ៍', color: 'bg-brand-100 text-brand-800 dark:bg-brand-900/60 dark:text-brand-300' })

  const visibleBadges = badges.slice(0, 3)
  const hiddenBadgesCount = badges.length - 3

  return (
    <div 
      data-student-row={student.id}
      className={`relative overflow-hidden rounded-2xl border ${
        highlighted ? 'border-success/50 ring-1 ring-success/40'
        : isSelected ? 'border-brand/40 ring-1 ring-brand/20 bg-brand/5'
        : 'border-divider bg-paper'
      } shadow-sm transition-all dialog-enter ${className}`}
      style={{ animationDelay: `${index * 50}ms`, animationFillMode: 'both' }}
    >
      {/* Background Actions (revealed on swipe) */}
      {/*
        Hidden until swiped, rather than merely covered.
        They were relying on the foreground being an OPAQUE `bg-paper` to hide
        them — so the moment that layer took a translucent tint (the ទើបបញ្ចូល
        mark below), the កែ and លុប icons showed through the right-hand third of
        the card as if it were half-swiped. Opacity states what is meant here;
        "something opaque happens to be on top of it" did not.
      */}
      <div
        aria-hidden={!isSwiped}
        className={`absolute inset-y-0 right-0 flex w-32 items-center justify-end bg-paper transition-opacity duration-200 ${isSwiped ? 'opacity-100' : 'opacity-0'}`}
      >
        <Link 
          href={`/students/${student.id}?edit=true`}
          className="flex h-full w-16 flex-col items-center justify-center gap-1 bg-brand/10 text-brand transition-colors hover:bg-brand/20"
        >
          <Edit3 className="h-5 w-5" />
          <span className="text-[10px] font-medium">កែ</span>
        </Link>
        <button 
          onClick={() => onDelete(student)}
          className="flex h-full w-16 flex-col items-center justify-center gap-1 bg-danger/10 text-danger transition-colors hover:bg-danger/20"
        >
          <Trash2 className="h-5 w-5" />
          <span className="text-[10px] font-medium">លុប</span>
        </button>
      </div>

      {/* Foreground Card */}
      <div 
        // The foreground sits over the swipe actions, so the tint has to be on
        // THIS layer — a background on the bordered wrapper would be hidden.
        className={`relative flex flex-col ${highlighted ? 'bg-success/10' : 'bg-paper'} p-4 transition-transform duration-300 ease-out ${isSwiped ? '-translate-x-32' : 'translate-x-0'}`}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="flex items-start gap-4">
          <div className="flex h-full flex-col justify-start pt-1">
            <input 
              type="checkbox" 
              checked={isSelected}
              onChange={() => onToggleSelect(student.id)}
              className="h-5 w-5 cursor-pointer rounded border-divider text-brand focus:ring-brand"
              aria-label={`ជ្រើសរើសសិស្ស ${student.name_kh}`}
            />
          </div>
          
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-divider bg-bg-surface">
            {student.photo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img 
                src={getDriveImageUrl(student.photo_url)} 
                alt={`រូបថត ${student.name_kh}`} 
                className="h-full w-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center text-text-muted">
                <span className="text-xl font-bold">{student.name_kh.charAt(0)}</span>
              </div>
            )}
          </div>

          <div className="flex min-w-0 flex-1 flex-col justify-center">
            <h3 className="truncate font-kh-moul text-[15px] font-bold text-text-heading leading-relaxed">
              {student.name_kh}
            </h3>
            <p className="mt-0.5 truncate text-[13px] text-text-muted">
              អ.ល {toKhmerNumber(student.student_id || '')} · ថ្នាក់ {student.grade || '-'}
            </p>
            <p className="mt-0.5 text-[12px] text-text-muted">
              {student.gender} {calculateAge(student.dob) ? `· អាយុ ${toKhmerNumber(calculateAge(student.dob)!)}` : ''}
            </p>
          </div>
        </div>

        {badges.length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-2 pl-9">
            {visibleBadges.map((badge, i) => (
              <span key={i} className={`inline-flex items-center rounded-md px-2 py-0.5 text-[11px] font-medium ${badge.color}`}>
                {badge.label}
              </span>
            ))}
            {hiddenBadgesCount > 0 && (
              <span className="group relative inline-flex items-center rounded-md bg-bg-surface px-2 py-0.5 text-[11px] font-medium text-text-muted hover:bg-paper">
                +{toKhmerNumber(hiddenBadgesCount)}
                {/* Tooltip for extra badges on hover */}
                <div className="absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 flex-col gap-1 whitespace-nowrap rounded-md bg-text-heading p-2 text-xs text-bg-surface group-hover:flex">
                  {badges.slice(3).map((b, i) => (
                    <span key={i}>{b.label}</span>
                  ))}
                </div>
              </span>
            )}
          </div>
        )}

        <div className="mt-4 flex items-center justify-between border-t border-divider pt-3 pl-9">
          <Link href={`/students/${student.id}`} className="flex flex-col items-center gap-1 text-text-muted transition-colors hover:text-brand" aria-label="មើលព័ត៌មានលម្អិត">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface group-hover:bg-brand/10">
              <Eye className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-medium">មើល</span>
          </Link>
          <Link href={`/students/${student.id}?edit=true`} className="flex flex-col items-center gap-1 text-text-muted transition-colors hover:text-brand" aria-label="កែប្រែព័ត៌មាន">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface group-hover:bg-brand/10">
              <Edit3 className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-medium">កែ</span>
          </Link>
          <Link href={`/attendance?student=${student.id}`} className="flex flex-col items-center gap-1 text-text-muted transition-colors hover:text-success" aria-label="មើលវត្តមាន">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface group-hover:bg-success/10">
              <CalendarCheck className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-medium">វត្តមាន</span>
          </Link>
          <Link href={`/score?student=${student.id}`} className="flex flex-col items-center gap-1 text-text-muted transition-colors hover:text-brand" aria-label="មើលពិន្ទុ">
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bg-surface group-hover:bg-brand-soft dark:group-hover:bg-brand-900/60">
              <TrendingUp className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-medium">ពិន្ទុ</span>
          </Link>
        </div>
      </div>
    </div>
  )
}
