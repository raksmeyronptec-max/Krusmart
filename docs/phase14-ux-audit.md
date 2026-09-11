# Phase 14 — Teacher Workflow UX Audit

**Read-only.** No application code, schema, migration, route, navigation entry, style or string was
changed. `docs/phase14-ux-audit.md` is the only file added.

---

## 0. Baseline and scope

| | |
| --- | --- |
| Branch | `phase13-results-to-documents` |
| HEAD | `00bc202` — *Print Center adopts the shared class strip (F8)* |
| Gates at audit time | lint clean · typecheck clean · **32/32** offline harnesses · build compiles |

### Attendance is excluded, deliberately

The working tree carries **uncommitted, in-flight attendance work that is not part of this audit**:
a new pure `lib/attendance/register.ts` (roster filters, search, completion summary, mark cycling),
~590 lines reworked in `AttendanceLayoutClient.tsx`, ~453 in `RosterCheckIn.tsx`, plus 71 new lines
of `verify-attendance.mts`. It targets precisely the register workflow §9 of the brief asks about.

Auditing it would mean either reporting defects already being fixed, or reporting gaps in
unfinished code. **Attendance is therefore recorded as in-flight and re-audited when it lands.**
Nothing in this document describes those files.

Everything else in §3 of the brief was inspected: dashboard, classroom, student lifecycle,
enrollment, the score workflow, results, homework, printing, navigation, mobile, accessibility.

---

## 1. Executive summary

**The workspace is coherent. The documents it produces are not.**

Phases 0–13 did their job: one page frame, one class-context chain, one score arithmetic, one
reporting engine, one document hub, and — since Phase 13 — a real join from every result to the
document of it. A teacher can now get from a mark to a printed sheet without leaving through the
sidebar. That layer is genuinely finished and this audit recommends no changes to it.

What the audit found instead sits one level down, in **what the printed artefact actually says**,
and in **what a screen does when it has nothing to show**.

Three things, in order of severity:

1. **Printed documents name the wrong class.** Nineteen screens print `settings.class_name` in
   their letterhead — a single per-teacher value, not the class the data belongs to. Verified live:
   `/ranking` for class `៤ខ តេស្ត` prints a sheet headed **`ថ្នាក់ទី៣`**. The reporting engine gets
   this right (`report-data.ts:291-298` overrides with the class row); the screens do not. So the
   same teacher, same class, two documents, two different class names — and the wrong one is the
   one with a signature block on it.

2. **Screens with no data still produce official-looking paper.** `/ranking` on a class with zero
   pupils renders the complete ministry sheet — royal letterhead, title, totals reading `0.00%`,
   director and form-master signature lines — with print and Excel live. Seven results screens have
   no empty state at all, and the two that handle "no data" do it with a toast that vanishes.

3. **The two highest-frequency primary tasks do not fit a phone.** On a 360×732 screen,
   `/score/enter` puts its first mark field at **832px** — below the fold, behind a 267px header
   that repeats the class twice and the year four times. `/enrollment` is **7.2 screens of scroll
   and 27 fields** to add one pupil, of which **5 are required**.

None of this needs an architectural change. All of it is a small number of shared fixes.

**What is working and should not be touched:** the class-context chain (`?class=` + `useActiveClass`
+ `ClassContextBar`), the score workspace vocabulary and tab strip, the reporting engine and its
availability model, the Print Center, the page frame and paper contract, RBAC/RLS, and the
navigation tree — which is derived, not duplicated, and resolves every route correctly.

---

## 2. Teacher journey map

Traced live as the fixture teacher (3 classes: `៤ក` 30 pupils, `៤ខ តេស្ត` 5, `២ក` 0).

