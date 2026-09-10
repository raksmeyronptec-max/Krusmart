# KruSmart — ជំនួយការគ្រូបង្រៀនឌីជីថល

A Khmer-language classroom management app for Cambodian primary and secondary school teachers:
student roster, attendance, scores, homework, and a large set of printable reports, certificates
and ID cards.

Built with Next.js 16 (App Router) + React 19, Tailwind v4, and Supabase for auth and Postgres.

> All user-facing text is Khmer. Keep new strings in Khmer.

**Working on this codebase?** [CLAUDE.md](CLAUDE.md) is the architecture reference and is far more
detailed than this file — it explains *why* each rule exists. This README is the orientation.

---

## Quick start

```bash
npm install
cp .env.example .env.local   # then fill in your Supabase project values
npm run dev                  # http://localhost:3000
```

`/` redirects to `/dashboard`, which requires a session — you'll land on `/login`. Sign up there
with email + password, then verify via the emailed OTP. A brand-new teacher is routed into
`/onboarding` to create their organisation, level, grade, class and first pupils.

### Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` | Next dev server |
| `npm run build` | Production build (`prebuild` regenerates the report templates first) |
| `npm start` | Serve the production build |
| `npm run lint` | ESLint (flat config: `eslint-config-next` core-web-vitals + typescript) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run verify` | The 31 offline verification harnesses |
| `npm run verify:live` | ...plus the 3 that need a running local Supabase stack |
| `npm run check` | lint + typecheck + verify, in that order |
| `npm run build:templates` | Rebuild the .xlsx/.docx report templates from their source script |

### The harnesses are the test suite

There is no Jest or Vitest. Instead `scripts/verify-*.mts` holds **34 harnesses** — 31 offline,
3 opt-in — and they are the closest thing this repository has to tests. Each one pins a specific
invariant that has been broken at least once: that marking progress is counted by one function
for three screens, that a ranking sheet cannot disagree with the score sheet it derives from,
that every A4 sheet declares its own ink, that no screen re-derives what an attendance mark
means. `npm run verify` runs them concurrently and prints nothing on success.

**A change that touches a shared rule should extend a harness, not just pass the existing ones.**

`scripts/validate-rls.mjs` is separate again: it opens a real Postgres connection to a local
Supabase stack and proves the row-level-security policies behaviourally — currently **64 checks**,
including that a teacher of one school cannot reach another school's pupils. Run it with
`supabase start && node scripts/validate-rls.mjs`.

### Environment

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

R2_ACCOUNT_ID=            # Cloudflare R2 — every uploaded image
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
NEXT_PUBLIC_R2_PUBLIC_URL=
```

The five R2 variables back every image upload; with them unset, uploads report a failure and
everything else works. Four of them are server-only — an R2 access key in the browser bundle is
an open write handle on the bucket.

**There is no service-role key anywhere in the project.** Every data path runs through RLS as the
logged-in user, from both server and browser. The only exceptions are a handful of
`SECURITY DEFINER` functions, each keyed entirely on `auth.uid()`.

---

## Route trees

| Tree | Purpose | Gate |
| --- | --- | --- |
| `app/(main)/` | The teacher app — 45 routes, the bulk of the code | Session via `proxy.ts`; the layout redirects parents away and sends never-set-up teachers to `/onboarding` |
| `app/admin/` | School console — 11 routes (teachers, classes, enrolments, grading, audit logs, join requests) | `app/admin/layout.tsx` checks `getUserRoles()` + `isSchoolAdmin()` server-side before any child renders |
| `app/parent/(portal)/` | Parent portal — 11 routes | **Real** Supabase auth plus a `parent_students` link (migration 00010) |
| `app/login/` | Multi-role sign-in — universal plus per-role screens, workspace chooser, password reset | Public |
| `app/onboarding/` | First-run wizard for a brand-new teacher | Own layout, deliberately outside `(main)` |

`app/(main)/layout.tsx` is **not** a bare wrapper: it resolves the actor, redirects, and wraps
everything in `SchoolContextProvider` → `TeacherContextProvider` → `AppShell`. A new `(main)` page
must **not** render its own `<TopNav />`; the layout owns the chrome.

---

## The three things to understand first

### 1. Two scoping paths run at once

