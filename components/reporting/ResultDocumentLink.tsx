'use client'

import Link from 'next/link'
import { FileOutput } from 'lucide-react'

import { useActiveClass } from '@/lib/hooks/useActiveClass'
import {
  resultDocument,
  type ResultPeriod,
  type ResultSurface,
} from '@/lib/reporting/result-documents'

/**
 * The one control that carries a teacher from a RESULT to the DOCUMENT of it.
 *
 * Phase 12's headline finding (F5) was that `/ranking`, `/honor-roll`,
 * `/score/total` and `/yearly-report` referenced `/print-center` zero times
 * between them: the product could show a teacher a ranked class and then had no
 * answer to "how do I print this?" other than the sidebar. This is that answer,
 * and it is one component rather than four links so the four screens cannot
 * drift on where it goes, what it says, or whether it should be offered at all
 * — `lib/reporting/result-documents.ts` decides all three, from the catalogue.
 *
 * ── It is a LINK, not a button ────────────────────────────────────────────
 *
 * It navigates, so it is an anchor: middle-click, copy-link and the browser's
 * own back button all have to work, and a teacher who lands in the generation
 * flow by mistake must be one back-press from the table they were reading.
 *
 * ── It does not produce the document itself ───────────────────────────────
 *
 * Deliberately. The Print Center owns period selection, the template picker,
 * the rendered preview and the certificate's pupil selection, and a second
 * generate path on a results screen would be the competing production surface
 * §7 exists to close — the exact shape of the two-ranking-print-paths problem
 * this phase is fixing. This link opens that flow already focused, and stops.
 */
export function ResultDocumentLink({
  surface,
  period,
  academicYear,
  shape = 'action',
  className = '',
}: {
  surface: ResultSurface
  period: ResultPeriod
  /** The year the screen is showing — carried so the centre agrees with it. */
  academicYear?: string | null
  /**
   * `action` is the header pill; `icon` is the round control that joins the
   * print and close buttons on a rendered A4 preview, where the toolbar is a
   * fixed column of circles and a pill would not fit.
   */
  shape?: 'action' | 'icon'
  className?: string
}) {
  // The same selection the top bar shows and `?class=` carries to the server,
  // so the class named on this screen and the class the document is built for
  // are the same one by construction.
  const { classId } = useActiveClass()

  const target = resultDocument({ surface, period, classId, academicYear })

  if (shape === 'icon') {
    return (
      <Link
        href={target.href}
        // Icon-only, so the name has to be carried by the label rather than by
        // the glyph — §18, and the reason this app has zero unnamed icon
        // buttons across 45 routes.
        aria-label={target.label}
        title={target.label}
        className={`group flex min-h-11 min-w-11 items-center justify-center rounded-full bg-gold p-3.5 text-brand-950 shadow-lg transition-all hover:scale-110 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${className}`}
      >
        <FileOutput className="h-6 w-6" aria-hidden="true" />
      </Link>
    )
  }

  return (
    <Link
      href={target.href}
      className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-bold text-brand-contrast transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${className}`}
    >
      <FileOutput className="h-4 w-4" aria-hidden="true" />
      {target.label}
    </Link>
  )
}

export default ResultDocumentLink
