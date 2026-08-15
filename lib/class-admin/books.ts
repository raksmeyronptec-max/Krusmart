/**
 * The 13 MoEYS class-administration books (`រដ្ឋបាលថ្នាក់រៀន`).
 *
 * The legacy build shipped these as 13 standalone HTML pages loaded into an
 * iframe, each with its own Firestore collection, its own save button, and its
 * own hand-written A4 print block — roughly 12,000 lines that differed only in
 * the column headers.
 *
 * Here they are data. Each book declares its fields; one client renders the
 * editor, one renders the printable sheet, and all 13 share the same table
 * (`class_admin_entries`, migration 00012) and the same server actions. Adding a
 * fourteenth book means adding an entry below.
 *
 * `id` values are persisted in `class_admin_entries.book` — changing one orphans
 * that book's rows, so treat them as a schema.
 */

/** How a field is captured. `textarea` and `date` map to native inputs. */
export type FieldType = 'text' | 'textarea' | 'date' | 'time' | 'number' | 'select'

export interface BookField {
  key: string
  label: string
  type: FieldType
  /** Column width in the printed table, e.g. `'18%'`. */
  width?: string
  options?: string[]
  placeholder?: string
  /** Rendered in the editor but omitted from the printed sheet. */
  editorOnly?: boolean
}

export interface BookDefinition {
  id: string
  /** Position in the sidebar, matching the numbering on the paper forms. */
  order: number
  /** Khmer title, exactly as the legacy menu wrote it. */
  title: string
  /** Title printed at the top of the A4 sheet. */
  printTitle: string
  /** One-line description shown on the index card. */
  description: string
  /** lucide-react icon name, resolved by the index page. */
  icon: string
  fields: BookField[]
  /** Landscape when the row is too wide for portrait A4. */
  orientation?: 'portrait' | 'landscape'
}

const KHMER_SUBJECTS = [
  'ភាសាខ្មែរ', 'គណិតវិទ្យា', 'វិទ្យាសាស្ត្រ', 'សិក្សាសង្គម',
  'អប់រំកាយ', 'បំណិនជីវិត', 'ភាសាបរទេស', 'ផ្សេងៗ',
]

