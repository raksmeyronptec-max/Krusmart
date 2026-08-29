# ១១. វគ្គពិន្ទុ (Score Periods), ទម្រង់បញ្ចូល និងការចាក់សោ — បឋមសិក្សា

> ឯកសារបន្តពី [`score-system-design.md`](score-system-design.md)។ ឯកសារនោះឆ្លើយថា
> **មុខវិជ្ជាណាមាន** (`score_template_subjects` + `class_template_subjects`)។
> ឯកសារនេះឆ្លើយថា **ស្រង់ពិន្ទុនៅពេលណា** និង **បញ្ចូលយ៉ាងដូចម្តេច**។
> ពីរនេះជាអ័ក្សពីរផ្សេងគ្នា — កុំយកទៅលាយបញ្ចូលគ្នាក្នុងតារាងតែមួយ។

---

## ១១.១ អ្វីដែលមានស្រាប់ (ground truth — ផ្ទៀងផ្ទាត់ក្នុង code)

| រឿង | ស្ថានភាពពិត | ទីតាំង |
|---|---|---|
| ឆ្នាំសិក្សា | វិច្ឆិកា → តុលា, hardcoded | `lib/constants/academic.ts` |
| លំដាប់ខែ | `MONTHS_BY_ACADEMIC_YEAR` = ១២ ខែថេរ | `lib/constants/months.ts` |
| ព្រំដែនឆមាស | `FIRST_SEMESTER_LENGTH = 5` → sem1 = វិច្ឆិកា–មីនា, sem2 = មេសា–តុលា | `lib/scores/semester.ts:44` |
| គន្លឹះរក្សាទុក | `score_period` = `` `${monthId}-${academicYear}` `` — **schema** | `ScoreEnterClient.tsx:146` |
| ជម្រើសខែក្នុង `/score/total` | `selectedSemesterMonths` ជា `useState` — **មិនរក្សាទុក** | `ScoreTotalClient.tsx:255` |
| ខែសម្រាប់របាយការណ៍ | `monthsForSemester()` ថេរ | `lib/reporting/report-data.ts:509` |
| ដែនកំណត់ពិន្ទុ | `<input max={…}>` តែប៉ុណ្ណោះ | `ScoreEntryGrid.tsx:157` |
| ការចាក់សោពិន្ទុ | **គ្មានទាល់តែសោះ** (វត្តមានមាន `attendance_locks`) | — |

### បញ្ហាពីរដែលបញ្ជាក់រួច

1. **អេក្រង់ និងក្រដាសអាចផ្ទុយគ្នា។** គ្រូប្តូរខែក្នុង `/score/total` → មធ្យមភាគឆមាសប្តូរ
   លើអេក្រង់ តែ `ranking_semester` នៅតែប្រើ វិច្ឆិកា–មីនា ថេរ។ ជម្រើសនោះរស់តែក្នុង
   React state ហើយឯកសារមិនអាចអាន state បានទេ។
2. **`max=10` មិនបានហាមអ្វីទាំងអស់។** HTML `max` ជា validation constraint មិនមែន
   input filter។ វាយ `11` → `handleScoreChange` ទុក `'11'` → `splitScoreCell('11')`
   → `score_value = 11` ចូល database ដោយមាន toast ជោគជ័យ។ នេះជា bug សព្វថ្ងៃ។

---

## ១១.២ ការសម្រេចស្នូល ៤ (invariants — កុំបំពាន)

### INV-1 — `score_period` ជា schema។ ការរួមខែ **មិនប្តូរ key** ទេ

ខែរួម (មីនា-មេសា គិតតែមួយ) **ត្រូវរក្សាទុកក្រោម key ខែណាមួយដែលមានស្រាប់** ហៅថា
*anchor*៖ `mar-2025-2026`។ ស្លាក `"មីនា-មេសា"` ជា **label** និង `members: ['mar','apr']`
ជា **membership** — ទាំងពីរជា metadata មិនមែន key។

ហេតុអ្វី៖ `score_period` ត្រូវបាន parse ត្រឡប់វិញនៅ ៥ កន្លែងយ៉ាងតិច
(`report-data.ts:449`, `students/[id]/queries.ts`, `attendance/yearly`, `record-book`,
`parent-report`)។ ការបង្កើត key ថ្មី `mar_apr-2025-2026` នឹង៖
- ធ្វើឲ្យពិន្ទុមីនាដែលបញ្ចូលរួច **ក្លាយជា orphan**,
- បំបែក `.like('score_period', '%-${academicYear}')` ដែល `replace()` សន្មតថាផ្នែកឆ្វេងជា `MonthId`,
- ទាមទារ migration លើ `scores` ដែលឯកសារ 00028 សន្យាថាមិនប៉ះ។

**ច្បាប់៖ ខែដែលត្រូវបានស្រូបចូល (`apr` ក្នុងឧទាហរណ៍) មិនមែនជាវគ្គដោយឡែកទៀតទេ។
វានៅតែជាសមាជិកសម្រាប់ស្លាក និងកាលបរិច្ឆេទ ប៉ុន្តែគ្មានក្រឡាបញ្ចូលពិន្ទុ។**

