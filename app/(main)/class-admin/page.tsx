import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowLeft, BookOpen } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { BOOKS } from '@/lib/class-admin/books'
import { countBookEntries } from './actions'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
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
export default async function ClassAdminPage() {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const counts = await countBookEntries()

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 md:py-8">
      <Link
        href="/dashboard"
        className="mb-6 inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/60 px-4 py-2 font-bold text-brand shadow-sm backdrop-blur-sm transition hover:text-brand-800"
      >
        <ArrowLeft className="h-5 w-5" aria-hidden="true" /> ត្រឡប់ទៅទំព័រដើម
      </Link>

      <header className="mb-8 flex items-center gap-4 rounded-xl border border-divider bg-bg-surface p-6 shadow-sm">
        <div className="rounded-xl bg-brand-100 p-3.5 text-brand dark:bg-brand-900">
          <BookOpen className="h-7 w-7" aria-hidden="true" />
        </div>
        <div>
          <h1 className="kh-moul text-xl text-brand md:text-2xl dark:text-brand-300">
            រដ្ឋបាលថ្នាក់រៀន
          </h1>
          <p className="mt-1 text-sm text-text-muted">
            ឯកសាររដ្ឋបាលថ្នាក់រៀនទាំង {toKhmerNumber(BOOKS.length)} ប្រភេទ — បញ្ចូល រក្សាទុក និងបោះពុម្ព
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {BOOKS.map((book) => {
          const count = counts[book.id] ?? 0
          return (
            <Link
              key={book.id}
              href={`/class-admin/${book.id}`}
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
    </div>
  )
}
