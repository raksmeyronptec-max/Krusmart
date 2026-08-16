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

Requires `.env.local` with `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`). These are the only env vars the app reads; there is no service-role key anywhere, so **every** data path goes through RLS as the logged-in user.

## What this is

KruSmart — a Khmer-language classroom management app for Cambodian primary/secondary teachers (student roster, attendance, scores, homework, printable reports and certificates). UI text is Khmer; keep new user-facing strings in Khmer.

Next.js 16 App Router + React 19, Tailwind v4, Supabase (auth + Postgres).

## Architecture

### Three separate route trees

| Tree | Purpose | Auth |
| --- | --- | --- |
| `app/(main)/` | The teacher app — ~29 features, the bulk of the code | Supabase email/password |
| `app/admin/` | School-principal console (`app/admin/layout.tsx` has its own sidebar) | Same Supabase session; several nav targets are still `#` |
| `app/parent/` | Parent portal | **Stubbed** — `parent-login` fakes a 1s delay then routes to a hardcoded dashboard |

`app/page.tsx` redirects to `/dashboard`. `app/(main)/layout.tsx` is a bare wrapper — `<TopNav />` is imported by individual pages, not by the layout, so new `(main)` pages must render it themselves.

### Auth and session

- [proxy.ts](proxy.ts) — Next.js 16 renamed `middleware.ts` to `proxy.ts`, and the exported function is `proxy()`. It delegates to [lib/supabase/middleware.ts](lib/supabase/middleware.ts), which intentionally calls `getSession()` rather than `getUser()` — the comment explains this avoids Supabase free-tier rate limiting and random logouts on every route change. Don't "fix" this to `getUser()` without understanding that tradeoff.
- Public routes are exactly `/` and `/login`; everything else redirects to `/login`.
- Three Supabase client factories, all named `createClient` — pick by context: [lib/supabase/client.ts](lib/supabase/client.ts) (browser), [lib/supabase/server.ts](lib/supabase/server.ts) (server components / actions, `await cookies()`), [lib/supabase/middleware.ts](lib/supabase/middleware.ts) (proxy only).
- `app/login/actions.ts` covers password login, signup, and email-OTP verification; `app/auth/callback/route.ts` handles the PKCE code exchange.

### Page pattern

Most `(main)` features are a trio of colocated files:

```
app/(main)/<feature>/page.tsx          server component: createClient() → getUser() → redirect('/login') → fetch → pass initialX
app/(main)/<feature>/<Feature>Client.tsx  "use client": all UI, editing, printing, export
app/(main)/<feature>/actions.ts        'use server': mutations, re-check getUser(), then revalidatePath()
```

See [student-list/page.tsx](app/(main)/student-list/page.tsx) + [actions.ts](app/(main)/student-list/actions.ts) as the reference implementation. A handful of pages (`dashboard`, `enrollment`, `cleaning-schedule`, `team`, `tutorial`) are client-only and query Supabase from the browser instead.

**Every query must be scoped by `.eq('teacher_id', user.id)`** even though RLS already enforces it — that's the existing convention, and delete/update actions rely on it as a second guard.

### Multi-tenancy

Every table is keyed on `teacher_id → auth.users(id)` with four RLS policies of the form `auth.uid() = teacher_id`. A "class" is a teacher account; there is no classes table. The teacher's `user.id` doubles as the "class code" that TopNav copies to the clipboard for parents.

## Data model caveats

The SQL in `supabase/` is a **stale snapshot, not the source of truth.** [migrations/00001_init.sql](supabase/migrations/00001_init.sql) is the canonical baseline; the earlier partial snapshots live in `supabase/legacy/` and must not be applied. See [supabase/README.md](supabase/README.md). The live database has drifted:

- `scores` — code writes `score_period` and `score_value`; the SQL declares `month` and `score`. Upserts use `onConflict: 'teacher_id, student_id, subject, score_type, score_period'`, matching the `scores_owner_period_uniq` index from migration 00002. **`teacher_id` is part of the key on purpose** — without it, two teachers assigned to the same class and subject would silently overwrite each other's marks. Dropping it also breaks the write outright: Postgres rejects the narrower target with `42P10` (no matching unique constraint).
- `settings` — code reads `photo_url`, which is absent from the SQL.
- `profiles`, `schools`, `teacher_attendance` — used by [TopNav](components/TopNav.tsx) GPS check-in and `app/admin/teacher-attendance`, but have **no SQL file at all**.

Verify columns against the live Supabase project before relying on these files, and expect to write the migration yourself when adding one.

### The `scores` table carries four different things

Discriminated by `score_type` + `score_period`, all through the shared actions in [score/enter/actions.ts](app/(main)/score/enter/actions.ts):

- `monthly` → period `` `${month}-${academicYear}` ``
- `semester` → period `` `${semester}-${academicYear}` ``; subject names are prefixed `sem_`
- `annual` → period `` `annual-${academicYear}` ``
- `homework` → period `` `${academicYear}_${monthId}` ``, e.g. `2025-2026_nov`. Note the **underscore** separator, unlike the hyphen the other three use — and note that the left half is the full academic year, not a calendar year, so a filter like `` score_period.startsWith(`${calendarYear}_`) `` matches nothing. `subject` is `hw_<dayOfMonth>`, and a homework month runs the 26th of the previous month to the 25th of this one. `homework/enter` imports `getScores`/`saveScores` from the score feature.

The `homework_scores` table defined in SQL is unused by the app.

### Client-side state that never reaches Supabase

`localStorage` is the real store for several features. **Never type the key as a literal** — every one is in [lib/constants/storage.ts](lib/constants/storage.ts) as `STORAGE_KEYS`: `inventoryItems`, `customSubjects` (user-defined subjects shared by score entry and totals), `seatingConfig` / `seatingLayout`, `lastTutorialPage`, `studentsCache`. Changing a subject list or seating layout means touching localStorage, not the database.

`custom_subjects` additionally has a typed reader/writer in [lib/storage/custom-subjects.ts](lib/storage/custom-subjects.ts) — use `readCustomSubjects()` / `writeCustomSubjects()` / `appliesTo()` rather than parsing the JSON again.

## Shared constants and utilities

These exist because the same code was previously copy-pasted across a dozen clients. **Import them; do not redeclare.**

| Module | Provides |
| --- | --- |
| [lib/constants/months.ts](lib/constants/months.ts) | Khmer month names in both orderings. `MONTHS_BY_CALENDAR` (Jan → Dec) and `MONTHS_BY_ACADEMIC_YEAR` (Nov → Oct, the Cambodian school year), plus `KHMER_MONTH_LABELS`, the `MONTH_*_BY_*` lookup maps, ready-made `*_OPTIONS_*` arrays for `Select`, and the `isMonthId` guard. Each `KhmerMonth` carries `id` / `label` / `num` / `index` / `isNextYear`. |
| [lib/constants/academic.ts](lib/constants/academic.ts) | `getCurrentAcademicYear()`, `resolveCalendarYear()`, and `FALLBACK_ACADEMIC_YEAR` (a stale `'2023-2024'` kept for behaviour parity — prefer `getCurrentAcademicYear()` in new code). |
| [lib/constants/storage.ts](lib/constants/storage.ts) | `STORAGE_KEYS`, above. |
| [lib/utils/khmer-num.ts](lib/utils/khmer-num.ts) | `toKhmerNumber()` / `fromKhmerNumber()` and `KHMER_DIGITS`. |
| [lib/utils/date.ts](lib/utils/date.ts) | `calculateAge()` (returns `number \| null`) and `formatKhmerDate()`. |
| [lib/utils/logger.ts](lib/utils/logger.ts) | Dev-only console wrapper — diagnostics go here, user-facing failures go to `react-hot-toast`. |
| [lib/utils/errors.ts](lib/utils/errors.ts) | `getErrorMessage()` / `getErrorMessageOr()` so `catch` blocks can take `unknown`. |
| [lib/utils/distance.ts](lib/utils/distance.ts) | Haversine distance for the GPS check-in. |
| [lib/types.ts](lib/types.ts) | Row types for every table. Follows the **live** schema, not the SQL snapshot. |

