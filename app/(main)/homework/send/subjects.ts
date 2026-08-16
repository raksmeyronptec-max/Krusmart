/**
 * The subject list the homework composer offers.
 *
 * Deliberately *not* `STANDARD_SUBJECT_LABELS`: that map is keyed by the short
 * codes written into `scores.subject` (`kh_read`, `sem_math`), whereas
 * `homework_assignments.subject` is free text that a parent reads verbatim in
 * the portal. The two vocabularies serve different columns and must not be
 * merged — a parent would see `kh_read` on their child's homework card.
 *
 * Grouped for the picker; the stored value is the Khmer label itself.
 */

export interface SubjectGroup {
  group: string
  items: string[]
}

export const HOMEWORK_SUBJECT_GROUPS: readonly SubjectGroup[] = [
  {
    group: 'ភាសាខ្មែរ',
    items: [
      'ភាសាខ្មែរ (គ្រប់បំណិន)',
      'សមត្ថភាពស្តាប់',
      'សមត្ថភាពសរសេរ',
      'សមត្ថភាពអាន',
      'សមត្ថភាពនិយាយ',
      'អក្សរផ្ចង់',
      'មេសូត្រ',
      'តែងសេចក្តី',
    ],
  },
  {
    group: 'គណិតវិទ្យា',
    items: ['គណិតវិទ្យា (គ្រប់ផ្នែក)', 'ចំនួន', 'រង្វាស់រង្វាល់', 'ធរណីមាត្រ', 'ពីជគណិត', 'ស្ថិតិ'],
  },
  {
    group: 'វិទ្យាសាស្ត្រ',
    items: [
      'វិទ្យាសាស្ត្រ (រួម)',
      'រូបវិទ្យា',
      'គីមីវិទ្យា',
      'ជីវវិទ្យា',
      'ផែនដីវិទ្យា-បរិស្ថាន',
      'វិទ្យាសាស្ត្រអនុវត្តន៍',
    ],
  },
  {
    group: 'សិក្សាសង្គម',
    items: ['សិក្សាសង្គម (រួម)', 'សីលធម៌-ពលរដ្ឋវិជ្ជា', 'ភូមិវិទ្យា', 'ប្រវត្តិវិទ្យា', 'គេហវិទ្យា-អប់រំសិល្បៈ'],
  },
  { group: 'អប់រំសុខភាព', items: ['អប់រំកាយ និងកីឡា', 'សុខភាព និងអនាម័យ'] },
  { group: 'ផ្សេងៗ', items: ['អប់រំបំណិនជីវិត', 'ភាសាបរទេស'] },
] as const

/** Flattened into the `{ value, label, group }` shape the pickers take. */
export const HOMEWORK_SUBJECT_OPTIONS = HOMEWORK_SUBJECT_GROUPS.flatMap((g) =>
  g.items.map((item) => ({ value: item, label: item, group: g.group })),
)

/**
 * Badge colour for a subject.
 *
 * Categorical, not ordinal: the hue tells a teacher at a glance which subject a
 * card is for, so the families stay visually distinct instead of collapsing
 * into the brand ramp. Drawn from the design system's own tokens. The label is
 * always rendered beside it — the colour is never the only signal.
 */
export function subjectBadgeVariant(subject: string): 'danger' | 'gold' | 'success' | 'info' | 'muted' {
  if (subject.includes('គណិត')) return 'danger'
  if (subject.includes('ខ្មែរ')) return 'gold'
  if (subject.includes('វិទ្យាសាស្ត្រ')) return 'success'
  if (subject.includes('សង្គម')) return 'info'
  return 'muted'
}
