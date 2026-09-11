# Phase 18 — Cross-Class Student Discovery + Enrollment Policy Audit

**Repository:** `raksmeyronptec-max/Krusmart`  
**Audit branch:** `docs/phase18-student-discovery-policy`  
**Audit baseline:** `main` at `ede3474ce4b59510d99f517ca537cc91e6a55197`  
**Date:** 2026-09-11

## 1. Executive decision

### Recommendation: Policy C — Admin-assisted enrollment

KruSmart should **not** add free school-wide student discovery for teachers in Phase 18.

The teacher experience should remain:

```text
សិស្សថ្មី
  → create student
  → enroll into the active class
```

When a pupil already belongs to another class, the teacher should use the existing explicit transfer path or an administrator-assisted process. The product should not turn "find an existing pupil" into a hidden transfer mechanism.

This recommendation is based on the repository's current authorization design, not on a desire to make the search UI smaller: the current security model deliberately treats class assignment and student membership as the relationship that grants access.

## 2. Current access model

The current V2 model has four important layers:

- `students` stores the pupil identity/demographic record and still carries a legacy `teacher_id` ownership field.
- `student_enrollments` is the authoritative class-membership relationship for V2.
- `teacher_assignments` determines which teacher is assigned to which class/year.
- `resolveServerScope()` validates `?class=` against the caller's own active assignments before a page accepts the class context.

`fetchStudentsForScope()` deliberately scopes V2 rosters through `student_enrollments`, not `students.teacher_id`. This is what allows a subject teacher to see pupils created by another teacher while remaining limited to an assigned class.

Evidence: `lib/utils/serverScope.ts` documents that V2 rosters come from `student_enrollments`, and that class context is validated against the teacher's assignments.

## 3. Current authorization behavior

### Student reads

Migration `00006_students_class_access.sql` replaced the original owner-only SELECT rule with:

```text
auth.uid() = student.teacher_id
OR can_access_student(student)
```

`can_access_student()` is true only when the caller has an active teacher assignment to a class in which that pupil is actively enrolled.

The migration explicitly says this is **read access only** and does not grant teachers school-wide visibility or write access.

### Student writes

Student creation/update in `app/(main)/enrollment/actions.ts` remains owner-guarded for the `students` row. `teacher_id` is deliberately not an editable field.

This is consistent with the product distinction already established in Phase 15:

> edit does not move a pupil; transfer is a separate operation.

### Enrollment writes

Migration `00033_enrolment_requires_relationship.sql` is decisive for Phase 18.

The `student_enrollments` write policy requires both:

1. an allowed target class relationship, and
2. `can_enrol_student(student_id)`.

`can_enrol_student()` allows a caller who owns the pupil row, teaches a class the pupil is already enrolled in, or is a school administrator for the pupil's school.

The migration was specifically added to prevent a homeroom teacher from naming an arbitrary `student_id` and thereby acquiring that pupil's marks and attendance through the enrollment relationship.

## 4. Access matrix

The matrix below describes the current V2 behavior for a normal teacher account. It does not describe administrator privileges as if they were teacher privileges.

| Resource | Own roster / assigned class | Another class not assigned to teacher | Same school, unrelated class | Other school |
|---|---|---|---|---|
| Pupil name | Allowed | Denied | Denied | Denied |
| Student number | Allowed | Denied | Denied | Denied |
| Gender | Allowed | Denied | Denied | Denied |
| DOB | Allowed | Denied | Denied | Denied |
| Parent/contact fields on the student record | Allowed where the teacher can read the student record | Denied | Denied | Denied |
| Current class membership | Allowed through the authorized roster relationship | Not discoverable through student search | Not discoverable | Denied |
| Full pupil record | Allowed for an authorized class roster/read path | Denied | Denied | Denied |
| Enroll the pupil into teacher's class | Allowed only when the student relationship rules authorize it | Denied | Denied | Denied |

Important nuance: a teacher who **is assigned to both classes** legitimately has read access to both classes. That is not cross-class discovery; it is two authorized class scopes.

## 5. Database truth

`student_enrollments` has:

```text
id
student_id
class_id
academic_year_id
status
enrolled_at
left_at
```

and a uniqueness constraint on:

```text
(student_id, class_id, academic_year_id)
```

The documented status values are:

```text
active | promoted | transferred | withdrawn
```

Therefore:

- class membership is represented by an enrollment relationship, not by `students.grade`;
- one pupil cannot have the exact same class/year enrollment row twice;
- historical enrollment rows are retained;
- transfer is represented as a lifecycle event, not as a simple profile edit;
- a pupil can be associated with different classes across academic years because the academic year is part of the relationship.

## 6. Enrollment vs transfer

These remain separate operations.

### Enroll

A pupil that the teacher owns or is otherwise authorized to handle becomes active in the target class.

### Transfer

A pupil already associated with a class moves to another class through the explicit transfer workflow.

The repository's Phase 15 work explicitly preserves this distinction, and the student edit action does not mutate class membership.

## 7. Privacy analysis

A school-wide student search is materially different from the current roster model.

The current system makes a strong security statement:

> a teacher sees pupil data because the teacher has an authorized relationship to that pupil's class.

