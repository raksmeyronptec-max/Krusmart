# Krusmart — Phase 0 Codebase Audit

**Scope:** read-only. No application code, schema, or configuration was modified.
**Method:** static analysis of the repository + an unauthenticated REST probe of the
Supabase instance named in `.env.local`.
**Date of audit:** 2026-08-14 · **Baseline commit:** `5ff963e`

---

## ⛔ Blockers found before Phase 1 can start

Four items must be resolved or acknowledged first. Three are correctness/security
defects in the current code; one is an environment question only you can answer.

| # | Finding | Impact on V2 |
| --- | --- | --- |
| **B1** | `.env.local` points at a **local** Supabase (`http://127.0.0.1:54321`) whose schema is missing 10 of the 12 tables the app queries | The V2 migration cannot be authored against a schema nobody can see. See §I. |
| **B2** | `saveAttendance` inserts attendance rows with **no `teacher_id`**, and all three attendance reads are unscoped | Orphaned rows cannot be backfilled to `class_id`. Cross-tenant read risk. See §G-1. |
| **B3** | `scores` upsert conflict key omits `teacher_id` | V2 explicitly allows several teachers per class+subject; they will silently overwrite each other. See §G-2. |
| **B4** | `app/admin/**` performs **no role check at all** | Phase 6 builds a principal console on a tree any teacher can already open. See §G-3. |

---

## A. Route map

45 route files. `app/page.tsx` redirects to `/dashboard`.

### A.1 `app/(main)/` — teacher app (26 features)

| Route | Server page | Client | Actions | Data source |
| --- | --- | --- | --- | --- |
| `/administration` | ✓ | `AdministrationClient` | — | **mock constants** |
| `/attendance/layout` | ✓ | `AttendanceLayoutClient` + `ThreeClassroom` | ✓ | `students`, `attendance`, localStorage |
| `/attendance/monthly` | ✓ | `MonthlyAttendanceClient` | ✓ | `students`, `attendance`, `settings` |
| `/certificate` | ✓ | `CertificateClient` | — | `settings`, `students`, `scores`¹ |
| `/cleaning-schedule` | client-only | — | — | `students`, `cleaning_schedules` |
| `/dashboard` | client-only | — | — | none (static app grid) |
| `/decorations` | ✓ | `DecorationsClient` | — | `lib/data/decorations.ts` |
| `/enrollment` | client-only | — | ✓ | `students` |
| `/homework/enter` | ✓ | `HomeworkEnterClient` | — | `students`, `scores`¹ |
| `/homework/send` | ✓ | `HomeworkSendClient` | ✓ | `homework_assignments` |
| `/honor-roll` | ✓ | `HonorRollClient` | — | `settings`, `students`, `scores`¹ |
| `/id-student` | ✓ | `IdStudentClient` | — | `settings`, `students` |
| `/inventory` | ✓ | `InventoryClient` | — | `settings` + **localStorage** |
| `/notifications` | ✓ | `NotificationsClient` | ✓ | `students`, `notifications` |
| `/parent-report` | ✓ | `ParentReportClient` | ✓ | `settings`, `students`, `scores`, `attendance` |
| `/print-list` | ✓ | `PrintListClient` | — | `settings`, `students` |
| `/print-student-age` | ✓ | `PrintStudentAgeClient` | — | `settings`, `students` |
| `/print-student-codes` | ✓ | `PrintStudentCodesClient` | — | `students` |
| `/profile` | ✓ | `ProfileClient` | — | `settings` |
| `/ranking` | ✓ | `RankingClient` | — | `settings`, `students`, `scores`¹ |
| `/score/enter` | ✓ | `ScoreEnterClient` | ✓ | `students`, `scores` |
| `/score/total` | ✓ | `ScoreTotalClient` | ✓ | `students`, `scores` |
| `/score-analyse` | ✓ | `ScoreAnalyseClient` | — | `settings`, `students`, `scores`, `attendance` |
| `/score-analysis/subject` | ✓ | `SubjectAnalysisClient` | — | `scores`¹ — **takes no props** |
| `/student-list` | ✓ | `StudentTableClient` | ✓ | `students` |
| `/student-tracking` | ✓ | `StudentTrackingClient` | — | `settings`, `students`, `scores` |
| `/team` | client-only | — | — | static |
| `/tutorial` | client-only | — | — | `public/introduction/*.html` + localStorage |
| `/yearly-report` | ✓ | `YearlyReportClient` | — | **localStorage only** |

