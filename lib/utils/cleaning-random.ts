import type { CleaningGroups, CleaningLeaders, CleaningMember, Student } from '@/lib/types'

/**
 * Automatic assignment of cleaning duty — `ចាត់តាំងវេនសម្អាតដោយស្វ័យប្រវត្តិ`.
 *
 * Carried over from the legacy `cleaning-schedule/random.html`. The rules that
 * matter, and why:
 *
 *   * Class committee members are excluded. They supervise; they are not on a
 *     rota.
 *   * Girls and boys are dealt into the days as two separate passes. Shuffling
 *     one combined pool would regularly leave one day all-boys and another
 *     all-girls — the reason the legacy code split the pool at all.
 *   * Each day's group is then shuffled again before roles are assigned, so the
 *     leader is not always whoever the gender pass happened to place first.
 *
 * Kept as a pure function so it can be exercised without a browser; the page
 * only supplies the roster and reads back the result.
 */

/** Khmer labels the legacy build wrote onto each member. */
export const CLEANING_ROLES = {
  leader: 'ប្រធាន',
  deputy: 'អនុប្រធាន',
  member: 'សមាជិក',
} as const

/** `Math.random` by default; tests inject a deterministic source. */
export type RandomFn = () => number

/** Fisher–Yates. Returns a new array — the input is never mutated. */
export function shuffle<T>(input: readonly T[], random: RandomFn = Math.random): T[] {
  const out = [...input]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Ids of the three committee slots, for exclusion from the rota. */
export function leaderIds(leaders: CleaningLeaders): Set<string> {
  return new Set(
    [leaders.pres, leaders.vp1, leaders.vp2]
      .filter((l): l is CleaningMember => l !== null && l !== undefined)
      .map((l) => l.id),
  )
}

function toMember(s: Student): CleaningMember {
  return { id: s.id, name: s.name_kh, image: s.photo_url }
}

/** The legacy build recorded gender as either the Khmer or the English word. */
function isFemale(s: Student): boolean {
  return s.gender === 'ស្រី' || s.gender === 'Female'
}

/**
 * Build the rota.
 *
 * `selectedDays` are the day ids to fill. Days outside that list are returned
 * untouched from `existing` — the legacy version reset every day in its config
 * and so silently wiped rotas the teacher had arranged by hand for days they
 * were not currently randomising.
 */
export function randomiseCleaningGroups({
  students,
  leaders,
  selectedDays,
  existing,
  random = Math.random,
}: {
  students: Student[]
  leaders: CleaningLeaders
  selectedDays: string[]
  existing?: CleaningGroups
  random?: RandomFn
}): CleaningGroups {
  const result: CleaningGroups = { ...(existing ?? {}) }
  if (selectedDays.length === 0) return result

  for (const day of selectedDays) result[day] = []

  const excluded = leaderIds(leaders)
  const available = students.filter((s) => !excluded.has(s.id))

  const females = shuffle(available.filter(isFemale), random)
  const males = shuffle(available.filter((s) => !isFemale(s)), random)

  // Deal each pool round-robin across the days, girls first, so the counts stay
  // within one of each other on both axes.
  let cursor = 0
  const deal = (pool: Student[]) => {
    for (const student of pool) {
      result[selectedDays[cursor]].push(toMember(student))
      cursor = (cursor + 1) % selectedDays.length
    }
  }
  deal(females)
  deal(males)

  for (const day of selectedDays) {
    const shuffled = shuffle(result[day], random)
    result[day] = shuffled.map((m, i) => ({
      ...m,
      role: i === 0 ? CLEANING_ROLES.leader : i === 1 ? CLEANING_ROLES.deputy : CLEANING_ROLES.member,
    }))
  }

  return result
}
