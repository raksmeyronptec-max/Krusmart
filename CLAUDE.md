# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev      # next dev
npm run build    # next build
npm start        # next start
npm run lint     # eslint (flat config, eslint-config-next core-web-vitals + typescript)
```

No test framework is configured — there is nothing to run for tests. Type errors surface via `npm run build` (`tsc` is `noEmit`).

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`). The other env vars are the five Cloudflare R2 keys — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (all server-only) and `NEXT_PUBLIC_R2_PUBLIC_URL` (the read-only CDN host) — which back every image upload; unset, uploads report a failure and everything else works. There is no service-role key anywhere, so **every** data path goes through RLS as the logged-in user — the only exceptions are the two SECURITY DEFINER functions, `create_teacher_organisation` (migration 00017) and `backfill_teacher_enrolments` (migration 00018, redefined in 00019), both keyed entirely on `auth.uid()`.

## What this is

KruSmart — a Khmer-language classroom management app for Cambodian primary/secondary teachers (student roster, attendance, scores, homework, printable reports and certificates). UI text is Khmer; keep new user-facing strings in Khmer.

Next.js 16 App Router + React 19, Tailwind v4, Supabase (auth + Postgres).

[AUDIT.md](AUDIT.md) is the Phase 0 read-only audit that the "Enterprise V2" migration below was planned from. Useful for the *why* behind a decision; several of its findings are now closed, so don't treat it as a current defect list.

## Architecture

### Route trees

