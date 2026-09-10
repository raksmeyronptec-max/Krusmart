# Phase 13 — Results → Documents Flow

**Implemented.** The seam Phase 12 named its headline finding is closed: a teacher who reaches a
result now has a route to the document of it, and that route carries the class, the year and the
period with it.

---

## 1. Goal

> **ពិន្ទុ** what I enter · **លទ្ធផល** what I learn · **របាយការណ៍** what I produce.

The third arrow did not exist. `/ranking`, `/honor-roll`, `/score/total` and `/yearly-report`
referenced `/print-center` **zero times between them** — so the moment a teacher had the thing they
came for, a ranked class, the product had no answer to *"how do I print this?"* other than the
sidebar, plus knowing in advance that ranking sheets live under `របាយការណ៍ → មជ្ឈមណ្ឌលរបាយការណ៍`.

That question is what this phase set out to stop a teacher having to ask.

---

## 2. Findings implemented

| # | Finding | Sev | State |
| --- | --- | --- | --- |
| F5 | No join from any results screen to the Print Center | **P1 (headline)** | Closed |
| F6 | Two ranking print paths, referencing each other nowhere | P1 | Resolved — one is now the production path, the other is named as a screen print |
| F7 | `/honor-roll` is a hard dead end | P1 | Closed — it is the sixth door in the workspace strip |
| F9 | The class card's `វត្តមាន` lands on a read-only sheet | P1 | Closed |
| F11 | The dashboard's attendance tile does the same | P2 (same family as F9, taken as part of the rider) | Closed |
| F13 | Certificates have two front doors | P1 | Closed — one door, the Print Center family |
| F14 | Annual results filed under `របាយការណ៍`, not `លទ្ធផល` | P1 | Closed — regrouped, no route moved |
| — | `បោះពុម្ភ` → `បោះពុម្ព` on `/ranking` and `/honor-roll` | P3 | Fixed, as terminology on a touched surface (brief §19) |

**Not pulled in**, per brief §1 (P2/P3 only when the flow work requires them): F1, F2, F3, F4, F8,
F10, F12, F16–F25. §12 below records why F8 in particular was left alone rather than taken from
the audit's own §23 wish-list.

---

## 3. Files changed

**New**

| File | What it is |
| --- | --- |
| `lib/reporting/result-documents.ts` | Pure, isomorphic. The result → document mapping, the availability check and the href builder. The one place that decides where a results screen's document action goes, what it says, and whether it should be offered at all. |
| `components/reporting/ResultDocumentLink.tsx` | The single control four screens render. Two shapes: a header pill, and a round icon for an A4 preview toolbar. |
| `scripts/verify-result-documents.mts` | 90 checks across six sections. Offline harness #32. |

**Modified**

| File | Change |
| --- | --- |
| `lib/scores/workspace.ts` | `/honor-roll` added to `SCORE_WORKSPACE_TABS` as the sixth door, `carriesPeriod: false`. |
| `lib/navigation.ts` | `/yearly-report` + its three sheets moved `reports` → `results` (parent now visible); the `ឯកសារ` certificate entry defers to `/print-center?category=certificate` and `/certificate` is declared `hidden`. |
| `app/(main)/print-center/page.tsx` | Reads and validates `?report=`, `?year=`, `?month=`, `?semester=`; `?category=` falls back to the report's own family. |
| `app/(main)/print-center/PrintCenterClient.tsx` | Accepts `initialReport` / `initialPeriod` / `initialSemester`; opens the generation dialog on the handed-over report during first render. |
| `app/(main)/print-center/GenerateReportDialog.tsx` | Accepts `initialPeriod` / `initialSemester`, applied on the existing re-seed. |
| `app/(main)/score/total/ScoreTotalClient.tsx` | `ResultDocumentLink` first in the header actions. |
| `app/(main)/ranking/RankingClient.tsx` | `ResultDocumentLink` in the header and at the top of the preview toolbar; the screen's own print/export relabelled as screen actions; misspelling fixed. |
| `app/(main)/honor-roll/HonorRollClient.tsx` | `PageHeader` + `ClassContextBar` → `ScoreWorkspaceHeader`; `ResultDocumentLink` in the header and the preview toolbar; misspelling fixed. |
| `app/(main)/yearly-report/YearlyReportClient.tsx` | `ResultDocumentLink` beside `ប្រភេទរបាយការណ៍`. |
| `app/(main)/classroom/ClassroomClient.tsx` | `CLASS_TOOLS` `វត្តមាន` → `/attendance/layout`. |
| `app/(main)/dashboard/page.tsx` | `វត្តមានថ្ងៃនេះ` StatCard → `/attendance/layout`. |
| `scripts/verify-score-workspace.mts` | `/honor-roll` added to `PAGE_FOR`; new checks that every tab names a page the harness can check, and that the honour roll wears the header without a second class strip. |

