# Prompts អនុវត្តន៍ — វគ្គពិន្ទុ និងទម្រង់បញ្ចូល

Spec៖ [`score-period-and-entry-design.md`](score-period-and-entry-design.md)។
Prompt នីមួយៗឯករាជ្យ, build បាន, ship បាន។ ដំណើរការតាមលំដាប់។
រាល់ prompt សន្មតថា agent អាន `CLAUDE.md` និង `AGENTS.md` រួច។

---

## Prompt 0 — ជួសជុលឆ្នាំសិក្សាលំនាំដើមស្លាប់

> **មិនប៉ះនឹងវគ្គពិន្ទុទេ ប៉ុន្តែត្រូវចេញមុនគេ។** ប្រតិទិន keyed តាមឆ្នាំសិក្សា;
> ការសាងសង់វានៅពីលើឆ្នាំលំនាំដើមខុស នឹងធ្វើឲ្យរាល់ការ debug ក្រោយពិបាកទ្វេដង។

```
`FALLBACK_ACADEMIC_YEAR` ក្នុង lib/constants/academic.ts គឺ '2023-2024' — តម្លៃចាស់
ដែលរក្សាទុកសម្រាប់ភាពស្មើគ្នានៃឥរិយាបថកាលពី refactor មុន។ គ្រូណាដែល
settings.academic_year ទទេ នឹងអាននិងសរសេរពិន្ទុក្រោមឆ្នាំ ២០២៣-២០២៤ ហើយឃើញ
អេក្រង់ទទេដោយគ្មានសារកំហុស។

ប្តូរអ្នកហៅទាំង ៥ ទៅ getCurrentAcademicYear():
  app/(main)/record-book/page.tsx:37
  app/(main)/score-analyse/page.tsx:30
  app/(main)/student-tracking/page.tsx:31
  app/(main)/score/print/page.tsx:46
  app/(main)/print-student-age/page.tsx:32

រក្សា FALLBACK_ACADEMIC_YEAR ជា export ដដែល (កុំបំបែក import ណាមួយ) តែកែ
JSDoc ឲ្យនិយាយថាវាលែងប្រើ ហើយហេតុអ្វី។ គ្មានការប្តូរឥរិយាបថផ្សេងទៀត។
```

**ទទួលយកបាន៖** `npm run build` ជោគជ័យ; គ្មាន `FALLBACK_ACADEMIC_YEAR` នៅក្នុង
`app/` ទៀត; គ្មានឯកសារផ្សេងប្តូរ។

---

## Prompt 1 — Clamp អតិបរមាពិន្ទុ (client + server)