¹ via `getAllScoresByPeriod` imported from `score/total/actions.ts`.

`app/(main)/layout.tsx` is a bare pass-through — **`<TopNav />` is rendered by each
page, not the layout.** Phase 4's context provider must therefore wrap the layout
*and* every page keeps its own `TopNav`, or `TopNav` moves into the layout (a
26-file change). This is the single biggest structural decision in Phase 4.

### A.2 `app/admin/` — principal console

| Route | State |
| --- | --- |
| `/admin/dashboard` | exists, **100% mock constants**, no Supabase |
| `/admin/teacher-attendance` | exists, **100% mock constants**, no Supabase |
| `/admin/users` | **linked in sidebar, does not exist → 404** |
| 3 further sidebar entries | `path: "#"` placeholders |

`app/admin/layout.tsx` is `"use client"` and uses Supabase only for `signOut()`.

### A.3 `app/parent/` — stub
`parent-login/page.tsx` fakes a 1s `setTimeout`, then routes to a hardcoded
dashboard. No auth, no queries, no parent↔student link.

### A.4 Auth
`proxy.ts` → `lib/supabase/middleware.ts` (`getSession()`, deliberately not
`getUser()`). Public routes: `/` and `/login`. `app/auth/callback/route.ts` does
the PKCE exchange.

---

## B. Current database relationships

**Every table is a flat child of `auth.users` via `teacher_id`. There are no
inter-entity foreign keys other than `students.id`.**

```
auth.users(id)
  └── teacher_id ─┬── students ──┬── attendance.student_id
                  │              ├── scores.student_id
                  │              └── homework_scores.student_id
                  ├── settings          (PK teacher_id — 1:1)
                  ├── seating_layout    (PK teacher_id — 1:1)
                  ├── cleaning_schedules(UNIQUE teacher_id — 1:1)
                  ├── notifications
                  └── homework_assignments
```

Consequences that V2 must undo:
- **A class *is* a teacher account.** No `classes` table exists.
- `settings.class_name` / `school_name` / `academic_year` are free-text strings on a
  1:1 row — they are the *only* representation of class, school and year.
- A teacher cannot teach two classes, and a student cannot appear in two years.
- Deleting a teacher cascades away every student record.

### B.1 The `scores` table carries four different things
Discriminated by `score_type` + `score_period`:

| `score_type` | `score_period` format |
| --- | --- |
| `monthly` | `` `${month}-${academicYear}` `` |
| `semester` | `` `${semester}-${academicYear}` `` (subjects prefixed `sem_`) |
| `annual` | `` `annual-${academicYear}` `` |
| `homework` | `` `${year}_${month}` `` — **underscore, unlike the others** |

`homework_scores` is defined in SQL and **never touched by the app**.

---

## C. Component dependency map

| Module | Importers | Note |
| --- | --- | --- |
| `lib/utils/logger` | 37 | most-depended module |
| `lib/supabase/server` | 32 | every server page/action |
| `lib/types` | 30 | |
| `components/ui/forms/Select` | 17 | |
| `components/TopNav` | 12 | **imported per-page, not by the layout** |
| `lib/constants/months` | 12 | |
| `components/ui/forms/SearchableSelect` | 8 | |
| `lib/utils/khmer-num` | 8 | |
| `components/ui/feedback/Skeleton` | 6 | |
| `lib/constants/storage` | 5 | |
| `lib/utils/date`, `lib/utils/errors` | 5 each | |
| `lib/supabase/client` | 4 | browser-side pages |
| `lib/utils/xlsx` | 4 | |
| `lib/constants/academic` | 3 | |
| `lib/storage/custom-subjects` | 2 | |
| `components/ui/navigation/Pagination` | 1 | `student-list` only |
| `components/ui/navigation/RowsPerPageSelect` | 0 | used *inside* `Pagination` |