**Not touched:** the reporting engine, every resolver, `lib/scores/*` arithmetic, the Print Center's
internal architecture, the attendance semantic model, the page frame, the paper contract, RBAC,
RLS, every migration.

---

## 4. Result → document mapping

Declared once, in `documentForResult()`, and read from the catalogue — never a second list of
reports.

| Surface | ប្រចាំខែ | ប្រចាំឆមាស | ប្រចាំឆ្នាំ |
| --- | --- | --- | --- |
| `/score/total` | `score_monthly` | `score_semester` | **`annual_summary`** |
| `/ranking` | `ranking_monthly` | `ranking_semester` | `ranking_annual` |
| `/honor-roll` | `honor` | `honor` | `honor` |
| `/yearly-report` | — | — | `annual_summary` |
| `/score-analyse` | **none, deliberately** | | |

Two entries need their reasoning stated.

**The year of `/score/total` is `annual_summary`, not `score_annual`.** `score_annual` carries
`resolver: false` and has no template; `reportAvailability` therefore offers only its legacy
screen, which *is* `/score/total` — the screen the teacher is standing on. CLAUDE.md already
records `annual_summary` as "its engine equivalent [which] prints the same figures", so the rung
resolves there. The harness pins both halves: if `score_annual` ever gains a resolver and a
template, the check that it currently cannot generate fails and tells someone to repoint the rung.

**`/score-analyse` gets no document action.** The catalogue holds no analysis report, and brief §4
and §13 are explicit that a button must not be added where no document exists. This is asserted as
a property of the catalogue (`no report has legacyHref '/score-analyse'`) rather than left as a
comment, so the day an analysis report is added the harness says to wire the screen up.

---

## 5. Ranking print-path decision

Both implementations were inspected before anything was changed.

| | `/ranking`'s own controls | The engine's ranking reports |
| --- | --- | --- |
| Produces | a browser print of the on-screen A4 sheet; an `xlsx-js-style` export built in the client | one `.xlsx` per rung, filled from a versioned ministry template by exceljs |
| Rungs | monthly · semester · annual | `ranking_monthly` · `ranking_semester` · `ranking_annual`, all `engine_ready` |
| Preview before paper | the screen itself | the generation dialog's rendered sheet + counts |
| Template versioning | none | `v1` / `v2`, picked in the dialog |
| Arithmetic | `buildPeriodResults` | `buildPeriodResults`, via `resolveMonthlyClass` / `resolveSemesterClass` / `resolveAnnualClass` |

**Neither is legacy, and their numbers agree** — Phase 12 verified that both narrow through the
same `applySelection(resolveTemplate(...))`, which is why F6 is a discoverability defect and not a
correctness one.

**Decision: the Print Center is the canonical production path; the screen keeps a quick print of
itself, and now says so.** Nothing was removed, no route changed and no business logic was
duplicated — what changed is that the three controls are no longer three equal claims to "the
ranking document":

- `បង្កើតរបាយការណ៍` is added, first in the header and first (and the only gold control) in the
  preview toolbar. It opens the ministry sheet's generation flow on the period being viewed.
- `បោះពុម្ភ` → **`បោះពុម្ពអេក្រង់នេះ`**, and `ទាញយក Excel` → **`ទាញយកអេក្រង់នេះជា Excel`**. Both
  gained `aria-label`s naming the same thing, so the accessible name matches the visible intent.

Removal was considered and rejected: the screen's print is the only way to get the sheet a teacher
is *currently looking at*, it needs no template, and deleting it would be a capability loss dressed
up as a tidy. Brief §7's "if the direct screen print/export is retained for compatibility, make its
purpose explicit" is what was done.

---

## 6. Honor flow

`/honor-roll` had **no** `ScoreWorkspaceHeader`, no `useClassHref`, and no `href` of any kind. It
was the only member of the `លទ្ធផល` module without the workspace strip.

- `/honor-roll` is the **sixth tab** in `SCORE_WORKSPACE_TABS`, between ចំណាត់ថ្នាក់ and វិភាគ,
  `carriesPeriod: false` for the reason its two neighbours have it — the screen opens on a picker
  and holds its period in local state, so a `?mode=` would be a claim the URL makes and the page
  ignores. `verify-score-workspace.mts` §3 checks that against the page source, in both directions.