```
BUG: <input type="number" max={…}> ក្នុង app/(main)/score/enter/ScoreEntryGrid.tsx:157
ជា validation constraint មិនមែន input filter។ គ្រូវាយ 11 ក្នុងក្រឡា /10 →
handleScoreChange (ScoreEnterClient.tsx:357) ទុក '11' → saveScores → splitScoreCell
→ score_value = 11 ចូល database ក្រោម toast ជោគជ័យ។ ដូចគ្នាចំពោះ ScoreEntryList។

បន្ថែម clampScoreCell(raw: string, maxScore: number): string ទៅ
lib/utils/score-value.ts (pure, ក្បែរ splitScoreCell)។ ច្បាប់ជាក់លាក់:

  ''      max 10 → ''       ទទេ = មិនបានវាយតម្លៃ មិនមែនសូន្យ
  '8.5'   max 10 → '8.5'
  '11'    max 10 → '10'     ← សំណើ
  '10.01' max 10 → '10'
  '-3'    max 10 → '0'
  '55'    max 50 → '50'     អនុ/វិទ្យាល័យដំណើរការដដែល
  '1.'    max 10 → '1.'     កំពុងវាយ — កុំកាត់ខ្ទង់ទសភាគ
  'ល្អ'   max 10 → 'ល្អ'    ★ ត្រូវឆ្លងកាត់ដោយមិនប៉ះ

★ ចំណុចប្រថុយបំផុត: មុខវិជ្ជា sem_eval_* ជា dropdown ដែលរក្សាទុកពាក្យខ្មែរក្នុង
score_text (migration 00012)។ clampScoreCell ដែលហៅ parseFloat ដោយងងឹតងងុលនឹង
ធ្វើម្តងទៀតនូវ bug ដដែលដែល 00012 ជួសជុល — សរសេរ NULL ក្រោម toast ជោគជ័យ។
សម្រេចថាក្រឡាជា text ដោយប្រើ តក្កដដែលនឹង splitScoreCell រួចត្រឡប់វាដដែល។

ហៅវាចំនួន ៤ កន្លែង:
  1. handleScoreChange (ScoreEnterClient.tsx:357) — ក្រឡាលោតមក 10 ភ្លាមៗ
  2. ការបំពេញជាដុំ (bulkValue, ជុំវិញ ScoreEnterClient.tsx:1192)
  3. "ចម្លងពីខែមុន" (ScoreEnterClient.tsx:487)
  4. ★ saveScores (app/(main)/score/enter/actions.ts) — ព្រំដែនពិត។
     ប្រើ resolveServerGradingContext(user.id, classId, scoreType) ដែលមានស្រាប់
     ក្នុង lib/utils/serverScope.ts:469; វាត្រឡប់ maxByColumn (:442) តាមរយៈ
     resolver ដដែលនឹង client ដូច្នេះលេខអតិបរមាមិនអាចរសាត់គ្នា។
     Clamp ក្នុង upsertPayload.map() មុន splitScoreCell។

បន្ថែម onPaste ទៅក្រឡាដែរ — ការបិទភ្ជាប់ពី Excel ជាផ្លូវចូលពិត។

maxScoreFor ដែលមានស្រាប់ (ScoreEntryGrid props) គឺជាប្រភពនៃ maxScore ខាង client
— កុំបង្កើតជាថ្មី។

សរសេរ scripts/verify-clamp.mts តាម pattern របស់ scripts/verify-score-total.mts
(node ធម្មតា, import ទំនាក់ទំនង, .ts extension ជាក់ស្តែង) ដែល assert តារាង
ខាងលើទាំង ៨ ជួរ បូកនឹងករណីខ្មែរទាំង ៤ (ល្អ / ល្អបង្គួរ / មធ្យម / ខ្សោយ)។
```

**ទទួលយកបាន៖** មិនអាចរក្សាទុក `11` បានទៀត ទោះតាមរយៈ UI ឬដោយហៅ action ផ្ទាល់;
ការវាយតម្លៃខ្មែររក្សាទុកបានដដែល; verify script ជាប់។

---

## Prompt 2 — `lib/scores/calendar.ts` (pure, គ្មានការប្តូរឥរិយាបថ)

