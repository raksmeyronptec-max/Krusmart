# Rollout ledger — /classroom hub, teacher class management

**This file is the handoff.** Two Claude Code accounts take turns on branch
`feat/classroom-hub`, so a session starts with no memory of the one before it.
What is done, what is next, and what was decided lives here — not in chat.

Spec: [`classroom-hub-design.md`](classroom-hub-design.md).
The prompt that drives this: [`classroom-master-prompt.md`](classroom-master-prompt.md).

## ⚠ This is a git worktree

This branch lives in a **separate directory** from the main checkout:

```
/Users/mac/Downloads/Krusmart_supabase   feat/score-period-system  ← other work, do not touch
/Users/mac/Downloads/Krusmart_classroom  feat/classroom-hub        ← you are here
```

The two branches are independent — score-period never touches
`lib/navigation.ts`, classroom never touches scoring. Do not merge one into the
other, and do not `git checkout` a different branch inside this directory.
`npm install` runs per-directory: if `node_modules` is missing here, install
before building.

Base is `cfa81fe`, *before* the score-period rollout, deliberately — that work
is blocked on migration 00029 being applied, and classroom should not inherit
that block.

## Rules

1. **One phase per session.** Take the first unchecked phase whose *Needs* are
   all ticked. Do that one. Not part of it, not two of them.
2. **One commit per phase**, subject `C<n>: <title>`. `git log --oneline` is the
   audit trail and must agree with this file.
3. **Tick the box in the phase's own commit**, as its last edit. Do not record
   commit shas here — writing a sha then amending the commit changes the sha,
   so a recorded one is always stale. `git log --oneline --grep '^C3:'` is the
   link.
4. **Write down what surprised you** in the phase's Notes — decisions the spec
   did not settle, deviations and why.
5. **Do not push. Do not merge to main.** That is the human's call.

Lane is a file-ownership grouping: **A** = `lib/`, **B** = `app/(main)/`.
Turn-taking makes it advisory, but phases in different lanes share no files.

---

## Phases

- [ ] **C0 · Lane A — Make the default class deterministic**
      **Needs:** —
      **Files:** `lib/utils/serverScope.ts:52-69`, `scripts/verify-scope.mts` (new)
      **What:** `resolveServerScope` picks the default class with
      `find(a => a.is_homeroom)` over a query carrying **no `ORDER BY`**. Today
      that is deterministic only because the onboarding wizard runs once and a
      teacher therefore has exactly one homeroom row. C4 makes multiple
      homerooms routine, and then Postgres row order decides which class a
      teacher is looking at — it can flip between requests.
      Add an explicit `.order('is_homeroom', { ascending: false })` then
      `.order('created_at', { ascending: true })`, so "default" means **the
      oldest active class**, which does not move when a new one is created.
      `?class=` still overrides, and `resolveServerScope` must keep validating
      the requested id against the caller's own assignments.
      **Accepts:** `npm run build` and `npm run lint` green; a verify script
      asserts that given several active assignments in arbitrary input order,
      the chosen class is stable and is the oldest homeroom.
      **Why first:** this is nondeterminism in the function that decides which
      scores are read and written. It must land before a second class can exist.

- [ ] **C1 · Lane A — Rename the `classroom` nav module to `facilities`**
      **Needs:** —
      **Files:** `lib/navigation.ts` (module at :215, and `MOBILE_PRIMARY_IDS`
      at :328 if it names `classroom`)
      **What:** the existing module `id: "classroom"` / label `ថ្នាក់រៀន` is
      about the *physical room* — cleaning rota, inventory, decorations. It
      becomes `id: "facilities"` / label `បរិក្ខារថ្នាក់`, `href` unchanged
      (`/cleaning-schedule`). This frees the `classroom` id and the ថ្នាក់ concept
      for C2.
      **Accepts:** no route changes, no behaviour change; sidebar, mobile nav and
      breadcrumb all still highlight correctly on `/cleaning-schedule`,
      `/inventory`, `/decorations`.
      **Watch:** `NavModule.id` is used only for React keys and active/open
      state — nothing persists it, so this is a pure rename. Confirm that before
      relying on it.