- The screen wears `ScoreWorkspaceHeader`, so it now states class · grade · year · វគ្គ and carries
  six ways out plus the subject-configuration link.
- `ClassContextBar` was **removed with it**, not in spite of R4 but because of it: the workspace
  header states the same three facts, so a second strip beneath it would say them twice. This is
  the rule `/score-analyse` already follows. `verify-page-frame.mts` R4 accepts the header as a
  context provider, and passes.
- A `ResultDocumentLink` sits in the header and at the top of the preview toolbar.

**No honour arithmetic was touched.** The screen still decides eligibility with
`evaluateHonor` + `defaultHonorCriteria`, and the `honor` report applies the same rule through the
same module — so the podium and the printed sheet name the same pupils, as they already did.

---

## 7. Attendance rider

`/attendance/monthly` is read-only: its `actions.ts` exports `getMonthlyAttendance` and
`getTeacherSettings` and no write of any kind. Two controls sent a teacher there when they meant to
mark a register.

- `ClassroomClient.tsx` — `CLASS_TOOLS`'s `វត្តមាន` → `/attendance/layout`, `?class=` preserved (each
  card scopes to its own class, so the tool follows the card, not the ambient selection).
- `dashboard/page.tsx` — the `វត្តមានថ្ងៃនេះ` StatCard → `/attendance/layout`. The tile says *today*
  and *not yet recorded*; the quick action directly beneath it already went to the register, so the
  same screen offered both and the one attached to the number was the wrong one.

The monthly and yearly sheets keep their routes and are still catalogued in the Print Center. **The
attendance semantic model was not touched, and no lateness concept was reintroduced.** The harness
asserts the monthly sheet is still write-free — which is *why* this matters — before asserting the
two destinations.

---

## 8. Annual-result discovery

**No route moved.** `/yearly-report` and its three sheets keep their URLs; what changed is which
module declares them.

- `លទ្ធផលប្រចាំឆ្នាំ` (`/yearly-report`) is a **visible** child of `results`. It was `hidden` under
  `reports`, so the module literally named "results" held only monthly and semester surfaces.
- Its three sheets (`/promoted`, `/repeated`, `/subject-results`) travel with it, still `hidden`.
  They had to: `moduleForPath` takes the longest match, so leaving them behind would breadcrumb a
  page reached from `លទ្ធផលប្រចាំឆ្នាំ` under a module its own parent no longer belongs to.
- The screen gained a `ResultDocumentLink` beside `ប្រភេទរបាយការណ៍`, opening the yearly family's
  summary sheet.

The distinction this makes visible is the one the product is built on: an annual **result** is what
the teacher learns and lives in `លទ្ធផល`; an annual **report** is what they print and stays a row in
the Print Center, under `របាយការណ៍`.

**Certificates (F13).** `វិញ្ញាបនបត្រ` was reachable two ways with different affordances — an `ឯកសារ`
menu item opening `/certificate`'s browser print, and a Print Center row generating a Word file from
a versioned template. Resolved the way `ឯកសារសិស្ស` already resolves it in the `សិស្ស` module: the
menu entry defers to `/print-center?category=certificate`, and `/certificate` keeps its route,
declared `hidden` so `moduleForPath` still resolves it and every existing link keeps working. The
harness asserts exactly one certificate destination is offered, and that it is the family.

**No broader IA restructuring was done** (brief §20/§26). F15 (`/score/print` under `ពិន្ទុ`), F16
(the four orphan utilities) and F17 (two analysis entries) are untouched.

---

## 9. Context handling

`resultDocument()` builds one href, and everything it carries is read from something that already
exists:

```
/print-center?category=ranking&report=ranking_monthly&year=2025-2026&month=jan&class=<id>
```

| Fact | How it travels | Why |
| --- | --- | --- |
| class | `withClassParam` — the shared helper, never a hand-appended `?class=` | the rule about which routes may carry one stays in one place; a pre-V2 account gets no empty promise |
| year | `year=` | the centre otherwise resolves `getCurrentAcademicYear()`, so a teacher reading last year's ranking would be handed this year's sheet |
| family | `category=` | already supported; a `?report=` with no category falls back to that report's own family |
| report | `report=` | new, and the reason the flow opens focused instead of at the index |
| period | `month=` / `semester=` | the names `workspaceTabHref` already uses — a second spelling of the same four facts is how two halves of one journey start disagreeing |