```
បង្កើត lib/scores/calendar.ts — កន្លែងតែមួយដែលសម្រេចថា "វគ្គពិន្ទុមួយគឺជាអ្វី"។
Pure module: គ្មាន React, គ្មាន server-only, គ្មាន '@/' alias, import ទំនាក់ទំនង
ដោយមាន .ts extension — ច្បាប់ដដែលនឹង lib/scores/semester.ts និង template.ts
ព្រោះ verify scripts run វាក្រោម node ធម្មតា។

★ INVARIANT ដែលអ្នកមិនត្រូវបំពាន:
scores.score_period = `${monthId}-${academicYear}` គឺជា SCHEMA។ វាត្រូវបាន parse
ត្រឡប់វិញយ៉ាងតិច ៥ កន្លែង (lib/reporting/report-data.ts:449,
app/(main)/students/[id]/queries.ts, attendance/yearly, record-book,
parent-report)។ វគ្គរួម (មីនា-មេសា គិតតែមួយ) ត្រូវរក្សាទុកក្រោម *anchor* —
MonthId ដែលមានស្រាប់ គឺខែដំបូងតាមលំដាប់ឆ្នាំសិក្សានៃវគ្គនោះ។ ការរួមប្តូរតែ
ស្លាក និងសមាជិកភាព។ កុំបង្កើត key ថ្មីដូច 'mar_apr' ជាដាច់ខាត។

API:
  interface ScorePeriod {
    key: MonthId          // ★ ផ្នែកខាងឆ្វេងនៃ score_period
    labelKm: string
    members: MonthId[]    // ≥1, មាន key
    semester: SemesterId
    startsOn: string | null
    endsOn: string | null
    locked: boolean
    sortOrder: number
  }
  const DEFAULT_CALENDAR: readonly ScorePeriod[]
  resolveCalendar(rows, ctx): ScorePeriod[]
  periodsForSemester(cal, s): ScorePeriod[]
  periodKeysForSemester(cal, s): MonthId[]
  periodForDate(cal, d): ScorePeriod | null
  validateCalendar(periods): CalendarProblem[]
  deriveLabel(members): string          // ['mar','apr'] → 'មីនា-មេសា'

DEFAULT_CALENDAR ត្រូវផលិតឡើងវិញនូវឥរិយាបថសព្វថ្ងៃឲ្យបាន ១០០%: ១២ វគ្គ
តាមលំដាប់ MONTHS_BY_ACADEMIC_YEAR, សមាជិកម្នាក់ក្នុងមួយវគ្គ, sem1 = ៥ វគ្គដំបូង
(FIRST_SEMESTER_LENGTH ក្នុង lib/scores/semester.ts:44)។ ទាញវាចេញពី
MONTHS_BY_ACADEMIC_YEAR កុំវាយបញ្ជីដោយដៃ — បញ្ជីវាយដោយដៃគឺជារបៀបដែល bug
ឆមាសដើមកើតឡើង (សូមមើល header comment របស់ semester.ts)។

validateCalendar ត្រូវចាប់: members ត្រួតគ្នារវាងវគ្គ (ពិន្ទុរាប់ពីរដង), anchor
មិនស្ថិតក្នុង members, ឆមាសមិនជាចន្លោះជាប់គ្នា, MonthId មិនត្រឹមត្រូវ។
ខែដែលគ្មានក្នុងវគ្គណាទាល់តែសោះ គឺ *ត្រឹមត្រូវ* (ខែមិនស្រង់ពិន្ទុ) — កុំរាយការណ៍
ជាបញ្ហា។

រួចប្តូរ lib/scores/semester.ts:monthsForSemester ឲ្យក្លាយជា:
  return periodKeysForSemester(DEFAULT_CALENDAR, s)
រក្សា signature និងលទ្ធផលដដែលបេះបិទ។ គ្មានអ្នកហៅណាមួយប្តូរក្នុង prompt នេះ។

scripts/verify-calendar.mts ត្រូវ assert:
  - periodKeysForSemester(DEFAULT_CALENDAR,'sem1') ស្មើ ['nov','dec','jan','feb','mar']
  - 'sem2' ស្មើខែ ៧ ដែលនៅសល់
  - partition detection (រួម mar+apr រួច assert apr លែងជា key)
  - deriveLabel(['mar','apr']) === 'មីនា-មេសា'
  - ការរួមបន្ថយចំនួនវគ្គក្នុងឆមាសពិតប្រាកដ (ភាគបែងនៃ monthlyComponent)
```

**ទទួលយកបាន៖** `verify-calendar.mts` និង `verify-score-total.mts` ទាំងពីរជាប់;
`npm run build` ជោគជ័យ; គ្មានលេខណាមួយប្តូរនៅកន្លែងណាក្នុង app។

---

## Prompt 3 — Migration 00029 + resolver ខាង server + hook