export const BOOKS: BookDefinition[] = [
  {
    id: 'daily_quotes',
    order: 1,
    title: '១. សៀវភៅសម្រង់អត្ថបទប្រចាំថ្ងៃ',
    printTitle: 'សៀវភៅសម្រង់អត្ថបទប្រចាំថ្ងៃ',
    description: 'កត់ត្រាសម្រង់អត្ថបទ និងខ្លឹមសារអប់រំប្រចាំថ្ងៃ',
    icon: 'CalendarCheck',
    fields: [
      { key: 'date', label: 'ថ្ងៃខែឆ្នាំ', type: 'date', width: '15%' },
      { key: 'time', label: 'ម៉ោង', type: 'time', width: '10%' },
      { key: 'content', label: 'ខ្លឹមសារ', type: 'textarea', width: '75%' },
    ],
  },
  {
    id: 'health_tracking',
    order: 2,
    title: '២. តាមដានទម្ងន់ និងកម្ពស់សិស្ស',
    printTitle: 'តារាងតាមដានទម្ងន់ និងកម្ពស់សិស្ស',
    description: 'កំណត់ត្រាទម្ងន់ កម្ពស់ និង BMI របស់សិស្ស',
    icon: 'Weight',
    fields: [
      { key: 'student', label: 'ឈ្មោះសិស្ស', type: 'text', width: '30%' },
      { key: 'date', label: 'ថ្ងៃខែឆ្នាំ', type: 'date', width: '15%' },
      { key: 'weight', label: 'ទម្ងន់ (គក)', type: 'number', width: '13%' },
      { key: 'height', label: 'កម្ពស់ (សម)', type: 'number', width: '13%' },
      { key: 'bmi', label: 'BMI', type: 'text', width: '12%' },
      { key: 'note', label: 'ចំណាំ', type: 'text', width: '17%' },
    ],
  },
  {
    id: 'materials_received',
    order: 3,
    title: '៣. សៀវភៅទទួល ចែកសម្ភារៈ',
    printTitle: 'សៀវភៅទទួល និងចែកសម្ភារៈ',
    description: 'តាមដានសម្ភារៈដែលបានទទួល និងបានចែកជូនសិស្ស',
    icon: 'PackageOpen',
    fields: [
      { key: 'desc', label: 'បរិយាយ', type: 'text', width: '32%' },
      { key: 'qty', label: 'ចំនួន', type: 'number', width: '10%' },
      { key: 'unit', label: 'ឯកតា', type: 'text', width: '12%' },
      { key: 'date', label: 'ថ្ងៃខែឆ្នាំទទួល', type: 'date', width: '18%' },
      { key: 'signature', label: 'ហត្ថលេខា', type: 'text', width: '28%' },
    ],
  },
  {
    id: 'recommendations',
    order: 4,
    title: '៤. សៀវភៅអនុសាសន៍',
    printTitle: 'សៀវភៅអនុសាសន៍',
    description: 'អនុសាសន៍ពីក្រុមអធិការកិច្ច និងចំណុចត្រូវកែលម្អ',
    icon: 'ClipboardList',
    fields: [
      { key: 'date', label: 'ថ្ងៃខែឆ្នាំ', type: 'date', width: '14%' },
      { key: 'inspector', label: 'ក្រុមអធិការកិច្ច', type: 'text', width: '20%' },
      { key: 'strengths', label: 'ចំណុចល្អសង្ខេប', type: 'textarea', width: '33%' },
      { key: 'improvements', label: 'ចំណុចត្រូវកែលម្អ', type: 'textarea', width: '33%' },
    ],
  },
  {
    id: 'demo_classes',
    order: 5,
    title: '៥. សៀវភៅថ្នាក់និទស្សន៍',
    printTitle: 'សៀវភៅថ្នាក់និទស្សន៍',
    description: 'កត់ត្រាថ្នាក់និទស្សន៍ និងការវាយតម្លៃ',
    icon: 'Presentation',
    orientation: 'landscape',
    fields: [
      { key: 'date', label: 'ថ្ងៃខែឆ្នាំ', type: 'date', width: '10%' },
      { key: 'teacher', label: 'គ្រូបង្រៀន', type: 'text', width: '14%' },
      { key: 'subject', label: 'មុខវិជ្ជា', type: 'select', options: KHMER_SUBJECTS, width: '12%' },
      { key: 'location', label: 'ទីកន្លែង', type: 'text', width: '12%' },
      { key: 'timeFrom', label: 'ចាប់ពីម៉ោង', type: 'time', width: '9%' },
      { key: 'timeTo', label: 'ដល់ម៉ោង', type: 'time', width: '9%' },
      { key: 'strengths', label: 'ចំណុចល្អសង្ខេប', type: 'textarea', width: '17%' },
      { key: 'improvements', label: 'ចំណុចត្រូវកែលម្អ', type: 'textarea', width: '17%' },
    ],
  },
  {
    id: 'material_production',
    order: 6,
    title: '៦. សៀវភៅផលិតសម្ភារៈ',
    printTitle: 'សៀវភៅផលិតសម្ភារៈឧបទ្ទេស',
    description: 'បញ្ជីសម្ភារៈឧបទ្ទេសដែលបានផលិត',
    icon: 'Palette',
    fields: [
      { key: 'name', label: 'ឈ្មោះសម្ភារៈ', type: 'text', width: '35%' },
      { key: 'subject', label: 'មុខវិជ្ជា', type: 'select', options: KHMER_SUBJECTS, width: '22%' },
      { key: 'qty', label: 'ចំនួន', type: 'number', width: '13%' },
      { key: 'date', label: 'ថ្ងៃខែឆ្នាំផលិត', type: 'date', width: '18%' },
      { key: 'note', label: 'ចំណាំ', type: 'text', width: '12%' },
    ],
  },
  {
    id: 'parents_communication',
    order: 7,
    title: '៧. សៀវភៅទំនាក់ទំនងមាតាបិតាសិស្ស',
    printTitle: 'សៀវភៅទំនាក់ទំនងមាតាបិតាសិស្ស',
    description: 'កំណត់ត្រាការជួបជាមួយមាតាបិតា និងលទ្ធផល',
    icon: 'Handshake',
    fields: [
      { key: 'date', label: 'ថ្ងៃខែឆ្នាំ', type: 'date', width: '13%' },
      { key: 'student', label: 'ឈ្មោះសិស្ស', type: 'text', width: '20%' },
      { key: 'parent', label: 'ឈ្មោះមាតាបិតា', type: 'text', width: '20%' },
      { key: 'topic', label: 'មូលហេតុ/ប្រធានបទ', type: 'textarea', width: '25%' },
      { key: 'result', label: 'លទ្ធផល', type: 'textarea', width: '22%' },
    ],
  },
  {
    id: 'class_committee',
    order: 8,
    title: '៨. សៀវភៅគណៈកម្មការទ្រទ្រង់ថ្នាក់',
    printTitle: 'បញ្ជីគណៈកម្មការទ្រទ្រង់ថ្នាក់រៀន',
    description: 'សមាជិកគណៈកម្មការ និងថវិកាចូលរួម',
    icon: 'UsersRound',
    fields: [
      { key: 'name', label: 'ឈ្មោះគណៈកម្មការ', type: 'text', width: '26%' },
      { key: 'gender', label: 'ភេទ', type: 'select', options: ['ប្រុស', 'ស្រី'], width: '10%' },
      { key: 'role', label: 'តួនាទី', type: 'text', width: '18%' },
      { key: 'village', label: 'ភូមិ', type: 'text', width: '16%' },
      { key: 'phone', label: 'លេខទូរស័ព្ទ', type: 'text', width: '16%' },
      { key: 'contribution', label: 'ថវិកាចូលរួម', type: 'text', width: '14%' },
    ],
  },
  {
    id: 'slow_learners',
    order: 9,
    title: '៩. ប្រព័ន្ធសៀវភៅសិស្សរៀនយឺត',
    printTitle: 'បញ្ជីសិស្សរៀនយឺត និងវិធានការជួយ',
    description: 'តាមដានសិស្សរៀនយឺត និងវឌ្ឍនភាព',
    icon: 'LifeBuoy',
    fields: [
      { key: 'student', label: 'ឈ្មោះសិស្ស', type: 'text', width: '20%' },
      { key: 'subject', label: 'មុខវិជ្ជា', type: 'select', options: KHMER_SUBJECTS, width: '15%' },
      { key: 'problem', label: 'ចំណុចខ្សោយ', type: 'textarea', width: '23%' },
      { key: 'support', label: 'វិធានការជួយ', type: 'textarea', width: '23%' },
      { key: 'result', label: 'លទ្ធផល', type: 'textarea', width: '19%' },
    ],
  },
  {
    id: 'teacher_plan',
    order: 10,
    title: '១០. ផែនការសកម្មភាពប្រចាំខែ',
    printTitle: 'ផែនការសកម្មភាពប្រចាំខែ',
    description: 'សកម្មភាពរៀបចំទុកតាមសប្ដាហ៍',
    icon: 'CalendarRange',
    orientation: 'landscape',
    fields: [
      { key: 'month', label: 'សម្រាប់ខែ', type: 'text', width: '12%' },
      { key: 'week1', label: 'សប្ដាហ៍ទី១', type: 'textarea', width: '22%' },
      { key: 'week2', label: 'សប្ដាហ៍ទី២', type: 'textarea', width: '22%' },
      { key: 'week3', label: 'សប្ដាហ៍ទី៣', type: 'textarea', width: '22%' },
      { key: 'week4', label: 'សប្ដាហ៍ទី៤', type: 'textarea', width: '22%' },
    ],
  },
  {
    id: 'student_difficulties',
    order: 11,
    title: '១១. បញ្ជីឈ្មោះសិស្សជួបការលំបាក',
    printTitle: 'បញ្ជីឈ្មោះសិស្សជួបការលំបាក',
    description: 'សិស្សដែលជួបការលំបាក និងជំនួយដែលបានផ្តល់',
    icon: 'HeartHandshake',
    fields: [
      { key: 'student', label: 'ឈ្មោះសិស្ស', type: 'text', width: '22%' },
      { key: 'difficulty', label: 'ការលំបាកដែលជួបប្រទះ', type: 'textarea', width: '30%' },
      { key: 'support', label: 'ជំនួយដែលបានផ្តល់', type: 'textarea', width: '28%' },
      { key: 'date', label: 'ថ្ងៃខែឆ្នាំ', type: 'date', width: '20%' },
    ],
  },
  {
    id: 'composition_correction',
    order: 12,
    title: '១២. សៀវភៅកែតែងសេចក្តី',
    printTitle: 'សៀវភៅកែតែងសេចក្តី',
    description: 'កត់ត្រាកំហុសក្នុងការតែងសេចក្តី និងការកែតម្រូវ',
    icon: 'FilePen',
    fields: [
      { key: 'student', label: 'ឈ្មោះសិស្ស', type: 'text', width: '20%' },
      { key: 'date', label: 'ថ្ងៃខែឆ្នាំ', type: 'date', width: '14%' },
      { key: 'topic', label: 'ប្រធានបទ', type: 'text', width: '20%' },
      { key: 'errors', label: 'កំហុសដែលរកឃើញ', type: 'textarea', width: '25%' },
      { key: 'correction', label: 'ការកែតម្រូវ', type: 'textarea', width: '21%' },
    ],
  },
  {
    id: 'agenda_book',
    order: 13,
    title: '១៣. សៀវភៅរបៀបវារៈកិច្ចប្រជុំ',
    printTitle: 'សៀវភៅរបៀបវារៈកិច្ចប្រជុំ',
    description: 'របៀបវារៈ និងលទ្ធផលនៃកិច្ចប្រជុំ',
    icon: 'BookMarked',
    fields: [
      { key: 'date', label: 'កាលបរិច្ឆេទ', type: 'date', width: '14%' },
      { key: 'title', label: 'កម្មវត្ថុនៃកិច្ចប្រជុំ', type: 'text', width: '24%' },
      { key: 'agendas', label: 'របៀបវារៈ', type: 'textarea', width: '31%' },
      { key: 'details', label: 'សេចក្តីសម្រេច', type: 'textarea', width: '31%' },
    ],
  },
]

/** Every book id, in the order they appear in the sidebar. */
export const BOOK_IDS = BOOKS.map((b) => b.id)

export function getBook(id: string): BookDefinition | undefined {
  return BOOKS.find((b) => b.id === id)
}

/**
 * The fields shown on the printed sheet — `editorOnly` fields are working notes
 * that do not belong on the form handed to an inspector.
 */
export function printableFields(book: BookDefinition): BookField[] {
  return book.fields.filter((f) => !f.editorOnly)
}
