import type { Actor } from '@/lib/rbac/actor'

/**
 * Where a teacher belongs before they have a class, and how far along they are.
 *
 * The state is derived from data, never from a stored wizard cursor — the same
 * principle `lib/utils/queryFilter.ts` uses to pick legacy vs v2 scope. That is
 * what makes the flow resumable for free: refresh, a second tab, the back
 * button and a re-login all land on the correct step with nothing re-entered,
 * because there is no cursor to fall out of sync with the rows.
 *
 * Every input already lives on `Actor`, so the gate in the (main) layout costs
 * no query of its own.
 */

export const ONBOARDING_ROOT = '/onboarding'

/** The four steps §29 shows in the progress rail. */
export const ONBOARDING_STEPS = [
  { key: 'organisation', label: 'ស្ថាប័ន', href: '/onboarding/organisation' },
  { key: 'level', label: 'កម្រិតសិក្សា', href: '/onboarding/level' },
  { key: 'class', label: 'ថ្នាក់', href: '/onboarding/class' },
  { key: 'students', label: 'សិស្ស', href: '/onboarding/students' },
] as const

export type OnboardingStepKey = (typeof ONBOARDING_STEPS)[number]['key']

/**
 * Education level and grade are two routes but one step to a teacher — "which
 * class do you teach?" — so the rail collapses them and the count stays honest
 * at four rather than five.
 */
const STEP_FOR_PATH: Record<string, OnboardingStepKey> = {
  '/onboarding/organisation': 'organisation',
  '/onboarding/level': 'level',
  '/onboarding/grade': 'level',
  '/onboarding/class': 'class',
  '/onboarding/students': 'students',
}

export function stepForPath(pathname: string): OnboardingStepKey | null {
  return STEP_FOR_PATH[pathname] ?? null
}

/**
 * The route a teacher must be sent to before the teacher app is usable, or
 * `null` to let them through.
 *
 * Deliberately returns `null` for a legacy account with a roster. Those
 * teachers are working today on the `teacher_id` path; interrupting them with a
 * mandatory wizard would risk the exact data their year depends on. They get
 * `LegacyUpgradeBanner` instead, which is opt-in.
 */
export function onboardingRedirect(actor: Actor | null): string | null {
  if (!actor || actor.kind !== 'teacher') return null

  // A class exists and is assigned — onboarding is finished by definition.
  if (actor.hasAssignments) return null

  // An organisation exists but no class does. The dashboard is the resume
  // surface now (§16 of the level-first flow): it carries a create-class call
  // to action into /onboarding/class, which loads every grade the school has.
  // Redirecting into the wizard here would make the dashboard unreachable for
  // exactly the person who just finished organisation setup.
  if (actor.selfServeSchoolIds.length > 0) return null

  // A member of somebody else's school — an approved join request. They hold
  // only `teacher`, so the wizard's level/class writes would be refused by
  // RLS; their class arrives as an admin assignment. The dashboard shows them
  // an awaiting-assignment banner instead.
  if (actor.memberSchoolIds.length > 0) return null

  // Pre-V2 account: leave it alone, offer the upgrade in the UI instead.
  if (actor.hasLegacyRoster) return null

  return '/onboarding/organisation'
}

/** True when this account has never set anything up and has no legacy data. */
export function isBrandNewTeacher(actor: Actor | null): boolean {
  return (
    actor?.kind === 'teacher' &&
    !actor.hasAssignments &&
    !actor.hasLegacyRoster &&
    // Membership of any kind — created or joined — means not brand-new.
    actor.memberSchoolIds.length === 0 &&
    actor.selfServeSchoolIds.length === 0
  )
}

/**
 * True when a pre-V2 teacher should be offered the opt-in upgrade: they have a
 * roster keyed on `teacher_id` but no class to hold it.
 */
export function shouldOfferLegacyUpgrade(actor: Actor | null): boolean {
  return (
    actor?.kind === 'teacher' &&
    !actor.hasAssignments &&
    actor.hasLegacyRoster &&
    actor.selfServeSchoolIds.length === 0
  )
}