```
បង្កើត supabase/migrations/00029_score_calendar_periods.sql តាម pattern របស់ 00028
(header comment ពន្យល់ហេតុផល, additive ១០០%, គ្មាន DROP, idempotent)។

តារាង score_calendar_periods — DDL ពេញ និងហេតុផលនៅ §១១.៣ នៃ
docs/score-period-and-entry-design.md។ ចំណុចសំខាន់:
  - scope 'school' | 'class' ប៉ុណ្ណោះ។ គ្មាន 'system' — ស្រទាប់ system គឺ
    DEFAULT_CALENDAR ក្នុង code ដូច្នេះសូន្យជួរ = ឥរិយាបថសព្វថ្ងៃ។
  - month_key ជា anchor (ផ្នែកឆ្វេងនៃ score_period)។ member_months ជា TEXT[]។
  - CHECK (month_key = ANY(member_months))
  - unique partial index លើ (class_id, academic_year, month_key) និង
    (school_id, academic_year, month_key)
  - locked_at / locked_by សម្រាប់ Prompt 6 (បង្កើតឥឡូវ ប្រើក្រោយ)

RLS: copy pattern ពី class_template_subjects ក្នុង 00028 ដោយផ្ទាល់។
កុំបង្កើត policy shape ថ្មី។ សរសេរ scope='class' ត្រូវការ active
teacher_assignments លើថ្នាក់នោះ; scope='school' ត្រូវការ school admin។
កុំភ្លេច GRANT សម្រាប់ PostgREST (សូមមើល 00005–00008)។

បន្ថែម ScoreCalendarPeriodRow ទៅ lib/types.ts តាមរចនាសម្ព័ន្ធពិត។

ខាង server: បន្ថែម fetchScoreCalendar(scope) ទៅ lib/utils/serverScope.ts ក្បែរ
fetchScoreTemplate ដែលមានស្រាប់ ហើយត្រឡប់ ScorePeriod[] តាមរយៈ resolveCalendar។
ខាង client: lib/hooks/useScoreCalendar.ts តាមគំរូ lib/hooks/useScoreTemplate.ts
បេះបិទ (ស្ថានភាព loading ដដែល, ការភ្ជាប់ context ដដែល)។

គ្មានអេក្រង់ណាមួយប្រើវានៅឡើយទេក្នុង prompt នេះ។
```

**ទទួលយកបាន៖** migration អនុវត្តលើ stack ក្នុងស្រុកដោយស្អាត; គណនីដែលគ្មានជួរ
ដំណើរការដដែលបេះបិទ; hook ត្រឡប់ `DEFAULT_CALENDAR` សម្រាប់ថ្នាក់ដែលមិនបានកំណត់។

---

## Prompt 4 — ទម្រង់ tab `វគ្គពិន្ទុ`

```
បន្ថែម tab ទីពីរ 'វគ្គពិន្ទុ' ទៅ app/(main)/score/subjects/ScoreSubjectsClient.tsx។

★ កុំបង្កើតទំព័រថ្មី។ §៧ នៃ docs/score-system-design.md កត់ត្រារួចថា ការមាន
ទំព័រកំណត់រចនាសម្ព័ន្ធពីរ គឺជារបៀបដែលពួកវាឈានទៅផ្ទុយគ្នា — ហេតុនេះ
/score/template ជា redirect។ /score/subjects មាន ?class= រួច, មាន assignment
guard រួច, មាន pattern resolve→override→audit រួច។

UI ជា timeline ១២ ប្លុកតាមលំដាប់ឆ្នាំសិក្សា បំបែកជាពីរជួរតាមឆមាស —
មិនមែនតារាងជួរដេក។ ហេតុផល: invariant ដែលងាយបំពានបំផុតគឺ partition
(មិនត្រួតគ្នា មិនខ្វះ) ហើយ timeline ធ្វើឲ្យការត្រួតគ្នាមើលឃើញ។ គំនូសព្រាង
ពេញនៅ §១១.៥។

ច្បាប់ interaction ដែលមិនអាចចរចាបាន:
  1. រួមបានតែវគ្គជាប់គ្នា ក្នុងឆមាសតែមួយ។ ឧទាហរណ៍របស់អ្នកប្រើ (មីនា-មេសា
     ក្នុងឆមាស១) ទាមទារការផ្លាស់ព្រំដែនឆមាសជាមុន — ស្នើជំហាននោះឲ្យស្វ័យប្រវត្តិ
     ជំនួសការបដិសេធស្ងាត់ៗ។
  2. Anchor = ខែដំបូងតាមលំដាប់ឆ្នាំសិក្សាជានិច្ច។ គ្មានជម្រើសសម្រាប់គ្រូ —
     ការជ្រើស anchor គឺជាការផ្លាស់ទីពិន្ទុដោយមិនដឹងខ្លួន។
  3. មុនរួម រាប់ពិន្ទុដែលមានស្រាប់ក្រោមខែដែលនឹងត្រូវស្រូបចូល ហើយបង្ហាញចំនួន
     ("ពិន្ទុ ៨៤ ក្រឡាក្នុងខែមេសានឹងលាក់")។ កុំលុប កុំផ្លាស់ទី។ ច្បាប់ដដែល
     នឹង enabled_columns ក្នុង 00028: ការបង្រួមមិនដែលលុបពិន្ទុ។
  4. ព្រំដែនឆមាសជាការទាញតែមួយ មិនមែនប្រអប់ធីកក្នុងវគ្គនីមួយៗ (នោះអនុញ្ញាត
     sem1/sem2/sem1 ដែលមិនមានន័យ)។
  5. កាលបរិច្ឆេទជាជម្រើស។ ទុកទទេបាន។ កុំបង្ខំគ្រូបំពេញ ២៤ កាលបរិច្ឆេទ
     មុនពេលបញ្ចូលពិន្ទុដំបូង។
  6. រក្សាទុក = ជំនួសសំណុំទាំងមូល (copy-on-write ១២ ជួរ)។ ការមាន override
     ពាក់កណ្តាលធ្វើឲ្យ partition មិនអាចផ្ទៀងផ្ទាត់បាន។

app/(main)/score/subjects/calendarActions.ts:
  saveClassCalendar(classId, academicYear, periods)
    requirePermission('scores:update')
    resolveServerScope(user.id, classId)      // មិនអាចពង្រីកសិទ្ធិ
    validateCalendar(periods)  ← ★ ព្រំដែនពិត, មិនមែន client
    delete+insert ក្នុង transaction តែមួយ
    auditLog('score_calendar.updated', { before, after })
    revalidatePath /score/enter, /score/total, /score/subjects
  resetClassCalendar(classId, academicYear)   // លុប ១២ ជួរ → ត្រឡប់ទៅមរតក

បង្ហាញការព្រមានច្បាស់មុនរក្សាទុកពេលការរួមនឹងប្តូរភាគបែងនៃមធ្យមភាគឆមាស។
អត្ថបទ UI ថ្មីទាំងអស់ជាភាសាខ្មែរ។ ប្រើ components/ui ដែលមានស្រាប់ —
គ្មាន <select> ដើម គ្មាន pager ធ្វើដោយដៃ។
```

