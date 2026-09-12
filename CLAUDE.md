# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## Commands

```bash
npm run dev        # next dev
npm run build      # next build (prebuild regenerates the report templates)
npm start          # next start
npm run lint       # eslint (flat config, eslint-config-next core-web-vitals + typescript)
npm run typecheck  # tsc --noEmit
npm run verify     # the 32 offline verification harnesses
npm run check      # lint + typecheck + verify, in that order — run this before you finish
```

**No Jest, but not "no tests".** `scripts/verify-*.mts` holds 35 harnesses — 32 offline, 3 opt-in
(`*-live.mts`, which need a running local Supabase stack plus the fixtures in
`supabase/fixtures/`). They are the closest thing this repository has to a test suite, and every
section below cites the one that pins it. `verify-all.mjs` discovers them from the filesystem and
runs them concurrently, printing nothing on success.

Each harness exists because a specific invariant was broken at least once, and several are
written to fail **on purpose** when a placeholder they use as an example is finally implemented —
move the example rather than weakening the check. A change that touches a shared rule should
extend a harness, not merely pass the existing ones.

`scripts/validate-rls.mjs` is separate again: a real Postgres connection to a local stack, proving
the RLS policies behaviourally rather than structurally — **64 checks**, and the only thing in the
repository that can demonstrate a cross-tenant hole. Run it as
`supabase start && node scripts/validate-rls.mjs`.

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`). The other env vars are the five Cloudflare R2 keys — `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_NAME` (all server-only) and `NEXT_PUBLIC_R2_PUBLIC_URL` (the read-only CDN host) — which back every image upload; unset, uploads report a failure and everything else works. There is no service-role key anywhere, so **every** data path goes through RLS as the logged-in user — the only exceptions are the two SECURITY DEFINER functions, `create_teacher_organisation` (migration 00017) and `backfill_teacher_enrolments` (migration 00018, redefined in 00019), both keyed entirely on `auth.uid()`.

## What this is

KruSmart — a Khmer-language classroom management app for Cambodian primary/secondary teachers (student roster, attendance, scores, homework, printable reports and certificates). UI text is Khmer; keep new user-facing strings in Khmer.

Next.js 16 App Router + React 19, Tailwind v4, Supabase (auth + Postgres).

[AUDIT.md](AUDIT.md) is the Phase 0 read-only audit that the "Enterprise V2" migration below was planned from. Useful for the *why* behind a decision; several of its findings are now closed, so don't treat it as a current defect list.

## Architecture

### Route trees

| Tree | Purpose | Gate |
| --- | --- | --- |
| `app/(main)/` | The teacher app — 45 routes, the bulk of the code. `/classroom` is the class manager and the front door for class · student · subject | Session via `proxy.ts`; layout redirects parents away |
| `app/admin/` | School console (owner / principal / school_admin) | `app/admin/layout.tsx` calls `getUserRoles()` + `isSchoolAdmin()` server-side before any child renders |
| `app/parent/(portal)/` | Parent portal — dashboard, grades, attendance, homework, family, student card | Real Supabase auth + `parent_students` link (migration 00010) |
| `app/login/` | Multi-role sign-in: `/login` (universal) plus `/login/{owner,admin,teacher,parent}`, `choose-workspace`, `reset-password`, `update-password` | Public |
| `app/onboarding/` | First-run wizard for a brand-new teacher: organisation → level → grade → class → students | Own layout (deliberately outside `(main)` — no sidebar over 26 features that can't render yet); redirects admins/parents/finished teachers away |

**`/classroom` is the class manager, and it absorbed `/classroom/classes`.** It was four link cards — ថ្នាក់របស់ខ្ញុំ, សិស្សក្នុងថ្នាក់, បញ្ចូលសិស្សថ្មី, មុខវិជ្ជា — whose first item was the class list one click further in, so the front door to class management never showed a class. The list is the page now, and the other three cards are per-class links on each card carrying `?class=`; `/classroom/classes` redirects, preserving the param, and stays declared `hidden: true` in [lib/navigation.ts](lib/navigation.ts) so the breadcrumb resolves mid-redirect (the `/score/template` pattern). **It still groups and does not relocate**: `/student-list`, `/enrollment` and `/score/subjects` keep their URLs and are linked, never reimplemented. `createClassAndAssign` in [app/onboarding/actions.ts](app/onboarding/actions.ts) remains the only class-creation path — it runs `backfill_teacher_enrolments()` the moment the assignment flips the account to v2 scope and rolls the class back if that fails, neither of which is visible from a call site.

**The create-class dialog offers a level's whole grade range, not the rows that exist.** `seedEducationLevel` writes all six primary grades, but a school seeded by an older path holds one `grades` row — and the dialog then offered one grade, in a product where primary is 1–6, with no control anywhere to add another (`/admin/classes` needs a principal; the wizard's level step runs once). `buildGradeOffer` in [lib/classroom/grades.ts](lib/classroom/grades.ts) derives the offer from `EDUCATION_LEVELS` per level the school holds, matching existing rows in **by `sort_order`, not by name** (an older or hand-typed name would otherwise be offered again as a duplicate of itself), and keeping any row outside the range because a class may already sit in it. A grade with no row carries `id: null`; `ensureGrade` (`app/(main)/classroom/actions.ts`) writes it when a class is actually put there, deriving the name from the number server-side — the browser never sends a grade name, because `classes.name` is generated from the grade number and the two must not drift.

**And a teacher of the school may actually run that flow.** All three writes it makes — `grades`, `classes`, `teacher_assignments` — gated on `is_school_admin()` (00003), which a self-serve owner passes only because 00017 grants them `owner`. A teacher who *joined* a school holds exactly `teacher` (00022 is explicit that "approval never grants admin"), so the dialog was offered to them and could not succeed: "មិនអាចបង្កើតកម្រិតថ្នាក់នេះបានទេ". Migration 00031 adds three **INSERT-only** policies for a teacher of the school and alters none of the admin ones. The load-bearing part is `classes.created_by`: an assignment row is what every class-scoped read pivots on (00003/00006/00007), so "assign yourself to a class in your school" would hand over a colleague's gradebook — the policy therefore says **a class you created**, which is a fact the schema could not previously state. The second is what `is_school_teacher()` reads: a `user_roles` grant or an active assignment, and **never `profiles.school_id`**, which `profiles_update_own` (00002) lets any user write for themselves — it is a home-school hint, not a membership record, and `/classroom` uses it only to decide which school's grades to *offer*. Renaming, deleting and staffing anyone else stay administrator-only, and the two creator DELETE policies are bounded by `class_is_unused()` so they are an undo of `rollbackClass` and never a way to destroy a class that has a pupil in it. The cross-table lookups are SECURITY DEFINER (`is_own_created_class`, `class_is_unused`) for the reason 00003 gives: written inline, a policy on `teacher_assignments` that reads `classes` recurses into `classes_select_assigned_or_admin` and raises `42P17` on **every** assignment write in the product. `scripts/validate-rls.mjs` proves the allowance and each denial against a real database; `verify-classroom.mts` §7 pins the policy shapes.

The dashboard's "មុខងារទាំងអស់" grid is **derived from `NAV_SECTIONS`**, not a second list. It used to be a hand-written array of 29 tiles with its own labels, its own `adminOnly` flag and its own search box beside the command palette's — and it had drifted: no `/print-center`, no `/classroom`, no `/attendance/yearly`, and `/administration` reachable *only* from it, declared in no module, so the breadcrumb blanked on arrival. Do not reintroduce a second navigation list.

`app/page.tsx` redirects to `/dashboard`. Per-role login screens are presentation only — `ROLE_CONFIGS` in [lib/auth/role-config.ts](lib/auth/role-config.ts) supplies the Khmer copy and icon; the actual credentials and roles are the same everywhere.

### Auth and session

- [proxy.ts](proxy.ts) — Next.js 16 renamed `middleware.ts` to `proxy.ts`, and the exported function is `proxy()`. It delegates to [lib/supabase/middleware.ts](lib/supabase/middleware.ts), which intentionally calls `getSession()` rather than `getUser()` — the comment explains this avoids Supabase free-tier rate limiting and random logouts on every route change. Don't "fix" this to `getUser()` without understanding that tradeoff. `SchoolContextProvider` and `TeacherContextProvider` use `getSession()` for the same reason.
- Public routes are `/`, anything under `/login`, and `/parent/login`. Everything else redirects to `/login`. The proxy only asserts that *a* session exists — role gating happens in layouts.
- Three Supabase client factories, all named `createClient` — pick by context: [lib/supabase/client.ts](lib/supabase/client.ts) (browser), [lib/supabase/server.ts](lib/supabase/server.ts) (server components / actions, `await cookies()`), [lib/supabase/middleware.ts](lib/supabase/middleware.ts) (proxy only).
- `app/login/actions.ts` covers password login, signup, and email-OTP verification; `app/auth/callback/route.ts` handles the PKCE code exchange.

### The app shell

`app/(main)/layout.tsx` is **not** a bare wrapper: it resolves the actor, redirects parents to `/parent/dashboard`, sends never-set-up teachers into `/onboarding` via `onboardingRedirect(actor)`, and wraps everything in `SchoolContextProvider` → `TeacherContextProvider` → [`AppShell`](components/shell/AppShell.tsx). `AppShell` renders `TopNav`, `Sidebar` (≥1024px), `MobileNav` (<1024px) and `Breadcrumb`, so **a new `(main)` page must not render `<TopNav />` itself** — the layout owns it.

Because every printable view now sits under the shell, the shell disappears on paper via two attributes handled in `globals.css`: `data-app-chrome` → `display:none`, `data-app-frame` → `display:contents` (drops the box from layout while keeping children, so an A4 sheet measures the same as before the shell existed). Keep both attributes on any new frame element.

[lib/navigation.ts](lib/navigation.ts) is the information architecture: `NAV_MODULES` groups the flat routes into twelve modules across four sections, and `moduleForPath` drives both the sidebar highlight and the breadcrumb. URLs are deliberately *not* renamed to match the grouping. A detail route reached from a row rather than a menu (e.g. `/students/[id]`) still has to be declared, with `hidden: true`.

**Every `(main)` route sits in the same frame, and it is checked.** Phase 0 measured the seam: 16 of 45 routes used `PageContainer` / `PageHeader` and the other 29 hand-rolled a container between them across **six** different content widths, each with its own `<h1>` treatment and its own vertical rhythm. No individual screen was wrong; the product read as a collection of pages because the joins did not line up. The contract is written at the top of [components/shell/PageContainer.tsx](components/shell/PageContainer.tsx) and `scripts/verify-page-frame.mts` is the half that fails the build — R1 the container, R2 no page height or background of its own, R3 a declared header rather than a loose `<h1>`, R4 a class-scoped route says *which* class, R5 none of the six competing columns, R6 a fixed-millimetre sheet sits in a `.preview-scroll`.

An A4 sheet legitimately has its own width and its own headings, so lines carrying a print marker are removed before R5 is applied. What a sheet must not do is wrap the whole route.

**[`ClassContextBar`](components/shell/ClassContextBar.tsx) answers "which class am I in?" once.** Presentation only: it reads `useActiveClass()`, gates on `isClassScopedPath(pathname)` — the *same* list `withClassParam` uses, never a second array — and holds no state, no selector and no storage. Three states, and the middle one matters: not class-scoped renders nothing, a legacy or still-loading account renders nothing, and a resolved class renders `class · grade · year` with an honest `ថ្នាក់ទី —` where the grade is genuinely unknown.

**`/administration` is a redirect to `/admin/dashboard`.** It used to render an invented school of 1,250 pupils and a per-teacher radar chart; of its six headline figures only two are computable and `dropoutRisk` has no definition anywhere in this product. Rebuilding it would have created a second school-analytics surface in the teacher tree. It stays declared `hidden` so the breadcrumb resolves mid-redirect, and the actor check runs **before** the hand-off so a parent is refused at the door rather than inside the admin tree.

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

### The active class travels — do not break the chain

The selection has two halves that must always agree: `TeacherContext` on the client and `?class=` on the server. Three mechanisms keep them in step, and each of them fails **silently** if removed — the page renders, the numbers are real, they are simply another class's.

| Mechanism | Module | What it fixes |
| --- | --- | --- |
| **Carried on every link** | [lib/utils/classHref.ts](lib/utils/classHref.ts) (`withClassParam`, pure) + [lib/hooks/useClassHref.ts](lib/hooks/useClassHref.ts) | Not one navigation surface used to carry `?class=`. Selecting ៥ខ on `/classroom` and then clicking ពិន្ទុ in the sidebar landed on `/score/enter` unparameterised, where `resolveServerScope` served the **default** class's marks under a top bar still reading ៥ខ. |
| **Read back from the URL** | [components/shell/ClassParamSync.tsx](components/shell/ClassParamSync.tsx) → `TeacherContext.syncFromClassId` | `?class=` used to flow one way only: the switcher wrote it, nothing read it. A bookmark, a shared link or one of `/classroom`'s per-class tools rendered the requested class's data under the *default* class's name. It also makes the client-only screens (`/enrollment`, `/score/collect`) honour a deep link at all. |
| **One default rule** | `TeacherContext` imports `chooseAssignment` from [lib/utils/defaultClass.ts](lib/utils/defaultClass.ts) | The client used to default to its own display sort (year desc → homeroom → class name) while the server used homeroom → oldest → id. Two homeroom rows in one year is legal, so the chip and the data could name different classes. |

`CLASS_SCOPED_ROUTES` in `classHref.ts` declares which routes read the class; `withClassParam` leaves everything else untouched, because `?class=` on `/profile` is a lie in the address bar and gets copied into shared links. The list is **checked, not trusted**: `scripts/verify-class-context.mts` parses every page under `app/(main)/` and fails if a route resolves a class without being declared, or is declared without existing — plus that every nav surface routes through the hook and leaves no bare `href={module.href}` behind. Adding a class-scoped route means adding it to that list; the harness will tell you if you forget.

None of this is authorization. `resolveServerScope` re-validates the id against the caller's own assignments on every request, so a forged or stale `?class=` resolves to the caller's own default.

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
| `00029_score_calendar_periods.sql` | `score_calendar_periods` — which months a school grades as one period, read by `periodForDate`/`fetchScoreCalendar`. |
| `00030_audit_logs_select_own.sql` | One SELECT policy, `actor_id = auth.uid()`, so the dashboard's សកម្មភាពថ្មីៗ can read the rows the teacher themselves wrote. Still no UPDATE and no DELETE. |
| `00031_teacher_class_creation.sql` | Lets a teacher of a school create a grade and a class in it, and staff **themselves** onto that class. Adds `classes.created_by` (defaulted to `auth.uid()`) — the key the self-assignment policy is written on — plus `is_school_teacher()` and two definer lookups. Widens no existing policy: renaming, deleting and staffing anybody else stay administrator-only. |
| `00032_homework_assignments_class_scope.sql` | `homework_assignments.class_id`, nullable and never backfilled — `/homework/send` was the last class-scoped workflow in the product with no class dimension, so a teacher holding two classes published one list to both classes' parents. **Replaces** 00001's INSERT/UPDATE policies rather than supplementing them: permissive policies are ORed, so an added policy would have widened rather than narrowed. `is_class_of_my_child()` keeps a parent's reach on a NULL-class row, which is every row written before this. |
| `00033_enrolment_requires_relationship.sql` | Closes the enrolment counterpart of the hole 00011 closed for marks. 00003's write policy authorises by CLASS and never by STUDENT, so **any form master could enrol any pupil id into their own class** — including from another school — and thereby acquire read access through 00006/00007. Demonstrated `201 Created` across two schools before the fix. Keeps 00003's class predicate character-for-character and ANDs `can_enrol_student()` onto it. |

`supabase/legacy/` holds superseded partial snapshots — **do not apply them**. `supabase/README.md` still describes the pre-V2 world in places (it claims the scores conflict key omits `teacher_id`, and that there is no classes table); the migrations and this file are the newer account. Verify against the live project before relying on any of it.

### The dashboard reports; it does not calculate

`/dashboard` answers *what does this teacher need to do for this class today* — active class, roster, today's attendance, **this period's marking progress**, outstanding tasks, quick actions, recent activity. It is the one screen that summarises every other one, which makes it the easiest place in the product to grow a private arithmetic: the rows are already in hand and the figure is one loop away. It had two.

**The tile said ប្រចាំខែ and meant the year.** The query fetches the whole academic year (`like '%<year>'`) and the old derivation folded all of it into one bucket per pupil keyed by `subject` — so December's Khmer mark overwrote November's, over a query carrying **no `ORDER BY`**, which made the figure unstable between two refreshes with no data changing. `strugglingCount`, and therefore the attention list, inherited it. The rows are now bucketed by month through the shared `monthlyAveragesByStudent`, and only the **current period's** months are read out — the period coming from `periodForDate(fetchScoreCalendar(...))`, so a school grading មីនា–មេសា as one period is averaged over both. The year-wide read stays: the period is a filter over it, not a second query.

**The attention line said ក្រោម ៥ whatever the class marked out of.** It is `scheme.passMark` now — 25 on a /50 secondary class.

**Marking progress is counted once for three screens.** [lib/scores/completion.ts](lib/scores/completion.ts) (pure) holds the three rules that are easy to get subtly wrong: a mark is `score_value` **or** `score_text` (the `sem_eval_*` columns are Khmer words); a pupil counts **once per subject**, not once per column, so a seven-column subject is not seven times as marked; and the denominator is always the **roster**, so an untouched subject reads `0 / 42` and never `0 / 0`. `/score/collect` and the dashboard call `subjectProgress`, so the bar and that screen's rows cannot disagree — the bar says how much is left, that page says which. `/score/enter` calls `rosterProgress`, which answers the entry grid's own question — how many *pupils* have been got through, unioned across the displayed subjects rather than summed, since a pupil marked in two of them is one pupil. It used to count that inline and drop `score_text`, so a pupil carrying only a Khmer rating read as done on the other two screens and as not started on the one being typed into; `verify-score-workspace.mts` §8 now runs the two functions against the same rows and asserts they agree for a single subject.

**Recent activity needed migration 00030.** `audit_logs` had exactly two policies: insert-your-own and select-if-`is_school_admin`. A teacher wrote to the trail on every save and could read none of it, so the section would have rendered empty for every teacher, for ever. 00030 adds one policy — `actor_id = auth.uid()` — plus the `(actor_id, created_at DESC)` index that predicate needs. It adds **no UPDATE and no DELETE**: the trail stays append-only, and `/admin/audit-logs` is untouched because permissive SELECT policies are ORed. `auditLogBatch` writes **one** row carrying `metadata.count` — forty marks is one `score.updated` row with `count: 40` — so the feed reads that metadata rather than counting rows, which would say "១ ប្រអប់" for a class of forty. Consecutive identical actions are still folded, counts summed, because saving the same grid eight times should not push yesterday off the screen. An action with no Khmer phrasing is **dropped, not printed raw**: a feed that occasionally prints `class_template.selection_applied` reads as a leak rather than a history, and the label map is written from real call sites because the `AuditAction` union ends in `(string & {})` and so documents nothing.

**There is no separate report-shortcut row.** The Print Center is the single document hub (§8), so the quick action points there rather than the dashboard growing its own list of favourite reports — which is exactly the competing menu the `FeatureGrid` rewrite removed.

**Progress is measured against the work a teacher can do.** `ServerGradingContext` carries two subject lists and neither screen decides for itself: `subjects` is the whole curriculum and is what every average, rank, certificate and report reads — *narrowing a template must never narrow an average* — while `taughtSubjects` is that list narrowed by `class_template_subjects`, i.e. exactly what `/score/enter`'s grid offers. The dashboard and `/score/collect` count progress over the second. Fed the first, they told a class teaching three subjects that thirty-two more were outstanding and pinned the bar near 9% for ever, because the other thirty-two could not be marked at all. `applySelection` returns the full list for a class that has configured nothing, so an account that never opened `/score/subjects` is unchanged.

`scripts/verify-dashboard.mts` pins all of it, including that the old flat-bucket fold and the literal ៥ do not come back.

### The score workspace: one vocabulary, one scope, one arithmetic

Marking a class is **one job spread over seven screens** — `/score/enter`, `/score/total`, `/score/print`, `/score/collect`, `/score/subjects`, `/ranking`, `/score-analyse`. Three rules keep them behaving as one workspace rather than seven products, and each of them fails *silently*: the page renders and the numbers look plausible.

**1 — One vocabulary.** [lib/scores/workspace.ts](lib/scores/workspace.ts) (pure) declares the period ladder `monthly → semester → annual` with its Khmer labels, and `SCORE_WORKSPACE_TABS`. Screens render it; they do not restate it. Before this `/score/enter` said ពិន្ទុប្រចាំខែ, `/score/total` said ប្រចាំខែ, and `/ranking` called the third rung **`yearly`** — a fourth name for what `scores.score_type`, `lib/scores/annual.ts` and `ranking_annual` all call `annual`, which that screen then had to translate on the way to every fetch. [components/score/ScoreWorkspaceHeader.tsx](components/score/ScoreWorkspaceHeader.tsx) renders class · year · subject · period plus the tabs, so every score screen answers the same five questions in the same order. **A tab carries the period only where the destination declares it reads one** (`carriesPeriod`) — `?mode=` on a screen that ignores it is a claim the address bar makes and the page does not honour.

**2 — Every score fetch names its class.** `getScores`/`saveScores` (`score/enter/actions.ts`) and `getAllScoresByPeriod`/`getAnnualAverages`/`getMonthlyScoresForYear` (`score/total/actions.ts`) all take an optional `classId`. **Omitting it is a bug, not a default**: `resolveServerScope(user.id)` then resolves the caller's *oldest homeroom* while the page resolved `?class=`, so a teacher holding two classes saw one class's roster beside the other's marks — or an empty grid, reading as "no marks entered yet". The parameter existed on `getScores` with a comment describing exactly this failure, and **not one call site passed it**. Every client now derives `scopeClassId = useActiveClass().classId ?? undefined` and threads it through, including the callback dependency arrays — a stale closure here means switching class does not refetch.

**3 — One annual arithmetic.** `deriveSemesterAverages` ([lib/scores/annual.ts](lib/scores/annual.ts)) and `monthlyAveragesByStudent` / `monthIdFromPeriod` ([lib/scores/aggregate.ts](lib/scores/aggregate.ts)) hold the composition that turns raw marks into the two semester figures `buildAnnualResult` consumes. It used to live inside `/score/total`'s client component, which is precisely why `/ranking` could not reach it and grew its own: two `parseFloat`s off `sem1_avg`/`sem2_avg` and a hand-counted divisor. Since **nothing in this application writes an annual row**, those keys are always empty — `/ranking`'s ប្រចាំឆ្នាំ button printed `0.00` beside every pupil and ranked them all equal, while `/score/total` and the printed sheet showed the real year. Three surfaces, one question, two answers, one of them a constant.

**A teacher cannot mint a subject from the entry screen.** `/score/enter` carried a "បន្ថែមមុខវិជ្ជា" dialog beside the subject picker; it is gone. `/score/subjects` is the single configuration surface — which is why `/score/template` is already a redirect to it — and the picker links there. Two screens minting subjects is how they come to disagree about a class's curriculum, and a teacher part-way through forty marks should not be one click from redefining what the class assesses. Nothing was lost: `addClassSubject` is unchanged and still owned by `/score/subjects`.

`scripts/verify-score-workspace.mts` guards all four, and `verify-annual.mts` §K now pins `/score/total`, `/ranking` **and** `report-data.ts` to `deriveSemesterAverages` rather than to `semesterAverage` merely appearing in each file — a file can call the inner function while composing the outer rule its own way, which is exactly how `/ranking` came to disagree.

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

**The picker folds the curriculum into subjects and their components** ([lib/scores/curriculum.ts](lib/scores/curriculum.ts)). 00028 seeds `khmer_all` with seven columns *and* each of those seven skills as a subject of its own — and `SubjectColumn.id` is what `scores.subject` stores, so `khmer_all`'s អាន column and the standalone `kh_read` subject are **the same score column**. Offered side by side they were not two choices but one spelled twice, and ticking both rendered `kh_read` twice in the grid. `foldCurriculum` makes a multi-column subject an *entry* and absorbs any single-column subject whose column belongs to an entry **in the same group** — 34 monthly rows become 11 decisions, 18 semester rows become 14. The group boundary is load-bearing (`life_skill` is both a key and a column id), and the rule is generic: secondary is single-column with distinct keys, so it folds to itself. This is presentation only — no row is deleted, and deleting that file restores the flat list without a migration. A class that selected a standalone key on the old screen still reads as its bundle with that component ticked (`entryState`), and the next edit consolidates it (`planSelectionChange`), which moves no mark because the column ids are identical on both sides. `scripts/verify-subject-fold.mts` parses the curriculum out of 00028 itself and asserts both properties.

**`/score/subjects` is two controls, not four buttons and two modals.** The switch says whether the class teaches a subject; the chips say which components it marks; `GridPreview` shows the columns `/score/enter` will render. **លាក់ is no longer offered, only reversed** — the definition-layer hide and the selection-layer removal were one sentence to a teacher and two different writes, so the switch is now the single answer and an already-hidden subject keeps its unhide in the កែ dialog. Toggling is deliberately not toasted: a switch that moves has already reported itself.

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
- **A teacher cannot mint a curriculum subject.** Picking one is the on/off switch on its row, which writes `class_template_subjects` through `applySubjectSelection` — the server re-resolves the class's curriculum and refuses any key absent from it. Inventing one is the separate "បង្កើតមុខវិជ្ជាផ្ទាល់ខ្លួន" button, which calls `addClassSubject` and mints a `cls_` key server-side. One picks, the other extends; never merge them into one dialog with a free-text field.
- **A teacher's own subjects are ordinary class-scope template rows** since 00027. There is no second store: `/score/enter`'s add-subject dialog and `/score/subjects` both call `addClassSubject`, which mints the key server-side (`cls_`) and never lets the browser coin one. Converted rows carry the `cs_` prefix, which is what makes 00027's rollback able to find exactly its own rows. Three prefixes, three origins — `hs_`/`kh_`/`math_`/`sem_` national, `cls_` teacher-added, `cs_` converted — and none of them collide.
- **The `assessments` feature was removed, not migrated.** The table (00003) and `scores.assessment_id` exist, but nothing ever wrote a score against an assessment and no report read one; for self-serve schools the creation form's `class_subjects` picker was empty, so it could not even be used. The admin UI, action and queries are gone; the tables stay untouched. If assessment-style grading is ever built, key it on `subject_key`, not `class_subject_id`.

### Attendance: four marks, one meaning

`attendance.status` is free TEXT with four values in play, no CHECK constraint, and — until
[lib/attendance/status.ts](lib/attendance/status.ts) — nothing declaring what any of them meant.
Eleven surfaces each decided for themselves, and they did not agree.

**`L` is ច្បាប់ — an absence the school permitted.** That is what the only screen that writes a
status calls its own button, what the monthly register prints as "ច", what the yearly sheet gives
a ច្ប column of its own, and what the printed parent report counts under អវត្តមាន. The **parent
portal** read it as `មកយឺត` — arrived late — and added it to the numerator of the attendance
rate, so a pupil their teacher recorded as away with permission was shown to their own parent as
present and on time. The sheet the teacher hands over and the portal that parent signs into
stated different rates for the same days.

**`AP` is a legacy spelling of `L`.** Declared by the type, written by nothing, counted as an
absence by five readers and dropped silently by five others. `report-data.ts` disagreed with
*itself*: `absenceKind` folded it into unexcused while `resolveRecordBook`, 800 lines later,
counted it as the excused half — and that same resolver read `A` and `AP` while describing them
as "the two statuses the attendance feature writes", so it skipped every `L`. **The excused
column of every printed record book was structurally zero.**

Two rules do all the work now, and every counting surface reads them:

- **`inClass` is the only question a rate may ask, and only `P` answers yes.** Permission excuses
  an absence; it does not undo it. `unexcused` answers "is this child truant", which is a
  different question and is on the page beside it.
- **The denominator is days recorded, not days in the month.** A register kept for nine days of
  twenty describes nine days.

`tallyAttendance()` is the arithmetic; `markFor()` tolerates a value this application does not
know and counts it as `unknown` rather than folding it into something it is not. `ENTRY_MARKS`
holds the three a teacher may write — offering both spellings of one mark is how the
disagreement started. `scripts/verify-attendance.mts` runs the module and then checks that no
surface has grown a private copy, including the exact ratio the two parent-facing screens
disagreed about.

The register's completion strip lives in
[`RegisterTally`](<app/(main)/attendance/layout/RegisterTally.tsx>) **above** the view switcher,
not inside the list view where it started — the seating plan and the 3D room are the two views a
desk user is most likely to pick, and neither distinguishes "not marked" from "marked present" at
a glance.

### Students: one pupil, one enrolment rule, one document index

`/students/[id]` is the pupil **whole** — identity, enrolment, attendance, marks, homework, performance — and it is the only screen that aggregates them; every fact is still *written* on the screen that owns it (`/enrollment` for the record, `/score/enter` for marks, `/attendance/layout` for the register), which is why they are linked and not duplicated.

**The pupil's class comes from their enrolment, never from `students.grade`.** That column is free text on the pupil row; it goes stale the moment a pupil is promoted, while `student_enrollments` is what every roster read in the app actually uses. `enrolmentHistory(studentId)` in [lib/utils/serverScope.ts](lib/utils/serverScope.ts) returns every non-withdrawn placement newest-first, and `currentEnrolment` is **derived from it** rather than being a second query with the same intent — two queries that mean the same thing drift, and this pair would make the page link to one class while grading against another. `.neq('status','withdrawn')` for the usual reason: a past year is stamped `promoted`/`transferred`, and filtering on `active` would hide a pupil's whole history.

Its action links carry the **pupil's** class, not the teacher's active one: the page is reached by id — a roster row, a search result, a neighbour arrow — so the ambient selection is easily a different class, and "បញ្ចូលពិន្ទុ" on a ៦ក pupil must open ៦ក's grid.

**`/enrollment` names the class that receives the pupil.** It always scoped its write by `activeClassId` and never showed it; a teacher holding two classes filled forty fields with no way to tell which roster the pupil landed in, and a misplaced pupil is corrected by a transfer, not by an edit. The class it writes into is still `?class=` first and context second — onboarding links here as `/enrollment?class=<id>` before `TeacherContext` hydrates.

**Every printable screen is catalogued in the Print Center.** Six were not: the four student documents (`/id-student`, `/print-student-codes`, `/print-list`, `/print-student-age`), `/parent-report`, plus `/student-tracking` and `/class-admin` — all reachable only as items in a navigation module, which is the competing document menu the Print Center exists to replace. They are indexed, **not rebuilt**: `resolver: false` + a `legacyHref`, so `reportAvailability` renders them `legacy_only` (badge ទំព័រដើម, button opens the screen). Claiming a resolver would offer a generate button that produces nothing.

The `សិស្ស` nav module therefore lists **four** entries, not eight — roster, enrolment, tracking, and `ឯកសារសិស្ស` pointing at `/print-center?category=student` (the page validates the category against the catalogue and falls back to the full index). The four document routes stay declared as `hidden`, so `moduleForPath` still resolves them and `/student-list`'s own toolbar links keep working.

**A teacher can move a pupil between their own classes.** A pupil's class *is* their enrolment, so before this the only remedy for a misplacement was to delete and re-enter, destroying the id every score and attendance row hangs off. The close-then-open sequence lives once in [lib/enrolment/move.ts](lib/enrolment/move.ts) and **authorises nobody** — deliberately, because a shared write that quietly applied one caller's rule would silently widen or narrow the other. The two callers differ *only* in who they let through: the admin console by `requirePermission('enrollments:update')`, the teacher app by being form master of **both** ends, with ownership of the `students` row standing in when there is no enrolment to leave. It always stamps `transferred`, never `promoted` — promotion is a year-end decision across a class, not a side effect of fixing a typo. 00003 has granted homeroom teachers this since V2; only the application withheld it.

`scripts/verify-students.mts` fails when a new `window.print()` screen is not catalogued — you must either catalogue it or record *why* it is not a document in its `NOT_DOCUMENTS` map, and a stale exclusion fails too.

### Results: three screens, one answer

**លទ្ធផល is a module of its own.** `/ranking`, `/score/collect`, `/score-analyse` and
`/honor-roll` were `hidden: true` children of ពិន្ទុ, so the brief's "RESULTS" step had no
representation in navigation at all — the three screens below existed and nothing offered them
together. They are one module now, with `/ranking` as the front door, and the ពិន្ទុ module's own
front door moved from `/score/total` to `/score/enter`: a teacher who clicks ពិន្ទុ means to enter
marks, not to read them. No URL moved. `verify-navigation.mts` asserts each of the four is offered
by លទ្ធផល and hidden in no other module.


`/ranking`, `/honor-roll` and `/certificate` are three presentations of one question — how did this class do in this period, and in what order. Each carried its own copy of the answer, and all three copies had the **same** defect in the annual branch: two `parseFloat`s off `sem1_avg`/`sem2_avg` and a hand-counted divisor. Since nothing in this application writes an annual row, all three printed `0.00` beside every pupil of every real class, ranked equal, while `/score/total` and the printed sheets showed the real year. One bug written three times is one missing module.

[lib/scores/periodResults.ts](lib/scores/periodResults.ts) is that module — pure, and it invents no arithmetic: monthly/semester delegate to `studentAverage`, the year to `deriveSemesterAverages` then `buildAnnualResult`, the order to `assignRanks`. It does **not** fetch: the three screens read slightly different row sets (annual needs both semesters' exams and the year's months), and a builder owning the queries would have to own their differences too. Results come back in **roster order** with a rank attached — a marks register is read down the register, a league table down the placings, and each screen sorts for itself.

**`/honor-roll` had no criterion.** It ranked and took `.slice(0, 5)` — a property of the podium's five cards, so a class where everybody failed still produced five honourees, and a teacher asking "why is this pupil not listed?" could only be told "someone else was fifth". It uses `evaluateHonor` + `defaultHonorCriteria` now, the same rule the printed `honor` report applies, so screen and document finally name the same pupils. The podium still holds five; everyone else who qualified is listed beneath rather than silently dropped, which is the difference between a layout and a policy. The rule and its `derived` provenance are **printed on the sheet**.

**`/yearly-report/promoted` and `/repeated` named nobody, in any class, ever.** `buildAnnualRows` read the stored annual sheet only, so every pupil's average was null, and `PromotionListClient` correctly drops nulls from both lists — so the symptom was two permanently empty sheets, while the engine's `annual_promoted_students` printed the real decision from the same data. `loadAnnualReportData` now resolves the derived halves server-side and passes the class's own `promotionThreshold`, so the subtitle quotes a /50 secondary class's pass mark instead of restating primary's 5.00.

**`/record-book` hard-coded thirteen primary columns**, so a lower-secondary class printed primary subject names with every mark blank — the `sem_kh_*` column ids do not exist in its curriculum. It resolves from the class's semester template now, splitting marks from worded assessments on `column.type === 'select'` (a fact about the column, not a guess from its name). The compiled-in list survives as `FALLBACK_SUBJECTS` for a pre-V2 account with no template to resolve.

**Teacher assignments can be undone.** `removeAssignment` had existed in `app/admin/actions.ts` since the console was built — permission-gated, audited, revalidating — and was called from nowhere, so a teacher who left kept RLS access to the class and kept appearing in `/score/collect`. The console lists each assignment as its own row (class · subject, labelled through the same `listAssignableSubjects` the assignment form's picker uses) with a confirming remove control.

**A rank is an ordering position; a placing is a claim.** `assignRanks` weighs a null average as 0, which is what puts unmarked pupils last and lets a screen sort a whole roster in one pass — but a pupil who was never marked has not placed anywhere. `report-data.ts` said so five times (`average === null ? '' : …`) and **no screen said it once**, so `/ranking` printed "៤" beside pupils the ranking sheet built from the same figures left blank. `placing()` in [lib/scores/periodResults.ts](lib/scores/periodResults.ts) is that rule, beside the result it is a property of, and both surfaces read the one copy.

`scripts/verify-score-workspace.mts` §6 pins the three league tables to the one builder; `verify-annual.mts` §K pins all four surfaces to `deriveSemesterAverages`; `verify-ux-consistency.mts` covers reachability, the single shell, the named class, the record book and the assignment removal.

### Reporting: the Print Center and the document engine

`/print-center` (មជ្ឈមណ្ឌលរបាយការណ៍ និងបោះពុម្ព) is the index for every printable document, and the only front door to report generation — the sixteen report routes it links keep working untouched (`/score/print`, `/ranking`, `/honor-roll`, `/certificate`, `/yearly-report/*`, `/record-book`, …). A report either **generates through the shared engine** or **opens its existing screen**, and says which — nothing was migrated by deleting it.

**The unit of layout is the errand, not the category.** The centre listed nine families as nine equal panels — a catalogue, which is the wrong shape because a teacher does not arrive with a category in mind, they arrive with this month's job. `REPORT_SECTIONS` in [report-types.ts](lib/reporting/report-types.ts) groups the nine categories into five *shelves* by errand (របាយការណ៍ផ្លូវការ · វត្តមាន · លទ្ធផលប្រចាំឆ្នាំ · ឯកសាររដ្ឋបាលថ្នាក់ · ឯកសារសិស្ស); a shelf's `groups` name the runs inside it, and `ReportDefinition.group` subdivides the seven-report yearly family further. All of it is declared in the catalogue, because a second list of groupings inside `PrintCenterClient` is exactly the drift the catalogue exists to prevent. Categories are untouched and still canonical — `?category=student` and `?category=certificate` are declared navigation destinations and still resolve, now landing on the shelf that holds them, opened.

Three things above the shelves answer "what am I printing?" before any list is read:

- **`បោះពុម្ពឆាប់ៗ`** — `QUICK_ACTION_REPORTS`, a fixed four, each resolved against the period bar. Every one of them must generate (`verify-reporting.mts` pins it): the biggest buttons on the page may not say កំពុងរៀបចំ.
- **The period bar** — the rung and its value are page context, not a question buried in each dialog. The ladder comes from `SCORE_SCOPES` ([lib/scores/workspace.ts](lib/scores/workspace.ts)) and the resolution from [lib/reporting/print-period.ts](lib/reporting/print-period.ts), so a row's `ខែកញ្ញា ២០២៦`, a quick-print card and the dialog cannot name the period differently. It is context and **not a filter**: a row reads the rung it declares and ignores the other two. The default month is `currentMonthId()` resolved **server-side** — `new Date()` in the client is a hydration mismatch, and the old constant `nov` was wrong eleven months in twelve.
- **Progressive disclosure** — a shelf opens on arrival only when it holds a P0 document (`PRIMARY_DOCUMENTS`) that reads the current rung, so September opens ពិន្ទុ and វត្តមាន and leaves the seven annual rows shut. A closed shelf names its runs and counts its documents. Seeded once: changing the period afterwards is a statement about which month, never a request to rearrange the page.

**Nothing in the teacher-facing index names an engine artefact.** `reportAvailability`'s four `status` values are unchanged and are still what anything keying on availability reads, but its `label` says what happens — `រួចរាល់`, `បោះពុម្ពពីអេក្រង់`, `កំពុងរៀបចំ` — never `ត្រូវកំណត់ Template` (an artefact a teacher cannot supply) or `ទំព័រដើម` (the migration state of this codebase). The badge appears only where the answer is not simply yes. `actionLabel` is `បើក`: the control opens the flow, and naming it after the flow's last step made teachers believe a file had been written when they clicked away. A row advertises the **active template's** format when it generates, never the definition's whole `formats` list, and drops `html` when it opens a screen, because the badge already said so. The template's name and its `provenance` moved out of the row and into the generation flow, where they are a claim the teacher is about to make rather than a fact about the build.

**The flow is a rail, not a wizard:** ឯកសារ → រយៈពេល → ជម្រើស → ពិនិត្យ → ទាញយក, all on one panel, with only ជម្រើស folded away and only when it holds nothing required. It defaults to `activeTemplate(type)` and not `templatesFor(type)[0]` — the latter is newest-version-first and will happily pick a version marked `isActive: false`, which made the index's row and the dialog disagree about which file the button produces. It says **ទាញយក**, never បោះពុម្ព: the engine writes a file, and the screens are what print.

**The roadmap is not in the catalogue.** `PLANNED_DOCUMENT_GROUPS` names the four unbuilt families (CALM, GEIP teaching plans, pupil learning plans, agreements) as plain text with no `ReportType`, no category and no availability, rendered as one collapsed block at the foot. The catalogue's own invariant — pinned by both `verify-reporting.mts` and `verify-students.mts` — is that no entry may be both resolver-less and screen-less, and minting fourteen schema identifiers for documents with no screen, no data and no template would have broken it for a roadmap. One of these graduates by gaining a screen or a resolver and **moving** into `REPORT_DEFINITIONS`.

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

**There is no official honour criterion.** `/honor-roll` used to select `.slice(0, 5)` after ranking — a property of the podium's five cards, not a policy, and no document defines one. [lib/scores/honor.ts](lib/scores/honor.ts) therefore does **not** reproduce top-N: it evaluates configurable criteria whose defaults are read from the class's own grading scheme (`minAverage` = the scheme's ល្អ/B band — 8 on /10, 40 on /50; `noFailingSubject` = the scheme's `passMark`), so nothing is a number someone typed. `HONOR_CRITERIA_PROVENANCE = 'derived'` travels into the payload and is **printed on the sheet** alongside the rule. A strong class can honour everyone; a weak one honours nobody — which a top-N rule cannot express. **The screen has been converged onto the same rule** (see the Results section): the podium still holds five, everyone else who qualified is listed beneath rather than silently dropped, and the criterion is printed on the sheet. The earlier note here saying the two were left to disagree is out of date.

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

**The fixtures own their classes, and that is load-bearing.** `primary_ranking_teacher.sql` used to seed into `៤ក` — the same class the `ranktest` account is used to browse the app with — and its enrolment step read `SELECT id FROM students WHERE teacher_id = <the teacher>`, which sweeps *every* pupil the account owns into the fixture's class. Between them, thirty app-created pupils, ninety-three September marks and a fourth subject drifted into the middle of both harnesses' assertions, and the two live suites failed for four phases while being carried forward as "known fixture drift". The fixture seeds `៤ខ តេស្ត` now, enumerates the five pupil ids it enrols, and bounds its three DELETEs to its own class and its own five pupils. It also resolves the teacher from `auth.users` by email rather than from a hardcoded uuid the header asked you to hand-edit — which is the other half of how it went stale. **Do not point a fixture at a class anybody browses.**

The offline suites are `verify-reporting`, `verify-annual`, `verify-annual-family`, `verify-certificate`, `verify-record-book` and `verify-score-semester`. Several pin a template-less report as their "not ready" example; when that report is migrated the check fails **on purpose** — move the example to another genuinely unmigrated report rather than weakening it.

**One place decides what a card may claim.** `reportAvailability()` in `report-template.ts` derives four states — `engine_ready` (resolver + active template), `needs_template` (resolver, nothing to print onto), `legacy_only` (no resolver, but a working screen), `not_implemented` — and returns the badge, tone, action and template together. The Print Center renders that verdict; it never recomputes "ready" itself. `ReportDefinition.resolver` says only that a data resolver exists, which is deliberately *not* the same as "can be generated".

**A sheet is paper, and it says so once.** Eleven screens render an A4 sheet and they held two contradictory theories of what one is — *paper always* (`bg-white text-black`, nine of them) and *a themed card that becomes paper when printed* (`bg-bg-surface print:bg-white`, the other two). Every dark-mode defect on a document screen was a fragment of one theory inside the other: `/print-list` declared its ground and not its ink, so 202 names inherited `--foreground` and printed near-white on white paper; `/inventory` and `/cleaning-schedule` did the reverse and **printed a navy block**, because an element background survives `@media print` and `print-color-adjust` is exact.

Paper won, because a document screen is a preview of a printed thing — the same reason the shell disappears via `display: contents` rather than being restyled. The contract is `.print-container, .print-sheet { background: #FFFFFF; color: #111827 }` in `@layer components`, and the layer is load-bearing: a sheet that means something else by its ink (`/ranking` prints navy) says so with a utility class, and a utility must keep winning the cascade. Adding a printable screen means adding one of those two class names; `scripts/verify-documents.mts` fails if a sheet has neither, or if one grounds itself in a theme token.

**Cell addresses appear in no TypeScript file.** Templates carry `{{class.name}}`, `{{#rows}}`, `{{#subjects}}`; the writer finds the markers and fills them, so moving a column is an edit to the .xlsx alone.

**exceljs, not `xlsx-js-style`, for template filling.** SheetJS's community build drops images, headers/footers and page setup on a read→write round trip — exactly what must be preserved. Both libraries stay: `xlsx-js-style` constructs sheets from nothing, exceljs round-trips existing ones. **Merges are handled by hand** in `expandSubjectColumns`: `spliceColumns` neither shifts merge ranges nor preserves merged masters' values, which silently blanks the letterhead — see `scripts/verify-reporting.mts`.

Template files are **build artefacts**, not committed blobs: `npm run build:templates` regenerates them from [scripts/build-report-templates.mts](scripts/build-report-templates.mts), which is the reviewable source. `score_monthly_v1` is `provenance: 'derived'` — built from what `/score/print` and `/score/total` already render, **not** a transcription of a ministry file, and the Print Center says so on the card.

## localStorage

`localStorage` is still the real store for seating and tutorial state. **Never type the key as a literal** — all of them are in [lib/constants/storage.ts](lib/constants/storage.ts) as `STORAGE_KEYS`.

It is a support mechanism, not a store for anything load-bearing. **The active class in particular never goes here**: two tabs must not disagree about which class is being edited, so it lives in `TeacherContext` and travels in the URL. Core data belongs in Postgres; do not introduce new critical system state into this table.

| Key | Status |
| --- | --- |
| `seatingConfig` / `seatingLayout` | Live store for `attendance/layout`. |
| `lastTutorialPage`, `studentsCache` | Live. |
| `enrollmentDraft` | Live — an unsaved `/enrollment` form. Suppressed in **both** directions while editing an existing pupil: a draft must not overwrite a real record, and editing one must not overwrite the draft. |
| `pendingLevel` | Live, and a *hint* only. The education level a brand-new teacher picked before signing in, carried across Google OAuth in `sessionStorage` and **re-validated server-side** by `createOrganisation`. |
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
| [lib/grading/scheme.ts](lib/grading/scheme.ts) | The A–F ladder, previously duplicated in six clients. `DEFAULT_SCHEME_CONFIG` reproduces it exactly; per-level overrides come from `grading_schemes.config`. Pure. **`coefficientOf(maxScore, scheme)` is the only way to get a មេគុណ** — it needs the scheme because មេគុណ is a property of the level, not of the full mark: design §3.2 gives បឋមសិក្សា `weighting: 'simple'`, where every subject weighs 1 whatever it is marked out of, and only អនុ/វិទ្យាល័យ divide by `NATIONAL_COEFFICIENT_UNIT` (៥០ ពិន្ទុ = មេគុណ ១). `lib/scores/template.ts` deliberately exports no level-blind `coefficientFor(max)`: it did, `/score/subjects` showed its result, and primary teachers were told their /10 subject carried `មេគុណ 0.2`. Screens reach the scheme through `schemeForLevel()` in [lib/grading/levelSchemes.ts](lib/grading/levelSchemes.ts), which falls back to primary for an unresolved level. |
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

- **Tailwind v4, CSS-first.** No `tailwind.config.*`. The brand ramp, theme tokens, fonts, keyframes and the `.kh-moul` / `.animate-gradient-text` utilities all live in [app/globals.css](app/globals.css) under `@theme inline` / `@layer utilities`. Dark mode is class-based via `@custom-variant dark` + `next-themes`. **`#0054a6` and `#4facfe` were the brand before that ramp replaced them** — they survived in the documents until `/parent-report` was printing a fourteen-token letterhead in a blue the product no longer had. The paper navy is brand-800 `#1D3E73`; `verify-documents.mts` D5 keeps the retired literals out of rendered code.
- **Semantic tokens.** `globals.css` also defines a light/dark-aware ramp — `bg-bg-app`, `bg-bg-surface`, `bg-paper`, `border-divider`, `text-text-heading` / `-body` / `-muted`, `bg-brand`, `text-brand-contrast`, `ring-focus-ring` — driven by CSS vars on `:root` / `.dark`. Use these instead of hard-coded hex or raw `gray-*` pairs.
- **A fill and the ink on it have to move together.** The brand *ramp* is fixed in both themes by design (`bg-brand-800` must mean the same navy on a light page and a dark one); the *semantic* tokens flip. Pair them wrongly and the result is invisible at night, silently and in one theme only. Three pairs exist for exactly this, and each replaced a real defect:
  - `bg-brand-soft` / `text-brand-on-soft` — the quiet brand chip. `bg-brand-100 text-brand` measured **1.96:1** on dark across 43 elements, because the ramp stayed pale while `--brand` flipped to cyan.
  - `text-brand-contrast` on a `bg-brand` fill — `text-white` measured **2.13:1** on the dark cyan.
  - `text-warning-text` / `text-danger-text` — `--warning` and `--danger` are tuned as fills and 10% tints; as *labels* they measure 2.39:1 and 3.94:1 on the light ground. The fill must not move, so the label gets its own token.

  `scripts/verify-design-system.mts` computes those ratios from the tokens rather than trusting them. Four status colours are still used as labels below 4.5:1 (`text-success`, `text-danger`, `text-brand-500`, `text-gold`) — values and counts in `docs/phase10-implementation.md` §4.
- **Khmer typography.** `Hanuman` for body text, `Moul` for display headings — apply display styling with the `kh-moul` class, not a font utility. `<html lang="km">`. Both are self-hosted through `next/font/google` in [app/layout.tsx](app/layout.tsx), which redeclares `--font-hanuman` / `--font-moul` on `<body>` with hashed family names; the literals in `globals.css` are only the fallback. The Tailwind utility is `font-hanuman` — there is no `font-kantumruy` any more, and a component must not re-declare `font-family: 'Hanuman'` locally, because that literal names a font nothing loads.
- **Printing is a first-class feature.** ~21 clients call `window.print()`. The baseline — the `body` reset and `.no-print` / `.print-hide` — is declared **once** in `globals.css`; a page keeps its own `@page` (size and margin are genuinely per-document) and does not restate the rest. Keep the `data-app-chrome` / `data-app-frame` shell contract and the `.print-container` / `.print-sheet` paper contract intact. Excel export uses `xlsx-js-style`; PDF uses `html2pdf.js` / `jspdf`.
- **Notable dependencies:** `khmer-chhankitek-calendar` (Khmer lunar dates on the monthly attendance sheet), `three` (3D classroom seating in `attendance/layout/ThreeClassroom.tsx`), `recharts` (score analysis), `react-hot-toast` (all user feedback — `Toaster` mounted in the root layout), `lucide-react` (icons).
- **`public/introduction/`** holds standalone HTML tutorial pages loaded into `/tutorial`; **`public/previews/`** and [lib/data/decorations.ts](lib/data/decorations.ts) back the classroom-decoration catalog (Google Drive links, no DB).
