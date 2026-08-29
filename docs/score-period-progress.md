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

- [ ] **P0 · Lane B — Retire `FALLBACK_ACADEMIC_YEAR`**
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
      **Notes:**

- [ ] **P1 · Lane B — `clampScoreCell` + four call sites**
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
      **Notes:**

- [ ] **P2 · Lane A — `lib/scores/calendar.ts` (pure, no behaviour change)**
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
      **Notes:**

- [ ] **P3 · Lane A — Migration 00029 + server resolver + hook**
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
      **Notes:**

- [ ] **P4 · Lane B — `វគ្គពិន្ទុ` tab + calendar actions**
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
      **Notes:**

- [ ] **P5a · Lane A — Calendar into totals and reporting**
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
      **Notes:**

- [ ] **P5b · Lane B — Calendar into the entry picker**
      **Needs:** P2, P3
      **Files:** `app/(main)/score/enter/ScoreEnterClient.tsx`
      **Accepts:** the month picker lists periods by `labelKm` with
      `ScorePeriod.key` as the value, so `scorePeriod` at `:146` is unchanged
      in shape; the default comes from `periodForDate` instead of the hardcoded
      `'nov'` at `:101`; an absorbed month no longer appears as a choice.
      **Notes:**

- [ ] **P6 · Lane B — Period locking**
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

---

## Decisions log

Anything settled mid-rollout that the design docs do not already say. Date it
and name the phase it came out of.

| Date | Phase | Decision |
|---|---|---|
| 2026-08-29 | harness | **No commit shas in this ledger.** The first draft asked each phase to write its sha into its row and amend it in — which rotates the sha and makes the recorded one wrong immediately. The `P<n>:` subject line is the link instead: `git log --oneline --grep '^P4:'`. |
