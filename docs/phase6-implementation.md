# Phase 6 — Classroom + curriculum

**Follows** [phase5-implementation.md](phase5-implementation.md). Covers the brief's Phases 2
and 4, which [phase0-ux-audit.md](phase0-ux-audit.md) §7 predicted as *"both recent and healthy;
polish only"*.

**Gates:** lint clean · `tsc --noEmit` clean · **28/28 harnesses** · `next build` clean ·
**64/64 live RLS** (was 57) · 42 routes still in one frame · transfer exercised end-to-end
against a real database.

One migration (**00033**), three new files, five modified.

---

## 0. A correction to Phase 5

Phase 5 §5.3 said *"no teacher-facing screen writes a transfer"* and then, loosely, that
*"nothing else moves them either"*. **The second half was wrong.** The whole lifecycle —
promote, transfer, withdraw, bulk promote — has existed since V2 in
`app/admin/enrollments/actions.ts`, is append-only, and is audited.

The accurate statement, and the one this phase acts on: those actions sit behind
`requirePermission('enrollments:update')` and the admin console's `isSchoolAdmin` gate. A
teacher who **joined** a school holds exactly `teacher` — 00022 is explicit that "approval never
grants admin" — so for them the console is not a longer route to the feature, it is a closed
door. 00031 was written for precisely that population, to let them create a class and staff
themselves onto it. They could then enrol pupils into it and not undo a misplacement.

---

## 1. Moving a pupil, from the teacher app

A pupil's class **is** their enrolment. `students.grade` is free text that goes stale the moment
anyone is promoted, and Phase 5 deliberately made an edit *not* touch the class. So without a
transfer, a misplaced pupil had one remedy: delete and re-enter, destroying the id every score
and attendance row hangs off.

`/students/[id]` now has a transfer control, rendered **inside the enrolment card, beneath the
history** — seeing `៤ក · 2025-2026 · បច្ចុប្បន្ន` directly above it is what makes it obvious the
old placement is kept rather than overwritten.

### One write, two doors

The close-then-open sequence moved to [lib/enrolment/move.ts](../lib/enrolment/move.ts) and the
admin console now calls it. The obvious alternative — write the sequence again beside the
teacher's permission check — is how two paths that mean the same thing come to differ, one of
them forgetting to close the old row, or to audit, or to handle the duplicate.

**The shared write authorises nobody**, and that is deliberate rather than an omission: a shared
write that quietly applied one caller's rule would silently widen or narrow the other. The two
callers differ *only* in who they let through:

| | Door |
| --- | --- |
| admin console | `requirePermission('enrollments:update')` |
| teacher app | homeroom of the class being left **and** of the class being joined |

For a pupil with no open enrolment — a legacy pupil — ownership of the `students` row stands in
for the class that does not exist. Without that branch, "transfer a pupil with no enrolment into
my class" would be a way to acquire one.

It always stamps `transferred`, never `promoted`: promotion is a year-end decision made across a
whole class from `/yearly-report`, and stamping one pupil's history with it because a teacher
fixed a misplacement would put a claim in the record that nobody made.

### No migration was needed for the feature

`student_enrollments_write_assigned_or_admin` (00003) has always granted `FOR ALL` to the
**homeroom** teacher of the row's class. The database has permitted this operation since V2 was
built; only the application withheld it. The action asserts exactly what RLS asserts rather than
widening anything — and asserts it in the action too, because RLS refuses an UPDATE by returning
zero rows, and the failure a teacher deserves is a sentence in Khmer rather than a success toast
over an unchanged pupil.

---

## 2. ★ A cross-tenant hole, found while proving the feature

Writing the live RLS checks for the transfer turned up something that had nothing to do with it.

**00003's enrolment write policy authorises by CLASS and never by STUDENT.**

```sql
FOR ALL USING (
    EXISTS (… ta.class_id = student_enrollments.class_id
              AND ta.teacher_id = auth.uid() AND ta.is_homeroom)
    OR EXISTS (… ay.id = student_enrollments.academic_year_id
                AND public.is_school_admin(ay.school_id))
)
```

Nothing in it mentions `student_id`. Every form master satisfies the first branch for their own
class — so **a form master could enrol any pupil whose id they could name into their own class**,
including a pupil in a different school. Demonstrated across two schools in `validate-rls.mjs`
before the fix: `201 Created`.

An enrolment row is not a label. 00006 and 00007 pivot every class-scoped read on "is this pupil
enrolled in a class I am assigned to", and 00011's `can_access_student` says the same — so
writing one is how a caller **acquires** a pupil. Enrol a stranger's child into your class and
their name, their marks and their attendance become readable.

This is the same shape 00011 described for `scores` and `attendance` — *"the write policies check
that the writer names themselves, never that they actually teach the student"* — one table
further on. 00011 fixed the two tables it was written for; this one was never revisited.

**It is pre-existing, not introduced here.** What changes is reach: until this release only the
admin console wrote enrolments, and now the teacher app has a control that does.

### 00033

The class check is kept **character-for-character** and ANDed with a relationship to the pupil,
via a new `can_enrol_student()` — 00011's `can_write_for_student` (owns the row, or teaches a
class the pupil is in) plus an administrator branch for pupils of a school they administer.

Every writer was checked against it before the policy was changed:

