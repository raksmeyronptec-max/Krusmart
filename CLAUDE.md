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

Next.js 16 App Router + React 19, Tailwind v4, Supabase (auth + Postgres). Not a git repository.

## Architecture

### Three separate route trees

| Tree | Purpose | Auth |
| --- | --- | --- |
| `app/(main)/` | The teacher app — ~29 features, the bulk of the code | Supabase email/password |
| `app/admin/` | School-principal console (`app/admin/layout.tsx` has its own sidebar) | Same Supabase session; several nav targets are still `#` |
| `app/parent/` | Parent portal | **Stubbed** — `parent-login` fakes a 1s delay then routes to a hardcoded dashboard |

`app/page.tsx` redirects to `/dashboard`. `app/(main)/layout.tsx` is a bare wrapper — `<TopNav />` is imported by individual pages, not by the layout, so new `(main)` pages must render it themselves.

### Auth and session

- [middleware.ts](middleware.ts) delegates to [lib/supabase/middleware.ts](lib/supabase/middleware.ts). It intentionally calls `getSession()` rather than `getUser()` — the comment explains this avoids Supabase free-tier rate limiting and random logouts on every route change. Don't "fix" this to `getUser()` without understanding that tradeoff.
- Public routes are exactly `/` and `/login`; everything else redirects to `/login`.
- Three Supabase client factories, all named `createClient` — pick by context: [lib/supabase/client.ts](lib/supabase/client.ts) (browser), [lib/supabase/server.ts](lib/supabase/server.ts) (server components / actions, `await cookies()`), [lib/supabase/middleware.ts](lib/supabase/middleware.ts) (middleware only).
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

The SQL in `supabase/` is a **stale snapshot, not the source of truth.** `master_schema.sql` and `migrations/00001_init.sql` are identical; the numbered and `batch*` files are earlier fragments of the same tables. The live database has drifted:

- `scores` — code writes `score_period` and `score_value`; the SQL declares `month` and `score`. Upserts use `onConflict: 'student_id, subject, score_type, score_period'`.
- `settings` — code reads `photo_url`, which is absent from the SQL.
- `profiles`, `schools`, `teacher_attendance` — used by [TopNav](components/TopNav.tsx) GPS check-in and `app/admin/teacher-attendance`, but have **no SQL file at all**.

Verify columns against the live Supabase project before relying on these files, and expect to write the migration yourself when adding one.

### The `scores` table carries four different things

Discriminated by `score_type` + `score_period`, all through the shared actions in [score/enter/actions.ts](app/(main)/score/enter/actions.ts):

- `monthly` → period `` `${month}-${academicYear}` ``
- `semester` → period `` `${semester}-${academicYear}` ``; subject names are prefixed `sem_`
- `annual` → period `` `annual-${academicYear}` ``
- `homework` → period `` `${year}_${month}` `` (underscore, unlike the others — `homework/enter` imports `getScores`/`saveScores` from the score feature)

The `homework_scores` table defined in SQL is unused by the app.

### Client-side state that never reaches Supabase

`localStorage` is the real store for several features: `inventoryItems`, `custom_subjects` (user-defined subjects shared by score entry and totals), `seatingConfig` / `seatingLayout`, `ptec_last_tutorial_page`, `krusmart_students_cache`. Changing a subject list or seating layout means touching localStorage keys, not the database.

## Conventions

- **Tailwind v4, CSS-first.** No `tailwind.config.*`. Theme tokens, brand colors (`#0054a6` / `#4facfe`), fonts, keyframes and the `.kh-moul` / `.animate-gradient-text` utilities all live in [app/globals.css](app/globals.css) under `@theme inline` / `@layer utilities`. Dark mode is class-based via `@custom-variant dark` + `next-themes`.
- **Khmer typography.** `Kantumruy_Pro` for body, `Moul` for display headings — apply display styling with the `kh-moul` class, not a font utility.
- **Printing is a first-class feature.** ~12 clients call `window.print()` with an inline `<style jsx>`-style `@media print` block (`@page { size: A4 ... }`, `.no-print`, `.print-container`). Follow the existing block when adding a printable view. Excel export uses `xlsx-js-style`, PDF uses `html2pdf.js`.
- **Notable dependencies:** `khmer-chhankitek-calendar` (Khmer lunar dates on the monthly attendance sheet), `three` (3D classroom seating view in `attendance/layout/ThreeClassroom.tsx`), `recharts` (score analysis), `react-hot-toast` (all user feedback — `Toaster` mounted in the root layout).
- **`public/introduction/`** holds standalone HTML tutorial pages loaded into the `/tutorial` page; **`public/previews/`** and [lib/data/decorations.ts](lib/data/decorations.ts) back the classroom-decoration catalog (Google Drive links, no DB).
- The root-level `check_table.js`, `extract.js`, `fix_escapes.js`, `fix_queries.js`, `test_cal.js` are one-off scripts with hardcoded Windows paths from an earlier migration — dead weight, don't run them.
