# Master prompt — /classroom rollout

Paste the block below **verbatim** into whichever Claude Code account is active,
**with that account's working directory set to `/Users/mac/Downloads/Krusmart_classroom`**
(the worktree), not the main checkout.

It is stateless and idempotent: safe to paste again after an interruption, a
context compaction, or a switch between accounts. It carries no phase number —
the session works out where it is from
[`classroom-progress.md`](classroom-progress.md).

**Do not edit the prompt to say "now do C4".** Naming the phase in the prompt is
how the ledger and reality drift apart. The ledger decides.

---

```
You are continuing a multi-session rollout on branch feat/classroom-hub.
Two Claude Code accounts take turns on it, so you have NO memory of prior
sessions. The repository is the only source of truth.

⚠ WORKTREE. This branch lives in /Users/mac/Downloads/Krusmart_classroom, a git
worktree separate from the main checkout at /Users/mac/Downloads/Krusmart_supabase
(branch feat/score-period-system, which has unrelated uncommitted work in it).
Confirm your working directory before touching anything. Never `git checkout` a
different branch in this directory, never merge the two branches, and never edit
files in the other directory. `node_modules` is per-directory — if it is missing
here, `npm install` before building.

STEP 1 — ORIENT. Read, in this order:
  docs/classroom-progress.md     ← the ledger: what is done, what is next
  docs/classroom-hub-design.md   ← the spec: decisions, route shape, the blocker
  CLAUDE.md and AGENTS.md        ← repo conventions
Then run `pwd`, `git branch --show-current`, `git log --oneline -12` and
`git status` to confirm the ledger matches reality. If they disagree, STOP and
report the discrepancy — do not guess.

STEP 2 — PICK EXACTLY ONE PHASE. Take the first unchecked phase in the ledger
whose "Needs" are all ticked. Announce which one you picked and why.
Do exactly that phase. Not part of it, not two of them. Scope creep across a
handoff is how the ledger goes stale and the next account gets lost.

STEP 3 — IMPLEMENT, following docs/classroom-hub-design.md. It is the
specification; do not re-derive the design or substitute your own.

  ★ FIVE INVARIANTS:

  CL-1  ONE CLASS-CREATION PATH. `createClassAndAssign` in
        app/onboarding/actions.ts is it. That action calls
        backfill_teacher_enrolments() right after inserting the assignment and
        rolls the class back if the backfill fails — because the assignment is
        what flips the account to v2 scope, where the roster comes from
        student_enrollments. A second writer is one that forgets the backfill
        and leaves a v2 account with an empty roster. Adjust that action if a
        non-onboarding caller needs it; never clone it.

  CL-2  THE HUB GROUPS, IT DOES NOT RELOCATE. /student-list, /enrollment and
        /score/subjects keep their URLs. Renaming them touches the dashboard,
        every in-page back link, the RBAC redirect targets and proxy.ts for no
        user-visible gain. And /score/subjects is the ONLY subject-configuration
        screen — that is why /score/template is already a redirect. Do not build
        a second one.

  CL-3  NO DELETE ON A CLASS. Archive via teacher_assignments.status. A class
        row has scores, attendance and enrolments behind it and a cascade
        destroys them. Narrowing hides; it never deletes.

  CL-4  DEFAULT-CLASS RESOLUTION MUST BE DETERMINISTIC. Never reintroduce a
        selection over an unordered query. `?class=` overrides, and
        resolveServerScope must keep validating the requested id against the
        caller's own assignments — a forged ?class= cannot widen access.

  CL-5  REBRAND-COMPATIBLE. KruSmart is becoming KrouDigital 4.0, and brand
        colour lives in app/globals.css under @theme inline. Use ONLY semantic
        tokens (bg-brand, text-brand-contrast, bg-bg-surface, border-divider,
        text-text-heading/-body/-muted). No hex, no raw gray-*, and no hardcoded
        product name in a new page. Do NOT restyle this page toward the new
        brand ahead of the rest of the app — half an app in each brand reads as
        a bug. The rebrand is its own rollout.

  Roster reads filter `.neq('status','withdrawn')`, never `.eq('status','active')`
  — past years are stamped promoted/transferred and filtering on active renders
  every historical class empty.

  Reuse what exists — do not write a second version of: resolveServerScope,
  ClassContextSwitcher, requirePermission, auditLog, components/ui/* (no native
  <select>, no hand-rolled pager). A new (main) page must NOT render its own
  <TopNav /> — the layout owns it. New user-facing strings are Khmer.

STEP 4 — VERIFY. Run `npm run build` (this is how type errors surface; there is
no test framework) and `npm run lint`. Run any scripts/verify-*.mts the phase
touches or adds. Paste the real output. If something fails, say so plainly — do
not report a phase complete on a red build.

STEP 5 — COMMIT AND HAND OFF, as the last actions of the phase:
  a. Tick the phase in docs/classroom-progress.md and record anything the next
     account needs: decisions you made, surprises, deviations and why.
  b. One commit for the whole phase, subject line `C<n>: <phase title>` — the
     ledger tick goes in that same commit. Do not record shas in the ledger;
     the subject line is the link.
  c. STOP. Report: phase completed, what changed, what the next phase is, and
     any question the next account must answer before starting it.

Do not start the next phase. Do not push. Do not merge to main.
```

---

## If a session goes wrong

- **Wrong directory.** If `pwd` is the main checkout, stop immediately and
  change to the worktree. Do not "fix" it by checking out `feat/classroom-hub`
  in the other directory — git will refuse while that tree is dirty, and forcing
  it would destroy another session's work.
- **Ledger and `git log` disagree.** Believe `git log`: read the commit, then
  fix the ledger to match it in its own commit before starting a phase.
- **A phase was left half-done and uncommitted.** `git status` shows it. Finish
  that same phase or `git restore` it — do not start a different one on a dirty
  tree.
- **The build is red on arrival.** That is the previous session's phase. Fix it
  and amend that phase's commit rather than opening a new one.
- **`node_modules` missing or the build cannot resolve a package.** This
  worktree has its own; run `npm install` here.
- **The spec turns out to be wrong.** Say so, fix
  `classroom-hub-design.md` as part of the phase, and note it in the ledger.
  The design is the spec, but the spec is allowed to learn.

## When all six phases are done

`/classroom` ships independently of the score-period branch — they touch
disjoint files. Merge order between them does not matter. Before merging this
one, exercise it in the browser: create a second class, confirm the active-class
switcher and `?class=` agree, confirm `/score/enter` and `/student-list` follow
the selection, and confirm archiving the only active class warns rather than
silently dropping the teacher back to legacy scope.
