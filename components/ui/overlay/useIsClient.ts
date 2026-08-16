"use client"

import { useSyncExternalStore } from "react"

/**
 * True once the component is running in the browser.
 *
 * `createPortal` needs a real DOM node, which does not exist while the server
 * renders. The usual guard is `useState(false)` plus `useEffect(() => setMounted(true))`,
 * but that sets state synchronously inside an effect — React's compiler flags it
 * as a cascading render, and it is: the component renders once, commits, sets
 * state, and renders again.
 *
 * `useSyncExternalStore` expresses the same thing without the extra pass. The
 * store never changes, so `subscribe` has nothing to do; the value simply
 * differs between the server snapshot (`false`) and the client one (`true`).
 */
const subscribe = () => () => {}
const getClientSnapshot = () => true
const getServerSnapshot = () => false

export function useIsClient(): boolean {
  return useSyncExternalStore(subscribe, getClientSnapshot, getServerSnapshot)
}
