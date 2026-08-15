'use client'

import { BookUser } from 'lucide-react'
import { PortalHeader, EmptyState } from '../../PortalHeader'

/**
 * library tracking.
 *
 * The legacy portal read a Firestore `library_tracking` collection. Supabase has no
 * equivalent table and the teacher app has no screen that produces this data, so
 * there is nothing to display yet. The page keeps the portal's layout and states
 * that plainly rather than rendering an empty shell that looks broken.
 */
export default function ParentBookUserPage() {
  return (
    <>
      <PortalHeader titleKey="library_title" />
      <section className="px-4 py-6">
        <EmptyState
          messageKey="coming_soon"
          descriptionKey="coming_soon_desc"
          icon={<BookUser className="h-10 w-10" />}
        />
      </section>
    </>
  )
}
