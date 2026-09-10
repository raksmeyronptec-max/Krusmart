# Phase 5 — Students + enrolment

**Follows** [phase4-implementation.md](phase4-implementation.md). Covers the brief's Phase 3
(§11), which [phase0-ux-audit.md](phase0-ux-audit.md) §7 predicted would be small — *"already
close"*.

**Gates:** lint clean · `tsc --noEmit` clean · **28/28 harnesses** · `next build` clean ·
**57/57 live RLS** · 42 routes still in one frame · **edit verified end-to-end in a browser
against a real database**.

Seven files changed. No route added, no migration, no formula altered.

---

## 1. What the audit found

Phase 0 was right that the structure was close. The write paths are careful — `createStudent`
and `importStudents` both create the matching `student_enrollments` row, `deleteAllStudents` is
class-scoped, active-only, owner-guarded and audited, and `revalidatePath('/student-list')` is
already in place so the brief's Scenario 2 ("student appears in roster") holds.

What it missed is that **the product could not change a pupil at all.**

```
grep "from('students')" … | grep update
→ student-list/actions.ts:176   .update({ order_index: … })     ← roster drag order
```

That was the only `students` update anywhere. Not in the teacher app, not in the admin console,
not in the parent portal. `/enrollment` is create-only; there was no `updateStudent`.

So a typo in a pupil's name had exactly one remedy: **delete them and enter them again** — which
mints a new `students.id` and orphans every score, attendance row and enrolment attached to the
old one. In a roster product, a teacher could not fix a misspelling without destroying a child's
academic history.

And `/student-list` has shown a **pencil on every row** since it was built:

```ts
else if (action === 'edit') router.push(`/students/${s.id}?edit=true`)
```

`/students/[id]` has never read an `edit` param — grep returns zero hits in both its `page.tsx`
and its `queries.ts`. The button opened a read-only page and did nothing else. It is the same
defect class this codebase names explicitly elsewhere — a claim the address bar makes that the
destination does not honour, the reason `SCORE_WORKSPACE_TABS` declares `carriesPeriod` and
`CLASS_SCOPED_ROUTES` is a checked list rather than a guess.

---

## 2. Editing a pupil

`/enrollment?student=<id>` turns the enrolment form into an editor. The same form deliberately:
thirty-odd fields across six sections with their own validation, progress and reducer, and a
second copy of it on the profile page would be exactly the drift `formState.ts` exists to
prevent.

### What an edit is *not*

**It does not move the pupil.** `updateStudent` touches no `class_id` and no
`student_enrollments` row, because *"a misplaced pupil is corrected by a transfer, not by an
edit"* is this product's existing rule and a transfer is a different operation with its own
history. The screen says so where the class name used to be, and `ClassContextBar` is absent in
edit mode — a class strip above a form that writes to no class is a claim the save ignores.

**It does not change the owner.** `teacher_id` is the guard every write in that file filters on;
an update able to set it would be a hand-over dressed as an edit. The shared field mapper
cannot express it, and the harness asserts that.

### The guard that is easy to get wrong

```ts
.update(fields).eq('id', studentId).eq('teacher_id', user.id).select('id')
…
if (!updated || updated.length === 0) return { error: '…មិនមានសិទ្ធិកែព័ត៌មានទេ' }
```

**Postgres reports a policy-blocked UPDATE as zero rows affected, not as an error.** Without
reading the result back, editing somebody else's pupil would return a success toast and change
nothing. The owner filter is applied by the query *and* by RLS (`auth.uid() = teacher_id`,
00001); this is the project's usual second guard, plus the check that makes a refusal visible.

Narrower than reading on purpose: a subject teacher may *read* a colleague's pupils — 00006
widens that deliberately — but editing one is not reading it, which is the same line
`deleteAllStudents` already draws.

### One field mapper, not two

`createStudent` extracted thirty-odd fields from `FormData` inline. Rather than write that
again, both paths now call `studentFieldsFromForm` — thirty columns extracted twice by hand is
how one path quietly stops saving a field the other still writes. `teacher_id` is deliberately
outside it.

### The draft was the trap

`/enrollment` autosaves a draft to `localStorage` and offers to restore it. Two ways that could
have corrupted an edit, both closed:

- **Never offered while editing.** The draft is a half-finished *new* pupil; restoring it over a
  real record would overwrite thirty fields with another child's details, one Save from being
  persisted.
- **Never written while editing.** Otherwise the next teacher to enrol someone would be offered
  this pupil's record back.

