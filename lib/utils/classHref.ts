// The `.ts` extension is deliberate (`allowImportingTsExtensions`): this
// module is loaded directly by `scripts/verify-class-context.mts` and imported
// by `lib/scores/workspace.ts`, which node loads too. Same convention as
// `lib/scores/semester.ts` and `lib/classroom/classes.ts`, for the same reason
// — the `@/` alias and extensionless resolution are bundler features, and a
// harness that has no bundler must still exercise the real module.
import { CLASS_PARAM } from './scopeParam.ts'

/**
 * Which routes are *about a class*, and how a link carries that class along.
 *
 * ── The failure this closes ────────────────────────────────────────────────
 *
 * The active class already had two halves that agreed with each other:
 * `TeacherContext` on the client, `?class=` on the server, written together by
 * `useSelectActiveClass`. What it did not have was a way to survive a
 * *navigation*. Not one link in the sidebar, the mobile bar, the command
 * palette or the breadcrumb carried the parameter, and neither did the
 * twenty-eight cross-links between feature screens — so a teacher who selected
 * ៥ខ on `/classroom` and then clicked ពិន្ទុ in the sidebar landed on
 * `/score/enter` with no parameter at all, where `resolveServerScope` fell back
 * to their *default* class and served ៥ក's marks under a heading that still
 * said ៥ខ.
 *
 * Every screen was individually correct. The product was not, because the
 * context was re-derived at each door instead of being carried through it.
 *
 * ── Why a declared list rather than "append it everywhere" ─────────────────
 *
 * `?class=` on `/profile` or `/tutorial` is a lie in the address bar: it
 * suggests the page is scoped by something it never reads, and it would be
 * copied into a shared link that promises a class view the recipient will not
 * get. So the parameter is attached only to routes that actually resolve it.
 *
 * The list is data, and it is checked rather than trusted:
 * `scripts/verify-class-context.mts` parses every page under `app/(main)/` and
 * fails if a route reads the class (`classIdFromSearchParams`, `useActiveClass`)
 * without appearing here, or appears here without existing. A hand-maintained
 * list that nothing verifies is the drift this module exists to prevent — the
 * same reason `NAV_MODULES` is derived from `NAV_SECTIONS` rather than typed
 * out twice.
 *
 * Pure and isomorphic on purpose: the server components, the client shell and
 * the node verification harness all read the one copy. Keep it free of
 * `server-only` imports and of `next/*`.
 */

/**
 * Route prefixes whose data is scoped by the active class.
 *
 * A prefix matches the route itself and everything under it, so
 * `/attendance` covers `monthly`, `yearly` and `layout` in one entry — but
 * only where *every* child is class-scoped. `/score` is deliberately NOT a
 * prefix: it is spelled out per child, because a future `/score/something`
 * that is not class-scoped must not inherit the parameter by accident.
 */
export const CLASS_SCOPED_ROUTES: readonly string[] = [
  '/attendance',
  '/certificate',
  '/class-admin',
  '/classroom',
  '/dashboard',
  '/enrollment',
  '/homework/enter',
  '/honor-roll',
  '/id-student',
  '/notifications',
  '/parent-report',
  '/print-center',
  '/print-list',
  '/print-student-age',
  '/print-student-codes',
  '/ranking',
  '/record-book',
  '/score-analyse',
  '/score-analysis/subject',
  '/score/collect',
  '/score/enter',
  '/score/print',
  '/score/subjects',
  '/score/template',
  '/score/total',
  '/student-list',
  '/student-tracking',
  '/yearly-report',
] as const

/**
 * Does this href name a class-scoped route?
 *
 * Compares the *path* only: a query string or a hash on the input must not
 * change the answer, and `/scoreboard` must not match `/score`.
 */
export function isClassScopedPath(href: string): boolean {
  const path = href.split(/[?#]/)[0]
  return CLASS_SCOPED_ROUTES.some((r) => path === r || path.startsWith(r + '/'))
}

/**
 * The href a teacher should actually follow, given the class they are in.
 *
 * Returns the input unchanged — never a rewritten one — in the three cases
 * where adding the parameter would be wrong rather than merely useless:
 *
 *   no class          a pre-V2 account has none, and `resolveServerScope`
 *                     falls back to `teacher_id` scoping. `?class=` would be
 *                     an empty promise.
 *   not class-scoped  see the note above on `/profile`.
 *   already carries a class  a link that names its own class — the per-class
 *                     tools on a `/classroom` card — is making a deliberate
 *                     statement about a class other than the active one, and
 *                     the ambient context must not overwrite it.
 *
 * Nothing here is an authorisation: `resolveServerScope` re-validates the id
 * against the caller's own assignments on every request, so a forged or stale
 * `?class=` resolves to their own default rather than widening anything.
 */
export function withClassParam(href: string, classId: string | null | undefined): string {
  if (!classId) return href
  if (!isClassScopedPath(href)) return href

  const [path, rest = ''] = href.split('#')
  const [base, query = ''] = path.split('?')

  const params = new URLSearchParams(query)
  if (params.has(CLASS_PARAM)) return href
  params.set(CLASS_PARAM, classId)

  return `${base}?${params.toString()}${rest ? `#${rest}` : ''}`
}