| Tree | Purpose | Gate |
| --- | --- | --- |
| `app/(main)/` | The teacher app — ~30 features, the bulk of the code | Session via `proxy.ts`; layout redirects parents away |
| `app/admin/` | School console (owner / principal / school_admin) | `app/admin/layout.tsx` calls `getUserRoles()` + `isSchoolAdmin()` server-side before any child renders |
| `app/parent/(portal)/` | Parent portal — dashboard, grades, attendance, homework, family, student card | Real Supabase auth + `parent_students` link (migration 00010) |
| `app/login/` | Multi-role sign-in: `/login` (universal) plus `/login/{owner,admin,teacher,parent}`, `choose-workspace`, `reset-password`, `update-password` | Public |
| `app/onboarding/` | First-run wizard for a brand-new teacher: organisation → level → grade → class → students | Own layout (deliberately outside `(main)` — no sidebar over 26 features that can't render yet); redirects admins/parents/finished teachers away |

`app/page.tsx` redirects to `/dashboard`. Per-role login screens are presentation only — `ROLE_CONFIGS` in [lib/auth/role-config.ts](lib/auth/role-config.ts) supplies the Khmer copy and icon; the actual credentials and roles are the same everywhere.

### Auth and session

- [proxy.ts](proxy.ts) — Next.js 16 renamed `middleware.ts` to `proxy.ts`, and the exported function is `proxy()`. It delegates to [lib/supabase/middleware.ts](lib/supabase/middleware.ts), which intentionally calls `getSession()` rather than `getUser()` — the comment explains this avoids Supabase free-tier rate limiting and random logouts on every route change. Don't "fix" this to `getUser()` without understanding that tradeoff. `SchoolContextProvider` and `TeacherContextProvider` use `getSession()` for the same reason.
- Public routes are `/`, anything under `/login`, and `/parent/login`. Everything else redirects to `/login`. The proxy only asserts that *a* session exists — role gating happens in layouts.
- Three Supabase client factories, all named `createClient` — pick by context: [lib/supabase/client.ts](lib/supabase/client.ts) (browser), [lib/supabase/server.ts](lib/supabase/server.ts) (server components / actions, `await cookies()`), [lib/supabase/middleware.ts](lib/supabase/middleware.ts) (proxy only).
- `app/login/actions.ts` covers password login, signup, and email-OTP verification; `app/auth/callback/route.ts` handles the PKCE code exchange.

### The app shell

`app/(main)/layout.tsx` is **not** a bare wrapper: it resolves the actor, redirects parents to `/parent/dashboard`, sends never-set-up teachers into `/onboarding` via `onboardingRedirect(actor)`, and wraps everything in `SchoolContextProvider` → `TeacherContextProvider` → [`AppShell`](components/shell/AppShell.tsx). `AppShell` renders `TopNav`, `Sidebar` (≥1024px), `MobileNav` (<1024px) and `Breadcrumb`, so **a new `(main)` page must not render `<TopNav />` itself** — the layout owns it.

Because every printable view now sits under the shell, the shell disappears on paper via two attributes handled in `globals.css`: `data-app-chrome` → `display:none`, `data-app-frame` → `display:contents` (drops the box from layout while keeping children, so an A4 sheet measures the same as before the shell existed). Keep both attributes on any new frame element.

[lib/navigation.ts](lib/navigation.ts) is the information architecture: `NAV_MODULES` groups the flat routes into ten modules, and `moduleForPath` drives both the sidebar highlight and the breadcrumb. URLs are deliberately *not* renamed to match the grouping. A detail route reached from a row rather than a menu (e.g. `/students/[id]`) still has to be declared, with `hidden: true`.

### Page pattern

Most `(main)` features are a trio of colocated files:

```
app/(main)/<feature>/page.tsx             server component: createClient() → getUser() → redirect('/login') → resolve scope → fetch → pass initialX
app/(main)/<feature>/<Feature>Client.tsx  "use client": all UI, editing, printing, export
app/(main)/<feature>/actions.ts           'use server': requirePermission() → mutate → auditLog() → revalidatePath()
```

See [student-list/page.tsx](app/(main)/student-list/page.tsx) + [actions.ts](app/(main)/student-list/actions.ts) as the reference implementation. A few pages (`dashboard`, `enrollment`, `cleaning-schedule`, `team`, `tutorial`) are client-only and query Supabase from the browser instead.

## Scoping: the legacy path and the V2 path both run

This is the single most important thing to understand before touching a query.

The app began as one-teacher-per-class: every table keyed on `teacher_id → auth.users(id)`, RLS policies of the form `auth.uid() = teacher_id`, and no classes table at all. Migrations 00003–00012 added the real structure — `schools`, `academic_years`, `education_levels`, `grades`, `classes`, `subjects`, `class_subjects`, `teacher_assignments`, `student_enrollments`, `roles` / `permissions` / `user_roles`, `parent_students` — **without removing the old path**. Accounts that predate the migration have no `teacher_assignments` row and must keep working exactly as they did.

So every scoped read picks a mode *from data, never from a flag*:

- **legacy** — `.eq('teacher_id', userId)`. Chosen whenever the user has no active assignments, or context is still loading. Strictly narrower, so it is the safe fallback.
- **v2** — scope by `class_id` (+ `academic_year_id`), keeping `teacher_id` as a second filter.

| Where | Use |
| --- | --- |
| Client components | [lib/utils/queryFilter.ts](lib/utils/queryFilter.ts) — `resolveScope(context, userId)`, `applyScope(query, scope)`, `scopeColumns(scope)` for writes, `resolveStudentIds()` |
| Server components / actions | [lib/utils/serverScope.ts](lib/utils/serverScope.ts) (`server-only`) — `resolveServerScope()`, `fetchStudentsForScope()`, `rosterIdsForScope()`, `classIdFromSearchParams()` |

The active class lives in React state (`TeacherContext`), *not* localStorage — two tabs must not disagree about which class is being edited. A server component cannot read client state, so the selection travels in the URL as `?class=<id>` (`CLASS_PARAM` in [lib/utils/scopeParam.ts](lib/utils/scopeParam.ts), which exists separately only because `serverScope.ts` is `server-only` and `ClassContextSwitcher` is a client component). `resolveServerScope` always validates the requested id against the caller's own assignments, so a forged `?class=` cannot widen access.

**Two deliberate exceptions to the `teacher_id` convention**, both load-bearing:

- The **v2 roster read** comes from `student_enrollments`, not `students.teacher_id`, and does **not** apply `teacher_id` — a subject teacher legitimately sees students a colleague created (migration 00006 widens the policy). Enrolments are filtered `.neq('status','withdrawn')` rather than `.eq('status','active')`, because past years are stamped `promoted`/`transferred` and filtering on active would render every historical class empty.
- **Score reads** filter by roster ids for the same reason (migration 00007). Writes keep the `teacher_id` guard.

Everywhere else, **scope by `.eq('teacher_id', user.id)` even though RLS enforces it** — that's the convention, and delete/update actions rely on it as a second guard.

### RBAC

| Module | Use |
| --- | --- |
| [lib/rbac/permissions.ts](lib/rbac/permissions.ts) | Pure, isomorphic. `Permission` is `` `${Resource}:${Action}` `` (e.g. `'scores:update'`), plus `hasPermission()` and `isSchoolAdmin()`. **Keep this free of server-only imports** — the client hook imports it, and pulling in `next/headers` here breaks the build. |
| [lib/rbac/server.ts](lib/rbac/server.ts) | `server-only`. `getUserRoles()`, `getTeacherAssignments()`, and `requirePermission()` which *throws* a Khmer error rather than returning a flag. |
| [lib/rbac/actor.ts](lib/rbac/actor.ts) | `server-only`. `resolveActor()` → `{ kind: 'admin' \| 'teacher' \| 'parent', hasAssignments, hasLegacyRoster, selfServeSchoolIds }` for routing decisions; `resolveAllAvailableRoles()` backs `/login/choose-workspace`. |
| [lib/rbac/useUserRole.ts](lib/rbac/useUserRole.ts) | Client hook for conditional rendering only — `can()`, `isAdmin`. |
| [lib/audit/log.ts](lib/audit/log.ts) | `auditLog()` / `auditLogBatch()` into `audit_logs`, which has INSERT/SELECT policies but deliberately no UPDATE/DELETE. |

A signed-in user with **no `user_roles` row resolves to `['teacher']`** on both client and server — that fallback is what keeps pre-V2 accounts working, so don't "tighten" it. `resolveActor` keys parents off the `parent_students` link instead, precisely because the absence of a role can't distinguish them.

These checks decide what the UI *offers*. RLS is the runtime boundary; `requirePermission` produces a clear Khmer error instead of an opaque empty result.

### Teacher onboarding (self-serve organisations)

A teacher signing up without an admin provisioning them used to be stuck on the legacy path forever — `schools` had a SELECT policy but no write policy, and granting yourself a role requires already holding one. Migration 00017 breaks that deadlock with **one** SECURITY DEFINER function, `create_teacher_organisation(name, kind, year)`: it creates the school (kind `school` / `center` / `independent` in `schools.settings`, no new DDL), grants the caller `owner`, stamps `profiles.school_id` (required — `schools_select_member` reads *profiles*, not `user_roles`), and refuses to run twice (one self-serve org per teacher). From there the owner creates levels/grades/classes through the existing admin policies — nothing else was widened.

The wizard state is **derived from `Actor`, never stored** — same principle as legacy/v2 scoping. [lib/onboarding/state.ts](lib/onboarding/state.ts) is the single source of routing truth: `onboardingRedirect(actor)` (wired into `app/(main)/layout.tsx`, the login action and the OAuth callback) sends a brand-new teacher to `/onboarding/organisation` and deliberately returns `null` for everyone else — a teacher with an organisation but no class resumes on the **dashboard**, which carries a create-class call to action into `/onboarding/class`; an approved join-request member waits there for an admin assignment; and a pre-V2 teacher with a legacy roster is left alone entirely, because interrupting a working account with a mandatory wizard risks live data, so their migration is opt-in. The flow is **level-first**: `/choose-level` (public) is the entry point for a brand-new teacher — the choice rides across Google OAuth in sessionStorage (`STORAGE_KEYS.pendingLevel`, a hint re-validated server-side), and `createOrganisation` consumes it, seeding the level and its grades with the school so grade selection happens inside class creation rather than as a wizard step. `/onboarding/level` and `/onboarding/grade` survive as repair/compat routes; nothing routes to grade any more.

**Creating the class flips the account to v2 scope, so the roster must follow in the same action.** `createClassAndAssign` calls `backfill_teacher_enrolments()` (00018) right after the homeroom assignment is inserted — without that, every student under `students.teacher_id` becomes invisible to the v2 roster reads the assignment just switched on. If the backfill fails, the assignment and class are rolled back rather than leaving a v2-scoped account with an empty roster. Teacher-side student writes (`enrollment/actions.ts`) create the matching `student_enrollments` row whenever the resolved scope is v2, and `/student-list` offers the same RPC as an opt-in recovery banner for accounts stranded before this existed. `app/onboarding/layout.tsx` must **not** call `onboardingRedirect` (it targets routes inside its own tree — infinite loop); each step page checks its own prerequisite instead. Level → grade are two routes but one rail step. The national curriculum ladder lives in [lib/onboarding/curriculum.ts](lib/onboarding/curriculum.ts) as data, on purpose — changing it must not need a migration.

## Data model

[lib/types.ts](lib/types.ts) carries a row type per table and follows the **live** schema.

`supabase/migrations/` is now a real, ordered history — read the header comment of each file, they explain the reasoning:

| File | What it does |
| --- | --- |
| `00001_init.sql` | Legacy single-teacher baseline. Predates the drift below. |
| `00002_schema_reconciliation.sql` | Makes the tracked SQL match what the app actually reads (`score_period` / `score_value`, `attendance.reason`, the `settings` columns), and adds `scores_owner_period_uniq`. |
| `00003`–`00004` | Enterprise V2 foundation + backfill from the existing single-teacher data. |
| `00005`–`00008` | PostgREST grants; class-scoped read access for `students`, `scores`, `profiles`. |
| `00009`–`00011` | Seeded grading schemes; parent portal; closes a grade/attendance injection hole. |
| `00012_legacy_features.sql` | `custom_subjects`, `inventory_items`, `class_admin_entries`, `scores.score_text`. |
| `00013_settings_profile_fields.sql` | Nine `settings` columns for the teacher-profile fields the legacy build had, plus a backfill. |
| `00014_attendance_locks_teacher_access.sql` | Makes `attendance_locks` writable by the class teacher, in both legacy (`teacher_id`) and v2 (`class_id`) shapes. |
| `00015_cognitive_assessments.sql` | Per-pupil 0–100 cognitive ratings for `/score-analyse` — a separate table *by design*: it is not a mark out of ten, so it must not live in `scores` where `gradeFor()` and every average would misread it. |
| `00016_score_templates.sql` | `score_template_subjects` — the score subject list as layered data (see below). |
| `00017_teacher_owned_organisation.sql` | `create_teacher_organisation()` RPC backing `/onboarding` (see the onboarding section). |
| `00018_backfill_teacher_enrolments.sql` | `backfill_teacher_enrolments()` — idempotently enrols the caller's `students.teacher_id` roster into their active homeroom class. Called by onboarding the moment the assignment flips the account to v2 scope, and by the recovery banner on `/student-list`. |
| `00019_backfill_never_enrolled_only.sql` | Redefines 00018's function to enrol only students with **no enrolment row at all**, matching `countRecoverableLegacyStudents` exactly — 00018's year-scoped guard silently promoted a previous year's roster into a new class. Students with any enrolment history move only through the explicit promote/transfer/withdraw workflows. |
| `00020_teacher_profile_extended.sql` | `teacher_profiles` + two `settings` columns (signature / seal images). |
| `00021_score_template_levels.sql` | `level_key` / `grade_number` / `track` on `score_template_subjects`, `track` on `classes`, and the verified Grade-12 seeds (both streams). |
| `00022_organisation_join_requests.sql` | `join_requests` + `search_organisations()` / `approve_join_request()` / `reject_join_request()` / `my_join_requests()`. |
| `00023_secondary_grading_schemes.sql` | Corrects the two secondary levels' stored default schemes to /50 coefficient. Display truth only — no calculation reads these rows. |
| `00024_assignment_subject_key.sql` | `teacher_assignments.subject_key` — the assignment names the subject by the score system's own identity. Header records why no `subjects` rows were minted. |
| `00025_homeroom_uniqueness_subject_key.sql` | Re-keys homeroom uniqueness on *both* NULLs — without it a `subject_key` assignment collides with the teacher's homeroom row, and a second subject in one class is impossible. |
| `00026_secondary_classroom_curriculum.sql` | Seeds the real classroom curriculum for grades 7–12 (105 rows, product owner's verified table) and converges 00021's BacII-weighted grade-12 seed to classroom values. BacII is deliberately out of the system — see `docs/score-system-design.md` §3.3. |
| `00027_custom_subjects_to_template.sql` | Retires `custom_subjects` into `score_template_subjects` at `scope='class'`, copying every `SubjectColumn.id` verbatim. One source row fans out to one row per class the teacher holds, because `class_id` was never written and the subject already showed on every class. A teacher with no class cannot hold a class-scope row, so those rows stay put — and their subjects stop appearing, a recorded product decision. |
| `00028_primary_curriculum_and_class_selection.sql` | Seeds the primary curriculum for grades 1–6 (312 rows, 52 per grade) at `level_key='primary'`, and adds `class_template_subjects` — which of those subjects a class actually teaches. No key is invented: all 52 already existed in `subjectConfigs.ts`, so this promotes a compiled-in fallback into the database. The seed is a strict superset of 00016's fourteen untagged rows, which stay put as the legacy fallback. |

`supabase/legacy/` holds superseded partial snapshots — **do not apply them**. `supabase/README.md` still describes the pre-V2 world in places (it claims the scores conflict key omits `teacher_id`, and that there is no classes table); the migrations and this file are the newer account. Verify against the live project before relying on any of it.

### The `scores` table carries four different things

Discriminated by `score_type` + `score_period`, all through the shared actions in [score/enter/actions.ts](app/(main)/score/enter/actions.ts):

- `monthly` → period `` `${month}-${academicYear}` ``
- `semester` → period `` `${semester}-${academicYear}` ``; subject names are prefixed `sem_`
- `annual` → period `` `annual-${academicYear}` ``
- `homework` → period `` `${academicYear}_${monthId}` ``, e.g. `2025-2026_nov`. Note the **underscore** separator, unlike the hyphen the other three use — and note the left half is the full academic year, not a calendar year, so `` score_period.startsWith(`${calendarYear}_`) `` matches nothing. `subject` is `hw_<dayOfMonth>`, and a homework month runs the 26th of the previous month to the 25th of this one. `homework/enter` imports `getScores`/`saveScores` from the score feature.

Upserts use `onConflict: 'teacher_id, student_id, subject, score_type, score_period'`, matching `scores_owner_period_uniq`. **`teacher_id` is part of the key on purpose** — without it, two teachers on the same class and subject would silently overwrite each other's marks, and Postgres rejects the narrower target outright with `42P10`.

A cell may hold a number *or* a Khmer word: the four `sem_eval_*` columns are rated from a dropdown, and `parseFloat` on those wrote `NULL` behind a success toast. Migration 00012 added `score_text`; route every read and write through [lib/utils/score-value.ts](lib/utils/score-value.ts) (`splitScoreCell`) so the two columns cannot drift apart again.

The `homework_scores` table defined in SQL is unused by the app.

### Score templates: the subject list is data, not code

**Two questions, two tables.** `score_template_subjects` answers *what subjects exist* for a class; `class_template_subjects` (00028) answers *which of them the class teaches*. Keeping them apart is load-bearing: a `scope='class'` row in the first table is a **definition override**, and `updateClassSubject` deletes one the moment it stops differing from what it inherits (so inheritance stays live). A selection carries no definition difference — "I teach Khmer" says nothing about what Khmer is — so stored in that layer it would be deleted as redundant. `applySelection` in [lib/scores/selection.ts](lib/scores/selection.ts) narrows the entry picker; **a class with no selection resolves the full template**, so an account that never configures anything behaves exactly as before. Aggregation surfaces (totals, ranking, certificates, reports, `resolveServerGradingContext`) always read the *unnarrowed* resolution — narrowing a template must never narrow an average.

**`/score/total` is a results dashboard, not a second entry grid.** It opens on a compact results table (name · per-subject average · average · rank), with the twenty-nine column editable matrix one toggle away for fixing a single cell. Subjects come from `classSubjects` — the class's template narrowed by its selection but **not** by the viewer's role, so a subject teacher still sees the class's whole configured curriculum. The derivations (`subjectPerformance`, `attentionList`, `topPerformer`, `sortRows`) live in [lib/scores/totals.ts](lib/scores/totals.ts), pure and tested by `scripts/verify-score-total.mts`. Two subtleties: the *subject filter* narrows `displayGroups` only and never the averages (picking "show me Khmer" is about where to look, not a claim the class studies only Khmer), whereas the *column-hiding* control does feed the averages, which is its long-standing behaviour. And because `computeRows` skips empty cells, narrowing to the taught subjects moves no number unless a mark exists under a subject the class has since removed.

The score grid's subject picker used to be a literal array (the Cambodian *primary* curriculum, compiled in). It now resolves from `score_template_subjects` (migration 00016) in three layers — `system` (national default, seeded, read-only), `school` (admin amendments), `class` (assigned-teacher amendments) — where the lowest layer present wins per `subject_key`. The merge lives in [lib/scores/template.ts](lib/scores/template.ts) (pure, no server-only imports — a client hook consumes it) with [lib/hooks/useScoreTemplate.ts](lib/hooks/useScoreTemplate.ts) on the browser side. This changes only which columns the UI *offers*: `scores.subject` stays a TEXT key, `scores_owner_period_uniq` is untouched, and every already-entered mark keeps resolving. `SubjectColumn.id` is what `scores.subject` stores — it is schema, never rename one.

### Subject identity: three levels, one live key space per level

"Subject" is identified at **three different levels**, and confusing any two silently detaches marks — so learn this table before touching anything subject-shaped:

| Identifier | Names | Example | Lives in |
| --- | --- | --- | --- |
| `subject_key` | a **subject** in a template | `khmer_all`, `math_general`, `hs_physics` | `score_template_subjects.subject_key`, `teacher_assignments.subject_key` |
| `SubjectColumn.id` | a **column** within a subject | `kh_read`, `math_num`, `hw_5` | `columns[].id` in template rows — **and this, not `subject_key`, is what `scores.subject` stores** |
| `subject_id` | a `public.subjects` row | UUID | Legacy. Never written any more; see below |

The levels genuinely overlap in one direction: a single-column subject's column id equals its `subject_key` (`kh_read` is a key *and* a column of `khmer_all`; every `hs_*` subject is single-column by design). That overlap is why the two upper levels look interchangeable in small examples and are not — a mark written under `math_general` instead of `math_num` resolves in **no** grid, and renaming in either level detaches every mark entered against it. `columnsFor()` / `maxScoreByColumn()` in [lib/scores/template.ts](lib/scores/template.ts) are the bridge from subject to columns; nothing maps a column back to a subject, because the answer is not unique.

The third level, `subject_id` UUID → `public.subjects`, never reconciled with either of the others — 00004 backfilled the catalogue's `name`/`code` from raw `scores.subject` values, i.e. **column ids**, while admins free-typed the rest — and the catalogue is empty for every self-serve school. Converged on `subject_key` for assignments:

- **Assignments carry `subject_key`** (00024/00025). Both writers — the admin console's `assignTeacher` and `/score/collect`'s `assignSubjectTeacher` — validate the key against the class's *resolved* template, and both pickers label subjects through `assignableSubjects()` in [lib/scores/template.ts](lib/scores/template.ts), so the two surfaces cannot name a subject differently. Do not add a third subject picker that reads `public.subjects`.
- **`teacher_assignments.subject_id` is legacy**: still selected (reads tolerate it), never written. Nothing ever wrote a non-NULL value outside the old admin form, and the app was never deployed, so no rows need migrating; a hypothetical old row (`subject_key` NULL) resolves as whole-class — exactly its pre-00024 meaning. Do not backfill `subject_key` from `subjects.code` — the mapping is ambiguous by construction.
- **`public.subjects` / `class_subjects` remain** as the admin catalogue (`/admin/subjects`) and 00004's backfill target; neither is load-bearing for grading or assignment.
- **`/score/template` is a redirect**, not a page. The configuration screen has always been `/score/subjects` ("មុខវិជ្ជាតាមថ្នាក់"); the `template` directory holds only server actions, and its `page.tsx` forwards to `/score/subjects` preserving `?class=`. Do not build a second configuration surface there — two pages editing one template is how they end up disagreeing.
- **The curriculum picker cannot mint a subject.** `/score/subjects` has two add buttons and the split is the product rule: "បន្ថែមមុខវិជ្ជា" picks from the class's *resolved* curriculum (`addTemplateSubjects` re-resolves server-side and refuses any key absent from it), while "បង្កើតមុខវិជ្ជាផ្ទាល់ខ្លួន" calls `addClassSubject`, which mints a `cls_` key server-side. One picks, the other extends; never merge them into one dialog with a free-text field.
- **A teacher's own subjects are ordinary class-scope template rows** since 00027. There is no second store: `/score/enter`'s add-subject dialog and `/score/subjects` both call `addClassSubject`, which mints the key server-side (`cls_`) and never lets the browser coin one. Converted rows carry the `cs_` prefix, which is what makes 00027's rollback able to find exactly its own rows. Three prefixes, three origins — `hs_`/`kh_`/`math_`/`sem_` national, `cls_` teacher-added, `cs_` converted — and none of them collide.
- **The `assessments` feature was removed, not migrated.** The table (00003) and `scores.assessment_id` exist, but nothing ever wrote a score against an assessment and no report read one; for self-serve schools the creation form's `class_subjects` picker was empty, so it could not even be used. The admin UI, action and queries are gone; the tables stay untouched. If assessment-style grading is ever built, key it on `subject_key`, not `class_subject_id`.

### Reporting: the Print Center and the document engine

`/print-center` (មជ្ឈមណ្ឌលរបាយការណ៍ និងបោះពុម្ព) is the index for every printable document, and the only front door to report generation — the sixteen report routes it links keep working untouched (`/score/print`, `/ranking`, `/honor-roll`, `/certificate`, `/yearly-report/*`, `/record-book`, …). A report either **generates through the shared engine** or **opens its existing screen**, and says which — nothing was migrated by deleting it.

The layout unit is the **family**, not the report: six panels of compact rows, filtered by a wrapping category nav and collapsed by a search across every family. A family holding exactly one report (កិត្តិយស, វិញ្ញាបនបត្រ, សៀវភៅតាមដាន) renders as a feature panel rather than a header above a single row, and the two achievement families take the `gold` accent the design system already reserves for rankings and certificates. `ReportDefinition.group` splits the seven-report yearly family into subsections — declared in the catalogue, because a second list of groupings inside `PrintCenterClient` is exactly the drift the catalogue exists to prevent. A row advertises the **active template's** format when it generates, never the definition's whole `formats` list: `certificate` is `['docx','html']` but the button produces one Word file, and the `html` half only describes the legacy screen.

**`score template` ≠ `document template`.** The first is which subjects a class assesses (`score_template_subjects`); the second is which *file* results are printed onto ([lib/reporting/report-template.ts](lib/reporting/report-template.ts)). Never merge them: a class adding a subject must not reformat a ministry document.

| Module | Responsibility |
| --- | --- |
| [report-types.ts](lib/reporting/report-types.ts) | `ReportType` identifiers (**schema** — recorded in audit metadata), categories, per-report period/format/legacy route |
| [report-template.ts](lib/reporting/report-template.ts) | The versioned registry of template files, and `GenerationMetadata` |
| [report-mapper.ts](lib/reporting/report-mapper.ts) | The `{{token}}` model and `ReportPayload` — the contract between resolvers and writers |
| [report-data.ts](lib/reporting/report-data.ts) | `server-only`. Resolvers: database → payload, through the *same* scope/template/scheme helpers the score screens use |
| [xlsx-writer.ts](lib/reporting/xlsx-writer.ts) / [docx-writer.ts](lib/reporting/docx-writer.ts) | Pure Buffer→Buffer template filling |
| [report-storage.ts](lib/reporting/report-storage.ts) | `server-only`. Reads template files off disk |

**A semester average is defined once**, in [lib/scores/semester.ts](lib/scores/semester.ts): `(examAverage + monthlyComponent) / 2`, where the coursework half averages the pupil's per-month averages across `monthsForSemester()`. `/score/total` and `ranking_semester` both call it, so they cannot disagree. Two properties are deliberate and asserted: a missing *subject* is skipped inside each half, but a missing *half* counts as **zero** (exam 8 with no coursework → 4.0) — the product's existing definition, preserved; and the month split is now semester-aware (sem1 = nov–mar, sem2 = apr–oct), fixing a bug where `/score/total` applied nov–mar to **both** semesters.

**There is no official honour criterion.** `/honor-roll` selects `.slice(0, 5)` after ranking — that is its podium layout (five cards), not a policy, and no document defines one. [lib/scores/honor.ts](lib/scores/honor.ts) therefore does **not** reproduce top-N: it evaluates configurable criteria whose defaults are read from the class's own grading scheme (`minAverage` = the scheme's ល្អ/B band — 8 on /10, 40 on /50; `noFailingSubject` = the scheme's `passMark`), so nothing is a number someone typed. `HONOR_CRITERIA_PROVENANCE = 'derived'` travels into the payload and is **printed on the sheet** alongside the rule. A strong class can honour everyone; a weak one honours nobody — which a top-N rule cannot express. Legacy `/honor-roll` keeps its top-5 behaviour and therefore disagrees with the report; that is documented, not reconciled.

**Fifteen reports run on the engine**, every one of them for primary. Three shared resolvers produce all of them, which is what stops fourteen layouts becoming fourteen arithmetics:

| Resolver (`report-data.ts`) | Reports |
| --- | --- |
| `resolveMonthlyClass()` | `score_monthly`, `ranking_monthly`, `honor` |
| `resolveSemesterClass()` | `score_semester`, `ranking_semester` |
| `resolveAnnualClass()` | `ranking_annual`, `certificate`, the seven `annual_*`, `student_tracking_record_book` |

Each pair of "same numbers, opposite reading order" reports shares one layer: a **marks grid is read down the register**, a **league table down the placings**, and sorting is the only difference between them. `score_annual` is the one report left on its legacy screen — `annual_summary` is its engine equivalent and prints the same figures.

Same class, same subjects, same averages, same ranks — so a ranking sheet cannot disagree with the score sheet it derives from. Ranking semantics are `assignRanks`': **ties share a rank and the next rank skips (1,2,2,4)**, and an unmarked pupil has a `null` average, prints no rank, and sorts last. Note legacy `/ranking` reads the **full** template while the engine and `/score/total` read the **selection-narrowed** one — a pre-existing divergence, not introduced here.

**The annual result has two sources, and the fallback is load-bearing.** [lib/scores/annual.ts](lib/scores/annual.ts) resolves each semester **stored first, derived otherwise**: stored means a `score_type='annual'` row (`sem1_avg` / `sem2_avg`), derived means `semesterAverage(exam, coursework)` — the same canonical layer `ranking_semester` uses. The fallback exists because **nothing in this application writes an annual row**: `sem1_avg` is read in five places and written in none, so a class created here has no stored year and an annual report reading only the stored sheet would print blank for every real class, for ever. `AnnualValueSource` travels into the payload and is **printed on the sheet**, because a figure a teacher recorded and one the system worked out are different claims. `promotionThreshold(scheme)` is the scheme's own `passMark` — exactly the 5.00 `/yearly-report` has always split on, sourced rather than restated — and a pupil with no annual result is `incomplete`, appearing on **neither** promotion list.

`/score/total`'s ឆ្នាំ tab reads the **same** `buildAnnualResult`, so the screen and the printed annual reports cannot disagree — it fetches both semesters' exam marks in that mode alone and shows which source the year came from. Before this it parsed `sem1_avg` inline and displayed `0.00` for every class in the app. Its `0.00`-for-no-result display is kept deliberately where the reports print a blank cell; that convention difference is documented, not reconciled. `scripts/verify-annual.mts` §K guards the shared definition structurally, because the screen's `computeRows` lives in a `.tsx` the node harnesses cannot import.

**`ReportPayload.subjects` is the one variable column region, not always subjects.** Two annual reports fill it with the year's *months*, `annual_subject_results` fills it with the scheme's *grade bands* and puts subjects in the rows. That is deliberate: a second expansion mechanism is what it avoids. `ReportRow.subjectDetail` is the additive escape hatch for page-oriented documents needing several figures under one subject — only the record book sets it, and only the DOCX writer reads it.

**The certificate is the one report whose flow asks *who*.** `ReportRequest.studentIds` is a request, never an authority: `resolveCertificate` intersects it with the roster `resolveServerScope` already validated, so a forged id names a pupil that is simply not in the set. With no selection it defaults to the pupils who **passed** the year — `បណ្ណសរសើរ` is a certificate of praise, and the rule is the existing promotion one rather than a new criterion. The picker opens pre-selected to that cohort and labels every pupil's status, so choosing a repeater deliberately is possible and informed.

**DOCX is exercised, not just plumbed.** `certificate_v1.docx` (one page per pupil) and `student_tracking_record_book_v1.docx` (one page per pupil, with a nested per-subject table) are real templates built by [scripts/docx-template-kit.mts](scripts/docx-template-kit.mts), a small OOXML emitter — the .docx counterpart of the exceljs builder, and for the same reason: a zip is not reviewable in a diff. Two `easy-template-x` rules were established by probing and are easy to get wrong: a **table-row loop opens in the first cell and closes in the last cell of the SAME row** (tags in rows of their own scope the loop to a column), and inside a loop **item fields are addressed by bare name** (`{label}`, never `{subjects.label}`).

The record book deliberately fixes two things the legacy `/record-book` screen does that a new report may not: it hard-codes thirteen subjects (here they come from the class's template) and carries its own month→semester split (here absences bucket by the class's own `score_calendar_periods`).

`scripts/verify-ranking-live.mts` and `scripts/verify-annual-live.mts` are opt-in and need a running local stack plus `supabase/fixtures/primary_ranking_teacher.sql` (and, for the second, `second_teacher_isolation.sql` — a class the caller does **not** teach, so "a forged `class_id` reaches nothing" is provable rather than vacuous). They are the only tests that exercise a real JWT, RLS and the class scope rather than stubbing the data.

The offline suites are `verify-reporting`, `verify-annual`, `verify-annual-family`, `verify-certificate`, `verify-record-book` and `verify-score-semester`. Several pin a template-less report as their "not ready" example; when that report is migrated the check fails **on purpose** — move the example to another genuinely unmigrated report rather than weakening it.

**One place decides what a card may claim.** `reportAvailability()` in `report-template.ts` derives four states — `engine_ready` (resolver + active template), `needs_template` (resolver, nothing to print onto), `legacy_only` (no resolver, but a working screen), `not_implemented` — and returns the badge, tone, action and template together. The Print Center renders that verdict; it never recomputes "ready" itself. `ReportDefinition.resolver` says only that a data resolver exists, which is deliberately *not* the same as "can be generated".

**Cell addresses appear in no TypeScript file.** Templates carry `{{class.name}}`, `{{#rows}}`, `{{#subjects}}`; the writer finds the markers and fills them, so moving a column is an edit to the .xlsx alone.

**exceljs, not `xlsx-js-style`, for template filling.** SheetJS's community build drops images, headers/footers and page setup on a read→write round trip — exactly what must be preserved. Both libraries stay: `xlsx-js-style` constructs sheets from nothing, exceljs round-trips existing ones. **Merges are handled by hand** in `expandSubjectColumns`: `spliceColumns` neither shifts merge ranges nor preserves merged masters' values, which silently blanks the letterhead — see `scripts/verify-reporting.mts`.

Template files are **build artefacts**, not committed blobs: `npm run build:templates` regenerates them from [scripts/build-report-templates.mts](scripts/build-report-templates.mts), which is the reviewable source. `score_monthly_v1` is `provenance: 'derived'` — built from what `/score/print` and `/score/total` already render, **not** a transcription of a ministry file, and the Print Center says so on the card.

## localStorage

`localStorage` is still the real store for seating and tutorial state. **Never type the key as a literal** — all of them are in [lib/constants/storage.ts](lib/constants/storage.ts) as `STORAGE_KEYS`.

| Key | Status |
| --- | --- |
| `seatingConfig` / `seatingLayout` | Live store for `attendance/layout`. |
| `lastTutorialPage`, `studentsCache` | Live. |
| `inventoryItems` | **Migrated to Supabase** (`inventory_items`, migration 00012); the localStorage reader survives only for the one-time import. Nothing writes to the key any more. |
| `customSubjects` | **Gone.** 00012 moved it to the `custom_subjects` table; 00027 then moved that into `score_template_subjects` and deleted the reader, the hook and the actions. The key is no longer read by anything. |

## Image storage: Cloudflare R2

Every uploaded image in the app now lives in one R2 bucket, and the database columns (`students.photo_url`, `settings.photo_url` / `school_logo` / `director_seal` / `teacher_signature`, `homework_assignments.image_url`) hold a **public CDN URL**, not the picture. Two older patterns were replaced and must not come back:

- **imgbb.** `/homework/send` used to POST the bytes to a third-party image host on a shared API key. Gone — no `IMGBB_API_KEY`, no `api.imgbb.com`.
- **Inline base64 data URLs.** A student photo or a school logo stored as `data:image/jpeg;base64,…` in a TEXT column is dragged along by every roster read, every printed report and every export — on Cambodian mobile data, per row. New writes store a URL.

| Module | Role |
| --- | --- |
| [lib/storage/r2.ts](lib/storage/r2.ts) | `server-only`. The `S3Client` singleton (R2 is S3-compatible: `region: 'auto'`, endpoint `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`), plus `uploadBufferToR2()`, `uploadBase64ToR2()`, and the pure helpers `parseImageDataUrl()` / `base64ByteLength()` / `extensionForMime()` that every validator shares. |
| [lib/storage/actions.ts](lib/storage/actions.ts) | `'use server'`. `uploadImageToR2Action({ dataUrl, folder })` — the single endpoint every client-side picker calls. |

**Uploading is a server action, never a browser-side S3 call.** An R2 access key handed to the browser is an open write handle on the bucket for anyone who opens devtools — precisely the mistake the old imgbb key made before it was moved server-side. Only `NEXT_PUBLIC_R2_PUBLIC_URL` crosses into the client bundle, and only as a stored read URL.

The action enforces three things a client-side upload could not: the caller is signed in (the bucket is not an open relay), the payload is one of `image/{jpeg,png,webp,gif,svg+xml}`, and it is under 10 MB — checked from the base64 length, before the bytes are materialised. Keys are `${folder}/${user.id}/${Date.now()}-${randomUUID()}.${ext}`: the `user.id` segment makes an object attributable to the account that wrote it, `Date.now()` sorts the bucket by time, and the UUID is what actually guarantees uniqueness. `folder` is a closed union (`students | profiles | homework | attachments`) — the browser cannot invent a prefix. Objects are written `immutable` with a one-year `max-age`, which is safe only because a key is never reused.

Clients still **compress on a canvas first** ([lib/utils/image.ts](lib/utils/image.ts) for enrollment, an inline resize in `ImageUploadField`) — the bytes no longer land in Postgres, but a 5 MB phone photo should not be pushed over mobile data on the way to the bucket either.

**Reads must tolerate both shapes.** Rows written before this migration still hold data URLs, so `imageDataUrl` in [lib/profile/schema.ts](lib/profile/schema.ts) accepts an `http(s)` URL *or* a `data:image/*;base64` payload, and rejects everything else — a stored value the guard refused would make its whole profile section unsavable. `<img src>` renders either without changes. There is no backfill; old values are migrated only when a teacher re-uploads.

## Shared constants and utilities

These exist because the same code was previously copy-pasted across a dozen clients. **Import them; do not redeclare.**

| Module | Provides |
| --- | --- |
| [lib/constants/months.ts](lib/constants/months.ts) | Khmer month names in both orderings: `MONTHS_BY_CALENDAR` (Jan → Dec) and `MONTHS_BY_ACADEMIC_YEAR` (Nov → Oct, the Cambodian school year), plus `KHMER_MONTH_LABELS`, the `MONTH_*_BY_*` lookups, ready-made `*_OPTIONS_*` arrays for `Select`, and the `isMonthId` guard. Each `KhmerMonth` carries `id` / `label` / `num` / `index` / `isNextYear`. |
| [lib/constants/academic.ts](lib/constants/academic.ts) | `getCurrentAcademicYear()`, `resolveCalendarYear()`, `FALLBACK_ACADEMIC_YEAR` (a stale `'2023-2024'` kept for behaviour parity — prefer `getCurrentAcademicYear()`). |
| [lib/constants/subjects.ts](lib/constants/subjects.ts) | `STANDARD_SUBJECT_LABELS` — Khmer label per `scores.subject` key. |
| [lib/grading/scheme.ts](lib/grading/scheme.ts) | The A–F ladder, previously duplicated in six clients. `DEFAULT_SCHEME_CONFIG` reproduces it exactly; per-level overrides come from `grading_schemes.config`. Pure. |
| [lib/utils/score-value.ts](lib/utils/score-value.ts) | `score_value` / `score_text` splitting, above. |
| [lib/utils/khmer-num.ts](lib/utils/khmer-num.ts) | `toKhmerNumber()` / `fromKhmerNumber()`, `KHMER_DIGITS`. |
| [lib/utils/date.ts](lib/utils/date.ts) | `calculateAge()` (`number \| null`), `formatKhmerDate()`. |
| [lib/utils/logger.ts](lib/utils/logger.ts) | Dev-only console wrapper — diagnostics here, user-facing failures to `react-hot-toast`. |
| [lib/utils/errors.ts](lib/utils/errors.ts) | `getErrorMessage()` / `getErrorMessageOr()` for `unknown` catch bindings. |
| [lib/utils/distance.ts](lib/utils/distance.ts) | Haversine distance for the GPS check-in. |
| [lib/utils/drive-image.ts](lib/utils/drive-image.ts) | `getDriveImageUrl()` — rewrites a pasted Google Drive share link to the `lh3.googleusercontent.com/d/<id>` host so `<img>` gets bytes, not a viewer page. |
| [lib/utils/xlsx.ts](lib/utils/xlsx.ts), [lib/utils/export.ts](lib/utils/export.ts) | Typed cell/style shapes for `xlsx-js-style`, and the roster export. |
| [lib/utils/cleaning-random.ts](lib/utils/cleaning-random.ts), [lib/utils/poster-tiles.ts](lib/utils/poster-tiles.ts) | Pure logic pulled out of the cleaning rota and poster splitter. |
| [lib/class-admin/books.ts](lib/class-admin/books.ts) | The 13 MoEYS class-administration books as *data*. One editor client, one print client, one table (`class_admin_entries`). Adding a book means adding an entry; the `id` values are persisted, so treat them as schema. |
| [lib/hooks/](lib/hooks) | `useActiveClass`, `useAcademicYear`, `useCustomSubjects`, `useDebounce`, `useScoreTemplate`. |

## Shared UI components

Dropdowns and pagination are centralized — **do not add a new native `<select>`, `<datalist>`, or hand-rolled pager.**

| Component | Use for |
| --- | --- |
| [components/ui/forms/Select.tsx](components/ui/forms/Select.tsx) | Short static option sets (month, semester, year, yes/no). Wraps a native `<select>` on purpose: correct keyboard/AT semantics and the OS picker on mobile. |
| [components/ui/forms/SearchableSelect.tsx](components/ui/forms/SearchableSelect.tsx) | Long, async, or searchable sets (locations, students, teachers, subjects). Custom listbox, portal-rendered. |
| [components/ui/navigation/Pagination.tsx](components/ui/navigation/Pagination.tsx) | Any paged list. |
| [components/ui/navigation/RowsPerPageSelect.tsx](components/ui/navigation/RowsPerPageSelect.tsx) | Page-size control (presentational; `Pagination` owns the wiring). |

Also available and worth checking before hand-rolling: `ui/data/DataTable`, `ui/data/StatCard`, `ui/actions/Button`, `ui/actions/BulkActionBar`, `ui/feedback/{Badge,EmptyState,Skeleton,notify}`, `ui/layout/Card`, `ui/overlay/{Dialog,BottomSheet,ConfirmDialog}`, `ui/views/{StudentCard,StudentCompactTable}`.

Both selects share [fieldStyles.ts](components/ui/forms/fieldStyles.ts) and take `options` as `string[]` or `{ value, label, disabled?, group? }[]`, `onChange(value: string)`, and `name` for native form submission. `variant="ghost"` drops the box for controls inside an already-framed header.

`Pagination` has two modes: **URL** (`searchParams` + `basePath`, renders `<Link>`s, preserves every other query param) and **controlled** (`onPageChange`, for tables already holding rows in client state — what `student-list` does). Changing page size always returns to page 1.

The only surviving native `<select>`s are the score-grid cells in `score/enter` and `score/total` — hundreds render at once inside a table, where a 44px control and a portal per cell would be wrong on both layout and performance.

## Conventions

- **Tailwind v4, CSS-first.** No `tailwind.config.*`. Theme tokens, brand colors (`#0054a6` / `#4facfe`), fonts, keyframes and the `.kh-moul` / `.animate-gradient-text` utilities all live in [app/globals.css](app/globals.css) under `@theme inline` / `@layer utilities`. Dark mode is class-based via `@custom-variant dark` + `next-themes`.
- **Semantic tokens.** `globals.css` also defines a light/dark-aware ramp — `bg-bg-app`, `bg-bg-surface`, `bg-paper`, `border-divider`, `text-text-heading` / `-body` / `-muted`, `bg-brand`, `text-brand-contrast`, `ring-focus-ring` — driven by CSS vars on `:root` / `.dark`. Use these instead of hard-coded hex or raw `gray-*` pairs.
- **Khmer typography.** `Kantumruy_Pro` for body, `Moul` for display headings — apply display styling with the `kh-moul` class, not a font utility. `<html lang="km">`.
- **Printing is a first-class feature.** ~12 clients call `window.print()` with an inline `@media print` block (`@page { size: A4 ... }`, `.no-print`, `.print-container`). Follow the existing block, and keep the `data-app-chrome` / `data-app-frame` shell contract above intact. Excel export uses `xlsx-js-style`; PDF uses `html2pdf.js` / `jspdf`.
- **Notable dependencies:** `khmer-chhankitek-calendar` (Khmer lunar dates on the monthly attendance sheet), `three` (3D classroom seating in `attendance/layout/ThreeClassroom.tsx`), `recharts` (score analysis), `react-hot-toast` (all user feedback — `Toaster` mounted in the root layout), `lucide-react` (icons).
- **`public/introduction/`** holds standalone HTML tutorial pages loaded into `/tutorial`; **`public/previews/`** and [lib/data/decorations.ts](lib/data/decorations.ts) back the classroom-decoration catalog (Google Drive links, no DB).
