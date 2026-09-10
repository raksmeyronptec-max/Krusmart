# Phase 0 — UX/System Audit and Target Architecture

**Scope:** read-only. No application code, schema, migration or configuration was changed.
**Method:** static analysis of the working tree, an in-app link-graph computation, and a full
run of the project's own quality gates.
**Baseline:** branch `main`, commit `439cfd0` + the uncommitted `00031_teacher_class_creation`
work. **Date:** 2026-09-10.

> This document supersedes [AUDIT.md](../AUDIT.md) as the *current* read of the product.
> AUDIT.md remains the record of why the Enterprise-V2 migration was shaped the way it was;
> most of its findings are closed and it must not be read as a defect list.

---

## 0. Baseline health

Run before any judgement was formed, so that everything below is measured against a green tree:

| Gate | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` (`tsc --noEmit`) | clean |
| `npm run verify` (31 harnesses, 27 offline) | **27/27 passed in 6.3s** |

**Nothing in this audit is a regression report.** The tree is healthy. Every finding below is
a coherence, context or consistency gap — not a broken build, and with two exceptions
(§3, P0-1 and P0-2) not a correctness defect either.

**Surface measured:** 83 route files — 45 under `app/(main)/` (the teacher app), 11 under
`app/admin/`, 11 under `app/parent/`, the rest login/onboarding/auth. 31 migrations,
31 verification harnesses, 27 catalogued reports, 17 built document templates.

---

## 1. The headline finding: KruSmart is two products wearing one shell

The brief assumes a product that "looks outdated" and whose "score UX is difficult and overly
technical". The code does not support that reading. What the code shows is a **partially
completed modernisation** that stopped cleanly along a line nobody drew on purpose.

Sixteen of the 45 teacher routes have been rebuilt against the current architecture — they sit
inside `PageContainer`/`PageHeader`, use semantic tokens, name their class, carry `?class=`
onward, and read canonical domain logic. Twenty-nine have not. The split is exact and
mechanically verifiable:

```
PageContainer / PageHeader adopters (16 of 45)
  dashboard · classroom · student-list · students/[id] · enrollment
  attendance/layout · attendance/monthly · score/enter · score/total
  score/collect · score/subjects · homework/enter · homework/send
  notifications · print-center · class-admin