And a record is loaded with a new `load` action, **not** by faking a `restore`. A draft is
optional and versioned (`v`, `savedAt`) because it came out of storage; a record loaded for
editing is neither. Conflating them is what would have let an edit leak into the draft store.
`load` also forces `sameAsBirth: false` — that mirror is a data-entry convenience for a new
pupil, and switching it on over a stored record would overwrite the current address with the
birth one on the first keystroke.

### Copy that told the truth, eventually

Three places described an edit as an enrolment. The header title and description were fixed
while building; the **confirm dialog was found in the browser**, still saying
*"បង្កើតកំណត់ត្រាសិស្ស"* — create a student record — over an edit. Fixed and re-tested.

---

## 3. Two smaller gaps from §11

**Import is reachable from the roster.** It has always existed and only inside `/enrollment`, so
a teacher looking at an empty class had to open the form for adding *one* pupil to discover the
way to add forty. `/enrollment?import=1` is the entry point that screen already reads on mount;
the roster now has a door to it. Not a second importer.

**The pupil page links to their paperwork.** `ឯកសារសិស្ស` → `/print-center?category=student`,
the one index that holds it. It already offered two specific documents; the brief's §11 profile
list ends with "reports/documents", and the Print Center is where those live (§27).

The rail still shows **four** entries, not five. `verify-students.mts` §2 asserts that
deliberately — eight was a wall — and import belongs where a teacher is when they want it, not
in a menu.

---

## 4. Verification

### Added — `verify-students.mts` §5, 15 checks

An update path exists; it is owner-guarded; it reads the result back; it writes no class, no
enrolment row and no `teacher_id`; create and update share one mapper and the mapper cannot set
the guard; the roster pencil opens the editor and `?edit=true` is gone; the profile offers the
same edit; a draft is never offered *or* written while editing; the form uses `load` rather than
a faked draft; the screen says it will not move the pupil; import is reachable from the roster.

The harness also gained the comment-stripping helper from Phase 2 — its first `?edit=true` check
failed on the *comment* explaining the fix.

### Checked end-to-end, against a real database

Unlike Phase 4, this write path could be exercised properly:

| Step | Result |
| --- | --- |
| roster pencil | → `/enrollment?student=a139993d-…` |
| form | title `កែព័ត៌មានសិស្ស`, fields prefilled (`P001` / `សុខ មករា` / `Sok Makara` / `12/05/2010`), no class bar |
| edit + save | dialog reads `បញ្ជាក់ការកែព័ត៌មាន` · `កែកំណត់ត្រាសិស្សសម្រាប់` |
| database | `name_en` → `Sok Makara EDITTEST`, `updated_at` advanced |
| audit | one `student.updated` row carrying the pupil's `entity_id` |
| redirect | → `/students/<id>`, the record just changed |
| restored | edited back through the app; `Sok Makara` / `P001` / phone unchanged |

**Side effect disclosed:** this ran against the developer's local Supabase. The pupil's row is
back exactly as found, but the trail is append-only by design (00030 adds no DELETE), so **two
`student.updated` rows from this test remain in `audit_logs`** on that database. Nothing else
was written.

---

## 5. Known remaining work

1. **Test A end-to-end** — unchanged since Phase 3: generate a report and diff it against the
   screen for a seeded class. Still the only open item in the P0-1 family.
2. **Two rows for one mark** (Phase 4 §4.2) — unchanged.
3. **Transfer has no UI.** This phase drew a firm line — an edit does not move a pupil — which
   makes it worth saying plainly that *nothing else moves them either*. `student_enrollments`
   supports `promoted` / `transferred` / `withdrawn` and `/yearly-report` reads the outcome, but
   no teacher-facing screen writes a transfer. A pupil in the wrong class is now correctable in
   principle and not in practice.
4. **The pupil page's month average uses the pupil's own marked columns** (`Object.keys(marks)`)
   rather than the class denominator `periodDenominator` defines. Investigated and deliberately
   **not** changed: counting what the pupil actually holds is defensible for a pupil-record page,
   and narrowing it would blank a pupil whose marks sit under a de-selected subject while listing
   those marks directly below. It is a genuine product ambiguity, not a defect — recorded so the
   next person does not have to re-derive it.
5. **Token drift** (Phase 2 §7.1) and **print output on paper** (Phase 2 §7.3) — unchanged.
6. **CLAUDE.md's Reporting section** still contradicts its Results section on the honour
   criterion (Phase 3 §5).
