import { notFound, redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { BOOKS, getBook } from '@/lib/class-admin/books'
import { listBookEntries } from '../actions'
import BookClient from './BookClient'
import type { Settings } from '@/lib/types'

/** Pre-render the 13 known book routes; anything else is a 404. */
export function generateStaticParams() {
  return BOOKS.map((b) => ({ book: b.id }))
}

export async function generateMetadata({ params }: { params: Promise<{ book: string }> }) {
  const { book } = await params
  return { title: getBook(book)?.printTitle ?? 'រដ្ឋបាលថ្នាក់រៀន' }
}

export default async function ClassAdminBookPage({
  params,
}: {
  params: Promise<{ book: string }>
}) {
  const { book: bookId } = await params

  const book = getBook(bookId)
  if (!book) notFound()

  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // `settings` supplies the letterhead every one of these forms prints.
  const [{ data: settings }, initialEntries] = await Promise.all([
    supabase.from('settings').select('*').eq('teacher_id', user.id).maybeSingle(),
    listBookEntries(book.id),
  ])

  return (
    <BookClient
      book={book}
      initialEntries={initialEntries}
      settings={(settings as Settings) ?? null}
    />
  )
}