```
LOGIN ──▶ DASHBOARD ────────────────────────────────────────────── ✅ strong
            │  context strip: class · grade · year · ប្តូរថ្នាក់
            │  4 StatCards · marking progress · attention · 5 quick actions · activity
            │  ▼ then the ENTIRE navigation tree again (28 links)          ⚠️ F14-7
            │
            ├──▶ CLASSROOM ─── per-class card, 6 scoped tools ───────────── ✅ strong
            │       └── students · enrollment · subjects · attendance · scores · print
            │
            ├──▶ STUDENT LIFECYCLE ────────────────────────────────────── ✅ strong
            │       add → (marked + paged to, Phase 14 F1) → find → edit
            │       → /students/[id] aggregates, 6 outbound actions
            │       → transfer is its own deliberate panel, not hidden in edit
            │
            ├──▶ ENROLLMENT ──────────────────────────────────────────── ⚠️ F14-6
            │       27 fields · 5 required · 7.2 screens on a phone
            │
            ├──▶ SCORES ──────────────────────────────────────────────── ⚠️ F14-5
            │       subjects → enter → save → total
            │       one vocabulary, one scope, one arithmetic  ✅
            │       but no mark field above the fold on a phone
            │
            ├──▶ RESULTS ─────────────────────────────────────────────── ⚠️ F14-3/4
            │       total · ranking · honour · analysis · annual
            │       every one joins to its document (Phase 13)  ✅
            │       none of them explains itself when empty
            │
            └──▶ DOCUMENTS ──▶ PRINT CENTER ──▶ generate ──▶ file ────── ⚠️ F14-1/2
                    engine path: correct class, correct pupil id   ✅
                    screen path: wrong class, UUID as pupil id     ❌

ATTENDANCE ─────────────────── in-flight, excluded from this audit
```

---

## 3. Findings

### F14-1 · Printed documents name the wrong class · **P0**

**Routes** `/ranking`, `/score/total` (print), `/record-book`, `/student-tracking`,
`/yearly-report/*`, `/parent-report`, `/print-list`, `/print-student-age`, `/id-student`,
`/homework/enter` (print sheet), `/score-analyse`, `/class-admin/[book]`, `/attendance/*` (excluded
from this audit but shares the pattern), `/inventory`

**User problem.** A teacher with more than one class prints a ranking sheet for `៤ខ` and hands the
director a document headed `ថ្នាក់ទី៣`. The marks on it are correct; the class it claims to be about
is not. A wrong class name on a signed official document is worse than a missing one — it is
indistinguishable from a true one.

**Evidence.**

```
RankingClient.tsx:487   <p>{settings?.class_name || "ថ្នាក់..."}</p>
```

`settings` is the teacher's single legacy settings row — one value per *teacher*, not per class.
Observed in the browser, class `៤ខ តេស្ត` selected:

```
top bar         2025-2026 › ៤ខ តេស្ត
sheet letterhead ថ្នាក់ទី៣            ← settings.class_name
sheet rows      សុខា 9.00 rank 1     ← correct data for ៤ខ តេស្ត
```

Nineteen screens use the pattern. Fifteen of them read **no other class source at all**, so they
are wrong by construction whenever `settings.class_name` differs from the active class:
`record-book`, `attendance/monthly`, `attendance/yearly`, `score-analyse/CognitivePanel`,
`yearly-report/ReportFrame`, `student-tracking`, `class-admin/[book]`, `score/total/ScoreTotalPrint`,
`homework/enter/HomeworkPrintSheet`, `inventory`, `print-list`, `print-student-age`, `id-student`,
`parent-report`. The remaining four import `useActiveClass` but use it only for *scoping* —
`/ranking` is verified above to print the settings value regardless.

**The engine already solves this**, which is what makes it a fix rather than a design question:

```
report-data.ts:291   let className = settings.class_name ?? ''
report-data.ts:298   className = data?.name ?? className    // the class row wins
```

**Recommended solution.** One shared helper — the class name a *document* should print: the active
class's own `name`, falling back to `settings.class_name` only for a pre-V2 account, which is
exactly the engine's rule. Screens read it instead of `settings.class_name`. No schema change, no
new query on most screens (the class name is already in `useActiveClass()`).

**Affected** `lib/` (one new pure helper), the 19 print screens, `verify-documents.mts`.
**Risk** Low per screen, but it touches many files — stage it by journey, highest-stakes first
(`/parent-report` and `/ranking` go outside the school).

---

### F14-2 · The ranking sheet prints a database UUID as the pupil number · **P1**

**Route** `/ranking`

**User problem.** The `អត្តលេខ` column of the printed ranking sheet shows
`b0000000-0000-0000-0000-000000000001` instead of the pupil's code `S01`. Thirty-six characters of
internal identifier, on the document a teacher hands in.

**Evidence.** `RankingClient.tsx` `<tbody>`:

```tsx
<td …>{stu.id}</td>        // the database row id
```

`stu.student_id` is the pupil's code and is what every other surface prints — the engine included
(`report-data.ts:366` → `'row.student_id': c.student.student_id ?? ''`). Observed cells:
`["1", "b0000000-…-000000000001", "សុខា", "ប", "18", "9.00", "1", "A", "ល្អណាស់", ""]`.