### INV-2 — សូន្យជួរ = ឥរិយាបថសព្វថ្ងៃ ១០០%

`DEFAULT_CALENDAR` ជា **code** មិនមែន seed។ គណនីដែលមិនដែលកំណត់អ្វី resolve ជា
១២ វគ្គ វិច្ឆិកា→តុលា, sem1 = ៥ ខែដំបូង — ត្រូវគ្នានឹង `monthsForSemester()` សព្វថ្ងៃ
ជាប្រូបាល់។ នេះជាគោលការណ៍ដដែលនឹង `applySelection` (§`class_template_subjects`)៖
*ថ្នាក់គ្មានជម្រើស = template ពេញ*។

### INV-3 — ប្រតិទិន override **ជាសំណុំទាំងមូល** មិនមែនម្តងមួយជួរ

នេះខុសពី `score_template_subjects` ដោយចេតនា។ `updateClassSubject` លុប override ពេល
វាឈប់ខុសពីអ្វីដែលទទួលមរតក — ធ្វើបានព្រោះមុខវិជ្ជានីមួយៗឯករាជ្យ។ ប្រតិទិន **មិន**
ឯករាជ្យ៖ វាជា *partition* នៃ ១២ ខែ។ ការរួម មីនា+មេសា ប៉ះជួរពីរក្នុងពេលតែមួយ ហើយ
ព្រំដែនឆមាសជាលក្ខណៈសម្បត្តិរបស់សំណុំ។

**ច្បាប់៖ ពេលគ្រូកែប្រតិទិនលើកដំបូង → copy-on-write ១២ ជួរទាំងអស់ទៅ scope `class`។
ការ reset = លុបជួរទាំង ១២។**

### INV-4 — កាលបរិច្ឆេទជា *ការណែនាំ និងសោ* មិនមែន key

`starts_on` / `ends_on` សម្រេច៖ វគ្គណាបើកឥឡូវ (default ក្នុង picker), វគ្គណាមិនទាន់ដល់
(បង្ហាញ `—` ជំនួសលេខភ័ន្តច្រឡំ), វគ្គណាហួសកំណត់ (ស្នើចាក់សោ)។ វាមិនចូលក្នុង
`score_period` ទេ ហើយការប្តូរកាលបរិច្ឆេទ **មិនផ្លាស់ទីពិន្ទុណាមួយឡើយ**។

---

## ១១.៣ Data model — `score_calendar_periods` (migration 00029)

```sql
CREATE TABLE public.score_calendar_periods (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,

    -- ស្រទាប់ ២ ដូច score_template_subjects តែគ្មាន 'system':
    -- ស្រទាប់ system គឺ DEFAULT_CALENDAR ក្នុង code (INV-2)។
    scope         TEXT NOT NULL CHECK (scope IN ('school','class')),
    school_id     UUID REFERENCES public.schools(id) ON DELETE CASCADE,
    class_id      UUID REFERENCES public.classes(id) ON DELETE CASCADE,

    -- ផ្នែកខាងស្តាំនៃ score_period។ '2025-2026'.
    academic_year TEXT NOT NULL,

    -- ★ anchor: ផ្នែកខាងឆ្វេងនៃ score_period។ MonthId ត្រឹមត្រូវ។ (INV-1)
    month_key     TEXT NOT NULL,

    -- ខែទាំងអស់ដែលវគ្គនេះគ្របដណ្តប់។ ត្រូវតែមាន month_key។
    -- ['mar','apr'] = "មីនា-មេសា គិតតែមួយ"។
    member_months TEXT[] NOT NULL,

    -- NULL = ស្លាកមកពី member_months ដោយស្វ័យប្រវត្តិ ('មីនា-មេសា')។
    label_km      TEXT,

    semester      TEXT NOT NULL CHECK (semester IN ('sem1','sem2')),

    -- ការណែនាំ + សោ។ មិនមែន key (INV-4)។
    starts_on     DATE,
    ends_on       DATE,

    -- ចាក់សោ = គ្មាន upsert ចូល scores សម្រាប់ (class, period) នេះទៀត។
    locked_at     TIMESTAMPTZ,
    locked_by     UUID REFERENCES auth.users(id),

    sort_order    INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ DEFAULT now() NOT NULL,
    updated_at    TIMESTAMPTZ DEFAULT now() NOT NULL,

    CONSTRAINT anchor_is_member CHECK (month_key = ANY(member_months)),
    CONSTRAINT scope_target CHECK (
        (scope = 'school' AND school_id IS NOT NULL AND class_id IS NULL) OR
        (scope = 'class'  AND class_id  IS NOT NULL)
    )
);

-- វគ្គមួយក្នុងមួយ anchor ក្នុងមួយគោលដៅ ក្នុងមួយឆ្នាំ។
CREATE UNIQUE INDEX score_calendar_class_uniq
    ON public.score_calendar_periods (class_id, academic_year, month_key)
    WHERE scope = 'class';
CREATE UNIQUE INDEX score_calendar_school_uniq
    ON public.score_calendar_periods (school_id, academic_year, month_key)
    WHERE scope = 'school';
```

