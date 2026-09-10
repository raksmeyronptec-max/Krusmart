# Phase 11 — Administration and teachers

**Follows** [phase10-implementation.md](phase10-implementation.md). Covers the brief's Phases 18
and 19, and closes Phase 0's **P0-3**, the last open finding from the original audit.

**Gates:** lint clean · `tsc --noEmit` clean · **31/31 harnesses** · `next build` clean ·
**64/64 live RLS checks** against a real database.

No migration. One screen deleted, one redirect added, five harness checks.

---

## 1. ★ P0-3, finally closed — and not the way it was planned

`/administration` rendered `MOCK_SCHOOL_STATS`, `MOCK_TEACHERS` and `MOCK_TEACHER_DETAIL`: an
invented school of **1,250 pupils at 95.5% attendance**, three named teachers, and a per-teacher
radar chart scoring each of them on សិស្សពូកែ and ជួយសិស្សខ្សោយ.

Phase 1 hid the row from navigation. That stopped it being *offered*; it never stopped it being
*reached*, which is the brief's own §19 — **navigation visibility is not security**. A principal
typing the URL still got fiction.

Phase 0 §10 assumed this phase would wire it to the real aggregates, and `lib/navigation.ts`
carried a note saying so. **Inspecting the data settled it the other way.** Of the six headline
figures `app/admin/queries.ts` can compute two:

| figure | source |
| --- | --- |
| total pupils, attendance rate | `getSchoolStats` ✓ |
| pass rate | every pupil's annual result, school-wide — not implemented |
| dropout risk | **no definition anywhere in this product** |
| teacher-effectiveness radar | two invented axes, no source |

Manufacturing definitions for those is precisely what §35 forbids — the UI must not become the
business-logic layer — and wiring half while inventing the rest leaves a screen that is true in
places, which is worse than one that is plainly a mock.

### Why a redirect

`/admin/dashboard` is already the real version: the same school-wide counters computed from the
administrator's own school, plus the audit feed, behind the console's own role gate. Rebuilding
`/administration` would have created the second mental model the brief's §18 warns about —
"my class" versus "manage teachers and assignments" — on purpose.

So it follows `/score/template` → `/score/subjects` and `/classroom/classes` → `/classroom`: the
URL keeps working, nothing that links here breaks, the row stays declared `hidden` so
`moduleForPath` resolves a breadcrumb mid-redirect, and there is **one** school overview.

The actor check stays and runs **first**. `/admin`'s layout would refuse a non-administrator
anyway, but bouncing a parent through the admin tree to find that out is a worse answer than
refusing at the door. Confirmed live: as the fixture teacher, both `/administration` and
`/admin/dashboard` land on `/dashboard`.

---

## 2. Teacher management, verified

The brief's Phase 18 tree, against `app/admin/teachers/`:

| leg | state |
| --- | --- |
| teacher list | ✓ `TeachersTable`, one row per assignment |
| class assignment | ✓ `assignTeacher`, permission-gated and audited |
| subject assignment | ✓ `AssignSubjectFields`, labelled through `listAssignableSubjects` — the same function the other picker uses, so the two surfaces cannot name a subject differently |
| removal | ✓ `removeAssignment`, wired in an earlier phase |
| teacher profile | — `teacher_profiles` exists; no admin-side view |
| **permissions** | — **not built, deliberately** |

A role editor grants and revokes access. Building one late in a session, on a surface whose whole
point is authorisation, is the kind of change that should be specified and reviewed on its own —
§19 and §27 are explicit that authorisation stays in RLS and the RBAC utilities. Recorded, not
attempted.

---

## 3. The boundary, proved rather than asserted

Brief §19 asks that authorisation stay in RLS, server permission checks and the existing RBAC
utilities. `scripts/validate-rls.mjs` exercises exactly that against a real local database with
every migration applied:

```
================== 64/64 behavioural checks passed ==================
```

including the cross-tenant enrolment hole 00033 closed in Phase 6, the homework class scope from
00032, and the teacher-side transfer's homeroom rule.

`verify-navigation.mts` gained the structural half: the mock screen is gone, no file under
`(main)/administration` declares a `MOCK_` constant (comments stripped — the replacement page
names the constants it replaced), the redirect targets `/admin/dashboard`, and the gate runs
before the hand-off.

---

## 4. Known remaining work

1. **Teacher profile and permissions** in the admin console — §2.
2. **The three status-label tokens** — [phase10-implementation.md](phase10-implementation.md) §4.
3. **The admin console has no dark-mode pass** — its cards are `bg-white`.
4. **00033 is not applied to the dev database.** Proven in a throwaway one since Phase 6;
   applying it is a `supabase db push` and the owner's call.
5. **`verify-ranking-live.mts`'s semester section** and the fixture behind it — Phase 7 §3.
6. **CLAUDE.md is now well behind.** Its migration table stops at 00031 and it does not mention
   00032, 00033, `ClassContextBar`, the `results` module, the transfer, the paper contract,
   `placing()`, `lib/attendance/status.ts`, `--brand-soft`, `--warning-text`, `taughtSubjects`,
   or this redirect. A documentation pass is the obvious next piece of work.
