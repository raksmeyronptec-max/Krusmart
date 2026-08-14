# KruSmart — ជំនួយការគ្រូបង្រៀនឌីជីថល

A Khmer-language classroom management app for Cambodian primary and secondary school teachers. One teacher account = one class: student roster, attendance, scores, homework, and a large set of printable reports, certificates and ID cards.

Built with Next.js 16 (App Router) + React 19, Tailwind v4, and Supabase for auth and Postgres.

> All user-facing text is Khmer. Keep new strings in Khmer.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project values
npm run dev                  # http://localhost:3000
```

`/` redirects to `/dashboard`, which requires a session — you'll land on `/login`. Sign up there with email + password, then verify via the emailed OTP.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Production build (also where TypeScript errors surface — `tsc` is `noEmit`) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (flat config: `eslint-config-next` core-web-vitals + typescript) |

There is **no test framework configured**. Type checking happens through `npm run build`.

### Environment

`.env.local` needs exactly two variables:

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

There is no service-role key anywhere in the project. **Every** data path runs through RLS as the logged-in user, from both server and browser.

---

## Features

The dashboard at `/dashboard` is a searchable grid of 26 tools:

| Area | Routes |
| --- | --- |
| **Students** | `/enrollment` (បញ្ចូលព័ត៌មានសិស្ស), `/student-list` (បញ្ជីឈ្មោះសិស្ស), `/id-student` (បោះពុម្ពកាតសិស្ស), `/print-student-codes` (លេខកូដសិស្ស) |
| **Attendance** | `/attendance/layout` (ចុះវត្តមានតាមប្លង់តុ — 3D seating view), `/attendance/monthly` (បញ្ជីវត្តមានប្រចាំខែ, with Khmer lunar dates) |
| **Scores** | `/score/enter`, `/score/total`, `/ranking`, `/score-analyse`, `/score-analysis/subject`, `/honor-roll`, `/yearly-report` |
| **Homework** | `/homework/enter`, `/homework/send` |
| **Reports & printing** | `/parent-report`, `/certificate`, `/record-book`, `/student-tracking`, `/print-list`, `/print-student-age`, `/administration` |
| **Classroom** | `/cleaning-schedule`, `/inventory`, `/decorations`, `/notifications` |
| **Account** | `/profile`, `/tutorial`, `/team` |

---

## Architecture

### Three route trees

| Tree | Purpose | Auth |
| --- | --- | --- |
| `app/(main)/` | The teacher app — the bulk of the code | Supabase email/password |
| `app/admin/` | School-principal console with its own sidebar ([app/admin/layout.tsx](app/admin/layout.tsx)) | Same Supabase session |
| `app/parent/` | Parent portal | **Stubbed** — `parent-login` fakes a 1s delay and routes to a hardcoded dashboard |

`app/(main)/layout.tsx` is a bare wrapper. `<TopNav />` is imported by **individual pages**, not by the layout, so a new `(main)` page has to render it itself.

In the admin sidebar, `/admin/users`, plus three `#` placeholders (គ្រប់គ្រងថ្នាក់រៀន, របាយការណ៍សាលា, សេចក្តីជូនដំណឹង), are not implemented yet.

### Auth and session

- [proxy.ts](proxy.ts) is the Next.js 16 proxy (the file formerly known as `middleware.ts`). It delegates to `updateSession` in [lib/supabase/middleware.ts](lib/supabase/middleware.ts).
- That helper deliberately calls **`getSession()` rather than `getUser()`** — the inline comment explains it avoids hitting the Supabase API on every route change, which caused free-tier rate limiting and random logouts. Don't "fix" this without understanding the tradeoff.
- Public routes are exactly `/` and `/login`. Everything else redirects to `/login`.
- Three Supabase client factories, all exported as `createClient` — pick by context:
  - [lib/supabase/client.ts](lib/supabase/client.ts) — browser
  - [lib/supabase/server.ts](lib/supabase/server.ts) — server components and actions (`await cookies()`)
  - [lib/supabase/middleware.ts](lib/supabase/middleware.ts) — proxy only
