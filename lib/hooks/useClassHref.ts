'use client'

import { useCallback } from 'react'
import { useActiveClass } from './useActiveClass'
import { withClassParam } from '@/lib/utils/classHref'

/**
 * Rewrite a link so it carries the class the teacher is currently working in.
 *
 * The counterpart to `useSelectActiveClass`: that hook is how the active class
 * *changes*, this is how it *survives a navigation*. Between them the class is
 * written once and carried everywhere, which is the whole of the product's
 * "the active class is the working context" rule.
 *
 * Returns a stable function so a caller can map it over a list of links without
 * re-rendering the list on every parent render.
 *
 * Deliberately reads `useActiveClass` and not `useSearchParams`: the context is
 * the fresher of the two during the moment between a class switch and the
 * router settling, and it is the same value the top bar is displaying — so a
 * link can never point somewhere other than what the chip says.
 */
export function useClassHref(): (href: string) => string {
  const { classId } = useActiveClass()
  return useCallback((href: string) => withClassParam(href, classId), [classId])
}
