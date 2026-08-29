/**
 * Which subjects a class actually teaches, out of the curriculum available to it.
 *
 * This is the layer the score screens were missing. `lib/scores/template.ts`
 * answers "what subjects EXIST for this class" by merging system / school /
 * class definitions; this module answers "which of them does this class USE",
 * from `class_template_subjects` (migration 00028).
 *
 * The two are deliberately separate concepts and the distinction is the whole
 * point of the redesign:
 *
 *     curriculum subject   what a subject is        score_template_subjects
 *     subject component    one column of it         SubjectColumn.id
 *     template subject     the class teaches it     class_template_subjects
 *     score column         an enabled component     SubjectColumn.id
 *     custom subject       the teacher invented it  scope='class', cls_/cs_ key
 *
 * Pure and free of server-only imports, for the same reason `template.ts` is:
 * a client hook consumes it, and pulling `next/headers` in here breaks the
 * build.
 */

import type { EffectiveSubject, SubjectColumn } from './template'

/** One row of `class_template_subjects`, as the client sees it. */
export interface ClassSubjectSelection {
  subjectKey: string
  /** `null` means every column the subject's definition carries. */
  enabledColumns: string[] | null
  sortOrder: number
}

/**
 * Subject-key prefixes that mark a teacher's own subject rather than a
 * national one.
 *
 * `cls_` is minted by `addClassSubject`; `cs_` is what migration 00027 stamped
 * on the rows it converted out of the retired `custom_subjects` table. Both are
 * persisted in `scores.subject`, so they are schema — read them, never rewrite
 * them. Everything else (`kh_`, `math_`, `sci_`, `soc_`, `sem_`, `ex_`, `hs_`,
 * …) belongs to the curriculum.
 */
const TEACHER_ADDED_PREFIXES = ['cls_', 'cs_'] as const

/**
 * Is this a subject the teacher added, as opposed to one the curriculum
 * defines?
 *
 * Keyed on the prefix rather than on `origin === 'class'`, because those two
 * answer different questions: a class row that *overrides* `khmer_all` also has
 * origin `class`, but Khmer is still a national subject. The prefix is the only
 * thing that survives an override, which is what makes it the right test.
 */
export function isTeacherAddedSubject(subjectKey: string): boolean {
  return TEACHER_ADDED_PREFIXES.some((p) => subjectKey.startsWith(p))
}

/**
 * Narrow a class's effective subjects to the ones it has chosen to teach.
 *
 * The fallback is the important half. A class with no selection covering this
 * score type gets the full template back, unchanged — which is exactly how the
 * product behaved before 00028, so every existing account keeps its grid on the
 * day this ships. Only a class that has actually configured something is
 * narrowed. Same rule the legacy/v2 scope resolver follows: derive the mode
 * from the data, never from a flag.
 *
 * Note the fallback is decided *per score type*, not per class. A teacher who
 * configures their monthly subjects and never opens the semester grid must not
 * find it empty; the semester grid keeps resolving the whole template until it
 * is configured in its own right.
 *
 * Component filtering rides along: a selection may enable a subset of a
 * subject's columns. A subject whose enabled columns have all since vanished
 * from the definition falls back to the full column list rather than rendering
 * a subject with no columns, which would be an unusable row in the grid.
 */
export function applySelection(
  subjects: EffectiveSubject[],
  selection: ClassSubjectSelection[],
): EffectiveSubject[] {
  if (selection.length === 0) return subjects

  const byKey = new Map(selection.map((s) => [s.subjectKey, s]))

  // Only subjects belonging to *this* score type count as "configured": the
  // caller passes one score type's resolution at a time.
  const chosen = subjects.filter((s) => byKey.has(s.subjectKey))
  if (chosen.length === 0) return subjects

  return chosen
    .map((subject) => {
      const pick = byKey.get(subject.subjectKey)!
      const columns = filterColumns(subject.columns, pick.enabledColumns)
      return { ...subject, columns, sortOrder: pick.sortOrder }
    })
    .sort((a, b) => a.sortOrder - b.sortOrder || a.subjectKey.localeCompare(b.subjectKey))
}

