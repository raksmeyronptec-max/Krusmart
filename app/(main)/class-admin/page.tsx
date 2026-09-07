import Link from 'next/link'
import { redirect } from 'next/navigation'
import { GraduationCap } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BOOKS } from '@/lib/class-admin/books'
import { countBookEntries } from './actions'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { classIdFromSearchParams, resolveServerScope } from '@/lib/utils/serverScope'
import { getCurrentAcademicYear } from '@/lib/constants/academic'
import { withClassParam } from '@/lib/utils/classHref'
import BookIcon from './BookIcon'

export const metadata = { title: 'រដ្ឋបាលថ្នាក់រៀន' }

/**
 * Index of the 13 class-administration books.
 *
 * The legacy build put these behind a dark sidebar that loaded each form into an
 * iframe. A grid of cards does the same job without nesting a document inside a
 * document — which is what broke printing there, since `window.print()` on the
 * shell printed the shell rather than the form.
 */
export default async function ClassAdminPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  /*
   * WHICH CLASS THESE BOOKS ARE ABOUT.
   *
   * `countBookEntries` has always scoped by the resolved class — the entries
   * behind these thirteen cards belong to one class — and the page said so
   * nowhere. A teacher holding two classes read thirteen counts with no way to
   * tell whose they were, on the one screen in the app whose whole subject is
   * official paperwork.
   *
   * Resolved through the same function every other server surface uses, so this
   * screen cannot name a different class from the one its counts came from.
   */
  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)

  let className = ''
  if (scope.mode === 'v2') {
    const { data } = await supabase
      .from('classes').select('name').eq('id', scope.classId).maybeSingle()
    className = (data?.name as string | undefined) ?? ''
  } else {
    // A pre-V2 account has no `classes` row but does have the class name it
    // prints on every sheet — the same fallback the Print Center makes.
    const { data } = await supabase
      .from('settings').select('class_name').eq('teacher_id', user.id).maybeSingle()
    className = (data?.class_name as string | undefined) ?? ''
  }

  const counts = await countBookEntries()
  const classId = scope.mode === 'v2' ? scope.classId : null

  return (
    /*
     * `PageContainer` and `PageHeader`, not a bespoke `max-w-6xl` box and a
     * hand-built header. This screen was the last one in the module carrying
     * its own frame, which also meant it was missing `data-app-frame` — the
     * attribute that drops the layout box when printing, so the books' own
     * A4 sheets measured differently here from everywhere else.
     */
    <PageContainer>
      <PageHeader
        title="រដ្ឋបាលថ្នាក់រៀន"
        description={`ឯកសាររដ្ឋបាលថ្នាក់រៀនទាំង ${toKhmerNumber(BOOKS.length)} ប្រភេទ — បញ្ចូល រក្សាទុក និងបោះពុម្ព`}
      />

      <section
        aria-label="បរិបទបច្ចុប្បន្ន"
        className="mb-5 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-divider bg-bg-surface px-4 py-3 print:hidden"
      >
        <span className="flex items-center gap-2 text-sm">
          <GraduationCap className="h-4 w-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="text-text-muted">ថ្នាក់</span>
          <span className="font-bold text-text-heading">{className || '—'}</span>
        </span>
        <span className="flex items-center gap-2 text-sm">
          <span className="text-text-muted">ឆ្នាំសិក្សា</span>
          <span className="font-bold text-text-heading">{getCurrentAcademicYear()}</span>
        </span>
      </section>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BOOKS.map((book) => {
          const count = counts[book.id] ?? 0
          return (
            <Link
              key={book.id}
              href={withClassParam(`/class-admin/${book.id}`, classId)}
              className="group flex flex-col rounded-xl border border-divider bg-bg-surface p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-divider hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <div className="mb-3 flex items-start justify-between gap-3">
                <div className="rounded-xl bg-brand-100 p-2.5 text-brand transition group-hover:bg-brand-100 dark:bg-brand-900/60 dark:text-brand-300">
                  <BookIcon name={book.icon} />
                </div>
                {count > 0 && (
                  <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-bold text-success dark:bg-success/10 dark:text-success">
                    {toKhmerNumber(count)} កំណត់ត្រា
                  </span>
                )}
              </div>
              <h2 className="mb-1.5 text-sm font-bold text-text-heading">{book.title}</h2>
              <p className="text-xs leading-relaxed text-text-muted">{book.description}</p>
            </Link>
          )
        })}
      </div>
    </PageContainer>
  )
}
