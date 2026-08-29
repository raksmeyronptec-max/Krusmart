# Rollout ledger — score periods, entry clamp, locking

**This file is the handoff.** Two Claude Code accounts take turns on branch
`feat/score-period-system`, so a session starts with no memory of the one
before it. What is done, what is next, and what was decided along the way lives
here — not in anyone's chat history.

Spec: [`score-period-and-entry-design.md`](score-period-and-entry-design.md).
Per-phase briefs: [`score-period-prompts.md`](score-period-prompts.md).
The prompt that drives this: [`score-period-master-prompt.md`](score-period-master-prompt.md).

## Rules

1. **One phase per session.** Take the first unchecked phase whose *Needs* are
   all ticked. Do that one. Not part of it, not two of them.
2. **One commit per phase**, subject `P<n>: <title>`. `git log --oneline` is the
   audit trail; it must agree with this file.
3. **Tick the box in the phase's own commit**, as its last edit. A phase that
   is done but unticked is indistinguishable from one that was never started.
   Do not record commit shas here: writing a sha into a file and then amending
   the commit changes the sha, so a recorded one is always stale. The subject
   line convention is the link — `git log --oneline --grep '^P4:'` finds a
   phase's commit.
4. **Write down what surprised you** in the phase's Notes. Deviations from the
   brief, decisions the brief did not settle, anything the next account would
   otherwise rediscover the hard way.
5. **Do not push. Do not merge to main.** That is the human's call.

Lane is a file-ownership grouping: **A** = `lib/`, migration, reporting;
**B** = `app/(main)/` screens. Turn-taking makes it advisory, but if two
accounts ever do overlap in time, phases in different lanes share no files.

---

## Base

- [x] **Base commit** — WIP committed, branch created
      `cfa81fe` Print center, reporting engine and the score-period design
      Branch `feat/score-period-system` cut from it.

- [x] **P—: rollout harness** — this ledger + the master prompt

---

## Phases

- [x] **P0 · Lane B — Retire `FALLBACK_ACADEMIC_YEAR`**
      **Needs:** —
      **Files:** `app/(main)/record-book/page.tsx:37`,
      `app/(main)/score-analyse/page.tsx:30`,
      `app/(main)/student-tracking/page.tsx:31`,
      `app/(main)/score/print/page.tsx:46`,
      `app/(main)/print-student-age/page.tsx:32`,
      `lib/constants/academic.ts` (docstring only — keep the export)
      **Accepts:** `npm run build` green; no `FALLBACK_ACADEMIC_YEAR` reference
      left under `app/`; no other file changed.
      **Why first:** the calendar is keyed by academic year. Building it on top
      of a default year of `'2023-2024'` doubles the cost of every later debug.
      **Notes:** Exactly as briefed — the five call sites were the only
      references under `app/`, each the same
      `settings?.academic_year || FALLBACK_ACADEMIC_YEAR` shape, swapped to
      `getCurrentAcademicYear()`. The export stays with a `@deprecated` JSDoc.
      No surprises; build and lint green.

- [x] **P1 · Lane B — `clampScoreCell` + four call sites**
      **Needs:** —
      **Files:** `lib/utils/score-value.ts` (new function beside `splitScoreCell`),
      `app/(main)/score/enter/ScoreEnterClient.tsx` (`handleScoreChange:357`,
      `applyBulk:533`, `copyFromPreviousMonth:483`),
      `app/(main)/score/enter/ScoreEntryGrid.tsx`,
      `app/(main)/score/enter/ScoreEntryList.tsx`,
      `app/(main)/score/enter/actions.ts` (`saveScores` — the real boundary),
      `scripts/verify-clamp.mts` (new)
      **Accepts:** typing `11` in a /10 cell shows `10`; calling `saveScores`
      directly with `'11'` still stores `10`; a `sem_eval_*` cell holding `ល្អ`
      round-trips into `score_text` with `score_value` NULL;
      `verify-clamp.mts` green.
      **Watch:** a bare `parseFloat` here re-creates the exact bug migration
      00012 fixed — NULL written under a success toast.
      **Notes:** `clampScoreCell` uses the same `Number`-not-`parseFloat` rule
      as `splitScoreCell`, so Khmer ratings pass through; in-range values come
      back exactly as typed (`'1.'` keeps its point). One deliberate narrowing
      on the server side, recorded in the decisions log: `saveScores` clamps
      only columns the resolved template defines a max for — homework saves
      through the same action, and over-max homework marks are a documented
      warning, not an error (`markIssue` in `homework/enter/scores.ts`).
      `onPaste` on the numeric cells intercepts Excel's trailing tab/newline
      (which a number input silently rejects) and routes the first cell's text
      through the same clamped `onChange`. `verify-clamp.mts`: 18/18 green;
      build, lint, `verify-score-total.mts` all green.