**Blast radius for Phase 5:** touching `lib/types.ts` recompiles 30 files;
touching `lib/supabase/server.ts` touches 32.

---

## D. Supabase queries per table

51 call sites across 9 tables (3 more tables are referenced only by `TopNav`).

| Table | Sites | Files |
| --- | --- | --- |
| `students` | 21 | 18 pages + `student-list/actions`, `enrollment/actions` |
| `settings` | 14 | 12 pages + `attendance/monthly/actions`, `TopNav` |
| `scores` | 7 | `score/enter`, `score/total`, `parent-report`, `score-analyse`, `student-tracking` |
| `attendance` | 5 | `attendance/layout`, `attendance/monthly`, `parent-report`, `score-analyse` |
| `notifications` | 3 | `notifications/actions` |
| `homework_assignments` | 3 | `homework/send/actions` |
| `cleaning_schedules` | 2 | `cleaning-schedule/page` |
| `profiles` | 1 | `TopNav` (GPS check-in) |
| `schools` | 1 | `TopNav` (GPS check-in) |
| `teacher_attendance` | 1 | `TopNav` (GPS check-in) |
| `seating_layout` | **0** | table exists in SQL, app uses localStorage instead |
| `homework_scores` | **0** | table exists in SQL, entirely unused |

---

## E. localStorage keys

All keys are centralised in `lib/constants/storage.ts` (`STORAGE_KEYS`); no file
uses a string literal.

| Key | Constant | Files | V2 disposition |
| --- | --- | --- | --- |
| `inventoryItems` | `inventoryItems` | `inventory/InventoryClient` (r/w) | → Supabase table (Phase 11.5) |
| `custom_subjects` | `customSubjects` | `lib/storage/custom-subjects` (r/w), consumed by `score/enter` + `score/total` | → `subjects` / `class_subjects` |
| `seatingConfig` | `seatingConfig` | `attendance/layout/AttendanceLayoutClient` (r/w) | → `seating_layout.config` (**table already exists, unused**) |
| `seatingLayout` | `seatingLayout` | same | → `seating_layout.assignments` |
| `ptec_last_tutorial_page` | `lastTutorialPage` | `tutorial/page` (r/w) | keep local — UI preference |
| `krusmart_students_cache` | `studentsCache` | `yearly-report/YearlyReportClient` (read) | **`/yearly-report` has no other data source** |

⚠️ **`/yearly-report` renders entirely from a localStorage cache that nothing in
the repository ever writes.** On a fresh browser it falls back to hardcoded
demo numbers (45 students / 22 female). This page is effectively non-functional.

---

## F. Technical debt

| # | Item | Severity |
| --- | --- | --- |
| D1 | `supabase/migrations/00001_init.sql` does not match what the code writes: `scores` declares `month`/`score` but the app uses `score_period`/`score_value`; `attendance.reason` and 7 `settings` columns are absent | **High** |
| D2 | `profiles`, `schools`, `teacher_attendance` are queried by `TopNav` but have **no SQL file anywhere** | **High** |
| D3 | `/administration`, `/admin/dashboard`, `/admin/teacher-attendance` render mock constants — they look complete but carry no real data | **High** |
| D4 | `/yearly-report` reads a cache key nothing writes (see §E) | Medium |
| D5 | `homework_scores` + `seating_layout` are dead tables | Medium |
| D6 | `/score-analyse` vs `/score-analysis/subject` — two features, near-identical names | Low |
| D7 | `Pagination` used on 1 of ~12 list screens | Low |
| D8 | 50 justified `eslint-disable` lines (31 `no-img-element`, 16 `set-state-in-effect`, 3 `exhaustive-deps`) — client-side fetch-in-effect is the underlying cause | Medium |
| D9 | `FALLBACK_ACADEMIC_YEAR` is a hardcoded `'2023-2024'` | Low |
| D10 | No test framework configured — every regression check is manual | **High** for a 12-phase migration |