Adding unrestricted school-wide discovery would weaken that relationship by creating a new path from:

```text
teacher
  → school membership
  → arbitrary student identity
```

That would expose information about pupils the teacher does not currently teach, even if the result card showed only a name.

The minimum-data principle in the Phase 18 brief is therefore not enough on its own. The key issue is whether the teacher is authorized to learn that the pupil exists at all.

## 8. Product options considered

### Policy A — No cross-class discovery

Teachers only see pupils in their authorized roster and create new pupils when the pupil is not already present in their current class.

**Security:** strongest.  
**UX:** simple but may require administrator help when a pupil already exists elsewhere.

### Policy B — Same-school discovery

Teachers may search pupils across the school using only minimal identity fields.

**Security:** requires a new school-level discovery boundary.  
**Risk:** creates a new privacy surface even when no enrollment is completed.

### Policy C — Admin-assisted enrollment

Teachers cannot browse or search other classes. An administrator handles an existing-pupil enrollment/transfer request.

**Security:** aligns with the current relationship model.  
**UX:** preserves teacher simplicity and keeps cross-class authority explicit.

### Policy D — Controlled school-level enrollment

Teachers may discover same-school pupils under a specific permission and then either enroll or request enrollment.

**Security:** possible, but requires a carefully scoped permission, minimum-data projection, server enforcement, duplicate handling and new tests.

**Not recommended for Phase 18** because it introduces a new school-wide discovery authorization model before the product has established a business need for it.

## 9. Recommendation

### Choose Policy C for Phase 18.

Reasons:

1. The current RLS architecture is intentionally class-relationship based.
2. Migration `00033` specifically closes the exact class-only enrollment weakness that would otherwise let a teacher acquire an unrelated pupil.
3. The current student model already has an explicit transfer operation.
4. A school-wide search would create a new privacy surface independent of whether the teacher actually enrolls the pupil.
5. Phase 15 already improved the new-pupil enrollment flow, reduced unnecessary required fields, clarified class context, and made transfer explicit.
6. This avoids creating a second authorization model that future features would need to understand and maintain.

## 10. UX implication

Do **not** add this in Phase 18:

```text
ស្វែងរកសិស្សទូទាំងសាលា
```

Instead the enrollment UI should remain focused on the active class and make the two legitimate pathways obvious:

```text
សិស្សថ្មី
→ បង្កើតព័ត៌មានសិស្ស
→ បញ្ចូលក្នុងថ្នាក់នេះ
```

and, where appropriate:

```text
សិស្សនៅថ្នាក់ផ្សេង
→ បញ្ជូនទៅការផ្ទេរ / អ្នកគ្រប់គ្រង
```

The exact copy should continue to use the existing product terminology and should never imply that enrollment and transfer are the same action.

## 11. Security implications

No RLS change is required for the recommended Phase 18 decision.

Do not weaken:

- `students_select_own_or_assigned`
- `can_access_student()`
- `can_write_for_student()`
- `can_enrol_student()`
- `student_enrollments_write_assigned_or_admin`

Do not create a policy equivalent to:

```text
teacher can select all students in school
```

Do not use `profiles.school_id` as a new teacher-discovery boundary merely because the column exists. The existing codebase treats authorization as an actual role/assignment relationship.

## 12. Verification requirements

No implementation path for school-wide discovery should be added from this audit.

The following should remain regression gates:

- own assigned class can read/manage its permitted roster;
- another unassigned class cannot be enumerated by changing URL/class context;
- an unrelated same-school pupil cannot be discovered by a normal teacher;
- other-school pupil access remains impossible;
- duplicate active enrollment remains rejected;
- transfer remains explicit;
- class context cannot silently fall back to another target class;
- existing Phase 13–17 behavior remains intact.

Current repository history reports green verification around the Phase 15 / Phase 17 work, including lint, typecheck, build, offline/live verification and RLS validation. This Phase 18 change is documentation-only and should not alter those results.

## 13. Decision gate

**Implementation of school-wide student discovery: STOP.**

Phase 18 is complete as a policy/audit phase when this document is accepted as the product decision.

The next implementation work should improve the already-supported enrollment and transfer UX rather than introduce school-wide pupil browsing.

## 14. Source evidence

Primary repository evidence reviewed:

- `app/(main)/enrollment/actions.ts`
- `lib/utils/serverScope.ts`
- `supabase/migrations/00003_enterprise_v2_foundation.sql`
- `supabase/migrations/00006_students_class_access.sql`
- `supabase/migrations/00011_write_requires_relationship.sql`
- `supabase/migrations/00033_enrolment_requires_relationship.sql`
- `app/(main)/students/[id]/TransferPanel.tsx`
- Phase 15 commit `8695dba30db988f28bc3920fe9dd184ae40ce5c3`

## 15. Final principle

KruSmart should not ask:

> "How can we let teachers search more pupils?"

It should ask:

> **"What information is this teacher authorized to know, and what pupil action is this teacher authorized to take?"**

For the current product model, the smallest safe answer is:

> **Teachers manage their authorized class roster; cross-class membership changes stay explicit and administrator-assisted.**
