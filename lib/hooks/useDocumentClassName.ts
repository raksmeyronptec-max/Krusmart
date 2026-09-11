'use client'

import { useActiveClass } from './useActiveClass'
import { documentClassName } from '@/lib/reporting/document-identity'

/**
 * The class name THIS SCREEN's printed sheet should carry.
 *
 * The client half of `documentClassName` — see that module for why the rule
 * exists. It reads `useActiveClass()`, which is the same selection `?class=`
 * carries to the server, so the letterhead and the rows beneath it are the same
 * class by construction rather than by coincidence.
 *
 * Pass the account's `settings.class_name` as the fallback. It is only ever
 * reached by a pre-V2 account, which has no class row to prefer.
 */
export function useDocumentClassName(settingsClassName: string | null | undefined): string {
  const { className } = useActiveClass()
  return documentClassName(className, settingsClassName)
}