| Writer | Satisfied by |
| --- | --- |
| `createStudent` + `importStudents` | owns the row it just inserted |
| `transferStudentToMyClass` | pupil is in a class it is assigned to |
| admin move / withdraw / bulk promote | pupil carries the admin's `school_id` — and `/admin/enrollments` already lists only `students.school_id = <its school>`, so this is exactly the set that console can act on |
| `backfill_teacher_enrolments` | SECURITY DEFINER, bypasses RLS |

Proven, both directions, in `validate-rls.mjs` — **57 → 64 checks**:

```
ok  a form master CAN close an enrolment in their own class                    — 1 row(s)
ok  ...and open one in another class they are form master of
ok  a SUBJECT teacher of a class CANNOT enrol into it ← homeroom, not assigned  — 42501
ok  a teacher in another school CANNOT close A's pupil's enrolment              — 0 rows
ok  ...nor pull them into their own class  ← 00033                              — 42501
ok  a teacher CAN enrol a pupil they own (createStudent's own write)
ok  a colleague who is not form master CANNOT enrol into the shared class        — 42501
```

**Not applied to the developer's database.** `validate-rls.mjs` builds a throwaway database from
every migration in order, so 00033 is proven to execute and to behave — but changing the schema
of a running dev environment is the owner's call, not mine.

### A harness bug this exposed

The first run reported two failures, one of which was my own test's fault: by the time the
transfer section runs, teacher **A holds the `owner` role** (granted for the join-request
section), so the policy's admin branch carried them and the homeroom requirement was never
exercised. The check now uses **E**, who holds exactly `teacher`. Worth recording because the
same trap will catch the next person adding to that file: fixture identities accumulate roles as
the script proceeds.

---

## 3. What the brief asked for that is already there

Audited rather than assumed:

- **Class card** (§10) — class, grade, level, year, homeroom badge, pupil count, subject count.
  Missing from the brief's list: score completion and attendance summary. Deliberately **not**
  added: the card is built from exactly two queries however many classes a teacher holds, and
  both figures are per-class-per-period reads. That is an N+1 on the one page whose whole design
  is that it has none. Recorded in §5.
- **Archive** (§10) — exists, per assignment rather than per class (`assignmentIds`), which is
  why "never delete historical classroom records" holds: the `classes` row is never touched.
  00031's creator-DELETE is bounded by `class_is_unused()`, so a class with a pupil in it cannot
  be deleted at all.
- **Curriculum layering** (§12) — `system` / `school` / `class` with the lowest layer winning per
  `subject_key`, `class_template_subjects` for what a class actually teaches, and
  `/score/subjects` as the single configuration surface. Phase 3 already gave it the workspace
  header and Phase 2 the page frame. No defect found.

---

## 4. Verification

### Added

| Harness | Section | Proves |
| --- | --- | --- |
| `validate-rls.mjs` | teacher-side transfer (new) | the seven checks above, including the 00033 denial and that the legitimate paths survive |
| `verify-students.mts` | §6 (new) | the sequence lives in one module; both callers use it; neither re-implements the close; the shared write authorises nobody; the admin door is the permission and the teacher door is homeroom of both ends; ownership stands in with no enrolment; the old row is closed not deleted; a blocked close is not a success; a teacher transfer never stamps `promoted` |
| `verify-migrations.mts` | window | extended to 00033 |

### Exercised end-to-end

Signed in as the `primary_ranking_teacher` fixture — chosen because it is the one dev account
holding **two** homeroom classes, which is what the feature needs.

| Step | Result |
| --- | --- |
| `/students/<id>` | panel renders inside the enrolment card, under `៤ក · 2025-2026 · កំពុងរៀន` |
| picker | offers exactly `២ក` — the teacher's other homeroom class, current class excluded |
| confirm | "ផ្ទេរ សុខា ទៅ ២ក? ការចុះឈ្មោះចាស់នឹងត្រូវរក្សាទុកជាប្រវត្តិ" |
| database | `៤ក → transferred` with `left_at` set, `២ក → active` — **two rows, history kept** |
| audit | `enrollment.transferred` carrying both `old_value` and `new_value` |

**Side effect disclosed.** The pupil's enrolment rows were restored to exactly as found (one
active row in ៤ក). As in Phase 5, the `audit_logs` entry from the test remains — the trail is
append-only by design (00030 adds no DELETE).

---

## 5. Known remaining work

1. **00033 is not applied to the dev database.** It is validated and behaviourally proven in a
   throwaway one. Applying it is a one-line `supabase db push` and the owner's call.
2. **Completion and attendance on the class card** (§3) — wanted by the brief, deliberately
   deferred because the honest implementation is a per-class-per-period read and the card's
   design is two queries total. Doing it well probably means one aggregate query, not one per
   card.
3. **Test A end-to-end** — unchanged since Phase 3.
4. **Two rows for one mark** (Phase 4 §4.2) — unchanged.
5. **Token drift** (Phase 2 §7.1) and **print output on paper** (Phase 2 §7.3) — unchanged.
6. **CLAUDE.md's Reporting section** still contradicts its Results section on the honour
   criterion (Phase 3 §5). CLAUDE.md also does not yet mention 00032, 00033, `ClassContextBar`,
   the `results` module or the transfer — its migration table stops at 00031. Worth a
   documentation pass before the next phase.
