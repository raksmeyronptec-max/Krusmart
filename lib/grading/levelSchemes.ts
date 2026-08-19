/**
 * Which grading scheme an education level uses — as data, not branching.
 *
 * The resolution path the score screens follow is
 * class → education level → scheme, and this map is the last hop. Consumers
 * never write `if (level === 'primary')`; they ask for the level's scheme and
 * hand it to the engine, which is what keeps one calculation architecture
 * serving all three levels.
 *
 * Both secondary levels share one scheme deliberately: the MoEYS scale
 * (/50 average, coefficient = max ÷ 50, shifted descriptors) is identical for
 * them — see docs/score-system-design.md §3.2–3.3. If they ever diverge, the
 * divergence is one line here, not a hunt through consumers.
 *
 * `grading_schemes` rows can override per school (parseSchemeConfig); no
 * feature reads them at runtime yet — the admin screen only displays them —
 * so this map is the runtime truth and migration 00023 keeps the stored rows
 * agreeing with it.
 *
 * Pure and node-loadable (relative, .ts-qualified imports) for the harnesses.
 */

import {
  DEFAULT_SCHEME_CONFIG,
  SECONDARY_SCHEME_CONFIG,
  type GradingSchemeConfig,
} from './scheme.ts'
import type { EducationLevelKey } from '../onboarding/curriculum.ts'

export const LEVEL_SCHEME_CONFIGS: Record<EducationLevelKey, GradingSchemeConfig> = {
  primary: DEFAULT_SCHEME_CONFIG,
  lower_secondary: SECONDARY_SCHEME_CONFIG,
  upper_secondary: SECONDARY_SCHEME_CONFIG,
}

/**
 * The scheme for a level, defaulting to primary — the fallback every legacy
 * account without a class context has always lived on. `null`/`undefined`
 * means "no level resolved", never an error: an unresolved context must grade
 * exactly the way the app graded before levels existed.
 */
export function schemeForLevel(
  levelKey: EducationLevelKey | null | undefined,
): GradingSchemeConfig {
  return levelKey ? LEVEL_SCHEME_CONFIGS[levelKey] : DEFAULT_SCHEME_CONFIG
}