Everything else (29 of 45) hand-rolls its own page frame.
```

Those 29 screens use **six different content widths** — `max-w-4xl`, `max-w-5xl`, `max-w-6xl`,
`max-w-7xl`, `max-w-[1200px]`, and the shell's own `max-w-[1600px]` — each with its own `<h1>`
treatment, its own vertical rhythm, and in eleven cases no mention of which class it is showing.

**This, not the score screens, is why the product "feels like a collection of pages".** A
teacher moving from `/score/total` to `/ranking` crosses from a 1600px tokenised surface with a
class·year·subject·period header into a 6xl surface with hard-coded `bg-white` and no context
line at all. Both screens are correct. The seam between them is the defect.

### 1.1 The score workspace is the app's strongest screen, not its weakest

The brief ranks Phase 5 as ⭐ HIGHEST PRIORITY. The evidence contradicts this, and it matters
because acting on the brief's order would spend the most effort on the least broken area.

`/score/enter` (1,284 lines) already does all of the following, verified in source:

- subject columns resolved from `score_template_subjects`, never hard-coded
  (`useScoreTemplate`, three-layer system→school→class merge)
- debounced autosave at 1,200 ms with explicit `pendingCells` / `savedCells` sets, plus a
  manual-save path and an autosave toggle
- period lock honoured (`periodLocked` from the class's own `score_calendar_periods`)
- `aria-live` region announcing background writes
- a **desktop grid** (`hidden lg:block`) with sticky first column and sticky header inside
  `FullscreenGrid`'s `overflow-auto`, and a **separate mobile card list** — because, as its own
  comment says, "a table dragged sideways puts the column being typed under the keyboard"
- academic year derived from today's date rather than a literal, month defaulted through the
  class's own calendar
- `scopeClassId` threaded into every fetch and every callback dependency array

`/score/total` matches it: `FullscreenGrid`, `hidden lg:block` + `lg:hidden`, canonical
`deriveSemesterAverages`, results-table-first with the 29-column matrix behind a toggle.

`components/score/ScoreWorkspaceHeader.tsx` already renders class · year · subject · period plus
the workspace tabs, and `lib/scores/workspace.ts` already declares the period ladder as one
vocabulary.

**Recommendation:** demote the score workspace from first to fourth. Its remaining gaps (§3,
P1-4) are real but small.

---

## 2. Route inventory

Classification: **A** core workflow · **B** supporting workflow · **C** document/report ·
**D** admin · **E** utility · **F** legacy-compatibility.

`Frame` = inside the shared `PageContainer`/`PageHeader` contract.
`Names class` = the screen tells the teacher which class it is showing.
`Inbound` = links from feature code, excluding the nav file and the report catalogue.

### A — Core workflow (10)

| Route | Frame | Names class | Inbound | Primary action → next | Notes |
| --- | :-: | :-: | :-: | --- | --- |
| `/dashboard` | ✅ | ✅ | 24 | triage → any module | Derived `FeatureGrid`, real stats, canonical `subjectProgress`, audit feed |
| `/classroom` | ✅ | ✅ | 6 | pick/create class → per-class tools | Absorbed `/classroom/classes`; grade offer from `buildGradeOffer` |
| `/student-list` | ✅ | ✅ | 10 | review roster → pupil / enrolment | Legacy-recovery banner for stranded rosters |
| `/students/[id]` | ✅ | ✅ | — | read pupil whole → owning screen | Links carry the **pupil's** class, not the ambient one |
| `/enrollment` | ✅ | ⚠️ partial | 9 | add pupil → `/student-list` | Redirects to roster on save, carries `?class=` |
| `/attendance/layout` | ✅ | ✅ | 4 | mark register → sheet | Defaults to `list`; 2D/3D are `hidden lg:flex` |
| `/score/enter` | ✅ | ✅ | 17 | type marks → total | Best screen in the app (§1.1) |
| `/score/total` | ✅ | ✅ | 12 | read results → ranking/print | Canonical annual, source provenance shown |
| `/score/subjects` | ✅ | ✅ | 7 | configure curriculum → enter | Single configuration surface |
| `/homework/enter` | ✅ | ✅ | 4 | type homework → send | Reuses `getScores`/`saveScores` |

### B — Supporting workflow (10)

| Route | Frame | Names class | Inbound | Problem |
| --- | :-: | :-: | :-: | --- |
| `/score/collect` | ✅ | ✅ | 6 | Not a workspace tab |
| `/ranking` | ❌ | ✅ hdr | 5 | **Unnarrowed template** (P0-1); `bg-white`; A4 block in screen flow |
| `/score-analyse` | ❌ | ✅ | 3 | Own `max-w-7xl` chrome; name collides with the route below |
| `/score-analysis/subject` | ❌ | ✅ | 1 | Near-identical URL to the above |
| `/honor-roll` | ❌ | ✅ | 1 | Legacy top-5 disagrees with the `honor` report, by record |
| `/attendance/monthly` | ✅ | ✅ | 5 | — |
| `/attendance/yearly` | ❌ | ❌ | 2 | Own frame |
| `/homework/send` | ✅ | ❌ | 2 | **Not class-scoped at all** (P0-2) |
| `/notifications` | ✅ | ✅ | 1 | — |
| `/print-center` | ✅ | ✅ | 3 | The one document hub; mature |

### C — Document / report (15)

| Route | Frame | Names class | Catalogued | Inbound |
| --- | :-: | :-: | :-: | :-: |
| `/score/print` | ❌ | ✅ | ✅ | 2 |
| `/certificate` | ❌ | ✅ | ✅ | 2 |
| `/record-book` | ❌ | ❌ | ✅ | 0 |
| `/student-tracking` | ❌ | ❌ | ✅ | 0 |
| `/parent-report` | ❌ | ❌ | ✅ | 2 |
| `/print-list` | ❌ | ❌ | ✅ | 1 |
| `/print-student-age` | ❌ | ❌ | ✅ | 0 |
| `/print-student-codes` | ❌ | ❌ | ✅ | 1 |
| `/id-student` | ❌ | ❌ | ✅ | 2 |
| `/class-admin` (+`/[book]`) | ✅ | ✅ | ✅ | 0 |
| `/yearly-report` (+ 3 sheets) | ❌ | ❌ | ✅ | 0 / 1 each |

Every one of these resolves the class **correctly** server-side — `classIdFromSearchParams` →
`resolveServerScope` → `fetchStudentsForScope` is present in all of them. The failure is
purely one of display and of onward links.

### D — Admin (1)

| Route | State |
| --- | --- |
| `/administration` | Role-gated correctly, but renders `MOCK_SCHOOL_STATS` / `MOCK_TEACHERS` / `MOCK_TEACHER_DETAIL`. Offered in the nav to any admin. **(P0-3)** |

The real console at `app/admin/` is not mock: `queries.ts` supplies `getSchoolStats`,
`getTeachers`, `getClasses`, `getGradingSchemes`, `getAuditLogs` against Supabase.
`/admin/teacher-attendance` is the one remaining mock page there.

### E — Utility (7)

`/cleaning-schedule` · `/inventory` · `/decorations` · `/poster-splitter` · `/profile` ·
`/team` · `/tutorial`.

Four of these (`cleaning-schedule`, `inventory`, `decorations`, `poster-splitter`) have
**zero inbound links from feature code** — reachable only by opening the nav. They occupy
two of the ten sidebar modules. That is defensible for genuine standalone tools, but it means
20 % of the rail's top level is spent on things no workflow ever leads to.

### F — Legacy compatibility (2)

`/classroom/classes` → `/classroom` and `/score/template` → `/score/subjects`. Both declared
`hidden: true` so the breadcrumb resolves mid-redirect. Correct as-is; do not remove.

---

## 3. Findings, by severity

### P0 — one question, two answers

**P0-1 · `/ranking` averages over a different subject set than `/score/total` and the printed
ranking sheets.**

`RankingClient` destructures `useScoreTemplate('monthly')` as `{ rows, context, scheme,
levelCurriculum }` and feeds raw `templateRows` to `buildPeriodResults`. `ScoreTotalClient`
passes `classSubjects`, which is `applySelection(subjects, selection)` — the class's template
**narrowed to the subjects it actually teaches**. The engine's `ranking_monthly` /
`ranking_semester` / `ranking_annual` resolvers narrow too.

The arithmetic is shared and correct (`buildPeriodResults`, `assignRanks`); the *inputs* are
not. For any class that has configured a selection and holds a mark under a de-selected
subject, `/ranking` and the ranking report it links to print different averages and can print
different orders. CLAUDE.md records this as "a pre-existing divergence, not introduced here" —
it is exactly the P0 the brief names in §24. **Fix: pass `classSubjects`.** One-line change,
plus a harness assertion.

**P0-2 · `/homework/send` has no class dimension.**

`homework_assignments` is queried `.eq('teacher_id', user.id)` and nothing else; `/homework/send`
appears in **neither** `CLASS_SCOPED_ROUTES` nor any server scope resolution. A teacher holding
two classes sees one merged list of assignments with no way to say which class each belongs to,
and no way to filter. Not a security hole (they are the teacher's own rows) but a direct
violation of the product model in §2 of the brief, and the only remaining module that ignores
active class entirely.

**P0-3 · `/administration` ships mock numbers inside the navigation.**

`AdministrationClient` renders `MOCK_SCHOOL_STATS`, `MOCK_TEACHERS`, `MOCK_TEACHER_DETAIL`. The
page's role gate is correct and its comment is honest about the data, but it is declared in
`NAV_SECTIONS` under របាយការណ៍ with `permission: 'school_settings:view'`, so a principal is
offered a school-analytics dashboard that invents its figures. Either wire it to
`app/admin/queries.ts` (which already computes exactly these aggregates) or remove it from the
nav until it is real.

### P1 — the §5 questions a page must answer

**P1-4 · No page-frame contract for 29 of 45 routes.** Six content widths, hand-rolled headings,
inconsistent vertical rhythm. `PageHeader` exists and is good; it is simply not adopted.

**P1-5 · The global class context cannot express the target.** The brief's §9 wants:

```
ថ្នាក់ទី ៥ក   ·   ថ្នាក់ទី ៥   ·   ឆ្នាំសិក្សា ២០២៦–២០២៧
```

`TeacherAssignmentDetail` carries `class_name`, `subject_name`, `academic_year_name`,
`school_id`, `school_name` — **and no grade**. The grade is resolvable server-side
(`resolveClassTemplateContext` reads `grades.sort_order`) but never reaches the client context.
Separately, `ClassContextSwitcher` returns `null` for a legacy account, so a pre-V2 teacher sees
no context strip anywhere in the product.

**P1-6 · Eleven screens show the right class and never name it.** `record-book`,
`student-tracking`, `parent-report`, `print-list`, `id-student`, `print-student-age`,
`print-student-codes`, `attendance/yearly`, `yearly-report` and its three sheets call neither
`useActiveClass` nor `useClassHref`. Their data is correctly scoped; their outbound links drop
`?class=`, so the chain the architecture is built to protect breaks *at the leaves*.

**P1-7 · The score workspace covers 4 of its 7 screens.** `SCORE_WORKSPACE_TABS` lists
`enter · total · ranking · analysis`. Outside it: `/score/collect` (the completion view the
brief explicitly wants as a fifth tab), `/score/print`, `/score/subjects`,
`/score-analysis/subject`.

**P1-8 · `/score-analyse` and `/score-analysis/subject`.** Two routes one character apart,
sitting as sibling nav entries. Whatever else changes, these two names cannot both survive.

### P2 — design system, responsive, accessibility

**P2-9 · Token drift is concentrated in Tier B.** Raw `gray-*`/`slate-*` pairs and `#rrggbb`
literals per file: `parent-report` 65, `honor-roll` 24, `print-list` 22, `student-tracking` 20,
`print-student-age` 20, `attendance/monthly` 19, `administration` 16, `print-student-codes` 14,
`id-student` 14, `certificate` 11. Some of this is legitimate — a document printed on paper
declares its own ink — but the *screen chrome* around those documents is drifting, which is why
`/ranking` renders a literal `bg-white` card that does not respond to dark mode.

