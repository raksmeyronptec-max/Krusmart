# Phase 18 — Cross-class student discovery and enrollment policy

**Read-only audit, then one decision.** Measured against the working tree at `39a14e8`.

The question: *can a teacher find a pupil who is already in the school but belongs to another class,
and enroll that pupil into their own class?*

Everything below was **measured against a real Postgres instance** running the full migration chain,
as the `authenticated` role with a genuine `auth.uid()` — not read off policy text. The probe builds
the case `scripts/validate-rls.mjs` explicitly says it does not sweep: *"same school, different
class, no shared assignment."*

---

## 1. Current access model

### 1.1 The three predicates that decide everything

```sql
can_access_student(p)    -- SELECT
  = EXISTS (enrolment se ACTIVE for p
            JOIN teacher_assignments ta ON ta.class_id = se.class_id
            WHERE ta.teacher_id = auth.uid() AND ta.status = 'active')

can_write_for_student(p)
  = EXISTS (students s WHERE s.id = p AND s.teacher_id = auth.uid())   -- ← creator
    OR can_access_student(p)

can_enrol_student(p)     -- 00033, ANDed onto the enrolment write policy
  = can_write_for_student(p)
    OR (pupil has a school AND is_school_admin(that school))
```

And the table policies:

```sql
students_select_own_or_assigned          USING auth.uid() = teacher_id
                                               OR can_access_student(id)
                                               OR is_parent_of(id)

student_enrollments_write_assigned_or_admin  ALL, USING (and therefore WITH CHECK)
   ( homeroom of the target class OR school admin of the year's school )
   AND can_enrol_student(student_id)
```

**The boundary is not "my class". It is "a pupil I created, or a pupil I teach".**

### 1.2 Measured access matrix

One school, two teachers, one class each, one pupil each. A third teacher in a different school.
Numbers are rows actually returned to teacher **T1** (homeroom of ៤ក).

**T1 is a plain teacher** — a `teacher` grant and an assignment, no administrative role. That
distinction is load-bearing and is measured separately in §1.4.

| What T1 asks for | Own pupil (៤ក) | Colleague's pupil (៤ខ, **same school**) | Other school |
| --- | --- | --- | --- |
| pupil row by id | **1** | **0** | **0** |
| `name_kh`, `student_id` only | **1** | **0** | **0** |
| `SELECT … FROM students` (everything) | **1** | — | — |
| search by name `LIKE '%សិស្ស%'` | **1** | **0** | **0** |
| search by student number `= 'S-T2'` | — | **0** | — |
| the pupil's enrolment rows | **1** | **0** | **0** |
| `SELECT … FROM classes` | **1** (own class only) | **0** | **0** |
| `SELECT … FROM student_enrollments` | **1** | **0** | **0** |

> **A plain teacher sees their own class and nothing else** — not the pupil, not the name, not the
> student number, not even the *existence* of a colleague's class. There is no field-level leak to
> narrow, because there is no row-level access to begin with.

### 1.3 Measured write matrix

| T1 attempts | Result |
| --- | --- |
| enrol a colleague's pupil into ៤ក | **DENIED** `42501` |
| enrol an other-school pupil into ៤ក | **DENIED** `42501` |
| enrol a pupil they neither created nor teach | **DENIED** `42501` |
| re-enrol their own pupil into their own class | **DENIED** `23505` (unique) |
| **enrol a pupil they CREATED but no longer teach** | **ALLOWED** ⚠️ see §3 |

### 1.4 The administrator branch is not a leak

Both select policies carry an `is_school_admin(...)` branch, so an **owner, principal or
school_admin does see the whole school** — pupils, classes and enrolments alike. That is the policy
working as designed, and it is what makes Policy C (§4) a real route rather than a theoretical one.

It is measured alongside the denials rather than assumed, because the contrast is the whole point:

```
a plain teacher CANNOT read a colleague's pupil in the SAME school   -> 0 rows
...nor which class they are in                                       -> 0 rows
...while the school OWNER legitimately does see them                 -> 1 row
```

This also corrected a first draft of this audit. An earlier pass measured these denials as the
fixture's teacher **A**, who by that point in `validate-rls.mjs` holds `owner` in their own school —
and the checks failed, correctly. The denial belongs to the plain teacher, not to everyone.

---

## 2. Database relationships

### What makes a pupil belong to a class

`student_enrollments` — one row per (pupil, class, year), `status` `'active'`. Nothing else.
Not `students.grade`, which Phase 15 established goes stale after a transfer, and not
`students.teacher_id`, which records who *created* the row.

| Table | Role |
| --- | --- |
| `students` | the person. `teacher_id` = creator / legacy owner. `school_id` nullable. |
| `classes` | a class in a grade in an academic year |
| `teacher_assignments` | which teacher works on which class (`is_homeroom`, `status`) |
| `student_enrollments` | **the membership fact** |

### Measured invariants

```
PRIMARY KEY (id)
UNIQUE (student_id, class_id, academic_year_id)
FK student_id / class_id / academic_year_id
status  text NULL DEFAULT 'active'   -- no CHECK constraint
```

Two consequences, both measured:

* Re-inserting the *same* (pupil, class, year) is refused with `23505`. Duplicate protection within
  one class is real.
* **Nothing prevents a pupil being `active` in two different classes in the same year.** Verified:
  after inserting a second active row the pupil was simultaneously active in ៤ក and ៤ខ and appeared
  in **both teachers' rosters**.

That second point matters more than it looks. `lib/enrolment/move.ts` closes the old row *before*
opening the new one, and its own comment says the alternative would leave "the pupil inserted into
the destination while still openly enrolled". **The product already treats single active enrolment
as an invariant. The schema never says so.**

