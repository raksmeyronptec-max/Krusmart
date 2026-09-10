# Phase 12 — Primary School UX Audit

**Read-only.** No application code, schema, migration, configuration, route, navigation entry,
style or string was changed. The only file added is this one.

---

## 1. Baseline

| | |
| --- | --- |
| HEAD | `694fa24` — *UX redesign programme: phases 0-11* |
| Branch | `main`, and `origin/main` is at the same commit |
| Working tree | clean (0 changes) |

| Gate | Result |
| --- | --- |
| `npm run lint` | **clean** |
| `npm run typecheck` | **clean** |
| `npm run verify` | **31/31** harnesses |
| `npm run build` | **compiled successfully** |
| `npm run verify:live` | **32/34** — `verify-annual-live` and `verify-ranking-live` fail |
| `scripts/validate-rls.mjs` | **64/64** behavioural checks |

The two live failures are **known fixture drift, not regressions**: the seeded class now holds
35 pupils where the harness expects 5, and the fixture writes semester exam marks under *monthly*
column ids. Both are recorded in `phase7-implementation.md` §3 and `phase8-implementation.md` §6.
Nothing was modified to make any gate pass.

---

## 2. Current architecture, as it actually is

Verified against the repository rather than against earlier prompts.

- **45 routes** under `app/(main)`, 11 under `app/admin`, 11 under `app/parent/(portal)`,
  8 under `app/login`, 5 under `app/onboarding`.
- **12 navigation modules across 4 sections** (§13 has the full tree).
- **33 migrations.** Legacy and V2 scoping both run; the mode is chosen from data.
- **26 routes render the shared `ClassContextBar`**; five more state the class through
  `ScoreWorkspaceHeader`; two state it through **their own private implementation** (§14).
- **34 verification harnesses** plus a 64-check behavioural RLS suite.

Phases 0–11 closed the correctness family. **This audit found no surviving P0.** The two
productions of a ranking sheet — `/ranking`'s own `window.print()` and the engine's
`ranking_monthly` — now narrow their subject set identically
(`applySelection(resolveTemplate(source, mode, context), selection)` in both
`RankingClient.tsx:135` and `report-data.ts:213`), so the last plausible candidate for "one
question, two answers" does not reproduce. What remains is **workflow, joins, information
architecture and polish** — which is a different and more ordinary class of problem.

---

## 3. The teacher's mental model — and where it is not met

The product now organises itself around a model that is genuinely coherent:

> **ពិន្ទុ is what I enter · លទ្ធផល is what I learn · របាយការណ៍ is what I produce.**

The navigation names those three things correctly and the module front doors are right
(`ពិន្ទុ` → `/score/enter`, not the totals table). **The model breaks at the seams, not at the
concepts** — and specifically at the third arrow, where a teacher who has just understood a
result has no way to produce the document of it without leaving through the sidebar.

Three secondary breaks:

- a **fourth** document module (`ឯកសារ`) exists in another section, holding certificates;
- **annual results** live under `របាយការណ៍`, not under `លទ្ធផល`;
- `/score/print` — a ministry-format document — lives under `ពិន្ទុ`.

---

## 4. End-to-end flow map