**Recommended solution.** `{stu.student_id}` with the existing `toKhmerNumber` treatment the other
sheets use. One line.
**Affected** `RankingClient.tsx`. **Risk** Very low.

---

### F14-3 · An empty class produces a complete, signed, printable sheet · **P1**

**Route** `/ranking` (and, by the same absence, `/score-analyse`, `/record-book`,
`/student-tracking`, `/yearly-report`)

**User problem.** Selecting a month for a class with no pupils — or no marks — does not say so. It
renders the full A4 ministry sheet: royal letterhead, school, title *តារាងចំណាត់ថ្នាក់សិស្ស ប្រចាំខែ
មករា*, a totals block reading `0 នាក់ ស្រី 0 នាក់ 0.00%`, and signature lines for the **នាយកសាលា**
and the **គ្រូបន្ទុកថ្នាក់**. Print and Excel are live. Since Phase 13 the Print Center link is live
beside them.

**Evidence.** `RankingClient.tsx:188` `loadData()` runs to `setShowPreview(true)` at `:275` with no
guard on the result set. Observed on class `២ក` (0 pupils): sheet rendered, **0 data rows**, no
toast, all controls enabled.

**Its sibling behaves the opposite way.** `/honor-roll` checks `eligible.length === 0`, refuses,
and explains — distinguishing *"no marks yet"* from *"nobody cleared the bar"*. Two screens in one
module, one question, opposite answers.

**Recommended solution.** `/ranking` adopts the honour roll's rule: when the period resolves no
marked pupil, stay on the picker and say which of the two reasons it is, with the action that fixes
it (`បញ្ចូលពិន្ទុ`). `EmptyState` already exists and is used on 15 other screens.
**Affected** `RankingClient.tsx`, `components/ui/feedback/EmptyState`. **Risk** Low.

---

### F14-4 · Results screens do not explain themselves when empty · **P1**

**Routes** `/ranking`, `/honor-roll`, `/score-analyse`, `/yearly-report`, `/record-book`,
`/student-tracking`, `/certificate`

**User problem.** A teacher opening a result before entering marks gets a blank sheet, a spinner
that ends, or a toast that disappears — never an explanation of *why* it is empty or *what to do*.
§4 of the brief calls this recovery, and it is absent from the entire results family.

**Evidence.** Zero `EmptyState` and zero `role="status"` across all seven files. Only two use even a
toast (`/honor-roll` ×1, `/certificate` ×2). By contrast the entry and management screens are well
served: `EmptyState` appears in 15 files including `/student-list`, `/score/enter`, `/score/collect`,
`/score/subjects`, `/homework/*`, `/print-center`.

**Recommended solution.** One empty-state pattern for the results family, saying which of the three
states it is — no pupils / no marks for this period / nobody met the rule — each with the one action
that resolves it. Reuse `EmptyState`; invent no component.
**Affected** the seven clients. **Risk** Low. Best done together with F14-3, which is its most
severe instance.

---

### F14-5 · No score field above the fold on a phone · **P2**

**Route** `/score/enter` (and the four other `ScoreWorkspaceHeader` screens)

**User problem.** Entering marks is a desk task that Cambodian teachers also do on a phone. At
360×732 the first input sits at **832px** — a full screen below the fold. Before reaching it the
teacher passes a 267px workspace header and two stat cards.

**Evidence** (measured live, `/score/enter`, class `៤ខ តេស្ត`):

| | |
| --- | --- |
| viewport height | 732px |
| first input top | **832px** |
| `ScoreWorkspaceHeader` height | 267px |
| class name shown | **2×** (top bar + header) |
| academic year shown | **4×** |
| horizontal overflow | 0 ✅ |

The header is correct on desktop and is load-bearing — it is what made the five score screens one
workspace. The issue is that its full form is paid on a phone, where vertical space is the scarce
resource and the top bar already states class and year.

**Recommended solution.** A compact form below `sm`: the facts the top bar already shows collapse,
the tab strip becomes horizontally scrollable rather than wrapping to two rows. Presentation only —
no change to `SCORE_WORKSPACE_TABS` or the vocabulary.
**Affected** `components/score/ScoreWorkspaceHeader.tsx`. **Risk** Low, but it touches five screens
at once; verify each.

---

### F14-6 · Adding one pupil is seven screens of scrolling · **P2**

