import type { ReactNode } from 'react'

/** Consistent header + empty state for every admin page. */
export function AdminPage({
  title,
  description,
  action,
  children,
}: {
  title: string
  description?: string
  action?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-4 md:p-8">
      <header className="flex flex-col justify-between gap-4 rounded-xl border border-divider bg-white p-6 shadow-sm md:flex-row md:items-center">
        <div>
          <h1 className="kh-moul text-xl text-brand">{title}</h1>
          {description && <p className="mt-1 text-sm text-text-muted">{description}</p>}
        </div>
        {action}
      </header>
      {children}
    </div>
  )
}

export function EmptyState({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed border-divider bg-white p-12 text-center text-sm font-bold text-text-muted">
      {message}
    </div>
  )
}

/** Shown when the signed-in administrator has no school linked to their profile. */
export function NoSchool() {
  return (
    <div className="mx-auto max-w-7xl p-4 md:p-8">
      <div className="rounded-xl border border-warning/30 bg-warning/10 p-8 text-center">
        <p className="font-bold text-warning">គណនីរបស់អ្នកមិនទាន់បានភ្ជាប់ជាមួយសាលាណាមួយទេ។</p>
        <p className="mt-2 text-sm text-warning">
          សូមទាក់ទងអ្នកគ្រប់គ្រងប្រព័ន្ធ ដើម្បីភ្ជាប់គណនីរបស់អ្នកទៅសាលារៀន។
        </p>
      </div>
    </div>
  )
}