---

## G. Security risks

### G-1 · `attendance` is written unowned and read unscoped — **Critical**

`app/(main)/attendance/layout/actions.ts`
```ts
.from('attendance').upsert({ student_id, date, status, reason },
                           { onConflict: 'student_id, date' })   // ← no teacher_id
```
The row is created with **no owner**. A source comment asserts the live table has
no `teacher_id` column — which, if true, means the documented RLS policy
(`auth.uid() = teacher_id`) cannot exist on this table, and *every teacher can read
every school's attendance*.

Three reads confirm the exposure:

| Site | Filter |
| --- | --- |
| `attendance/layout/actions.ts:49` | `.eq('date', date)` only |
| `attendance/monthly/actions.ts:18` | `.gte/.lte('date', …)` only |
| `parent-report/actions.ts:27` | `.eq('teacher_id', …)` ✓ scoped |

The third proves the column *does* exist. So `saveAttendance` is writing NULL-owned
rows that the scoped reader can never see — the two attendance features disagree
about ownership. **This must be settled before any backfill**: rows without
`teacher_id` cannot be mapped to a `class_id`.

### G-2 · `scores` conflict key omits the owner — **High (V2 blocker)**
```ts
onConflict: 'student_id, subject, score_type, score_period'
```
`teacher_id` *is* in the payload, so writes are owned. But the conflict target is
not owner-aware. Today one teacher owns each student, so it is latent. **Phase 3
onward makes it live**: two teachers assigned to the same class+subject will
overwrite each other's marks with no error. The unique index must gain
`class_id`/`teacher_id` in Phase 1.

### G-3 · `app/admin/**` has no authorization — **High**
No role check exists anywhere under `app/admin/`. `proxy.ts` only asserts *a*
session. Any authenticated teacher can open `/admin/dashboard`. Impact is limited
today because those pages are mock, but Phase 6 puts school-wide data behind this
door. RBAC must land **before** Phase 6 content.

### G-4 · Parent portal grants access with no credential — **High (when shipped)**
`parent-login` `setTimeout`s and redirects. Nothing authenticates. Harmless while
the dashboard is static; unacceptable the moment Phase 11 wires real data.

### G-5 · Secrets — **Clean** ✓
Only `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are read. No
service-role key anywhere. `.env*` is gitignored, and no secret is committed.

### G-6 · Client-side privileged reads — **Medium**
`TopNav` (a client component) queries `profiles`, `schools`, `teacher_attendance`
directly from the browser. Correct only if those three tables have sound RLS —
and none of them has a SQL file to audit (D2).

---

## H. Import dependency graph (direction of change)

```
lib/types.ts ──────────────► 30 files      ← Phase 3 edits ripple everywhere
lib/supabase/server.ts ────► 32 files
lib/utils/logger.ts ───────► 37 files

app/(main)/<feature>/page.tsx        (server: auth + fetch)
        │  passes initialX props
        ▼
   <Feature>Client.tsx               (client: UI, print, export)
        │  imports server actions
        ▼
   actions.ts                        (server: re-auth + mutate + revalidate)

Cross-feature coupling (fragile):
  ranking/RankingClient      ──┐
  honor-roll/HonorRollClient ──┼──► score/total/actions.ts :: getAllScoresByPeriod
  certificate/CertificateClient┤
  score-analysis/subject ──────┘
  homework/enter ─────────────────► score/enter/actions.ts :: getScores, saveScores