### Invariants ដែល Postgres **មិន**អាចអនុវត្តបាន — ត្រូវពិនិត្យក្នុង action

`member_months` ត្រូវជា **partition**៖ ខែនីមួយៗលេចឡើងក្នុងវគ្គ **យ៉ាងច្រើនមួយ**។
CHECK constraint មិនអាចមើលឆ្លងជួរបានទេ។ ដូច្នេះ `validateCalendar()` ជា pure function
ហៅទាំង client (មុនបង្ហាញប៊ូតុងរក្សាទុក) និង server (មុន write) — **កន្លែងទីពីរជា
ព្រំដែនពិត**។ ការត្រួតស៊ីគ្នាមានន័យថាពិន្ទុមួយត្រូវរាប់ពីរដងក្នុងមធ្យមភាគ។

ខែដែល **គ្មានក្នុងវគ្គណាទាល់តែសោះ** ជាការត្រឹមត្រូវ — មានន័យថាឆ្នាំនោះមិនស្រង់ពិន្ទុ
ខែនោះ (ឧ. តុលា ជាខែប្រឡង)។ គ្រាន់តែវាមិនអាចមានក្រឡាបញ្ចូល និងមិនចូលមធ្យមភាគ។

### RLS

ដូច `class_template_subjects` បេះបិទ៖ អាន = សមាជិកសាលា/គ្រូដែលមាន assignment;
សរសេរ scope `class` = គ្រូដែលមាន active assignment លើថ្នាក់នោះ; scope `school` =
`isSchoolAdmin()` ប៉ុណ្ណោះ។ **កុំបង្កើត policy shape ថ្មី** — copy ពី 00028។

---

## ១១.៤ Resolver — `lib/scores/calendar.ts` (pure, គ្មាន server import)

កន្លែងតែមួយដែលសម្រេចថា "វគ្គពិន្ទុមួយគឺជាអ្វី"។ គ្មាន React, គ្មាន `next/headers` —
ព្រោះ client hook, report resolver និង verify script ត្រូវប្រើដូចគ្នា (ច្បាប់ដដែល
នឹង `lib/scores/template.ts` និង `semester.ts`)។

```ts
export interface ScorePeriod {
  /** ★ ផ្នែកខាងឆ្វេងនៃ scores.score_period។ ជា schema។ */
  key: MonthId
  labelKm: string
  members: MonthId[]          // ≥1, មាន key
  semester: SemesterId
  startsOn: string | null
  endsOn: string | null
  locked: boolean
  sortOrder: number
}

/** ១២ វគ្គ វិច្ឆិកា→តុលា, sem1 = ៥ ខែដំបូង។ ស្មើនឹងឥរិយាបថសព្វថ្ងៃ (INV-2)។ */
export const DEFAULT_CALENDAR: readonly ScorePeriod[]

/** class rows → school rows → DEFAULT_CALENDAR។ សំណុំទាំងមូល (INV-3)។ */
export function resolveCalendar(
  rows: ScoreCalendarPeriodRow[],
  ctx: { classId?: string; academicYear: string },
): ScorePeriod[]

export function periodsForSemester(cal: readonly ScorePeriod[], s: SemesterId): ScorePeriod[]

/** ជំនួស monthsForSemester()។ ត្រឡប់ *anchor keys* មិនមែនខែសមាជិក។ */
export function periodKeysForSemester(cal: readonly ScorePeriod[], s: SemesterId): MonthId[]

/** វគ្គដែលកាលបរិច្ឆេទនេះធ្លាក់ក្នុង — សម្រាប់ default របស់ picker (INV-4)។ */
export function periodForDate(cal: readonly ScorePeriod[], d: Date): ScorePeriod | null

/** partition + anchor + semester។ ហៅទាំង client និង server។ */
export function validateCalendar(periods: ScorePeriod[]): CalendarProblem[]

/** 'mar' + ['mar','apr'] → 'មីនា-មេសា' */
export function deriveLabel(members: MonthId[]): string
```

### ការភ្ជាប់ត្រឡប់ក្រោយ (back-compat) — មួយបន្ទាត់

```ts
// lib/scores/semester.ts
export function monthsForSemester(s: SemesterId): MonthId[] {
  return periodKeysForSemester(DEFAULT_CALENDAR, s)
}
```

ដូច្នេះ commit ដំបូងបន្ថែម calendar ដោយ **មិនប្តូរលេខណាមួយ**។ អ្នកហៅចាស់
(`report-data.ts:509`, `ScoreTotalClient.tsx:255`) ប្តូរនៅ commit ក្រោយ ម្តងមួយៗ
ដោយមាន `scripts/verify-*.mts` ការពារ។

