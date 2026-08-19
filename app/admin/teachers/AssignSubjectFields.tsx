'use client'

import { useState, useTransition } from 'react'
import { listAssignableSubjects } from '../actions'

/**
 * The class → subject half of the assignment form.
 *
 * The subject options depend on which class is chosen — a Grade 12 science
 * class teaches a different list (and different full marks) than a primary
 * one — so they cannot be rendered server-side with the rest of the form.
 * Choosing a class fetches that class's *resolved* template through
 * `listAssignableSubjects`, the same resolution `/score/collect` shows, which
 * is what keeps the two surfaces naming subjects identically.
 *
 * Offering a static list of every subject here is how a teacher ends up
 * assigned to a subject the class never teaches — a column that silently
 * stays empty on every report.
 */

const FIELD_CLASS =
  'w-full rounded-xl border border-divider bg-white px-4 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/20'

export function AssignSubjectFields({
  classes,
}: {
  classes: { id: string; label: string }[]
}) {
  const [subjects, setSubjects] = useState<{ value: string; label: string }[]>([])
  const [subjectKey, setSubjectKey] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, startTransition] = useTransition()

  const onClassChange = (classId: string) => {
    // A stale list from the previous class must never survive the switch —
    // its keys may not exist in the new class's curriculum.
    setSubjects([])
    setSubjectKey('')
    setError(null)
    if (!classId) return
    startTransition(async () => {
      const res = await listAssignableSubjects(classId)
      if ('error' in res) setError(res.error)
      else setSubjects(res.options)
    })
  }

  return (
    <>
      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-text-body">ថ្នាក់</span>
        <select
          name="class_id"
          required
          defaultValue=""
          onChange={(e) => onClassChange(e.target.value)}
          className={FIELD_CLASS}
        >
          <option value="" disabled>ជ្រើសរើស...</option>
          {classes.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
          ))}
        </select>
      </label>

      <label className="block">
        <span className="mb-1.5 block text-sm font-bold text-text-body">
          មុខវិជ្ជា (ទុកទទេ = គ្រូបន្ទុកថ្នាក់)
        </span>
        <select
          name="subject_key"
          value={subjectKey}
          onChange={(e) => setSubjectKey(e.target.value)}
          disabled={loading || subjects.length === 0}
          className={`${FIELD_CLASS} disabled:cursor-not-allowed disabled:bg-paper disabled:text-text-muted`}
        >
          <option value="">
            {loading
              ? 'កំពុងទាញយក...'
              : subjects.length === 0
                ? 'ជ្រើសរើសថ្នាក់ជាមុនសិន'
                : 'គ្មាន (គ្រូបន្ទុកថ្នាក់)'}
          </option>
          {subjects.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        {error && <span className="mt-1 block text-xs font-bold text-danger">{error}</span>}
      </label>
    </>
  )
}
