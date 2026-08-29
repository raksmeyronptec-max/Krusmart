# Master prompt — score-period rollout

Paste the block below **verbatim** into whichever Claude Code account is active.
It is stateless and idempotent: safe to paste again after an interruption, a
context compaction, or a switch between accounts. It carries no phase number —
the session works out where it is from
[`score-period-progress.md`](score-period-progress.md).

**Do not edit the prompt to say "now do P4".** Naming the phase in the prompt
is how the ledger and reality drift apart. The ledger decides.

---

```
You are continuing a multi-session rollout on branch feat/score-period-system.
Two Claude Code accounts take turns on this branch, so you have NO memory of
prior sessions. The repository is the only source of truth.

STEP 1 — ORIENT. Read, in this order:
  docs/score-period-progress.md         ← the ledger: what is done, what is next
  docs/score-period-and-entry-design.md ← the spec: invariants and data model
  docs/score-period-prompts.md          ← the per-phase implementation brief
  CLAUDE.md and AGENTS.md               ← repo conventions
Then run `git log --oneline -12` and `git status` to confirm the ledger matches
reality. If they disagree, STOP and report the discrepancy — do not guess.

STEP 2 — PICK EXACTLY ONE PHASE. Take the first unchecked phase in the ledger
whose "Needs" are all ticked. Announce which one you picked and why.
Do exactly that phase. Not part of it, not two of them. Scope creep across a
handoff is how the ledger goes stale and the next account gets lost.

STEP 3 — IMPLEMENT. Follow the matching brief in docs/score-period-prompts.md.
It is the specification; do not re-derive the design or substitute your own.

  ★ FOUR INVARIANTS. Breaking any one silently corrupts existing marks:

  INV-1  scores.score_period = `${monthId}-${academicYear}` is SCHEMA. It is
         parsed back in at least five places (lib/reporting/report-data.ts:449,
         app/(main)/students/[id]/queries.ts, attendance/yearly, record-book,
         parent-report). A merged period stores under an ANCHOR — an existing
         MonthId, the first month of the period in academic-year order.
         NEVER invent a key like 'mar_apr'. Merging changes labels and
         membership only.

  INV-2  Zero configuration rows must reproduce today's behaviour exactly.
         DEFAULT_CALENDAR lives in code, not as a seed — same principle as
         "a class with no selection resolves the full template".

  INV-3  The calendar overrides as a WHOLE SET (copy-on-write all 12 rows),
         unlike score_template_subjects which overrides per row. It is a
         partition of 12 months, not independent rows.

  INV-4  Dates drive defaults and locking. They are never part of a key, and
         changing one never moves a mark.

  ★ Khmer word scores. The four sem_eval_* columns store Khmer words in
    score_text (migration 00012). Any clamp or numeric coercion MUST pass them
    through untouched — a bare parseFloat writes NULL under a success toast,
    which is the exact bug 00012 fixed.

  ★ Narrowing never deletes a mark. Merging months, hiding columns, dropping a
    subject — all hide, none delete. Same contract as enabled_columns in 00028.

  ★ The client is not the boundary. Every rule enforced in a React component
    must also be enforced in the server action.

  Reuse what exists — do not write a second version of: resolveServerScope,
  resolveServerGradingContext (returns maxByColumn, lib/utils/serverScope.ts:442),
  resolveTemplate / maxScoreByColumn, splitScoreCell, requirePermission,
  auditLog, components/ui/* (no native <select>, no hand-rolled pager).
  New user-facing strings are Khmer.

STEP 4 — VERIFY. Run `npm run build` (this is how type errors surface; there is
no test framework) and `npm run lint`. Run every scripts/verify-*.mts the phase
touches or adds, the way the existing ones are invoked. Paste the real output.
If something fails, say so plainly — do not report a phase complete on a red
build.

STEP 5 — COMMIT AND HAND OFF, as the last actions of the phase:
  a. Tick the phase in docs/score-period-progress.md and record anything the
     next account needs: decisions you made, surprises, deviations from the
     brief and why.
  b. One commit for the whole phase, subject line `P<n>: <phase title>` --
     the ledger tick above goes in that same commit. Do not record shas in the
     ledger; the subject line is the link.
  c. STOP. Report: phase completed, what changed, what the next phase is, and
     any question the next account must answer before starting it.

Do not start the next phase. Do not push. Do not merge to main.
```

---

## If a session goes wrong

- **Ledger and `git log` disagree.** The prompt says stop. Believe `git log`:
  read the commit, then fix the ledger to match it in its own commit before
  starting any phase.
- **A phase was left half-done and uncommitted.** `git status` shows it. Either
  finish that same phase or `git restore` it — do not start a different one on
  top of a dirty tree.
- **The build is red on arrival.** That is the previous session's phase, not
  yours. Fix it and amend that phase's commit rather than opening a new one.
- **A brief turns out to be wrong.** Say so, fix the brief in
  `score-period-prompts.md` as part of the phase, and note it in the ledger.
  The design docs are the spec, but the spec is allowed to learn.
