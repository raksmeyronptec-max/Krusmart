/**
 * Name of the query param carrying the active class id.
 *
 * Lives in its own module because `lib/utils/serverScope.ts` is `server-only`
 * and `ClassContextSwitcher` is a client component — both need this constant.
 */
export const CLASS_PARAM = 'class'
