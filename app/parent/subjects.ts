/**
 * Khmer labels for the standard subject keys the teacher app writes into
 * `scores.subject`.
 *
 * Custom subjects are deliberately absent: they live in the teacher's
 * `localStorage` (`custom_subjects`) and are not readable by anyone else, so the
 * portal falls back to showing the raw key. This resolves once that store moves
 * to Supabase.
 */
export const STANDARD_SUBJECT_LABELS: Record<string, string> = {
  kh_listen: 'ភាសាខ្មែរ (ស្តាប់)',
  kh_speak: 'ភាសាខ្មែរ (និយាយ)',
  kh_read: 'ភាសាខ្មែរ (អាន)',
  kh_write: 'ភាសាខ្មែរ (សរសេរ)',
  kh_calligraphy: 'អក្សរផ្ចង់',
  kh_recitation: 'មេសូត្រ',
  kh_essay: 'តែងសេចក្តី',
  math_num: 'គណិត (ចំនួន)',
  math_meas: 'គណិត (រង្វាស់)',
  math_geo: 'គណិត (ធរណីមាត្រ)',
  math_alg: 'គណិត (ពីជគណិត)',
  math_stat: 'គណិត (ស្ថិតិ)',
  sci_phy: 'រូបវិទ្យា',
  sci_chem: 'គីមីវិទ្យា',
  sci_bio: 'ជីវវិទ្យា',
  sci_earth: 'ផែនដីវិទ្យា',
  sci_applied: 'វិទ្យាសាស្ត្រអនុវត្តន៍',
  soc_ethic: 'សីលធម៌',
  soc_geo: 'ភូមិវិទ្យា',
  soc_hist: 'ប្រវត្តិវិទ្យា',
  soc_home: 'គេហវិទ្យា',
  pe_sport: 'អប់រំកាយ',
  health_hygiene: 'សុខភាព និងអនាម័យ',
  life_skill: 'បំណិនជីវិត',
  foreign: 'ភាសាបរទេស',
  ex_oral: 'សំណួរផ្ទាល់មាត់',
  ex_att: 'វត្តមាន',
  ex_book: 'សៀវភៅ',
  ex_hw: 'កិច្ចការផ្ទះ',
  sem_kh_reading: 'អំណាន',
  sem_kh_listening_speaking: 'ស្តាប់-និយាយ',
  sem_kh_dictation: 'សរសេរតាមអាន',
  sem_kh_essay: 'តែងសេចក្តី',
  sem_math: 'គណិតវិទ្យា',
  sem_science: 'វិទ្យាសាស្ត្រ',
  sem_moral_civics: 'សីលធម៌-ពលរដ្ឋ',
  sem_geo: 'ភូមិវិទ្យា',
  sem_hist: 'ប្រវត្តិវិទ្យា',
  sem_home_arts: 'គេហៈ-សិល្បៈ',
  sem_life_skills: 'បំណិនជីវិត',
  sem_foreign: 'ភាសាបរទេស',
  sem_sport: 'អប់រំកាយ-សុខភាព',
}