### ★ ការរួមខែធ្វើឲ្យលេខផ្លាស់ប្តូរ — ដោយចេតនា

`monthlyComponent()` យកមធ្យមភាគនៃ *ធាតុ* ក្នុងបញ្ជីខែ។ បើ មីនា+មេសា ក្លាយជា
វគ្គមួយ នោះភាគបែងធ្លាក់ពី ៥ មក ៤ ហើយ **មធ្យមភាគឆមាសរបស់សិស្សគ្រប់រូបប្តូរ**។
នេះជាអ្វីដែលគ្រូស្នើ ("គិតតែមួយ") តែវាជាការវាយតម្លៃឡើងវិញ។ ដូច្នេះ៖

- ទម្រង់ត្រូវបង្ហាញការព្រមានច្បាស់មុនរក្សាទុក (សូម §១១.៥),
- `auditLog('score_calendar.updated', …)` ត្រូវកត់ប្រតិទិនចាស់ និងថ្មីទាំងស្រុង,
- វគ្គដែល **ចាក់សោរួច** មិនអាចរួម/បំបែកបានទេ (§១១.៨) — នេះជាការការពារពិត។

---

## ១១.៥ Flow ១ — ទម្រង់កំណត់វគ្គពិន្ទុ

### ទីតាំង៖ `/score/subjects` → tab ថ្មី `វគ្គពិន្ទុ`

**កុំបង្កើតទំព័រថ្មី។** §៧ នៃ `score-system-design.md` សរសេររួចថា ការមានទំព័រ
កំណត់រចនាសម្ព័ន្ធពីរ គឺជារបៀបដែលពួកវាឈានទៅផ្ទុយគ្នា (ហេតុនេះ `/score/template`
ជា redirect)។ `/score/subjects` មាន `?class=` រួច, មាន guard តាម assignment រួច,
មាន pattern "resolve → override → audit" រួច។

```
/score/subjects?class=<id>
  ├─ tab ១: មុខវិជ្ជា   (មានស្រាប់ — score_template_subjects + class_template_subjects)
  └─ tab ២: វគ្គពិន្ទុ  (ថ្មី — score_calendar_periods)
```

### រូបរាងទម្រង់ — timeline មិនមែនតារាង

```
ឆ្នាំសិក្សា  [ 2025-2026 ▾ ]                    [ ↺ ត្រឡប់ទៅលំនាំដើម ]

ឆមាសទី១  ┌──────┬──────┬──────┬──────┬─────────────┐
          │វិច្ឆិកា│ ធ្នូ  │ មករា │កុម្ភៈ │  មីនា-មេសា ⚭│   ← វគ្គរួម
          │ ០១/១១│ ០១/១២│ ០១/០១│ ០១/០២│ ០១/០៣–៣០/០៤│
          └──────┴──────┴──────┴──────┴─────────────┘
ឆមាសទី២  ┌──────┬──────┬──────┬──────┬──────┬ ─ ─ ─ ┐
          │ ឧសភា │មិថុនា│កក្កដា│ សីហា │ កញ្ញា │ តុលា  │   ← បិទ (មិនស្រង់ពិន្ទុ)
          └──────┴──────┴──────┴──────┴──────┴ ─ ─ ─ ┘

ចុចលើវគ្គមួយ →  [ រួមជាមួយវគ្គបន្ទាប់ ⚭ ]  [ បំបែក ]  [ កាលបរិច្ឆេទ… ]
                 [ ផ្លាស់ទៅឆមាសទី២ ]        [ បិទវគ្គនេះ ]  [ ចាក់សោ 🔒 ]
```

**ហេតុអ្វី timeline មិនមែនតារាង៖** invariant ដែលងាយបំពានបំផុតគឺ partition
(មិនត្រួតគ្នា មិនខ្វះ)។ Timeline ធ្វើឲ្យការត្រួតគ្នា *មើលឃើញ* — ចន្លោះទទេ និង
ប្លុកជាន់គ្នាមិនអាចលាក់បាំងបានទេ។ តារាងជួរដេកលាក់វា។

### ច្បាប់ interaction ៦ (ជាកិច្ចសន្យា មិនមែនរចនាសម្ព័ន្ធក្រាហ្វិក)

1. **រួមបានតែវគ្គជាប់គ្នា** ក្នុងលំដាប់ឆ្នាំសិក្សា ហើយក្នុង**ឆមាសតែមួយ**។
   មីនា(sem1) + មេសា(sem2) មិនអាចរួមបានទេ លុះត្រាតែផ្លាស់ព្រំដែនឆមាសជាមុន។
   *ឧទាហរណ៍របស់អ្នកប្រើ ("មីនា-មេសា ក្នុងឆមាស១") ទាមទារពីរជំហាន៖ ទាញព្រំដែន
   ឆមាសទៅក្រោយមេសា រួចទើបរួម។ ទម្រង់ត្រូវស្នើជំហានទីមួយដោយស្វ័យប្រវត្តិ។*
