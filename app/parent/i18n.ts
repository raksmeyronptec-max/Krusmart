/**
 * Parent portal translations, carried over from the legacy portal's
 * `translations` object so the wording stays identical.
 *
 * Khmer is the default; English is the secondary the settings screen toggles to.
 */

export type Lang = 'km' | 'en'

export const PARENT_LANG_KEY = 'krusmart_parent_lang'

const km = {
  // auth
  auth_title: 'KruSmart',
  auth_subtitle: 'សម្រាប់អាណាព្យាបាលសិស្ស',
  email_label: 'អ៊ីមែល',
  email_placeholder: 'ឧទាហរណ៍៖ parent@example.com',
  password_label: 'ពាក្យសម្ងាត់',
  password_placeholder: '••••••••',
  login_btn: 'ចូលប្រើប្រាស់',
  logging_in: 'កំពុងចូល...',
  login_error_default: 'ព័ត៌មានមិនត្រឹមត្រូវ។',
  login_footer: 'សូមទាក់ទងគ្រូបង្រៀន ដើម្បីទទួលបានគណនីអាណាព្យាបាល។',

  // dashboard
  school_name_default: 'សាលាបឋមសិក្សា',
  academic_year_default: 'ឆ្នាំសិក្សា',
  student_info_label: 'ព័ត៌មានកូនរបស់អ្នក៖',
  unknown_name: 'មិនស្គាល់ឈ្មោះ',
  tracking_features: 'មុខងារតាមដាន',
  student_info_heading: 'ព័ត៌មានសិស្ស',
  loading: 'កំពុងទាញយក...',

  // feature cards
  track_attendance: 'តាមដានវត្តមាន',
  track_grades: 'តាមដានពិន្ទុ',
  track_homework: 'កិច្ចការផ្ទះ',
  track_health: 'តាមដានសុខភាព',
  track_library: 'បណ្ណាល័យ',
  track_card: 'កាតសិស្ស',
  info_profile: 'ប្រវត្តិរូប',
  info_family: 'គ្រួសារ',

  // nav
  nav_home: 'ទំព័រដើម',
  nav_settings: 'ការកំណត់',
  back: 'ត្រឡប់ក្រោយ',

  // notifications
  notif_title: 'ការជូនដំណឹង',
  notif_subtitle: 'សារពីសាលារៀន',
  notif_empty: 'មិនទាន់មានសារថ្មីទេ',

  // settings
  settings_title: 'ការកំណត់',
  preferences: 'ចំណូលចិត្ត',
  theme: 'រូបរាង (Theme)',
  dark_mode_active: 'កំពុងប្រើ Dark Mode',
  light_mode_active: 'កំពុងប្រើ Light Mode',
  language_label: 'ភាសា',
  account_info: 'ព័ត៌មានគណនី',
  logout_btn: 'ចាកចេញ',
  logout_desc: 'ចាកចេញពីគណនីដោយសុវត្ថិភាព។',

  // attendance
  attendance_title: 'តាមដានវត្តមាន',
  present: 'មានវត្តមាន',
  absent: 'អវត្តមាន',
  late: 'មកយឺត',
  permission: 'សុំច្បាប់',
  attendance_rate: 'អត្រាវត្តមាន',
  total_days: 'ចំនួនថ្ងៃសរុប',
  no_attendance: 'មិនទាន់មានទិន្នន័យវត្តមានទេ',

  // grades
  grades_title: 'តាមដានពិន្ទុ',
  subject: 'មុខវិជ្ជា',
  score: 'ពិន្ទុ',
  grade: 'និទ្ទេស',
  average: 'មធ្យមភាគ',
  monthly: 'ប្រចាំខែ',
  semester: 'ប្រចាំឆមាស',
  no_scores: 'មិនទាន់មានពិន្ទុទេ',

  // homework
  homework_title: 'កិច្ចការផ្ទះ',
  due_date: 'ថ្ងៃកំណត់',
  no_homework: 'មិនទាន់មានកិច្ចការផ្ទះទេ',

  // profile / family / card
  profile_title: 'ប្រវត្តិរូបសិស្ស',
  family_title: 'ព័ត៌មានគ្រួសារ',
  card_title: 'កាតសិស្ស',
  father: 'ឪពុក',
  mother: 'ម្តាយ',
  guardian: 'អាណាព្យាបាល',
  occupation: 'មុខរបរ',
  student_id: 'អត្តលេខសិស្ស',
  full_name: 'គោត្តនាម និងនាម',
  gender: 'ភេទ',
  dob: 'ថ្ងៃខែឆ្នាំកំណើត',
  phone: 'លេខទូរស័ព្ទ',
  address: 'អាសយដ្ឋាន',
  birth_place: 'ទីកន្លែងកំណើត',
  class_label: 'ថ្នាក់',
  not_set: 'មិនទាន់កំណត់',

  // empty / coming soon
  coming_soon: 'មិនទាន់មានទិន្នន័យ',
  coming_soon_desc: 'មុខងារនេះនឹងមកដល់ក្នុងពេលឆាប់ៗ',
  health_title: 'តាមដានសុខភាព',
  library_title: 'បណ្ណាល័យ',
} as const