The app began as one-teacher-per-class, with every table keyed on `teacher_id` and no classes
table at all. Migrations 00003–00012 added the real structure — schools, academic years, grades,
classes, subjects, assignments, enrolments, roles — **without removing the old path**. Accounts
that predate it must keep working exactly as they did.

So every scoped read picks its mode *from data, never from a flag*: **legacy** (`teacher_id`) when
the user has no active assignments, **v2** (`class_id` + `academic_year_id`) when they do. Use
`lib/utils/queryFilter.ts` on the client and `lib/utils/serverScope.ts` on the server; never
hand-roll the choice.

### 2. The active class travels in the URL

The selection lives in React state (`TeacherContext`) — **not** localStorage, because two tabs must
not disagree about which class is being edited. A server component cannot read client state, so
the class travels as `?class=<id>`, carried onto every link by `withClassParam` /
`useClassHref` and read back by `ClassParamSync`.

Each half of that chain fails **silently** if removed: the page renders, the numbers are real,
they are simply another class's. `scripts/verify-class-context.mts` is what catches it.

None of this is authorization — `resolveServerScope` re-validates the id against the caller's own
assignments on every request.

### 3. One calculation, one source of truth

The recurring defect in this codebase is one question answered two ways: a screen and the report
it derives from disagreeing about an average, a rank, a placing, an attendance rate. The canonical
layers live in `lib/scores/*`, `lib/grading/*`, `lib/attendance/status.ts` and
`lib/reporting/report-data.ts`, and a harness pins each one.

**A `parseFloat` in a `.tsx` that computes a result is the shape of that bug.**

---

## Data model

`supabase/migrations/` is a real, ordered history — **33 migrations**, each with a header comment
explaining its reasoning. Read the header before changing anything it touches.
[lib/types.ts](lib/types.ts) carries a row type per table and follows the **live** schema.

`supabase/legacy/` holds superseded partial snapshots — **do not apply them**, and treat
`supabase/README.md` as describing the pre-V2 world.

### `scores` carries four different things

Discriminated by `score_type` + `score_period`, all through the shared actions in
[score/enter/actions.ts](app/(main)/score/enter/actions.ts):

| `score_type` | `score_period` format | Notes |
| --- | --- | --- |
| `monthly` | `` `${month}-${academicYear}` `` | |
| `semester` | `` `${semester}-${academicYear}` `` | column ids prefixed `sem_` |
| `annual` | `` `annual-${academicYear}` `` | nothing in this app writes one — the annual result is derived |
| `homework` | `` `${academicYear}_${monthId}` `` | underscore, unlike the other three |

Upserts use `onConflict: 'teacher_id, student_id, subject, score_type, score_period'`.
`teacher_id` is part of the key on purpose: without it, two teachers on one class and subject
would silently overwrite each other's marks.

A cell may hold a number *or* a Khmer word, so route every read and write through
[lib/utils/score-value.ts](lib/utils/score-value.ts).

### "Subject" means three different things

| Identifier | Names | Example | Lives in |
| --- | --- | --- | --- |
| `subject_key` | a **subject** in a template | `khmer_all` | `score_template_subjects.subject_key` |
| `SubjectColumn.id` | a **column** within a subject | `kh_read` | **this, not `subject_key`, is what `scores.subject` stores** |
| `subject_id` | a `public.subjects` row | UUID | legacy; read, never written |

Confusing any two silently detaches marks. A mark written under `math_general` instead of
`math_num` resolves in **no** grid.

### Images live in Cloudflare R2

`students.photo_url`, `settings.photo_url` / `school_logo` / `director_seal` /
`teacher_signature` and `homework_assignments.image_url` hold a **public CDN URL**, not the
picture. Uploading is a server action ([lib/storage/actions.ts](lib/storage/actions.ts)) — never a
browser-side S3 call. Reads must tolerate both shapes: rows written before this migration still
hold `data:image/...;base64` payloads, and there is no backfill.

### localStorage

`localStorage` is a support mechanism, not a store for anything that matters. Never type a key as
a literal — they are all in [lib/constants/storage.ts](lib/constants/storage.ts).

| Key | Status |
| --- | --- |
| `seatingConfig` / `seatingLayout` | Live store for `/attendance/layout` |
| `lastTutorialPage`, `studentsCache`, `enrollmentDraft`, `pendingLevel` | Live |
| `inventoryItems` | Migrated to Postgres (00012); the reader survives only for a one-time import |
| `customSubjects` | **Gone** — 00012 then 00027 moved it into `score_template_subjects` |