**Route** `/enrollment`

**User problem.** A primary teacher adding a pupil faces **27 fields across 7.2 phone screens**,
when only **5** are required. Everything — birthplace, current address, four social-status
dropdowns, three guardian blocks, ethnicity, notes — is expanded at once. The most common creative
act in the product is presented at its maximum complexity.

**Evidence** (measured live at 360×732): 27 fields, 5 required, page height 5252px = 7.2 viewports,
first field at 845px, no horizontal overflow. The form *does* carry a five-section rail with a
`០/៩` progress counter, so the structure exists — it is simply all open.

**Recommended solution.** Progressive disclosure, which §5 of the brief asks for by name: the
required section open, the other four collapsed with their own completion counts, and a save that
works from section one. Capability is unchanged — nothing is removed, only folded.
**Affected** `app/(main)/enrollment/page.tsx`. **Risk** Medium — it is a 1,714-line form with a
draft-restore mechanism (`enrollmentDraft`) that must keep working in both directions.

---

### F14-7 · The dashboard renders the whole navigation tree a second time · **P2**

**Route** `/dashboard`

**User problem.** Below the day's work, `មុខងារទាំងអស់` renders **28 links under 10 module
headings** with its own search box — the same set the sidebar shows, on the same screen, at the same
time. §6 of the brief: *"The dashboard must not become a second sidebar."*

**Evidence.** `dashboard/page.tsx:385` renders `<FeatureGrid />`; counted live at 1400px: 28 links,
10 headings, 1 searchbox, with the rail showing the same tree to its left.

**In its favour, and why this is P2 and not P1:** it is **derived** from `NAV_SECTIONS` via
`searchEntries()`, not a hand-maintained list — the thing CLAUDE.md explicitly forbids reintroducing
— and on a phone the rail is behind `ផ្សេងៗ`, so the grid is the only visible map.

**Recommended solution.** Keep it, and stop rendering it where the rail already does the job
(`lg:hidden`). One class, no change to the derivation.
**Affected** `dashboard/FeatureGrid.tsx`. **Risk** Very low.

---

### F14-8 · Recent activity is not actionable · **P3**

**Route** `/dashboard`

A teacher reads *"បានរក្សាទុកពិន្ទុ ១ ប្រអប់"* and cannot go to it — the feed is plain text. Six
entries, zero links (verified live). The audit trail knows the class and the action; the row could
carry the same link its quick action does.
**Risk** Low. **Note** `audit_logs.metadata` carries `class_id` for score and enrolment rows, so the
target is derivable without a new query.

---

### F14-9 · Four housekeeping tools still hold a top-level module · **P3 (carried)**

`បរិក្ខារថ្នាក់` (`/cleaning-schedule`, `/inventory`, `/decorations`) plus `/poster-splitter` under
`ឯកសារ` occupy navigation weight equal to `ពិន្ទុ`, and no teacher workflow reaches any of them.
Open since Phase 0 §10 Q3, restated as Phase 12 F16. **Not recommended for Phase 14** — §15 of the
brief says navigation changes need a proven journey problem, and these tools are not *in* a journey.

---

### F14-10 · Vocabulary drift · **P3 (carried)**

Phase 12 F23/F24 remain: three phrasings of "no pupils", and three page titles that disagree with
their own navigation labels (`/attendance/layout`, `/homework/send`, `/parent-report`). Cosmetic,
and §17 of the brief forbids rewriting unrelated copy, so these should ride along with whatever
touches those screens rather than becoming a phase.

---

## 4. Top 10 UX issues, ranked

Ranked by **frequency × severity × cognitive load × implementation safety** — not by visibility.

| # | ID | Issue | Sev | Freq | Safety |
| --- | --- | --- | --- | --- | --- |
| 1 | F14-1 | Printed documents name the wrong class | P0 | every print, every multi-class teacher | Medium (many files, one rule) |
| 2 | F14-3 | Empty class produces a signed, printable sheet | P1 | every new/unmarked class | High |
| 3 | F14-2 | UUID printed as the pupil number | P1 | every ranking sheet | Very high |
| 4 | F14-4 | Results screens never explain an empty state | P1 | every teacher before marks exist | High |
| 5 | F14-5 | No score field above the fold on a phone | P2 | daily, mobile | High |
| 6 | F14-6 | 27 fields / 7 screens to add a pupil | P2 | every enrolment | Medium |
| 7 | F14-7 | Dashboard duplicates the whole rail | P2 | every session | Very high |
| 8 | F14-8 | Activity feed is not actionable | P3 | every session | High |
| 9 | F14-9 | Orphan utilities hold a top module | P3 | never | — (deferred) |
| 10 | F14-10 | Empty-state and title vocabulary drift | P3 | incidental | — (ride along) |

