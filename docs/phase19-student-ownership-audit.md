# Phase 19 — Student Ownership / Membership Audit

**Read-only audit, then one decision.** Measured against the working tree at `75b2c73`.

Everything in the matrices below was executed against a real Postgres instance running the full
migration chain, as the `authenticated` role with a genuine `auth.uid()`. Nothing is inferred from
policy text.

---

## 1. Current model

```
students ────────────────┐
  teacher_id  ───────────┼──> creator, legacy roster owner, AND sole write authority
  school_id              │
                         │
student_enrollments ─────┴──> the membership fact (one active row per pupil per year, 00035)
  class_id
  academic_year_id
  status  active | promoted | transferred | withdrawn

teacher_assignments ─────────> which teacher works on which class (is_homeroom, status)
```

---

## 2. `students.teacher_id` semantics

It is doing **four** jobs at once:

| Job | Where |
| --- | --- |
| creator tag | written by `createStudent`, never changed afterwards |
| legacy roster membership | `fetchStudentsForScope` legacy branch; `resolveActor.hasLegacyRoster` |
| **sole write authority** | `students` UPDATE and DELETE policies are `auth.uid() = teacher_id` and **nothing else** |
| a branch of enrolment/score/attendance authority | `can_write_for_student` → `can_enrol_student` |

The third is the surprise. `students` has no class-based write branch at all:

```sql
"Teachers can update their own students" [UPDATE]  USING (auth.uid() = teacher_id)
"Teachers can delete their own students" [DELETE]  USING (auth.uid() = teacher_id)
```

## 3. `student_enrollments` semantics

The membership fact, and the only one. `UNIQUE (student_id, class_id, academic_year_id)`, plus
Phase 18's partial unique index enforcing **one active enrolment per pupil per year**. History is a
stack of closed rows (`promoted` / `transferred` / `withdrawn`), which is why that index is partial.

## 4. `teacher_assignments` semantics

Teacher → class, with `is_homeroom` and `status`. It never references a pupil. A teaching
relationship to a *pupil* is always the two-hop join `teacher_assignments → class ← enrolment`.

---

## 5. Current access matrix

**Pupil P: created by T1, actively enrolled only in T2's class ៤ខ.** Measured.

| Actor | READ | EDIT | DELETE | SCORE | ATTEND | ENROL |
| --- | --- | --- | --- | --- | --- | --- |
| **creator, transferred away** (T1) | ✅ | **✅** | **✅** | ✅ | ✅ | authorised¹ |
| **current homeroom, not creator** (T2) | ✅ | **❌** | **❌** | ✅ | ✅ | authorised¹ |
| current subject teacher (T3) | ✅ | ❌ | ❌ | ✅ | ✅ | denied `42501` |
| same-school unrelated (T4) | ❌ | ❌ | ❌ | denied | denied | denied `42501` |
| **school admin** | **❌** | ❌ | ❌ | denied | denied | authorised¹ |
| other school | ❌ | ❌ | ❌ | denied | denied | denied `42501` |

¹ returns `23505`, i.e. the policy allowed it and Phase 18's invariant refused the duplicate.
Isolated against a pupil with no active enrolment, the policy result is: creator ✅, admin ✅,
current homeroom ❌, subject ❌, unrelated ❌.

Control — pupil Q, created by T1 and still in T1's own class: T1 gets ✅ on everything; an unrelated
same-school teacher gets ❌ on everything.

What the departed creator can still read, in full:

```json
{"name_kh":"សិស្ស ប៉ែន","student_id":"S-P","dob":"2015-01-01","phone":"012000111","father_name":"ឪពុក ប៉ែន"}
```

Three rows of that table are worth stating in words:

* **The teacher currently responsible for the child cannot correct the child's record.** T2 edits →
  `0 rows updated`. They can read the phone number and not fix it.