**P2-10 · Three screens put a fixed A4 block in screen flow.** `w-[21cm]` appears un-wrapped in
`ranking`, `parent-report` and `student-tracking`, guaranteeing horizontal scroll below ~800 px.

**P2-11 · Accessibility is excellent where it was rebuilt and absent where it was not.**
99 of 173 components use any `aria-*`; only 9 files carry an `aria-live` region. `/score/enter`
is the model (live region, labelled grid, keyboard-first, 44 px targets); the Tier-B print
screens are not.

### Positives that must be preserved (brief §42)

Verified present and load-bearing. **Do not refactor these while doing UX work:**

- server-side scope validation on **every** class-scoped route checked (10/10 sampled)
- canonical domain layers: `lib/scores/{semester,annual,aggregate,periodResults,completion,
  totals,honor,selection,template,workspace,curriculum}.ts`, `lib/grading/`, `lib/reporting/`
- 27 offline harnesses pinning them structurally, several *by design* failing when a
  template-less report is migrated
- the declared-and-verified `CLASS_SCOPED_ROUTES` list plus `verify-class-context.mts`
- `NAV_MODULES` derived from `NAV_SECTIONS`; the dashboard grid derived from both
- the print-shell contract (`data-app-chrome` / `data-app-frame`)
- legacy/V2 dual-path scoping and the role-less→`['teacher']` fallback