Extracted mechanically from every `href`, `router.push` and `redirect` under `app/(main)`, then
verified by hand for the dynamically-built links (`/classroom`'s `CLASS_TOOLS`, the Print
Center's `legacyHref` rows, `SCORE_WORKSPACE_TABS`).

```
LOGIN ──▶ DASHBOARD
             │  quick actions: ចុះវត្តមាន · បញ្ចូលពិន្ទុ · បន្ថែមសិស្ស · បង្កើតកិច្ចការផ្ទះ · បោះពុម្ពរបាយការណ៍
             │  StatCards: /student-list · /attendance/monthly · /score/total · /homework/enter
             ▼
          CLASSROOM  ── per-class card, 6 tools, all carrying ?class= ──┐
             │                                                          │
   ┌─────────┼──────────────┬──────────────┬─────────────┬──────────────┤
   ▼         ▼              ▼              ▼             ▼              ▼
STUDENT   ENROLLMENT   SCORE/SUBJECTS  ATTENDANCE/    SCORE/ENTER   PRINT-CENTER
 LIST         │              │          MONTHLY ✗         │              │
   │          │              │         (read-only)        │              │
   │◀── save ─┘              └──▶ /score/enter            │              │
   ├──▶ /students/[id] ──▶ /student-list                  │              │
   └──▶ /print-list                                       │              │
                                        ┌─────────────────┘              │
                                        ▼  (workspace tab strip)         │
                        SCORE/ENTER ⇄ SCORE/TOTAL ⇄ SCORE/COLLECT        │
                                        ⇄ RANKING ⇄ SCORE-ANALYSE        │
                                              │                          │
                                              ✗ no join                  │
                                              ▼                          ▼
                                        PRINT CENTER ────▶ generate dialog ──▶ file
                                              ▲
                              only reachable from: dashboard · classroom ·
                              students/[id] · FeatureGrid · the sidebar

HONOR-ROLL ──────── no tabs, no outbound links, no return path ──────── ✗ dead end
```

### Join analysis

| # | Arrow | CTA | Context inherited | Verdict |
| --- | --- | --- | --- | --- |
| 1 | Dashboard → Classroom | `ថ្នាក់របស់ខ្ញុំ` StatCard | `?class=` | ✅ |
| 2 | Classroom → Student list | card tool `បញ្ជីសិស្ស` | `?class=` explicit | ✅ |
| 3 | Classroom → **Attendance** | card tool `វត្តមាន` | `?class=` | ❌ **lands on a read-only sheet** |
| 4 | Student list → Enrollment | `បញ្ចូលសិស្សថ្មី` | `?class=` | ✅ |
| 5 | Enrollment → Student list | after save, `router.push` | `?class=` | ⚠️ **new pupil not findable** |
| 6 | Student list → Pupil | row click | pupil's own class | ✅ |
| 7 | Pupil → Student list | back link | pupil's class | ✅ |
| 8 | Classroom → Subjects | card tool `មុខវិជ្ជា` | `?class=` | ✅ |
| 9 | Subjects → Score entry | `បញ្ចូលពិន្ទុ` link | `?class=` | ✅ |
| 10 | Score entry ⇄ Results | workspace tab strip | class + period | ✅ |
| 11 | **Results → Print Center** | — | — | ❌ **no join exists** |
| 12 | Honour roll → anywhere | — | — | ❌ **dead end** |
| 13 | Attendance entry → review | — | — | ❌ **no join** (monthly ⇄ yearly do link each other) |
| 14 | Print Center → document | row button / generate dialog | class · year · period | ✅ |

---

## 5. Journey 1 — Class → Students

**Strong.** The class is stated on every screen in the chain, `?class=` is carried on every
link, `/enrollment` names the class that will receive the pupil, and the pupil page is reached by
id and links back to *the pupil's own* class rather than the ambient one.

**F1 · The pupil a teacher just created is not on the screen they are returned to.** *(P1)*

`enrollment/page.tsx:303` pushes to `classHref("/student-list")` after a save. The roster sorts
by `order_index` then `created_at` **ascending** (`StudentTableClient.tsx:47-50`) and pages at
**20 rows** (`:136`). For the seeded class of 35, a newly added pupil is the last row of **page
2** — unflagged, unhighlighted, and off-screen. Nothing in `/student-list` marks a recently added
pupil.

The teacher's own question after saving is *"did that work?"*. The toast answers it; the screen
does not.

**F2 · Transfer and edit are correctly separated, and the separation is not explained.** *(P2)*

`/students/[id]`'s `TransferPanel` sits inside the enrolment card beneath the history, which is
the right place — seeing `៤ក · ២០២៥-២០២៦ · បច្ចុប្បន្ន` above it is what communicates that the
old placement is kept. But `/enrollment?student=<id>` (edit) deliberately does **not** touch the
class, and nothing on the edit form says so. A teacher who opens "កែព័ត៌មានសិស្ស" looking to move
a pupil finds fields for everything *except* the class, with no pointer to where that is done.

---

## 6. Journey 2 — Class → Subjects → Scores → Results

**The strongest journey in the product.** `ScoreWorkspaceHeader` states class · year · subject ·
period on five screens, the tab strip makes enter/total/collect/ranking/analysis feel like one
workspace, a tab carries the period only where the destination declares it reads one, and
`/score/subjects` links directly into `/score/enter`.

**F3 · Saving marks ends the journey.** *(P2)*

`ScoreEnterClient` reports a save well — a toast plus an `aria-live` region (`:394`, `:468`,
`:1252`). What it does not do is say what comes next. There is no post-save CTA toward
`/score/total` or `/ranking`; the tab strip is present, so the path exists, but the screen does
not direct a teacher along it. For the daily task this is fine. For the end-of-month task —
"I have finished marking, now what?" — the teacher is left to know the answer already.

**F4 · `ការប្រមូលពិន្ទុ` is filed under results, but answers an entry question.** *(P2)*

`/score/collect` is in the `លទ្ធផល` module and in the workspace strip between `តារាងសរុប` and
`ចំណាត់ថ្នាក់`. It answers *"which subjects still need marks, and who is responsible"* — which is
work remaining, not a result learned. A teacher looking for outstanding work would sensibly look
under `ពិន្ទុ`.

Recorded as a boundary question, not a defect: it is genuinely on the line, and moving it would
be a navigation change this phase must not make.

---

## 7. Journey 3 — Results → Print Center → Document ★

**This is the weakest journey, and it is the audit's headline.**

**F5 · There is no join from any results screen to the Print Center.** *(P1 — highest)*

Only four screens link to `/print-center`: `dashboard/page.tsx`, `classroom/ClassroomClient.tsx`,
`students/[id]/page.tsx` and the dashboard's `FeatureGrid`. **Not one of `/ranking`,
`/honor-roll`, `/score/total`, `/score-analyse` or `/certificate` references it** (verified: zero
matches across those five directories).

So the moment a teacher has the thing they wanted — a ranked class — the product offers no route
to the printed version of it. They must leave through the sidebar and already know that ranking
sheets live under `របាយការណ៍ → មជ្ឈមណ្ឌលរបាយការណ៍`.

**F6 · …and meanwhile `/ranking` prints its own sheet.** *(P1)*

`RankingClient.tsx:427` is an Excel export and `:430` is `window.print()`. The catalogue also
holds `ranking_monthly`, `ranking_semester` and `ranking_annual` with engine resolvers
(`report-types.ts:23-25`). **Two production paths for one document, from two places that do not
reference each other.**

Their *numbers* agree — both narrow identically, which is what Phase 1 fixed — so this is not a
correctness defect. It is a discoverability defect with a correctness-shaped history, and the
honest framing is: the teacher cannot tell which one they are supposed to use, or that the other
exists.

**F7 · `/honor-roll` is a hard dead end.** *(P1)*

It carries **no** `ScoreWorkspaceHeader`, no `useClassHref`, and no `href` of any kind (zero
matches for all three). It is the only member of the `លទ្ធផល` module without the workspace tab
strip — `/ranking`, `/score/collect` and `/score-analyse` all have it. A teacher who arrives
there can only leave through the sidebar or the browser's back button.

**F8 · The Print Center states the class through its own private component.** *(P2)*

`PrintCenterClient.tsx:193` renders a locally-defined `ContextBar` (`:354`) taking
`className` / `gradeNumber` / `academicYear` / `scoped` as props, rather than the shared
`ClassContextBar`. The class *is* stated — this is not missing context — but it is a third
implementation (§14).

---

## 8. Journey 4 — Attendance

**F9 · The class card's `វត្តមាន` sends the teacher where they cannot mark.** *(P1)*

`ClassroomClient.tsx:208`:

```ts
{ label: 'វត្តមាន', href: '/attendance/monthly', icon: CalendarCheck },
```

`/attendance/monthly` is **read-only**: `attendance/monthly/actions.ts` exports exactly
`getMonthlyAttendance` and `getTeacherSettings` — no write of any kind. The register is
`/attendance/layout`.

This is the same defect Phase 8 corrected in the navigation, where `វត្តមាន`'s only visible entry
was labelled *"check in by desk layout"* and was renamed to name the job. The per-class card was
not corrected. A teacher who taps `វត្តមាន` on their own class card lands on a printable sheet.

**F10 · The register does not link to its own review screens.** *(P2)*

`/attendance/monthly` and `/attendance/yearly` cross-link each other. `/attendance/layout` links
to neither. The marking screen and the reviewing screens are one system to the teacher and two
islands in the code.

**What is strong here, and should not be rebuilt:** the completion strip now sits above the view
switcher so all three views answer *"have I finished?"*; the vocabulary is declared once in
`lib/attendance/status.ts`; `ច្បាប់` is an absence everywhere, including in the parent portal;
the list view is the default and the seating plan is one tap away rather than the mental model.
Nothing in this audit suggests reintroducing "late" semantics — the product does not record
lateness and should not pretend to.

---

## 9. Journey 5 — Dashboard

**Verdict: A — a useful working home, not a feature launcher.**

Read live, the dashboard states: active class · `សិស្សសរុប ៣៥ · ស្រី ១៧` · `វត្តមានថ្ងៃនេះ —
មិនទាន់បានចុះវត្តមាន` · `មធ្យមភាគ កញ្ញា ៨.៩៣ និទ្ទេស B` · marking progress
`១៨% · ក្នុងចំណោម ៣ មុខវិជ្ជា` · an attention list · five quick actions · a recent-activity feed.

That answers every question §10 asks, in order. The `មុខងារទាំងអស់` grid is derived from
`NAV_SECTIONS` and sits **below** the day's work, so it is an overview rather than a competing
menu.

**F11 · The attendance StatCard points at the sheet, not the register.** *(P2)*

`dashboard/page.tsx:211` links the `វត្តមានថ្ងៃនេះ` card to `/attendance/monthly`. The tile says
*"today"* and *"not yet recorded"*; following it lands on a monthly document rather than on
today's register. The quick action immediately below it goes to `/attendance/layout` correctly —
so the same screen offers both, and the one attached to the number is the wrong one. Same family
as F9.

---

## 10. Class context audit

`ClassContextBar` is used on **26 routes** and is a good component: presentation only, reads
`useActiveClass()`, gates on `isClassScopedPath(pathname)` — *the same list* `withClassParam`
uses, so there is no second array — and renders an honest `ថ្នាក់ទី —` when the grade is unknown.

Every declared class-scoped route states its class through one of three mechanisms. **No route
was found that resolves a class and fails to say which.**

**F12 · Three implementations of one strip.** *(P2)*

| Where | Source of truth | Renders |
| --- | --- | --- |
| `components/shell/ClassContextBar.tsx` (26 routes) | `useActiveClass()` hook | `class · ថ្នាក់ទី N · ឆ្នាំសិក្សា YYYY` |
| `PrintCenterClient.tsx:354` — private `ContextBar` | server props | same three facts, own markup |
| `class-admin/page.tsx:79` — inline `<section aria-label="បរិបទបច្ចុប្បន្ន">` | server props | same three facts, own markup |

They differ in more than markup: the shared bar prefers the grade row's own `gradeName` over a
formatted number, and the two private ones only receive `gradeNumber`. A class whose grade row is
named unusually reads differently on `/print-center` than on `/student-list`.

No second class *state* exists — this is duplication of presentation only, which is the milder
version of the problem and the reason it is P2.

---

## 11. Navigation audit

Current structure: **12 modules, 4 sections** (`ការងារប្រចាំថ្ងៃ`, `ការវាយតម្លៃ`,
`ថ្នាក់ និងឯកសារ`, `ប្រព័ន្ធ`).

**What is right:** `ពិន្ទុ` opens on entry; `លទ្ធផល` exists as a module of its own; every module
front door is where the work is done; no URL was renamed to suit the grouping; hidden detail
routes are still declared so breadcrumbs resolve.

**F13 · Documents live in two modules, in two different sections.** *(P1)*

`របាយការណ៍` (section 2) holds the Print Center, the parent report, the annual family and the
record book. `ឯកសារ` (section 3) holds `រដ្ឋបាលថ្នាក់រៀន`, **`ទាញយកវិញ្ញាបនបត្រ`** and
`បំបែកសន្លឹក Poster`.

Certificates are therefore reachable two ways with different affordances — as an `ឯកសារ` menu item
going to `/certificate`, and as a Print Center row that generates a Word file. A teacher asking
"where are my documents?" has two correct answers.

**F14 · Annual results are filed under reports, not results.** *(P1)*

`លទ្ធផលប្រចាំឆ្នាំ` (`/yearly-report`) and its three sub-sheets sit hidden under `របាយការណ៍`,
while `លទ្ធផល` — the module whose name is literally "results" — holds only monthly and semester
surfaces. A teacher looking for the year's outcome looks under `លទ្ធផល` and does not find it.

**F15 · A ministry document is filed under score entry.** *(P2)*

`តារាងពិន្ទុ (ទម្រង់ក្រសួង)` (`/score/print`) is hidden under `ពិន្ទុ`. It produces paper.

**F16 · The four orphan utilities still hold a top-level module.** *(P2 — carried, still open)*

`បរិក្ខារថ្នាក់` holds `/cleaning-schedule`, `/inventory`, `/decorations`, and `/poster-splitter`
sits next door under `ឯកសារ`. Phase 0 §10 Q3 assumed these would be demoted "in Phase 10, keeping
every URL"; Phase 10 became the design-system phase and this was never done. Four housekeeping
tools occupy navigation weight equal to `ពិន្ទុ`, and no workflow reaches any of them.

**F17 · Two analysis entries, one character apart.** *(P2 — carried, still open)*

`វិភាគទិន្នន័យ` (`/score-analyse`) is visible; `វិភាគតាមមុខវិជ្ជា` (`/score-analysis/subject`) is
hidden. Phase 0 P1-8 said *"whatever else changes, these two names cannot both survive"*. Both
survive. They are now framed identically, which makes folding the second into the first a smaller
change than it was — but it has not happened.

---

## 12. Student information architecture

`/student-list` → `/enrollment` → `/students/[id]` → `/student-tracking` → documents **does**
read as one system: the class travels, the pupil page aggregates without duplicating, every
document route is catalogued in the Print Center rather than forming a competing menu, and
`ឯកសារសិស្ស` in the `សិស្ស` module defers to `/print-center?category=student` rather than listing
four print screens.

The two breaks are F1 (the invisible new pupil) and F2 (edit vs transfer).

**F18 · Two "books" with confusable names.** *(P3)*

`សៀវភៅតាមដាន` (`/student-tracking`, under `សិស្ស`) and `សៀវភៅសិក្ខាគារិក` (`/record-book`, under
`របាយការណ៍`) are both per-pupil tracking books, named similarly, filed in different modules.
`សិក្ខាគារិក` also reads as *trainee/seminar participant*, which is not what a primary pupil is.

---

## 13. Score information architecture

Mapped against §14's four purposes:

| Purpose | Screens | Visible to the teacher? |
| --- | --- | --- |
| **A · entering** | `/score/enter`, `/homework/enter` | ✅ `ពិន្ទុ` opens here |
| **B · configuring** | `/score/subjects` (`/score/template` redirects) | ✅ one surface, linked from entry and from the class card |
| **C · reviewing** | `/score/total`, `/ranking`, `/score-analyse`, `/honor-roll`, `/score/collect` | ⚠️ `/score/collect` is entry-side work (F4); `/honor-roll` is outside the tab strip (F7) |
| **D · producing** | `/print-center` + catalogue, `/score/print` | ⚠️ `/score/print` filed under A (F15); no arrow from C into D (F5) |

The A/B boundary is clear and well communicated. The C/D boundary is where the model breaks.

---

## 14. Results UX

The three results screens agree with each other and with the documents they derive from —
`buildPeriodResults` is shared, `placing()` states the no-average-no-rank rule once, honour uses
`evaluateHonor` on screen and on paper and prints its criterion.

What a teacher does **not** get is the sentence *"results are what I learn; reports are what I
produce"*. Nothing on a results screen mentions documents (F5), one results screen cannot be left
at all (F7), and one results screen prints its own paper (F6).

---

## 15. Print Center UX

Structurally mature and should not be rebuilt: six family panels, a wrapping category nav, a
search across every family, honest availability badges (`engine_ready` / `needs_template` /
`legacy_only` / `not_implemented`) derived by `reportAvailability()` rather than recomputed per
card, and a generation dialog carrying class · year · period, a template picker, a **rendered
sheet preview**, certificate pupil selection pre-set to the passing cohort, and a
state-after-generation with the file available again.

Its UX problems are all *inbound*: it is hard to arrive at from the place you want it (F5), and
it states its class differently from everywhere else (F8).

---

## 16. Mobile

No new horizontal-overflow defect was found. The audited fixed-width blocks are guarded:
`min-w-[600px]` in the seating plan sits behind `hidden lg:flex`, and every fixed-millimetre A4
sheet sits in a `.preview-scroll` (pinned by `verify-page-frame.mts` R6).

**F19 · The dashboard's page-2 problem is a mobile problem first.** *(P2)*

F1 is worse on a phone: 20 rows per page plus a header means the new pupil is several screens and
one pagination control away, on a device where the teacher has just typed forty fields.

**F20 · Three of five workspace tab strips are desktop-shaped.** *(P3)*

The attendance view switcher hides two of three options below `lg` — correct, they do not work on
a phone. The score workspace strip renders all five tabs at every width; on a 360px screen five
Khmer labels wrap. Not broken, but it is the one strip that has not been given a small-screen
decision.

---

## 17. Accessibility

Better than expected, and better than automated linting alone would show:

- **Zero icon-only `<button>`s without an accessible name** across all 45 routes (audited by
  matching `<button>` elements whose only child is a self-closing icon component).
- Tab strips: **ten of eleven** carry `role="tab"` + `aria-selected`; the eleventh was fixed in
  Phase 10 and `verify-design-system.mts` S4 keeps it.
- `/score/enter` remains the model: `aria-live` status region, labelled grid, keyboard-first
  entry, 44px targets.
- The register's completion strip is a `role="status"` with an `aria-label` stating the count.

**F21 · Status is still carried by colour in the results tables.** *(P2)*

`/ranking` renders its pass/fail split by tone; the printed sheet carries the letter grade, so the
information exists on paper but the screen leans on colour. Not verified as a full audit of every
table — flagged as the one place the pattern recurs.

**F22 · The `aria-live` pattern is not applied outside score entry.** *(P3)*

Saving attendance, saving a pupil and generating a report all report through `react-hot-toast`,
which is not announced. `/score/enter` proves the team knows the pattern; it is used once.

---

## 18. Consistency

All 43 render routes use `PageContainer` / `PageHeader`, pinned by `verify-page-frame.mts` R1–R6.
The frame *is* one system. Three inconsistencies survive inside it:

**F23 · Empty states are phrased four ways.** *(P3)*
`មិនទាន់មានសិស្សក្នុងបញ្ជី` · `មិនទាន់មានសិស្ស` · `មិនទាន់មានសិស្សក្នុងថ្នាក់នេះ` ·
`រកមិនឃើញសិស្ស` — three for "no pupils" and one for "no search results", across
`attendance/layout`, `attendance/yearly` and `homework/enter`.

**F24 · Three page titles disagree with their own navigation labels.** *(P3)*

| Route | Nav says | Page says |
| --- | --- | --- |
| `/attendance/layout` | `ចុះវត្តមានប្រចាំថ្ងៃ` | `ចុះវត្តមានសិស្ស` |
| `/homework/send` | `បញ្ជូនទៅអាណាព្យាបាល` | `ផ្ញើកិច្ចការទៅអាណាព្យាបាល` |
| `/parent-report` | `របាយការណ៍មាតាបិតា` | `របាយការណ៍ជូនមាតាបិតា` |

**F25 · One raw colour outside the token system on a primary control.** *(P3)*
`RankingClient.tsx:427` — `bg-emerald-600 text-white` on the Excel export button. Everything
around it uses semantic tokens.

---

## 19. Terminology

| Current | Recommended | Reason | Routes |
| --- | --- | --- | --- |
| `បោះពុម្ភ` | `បោះពុម្ព` | **Misspelling.** 3 occurrences against 65 correct ones | `/honor-roll` ×2, `/ranking` ×1 |
| `សៀវភៅសិក្ខាគារិក` | `សៀវភៅតាមដានលទ្ធផល` | `សិក្ខាគារិក` = trainee/seminar participant, not a primary pupil; and it is confusable with `សៀវភៅតាមដាន` | `/record-book` |
| `បញ្ជូន` / `ផ្ញើ` | pick one | Two verbs for "send" between the nav entry and the page it opens | `/homework/send` |
| `ចុះវត្តមានសិស្ស` / `ចុះវត្តមានប្រចាំថ្ងៃ` | `ចុះវត្តមានប្រចាំថ្ងៃ` | The nav was corrected in Phase 8; the page title was not | `/attendance/layout` |
| `ការប្រមូលពិន្ទុ` | `វឌ្ឍនភាពបញ្ចូលពិន្ទុ` | "Collection" reads as gathering marks from teachers; the screen shows *progress* | `/score/collect` |
| `វិភាគទិន្នន័យ` | `វិភាគលទ្ធផល` | "Data analysis" is developer-oriented; the screen analyses results | `/score-analyse` |
| `Back to 2D` | Khmer | Untranslated English string | `/attendance/layout` (`ThreeClassroom.tsx:675`) |
| `(Zoom In)` / `(Zoom Out)` | Khmer only | English parenthetical beside a Khmer label | `/id-student` |
| `ផ្ទាំងវិភាគសាលា (នាយក)` | — | Now a redirect; the label describes a screen that no longer renders | nav only |

---

## 20. UX gap matrix

| Workflow | Current state | UX quality | Main issue | Sev | Evidence |
| --- | --- | --- | --- | --- | --- |
| Class | Card grid, 6 scoped tools | **Strong** | Attendance tool is read-only | P1 | `ClassroomClient.tsx:208` |
| Students | Roster + paging + search | **Strong** | New pupil lands off-screen | P1 | `StudentTableClient.tsx:47,136` |
| Enrollment | Full form, class named, draft | **Strong** | Edit is silent about class | P2 | `enrollment/page.tsx:303` |
| Subjects | One surface, two controls | **Strong** | — | — | `/score/subjects` |
| Attendance | 3 views, shared vocabulary | **Strong** | Entry ↮ review disconnected | P2 | `attendance/monthly/actions.ts` |
| Score entry | Grid, live region, undo | **Strong** | No next step after save | P2 | `ScoreEnterClient.tsx:468` |
| Score total | Results table + matrix | **Strong** | — | — | tab strip |
| Results | 3 screens, shared builder | **Good** | No arrow to documents | **P1** | zero `print-center` refs |
| Ranking | Correct, tabbed | **Good** | Prints its own sheet | P1 | `RankingClient.tsx:427,430` |
| Analysis | Two routes, one concept | **Fair** | `/score-analyse` vs `/score-analysis/subject` | P2 | nav |
| Homework | Enter/review/send | **Strong** | — | — | mode toggle |
| Print Center | Families, preview, dialog | **Strong** | Hard to arrive at; own context bar | P1/P2 | `PrintCenterClient.tsx:354` |
| Honor | Criterion-driven, printed | **Fair** | Hard dead end | **P1** | no tabs, no links |
| Certificate | Selection + status + generate | **Good** | Two front doors | P1 | `ឯកសារ` module |
| Annual reports | Engine-backed, 7 sheets | **Good** | Filed away from `លទ្ធផល` | P1 | nav |
| Record book | Class template, real absences | **Good** | Name is wrong for the audience | P3 | `/record-book` |
| Admin | Gated, audited, RLS-proved | **Good** | No profile/permissions leg | P2 | `app/admin/teachers/` |

---

## 21. Findings by severity

**P0 — none.** Stated deliberately: the correctness family that Phases 1–11 existed to close is
closed, and the most plausible surviving candidate (two ranking productions) was tested and
agrees.

**P1 — 7:** F1 (new pupil off-screen), F5 (no results→documents join), F6 (two ranking print
paths), F7 (honour roll dead end), F9 (class card's attendance is read-only), F13 (two document
modules), F14 (annual results filed away from results).

**P2 — 9:** F2, F3, F4, F8, F10, F11, F12, F16, F17, F19, F21 *(F16/F17 carried from Phase 0 and
still open)*.

**P3 — 7:** F18, F20, F22, F23, F24, F25, plus the terminology table.

---

## 22. Top 5 priorities

| # | Priority | Why it matters | Workflows | Sev | Complexity | Depends on | Needs |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | **Join results to documents** | The teacher's whole reason for ranking a class is to hand something out, and the product does not connect the two. Fixing it also resolves the "which print button?" ambiguity (F6) and the honour dead end (F7). | Results, Ranking, Honor, Certificate, Print Center | P1 | Medium | none | Code + design |
| 2 | **Fix the two attendance mis-links** | A class card and a dashboard tile both send a teacher to a read-only sheet when they meant to mark the register. Two lines, high daily cost. | Class, Attendance, Dashboard | P1 | **Low** | none | Code |
| 3 | **Make the new pupil findable** | The most common creative act in the product ends with the result invisible. | Students, Enrollment | P1 | Low–Medium | none | Code + design |
| 4 | **Settle the document IA** | Certificates have two front doors, annual results are filed under reports, a ministry score sheet is filed under entry, and four utilities hold a top-level module. | Navigation, Reports, Certificate, Annual | P1 | Medium | none | Design first |
| 5 | **One context bar, one vocabulary** | Three implementations of the class strip, four phrasings of "no pupils", three page titles disagreeing with their nav labels, and one Khmer misspelling on a print button. | All | P2/P3 | Low | none | Code |

---

## 23. Recommended Phase 13

> ## **Phase 13 — Results → Documents Flow**

**One phase, not several.** It is priority 1, and it absorbs priorities 2 and 3 only if they are
explicitly scoped in; the recommendation is to keep it to the results/documents seam and take the
two mis-links (priority 2) as a two-line rider because they are trivially safe.

**Scope:**

1. A path from every results screen to the document it produces — the missing arrow at join 11.
2. `/honor-roll` joins the workspace tab strip like its three siblings.
3. Resolve the two ranking print paths: decide which one a teacher is meant to use, and make the
   other say so.
4. The Print Center adopts the shared `ClassContextBar`.
5. Rider: `ClassroomClient.tsx:208` and `dashboard/page.tsx:211` point at `/attendance/layout`.

**Why not the alternatives.** *Dashboard* is already a working home and needs nothing. *Score
workspace* is the most mature area in the product and rebuilding it would violate rule 42.
*Student management* is strong apart from one findable-pupil problem, which is a small piece of
priority 3 rather than a phase. *Navigation* (priority 4) needs a product decision about where
documents live before any code moves, and per brief §43 navigation comes after workflow.

---

## 24. Explicitly deferred — do not rebuild these

Strong, and outside Phase 13:

- **The score workspace** (`/score/enter`, `/score/total`, `/score/subjects`) — one vocabulary,
  one scope, one arithmetic. Audit it, do not redesign it.
- **The reporting engine and the Print Center's structure** — families, availability verdicts,
  the preview, the certificate selection flow.
- **The attendance vocabulary** (`lib/attendance/status.ts`) and the three-view register. In
  particular: **do not reintroduce "late" semantics** — the product does not record lateness.
- **The page frame, the paper contract and the class-context chain** — all three are pinned by
  harnesses and all three are load-bearing.
- **The RBAC and RLS boundary** — 64/64 behavioural checks.

Carried forward, unchanged:

- The two `*-live` harness failures and the fixture behind them.
- Migration 00033 not applied to every environment.
- Four status colours used as labels below 4.5:1 (`phase10-implementation.md` §4).
- The admin console's missing dark-mode pass, teacher profile and permissions legs.

---

## 25. Reference product

`http://kroudigital.com/` was **not consulted**. This session has no network access to it, and
per §21 an unavailable reference is to be stated rather than invented. No observation in this
document derives from it; every finding above is evidenced from this repository.

---

*Phase 12 complete. No application code, schema, migration, configuration, route, navigation
entry, style or string was changed. `docs/phase12-ux-audit.md` is the only file added.*