**ទទួលយកបាន៖** គ្រូអាចរួម មីនា+មេសា ជាវគ្គមួយហើយឃើញវាបន្ត; `score_period`
មិនប្តូរ; ការបញ្ជូន partition មិនត្រឹមត្រូវទៅ action ដោយផ្ទាល់ ត្រូវបានបដិសេធ។

---

## Prompt 5 — អ្នកប្រើប្រតិទិន (កន្លែងលេខផ្លាស់ប្តូរ)

```
ភ្ជាប់ប្រតិទិនដែល resolve ទៅអ្នកអានទាំងបី។ នេះជា prompt ដែលលេខផ្លាស់ប្តូរ —
អានវាទាំងស្រុងមុនកែ។

1. app/(main)/score/enter/ScoreEnterClient.tsx
   picker "ខែ" ក្លាយជា picker "វគ្គពិន្ទុ"។ ស្លាកមក ScorePeriod.labelKm;
   value នៅតែ ScorePeriod.key ដូច្នេះ scorePeriod (:146) មិនប្តូររូបរាង។
   Default = periodForDate(calendar, new Date()) ជំនួស 'nov' ថេរ (:101)។
   ខែដែលត្រូវស្រូបចូលមិនលេចជាជម្រើសទៀត។

2. app/(main)/score/total/ScoreTotalClient.tsx
   selectedSemesterMonths (:255) ឈប់ចាប់ផ្តើមពី monthsForSemester() ថេរ ហើយ
   ចាប់ផ្តើមពី periodKeysForSemester(calendar, semester)។ គ្រូនៅតែអាចដកចេញ
   បណ្តោះអាសន្នសម្រាប់ *មើល* — រក្សាការគ្រប់គ្រងនោះ។

3. lib/reporting/report-data.ts:509
   monthsForSemester(semester) → periodKeysForSemester(calendar, semester),
   ដែល calendar មកពី fetchScoreCalendar នៃ scope ដែល resolver មានស្រាប់។

★ នេះជាការជួសជុលមួយ មិនមែនត្រឹមការភ្ជាប់: សព្វថ្ងៃគ្រូប្តូរខែក្នុង /score/total
ឃើញមធ្យមភាគប្តូរលើអេក្រង់ ខណៈ ranking_semester បោះពុម្ពលេខផ្សេង ព្រោះជម្រើស
រស់តែក្នុង React state។ បន្ទាប់ពី prompt នេះ ទាំងពីរចាប់ផ្តើមពីទិន្នន័យតែមួយ។

កុំប៉ះ:
  - /ranking ចាស់។ វានៅតែអាន template ពេញ និង sem1=nov–mar (ភាពខុសគ្នាដែល
    កត់ត្រារួចក្នុង CLAUDE.md)។ ការឲ្យវាអានប្រតិទិនពាក់កណ្តាល ធ្វើឲ្យការបែកបាក់
    រីករាលដាល។ Print Center និយាយរួចថាឯកសារ engine ជាឯកសារត្រូវ។
  - homework/enter/period.ts។ Cycle ថ្ងៃទី២៦→២៥ ជាច្បាប់រាយការណ៍ MoEYS
    មិនមែនជាការជ្រើសរើសរបស់គ្រូ។ វាមិនប្រើប្រតិទិននេះទេ ហើយមិនគួរប្រើ។

ធ្វើបច្ចុប្បន្នភាព scripts/verify-reporting.mts ឲ្យគ្របដណ្តប់ថ្នាក់ដែលមាន
ប្រតិទិនកែប្រែ ហើយ assert ថា /score/total និង ranking_semester ផលិតលេខដូចគ្នា។
```