---

## 4. Target information architecture

The current IA is four sections / ten modules and is already well past the 7±2 problem it was
built to solve. It needs **one structural change**, not a rewrite: *results* are currently
hidden children of ពិន្ទុ, three of them marked `hidden: true`, so the brief's §6 step
"RESULTS" has no representation in navigation at all.

```
ការងារប្រចាំថ្ងៃ
  ទំព័រដើម            /dashboard
  ថ្នាក់ និងសិស្ស      /classroom          → per-class: students · subjects · enrolment
  សិស្ស               /student-list        + /enrollment · /student-tracking · ឯកសារសិស្ស
  វត្តមាន              /attendance/layout   + monthly · yearly (hidden, catalogued)

ការវាយតម្លៃ
  ពិន្ទុ                /score/enter        ← ENTRY becomes the front door, not /score/total
                        /score/total · /score/subjects
  លទ្ធផល  ★ NEW        /ranking            ← promoted out of ពិន្ទុ
                        /score/collect · /score-analyse · /honor-roll
  កិច្ចការផ្ទះ          /homework/enter     + /homework/send

របាយការណ៍ និងឯកសារ
  របាយការណ៍           /print-center        ← the single document hub, unchanged
  ឯកសារថ្នាក់          /class-admin        + /certificate · /poster-splitter
  បរិក្ខារថ្នាក់         /cleaning-schedule  + /inventory · /decorations

ប្រព័ន្ធ
  ការជូនដំណឹង          /notifications
  ការកំណត់             /profile             + /team · /tutorial
```