**Two rules keep the URL honest, and both are pinned:**

1. **`report=` appears only when `reportAvailability(...).action === 'generate'`.** Anything else
   links to the family view, and the label changes from `បង្កើតរបាយការណ៍` to `មើលរបាយការណ៍` — a
   button promising generation that lands on a row saying `មិនទាន់មាន` is a promise the product does
   not keep.
2. **The period travels only where both halves agree it means something** — the report must declare
   it takes one of that shape, *and* the screen must be on that rung. `honor` is declared
   `period: 'month'` while its screen offers all three rungs, so without the second test a
   semester's honour roll would hand over whichever month the picker happened to be holding.

On the receiving side the page validates every parameter (`isReportType`, `isMonthId`, a
`YYYY-YYYY` shape check, the two semester literals) and **degrades to the family or the index**
rather than erroring. The handed-over period applies to the handed-over report and nothing after
it: opening a second report from the index clears it, so one report's month cannot leak into
another's flow.

`ResultDocumentLink` reads `useActiveClass()` — the same selection the top bar shows and `?class=`
carries to the server — so the class named on the results screen and the class the document is
built for are the same one by construction. No second context mechanism was introduced.

---

## 10. Accessibility and mobile checks

**Accessibility**

- Every new control is a real `<a>`: middle-click, copy-link and browser-back all work, and a
  teacher who lands in the generation flow by mistake is one back-press from the table they left.
- The pill shape carries visible Khmer text. The icon shape carries `aria-label` **and** `title` —
  this app has zero unnamed icon buttons across 45 routes and Phase 13 did not add one.
- `min-h-11` / `min-w-11` (44px) on both shapes; `focus-visible:outline-2 outline-offset-2
  outline-focus-ring` on both.
- No colour-only meaning: the gold accent on the preview-toolbar link is emphasis beside a label,
  never the message.
- The relabelled `/ranking` controls gained `aria-label`s, so their accessible names now match what
  they actually do (`បោះពុម្ពអេក្រង់នេះ`, not the bare `បោះពុម្ភ`).
- Semantic tokens only (`bg-brand` / `text-brand-contrast`, `bg-gold` / `text-brand-950`) — no new
  raw hex.

**Mobile** — walked at 360×720 in a real browser against the live fixture:

- `/score/total`: the header actions wrap to two rows, `បង្កើតរបាយការណ៍` first and full-size. No
  horizontal overflow.
- `/honor-roll`: the six-tab strip wraps to two rows; the document action sits under the
  description at full touch size.
- The preview toolbars are fixed vertical columns of circles — one more circle on `/ranking` (four)
  and on `/honor-roll` (three), which fits a phone viewport.
- The generation dialog is the existing responsive one; nothing about it changed.

---

## 11. Tests

**Baseline (HEAD `694fa24`, clean tree)** — re-measured, and re-measured *again* under `git stash`
after the work to confirm the two live failures pre-exist:

| Gate | Before | After |
| --- | --- | --- |
| `npm run lint` | clean | **clean** |
| `npm run typecheck` | clean | **clean** |
| `npm run verify` | 31/31 | **32/32** (new harness) |
| `npm run build` | compiled | **compiled** |
| `npm run verify:live` | 32/34 | **33/35** — the same two failures |
| `scripts/validate-rls.mjs` | — | not runnable here (see below) |

The two live failures are `verify-annual-live.mts` and `verify-ranking-live.mts`, and they are the
**known fixture drift** recorded in `phase7-implementation.md` §3 and `phase8-implementation.md` §6:
the seeded class holds 35 pupils where the harness expects 5, and the fixture writes semester exam
marks under monthly column ids. Confirmed identical before and after by stashing the whole change
set and re-running. **No fixture was modified to make anything pass.**

`scripts/validate-rls.mjs` could not run in this environment — it exits with
`Cannot load "pg" (tried pg)`, the driver is not installed. Stated rather than assumed: **this phase
changed no SQL, no policy, no migration and no RLS-relevant query**, so the 64 behavioural checks
have nothing new to exercise, but they were not executed and are not claimed as passing.

**New harness — `scripts/verify-result-documents.mts`**, six sections:

1. **The mapping** — every surface × rung names a report that exists; the rungs are three different
   documents; the year of the totals table resolves to a sheet that can actually be produced, and
   `score_annual` genuinely cannot while `annual_summary` genuinely can.