- [app/login/actions.ts](app/login/actions.ts) handles password login, signup and email-OTP verification; [app/auth/callback/route.ts](app/auth/callback/route.ts) handles the PKCE code exchange.

### Page pattern

Most `(main)` features are a trio of colocated files:

```
app/(main)/<feature>/page.tsx             server component: createClient() → getUser() → redirect('/login') → fetch → pass initialX
app/(main)/<feature>/<Feature>Client.tsx  "use client": all UI, editing, printing, export
app/(main)/<feature>/actions.ts           'use server': mutations, re-check getUser(), then revalidatePath()
```

[student-list/page.tsx](app/(main)/student-list/page.tsx) + [student-list/actions.ts](app/(main)/student-list/actions.ts) is the reference implementation. A handful of pages (`dashboard`, `enrollment`, `cleaning-schedule`, `team`, `tutorial`) are client-only and query Supabase straight from the browser.

**Every query must be scoped by `.eq('teacher_id', user.id)`** even though RLS already enforces it. That's the convention here, and delete/update actions rely on it as a second guard.

### Multi-tenancy

Every table is keyed on `teacher_id → auth.users(id)` with four RLS policies of the form `auth.uid() = teacher_id`. **A "class" is a teacher account** — there is no classes table. The teacher's `user.id` doubles as the class code that `TopNav` copies to the clipboard for parents.

---

## Data model

Tables in `supabase/`: `students`, `attendance`, `scores`, `settings`, `notifications`, `cleaning_schedules`, `seating_layout`, `homework_assignments`, `homework_scores`.

### ⚠️ The SQL in `supabase/` is a stale snapshot, not the source of truth

`master_schema.sql` and `migrations/00001_init.sql` are identical; the numbered and `batch*` files are earlier fragments of the same tables. The live database has drifted:

- **`scores`** — code writes `score_period` and `score_value`; the SQL declares `month` and `score`. Upserts use `onConflict: 'student_id, subject, score_type, score_period'`.
- **`settings`** — code reads `photo_url`, absent from the SQL.
- **`profiles`, `schools`, `teacher_attendance`** — used by [TopNav](components/TopNav.tsx) GPS check-in and `app/admin/teacher-attendance`, but have **no SQL file at all**.
- **`homework_scores`** is defined in SQL but unused by the app.

Verify columns against the live Supabase project before relying on these files, and expect to write the migration yourself when adding one.

### `scores` carries four different things

Discriminated by `score_type` + `score_period`, all through the shared actions in [score/enter/actions.ts](app/(main)/score/enter/actions.ts):

| `score_type` | `score_period` format | Notes |
| --- | --- | --- |
| `monthly` | `` `${month}-${academicYear}` `` | |
| `semester` | `` `${semester}-${academicYear}` `` | subject names prefixed `sem_` |
| `annual` | `` `annual-${academicYear}` `` | |
| `homework` | `` `${year}_${month}` `` | underscore, unlike the others; `homework/enter` imports `getScores`/`saveScores` from the score feature |

### State that never reaches Supabase

`localStorage` is the real store for several features:

`inventoryItems` · `custom_subjects` (user-defined subjects shared by score entry and totals) · `seatingConfig` / `seatingLayout` · `ptec_last_tutorial_page` · `krusmart_students_cache`

Changing a subject list or seating layout means touching localStorage keys, not the database.

---

## Shared UI components

Dropdowns and pagination are centralized — **do not add a new native `<select>`, `<datalist>`, or hand-rolled pager.**