```

Four features import a *sibling feature's* server actions. Refactoring
`score/total/actions.ts` in Phase 5 breaks all four — sequence it accordingly.

---

## I. Environment finding — needs your decision

`.env.local` resolves to **`http://127.0.0.1:54321`**, the local Supabase CLI stack
(8 containers running). An unauthenticated REST probe of that instance returns:

| Result | Tables |
| --- | --- |
| **Missing** (`PGRST205`) | `attendance`, `scores`, `settings`, `notifications`, `cleaning_schedules`, `seating_layout`, `homework_assignments`, `homework_scores`, `teacher_attendance`, `user_roles` |
| **Present** (RLS/grant blocks anon) | `students`, `profiles`, `schools`, `classes`, `academic_years`, `subjects` |
| **Present and anon-readable** | `roles` |

Two things follow:

1. **The local database is missing 10 of the 12 tables the app queries.** Run the
   app against it and `/score/enter`, `/attendance/*`, `/profile` and most others
   fail at the first query. `00001_init.sql` has evidently not been applied here.
2. **It already contains `classes`, `academic_years`, `subjects` and a populated
   `roles` table** — none of which exist in this repository's SQL. Someone has
   started a V2-shaped schema outside version control.

I could not enumerate columns: I have no service-role key (correctly), and you
declined the container introspection. **I need one of these from you before
Phase 1:**

- **(a)** a schema dump of the real production project (`supabase db dump --schema public`), or
- **(b)** approval to introspect the local container, or
- **(c)** confirmation that the local stack *is* the intended target, plus what
  produced its `classes`/`academic_years`/`subjects`/`roles` tables.

Authoring `00002_enterprise_v2_foundation.sql` without this means writing
`ALTER TABLE` statements against a schema I am guessing at — a direct violation
of Rule 4 (migration safety).

---

## J. Phase 11.5 — cannot be scoped from this repository

The brief lists ~20 features to restore from a legacy `KruSmart_new` project
(Record Book, 13-form Administration Suite, Poster Splitter, 35+ subjects,
behavioural-score `NaN` bug, cleaning randomiser, …). **That codebase is not
present here**, and `public/introduction/` contains only tutorial HTML.

I verified two of the claims against the current code and they hold:
- `/administration` renders `MOCK_SCHOOL_STATS` / `MOCK_TEACHER_DETAIL` — the
  13-form suite is genuinely absent.
- `/inventory` persists to localStorage, not Supabase, as the brief states.

To scope Phase 11.5 I need the legacy repository path or an export of those pages.

---

## K. What Phase 1 will look like once unblocked

Ordered so that nothing destructive happens and each step is independently
verifiable:

1. **Reconcile the SQL snapshot with reality** (D1/D2) — a corrective migration for
   `scores`, `attendance.reason`, the 7 `settings` columns, and first-ever SQL for
   `profiles`, `schools`, `teacher_attendance`. *Without this, `00002` builds on sand.*
2. **Fix G-1** — add `teacher_id` to the `saveAttendance` payload, scope the two
   unscoped reads, then backfill existing NULL-owner rows.
3. **Fix G-2** — widen the `scores` unique index before any multi-teacher data exists.
4. **Then** the 20 new tables from §5 of the brief, all-nullable columns, RLS +
   indexes per table, no drops.

Steps 1–3 are prerequisites, not scope creep: the backfill in Phase 2 maps
`teacher_id → class_id`, so any row without a `teacher_id` is data that Phase 2
will silently drop.

---

## ⏸️ Phase 0 complete — awaiting approval

No files were modified. `AUDIT.md` is the only artifact.

**To proceed I need:**
1. A decision on §I (which database is the target, and its real schema).
2. Confirmation that fixing **B2/G-1** and **B3/G-2** inside Phase 1 is acceptable —
   both are pre-existing defects, and the Phase 2 backfill is unsafe without them.
3. The legacy repository for §J, or agreement to defer Phase 11.5.