2. **Anchor = ខែដំបូងតាមលំដាប់ឆ្នាំសិក្សា** នៃវគ្គរួម ជានិច្ច។ គ្មានជម្រើស។
   ការឲ្យគ្រូជ្រើស anchor គឺជាការឲ្យគាត់ផ្លាស់ទីពិន្ទុដោយមិនដឹងខ្លួន។
3. **ការរួមព្រមានពីពិន្ទុដែលនឹងក្លាយជា orphan។** បើ `apr-2025-2026` មានពិន្ទុរួច
   ហើយ `apr` ត្រូវស្រូបចូល `mar` នោះពិន្ទុមេសានឹងឈប់លេចក្នុងក្រឡាបញ្ចូល។
   **កុំលុប កុំផ្លាស់ទី។** បង្ហាញចំនួន ("ពិន្ទុ ៨៤ ក្រឡាក្នុងខែមេសានឹងលាក់")
   ហើយទាមទារការបញ្ជាក់។ ច្បាប់ដដែលនឹង `enabled_columns` ក្នុង 00028៖
   *ការបង្រួមមិនដែលលុបពិន្ទុ*។
4. **ព្រំដែនឆមាសជាការទាញតែមួយ។** មិនមែនប្រអប់ធីកក្នុងវគ្គនីមួយៗ — នោះអនុញ្ញាត
   sem1/sem2/sem1 ដែលមិនមានន័យ។ ព្រំដែនធានាថាឆមាសនៅតែជាចន្លោះជាប់គ្នា។
5. **កាលបរិច្ឆេទជាជម្រើស។** ទុកទទេ = មិនស្គាល់ = គ្មាន default ស្វ័យប្រវត្តិ គ្មាន
   សំណើចាក់សោ។ **កុំបង្ខំគ្រូបំពេញ ២៤ កាលបរិច្ឆេទ មុនពេលបញ្ចូលពិន្ទុដំបូង។**
6. **រក្សាទុក = ជំនួសសំណុំទាំងមូល** (INV-3), ក្នុង transaction តែមួយ, បន្ទាប់ពី
   `validateCalendar()` ស៊ីជម្រៅលើ server, ជាមួយ `auditLog` មួយកំណត់។

### Server action

```ts
// app/(main)/score/subjects/calendarActions.ts
'use server'
saveClassCalendar(classId, academicYear, periods): Promise<ActionResult>
  requirePermission('scores:update')
  → resolveServerScope(user.id, classId)          // មិនអាចពង្រីកសិទ្ធិ
  → validateCalendar(periods)  ← ព្រំដែនពិត
  → refuse if any existing row is locked and changed
  → delete + insert ក្នុង transaction (RPC ឬ ២ statement + rollback)
  → auditLog('score_calendar.updated', { before, after })
  → revalidatePath('/score/enter'), ('/score/total'), ('/score/subjects')

resetClassCalendar(classId, academicYear)   // លុប ១២ ជួរ → ត្រឡប់ទៅមរតក
```

---

## ១១.៦ Flow ២ — ការបញ្ចូលពិន្ទុ (ផ្លាស់ប្តូរតិចតួច ដោយចេតនា)

```
/score/enter?class=<id>&mode=monthly&year=2025-2026&month=<anchor>
   ↓
useScoreCalendar(classId, academicYear)      ← hook ថ្មី, ស្រប useScoreTemplate
   ↓
picker "ខែ" → picker "វគ្គពិន្ទុ"
   ស្លាកមកពី ScorePeriod.labelKm  ("មីនា-មេសា")
   value  មកពី ScorePeriod.key    ("mar")     ← score_period មិនប្តូរ (INV-1)
   ↓
default = periodForDate(calendar, new Date()) ?? វគ្គដំបូងនៃ sem1
   ↓
[វគ្គចាក់សោ?] → grid អានបាន តែ read-only + សារ "វគ្គនេះបានចាក់សោ"
   ↓
បញ្ចូល → clamp (§១១.៧) → saveScores(scoreType, `${key}-${year}`, …, classId)
```

**អ្វីដែល *មិន* ប្តូរ៖** `scores` table, `scores_owner_period_uniq`, `saveScores`
signature, `getScores`, ការ parse `score_period` នៅ ៥ កន្លែង។ នេះជាមូលហេតុ INV-1
មានតម្លៃ — ការងារទាំងអស់ស្ថិតក្នុងស្រទាប់បង្ហាញ និងស្រទាប់សម្រេច។

**`/score/total`** ៖ `selectedSemesterMonths` ឈប់ជា `useState` ដោយសេរី ក្លាយជា
`periodKeysForSemester(calendar, semester)`។ គ្រូនៅតែអាចដកខែចេញបណ្តោះអាសន្ន
សម្រាប់ *មើល* តែ **default មកពីទិន្នន័យ** ដូច្នេះអេក្រង់ និង `ranking_semester`
ចាប់ផ្តើមពីលេខតែមួយ។ បញ្ហា ១១.១(១) បិទត្រង់នេះ។