Four sections, eleven modules. Two deliberate moves and nothing else:

1. **លទ្ធផល becomes a module.** It is a step in the teacher's journey (§6) and today it is a
   set of `hidden: true` children. `/score/collect` moves here from ពិន្ទុ because "how much is
   left to mark" is a result, not an entry task.
2. **ពិន្ទុ's front door moves from `/score/total` to `/score/enter`.** The module's landing
   route should be where work is *done*, which is the same correction already made for
   វត្តមាន (whose front door was moved from the read-only monthly sheet to `/attendance/layout`).

**Routes do not move.** Every URL above is the one that exists today. §34 is respected in full.

### 4.1 Score workspace tabs

Five tabs, matching the brief's §13:

```
បញ្ចូលពិន្ទុ   /score/enter        carriesPeriod: true
តារាងសរុប     /score/total        carriesPeriod: true
ចំណាត់ថ្នាក់    /ranking            carriesPeriod: false
វិភាគ          /score-analyse      carriesPeriod: false
ការប្រមូលពិន្ទុ /score/collect      carriesPeriod: false   ← NEW
```

`/score/subjects` stays *out* of the tab strip and is reached from the subject picker — brief
§13: "configuration should not dominate score-entry workflow". `/score/print` stays out because
it is a document and belongs to the Print Center.

`/score-analysis/subject` becomes a **view inside `/score-analyse`**, not a sibling route. The
route survives as a redirect, exactly like `/score/template` → `/score/subjects`.

---

## 5. Target page relationships

```
                          ┌──────────────┐
                          │  ACTIVE CLASS │  TeacherContext + ?class=
                          └───────┬───────┘
        ┌─────────────────────────┼─────────────────────────┐
        │                         │                         │
   /classroom               /student-list             /score/subjects
   class hub                 roster                    curriculum
        │                    │        │                     │
        │              /enrollment  /students/[id]           │
        │                              │                     │
        └──────────────┬───────────────┴─────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
  /attendance/*   /score/enter   /homework/enter
        │              │              │
        └──────────────┼──────────────┘
                       │
              ┌────────┴────────┐
              │   /score/total   │
              └────────┬────────┘
        ┌──────────────┼──────────────┬──────────────┐
   /ranking     /score/collect   /score-analyse  /honor-roll
        └──────────────┴──────────────┴──────────────┘
                       │
                ┌──────┴──────┐
                │/print-center │   the ONLY door to document generation
                └──────┬──────┘
     score · ranking · honor · certificate · annual · record book
```

Two rules this diagram encodes, both already true in code and both easy to break:

- **Every arrow carries `?class=`** via `withClassParam` / `useClassHref`.
- **The Print Center is the only fan-out to documents.** A screen may deep-link to *its own*
  printed form; it may not grow a list of other people's reports.

---

## 6. Target shared UI patterns

### 6.1 The page-frame contract

Every `(main)` route, with no exceptions, renders:

```tsx
<PageContainer>                       {/* max-w-[1600px], data-app-frame */}
  <PageHeader title description actions />
  <ClassContextBar />                 {/* NEW — see 6.2 */}
  …content
</PageContainer>
```

`PageContainer` and `PageHeader` already exist in
[components/shell/PageContainer.tsx](../components/shell/PageContainer.tsx) and need **no
changes**. The work is adoption across the 29 hold-outs, deleting each one's private
`max-w-*`/`mx-auto`/`<h1>` as it goes. Printable screens keep their A4 block *inside* the
container; `data-app-frame`'s `display: contents` already makes the frame vanish on paper, so
adoption costs a printed sheet nothing.