**ទទួលយកបាន៖** ថ្នាក់ដែលមានវគ្គរួម បង្ហាញមធ្យមភាគឆមាសដូចគ្នាបេះបិទលើអេក្រង់
និងលើក្រដាស; ថ្នាក់ដែលមិនបានកំណត់ ផលិតលេខដដែលនឹងមុន prompt 2។

---

## Prompt 6 — ចាក់សោវគ្គ

```
`attendance_locks` មានតាំងពី 00003។ ពិន្ទុគ្មានសមភាគីទេ: បន្ទាប់ពីបោះពុម្ព
សៀវភៅតម្កល់ពិន្ទុ ពិន្ទុនៅតែអាចកែដោយស្ងាត់ស្ងៀម ហើយក្រដាសដែលបោះពុម្ពរួច
ឈប់ត្រូវនឹង database។

ប្រើ locked_at / locked_by ដែល 00029 បង្កើតរួច។ អនុវត្តទាំងបីស្រទាប់:
  - UI: grid ក្នុង /score/enter ក្លាយជា read-only + Badge "🔒 ចាក់សោ"
  - Server: saveScores បដិសេធពេលវគ្គចាក់សោ — ★ មិនមែនត្រឹមលាក់ប៊ូតុង
  - ទម្រង់ប្រតិទិន: មិនអាចរួម/បំបែក/ប្តូរឆមាសនៃវគ្គដែលចាក់សោ

អ្នកដោះសោ = isSchoolAdmin()។ គ្រូ self-serve ជា owner ខ្លួនឯង ដូច្នេះគាត់ដោះសោ
បាន — ត្រឹមត្រូវ ព្រោះគ្មាននរណាផ្សេងទេ។ រាល់ការចាក់សោ និងដោះសោត្រូវ auditLog;
សោដែលដោះបានស្ងាត់ៗ មិនមែនជាសោទេ។

កុំសរសេរ RLS policy លើ scores សម្រាប់រឿងនេះនៅឡើយ។ ការពិនិត្យខាង server
គ្រប់គ្រាន់រហូតដល់មានគ្រូច្រើននាក់លើថ្នាក់តែមួយពិតប្រាកដ ហើយ policy លើផ្លូវ
សរសេរពិន្ទុ ថ្លៃលើរាល់ការ upsert។ សរសេរការដោះដូរនោះក្នុង header comment។
```

**ទទួលយកបាន៖** វគ្គដែលចាក់សោមិនអាចទទួលការសរសេរ ទោះតាមរយៈ UI ឬដោយហៅ
action ផ្ទាល់; គ្រូធម្មតាមិនអាចដោះសោ; ការដោះសោគ្រប់ករណីលេចក្នុង `audit_logs`។