type Keys = keyof typeof km

const en: Record<Keys, string> = {
  auth_title: 'KruSmart',
  auth_subtitle: 'For Student Guardians',
  email_label: 'Email',
  email_placeholder: 'e.g. parent@example.com',
  password_label: 'Password',
  password_placeholder: '••••••••',
  login_btn: 'Sign In',
  logging_in: 'Signing in...',
  login_error_default: 'Invalid credentials.',
  login_footer: 'Contact your teacher to receive a guardian account.',

  school_name_default: 'Primary School',
  academic_year_default: 'Academic Year',
  student_info_label: 'Your child:',
  unknown_name: 'Unknown',
  tracking_features: 'Tracking',
  student_info_heading: 'Student Info',
  loading: 'Loading...',

  track_attendance: 'Attendance',
  track_grades: 'Grades',
  track_homework: 'Homework',
  track_health: 'Health',
  track_library: 'Library',
  track_card: 'Student Card',
  info_profile: 'Profile',
  info_family: 'Family',

  nav_home: 'Home',
  nav_settings: 'Settings',
  back: 'Back',

  notif_title: 'Notifications',
  notif_subtitle: 'Messages from school',
  notif_empty: 'No new messages',

  settings_title: 'Settings',
  preferences: 'Preferences',
  theme: 'Theme',
  dark_mode_active: 'Dark Mode active',
  light_mode_active: 'Light Mode active',
  language_label: 'Language',
  account_info: 'Account',
  logout_btn: 'Sign Out',
  logout_desc: 'Sign out of your account securely.',

  attendance_title: 'Attendance',
  present: 'Present',
  absent: 'Absent',
  late: 'Late',
  permission: 'Excused',
  attendance_rate: 'Attendance rate',
  total_days: 'Total days',
  no_attendance: 'No attendance records yet',

  grades_title: 'Grades',
  subject: 'Subject',
  score: 'Score',
  grade: 'Grade',
  average: 'Average',
  monthly: 'Monthly',
  semester: 'Semester',
  no_scores: 'No scores yet',

  homework_title: 'Homework',
  due_date: 'Due',
  no_homework: 'No homework yet',

  profile_title: 'Student Profile',
  family_title: 'Family',
  card_title: 'Student Card',
  father: 'Father',
  mother: 'Mother',
  guardian: 'Guardian',
  occupation: 'Occupation',
  student_id: 'Student ID',
  full_name: 'Full name',
  gender: 'Gender',
  dob: 'Date of birth',
  phone: 'Phone',
  address: 'Address',
  birth_place: 'Place of birth',
  class_label: 'Class',
  not_set: 'Not set',

  coming_soon: 'No data yet',
  coming_soon_desc: 'This feature is coming soon',
  health_title: 'Health',
  library_title: 'Library',
}

export const translations: Record<Lang, Record<Keys, string>> = { km, en }

/** Look up a key, falling back to Khmer then to the key itself. */
export function t(lang: Lang, key: Keys): string {
  return translations[lang]?.[key] ?? translations.km[key] ?? key
}

export type TranslationKey = Keys