### 6.2 `ClassContextBar` — one new component, and only one

```
┌─────────────────────────────────────────────────────────────┐
│  ថ្នាក់ទី ៥ក   ថ្នាក់ទី ៥   ឆ្នាំសិក្សា ២០២៦–២០២៧   [ ប្តូរថ្នាក់ ]  │
└─────────────────────────────────────────────────────────────┘
```

Four constraints, each of which prevents a known failure mode:

1. **It is not a second class selector.** It reads `useActiveClass()` and, to change class,
   opens the existing `ClassContextSwitcher`. Brief §9: one authoritative switcher.
2. **It renders only where the class is real.** Gate on `isClassScopedPath(pathname)` — the
   *same* declared list that decides whether `?class=` is appended, already verified by
   `verify-class-context.mts`. No second list.
3. **Grade requires a context change, not a migration.** Add `grade_name` / `grade_number` to
   the embedded select in [lib/context/TeacherContext.tsx](../lib/context/TeacherContext.tsx)
   (`classes(name, grade:grades(name, sort_order))`) and to `TeacherAssignmentDetail`. The
   column exists; only the client read is missing.
4. **It has a legacy state.** For a pre-V2 account it renders the roster's own description
   rather than `null`, so the strip is never simply absent.

### 6.3 State patterns to standardise

| Pattern | Canonical source | Adoption |
| --- | --- | --- |
| Empty | `ui/feedback/EmptyState` | inconsistent |
| Loading | `ui/feedback/Skeleton` | inconsistent — several screens use a bare pulsing Khmer string |
| Error | `react-hot-toast` + inline message | inconsistent |
| Table overflow | `ui/data/FullscreenGrid` | score screens only; `/ranking` et al. hand-roll |
| Paging | `ui/navigation/Pagination` | good |
| Dropdown | `Select` / `SearchableSelect` | **good — only sanctioned native selects remain** |

### 6.4 Rules carried forward from the workspace skill

