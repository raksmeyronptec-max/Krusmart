import React from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'

export interface FilterState {
  grade: string[]
  gender: string
  is_new_student: boolean
  is_repeater: boolean
  is_disabled: boolean
  is_equity: boolean
  is_scholarship: boolean
  poor_status: string
  orphan_status: string
  minAge: number
  maxAge: number
}

interface AdvancedFilterSidebarProps {
  isOpen: boolean
  onClose: () => void
  filters: FilterState
  onFilterChange: (filters: FilterState) => void
  onClear: () => void
  availableGrades?: string[]
}

export function AdvancedFilterSidebar({
  isOpen,
  onClose,
  filters,
  onFilterChange,
  onClear,
  availableGrades = ['ថ្នាក់ទី១', 'ថ្នាក់ទី២', 'ថ្នាក់ទី៣', 'ថ្នាក់ទី៤', 'ថ្នាក់ទី៥', 'ថ្នាក់ទី៦']
}: AdvancedFilterSidebarProps) {
  
  if (!isOpen) return null

  const handleToggleGrade = (grade: string) => {
    const next = filters.grade.includes(grade)
      ? filters.grade.filter(g => g !== grade)
      : [...filters.grade, grade]
    onFilterChange({ ...filters, grade: next })
  }

  const handleToggle = (key: keyof FilterState) => {
    onFilterChange({ ...filters, [key]: !filters[key] })
  }

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/20 backdrop-blur-sm lg:hidden" onClick={onClose} aria-hidden="true" />
      <div 
        role="search"
        aria-expanded={isOpen}
        className="fixed inset-y-0 right-0 z-50 w-full max-w-sm flex-col border-l border-divider bg-paper shadow-2xl transition-transform duration-300 lg:sticky lg:top-0 lg:h-screen lg:w-80 lg:shadow-none animate-in slide-in-from-right"
      >
        <div className="flex items-center justify-between border-b border-divider px-4 py-3">
          <h2 className="text-lg font-bold text-text-heading">តម្រងស្វែងរក</h2>
          <button onClick={onClose} className="rounded-md p-2 text-text-muted hover:bg-gray-100 lg:hidden" aria-label="បិទ">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          <div className="space-y-6">
            {/* Grade */}
            <div role="group" aria-labelledby="grade-label">
              <h3 id="grade-label" className="mb-3 text-sm font-semibold text-text-heading">ថ្នាក់</h3>
              <div className="grid grid-cols-2 gap-2">
                {availableGrades.map(g => (
                  <label key={g} className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand transition-colors">
                    <input 
                      type="checkbox" 
                      checked={filters.grade.includes(g)}
                      onChange={() => handleToggleGrade(g)}
                      className="rounded border-divider text-brand focus:ring-brand"
                    />
                    {g}
                  </label>
                ))}
              </div>
            </div>

            {/* Gender */}
            <div role="group" aria-labelledby="gender-label">
              <h3 id="gender-label" className="mb-3 text-sm font-semibold text-text-heading">ភេទ</h3>
              <div className="flex gap-4">
                {['ទាំងអស់', 'ប្រុស', 'ស្រី'].map(g => (
                  <label key={g} className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand transition-colors">
                    <input 
                      type="radio" 
                      name="gender"
                      checked={filters.gender === (g === 'ទាំងអស់' ? '' : g)}
                      onChange={() => onFilterChange({ ...filters, gender: g === 'ទាំងអស់' ? '' : g })}
                      className="text-brand focus:ring-brand"
                    />
                    {g}
                  </label>
                ))}
              </div>
            </div>

            {/* Status Flags */}
            <div role="group" aria-labelledby="status-label">
              <h3 id="status-label" className="mb-3 text-sm font-semibold text-text-heading">ស្ថានភាព</h3>
              <div className="space-y-3">
                {[
                  { key: 'is_new_student', label: 'សិស្សថ្មី' },
                  { key: 'is_repeater', label: 'សិស្សត្រួតថ្នាក់' },
                  { key: 'is_disabled', label: 'ពិការ' },
                  { key: 'is_equity', label: 'សមធម៌' },
                  { key: 'is_scholarship', label: 'អាហារូបករណ៍' },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center justify-between text-sm cursor-pointer hover:text-brand transition-colors">
                    <span>{label}</span>
                    <input 
                      type="checkbox" 
                      checked={!!filters[key as keyof FilterState]}
                      onChange={() => handleToggle(key as keyof FilterState)}
                      className="h-4 w-8 rounded-full border-2 border-transparent bg-gray-200 transition-colors checked:bg-brand checked:focus:bg-brand focus:ring-brand focus:ring-offset-1 appearance-none relative before:absolute before:inset-y-0 before:left-0 before:h-3 before:w-3 before:rounded-full before:bg-white before:transition-transform checked:before:translate-x-4 cursor-pointer"
                      role="switch"
                      aria-checked={!!filters[key as keyof FilterState]}
                    />
                  </label>
                ))}
              </div>
            </div>

            {/* Poor Status */}
            <div role="group" aria-labelledby="poor-label">
              <h3 id="poor-label" className="mb-3 text-sm font-semibold text-text-heading">ប័ណ្ណក្រីក្រ</h3>
              <div className="grid grid-cols-2 gap-2">
                {['ទាំងអស់', 'គ្មាន', 'ក្រ១', 'ក្រ២'].map(p => (
                  <label key={p} className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand transition-colors">
                    <input 
                      type="radio" 
                      name="poor_status"
                      checked={filters.poor_status === (p === 'ទាំងអស់' ? '' : p)}
                      onChange={() => onFilterChange({ ...filters, poor_status: p === 'ទាំងអស់' ? '' : p })}
                      className="text-brand focus:ring-brand"
                    />
                    {p}
                  </label>
                ))}
              </div>
            </div>

            {/* Orphan Status */}
            <div role="group" aria-labelledby="orphan-label">
              <h3 id="orphan-label" className="mb-3 text-sm font-semibold text-text-heading">ស្ថានភាពកំព្រា</h3>
              <div className="grid grid-cols-2 gap-2">
                {['ទាំងអស់', 'ទេ', 'កំព្រាឪពុក', 'កំព្រាម្តាយ', 'កំព្រាទាំងពីរ'].map(o => (
                  <label key={o} className="flex items-center gap-2 text-sm cursor-pointer hover:text-brand transition-colors">
                    <input 
                      type="radio" 
                      name="orphan_status"
                      checked={filters.orphan_status === (o === 'ទាំងអស់' ? '' : o)}
                      onChange={() => onFilterChange({ ...filters, orphan_status: o === 'ទាំងអស់' ? '' : o })}
                      className="text-brand focus:ring-brand"
                    />
                    {o}
                  </label>
                ))}
              </div>
            </div>

            {/* Age Range */}
            <div role="group" aria-labelledby="age-label">
              <h3 id="age-label" className="mb-3 flex justify-between text-sm font-semibold text-text-heading">
                <span>អាយុ</span>
                <span className="text-brand">{filters.minAge} - {filters.maxAge} ឆ្នាំ</span>
              </h3>
              <div className="px-2">
                <input 
                  type="range"
                  min="5"
                  max="25"
                  value={filters.minAge}
                  onChange={e => onFilterChange({ ...filters, minAge: Math.min(parseInt(e.target.value), filters.maxAge) })}
                  className="w-full accent-brand"
                  aria-label="អាយុអប្បបរមា"
                />
                <input 
                  type="range"
                  min="5"
                  max="25"
                  value={filters.maxAge}
                  onChange={e => onFilterChange({ ...filters, maxAge: Math.max(parseInt(e.target.value), filters.minAge) })}
                  className="w-full accent-brand mt-2"
                  aria-label="អាយុអតិបរមា"
                />
              </div>
            </div>

          </div>
        </div>
        
        <div className="border-t border-divider p-4">
          <Button variant="secondary" className="w-full justify-center" onClick={onClear}>
            សម្អាតតម្រងទាំងអស់
          </Button>
        </div>
      </div>
    </>
  )
}