/** The enabled subset of a subject's columns, or all of them. */
export function filterColumns(
  columns: SubjectColumn[],
  enabled: string[] | null | undefined,
): SubjectColumn[] {
  if (!enabled || enabled.length === 0) return columns
  const wanted = new Set(enabled)
  const kept = columns.filter((c) => wanted.has(c.id))
  // Every enabled id has since been renamed out of the definition. Showing the
  // whole subject beats showing a row with no cells in it.
  return kept.length > 0 ? kept : columns
}

/**
 * Has this class configured the given score type at all?
 *
 * Drives the first-visit setup state on `/score/enter` (§12). False means
 * "never configured", which is not the same as "teaches nothing" — there is no
 * way to express the latter, by design.
 */
export function hasConfiguredSelection(
  subjects: EffectiveSubject[],
  selection: ClassSubjectSelection[],
): boolean {
  if (selection.length === 0) return false
  const keys = new Set(selection.map((s) => s.subjectKey))
  return subjects.some((s) => keys.has(s.subjectKey))
}

// ---------------------------------------------------------------- catalogue

/** One curriculum subject as the picker offers it. */
export interface CatalogSubject {
  subjectKey: string
  labelKm: string
  groupLabel: string
  columns: SubjectColumn[]
  maxScore: number
  /** Already in the class's template — the picker disables rather than hides it (§8). */
  selected: boolean
  /** A subject the teacher added, not one the national curriculum defines (§10). */
  teacherAdded: boolean
}

/** Curriculum subjects under one heading. */
export interface CatalogGroup {
  label: string
  subjects: CatalogSubject[]
}

/** Heading used when a subject's definition carries none. */
export const UNGROUPED_LABEL = 'មុខវិជ្ជាផ្សេងៗ'

/**
 * The add-subject picker's contents: every subject the class's curriculum
 * offers for one score type, grouped by heading and in template order.
 *
 * Built from the *resolved* template, never from a constant — that is what
 * makes the picker grade-aware without knowing anything about grades, and what
 * stops a teacher inventing a curriculum subject here (§7): they can only pick
 * a key the server already resolved for their class.
 */
export function buildCatalog(
  subjects: EffectiveSubject[],
  selection: ClassSubjectSelection[],
): CatalogGroup[] {
  const selected = new Set(selection.map((s) => s.subjectKey))
  const groups = new Map<string, CatalogSubject[]>()

  for (const subject of subjects) {
    const label = subject.groupLabel?.trim() || UNGROUPED_LABEL
    const list = groups.get(label) ?? []
    list.push({
      subjectKey: subject.subjectKey,
      labelKm: subject.labelKm,
      groupLabel: label,
      columns: subject.columns,
      maxScore: subject.maxScore,
      selected: selected.has(subject.subjectKey),
      teacherAdded: isTeacherAddedSubject(subject.subjectKey),
    })
    groups.set(label, list)
  }

  return [...groups.entries()].map(([label, subjects]) => ({ label, subjects }))
}

/**
 * Filter a catalogue by a search box.
 *
 * Matches the subject label, its group heading and its component labels, so
 * typing `អាន` finds ភាសាខ្មែរ through its អាន column as well as សមត្ថភាពអាន
 * directly. Khmer has no case to fold, but the input is trimmed because a
 * trailing space from a mobile keyboard is common and would match nothing.
 */
export function searchCatalog(groups: CatalogGroup[], query: string): CatalogGroup[] {
  const q = query.trim().toLowerCase()
  if (!q) return groups

  const matches = (s: CatalogSubject) =>
    s.labelKm.toLowerCase().includes(q) ||
    s.groupLabel.toLowerCase().includes(q) ||
    s.subjectKey.toLowerCase().includes(q) ||
    s.columns.some((c) => c.label.toLowerCase().includes(q))

  return groups
    .map((g) => ({ ...g, subjects: g.subjects.filter(matches) }))
    .filter((g) => g.subjects.length > 0)
}