---

## ១១.៧ ការចាក់សោដែនកំណត់ពិន្ទុ (max clamp)

### ច្បាប់តែមួយ កន្លែងតែមួយ

```ts
// lib/utils/score-value.ts  — pure, បន្តពី splitScoreCell
export function clampScoreCell(raw: string, maxScore: number): string
```

| input | maxScore | លទ្ធផល | ហេតុផល |
|---|---|---|---|
| `''` | ១០ | `''` | ទទេ = មិនបានវាយតម្លៃ មិនមែនសូន្យ |
| `'8.5'` | ១០ | `'8.5'` | ក្នុងដែន |
| `'11'` | ១០ | `'10'` | ★ សំណើរបស់អ្នកប្រើ |
| `'-3'` | ១០ | `'0'` | គ្មានពិន្ទុអវិជ្ជមាន |
| `'55'` | ៥០ | `'50'` | អនុ/វិទ្យាល័យ /៥០ ដំណើរការដដែល |
| `'ល្អ'` | ១០ | `'ល្អ'` | ★ **ត្រូវឆ្លងកាត់ដោយមិនប៉ះ** |
| `'1.'` | ១០ | `'1.'` | កំពុងវាយ — កុំកាត់ខ្ទង់ទសភាគ |

**ក្រឡា `sem_eval_*` ជាចំណុចប្រថុយធំបំផុត។** មុខវិជ្ជា ៤ នោះរក្សាទុកពាក្យខ្មែរក្នុង
`score_text` (migration 00012)។ `clampScoreCell` ដែលហៅ `parseFloat` ដោយងងឹតងងុល នឹង
ធ្វើម្តងទៀតនូវ bug ដដែលដែល 00012 បានជួសជុល — សរសេរ `NULL` ក្រោម toast ជោគជ័យ។
ច្បាប់៖ **បើ `splitScoreCell()` សម្រេចថាវាជា text នោះ clamp មិនប៉ះទាល់តែសោះ។**

### កន្លែងហៅ — ៤ (បី client, មួយ server)

| # | កន្លែង | ចំណាំ |
|---|---|---|
| ១ | `handleScoreChange` (`ScoreEnterClient.tsx:357`) | ធ្វើឲ្យក្រឡា "លោតមក ១០" ភ្លាមៗ |
| ២ | បំពេញជាដុំ (`bulkValue`, ~`:1192`) | មួយតម្លៃ × ៣០ សិស្ស — កំហុសមួយក្លាយជា ៣០ |
| 3 | "ចម្លងពីខែមុន" (`:487`) | ចម្លងពិន្ទុចាស់ខុសដែន ចូលវគ្គថ្មី |
| 4 | **`saveScores` (server)** | ★ ព្រំដែនពិត |

ចំណុច ៤ សំខាន់បំផុត៖ client មិនមែនជាព្រំដែនទេ។ `saveScores` មាន `classId` រួច,
ដូច្នេះ `resolveServerGradingContext(user.id, classId, scoreType)` ត្រឡប់
`maxByColumn` (`lib/utils/serverScope.ts:442`) — ស្មើនឹងអ្វី client ប្រើ ដោយឆ្លងកាត់
resolver ដដែល។ Clamp ក្នុង `upsertPayload.map()` មុន `splitScoreCell`។

### ★ ការដោះដូរដែលអ្នកត្រូវសម្រេច — clamp ពេលវាយ ឬ ពេលចេញពីក្រឡា

អ្នកបានស្នើ **clamp ពេលវាយ** ("វាលោតមក 10 វិញ")។ វាដំណើរការ ហើយវាជាអ្វីដែល
ខ្ញុំកំណត់ជា default ខាងលើ។ ផលរំខានតែមួយ៖ គ្រូវាយ `11` ឃើញ `10` រួចចុច backspace
ដើម្បីកែ → នៅសល់ `1` មិនមែន `11`។ គេត្រូវវាយឡើងវិញ។

ជម្រើសទី២៖ អនុញ្ញាតឲ្យវាយ បង្ហាញស៊ុមក្រហម + សារ "អតិបរមា ១០" ភ្លាមៗ ហើយ clamp
ពេល `onBlur` និងពេលរក្សាទុក។ ការវាយត្រូវជាងឧបសគ្គ តែ "ការលោត" មិនភ្លាមៗ។

**អនុសាសន៍៖ ដាក់ជម្រើសទី១ (តាមសំណើ) ព្រោះក្រឡា /១០ បឋមសិក្សាកម្រមានករណី
កណ្តាលការវាយដែលលើសដែន — `'1'`, `'1.'`, `'1.5'` គ្មានជំហានណាលើស ១០ ទេ។
Server clamp (ចំណុច ៤) ធ្វើឲ្យជម្រើសទាំងពីរមានសុវត្ថិភាពដូចគ្នាចំពោះទិន្នន័យ។**

