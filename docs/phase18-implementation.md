# Phase 18 — Cross-class student discovery: the decision, and one constraint

Implements `docs/phase18-student-discovery-audit.md`, measured against `39a14e8`.

---

## 1. The decision

> **Policy A. No cross-class student discovery. No search UI.**
>
> A teacher's authorised world is the classes they are assigned to. A pupil who must cross that
> boundary crosses it by **transfer**, through the existing permission-gated path — never by a second
> teacher enrolling them.

This is not a new restriction. It is what the product already enforces, measured against a real
Postgres instance as the `authenticated` role:

| A plain teacher asks for… | Rows returned |
| --- | --- |
| a colleague's pupil in the **same school**, by id | **0** |
| that pupil's name and student number, searched by number | **0** |
| which class that pupil is in | **0** |
| that the colleague's class exists at all | **0** |
| to enrol that pupil into their own class | **DENIED** `42501` |

There is no field-level disclosure to minimise, because there is no row-level access to minimise
from. §9's "privacy-minimising search design" has nothing to design: the minimum is already zero.

**A school owner, principal or school_admin does see the whole school**, through the
`is_school_admin(...)` branch of both select policies. That is the policy working, and it is what
makes admin-assisted transfer (Policy C) a real route. It is now measured alongside the denials so
the contrast is a checked fact rather than an assumption.

### What was NOT built, deliberately

No school-wide search. No student directory. No "existing pupil" tab on `/enrollment`. No new Khmer
strings. No new screen, control or permission. §27 and §29: do not build a UI for a capability the
policy forbids, and do not leave an unfinished search concept behind.

---

## 2. The one thing that did need fixing

The audit did not set out to find a defect. It found one by asking the question precisely.

**`can_enrol_student` grants on `students.teacher_id` — the creator.** That grant is correct and
cannot be removed: `teacher_id` is the legacy roster column, and a pre-V2 account's entire roster is
that column with no enrolment rows at all. Narrowing it would make those rosters vanish.

What was missing was the *invariant*. Measured, before the fix:

```
pupil created by T1, actively enrolled ONLY in T2's class ៤ខ
T1 reads the pupil's FULL record       -> 1 row  {"name_kh":"សិស្ស ចល័ត","student_id":"S-X","dob":"2015-01-01",…}
T1 enrols them into ៤ក without asking  -> ALLOWED
   -> pupil is now ACTIVE in ៤ខ AND ៤ក
   -> T2 still sees them: the pupil is in BOTH rosters
```

`UNIQUE (student_id, class_id, academic_year_id)` stops a pupil being enrolled into the **same** class
twice. It says nothing about two **different** classes. So the write above was not a transfer — it
was a **duplicate**. Two teachers marking attendance, entering scores and printing reports for one
child, neither told about the other.

That is exactly the conflation §6 and §34 require be impossible: *"enrol an existing pupil" silently
became "also put them in my class"*.

**The product already believed the invariant.** `lib/enrolment/move.ts` closes the source row before
inserting the destination, and says why in its own comment. Every roster read takes
`status = 'active'` to name exactly one class. The table never said so.

### Migration `00035_one_active_enrolment.sql`

```sql
CREATE UNIQUE INDEX student_enrollments_one_active_per_year
    ON public.student_enrollments (student_id, academic_year_id)
 WHERE status = 'active' OR status IS NULL;
```

* **Partial, on purpose.** A pupil's history is a stack of closed rows — `promoted`, `transferred`,
  `withdrawn` — every one sharing the pupil and the year with the row that replaced it. Constraining
  all statuses would make history unrecordable, and `enrolmentHistory()` exists to read it.
* **NULL counts as active**, matching the column default. A NULL-status row is an open enrolment
  whatever wrote it.
* **It raises rather than repairs.** A pupil recorded in two classes is a question only a human can
  answer — which class is the real one — and guessing would silently discard a teacher's roster. The
  migration names the affected pupils and changes nothing. The local database was checked first:
  zero violations.
* **Idempotent**, and verified as such.

### Why this is a tightening, not a widening

| | |
| --- | --- |
| RLS policies added / altered / dropped | **none** |
| `can_access_student` / `can_enrol_student` / `can_write_for_student` | **unchanged** |
| New SELECT path across classes or schools | **none** |
| Who the constraint binds | **everyone** — teacher, creator, school admin, crafted request |

---

## 3. What the constraint immediately caught

Applying it broke `scripts/validate-rls.mjs` in two places. Both were the harness depending on the
absence of the invariant, and both are now better checks.

**1. A class was made non-empty by borrowing another class's pupil.** To prove "a creator cannot
delete a class once a pupil is enrolled", the fixture enrolled `A.st` — already actively enrolled in
`A.k` — into `kE`. It now creates a pupil of its own. Same assertion, no borrowed pupil.