- [ ] **C2 · Lane B — `/classroom` hub**
      **Needs:** C1
      **Files:** `app/(main)/classroom/page.tsx`,
      `app/(main)/classroom/ClassroomHubClient.tsx`,
      `lib/navigation.ts` (register the new module + its children)
      **What:** a card index in the `/print-center` mould. Four cards:
      ថ្នាក់របស់ខ្ញុំ → `/classroom/classes` (C3; until then, say so rather than
      linking nowhere), សិស្សក្នុងថ្នាក់ → `/student-list`,
      បញ្ចូលសិស្សថ្មី → `/enrollment`, មុខវិជ្ជា → `/score/subjects`.
      **Accepts:** the page renders under the app shell without rendering its own
      `<TopNav />`; the new module resolves in `moduleForPath` for both
      `/classroom` and `/classroom/classes`; breadcrumb and sidebar highlight.
      **Watch:** ★ the hub **groups, it does not relocate**. Do not rename
      `/student-list` or `/score/subjects`, and do not build a second subject
      configuration screen — `/score/subjects` is the only one, which is why
      `/score/template` is already a redirect.

- [ ] **C3 · Lane B — `/classroom/classes`, read + set active**
      **Needs:** C0, C2
      **Files:** `app/(main)/classroom/classes/page.tsx`,
      `app/(main)/classroom/classes/ClassesClient.tsx`
      **What:** list the caller's own classes from `teacher_assignments`
      (`status='active'`) joined to `classes` / `grades` / `academic_years`,
      with a student count from `student_enrollments` filtered
      `.neq('status','withdrawn')` — the same rule every roster read uses, never
      `.eq('status','active')`. Each card: name, grade, year, homeroom badge,
      student count, and a "set as active class" control.
      **Accepts:** a teacher with one class sees exactly it; a legacy teacher
      with no assignments sees an empty state that explains rather than errors;
      setting the active class round-trips through `?class=`.
      **Watch:** reuse `components/ClassContextSwitcher.tsx` for the active-class
      control. Do not build a second switcher — two of them disagreeing about
      which class is selected is the failure this avoids.

- [ ] **C4 · Lane B — Create a class**
      **Needs:** C3, plus the product answer below
      **Files:** `app/(main)/classroom/classes/ClassesClient.tsx`,
      `app/(main)/classroom/classes/actions.ts`
      **What:** the three-field dialog — ឈ្មោះថ្នាក់ (required), កម្រិតថ្នាក់,
      ឆ្នាំសិក្សា. It calls the **existing** `createClassAndAssign` in
      `app/onboarding/actions.ts`.
      **Watch:** ★ **do not write a second class-creation path.** That action
      calls `backfill_teacher_enrolments()` immediately after inserting the
      assignment and rolls the class back if the backfill fails. A second writer
      is a writer that forgets the backfill and strands a v2-scoped account with
      an empty roster. If the action needs adjusting for a non-onboarding
      caller, adjust it — do not clone it.
      Assert in a verify script that a *second* call is a no-op for enrolments:
      00019 backfills only pupils with no enrolment row at all, so after the
      first class every pupil already has one. That safety is invisible from the
      call site.
      **★ BLOCKING PRODUCT QUESTION — do not pick silently.**
      `createClassAndAssign` writes `is_homeroom: true` unconditionally, and
      00025's index only enforces uniqueness per *(teacher, class, year)*. So a
      teacher can hold several homeroom rows in one year. C0 makes the default
      deterministic, but does not answer: **may a primary teacher be homeroom of
      two classes at once?** If no, this needs a unique index and a "this is my
      homeroom" choice in the dialog. Surface it and stop.

- [ ] **C5 · Lane B — Rename and archive**
      **Needs:** C4
      **Files:** `app/(main)/classroom/classes/*`
      **What:** edit the class **name only**. Grade and academic year are not
      editable — changing either changes the template that resolves and the
      meaning of marks already entered against it.
      **Watch:** ★ **no DELETE.** Archive by setting
      `teacher_assignments.status`. A class row holds scores, attendance and
      enrolments behind it; a cascade destroys them. Same contract as everywhere
      else in this product: narrowing hides, it never deletes. Archiving must
      also be refused — or warned hard — when the class is the caller's only
      active one, since that drops them back to legacy scope.

---

## Decisions log

| Date | Phase | Decision |
|---|---|---|
| 2026-08-30 | design | **`/classroom` takes the name; the old module becomes `facilities`.** The URL was free (the old module pointed at `/cleaning-schedule`), `NavModule.id` is persisted nowhere, and the old label was a misnomer — it describes the room, not the class. |
| 2026-08-30 | design | **The hub links, it does not absorb.** `/student-list` and `/score/subjects` keep their URLs. Renaming them would touch the dashboard, every back link, the RBAC redirect targets and `proxy.ts` for no user-visible gain. |
| 2026-08-30 | setup | **Built in a git worktree**, base `cfa81fe`. The main checkout had uncommitted annual-report work from another session, and classroom is independent of the score-period rollout, which is blocked on migration 00029. |