---

## 3. Privacy analysis

### What a teacher can currently learn

About a pupil in a colleague's class: **nothing at all.** Not existence, not name, not number.

About a pupil they **created**: everything, for ever — `name_kh`, `student_id`, `dob`, `phone`,
parent names, address — **even after that pupil has left their class entirely**. Measured:

```
pupil created by T1, actively enrolled ONLY in T2's class ៤ខ
T1 reads the pupil's FULL record       -> 1 row  {"name_kh":"សិស្ស ចល័ត","student_id":"S-X","dob":"2015-01-01",…}
T1 enrols them into ៤ក without asking  -> ALLOWED (1 row)
   -> pupil is now ACTIVE in: ៤ខ, ៤ក  (2 classes)
   -> T2 (original teacher) still sees them: 1 row — the pupil is in BOTH rosters
```

**F18-1 — the creator tail.** `students.teacher_id` is a permanent grant. It is *load-bearing* for
pre-V2 accounts, whose entire roster is that column and who have no enrolment rows at all, so it
cannot simply be removed.

**F18-2 — enrollment can silently become a shadow transfer.** Because the schema permits two active
enrolments, the creator path above does not *move* the pupil; it **duplicates** them. Both teachers
now mark attendance, enter scores and print reports for the same child, and neither is told. This is
precisely the confusion §6 and §34 require be impossible.

Reachability: **no application path does this.** `/enrollment` only ever creates new pupils, and its
`enrolOrCompensate` inserts enrolments only for ids it just created. The exploit needs a crafted
PostgREST request — which is exactly the kind §15 says must be refused at the server rather than by
hiding a button.

---

## 4. Product options

| | Policy | Verdict |
| --- | --- | --- |
| **A** | No cross-class discovery. Teachers see only their own roster; enrollment creates new pupils. | **This is what the product already enforces**, deliberately, by three predicates and two policies. |
| **B** | Same-school discovery with a minimal identity projection (name · number · current class). | Requires a new SELECT path across the school. Every pupil field is currently invisible across classes, so this is a **widening**, not a narrowing — the opposite of what §25 permits without a strong reason. |
| **C** | Admin-assisted: the teacher asks an administrator, who transfers. | **Already exists and already works.** `/admin/enrollments` + `moveEnrolment` under `requirePermission('enrollments:update')`; a homeroom teacher can also move a pupil between **their own** classes. |
| **D** | Controlled school-level discovery under a new permission. | Same widening as B, plus a new role concept. No evidence anyone has asked for it. |

### What problem would B actually solve?

A pupil arriving in ៤ខ who is currently in ៤ក. Under the present design that is a **transfer**, and
transfer already has a correct, audited, permission-gated implementation that closes the old
enrolment before opening the new one. B would add a second route to the same outcome — one that does
*not* close the old row, because "enroll" does not mean "move". That is how the two concepts get
conflated, which §6 forbids.

---

## 5. Recommendation

> **Policy A, explicitly, plus C where a pupil genuinely needs to move.**
>
> Do not build school-wide student search. A teacher's authorised world is the classes they are
> assigned to; a pupil who must cross that boundary crosses it by **transfer**, through the existing
> permission-gated path, not by a second teacher enrolling them.

Two consequences follow, and only the second needs code:

1. **No search UI.** §27 and §29 apply: do not leave an unfinished search concept behind, and do not
   build a UI for a capability the policy forbids.
2. **Close the gap between the intended invariant and the schema.** The product believes a pupil is
   in one class at a time — `moveEnrolment` is written as though it were true — and the database has
   never said so. That single missing constraint is what turns the creator tail from a stale read
   permission into an unconsented enrolment.

---

## 6. Security implications

| Change | Effect on the boundary |
| --- | --- |
| Partial unique index on `(student_id, academic_year_id) WHERE status = 'active'` | **Tightens.** No policy is widened, no predicate relaxed, no new SELECT path opened. It makes a second active enrolment impossible *for everyone*, including a school admin and the creator. |
| RLS policies | **Unchanged.** None added, none altered, none dropped. |
| `can_access_student` / `can_enrol_student` / `can_write_for_student` | **Unchanged.** Narrowing the creator branch would break every pre-V2 account, whose roster *is* `students.teacher_id`. |

The residual — a creator can still *read* a pupil who has left their class — is recorded as deferred
in the implementation notes. It cannot be closed without separating "legacy roster owner" from
"historical creator" in SQL, and getting that wrong makes pre-V2 rosters vanish.

`moveEnrolment` is unaffected: it closes the source row before inserting the destination, so it never
holds two active rows.

---

## 7. UX implications

**None.** No new screen, no new string, no new control.

`/enrollment` continues to mean *create a new pupil in this class*. Transfer continues to be reached
from the pupil's own page and the admin console. Because no UI path could produce a dual enrolment,
no UI path can begin to fail because one is now refused.

The Phase 15 contracts are untouched: a newly created pupil is still immediately findable, editing
still does not move a pupil, transfer is still explicit, and enrollment launched from ៤ខ still lands
in ៤ខ.

---

## 8. Decision gate

| | |
| --- | --- |
| Build school-wide student search? | **No.** |
| Build any cross-class discovery UI? | **No.** |
| Change any RLS policy? | **No.** |
| Change `students` access? | **No.** |
| Add one schema constraint expressing an invariant the code already assumes? | **Yes.** |

Implementation proceeds only for the last row. See `docs/phase18-implementation.md`.