* **The creator who no longer teaches the child can edit and delete them**, indefinitely.
* **A school admin cannot read `students` rows at all.** `students_select_own_or_assigned` has no
  `is_school_admin` branch, unlike `student_enrollments`. *(This corrects a sentence in
  `docs/phase18-student-discovery-audit.md` §1.4, which said an owner sees "pupils, classes and
  enrolments alike". Enrolments and classes: yes. Pupil rows: no.)*

---

## 6. Legacy vs V2

Legacy account — `teacher_id` roster, no assignment, no enrolment. Measured:

| Operation | Result |
| --- | --- |
| read own roster | ✅ |
| edit a pupil | ✅ |
| create another | ✅ |
| write a score | ✅ |
| write attendance | ✅ |
| another teacher reads it | ❌ |

**Legacy is fully functional and entirely dependent on the `teacher_id` branch.** Removing it
removes the roster, the writes and the reads of every pre-V2 account at once.

## 7. Creator vs owner vs current teacher

The system models three of the four concepts and conflates two of them:

| Concept | Modelled by | Distinct today? |
| --- | --- | --- |
| creator | `students.teacher_id` | not distinguishable from owner |
| owner (write authority) | `students.teacher_id` | **same column** |
| current teaching relationship | assignment + active enrolment | yes |
| historical relationship | closed enrolment rows | yes, and unused by authorization |

So *creator* and *owner* are one column, and the **current teaching relationship carries no write
authority over the pupil record at all**.

---

## 8. Transfer behaviour — the defect this audit found

`moveEnrolment` is **two PostgREST calls**, not one transaction: close the source, then insert the
destination. `student_enrollments_write_assigned_or_admin` requires
`(homeroom of the row's class OR school admin) AND can_enrol_student(student_id)`, and
`can_enrol_student` resolves through `can_access_student`, which requires an **active** enrolment.

Closing the source destroys the caller's own authorisation before the second call runs.

Measured, as two committed statements exactly as the app issues them. T2 is homeroom of **both**
classes and did not create the pupil:

```
before        : [{"name":"៤ក","status":"active"}]
step 1 close  : OK (1 row)
step 2 open   : DENIED 42501
after step 2  : [{"name":"៤ក","status":"transferred"}]

>>> the pupil now has 0 ACTIVE enrolment(s).
>>> DROPPED OFF EVERY ROSTER — invisible to every roster read in the product.

T2 tries to undo (reopen ៤ក): OK (0 row)
```

Three things make this serious rather than theoretical:

1. **It is reachable.** `transferStudentToMyClass` checks only that the caller is homeroom of the
   source and of the destination. It never checks who created the pupil, so the application's own
   authorisation is **more permissive than RLS**, and the mismatch surfaces as damage instead of a
   clean refusal.
2. **`moveEnrolment` does not compensate.** It guards carefully against step 1 being policy-blocked
   ("A policy-blocked UPDATE is zero rows affected, not an error") but has no recovery for step 2
   failing after step 1 succeeded.
3. **The teacher cannot undo it.** Reopening the source row is also `0 rows`: the UPDATE's `USING`
   clause re-evaluates `can_enrol_student`, which is now false. Only the creator or a school admin
   can repair it — and the teacher has no way to know that.

It works today only when the transferring teacher also created the pupil. That is the case in the
fixture and was the case in Phase 18's browser test, which is why it has not been seen.

### 8b — a second orphaning path, found while proving the first

The same damage is reachable **without any policy being involved at all**, by every teacher
including the pupil's own creator.

`UNIQUE (student_id, class_id, academic_year_id)` (00003) does not mention `status`. A closed row
occupies a class as firmly as an open one. So a teacher who moves a pupil ៤ក → ៤ខ and then moves
them back is asking to insert a row that already exists — and the refusal arrives *after* step 1 has
closed the source. Measured, as the two committed statements the app issues:

```
--- move ៤ក -> ៤ខ ---
close A: {"ok":true,"n":1}
open  B: {"ok":true,"n":1}
state: [{"name":"៤ក","status":"transferred"},{"name":"៤ខ","status":"active"}]

--- move BACK ៤ខ -> ៤ក (the teacher corrects their mistake) ---
close B: {"ok":true,"n":1}
open  A: {"ok":false,"code":"23505","msg":"duplicate key value violates unique constraint"}
state: [{"name":"៤ក","status":"transferred"},{"name":"៤ខ","status":"transferred"}]
>>> ACTIVE enrolments: 0
```

`moveEnrolment` reports `សិស្សនេះមានការចុះឈ្មោះក្នុងថ្នាក់នេះរួចហើយ` — "already enrolled in this class" —
which is true of the *closed* row and reads, to the teacher, as "nothing happened". Something did:
the pupil is now on no roster.

This is not an authorization defect and 00036 does not fix it. It is the same missing property one
layer up: **the two halves of a move are two committed transactions, and the second one failing must
not leave the first one standing.**

## 9. Authorization helper analysis

```sql
can_access_student(p)  = active enrolment in a class the caller actively teaches
can_write_for_student(p) = students.teacher_id = auth.uid()   ← creator branch
                           OR can_access_student(p)
can_enrol_student(p)   = can_write_for_student(p) OR is_school_admin(pupil's school)
```

| Helper | Consumed by | Blast radius of a change |
| --- | --- | --- |
| `can_access_student` | `students` SELECT, `scores` SELECT | reads |
| `can_write_for_student` | `scores` and `attendance` INSERT/UPDATE/DELETE | mark writes |
| `can_enrol_student` | **`student_enrollments` write — one policy, nothing else** | enrolment writes only |

The creator branch in `can_write_for_student` is **required** for legacy: a pre-V2 teacher has no
enrolment, so `can_access_student` is false and marks would become unwritable.

## 10. RLS analysis

RLS is the boundary and behaves correctly for every cross-tenant case: an unrelated same-school
teacher and an other-school teacher are refused every operation on every table. Nothing in this
audit found a leak. What it found is the opposite shape — **authority that is missing where the
product needs it, and retained where the product no longer needs it.**

## 11. Application usage inventory

| File | Usage | Current meaning | Required meaning | Change? |
| --- | --- | --- | --- | --- |
| `lib/utils/serverScope.ts:126` | legacy roster read | legacy membership | unchanged | no |
| `lib/utils/serverScope.ts:231` | `countRecoverableLegacyStudents` | migration/recovery | unchanged | no |
| `lib/rbac/actor.ts:59,105` | `hasLegacyRoster` | legacy detection | unchanged | no |
| `student-list/actions.ts:24,65,100,176` | second guard on writes | authorization belt | unchanged | no |
| `enrollment/actions.ts:79` | compensating-delete guard | authorization belt | unchanged | no |
| `enrollment/actions.ts:414,502` | edit/update scope | **owner = creator** | eventually "current teacher" | **later** |
| `students/[id]/actions.ts:167` | legacy ownership fallback in transfer | creator/history | unchanged | no |
| `cleaning-schedule/page.tsx:45` | client roster read | legacy-shaped | unchanged | no |

Classification: A = legacy-only, D = authorization belt, F = recovery. **No application file treats
`teacher_id` as *current* membership** — the conflation lives entirely in SQL.

---

## 12. Options considered

| | Option | Verdict |
| --- | --- | --- |
| **A** | Keep everything as it is | Rejected: §8 is a live data-damaging defect. |
| **B** | V2-only authorization branch (legacy → `teacher_id`, V2 → assignment + enrolment) | **The right eventual shape**, but it cannot be done first — see §13. |
| **C** | Migrate legacy ownership into enrolment rows | Rejected for now: it is the largest possible change, and `backfill_teacher_enrolments` already exists as an *opt-in* recovery precisely because interrupting a working legacy account risks live data. |
| **D** | New explicit `created_by` column separate from `teacher_id` | Rejected for now: a column split solves naming, not authority. Every policy would still have to choose which column to trust, which is the actual decision, and it can be made without a schema change. |

---

## 13. Recommendation

### On the phase's own question — narrowing the creator's authority: **DO NOT IMPLEMENT YET.**

The creator branch cannot be narrowed today, because **nothing else currently grants the authority it
is carrying**:

* `students` UPDATE/DELETE have **no** class-based branch. Narrowing the creator branch would leave
  a pupil's record editable by *nobody* once the creator moved on.
* Transfer already fails for a non-creator (§8). Removing the creator branch would make it fail for
  everyone, not fewer people.
* Legacy accounts are entirely dependent on it (§6).

The safe ordering is forced, and it is the deliverable of this audit:

```
1. give the CURRENT teacher the authority their role implies      ← this phase, partially
2. widen `students` UPDATE to the current homeroom teacher          ← next phase
3. only then narrow the creator branch, legacy-guarded             ← after 2 is proven
```

Doing 3 before 1 and 2 removes capability without replacing it.

### On the defect the audit found: **IMPLEMENT, minimally.**

Step 1 of that ordering, scoped to the single thing that is damaging data today: **a teacher must be
able to finish a transfer they were allowed to start.**

`can_enrol_student` gains one branch — the caller is homeroom of a class in which this pupil holds an
enrolment row, of any status. Nothing else changes.

Why this is the smallest correct fix:

* It touches **one function**, consumed by **one policy** (`student_enrollments` writes). Reads are
  untouched; `can_access_student` and `can_write_for_student` are untouched; `scores` and
  `attendance` are untouched.
* It grants the teacher exactly the relationship they demonstrably had a moment earlier — the
  relationship the transfer itself just closed.
* It removes the application/RLS mismatch: `transferStudentToMyClass` authorises "homeroom of both
  ends", and after this so does the database.
* It also makes the orphan state **recoverable** by the teacher who caused it — and it is what
  authorises the compensation described next.

### And on §8b: **IMPLEMENT, in the application.**

The second path needs no policy change and must not get one — the refusal is a unique constraint
doing its job. What was missing is in `lib/enrolment/move.ts`:

1. **Revive rather than insert.** The destination row is looked up *before* the source is closed; if
   the pupil has been in that class this year, that row is reopened instead of a second one being
   inserted. This is the only option that does not require a schema change, and it costs one thing,
   recorded at the call site: the earlier stint's `left_at` is cleared, so a pupil who leaves a class
   and returns within one academic year reads as never having left. Keeping both stints needs a
   second row, which that UNIQUE forbids — a schema decision, not a bug fix, and out of scope here.
2. **Compensate.** Every path that returns after step 1 now reopens the source first. Without it,
   *any* future failure of the second half strands the pupil silently.

The compensation is authorised by exactly the branch 00036 adds, which is why the two belong in one
change: reopening the row the move just closed is the same act the migration exists to permit.

---

## 14. Security implications

| | |
| --- | --- |
| Policies added / dropped | none |
| Read access | **unchanged** — `can_access_student` untouched, `students` SELECT untouched |
| `scores` / `attendance` authority | **unchanged** — `can_write_for_student` untouched |
| Cross-school | **unchanged** — still `42501`; the new branch requires an assignment in the pupil's own class |
| Cross-class discovery | **unchanged** — Phase 18's Policy A holds; this grants no ability to *find* a pupil |
| Phase 18's one-active-enrolment invariant | **unchanged** — 00035 is untouched and still refuses a second active row |

The widening, stated precisely: *a teacher who is homeroom of a class a pupil holds any enrolment row
in may enrol that pupil into a class they are also homeroom of.* Both halves are required — the
policy's own `is_homeroom` test on the target class is unchanged — so this cannot reach a pupil the
teacher has never taught, and it cannot displace a pupil from a class the teacher does not hold,
because closing that row still requires being its homeroom teacher.

## 15. Migration implications

One `CREATE OR REPLACE FUNCTION`. No table, column, index or data change. No backfill. Reversible by
replacing the function with its previous body.

## 16. Verification results

| | Baseline (`75b2c73`) | After |
| --- | --- | --- |
| `npm run lint` | clean | clean |
| `npm run typecheck` | clean | clean |
| `npm run verify` | 33/33 | **33/33** |
| `npm run verify:live` | 36/36 | **36/36** |
| `npm run build` | ok | ok |
| `node scripts/validate-rls.mjs` | 80/80 | **103/103** |

No check was removed, weakened or renamed. The twenty-three added RLS checks are:

| Added check | Proves |
| --- | --- |
| close the source row of a pupil you did not create | step 1 was always allowed — the defect is step 2 |
| ...and CAN then open the destination | **the fix**; this failed `42501` before 00036 |
| ...leaving exactly one active enrolment | 00035 still binds |
| a form master with NO enrolment row still cannot enrol | the branch cannot reach an untaught pupil |
| ...and another school still cannot | no cross-tenant widening |
| ...and 00036 granted no new READ | reads are untouched |
| a FORMER form master cannot take back a pupil active elsewhere | displacement is refused, by 00035 |
| ...nor free them by closing a row of a class they do not hold | and cannot route around it |
| a SUBJECT teacher of the class holding the closed row gains nothing | `is_homeroom` is load-bearing |
| the destination row is already there, closed | §8b's 23505 is set up, not assumed |
| close the source again | |
| ...and REVIVE the old row rather than inserting a second | **the §8b fix** |
| ...leaving exactly one active enrolment | |
| ...while a second row in that class is still refused | reviving is necessary, not stylistic |
| the school owner does NOT see the pupil row itself | §5's surprising finding, measured |
| the legacy account really is pre-V2 | the scenario is set up, not assumed |
| their roster still appears | |
| ...they can still CREATE a pupil | |
| ...and EDIT one | |
| ...and write a MARK | the owner branch of `can_write_for_student` |
| ...and write ATTENDANCE | |
| ...while another teacher still reads none of it | legacy is not a hole |
| ...and none of it came from a class relationship | `can_access_student` is `false` throughout |

**Each new assertion was mutation-tested rather than merely observed to pass.** The two 00036 checks
were run against the unfixed schema and fail (`42501`, `0 active enrolments`); removing
`AND ta.is_homeroom` from 00036 flips the subject-teacher check to `true`. A check that cannot fail
proves nothing.

`scripts/verify-migrations.mts` was widened from `000(18–33)` to `000(18–36)`. Its window had
stopped short of 00034, 00035 and 00036, so the three newest migrations were being checked by
nothing — and widening it immediately found that **00034 and 00035 document no rollback**, which is
now fixed in both headers. 16 → 19 files, 77/77.

### Legacy safety (§20 of the brief — mandatory)

Measured against a pre-V2 account: `teacher_id` roster, no assignment, no enrolment row. This had no
coverage at all before — the mandatory test of the brief was also the one thing the RLS validator
never exercised — so it is now a permanent section of `scripts/validate-rls.mjs` rather than a
one-off run, and the last check in it asserts `can_access_student` is `false` throughout, i.e. that
the account really is running on the legacy branch and not passing by accident.

| | Baseline | After |
| --- | --- | --- |
| roster appears | ✅ | ✅ |
| read a pupil | ✅ | ✅ |
| create a pupil | ✅ | ✅ |
| edit a pupil | ✅ | ✅ |
| write a score | ✅ | ✅ |
| write attendance | ✅ | ✅ |
| another teacher reads it | ❌ | ❌ |

Unchanged, and structurally so: 00036 **adds** a disjunct and removes none, so no predicate that was
true before is false now. `can_access_student` and `can_write_for_student` — the two functions the
legacy path actually runs through — were not edited.

## 17. Decision gate

| | |
| --- | --- |
| Narrow `students.teacher_id`'s authorization role | **DO NOT IMPLEMENT YET** — ordering in §13 |
| Widen `students` UPDATE to the current teacher | **NOT THIS PHASE** — next step of that ordering |
| Add a `created_by` column | **NO** |
| Change `can_access_student` or `can_write_for_student` | **NO** |
| Fix the transfer authorization gap in `can_enrol_student` | **YES** — migration 00036 |
| Fix the return-transfer orphaning in `moveEnrolment` (§8b) | **YES** — application only, no SQL |
| Build any discovery UI | **NO** — Phase 18 stands |

### What shipped

| | |
| --- | --- |
| `00036_finish_a_transfer_you_may_start.sql` | one `CREATE OR REPLACE FUNCTION`; one new disjunct |
| `lib/enrolment/move.ts` | revive-not-insert, plus compensation on every post-close return |
| `scripts/validate-rls.mjs` | +23 behavioural checks (80 → 103), incl. the first pre-V2 legacy section |
| `scripts/verify-students.mts` | +2 checks pinning the two `move.ts` properties |
| `scripts/verify-migrations.mts` | window widened to cover 00034–00036 |
| `00034`, `00035` | rollback notes added — no behaviour change |

No table, column, index or policy was created, altered or dropped. No data was migrated. Nothing in
navigation, attendance, scoring, reporting or class selection was touched, and no UI was added.

### Deliberately left for a later phase

Both are in §13's ordering and neither is a regression introduced here:

* **`students` UPDATE/DELETE remain creator-only.** The teacher currently responsible for a child
  still cannot correct that child's record, and the departed creator still can. This is the phase's
  own headline question, and §13 explains why narrowing the creator branch **before** widening
  `students` UPDATE would leave the record editable by nobody.
* **The revive loses a within-year return stint's `left_at`.** Recorded at the call site; fixing it
  properly means reconsidering 00003's UNIQUE, which is a schema decision.
