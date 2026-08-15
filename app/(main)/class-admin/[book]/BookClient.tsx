'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import toast from 'react-hot-toast'
import { ArrowLeft, Edit, PlusCircle, Printer, Save, Trash2, X } from 'lucide-react'
import Select from '@/components/ui/forms/Select'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import type { BookDefinition, BookField } from '@/lib/class-admin/books'
import { printableFields } from '@/lib/class-admin/books'
import type { ClassAdminEntry, Settings } from '@/lib/types'
import { createBookEntry, deleteBookEntry, listBookEntries, updateBookEntry } from '../actions'

/**
 * Editor and printable sheet for one of the 13 class-administration books.
 *
 * One component serves all 13: the book's field list drives both the form and
 * the table, so the books differ only by their entry in
 * `lib/class-admin/books.ts`. The legacy build repeated this markup 13 times.
 */

/** A blank row for the book — every field present, so inputs stay controlled. */
function emptyForm(book: BookDefinition): Record<string, string> {
  return Object.fromEntries(book.fields.map((f) => [f.key, '']))
}

function fieldValue(entry: ClassAdminEntry, key: string): string {
  const raw = entry.data?.[key]
  return raw === null || raw === undefined ? '' : String(raw)
}

export default function BookClient({
  book,
  initialEntries,
  settings,
}: {
  book: BookDefinition
  initialEntries: ClassAdminEntry[]
  settings: Settings | null
}) {
  const [entries, setEntries] = useState<ClassAdminEntry[]>(initialEntries)
  const [form, setForm] = useState<Record<string, string>>(() => emptyForm(book))
  const [editId, setEditId] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const landscape = book.orientation === 'landscape'
  const columns = printableFields(book)

  const setField = (key: string, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const resetForm = () => {
    setForm(emptyForm(book))
    setEditId(null)
  }

  const refresh = async () => setEntries(await listBookEntries(book.id))

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()

    // The first field is the book's identifying column; an entry with nothing in
    // it would print as a blank row.
    const primary = book.fields[0]
    if (!form[primary.key]?.trim()) {
      toast.error(`សូមបញ្ចូល${primary.label}`)
      return
    }

    startTransition(async () => {
      const res = editId
        ? await updateBookEntry(editId, book.id, form)
        : await createBookEntry(book.id, form)

      if (res.error) {
        toast.error(res.error)
        return
      }
      await refresh()
      resetForm()
      toast.success(editId ? 'បានកែប្រែកំណត់ត្រា' : 'បានបញ្ចូលកំណត់ត្រាថ្មី')
    })
  }

  const handleEdit = (entry: ClassAdminEntry) => {
    const next = emptyForm(book)
    for (const f of book.fields) next[f.key] = fieldValue(entry, f.key)
    setForm(next)
    setEditId(entry.id)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const handleDelete = (entry: ClassAdminEntry) => {
    if (!confirm('តើអ្នកពិតជាចង់លុបកំណត់ត្រានេះមែនទេ?')) return
    startTransition(async () => {
      const res = await deleteBookEntry(entry.id, book.id)
      if (res.error) {
        toast.error(res.error)
        return
      }
      await refresh()
      if (editId === entry.id) resetForm()
      toast.success('បានលុបកំណត់ត្រា')
    })
  }

  const renderInput = (f: BookField) => {
    const base =
      'w-full min-h-11 rounded-xl border border-gray-200 bg-white p-2.5 outline-none transition focus:border-[#0054a6] dark:border-gray-700 dark:bg-gray-900'

    if (f.type === 'textarea') {
      return (
        <textarea
          id={`f-${f.key}`}
          value={form[f.key] ?? ''}
          onChange={(e) => setField(f.key, e.target.value)}
          rows={2}
          placeholder={f.placeholder}
          className={`${base} resize-y`}
        />
      )
    }

    if (f.type === 'select') {
      return (
        <Select
          id={`f-${f.key}`}
          ariaLabel={f.label}
          value={form[f.key] ?? ''}
          onChange={(v) => setField(f.key, v)}
          options={[
            { value: '', label: '-- ជ្រើសរើស --' },
            ...(f.options ?? []).map((o) => ({ value: o, label: o })),
          ]}
        />
      )
    }

    return (
      <input
        id={`f-${f.key}`}
        type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : f.type === 'time' ? 'time' : 'text'}
        value={form[f.key] ?? ''}
        onChange={(e) => setField(f.key, e.target.value)}
        placeholder={f.placeholder}
        className={base}
      />
    )
  }

  return (
    <div className="min-h-screen font-battambang print:bg-white">
      <style jsx global>{`
        .print-container { display: none; }
        @media print {
          @page { size: A4 ${landscape ? 'landscape' : 'portrait'}; margin: 12mm; }
          .no-print { display: none !important; }
          body { background: #fff !important; margin: 0; padding: 0; }
          .print-container {
            display: block !important;
            width: 100%;
            box-shadow: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .admin-table th { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .admin-table tr { break-inside: avoid; }
          thead { display: table-header-group; }
        }
        .admin-table { width: 100%; border-collapse: collapse; font-size: 10.5pt; }
        .admin-table th, .admin-table td { border: 1px solid #000; padding: 5px 7px; vertical-align: top; }
        .admin-table th { font-family: 'Moul', cursive; font-weight: normal; font-size: 10.5pt; text-align: center; }
      `}</style>

      {/* ---------------------------------------------------------------- UI */}
      <div className="no-print mx-auto max-w-6xl px-4 py-6 md:py-8">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/class-admin"
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/60 px-4 py-2 font-bold text-[#0054a6] shadow-sm backdrop-blur-sm transition hover:text-blue-800"
          >
            <ArrowLeft className="h-5 w-5" aria-hidden="true" /> ត្រឡប់ទៅបញ្ជីសៀវភៅ
          </Link>
          <button
            onClick={() => window.print()}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-sm font-bold text-white shadow-md transition hover:bg-red-700"
          >
            <Printer className="h-4 w-4" aria-hidden="true" /> បោះពុម្ព
          </button>
        </div>

        <div className="rounded-2xl border border-divider bg-bg-surface p-5 shadow-lg md:p-8">
          <h1 className="kh-moul mb-6 border-b border-divider pb-4 text-lg text-[#0054a6] md:text-xl dark:text-blue-300">
            {book.title}
          </h1>

          {/* Entry form */}
          <form
            onSubmit={handleSubmit}
            className="mb-8 rounded-2xl border border-blue-100 bg-blue-50/50 p-5 dark:border-gray-700 dark:bg-gray-800/50"
          >
            <h2 className="mb-4 flex items-center gap-2 font-bold text-text-heading">
              {editId ? (
                <><Edit className="h-5 w-5 text-yellow-600" aria-hidden="true" /> កែប្រែកំណត់ត្រា</>
              ) : (
                <><PlusCircle className="h-5 w-5 text-green-600" aria-hidden="true" /> បញ្ចូលកំណត់ត្រាថ្មី</>
              )}
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {book.fields.map((f) => (
                <div key={f.key} className={f.type === 'textarea' ? 'sm:col-span-2' : ''}>
                  <label htmlFor={`f-${f.key}`} className="mb-1 block text-sm font-bold text-text-body">
                    {f.label}
                  </label>
                  {renderInput(f)}
                </div>
              ))}
            </div>

            <div className="mt-5 flex gap-3">
              <button
                type="submit"
                disabled={pending}
                className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 font-bold text-white shadow transition disabled:opacity-60 sm:flex-none sm:px-8 ${
                  editId ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-[#0054a6] hover:bg-blue-700'
                }`}
              >
                <Save className="h-4 w-4" aria-hidden="true" /> រក្សាទុក
              </button>
              {editId && (
                <button
                  type="button"
                  onClick={resetForm}
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-gray-400 px-4 py-2.5 font-bold text-white shadow transition hover:bg-gray-500"
                >
                  <X className="h-4 w-4" aria-hidden="true" /> បោះបង់
                </button>
              )}
            </div>
          </form>

          {/* Entry list */}
          <h2 className="mb-4 font-bold text-text-heading">
            បញ្ជីកំណត់ត្រា ({toKhmerNumber(entries.length)})
          </h2>

          <div className="overflow-x-auto rounded-xl border border-divider">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-gray-100 font-bold text-gray-700 dark:bg-gray-800 dark:text-gray-200">
                <tr>
                  <th className="w-14 p-3 text-center">ល.រ</th>
                  {columns.map((f) => (
                    <th key={f.key} className="p-3 whitespace-nowrap">{f.label}</th>
                  ))}
                  <th className="w-28 p-3 text-center">គ្រប់គ្រង</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-bg-surface dark:divide-gray-800">
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={columns.length + 2} className="p-6 text-center font-bold text-text-muted">
                      មិនទាន់មានកំណត់ត្រានៅឡើយទេ
                    </td>
                  </tr>
                ) : (
                  entries.map((entry, i) => (
                    <tr key={entry.id} className="transition hover:bg-gray-50 dark:hover:bg-gray-800/50">
                      <td className="p-3 text-center font-bold text-text-muted">{toKhmerNumber(i + 1)}</td>
                      {columns.map((f) => (
                        <td key={f.key} className="max-w-xs p-3 text-text-body">
                          <span className="line-clamp-2">{fieldValue(entry, f.key) || '-'}</span>
                        </td>
                      ))}
                      <td className="p-3">
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => handleEdit(entry)}
                            aria-label="កែប្រែ"
                            className="rounded-lg bg-yellow-100 p-2 text-yellow-600 transition hover:bg-yellow-200"
                          >
                            <Edit className="h-4 w-4" aria-hidden="true" />
                          </button>
                          <button
                            onClick={() => handleDelete(entry)}
                            aria-label="លុប"
                            className="rounded-lg bg-red-100 p-2 text-red-600 transition hover:bg-red-200"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* ------------------------------------------------------------- Print */}
      <div className="print-container bg-white text-black">
        <div className="mb-5 text-center">
          <h3 className="kh-moul mb-1 text-[13pt]">ព្រះរាជាណាចក្រកម្ពុជា</h3>
          <h3 className="kh-moul text-[13pt]">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
        </div>

        <div className="kh-moul mb-5 text-[11pt] leading-relaxed">
          <p>{settings?.management_unit_1 || 'មន្ទីរអប់រំ យុវជន និងកីឡា...'}</p>
          <p>{settings?.management_unit_2 || 'ការិយាល័យអប់រំ យុវជន និងកីឡា...'}</p>
          <p>{settings?.school_name || 'សាលាបឋមសិក្សា...'}</p>
        </div>

        <h2 className="kh-moul mb-2 text-center text-[14pt]">{book.printTitle}</h2>
        <p className="mb-5 text-center text-[11pt] font-bold">
          ថ្នាក់ទី {settings?.class_name || '.......'} ឆ្នាំសិក្សា {settings?.academic_year || '.......'}
        </p>

        <table className="admin-table">
          <thead>
            <tr>
              <th style={{ width: '6%' }}>ល.រ</th>
              {columns.map((f) => (
                <th key={f.key} style={{ width: f.width }}>{f.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, i) => (
              <tr key={entry.id}>
                <td className="text-center">{toKhmerNumber(i + 1)}</td>
                {columns.map((f) => (
                  <td key={f.key}>{fieldValue(entry, f.key)}</td>
                ))}
              </tr>
            ))}
            {/* Blank rows so the sheet can be completed by hand, as the paper form is. */}
            {Array.from({ length: Math.max(0, 6 - entries.length) }, (_, i) => (
              <tr key={`blank-${i}`}>
                <td className="text-center">{toKhmerNumber(entries.length + i + 1)}</td>
                {columns.map((f) => (
                  <td key={f.key}>&nbsp;</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>

        <div className="mt-10 grid grid-cols-2 gap-8">
          <div className="kh-moul text-center leading-relaxed">
            <div className="mb-4 invisible">.</div>
            <p className="mb-2 text-[11pt]">បានឃើញ និងឯកភាព</p>
            <p className="text-[12pt] uppercase">{settings?.manager_role || 'នាយកសាលា'}</p>
            <div className="h-20" />
            <p className="text-[11.5pt]">{settings?.manager_name || ''}</p>
          </div>
          <div className="kh-moul text-center leading-relaxed">
            <p className="mb-2 text-[11pt]">ថ្ងៃទី...........ខែ...........ឆ្នាំ...........</p>
            <p className="text-[12pt]">គ្រូបន្ទុកថ្នាក់</p>
            <div className="h-20" />
            <p className="text-[11.5pt]">{settings?.homeroom_teacher || ''}</p>
          </div>
        </div>
      </div>
    </div>
  )
}
