'use client'

import { useState, useTransition, type ReactNode } from 'react'
import { Plus, X, Loader2 } from 'lucide-react'
import type { ActionResult } from '@/lib/types'

/**
 * Collapsible "create" form shared by the admin pages.
 *
 * Kept generic so each page supplies only its fields: the submit lifecycle,
 * pending state, error surface and success reset are identical everywhere, and
 * duplicating them per page is how they drift.
 */
export function AdminCreateForm({
  title,
  submitLabel = 'រក្សាទុក',
  action,
  children,
}: {
  title: string
  submitLabel?: string
  action: (formData: FormData) => Promise<ActionResult>
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [pending, startTransition] = useTransition()

  const onSubmit = (formData: FormData) => {
    startTransition(async () => {
      const res = await action(formData)
      if (res.error) {
        setMessage({ text: res.error, ok: false })
      } else {
        setMessage({ text: 'រក្សាទុកបានជោគជ័យ!', ok: true })
        setOpen(false)
      }
    })
  }

  return (
    <div className="space-y-4">
      {message && (
        <div
          role="status"
          className={`rounded-xl border p-4 text-sm font-bold ${
            message.ok
              ? 'border-success/30 bg-success/10 text-success'
              : 'border-danger/30 bg-danger/10 text-danger'
          }`}
        >
          {message.text}
        </div>
      )}

      {!open ? (
        <button
          onClick={() => { setOpen(true); setMessage(null) }}
          className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-brand-hover"
        >
          <Plus className="h-4 w-4" /> {title}
        </button>
      ) : (
        <form
          action={onSubmit}
          className="space-y-4 rounded-xl border border-divider bg-white p-6 shadow-sm"
        >
          <div className="flex items-center justify-between">
            <h2 className="kh-moul text-base text-brand">{title}</h2>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="បិទ"
              className="rounded-lg p-1 text-text-muted transition hover:bg-paper"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">{children}</div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-xl border border-divider px-5 py-2.5 text-sm font-bold text-text-body transition hover:bg-paper"
            >
              បោះបង់
            </button>
            <button
              type="submit"
              disabled={pending}
              className="flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-bold text-white transition hover:bg-brand-hover disabled:opacity-50"
            >
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {submitLabel}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}

/** Labelled text input matching the app's field styling. */
export function Field({
  label, name, type = 'text', required, placeholder,
}: {
  label: string; name: string; type?: string; required?: boolean; placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-text-body">{label}</span>
      <input
        name={name}
        type={type}
        required={required}
        placeholder={placeholder}
        className="w-full rounded-xl border border-divider px-4 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/20"
      />
    </label>
  )
}

/** Labelled native select — short static option sets, per the project convention. */
export function SelectField({
  label, name, options, required, placeholder = 'ជ្រើសរើស...',
}: {
  label: string
  name: string
  options: { value: string; label: string }[]
  required?: boolean
  placeholder?: string
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-text-body">{label}</span>
      <select
        name={name}
        required={required}
        defaultValue=""
        className="w-full rounded-xl border border-divider bg-white px-4 py-2.5 text-sm outline-none transition focus:border-brand focus:ring-2 focus:ring-focus-ring/20"
      >
        <option value="" disabled>{placeholder}</option>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  )
}