---

## 5. Recommended implementation order

Per §25 the scope must be **3–5 tightly related improvements**. The recommendation is **one theme,
four findings**:

> ### Phase 14 — *The document tells the truth, and the screen explains itself*

| Step | Finding | Why this order |
| --- | --- | --- |
| 1 | **F14-2** UUID → `student_id` | One line, one file, zero risk. Proves the journey and the harness before anything larger. |
| 2 | **F14-1** the document's class name | The headline. One shared helper mirroring the engine's existing rule, then screens adopt it — highest-stakes first (`/parent-report`, `/ranking`). |
| 3 | **F14-3** `/ranking`'s empty sheet | Same file as step 1, same journey as step 2, and the rule already exists on `/honor-roll` — it is being *copied*, not invented. |
| 4 | **F14-4** the results family's empty states | The generalisation of step 3 across its six siblings. |

All four are the same sentence: **a results surface should either tell the truth about the class it
is about, or say why it cannot.** They share files, they share a harness, and none of them touches
the score engine, the reporting engine, RLS, the class-scope architecture, the page frame, the Print
Center architecture, attendance semantics or the navigation tree.

**Acceptance criteria**

- A document printed for class X names class X, for a teacher holding three classes.
- The printed pupil number is the pupil's code, never a UUID.
- A class with no pupils, or no marks in the period, cannot produce a signed sheet.
- Every results screen answers "why is this empty, and what do I do?"
- `verify-documents.mts` fails if a print screen reads `settings.class_name` without the class-row
  override.

**Deliberately left out of the implementation scope**, despite ranking 5–7: F14-5 and F14-6 are
mobile-layout work on two large files, and F14-7 is a one-line change that belongs with whatever
touches the dashboard next. Bundling them would make this a second programme, which §25 forbids.

---

## 6. Explicitly deferred

- **Attendance, entirely** — in-flight uncommitted work (see §0). Re-audit when it lands; it is the
  highest-frequency teacher task and deserves its own pass.
- **F14-5** mobile chrome budget on the score workspace.
- **F14-6** enrollment progressive disclosure.
- **F14-7 / F14-8** dashboard duplication and activity links.
- **F14-9** the orphan-utilities module (open since Phase 0; needs a product decision, not a fix).
- **F14-10** vocabulary drift (should ride along with other work on those screens).
- **`/class-admin`'s private context strip** — the third copy, already named in
  `PRIVATE_CONTEXT_BARS` in `verify-class-context.mts` so the count stays a checked fact.
- Everything §28 names as stable architecture. The audit found no teacher workflow that requires
  changing any of it.

---

## 7. What was inspected and deliberately found sound

Stated so the next phase does not re-litigate it:

- **Class context.** One chain, no duplicates: `?class=` is a request, `resolveServerScope`
  re-validates it, `useActiveClass` is the single client read, `ClassContextBar` the single
  presentation. Verified across class A / class B / a non-current year in Phase 13.
- **Classroom as home base.** Six scoped tools per class card, all carrying `?class=`, no duplicate
  routes invented.
- **Student lifecycle.** add → find → edit → enrol → move → track → result → report has no broken
  join. The pupil page aggregates without duplicating and offers six outbound actions; transfer is
  its own panel and is not reachable from ordinary editing.
- **Homework.** Both screens carry class context and cross-link; it reads as part of the class
  workflow, not a separate application.
- **Results → documents.** Phase 13's joins are present on all four surfaces and carry class, year
  and period. `/score-analyse` correctly offers none, because no analysis report exists.
- **Navigation.** 12 modules, 4 sections, derived; every route resolves; the palette and the grid
  read the same source.
- **Accessibility.** No icon-only control without a name; tab strips carry `role="tab"`;
  `role="status"` on the entry and management screens. The gap is the results family (F14-4).
- **Mobile overflow.** Zero horizontal overflow measured on `/score/enter` and `/enrollment` at
  360px. The mobile findings are about vertical budget, not breakage.

---

*Phase 14 audit complete and read-only. No implementation has begun; §25's scope gate is the next
decision.*
