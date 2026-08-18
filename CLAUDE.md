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

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`). The only other env var is `IMGBB_API_KEY` (server-only, optional — photo uploads in `/homework/send`; unset, the photo field reports uploads unavailable and everything else works). There is no service-role key anywhere, so **every** data path goes through RLS as the logged-in user — the only exceptions are the two SECURITY DEFINER functions, `create_teacher_organisation` (migration 00017) and `backfill_teacher_enrolments` (migration 00018, redefined in 00019), both keyed entirely on `auth.uid()`.

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

The wizard state is **derived from `Actor`, never stored** — same principle as legacy/v2 scoping. [lib/onboarding/state.ts](lib/onboarding/state.ts) is the single source of routing truth: `onboardingRedirect(actor)` (wired into `app/(main)/layout.tsx` and the login action) sends a brand-new teacher to `/onboarding/organisation`, resumes a partial setup at `/onboarding/class`, and deliberately returns `null` for a pre-V2 teacher with a legacy roster — interrupting a working account with a mandatory wizard risks live data, so their migration is opt-in.

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

The score grid's subject picker used to be a literal array (the Cambodian *primary* curriculum, compiled in). It now resolves from `score_template_subjects` (migration 00016) in three layers — `system` (national default, seeded, read-only), `school` (admin amendments), `class` (assigned-teacher amendments) — where the lowest layer present wins per `subject_key`. The merge lives in [lib/scores/template.ts](lib/scores/template.ts) (pure, no server-only imports — a client hook consumes it) with [lib/hooks/useScoreTemplate.ts](lib/hooks/useScoreTemplate.ts) on the browser side. This changes only which columns the UI *offers*: `scores.subject` stays a TEXT key, `scores_owner_period_uniq` is untouched, and every already-entered mark keeps resolving. `SubjectColumn.id` is what `scores.subject` stores — it is schema, never rename one.

### localStorage

`localStorage` is still the real store for seating and tutorial state. **Never type the key as a literal** — all of them are in [lib/constants/storage.ts](lib/constants/storage.ts) as `STORAGE_KEYS`.

| Key | Status |
| --- | --- |
| `seatingConfig` / `seatingLayout` | Live store for `attendance/layout`. |
| `lastTutorialPage`, `studentsCache` | Live. |
| `customSubjects`, `inventoryItems` | **Migrated to Supabase** (`custom_subjects`, `inventory_items`, migration 00012). The localStorage readers survive only for the one-time import: [lib/storage/custom-subjects.ts](lib/storage/custom-subjects.ts) exposes `readLegacyCustomSubjects()` / `toImportPayload()`, and [lib/hooks/useCustomSubjects.ts](lib/hooks/useCustomSubjects.ts) owns the fetch → import-once → refetch sequence. Nothing writes to those keys any more. |

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