Applied to this product, not restated generically: 44 px minimum touch targets (already met by
`Select`'s deliberate native-`<select>` choice on mobile); tab order matching visual order in
the score grid (already correct); `overflow-x-auto` wrappers on every data table (met in the
score screens via `FullscreenGrid`, missing in Tier B); `prefers-reduced-motion` respected;
colour never the sole indicator — relevant to score status badges, where pass/fail must carry
a Khmer word as well as a tone.

---

## 7. Revised phase order

The brief's order is preserved in *content*; only the sequence changes, and only where the
evidence in §1.1 and §3 contradicts the assumed priorities. Each phase ends with
`npm run lint && npm run typecheck && npm run verify` plus the named harness.

| # | Phase | Why here | Harness |
| --- | --- | --- | --- |
| **1** | **P0 fixes** — `/ranking` narrowing, `/homework/send` class scope, `/administration` mock | Three defects, ~a day, and one of them is a screen-vs-report disagreement the brief calls P0 | extend `verify-score-workspace` §6, `verify-class-context` |
| **2** | **Page-frame + `ClassContextBar`** (brief Phase 1 + 20) | Unblocks every later phase; converts the 29 hold-outs; answers "which class?" everywhere | new `verify-page-frame.mts` |
| **3** | **Results consolidation** (brief Phases 6–8, 14) | `/ranking`, `/score/collect`, `/score-analyse`, `/honor-roll` into one module and one tab strip; fold `/score-analysis/subject` in | `verify-score-workspace` |
| **4** | **Score workspace finish** (brief Phase 5) | The fifth tab, the subject-picker link, entry as module front door | `verify-score-workspace` |
| **5** | **Students + enrolment** (brief Phase 3) | Already close; needs an add-student affordance on the roster and class naming in `/enrollment` | `verify-students` |
| **6** | **Classroom + curriculum** (brief Phases 2, 4) | Both are recent and healthy; polish only | `verify-classroom`, `verify-class-template` |
| **7** | **Documents Tier B** (brief Phases 13–17) | The eleven un-framed print screens; token drift; A4-in-flow | `verify-reporting`, `verify-record-book`, `verify-certificate` |
| **8** | **Attendance + homework** (brief Phases 10–11) | Attendance is healthy; homework needs the class dimension from Phase 1 | `verify-scope` |
| **9** | **Dashboard** (brief Phase 9) | Already rebuilt and pinned; verify against the new IA only | `verify-dashboard` |
| **10** | **Navigation** (brief Phase 20) | Last, per brief §43 — workflow, then relationship, then component, then navigation | `verify-navigation`, `verify-ux-consistency` |
| **11** | Admin + teachers (brief Phases 18–19) | Separate mental model; unblocked by nothing above | `validate-rls` |

**Phases 2 and 7 are the whole of the "feels like one system" complaint.** They are also the
least architecturally risky work in the list — no domain logic, no queries, no migrations.

---

## 8. Acceptance scenarios

Each is a real teacher task, and each has a measurable pass condition.

| # | Scenario | Pass condition | Today |
| --- | --- | --- | --- |
| 1 | Open KruSmart | Active class, grade and year visible above the fold on **every** class-scoped screen | 16/45 |
| 2 | Add a pupil | `/student-list` → add → save → pupil visible in the same roster, same class | ✅ passes |
| 3 | January maths marks | class → ពិន្ទុ → subject → month → type → completion count visible | ✅ passes |
| 4 | Semester ranking | Results → ranking → sem 1 — and the figure **equals** the printed sheet | ❌ P0-1 |
| 5 | Annual report | Print Center → annual → generate, matching `/score/total`'s year | ✅ passes |
| 6 | Two classes | Switch class; every subsequent screen follows, including document screens | ⚠️ leaves drop `?class=` |
| 7 | Pre-V2 teacher | Never sees an empty context strip or a wizard that interrupts a working roster | ⚠️ strip is `null` |

---

## 9. What must not change

Non-negotiable for every phase below. Violating any of these is a revert, not a review comment.

1. **No route renames.** `/student-list` stays `/student-list`. Hub pages group; they do not relocate.
2. **No second class state.** No localStorage class, no page-local selector, no parallel provider.
3. **No business logic in components.** Averages, ranks, promotion, honour, coefficients and
   annual results come from `lib/scores/*` and `lib/grading/*`. A `parseFloat` in a `.tsx` that
   computes a result is the exact defect that produced three copies of the annual bug.
4. **No client-side authorization.** RLS plus `requirePermission()` remain authoritative.
   `NavModule.permission` decides what is *offered* and nothing else.
5. **No breaking of the legacy path.** Pre-V2 accounts have no `teacher_assignments` row and
   must keep working. `resolveScope` falls back to `teacher_id`; the role-less→`['teacher']`
   default stays.
6. **No second document menu.** The Print Center is the index. A screen links to its own sheet
   and no one else's.
7. **No migrations for UX work.** Everything proposed here — grade in the context, the results
   module, the fifth tab, the page frame — is achievable without touching `supabase/migrations/`.
8. **The harnesses stay green, and grow.** 27/27 today. Each phase adds or extends one.

---

## 10. Open questions for the product owner

Answers change the work; assumptions are stated so they can be overruled.

1. **`/administration`** — wire to `app/admin/queries.ts`, or drop from the nav until real?
   *Assumption: drop from the nav in Phase 1, wire in Phase 11.*
2. **`/honor-roll`** — the screen keeps top-5 while the report applies `evaluateHonor`. Converge
   the screen onto the criterion, or keep the documented divergence?
   *Assumption: converge in Phase 3; a podium is a layout, not a policy.*
3. **The four orphan utilities** (`cleaning-schedule`, `inventory`, `decorations`,
   `poster-splitter`) hold 2 of 10 rail modules and no workflow reaches them. Keep at top level,
   or demote behind ឯកសារ?
   *Assumption: demote in Phase 10, keeping every URL.*
4. **Secondary school.** The brief validates against primary only, and 15 of 15 engine reports
   are primary. Does any Phase-7 document work need to hold grade 7–12 correctness, or is
   primary-only acceptable for this program?
   *Assumption: keep the level-resolution that exists; add no secondary-specific layouts.*

---

*Phase 0 complete. No code, schema or configuration was modified. Phase 1 begins with the three
P0 fixes in §3 and does not begin until the questions in §10 are answered or the assumptions
accepted.*