## Shared UI components

Dropdowns and pagination are centralized — **do not add a new native `<select>`, `<datalist>`, or hand-rolled pager.**

| Component | Use for |
| --- | --- |
| [components/ui/forms/Select.tsx](components/ui/forms/Select.tsx) | Short static option sets (month, semester, year, yes/no). Wraps a native `<select>` on purpose: correct keyboard/AT semantics and the OS picker on mobile. |
| [components/ui/forms/SearchableSelect.tsx](components/ui/forms/SearchableSelect.tsx) | Long, async, or searchable sets (locations, students, teachers, subjects). Custom listbox, portal-rendered. |
| [components/ui/navigation/Pagination.tsx](components/ui/navigation/Pagination.tsx) | Any paged list. |
| [components/ui/navigation/RowsPerPageSelect.tsx](components/ui/navigation/RowsPerPageSelect.tsx) | Page-size control (presentational; `Pagination` owns the wiring). |

Both selects share [fieldStyles.ts](components/ui/forms/fieldStyles.ts) and take `options` as `string[]` or `{ value, label, disabled?, group? }[]`, `onChange(value: string)`, and `name` for native form submission. `variant="ghost"` drops the box for controls inside an already-framed header.

`Pagination` has two modes: **URL** (`searchParams` + `basePath`, renders `<Link>`s, preserves every other query param) and **controlled** (`onPageChange`, for tables already holding rows in client state — which is what `student-list` does). Changing page size always returns to page 1.

The only surviving native `<select>`s are the score-grid cells in `score/enter` and `score/total` — hundreds render at once inside a table, where a 44px control and a portal per cell would be wrong on both layout and performance.

## Conventions

- **Tailwind v4, CSS-first.** No `tailwind.config.*`. Theme tokens, brand colors (`#0054a6` / `#4facfe`), fonts, keyframes and the `.kh-moul` / `.animate-gradient-text` utilities all live in [app/globals.css](app/globals.css) under `@theme inline` / `@layer utilities`. Dark mode is class-based via `@custom-variant dark` + `next-themes`.
- **Semantic tokens.** `globals.css` also defines a light/dark-aware ramp — `bg-bg-surface`, `bg-paper`, `border-divider`, `text-text-heading` / `-body` / `-muted`, `bg-brand`, `text-brand-contrast`, `ring-focus-ring` — driven by CSS vars on `:root` / `.dark`. Use these in shared components instead of hard-coded hex or raw `gray-*` pairs.
- **Khmer typography.** `Kantumruy_Pro` for body, `Moul` for display headings — apply display styling with the `kh-moul` class, not a font utility.
- **Printing is a first-class feature.** ~12 clients call `window.print()` with an inline `<style jsx>`-style `@media print` block (`@page { size: A4 ... }`, `.no-print`, `.print-container`). Follow the existing block when adding a printable view. Excel export uses `xlsx-js-style`, PDF uses `html2pdf.js`.
- **Notable dependencies:** `khmer-chhankitek-calendar` (Khmer lunar dates on the monthly attendance sheet), `three` (3D classroom seating view in `attendance/layout/ThreeClassroom.tsx`), `recharts` (score analysis), `react-hot-toast` (all user feedback — `Toaster` mounted in the root layout).
- **`public/introduction/`** holds standalone HTML tutorial pages loaded into the `/tutorial` page; **`public/previews/`** and [lib/data/decorations.ts](lib/data/decorations.ts) back the classroom-decoration catalog (Google Drive links, no DB).