---

## Conventions

- **Tailwind v4, CSS-first.** No `tailwind.config.*`. The brand ramp, semantic tokens, fonts and
  keyframes all live in [app/globals.css](app/globals.css). Dark mode is class-based.
- **Semantic tokens, not raw colours.** `bg-bg-surface`, `bg-paper`, `border-divider`,
  `text-text-heading`/`-body`/`-muted`, `bg-brand`, `text-brand-contrast`, `bg-brand-soft` /
  `text-brand-on-soft`, `text-danger-text`, `text-warning-text`, `ring-focus-ring`. The paired
  tokens exist because the fill and the ink have to flip together for dark mode.
- **Khmer typography.** `Hanuman` for body, `Moul` for display headings via the `kh-moul` class.
  Never re-declare `font-family: 'Hanuman'` locally — that literal names a font nothing loads.
- **Printing is a first-class feature.** ~21 screens print A4 sheets. The shell disappears via two
  attributes (`data-app-chrome` → `display:none`, `data-app-frame` → `display:contents`), and a
  sheet declares its own ground *and* ink through `.print-container` / `.print-sheet`. Keep both
  contracts intact; `verify-documents.mts` fails if a sheet declares neither.
- **Shared UI is shared.** Don't add a native `<select>`, a `<datalist>`, or a hand-rolled pager —
  see `components/ui/`. The only surviving native selects are the score-grid cells, where hundreds
  render at once inside one table.
- **Read the docs before writing code.** Next.js 16 has breaking changes from earlier versions —
  consult `node_modules/next/dist/docs/`. See [AGENTS.md](AGENTS.md).

### Notable dependencies

`exceljs` + `easy-template-x` (filling .xlsx/.docx report templates) · `xlsx-js-style`
(constructing sheets from nothing) · `khmer-chhankitek-calendar` (lunar dates on the monthly
attendance sheet) · `three` (3D classroom seating) · `recharts` · `react-hot-toast` ·
`lucide-react` · `next-themes` · `@aws-sdk/client-s3` (R2).

---

## Documentation

| File | What it is |
| --- | --- |
| [CLAUDE.md](CLAUDE.md) | The architecture reference. Read this before changing anything shared. |
| [AGENTS.md](AGENTS.md) | Next.js 16 caveats; re-written by `next dev`. |
| [AUDIT.md](AUDIT.md) | The read-only audit the V2 migration was planned from. Historical — several findings are closed. |
| `docs/phase0-ux-audit.md` … `docs/phase11-implementation.md` | The UX redesign programme: one audit plus eleven implementation records, each stating what was found, what was changed and what was deliberately left. |
| `docs/score-system-design.md` | The grading model — levels, coefficients, schemes. |
| `supabase/README.md` | Pre-V2. Verify against the migrations before relying on it. |

---

## Known gaps

- **Migration 00033 is not applied to every environment.** It closes a cross-tenant enrolment hole
  and is proven behaviourally in a throwaway database; applying it is a `supabase db push`.
- **Four status colours are still used as labels below 4.5:1 contrast** in light mode
  (`text-success`, `text-danger`, `text-brand-500`, `text-gold`). Values and call-site counts are
  in `docs/phase10-implementation.md` §4.
- **The admin console has no dark-mode pass** — its cards are literal `bg-white`.
- **Teacher profile and permissions** are missing from the admin console. A role editor grants and
  revokes access and should be specified before it is built.
- **`verify-ranking-live.mts`'s semester section** reuses the monthly subject keys, so it would
  pass while the semester screen showed blanks. The fixture behind it writes semester marks under
  monthly column ids.
- **Accessibility is excellent where screens were rebuilt and thin where they were not.**
  `/score/enter` is the model — live region, labelled grid, keyboard-first, 44px targets; the
  older print screens have none of that.
- `npm run lint` and `npm run typecheck` are clean and there is no `any` left. Roughly 73 lines
  carry a targeted `eslint-disable-next-line` with a written reason — mostly
  `@next/next/no-img-element` (remote images on print and PDF surfaces, where `next/image` breaks
  capture) and `react-hooks/set-state-in-effect` (async fetch-on-change, and reads of the clock or
  `localStorage` that cannot run during SSR).