2. **The honesty** — a link claims generation only when `reportAvailability` allows it, names the
   report only when it opens the flow, says what it does, and carries a period only in the shape the
   report declares (including the honour roll's semester case).
3. **The context** — class, year and family all travel; the class rides `withClassParam`; a pre-V2
   account gets no `class=`; the centre reads back all five parameters and validates the report.
4. **The doors** — each of the four results screens offers the action and none builds the
   destination itself; the analysis screen offers none *and there is still no analysis report to
   offer*; the honour roll is a tab, wears the header and carries links; the two ranking paths are
   no longer equals; `បោះពុម្ភ` is gone from both touched files.
5. **The attendance rider** — the monthly sheet is still write-free, and neither the class card nor
   the dashboard points at it.
6. **One front door** — exactly one certificate destination, and it is the family; `/certificate`
   hidden rather than deleted; the four `/yearly-report` paths resolve to `results` and the parent
   is offered; the Print Center is still the single document index; no href is claimed by two
   modules.

**Extended — `scripts/verify-score-workspace.mts`:** `/honor-roll` added to `PAGE_FOR` (so its
`carriesPeriod` is asserted against a real page rather than vacuously), plus a check that *every*
tab names a page the harness can check — a new door added without one would otherwise assert
nothing — and that the honour roll wears the header without a second class strip.

**Browser walkthrough** — production build, live local Supabase, the `ranktest@krusmart.local`
fixture teacher, class ៤ក:

| Test | Result |
| --- | --- |
| A — Score → Total → score report | ✅ `បង្កើតរបាយការណ៍` first in the header |
| B — Ranking → ranking document | ✅ one preferred path; the screen's own controls named as screen actions |
| C — Honor → leaves through Results and a report action | ✅ six-tab strip + document action; no dead end |
| D — Annual result discovery | ✅ `លទ្ធផលប្រចាំឆ្នាំ` under `លទ្ធផល` in the rail, the grid and the breadcrumb |
| E — Class card and dashboard attendance | ✅ both land on `/attendance/layout`, `?class=` intact |
| F — Context on hand-off | ✅ dialog opened on ចំណាត់ថ្នាក់ប្រចាំខែ, ថ្នាក់ ៤ក · 2025-2026, month pre-set to មករា |
| G — Mobile | ✅ 360px: actions wrap, full touch targets, no horizontal overflow |

---

## 12. Known deferred work

**Deliberately not taken, with the reason:**

- **F8 — the Print Center's private `ContextBar`.** The audit's own §23 listed converging it onto
  the shared `ClassContextBar`; it is not in this brief's §1 P1 set, and converging it would be a
  **regression**. The private bar renders for a pre-V2 account (from `settings.class_name`) and
  carries the scope hint *"របាយការណ៍ប្រើបញ្ជីសិស្សរបស់អ្នកទាំងអស់។"*; `ClassContextBar` deliberately
  renders nothing for a legacy account. Swapping it would blank the context on exactly the accounts
  whose reports still work. Doing this properly means teaching the shared bar a legacy state — a
  change to a component 26 routes render, which the flow work does not require.
- **F12 — three implementations of the class strip.** Same component, same reason; `/class-admin`'s
  inline section is the third.
- **F1 / F19** (the new pupil off-screen), **F2** (edit vs transfer), **F3** (no next step after
  saving marks), **F4** (`/score/collect`'s filing), **F10** (register ↮ review), **F15**–**F18**,
  **F20**–**F25** — outside the results/documents seam, per brief §1 and §26.

**Carried forward unchanged:**

- The two `*-live` harness failures and the fixture behind them.
- `scripts/validate-rls.mjs` not runnable in this environment (`pg` not installed).
- Migration 00033 not applied to every environment.
- Four status colours used as labels below 4.5:1 (`phase10-implementation.md` §4).
- The admin console's missing dark-mode pass, teacher profile and permissions legs.
- `/ranking`'s `bg-emerald-600` export button (F25) — a design-system token issue rather than a
  terminology one, and brief §19 scopes the touched-surface exemption to terminology.

**Trip-wires this phase leaves behind** — three checks that fail *on purpose* when the world
changes, and should be moved rather than weakened:

- `score_annual` cannot generate → if it ever gains a resolver and a template, repoint
  `/score/total`'s ឆ្នាំ rung at it.
- no report has `legacyHref: '/score-analyse'` → add one and the analysis screen should gain a
  document action.
- every workspace tab names a page in `PAGE_FOR` → a new door must be added there too.

---

*Phase 13 complete. Stopping here — Phase 14 is not started.*