- [x] **P2 · Lane A — `lib/scores/calendar.ts` (pure, no behaviour change)**
      **Needs:** —
      **Files:** `lib/scores/calendar.ts` (new),
      `lib/scores/semester.ts` (`monthsForSemester` becomes one line),
      `scripts/verify-calendar.mts` (new)
      **Accepts:** `DEFAULT_CALENDAR` reproduces today exactly —
      `periodKeysForSemester(DEFAULT_CALENDAR,'sem1')` is
      `['nov','dec','jan','feb','mar']`; `verify-calendar.mts` **and** the
      untouched `verify-score-total.mts` / `verify-reporting.mts` all green.
      **Watch:** derive the split from `MONTHS_BY_ACADEMIC_YEAR`, never a
      hand-typed list — that is how the original both-semesters bug happened
      (see the header of `semester.ts`). No caller changes in this phase.
      **Notes:** Three things P3 needs to know. (1) **`ScoreCalendarPeriodRow`
      is defined and exported in `calendar.ts`**, not `lib/types.ts` — the pure
      module cannot wait for the migration phase; P3 should *re-export* it from
      `lib/types.ts` (`export type { ScoreCalendarPeriodRow } from
      './scores/calendar'`), not redefine it. (2) `calendar.ts` imports
      `SemesterId` from `semester.ts` **type-only**, and `semester.ts` imports
      `DEFAULT_CALENDAR` back at value level — the cycle is safe precisely
      because the first edge is erased at runtime; keep it type-only. (3)
      `FIRST_SEMESTER_LENGTH` moved into `calendar.ts` (module-local, nothing
      else imported it). `rowToPeriod` drops only rows with an unusable anchor
      (impossible via the app-write path — Postgres `anchor_is_member` +
      `validateCalendar` guard it); a valid period is never dropped, since that
      would hide its months' marks. `verify-calendar.mts` 29/29;
      `verify-score-total` / `verify-reporting` / `verify-clamp` untouched and
      green; build + lint green.

- [x] **P3 · Lane A — Migration 00029 + server resolver + hook**
      **Needs:** P2
      **Files:** `supabase/migrations/00029_score_calendar_periods.sql` (new),
      `lib/types.ts` (`ScoreCalendarPeriodRow`),
      `lib/utils/serverScope.ts` (`fetchScoreCalendar`, beside
      `fetchScoreTemplate`),
      `lib/hooks/useScoreCalendar.ts` (new, modelled on `useScoreTemplate.ts`)
      **Accepts:** migration applies clean locally; a class with zero rows
      resolves `DEFAULT_CALENDAR`; RLS copied from `class_template_subjects`
      in 00028 — no new policy shape; PostgREST grants not forgotten.
      **Watch:** `locked_at` / `locked_by` are created here but unused until P6.
      No screen consumes any of this yet.
      **Notes:** ⚠ **The migration was NOT applied locally** — this machine has
      no Docker, so no local Supabase stack exists. The SQL is a close copy of
      00016's policy shapes (select-visible minus the system branch,
      school-write, class-write) and 00028's framing; whoever first has a
      running stack should apply it and run the header's VERIFICATION queries.
      Deviations from the §11.3 DDL, both additive: a `member_months_valid`
      CHECK (`member_months <@ ARRAY[12 month ids]`) making an invented key
      like `'mar_apr'` unrepresentable at the DB layer (INV-1), and
      `academic_year` documented as the *label* string, stored because school
      rows have no class to imply the year. `lib/types.ts` **re-exports**
      `ScoreCalendarPeriodRow` from `calendar.ts` per P2's note. Server:
      `fetchScoreCalendar(scope, academicYear = getCurrentAcademicYear())` —
      the year is the label, never the year row's UUID. Client:
      `useScoreCalendar` reads the table with the **browser client** (the
      `SchoolContext` precedent) rather than a server action, because P3's file
      list has no actions file and RLS is the boundary either way; it waits for
      class+school+year contexts, falls back to `DEFAULT_CALENDAR`, and guards
      its `.or()` string with the same UUID regex as `serverScope.ts`. Build,
      lint, all four verify scripts green.