បន្ថែម `onPaste` ឲ្យឆ្លងកាត់ `clampScoreCell` ដែរ — ការបិទភ្ជាប់ពី Excel ជាផ្លូវ
ចូលពិត។

---

## ១១.៨ ការចាក់សោវគ្គ (បំពេញចន្លោះដែលវត្តមានមានស្រាប់)

`attendance_locks` មានតាំងពី 00003។ ពិន្ទុគ្មានអ្វីទេ៖ បន្ទាប់ពីបោះពុម្ព
សៀវភៅតម្កល់ពិន្ទុ គ្រូ (ឬសហការី) នៅតែអាចកែពិន្ទុដោយស្ងាត់ស្ងៀម ហើយក្រដាស
ដែលបោះពុម្ពរួចឈប់ត្រូវនឹង database។

`locked_at` / `locked_by` នៅលើជួរប្រតិទិនជាកន្លែងធម្មជាតិ — វគ្គជាអ្វីដែលត្រូវ
ចាក់សោ ហើយវាមានជួរម្តងមួយថ្នាក់រួចហើយ។ ការអនុវត្ត៖

- UI៖ `/score/enter` grid ក្លាយជា read-only + `Badge` "🔒 ចាក់សោ"។
- Server៖ `saveScores` បដិសេធពេលវគ្គចាក់សោ (**មិនមែនត្រឹមលាក់ប៊ូតុង**)។
- RLS ជាជម្រើសទី៣៖ policy លើ `scores` ដែលពិនិត្យ `score_calendar_periods` — ខ្លាំង
  ជាងគេ តែថ្លៃលើរាល់ការសរសេរ។ **ចាប់ផ្តើមពី server check; សរសេរ RLS ពេលមាន
  គ្រូច្រើននាក់លើថ្នាក់តែមួយពិតប្រាកដ។**
- **អ្នកណាដោះសោ?** នាយក (`isSchoolAdmin`) ជានិច្ច។ គ្រូឯកជន (self-serve org)
  ជា `owner` ខ្លួនឯង ដូច្នេះគាត់ដោះសោបាន — ត្រឹមត្រូវ ព្រោះគ្មាននរណាផ្សេងទេ។
  គ្រប់ការដោះសោត្រូវ `auditLog` — សោដែលដោះបានស្ងាត់ៗ មិនមែនជាសោទេ។

---

## ១១.៩ ហានិភ័យ និងអ្វីដែលនឹងបែក

| ហានិភ័យ | ភាពធ្ងន់ធ្ងរ | ការការពារ |
|---|---|---|
| ការរួមខែផ្លាស់មធ្យមភាគឆមាសដែលបានបោះពុម្ពរួច | ★★★ | ព្រមាន + audit + ហាមលើវគ្គចាក់សោ |
| `member_months` ត្រួតគ្នា → រាប់ពិន្ទុពីរដង | ★★★ | `validateCalendar` លើ server ជាព្រំដែន |
| Clamp កាត់ `sem_eval_*` ជា NULL | ★★★ | ឆ្លងកាត់ `splitScoreCell` ជាមុន; verify script |
| `monthsForSemester` ចាស់ និងថ្មីរស់ជាមួយគ្នា | ★★ | back-compat មួយបន្ទាត់ + ប្តូរអ្នកហៅម្តងមួយ |
| គ្រូកំណត់ប្រតិទិនពាក់កណ្តាលឆ្នាំ | ★★ | copy-on-write ១២ ជួរ; គ្មានស្ថានភាពពាក់កណ្តាល |
| ថ្នាក់ជាច្រើនក្រោមគ្រូម្នាក់ ប្រតិទិនខុសគ្នា | ★ | scope ជា class រួច; `?class=` ដឹកជញ្ជូនរួច |

**ការធ្វើតេស្ត៖** គម្រោងគ្មាន test framework។ Pattern ដែលមានស្រាប់គឺ
`scripts/verify-*.mts` (node ធម្មតា, import ទំនាក់ទំនងដោយមាន `.ts`)។ បន្ថែម៖
- `scripts/verify-calendar.mts` — `DEFAULT_CALENDAR` ≡ `monthsForSemester` ចាស់;
  partition; anchor; ស្លាកមកពី members; ការរួមបន្ថយភាគបែងពិតប្រាកដ។
- `scripts/verify-clamp.mts` — តារាង §១១.៧ ជា assertion ១៤។

---

## ១១.១០ អ្វីដែលរកឃើញបន្ថែម (សូមសិក្សាបន្ថែម)

រឿងទាំងនេះនៅក្រៅសំណើផ្ទាល់ តែពួកវាប៉ះអ័ក្សដដែល៖

1. **មធ្យមភាគប្រចាំឆ្នាំគ្មានផ្ទះ។** `(s1+s2)/2` គណនាក្នុង `ScoreTotalClient.tsx:151`
   ដោយផ្ទាល់ ខណៈ `semesterAverage` រស់ក្នុង `lib/scores/semester.ts`។ នេះជានិយមន័យ
   ទីបីនៃមធ្យមភាគដែលអាចរសាត់។ → ផ្លាស់ទៅ `annualAverage()` ក្បែរបងប្អូនរបស់វា។

