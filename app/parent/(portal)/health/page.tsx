'use client'

import { HeartPulse } from 'lucide-react'
import { PortalHeader, EmptyState } from '../../PortalHeader'

/**
 * health tracking.
 *
 * The legacy portal read a Firestore `health_tracking` collection. Supabase has no
 * equivalent table and the teacher app has no screen that produces this data, so
 * there is nothing to display yet. The page keeps the portal's layout and states
 * that plainly rather than rendering an empty shell that looks broken.
 */
export default function ParentHeartPulsePage() {
  return (
    <>
      <PortalHeader titleKey="health_title" />
      <section className="px-4 py-6">
        <EmptyState
          messageKey="coming_soon"
          descriptionKey="coming_soon_desc"
          icon={<HeartPulse className="h-10 w-10" />}
        />
      </section>
    </>
  )
}
