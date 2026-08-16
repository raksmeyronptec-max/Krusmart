import React, { useState } from 'react'
import Link from 'next/link'
import { MoreVertical, Eye, Edit3, CalendarCheck, TrendingUp, Trash2, ArrowUp, ArrowDown, Printer } from 'lucide-react'
import type { Student } from '@/lib/types'
import { getDriveImageUrl } from '@/lib/utils/drive-image'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

interface StudentCompactTableProps {
  students: Student[]
  selectedIds: Set<string>
  onToggleSelect: (id: string) => void
  onToggleAll: () => void
  onSort: (column: string) => void
  sortConfig: { column: string; direction: 'asc' | 'desc' } | null
  onAction: (action: string, student: Student) => void
}

export function StudentCompactTable({
  students,
  selectedIds,
  onToggleSelect,
  onToggleAll,
  onSort,
  sortConfig,
  onAction
}: StudentCompactTableProps) {
  
  const renderSortIcon = (column: string) => {
    if (sortConfig?.column !== column) return null
    return sortConfig.direction === 'asc' ? <ArrowUp className="ml-1 h-3 w-3" /> : <ArrowDown className="ml-1 h-3 w-3" />
  }

  const allSelected = students.length > 0 && selectedIds.size === students.length
  const someSelected = selectedIds.size > 0 && selectedIds.size < students.length

  return (
    <div className="relative overflow-x-auto rounded-lg border border-divider bg-paper shadow-sm">
      <table className="w-full text-left text-sm text-text-body">
        <thead className="bg-bg-surface text-xs text-text-muted">
          <tr>
            <th scope="col" className="sticky left-0 z-10 w-12 bg-bg-surface p-4 border-r border-divider">
              <input
                type="checkbox"
                checked={allSelected}
                ref={input => { if (input) input.indeterminate = someSelected }}
                onChange={onToggleAll}
                className="h-4 w-4 cursor-pointer rounded border-divider text-brand focus:ring-brand"
                aria-label="ជ្រើសរើសទាំងអស់"
              />
            </th>
            <th scope="col" className="sticky left-12 z-10 min-w-[200px] cursor-pointer bg-bg-surface px-4 py-3 font-semibold border-r border-divider transition-colors hover:bg-gray-100" onClick={() => onSort('name')}>
              <div className="flex items-center">សិស្ស {renderSortIcon('name')}</div>
            </th>
            <th scope="col" className="cursor-pointer px-4 py-3 font-semibold transition-colors hover:bg-gray-100" onClick={() => onSort('id')}>
              <div className="flex items-center">អត្តលេខ {renderSortIcon('id')}</div>
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">ភេទ</th>
            <th scope="col" className="px-4 py-3 font-semibold">ថ្នាក់</th>
            <th scope="col" className="cursor-pointer px-4 py-3 font-semibold transition-colors hover:bg-gray-100" onClick={() => onSort('attendance')}>
              <div className="flex items-center">វត្តមាន {renderSortIcon('attendance')}</div>
            </th>
            <th scope="col" className="cursor-pointer px-4 py-3 font-semibold transition-colors hover:bg-gray-100" onClick={() => onSort('score')}>
              <div className="flex items-center">មធ្យមភាគ {renderSortIcon('score')}</div>
            </th>
            <th scope="col" className="px-4 py-3 font-semibold">ស្ថានភាព</th>
            <th scope="col" className="px-4 py-3 font-semibold text-right">សកម្មភាព</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-divider">
          {students.map((student) => {
            const isSelected = selectedIds.has(student.id)
            
            // Attendance coloring
            let attColor = 'text-text-muted'
            if (student.attendance_rate !== undefined && student.attendance_rate !== null) {
              if (student.attendance_rate >= 80) attColor = 'text-success font-medium'
              else if (student.attendance_rate >= 60) attColor = 'text-warning font-medium'
              else attColor = 'text-danger font-bold'
            }

            // Score coloring
            let scoreColor = 'text-text-muted'
            if (student.overall_average !== undefined && student.overall_average !== null) {
              if (student.overall_average >= 80) scoreColor = 'text-success font-medium'
              else if (student.overall_average >= 50) scoreColor = 'text-warning font-medium'
              else scoreColor = 'text-danger font-bold'
            }

            return (
              <tr 
                key={student.id} 
                className={`group cursor-pointer transition-colors hover:bg-brand/5 ${isSelected ? 'bg-brand/5' : 'bg-paper'}`}
                onClick={() => onAction('view', student)}
              >
                <td className="sticky left-0 z-10 w-12 border-r border-divider bg-inherit p-4" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => onToggleSelect(student.id)}
                    className="h-4 w-4 cursor-pointer rounded border-divider text-brand focus:ring-brand"
                    aria-label={`ជ្រើសរើស ${student.name_kh}`}
                  />
                </td>
                
                <td className="sticky left-12 z-10 min-w-[200px] border-r border-divider bg-inherit px-4 py-2">
                  <div className="flex items-center gap-3">
                    <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-divider bg-bg-surface group-hover:ring-2 group-hover:ring-brand/20 transition-all">
                      {student.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img 
                          src={getDriveImageUrl(student.photo_url)} 
                          alt=""
                          className="h-full w-full object-cover"
                          referrerPolicy="no-referrer"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-text-muted text-xs font-bold">
                          {student.name_kh.charAt(0)}
                        </div>
                      )}
                    </div>
                    <span className="font-kh-moul text-[14px] font-bold text-text-heading" title={student.name_kh}>
                      {student.name_kh}
                    </span>
                  </div>
                </td>
                
                <td className="whitespace-nowrap px-4 py-2 font-mono text-[13px] text-text-muted">
                  {toKhmerNumber(student.student_id || '-')}
                </td>
                
                <td className="px-4 py-2">{student.gender || '-'}</td>
                <td className="px-4 py-2">{student.grade || '-'}</td>
                
                <td className="px-4 py-2">
                  {student.attendance_rate !== undefined && student.attendance_rate !== null ? (
                    <div className="flex items-center gap-2">
                      <span className={attColor}>{toKhmerNumber(student.attendance_rate)}%</span>
                      {/* Simple sparkline simulation bar */}
                      <div className="h-1.5 w-12 overflow-hidden rounded-full bg-gray-100">
                        <div className={`h-full ${attColor.split(' ')[0].replace('text-', 'bg-')}`} style={{ width: `${student.attendance_rate}%` }} />
                      </div>
                    </div>
                  ) : <span className="text-text-muted">—</span>}
                </td>
                
                <td className="px-4 py-2">
                  {student.overall_average !== undefined && student.overall_average !== null ? (
                    <div className="flex items-center gap-2">
                      <span className={scoreColor}>{toKhmerNumber(student.overall_average)}</span>
                      {student.grade_letter && (
                        <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-bold ${
                          ['A', 'B'].includes(student.grade_letter) ? 'bg-success/10 text-success' : 
                          ['C', 'D'].includes(student.grade_letter) ? 'bg-warning/10 text-warning' : 
                          'bg-danger/10 text-danger'
                        }`}>
                          {student.grade_letter}
                        </span>
                      )}
                    </div>
                  ) : <span className="text-text-muted">—</span>}
                </td>
                
                <td className="px-4 py-2">
                  <div className="flex flex-wrap items-center gap-1">
                    {student.is_new_student && <span title="សិស្សថ្មី" className="flex h-5 w-5 items-center justify-center rounded bg-brand/10 text-[10px] text-brand">ថ្មី</span>}
                    {student.is_disabled && <span title="ពិការ" className="flex h-5 w-5 items-center justify-center rounded bg-gray-100 text-[10px] text-gray-700">♿</span>}
                    {student.is_scholarship && <span title="អាហារូបករណ៍" className="flex h-5 w-5 items-center justify-center rounded bg-purple-100 text-[10px] text-purple-700">⭐</span>}
                    {student.poor_status && student.poor_status !== 'គ្មាន' && <span title={`ប័ណ្ណ${student.poor_status}`} className="flex h-5 w-5 items-center justify-center rounded bg-danger/10 text-[10px] font-bold text-danger">{student.poor_status.replace('ក្រ', 'ក')}</span>}
                  </div>
                </td>
                
                <td className="px-4 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                  {/* Dropdown triggers could be a separate component, keeping it simple here with native or custom generic logic. Using standard inline buttons to avoid complex dropdown positioning logic if not available, or a simple hover group */}
                  <div className="flex items-center justify-end gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <button onClick={() => onAction('view', student)} className="rounded p-1.5 text-text-muted hover:bg-gray-100 hover:text-brand" aria-label="មើល">
                      <Eye className="h-4 w-4" />
                    </button>
                    <button onClick={() => onAction('edit', student)} className="rounded p-1.5 text-text-muted hover:bg-gray-100 hover:text-brand" aria-label="កែ">
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button onClick={() => onAction('delete', student)} className="rounded p-1.5 text-text-muted hover:bg-danger/10 hover:text-danger" aria-label="លុប">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
