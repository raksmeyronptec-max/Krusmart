/**
 * Sidebar layout preferences, stored in cookies rather than `localStorage`.
 *
 * `localStorage` cannot be read while the server renders, so a collapsed
 * sidebar would paint at 264px, hydrate, then jump to 68px — a 196px layout
 * shift on *every* navigation, which is both the worst kind of CLS and visibly
 * ugly. A cookie travels with the request, so `AppShell` renders the correct
 * width in the very first byte of HTML and nothing moves.
 *
 * These are deliberately *not* in `STORAGE_KEYS`: that constant documents the
 * `localStorage` schema, and adding cookie names to it would suggest the shell
 * writes to a store it does not touch. The shell reads and writes no
 * `localStorage` key at all.
 *
 * Both values are cosmetic. They are never trusted for anything, carry no
 * personal data, and are readable by script on purpose — the sidebar writes
 * them from the browser when the teacher collapses a rail or opens a group.
 */

/** `1` when the desktop sidebar is collapsed to the icon rail. */
export const NAV_COLLAPSED_COOKIE = 'ks_nav_collapsed'

/** Id of the nav group left expanded, so it survives a reload. */
export const NAV_GROUP_COOKIE = 'ks_nav_group'

/** One year. A layout preference should not quietly expire mid-term. */
export const NAV_PREF_MAX_AGE = 60 * 60 * 24 * 365

/**
 * Write a preference from the browser.
 *
 * `SameSite=Lax` because there is no cross-site use for either value, and no
 * `Secure` flag because the app is served over plain HTTP in local development
 * — a `Secure` cookie would silently never be set there, so the collapse
 * preference would appear not to persist.
 */
export function writeNavPref(name: string, value: string): void {
  if (typeof document === 'undefined') return
  document.cookie = `${name}=${encodeURIComponent(value)}; path=/; max-age=${NAV_PREF_MAX_AGE}; SameSite=Lax`
}