2. **ច្បាប់ "ខ្វះពាក់កណ្តាល = សូន្យ" បំភាន់ពេលឆមាសកំពុងដំណើរការ។** នៅខែវិច្ឆិកា
   គ្មានពិន្ទុប្រឡង ដូច្នេះសិស្សគ្រប់រូបបង្ហាញពាក់កណ្តាលនៃពិន្ទុពិត។ ច្បាប់នេះ
   ត្រឹមត្រូវ *ពេលចប់ឆមាស* តែខុស *ពេលកំពុងដំណើរការ*។ ប្រតិទិនដែលមានកាលបរិច្ឆេទ
   ធ្វើឲ្យប្រព័ន្ធដឹងថាវគ្គមិនទាន់ដល់ → បង្ហាញ `—` ជំនួស `4.00`។ **នេះជាតម្លៃ
   ផលិតផលធំបំផុតដែល INV-4 ដោះសោ** ហើយវាមិនស្ថិតក្នុងសំណើដើមទេ។

3. **`FALLBACK_ACADEMIC_YEAR = '2023-2024'` នៅរស់នៅ ៥ ទំព័រ** (`record-book`,
   `score-analyse`, `student-tracking`, `score/print`, `print-student-age`)។ គ្រូដែល
   `settings.academic_year` ទទេ អាន/សរសេរវគ្គឆ្នាំ ២០២៣-២០២៤ — ក្រឡាទទេអស់ ដោយ
   គ្មានសារកំហុស។ ប្រតិទិនធ្វើឲ្យវាកាន់តែអាក្រក់ (ប្រតិទិន keyed តាមឆ្នាំ)។
   → ប្តូរទៅ `getCurrentAcademicYear()` ជាការជួសជុលឯករាជ្យ **មុន** ចាប់ផ្តើម។

4. **`/ranking` ចាស់អានតែ template ពេញ** ខណៈ engine អាន selection-narrowed
   (កត់ត្រារួចក្នុង CLAUDE.md)។ ប្រតិទិនបន្ថែមអ័ក្សខុសគ្នាទីពីរ។ ការសម្រេច៖
   `/ranking` ចាស់ **មិនអាន** `score_calendar_periods` (វានៅតែជា sem1=nov–mar)
   ហើយ Print Center និយាយចេញថាឯកសារ engine ជាឯកសារត្រូវ។ បើមិនដូច្នេះទេ
   ការបែកបាក់រីករាលដាល។

5. **`homework` ប្រើ cycle ថ្ងៃទី២៦→២៥ ផ្ទាល់ខ្លួន** (`homework/enter/period.ts`)។
   វាមិនប៉ះប្រតិទិននេះទេ ហើយ **មិនគួរបញ្ចូលគ្នា** — cycle នោះជាច្បាប់រាយការណ៍ MoEYS
   មិនមែនជាការជ្រើសរើសរបស់គ្រូ។ សរសេរវាចេញ ដើម្បីកុំឲ្យអ្នកអានក្រោយ "ជួសជុល" វា។

---

## ១១.១១ លំដាប់អនុវត្តន៍ — ៦ prompts ឯករាជ្យ

នីមួយៗ build បាន, ship បាន, និងអាចត្រឡប់វិញបាន។ លំដាប់មានសារៈសំខាន់៖
prompt ០ និង ១ មិនប៉ះលេខណាមួយ ដូច្នេះវាចេញមុនដោយសុវត្ថិភាព។

| # | ចំណងជើង | ប៉ះលេខ? | អ្វីដែលចេញ |
|---|---|---|---|
| ០ | ជួសជុល `FALLBACK_ACADEMIC_YEAR` | ✅ បាទ (ជួសជុល) | ៥ ទំព័រប្តូរទៅ `getCurrentAcademicYear()` |
| ១ | Clamp អតិបរមា (client + server) | ❌ ទេ | `clampScoreCell` + ៤ កន្លែងហៅ + verify |
| ២ | `lib/scores/calendar.ts` + `DEFAULT_CALENDAR` | ❌ ទេ | pure module + back-compat + verify |
| 3 | Migration 00029 + resolver + hook | ❌ ទេ | តារាង, RLS, `useScoreCalendar` |
| 4 | ទម្រង់ tab `វគ្គពិន្ទុ` | ⚠️ ពេលគ្រូរក្សាទុក | timeline UI + `saveClassCalendar` |
| 5 | អ្នកប្រើប្រតិទិន: `/score/enter`, `/score/total`, `report-data` | ⚠️ បាទ | picker តាមវគ្គ; ឯកភាពអេក្រង់↔ក្រដាស |
| 6 | ចាក់សោវគ្គ | ❌ ទេ | `locked_at`, server refuse, audit |