**2. The teacher-side transfer check was not testing a transfer.** It ran the close and the open in
two separate `as()` blocks, and `as()` rolls back — so the open ran against a pupil who was still
actively enrolled in the source class. It passed only because nothing forbade a second active
enrolment; what it actually proved was that a form master could **duplicate** a pupil. Close and open
now run in one block, which is what `moveEnrolment` does and what a transfer is.

A constraint that finds two latent assumptions in the security harness on the day it lands is doing
its job.

---

## 4. Files changed

| File | Change |
| --- | --- |
| `supabase/migrations/00035_one_active_enrolment.sql` | **new** — the partial unique index |
| `scripts/validate-rls.mjs` | cross-class discovery section (10 checks); two fixture corrections above |
| `docs/phase18-student-discovery-audit.md` | **new** — the audit and the decision |
| `docs/phase18-implementation.md` | **new** |

No application code changed. No component, action, route, string or type. No RLS policy.
Attendance was not touched.

---

## 5. Verification

| Gate | Before | After |
| --- | --- | --- |
| `npm run lint` | clean | clean |
| `npm run typecheck` | clean | clean |
| `npm run verify` | 33/33 | **33/33** |
| `npm run verify:live` | 36/36 | **36/36** |
| `node scripts/validate-rls.mjs` | 71/71 | **80/80** |
| `npm run build` | clean | clean |

The RLS total rose by nine and did not decrease, as §30 requires.

### New behavioural checks

```
cross-class discovery (Phase 18)
  ok  a plain teacher CANNOT read a colleague's pupil in the SAME school      — 0 row(s)
  ok  ...not even name and number, searched by student number
  ok  ...nor which class they are in                                          — 0 row(s)
  ok  ...nor that the colleague's class exists                                — 0 row(s)
  ok  ...while the school OWNER legitimately does see them  ← is_school_admin  — 1 row(s)
  ok  a plain teacher CANNOT enrol a colleague's pupil into their own class    — 42501
  ok  a pupil CANNOT be actively enrolled in two classes at once  ← 00035      — 23505
  ok  ...while a TRANSFER — close the old row, then open the new — still works
  ok  ...and a pupil's closed history stays recordable                         — 2 row(s)
```

Cross-school denial was already swept and still passes (`42501`).

---

## 6. Browser acceptance

Live stack, fixture teacher, with `00035` applied.

| Case | Result |
| --- | --- |
| **Create a pupil** from `/enrollment?class=<៤ខ តេស្ត>` | Created and enrolled **into ៤ខ តេស្ត** — the class in `?class=`, not the default. One active enrolment. The Phase 15 class-context contract holds. |
| **Transfer** that pupil ៤ខ តេស្ត → ៤ក | Destination picker offered only the teacher's **other** classes, excluding the pupil's current one. Confirmation named both pupil and destination and promised history would be kept. Result: old row `transferred` with `left_at` set, new row `active` in ៤ក, **exactly one active enrolment**, history intact. |
| Dual-active pupils in the database, at every step | **0** |

The test pupil was deleted afterwards; the database is back to 36 enrolments.

---

## 7. Remaining known issues

* **The creator tail persists for READS.** A teacher who created a pupil can still read that pupil's
  full record — name, number, DOB, phone, parents, address — after the pupil has left their class.
  `00035` closes the *enrolment* exploit but not this. Fixing it means separating "legacy roster
  owner" from "historical creator" in SQL, and getting that wrong makes pre-V2 rosters vanish. It
  needs its own phase, its own migration and its own live-data check. **Deferred, not overlooked.**
* **`student_enrollments.status` is free `TEXT` with no `CHECK`** — the same shape Phase 17 closed on
  `attendance.status`. Values in use are `active`, `promoted`, `transferred`, `withdrawn`. Out of
  scope here; a candidate for the same treatment.
* **`backfill_teacher_enrolments` has `ON CONFLICT (student_id, class_id, academic_year_id)`**, which
  targets the older unique constraint. Its own `NOT EXISTS (any enrolment row)` guard makes a
  collision unreachable except under genuine concurrency, where it would now raise `23505` on the new
  index instead of being swallowed — and `createClassAndAssign` already rolls the class back when the
  backfill fails. Behaviour under that race is safe; noted so it is a known interaction.

## 8. Deferred

| Item | Why |
| --- | --- |
| Same-school pupil search (Policy B/D) | Rejected. It is a **widening** of a boundary that is currently total, to solve a problem transfer already solves correctly. Reopening needs a product reason that transfer does not serve. |
| Narrowing the creator's read grant | See §7. Needs its own phase. |
| `CHECK` on `student_enrollments.status` | Same treatment as `00034`, different table, different phase. |