- [x] **P4 · Lane B — `វគ្គពិន្ទុ` tab + calendar actions**
      **Needs:** P2, P3
      **Files:** `app/(main)/score/subjects/ScoreSubjectsClient.tsx`,
      `app/(main)/score/subjects/calendarActions.ts` (new)
      **Accepts:** merging មីនា+មេសា persists and survives reload; `score_period`
      still reads `mar-<year>`; April's existing marks are hidden, not deleted;
      posting an overlapping partition straight to the action is refused.
      **Watch (two things):**
      (a) `ScoreSubjectsClient.tsx:392` already has a `role="tablist"` — it is
      the **score-type** switch (monthly/semester). Periods are not
      score-type-specific, so `វគ្គពិន្ទុ` is a *top-level* section switch
      above it, not a third button inside it.
      (b) ★ **Unresolved product question — surface it, do not pick silently.**
      `/score/subjects` guards on any class assignment, but rewriting the
      calendar re-grades every semester average for the class. Should an
      ordinary assigned teacher be allowed to, or only a homeroom teacher /
      school admin?
      **Notes:** Question (b) was put to the product owner and answered —
      see the decisions log. The timeline lives in a colocated
      `ScoreCalendarSection.tsx` (not on the P4 file list, but
      `ScoreSubjectsClient.tsx` is already 890 lines and P6's file list says
      `score/subjects/*`); the section switch in `ScoreSubjectsClient` is a
      top-level tablist above the score-type one, per Watch (a). The editor
      stages every change in a local draft and saves the whole set once
      (INV-3); merge/disable confirm with the real orphan-mark count from
      `countScoresForMonths`; a cross-boundary merge proposes the boundary
      move automatically (rule 1); the anchor is never a choice (rule 2 —
      `normalise()` client-side, refused server-side if wrong). The server
      action re-validates with `validateCalendar` and preserves `locked_at`/
      `locked_by` across the copy-on-write (a save must not clear a lock).
      Year handling: the tab edits the year `useScoreCalendar` resolves (the
      app's current year) — the mock's year *selector* is not built; follow-up
      if teachers need to pre-configure next year. ⚠ Browser acceptance
      (merge persists, `score_period` stays `mar-<year>`, April's marks
      hidden-not-deleted) still needs a running stack with 00029 applied —
      same blocker P3 recorded. The refusal path (overlapping partition posted
      straight to the action) is enforced by `periodsFromInput` →
      `validateCalendar`. Build, lint, all four verify scripts green.

- [x] **P5a · Lane A — Calendar into totals and reporting**
      **Needs:** P2, P3
      **Files:** `lib/reporting/report-data.ts:509`,
      `app/(main)/score/total/ScoreTotalClient.tsx:255`,
      `scripts/verify-reporting.mts`
      **Accepts:** for a class with a customised calendar, `/score/total`'s
      semester average equals the same pupil's average on a generated
      `ranking_semester`; for a class with none, every number is identical to
      the pre-P2 build.
      **Watch:** this closes the existing screen-vs-paper divergence. Do **not**
      make legacy `/ranking` read the calendar — it keeps `sem1 = nov–mar` on
      purpose; half-migrating it spreads the disagreement.
      **Notes:** `MonthlyClassData` now carries `scope` (joining
      `rosterIds`/`teacherId` under the existing "carried so a caller can run a
      second query without re-scoping" contract) so `resolveRankingSemester`
      calls `fetchScoreCalendar(base.scope, year)` without re-resolving.
      `/score/total` seeds `selectedSemesterMonths` from
      `periodKeysForSemester(calendar, semester)`, with the re-seed keyed on
      the seeded *value* (`semester:keys`) — the calendar arrives async, so a
      configured class re-seeds once its rows resolve, while an unconfigured
      class resolves the default (same keys as the initial state) and never
      re-seeds; the teacher's temporary view-override (ខែបូកបញ្ចូល dialog)
      survives until semester or calendar changes, as before. The dialog still
      lists all 12 months deliberately — it is a *view* override, so a teacher
      can peek at an absorbed month's coursework without editing the calendar.
      Legacy `/ranking` and `homework/enter/period.ts` untouched, per Watch.
      New verify-reporting section pins screen ≡ paper: the screen's inline
      seed computation replicated verbatim against `monthlyComponent` on a
      merged calendar. Build, lint, all four verify scripts green.

- [x] **P5b · Lane B — Calendar into the entry picker**
      **Needs:** P2, P3
      **Files:** `app/(main)/score/enter/ScoreEnterClient.tsx`
      **Accepts:** the month picker lists periods by `labelKm` with
      `ScorePeriod.key` as the value, so `scorePeriod` at `:146` is unchanged
      in shape; the default comes from `periodForDate` instead of the hardcoded
      `'nov'` at `:101`; an absorbed month no longer appears as a choice.
      **Notes:** `month` became a *derived* value over new `selectedMonth`
      state — the same pattern as `subject`/`selectedSubject` in the same file
      — so a stale `?month=` naming an absorbed month resolves to the
      absorbing period's anchor, and downstream (`scorePeriod`, the URL sync,
      the header label) needed no shape change. The default seeds from
      `periodForDate(DEFAULT_CALENDAR, today)` (the class's calendar arrives
      async; the derivation re-maps once it lands); a month in no period falls
      back to today's period. One consumer beyond the brief:
      `previousMonth` → `previousPeriod` — "ចម្លងពីខែមុន" now walks the
      calendar, because after a merge ឧសភា's predecessor is the merged period
      whose marks live under its anchor; walking `MONTHS_BY_ACADEMIC_YEAR`
      would have read the absorbed month's hidden cells. P6 note: the entry
      screen now has `activePeriod` in scope, whose `locked` flag is exactly
      what the read-only grid needs. Build, lint, all four verify scripts
      green.

- [x] **P6 · Lane B — Period locking**
      **Needs:** P3, P4, P5b
      **Files:** `app/(main)/score/enter/ScoreEnterClient.tsx`,
      `app/(main)/score/enter/actions.ts`,
      `app/(main)/score/subjects/*`
      **Accepts:** a locked period renders read-only; `saveScores` refuses a
      write to it even when called directly; a locked period cannot be merged,
      split or moved between semesters; every lock and unlock appears in
      `audit_logs`.
      **Watch:** no RLS policy on `scores` for this yet — the server check is
      enough until several teachers really share one class, and a policy on the
      score write path costs on every upsert. Record that trade-off in the
      header comment.
      **Notes:** The trade-off is recorded in `score/enter/actions.ts`'s
      header, as instructed. `saveScores` matches the lock by *membership*,
      not key — a direct write to an absorbed month (`apr` inside a locked
      merged mar-apr) is refused too; only monthly periods lock (semester /
      annual / homework periods never parse as a month). Locking follows the
      P4 calendar-edit gate (homeroom + admin); unlocking is `isSchoolAdmin`
      only, per the brief — a self-serve owner unlocks their own class, which
      is right because there is no one else. First lock on an inherited
      calendar *materialises* the resolved calendar as class rows with the
      lock applied (resolution unchanged — the copy is what was resolving).
      Lock/unlock are direct writes, disabled while the draft is dirty, and
      audited as `score_calendar.locked`/`unlocked`. Entry views gained a
      `readOnly` prop (cells disabled); `handleScoreChange` is the choke
      point for typing/paste/selects, bulk & copy buttons are disabled, and
      the banner names where to unlock. ⚠ Browser acceptance still needs a
      running stack with 00029 applied (the P3/P4 Docker blocker). Build,
      lint, all four verify scripts green. **All eight phases complete.**

---

## Decisions log

Anything settled mid-rollout that the design docs do not already say. Date it
and name the phase it came out of.

| Date | Phase | Decision |
|---|---|---|
| 2026-08-29 | harness | **No commit shas in this ledger.** The first draft asked each phase to write its sha into its row and amend it in — which rotates the sha and makes the recorded one wrong immediately. The `P<n>:` subject line is the link instead: `git log --oneline --grep '^P4:'`. |
| 2026-08-29 | P4 | **Only the homeroom teacher or a school admin may edit a class's period calendar** — product owner's decision, asked and answered during P4. A subject teacher sees the `វគ្គពិន្ទុ` tab read-only: rewriting the calendar re-grades every pupil's semester average across all subjects, including colleagues'. Enforced in `calendarActions.ts` (`calendarEditContext`, fail-closed). Note: 00029's RLS still allows any actively-assigned teacher to write class rows (the 00028 shape) — the action is the enforced boundary, like `requirePermission` everywhere else; tightening RLS to homeroom-only would be a follow-up migration if direct-PostgREST writes ever matter. |
| 2026-08-29 | P1 | **The server clamp skips columns the template does not define.** `saveScores` also serves homework (`/homework/enter` imports it), and over-maximum homework marks are a *documented product decision* — a warning, not an error (`markIssue` in `homework/enter/scores.ts`: "a school marking homework out of twenty is not doing anything illegal"). `hw_*` columns resolve no template max, so they pass through unclamped; every monthly/semester template column — the actual bug — is clamped. The client keeps its 10-point UI fallback for unknown columns, unchanged from the existing `max` attribute behaviour. |