| Component | Use for |
| --- | --- |
| [components/ui/forms/Select.tsx](components/ui/forms/Select.tsx) | Short static option sets (month, semester, year, yes/no). Wraps a native `<select>` on purpose: correct keyboard/AT semantics and the OS picker on mobile. |
| [components/ui/forms/SearchableSelect.tsx](components/ui/forms/SearchableSelect.tsx) | Long, async or searchable sets (locations, students, teachers, subjects). Custom listbox, portal-rendered. |
| [components/ui/navigation/Pagination.tsx](components/ui/navigation/Pagination.tsx) | Any paged list. |
| [components/ui/navigation/RowsPerPageSelect.tsx](components/ui/navigation/RowsPerPageSelect.tsx) | Page-size control (presentational; `Pagination` owns the wiring). |

Both selects share [fieldStyles.ts](components/ui/forms/fieldStyles.ts) and take `options` as `string[]` or `{ value, label, disabled?, group? }[]`, `onChange(value: string)`, and `name` for native form submission. `variant="ghost"` drops the box for controls inside an already-framed header.

`Pagination` has two modes: **URL** (`searchParams` + `basePath`, renders `<Link>`s, preserves every other query param) and **controlled** (`onPageChange`, for tables already holding rows in client state — what `student-list` does). Changing page size always returns to page 1.

The only surviving native `<select>`s are the score-grid cells in `score/enter` and `score/total`, where hundreds render at once inside one table and a 44px control plus a portal per cell would be wrong on both layout and performance.

---

## Conventions

- **Tailwind v4, CSS-first.** No `tailwind.config.*`. Theme tokens, brand colors (`#0054a6` / `#4facfe`), fonts, keyframes and the `.kh-moul` / `.animate-gradient-text` utilities all live in [app/globals.css](app/globals.css) under `@theme inline` / `@layer utilities`. Dark mode is class-based via `@custom-variant dark` + `next-themes`.
- **Semantic tokens.** `globals.css` defines a light/dark-aware ramp — `bg-bg-surface`, `bg-paper`, `border-divider`, `text-text-heading` / `-body` / `-muted`, `bg-brand`, `text-brand-contrast`, `ring-focus-ring` — driven by CSS vars on `:root` / `.dark`. Use these in shared components instead of hard-coded hex or raw `gray-*` pairs.
- **Khmer typography.** `Kantumruy_Pro` for body, `Moul` for display headings — apply display styling with the `kh-moul` class, not a font utility. `<html lang="km">`.
- **Printing is a first-class feature.** ~12 clients call `window.print()` with an inline `@media print` block (`@page { size: A4 ... }`, `.no-print`, `.print-container`). Follow the existing block when adding a printable view. Excel export uses `xlsx-js-style`; PDF uses `html2pdf.js`.
- **Read the docs before writing code.** Next.js 16 has breaking changes from earlier versions — consult `node_modules/next/dist/docs/` rather than relying on older App Router habits. See [AGENTS.md](AGENTS.md).

### Notable dependencies

`khmer-chhankitek-calendar` (Khmer lunar dates on the monthly attendance sheet) · `three` (3D classroom seating in `attendance/layout/ThreeClassroom.tsx`) · `recharts` (score analysis) · `react-hot-toast` (all user feedback; `Toaster` mounted in the root layout) · `lucide-react` (icons) · `next-themes`.

### Static assets

- `public/introduction/` — standalone HTML tutorial pages loaded into `/tutorial`
- `public/previews/` + [lib/data/decorations.ts](lib/data/decorations.ts) — classroom-decoration catalog (Google Drive links, no DB)
- `public/id-templates/`, `public/models/`, `public/team/`, `public/locations.json`, `public/sample_data.xlsx`

---

## Known gaps

- The parent portal is a stub with a hardcoded dashboard — no real parent auth.
- Several admin nav targets are unimplemented (`/admin/users` and three `#` links).
- The root-level `check_table.js`, `extract.js`, `fix_escapes.js`, `fix_queries.js`, `test_cal.js` are one-off scripts with hardcoded Windows paths from an earlier migration. **Dead weight — don't run them.**
- `next.config.ts` sets `turbopack.root: '..'`, pointing the Turbopack root at the parent directory.
