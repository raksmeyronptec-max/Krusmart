# Phase 2 — Page-frame convergence

**Follows** [phase1-implementation.md](phase1-implementation.md). **Audited in**
[phase0-ux-audit.md](phase0-ux-audit.md) §1 and §6.

**Before:** 16 of 45 teacher routes used the shared frame; 29 hand-rolled one, between them
using six content widths.
**After:** **43 of 43 render routes are in one frame**, pinned by six rules in a new harness.
The other two are pure `redirect()`s with no UI.

**Gates:** lint clean · `tsc --noEmit` clean · **28/28 harnesses** · `next build` clean ·
rendered and measured in a real browser at 1200px and 360px.

37 route files changed, plus one new harness. No route was renamed, no query moved, no domain
logic touched, no migration.

---

## 1. What actually changed on each page

The transformation was the same one 29 times, and it is written out at the top of
[components/shell/PageContainer.tsx](../components/shell/PageContainer.tsx):

```diff
- <div className="min-h-screen bg-paper pb-10">        ← page height + background
-   <div className="no-print max-w-5xl mx-auto px-4 py-8">
-     <h1 className="kh-moul …">TITLE</h1>              ← hand-rolled title
-     …controls…
-   </div>
-   <div className="print-container w-[21cm] …">…</div>
- </div>
+ <PageContainer>
+   <PageHeader title="TITLE" description="…" actions={…} />
+   <ClassContextBar />                                 ← class-scoped routes
+   …controls…
+   <div className="preview-scroll">
+     <div className="print-container w-[21cm] …">…</div>
+   </div>
+ </PageContainer>
```

**Deleted, not wrapped:** the page's own height and background (`AppShell` is
`min-h-screen bg-bg-app`), its `mx-auto max-w-*` column, its page padding, and its `<h1>`.

**Kept untouched:** every A4 sheet, every `@page` rule, every `@media print` block, every
`window.print()` call, every query.

### Chrome that duplicated the shell

Six screens opened with a **second bar under `TopNav`** — a back link, a title, sometimes a
theme toggle — and one opened its own `<main>`. All of it is gone:

| Screen | What it had | Where it went |
| --- | --- | --- |
| `/score-analyse` | a brand-coloured sticky nav band | year picker + refresh → `PageHeader` actions |
| `/id-student` | a navy sticky band | background picker, signature tools, print → actions |
| `/print-student-codes`, `/print-list`, `/parent-report` | sticky bordered bands | actions |
| `/tutorial` | its own header **and its own `<main>`** | chapter menu → actions; the second landmark deleted |
| `/profile` | a gradient hero behind a white title | the standard `PageHeader` |

The back links went with them. `Breadcrumb` is the way back from every screen, and several of
these pointed at `/dashboard` regardless of where the teacher had come from — from
`/score/total`, "ត្រឡប់ទៅទំព័រដើម" was simply wrong. Three back links that pointed somewhere
**specific** were kept, as header actions: `/score/print` → តារាងពិន្ទុ, `/attendance/yearly` →
វត្តមានប្រចាំខែ, `/class-admin/[book]` → បញ្ជីសៀវភៅ, and `ReportFrame` → លទ្ធផលប្រចាំឆ្នាំ.

### One frame for three routes

`/yearly-report/promoted`, `/repeated` and `/subject-results` share
[ReportFrame.tsx](../app/(main)/yearly-report/ReportFrame.tsx). Converting that one component
converged all three — which is the good version of this, and why the harness follows relative
imports rather than reading only a route's own directory.

### Heading structure

Every page now has exactly one `<h1>`, and it is the page's title. Four documents had a second
one — the *sheet's* title, which is a different thing — and are now `<h2>`: `/ranking`,
`/student-tracking`, `/print-list`, and `/students/[id]` (whose `<h1>` named a pupil while the
page had none of its own; the pupil is now the `PageHeader` title).

---

## 2. `ClassContextBar`, everywhere it belongs

Phase 1 built it and wired seven routes. Phase 2 finished the job: **every class-scoped route
now names its class**, by one of three means.

| Means | Routes |
| --- | --- |
| `ClassContextBar` | 20 routes |
| `ScoreWorkspaceHeader` / `HomeworkEntryHeader` | `/score/enter`, `/score/total`, `/ranking`, `/homework/enter` — they already state class · grade · year, and a strip above them would say it twice |
| A labelled context region | `/dashboard`, `/print-center` — see below |

**Two screens keep their own, and the harness accepts that by rule rather than by route.** Both
resolve their class on the **server** and state something the shared client component cannot:

- `/dashboard` hides the region entirely for a teacher with no class yet — a bar reading
  "ថ្នាក់ —" above a banner offering to create one states the problem twice and answers it
  neither time;
- `/print-center` has a third state: a pre-V2 account is scoped to its roster, not to a class,
  and it says **សិស្សរបស់អ្នក** rather than pretending to a class it does not have.

R4 accepts a region whose accessible name announces it as the context (`aria-label="បរិបទ…"`).
That is the promise `ClassContextBar` makes, made to assistive technology as well as to the eye
— not a way to opt out of naming the class.

**Where a class name was spelled into prose, the prose gave way.** `/score/collect`,
`/score/subjects` and `/enrollment` each interpolated the class into a description
(`ថ្នាក់ ${className}`). The bar states it now, so the sentence no longer does — saying it twice
in two shapes is what was removed, never the fact. `/score/subjects` consequently makes **one
database query fewer**: its page fetched `classes.name` for that sentence alone.

`/students/[id]` deliberately has **no** bar. It is reached by id from a roster row, a search
result or a neighbour arrow, so the ambient class is easily a different one from the pupil's; it
states the pupil's own enrolment instead, which is the class its action links already carry.

---

## 3. The responsive defect this uncovered

Measuring in a real browser rather than trusting the diff turned up something the audit had not
recorded. Three screens rendered a sheet fixed at **21cm / 297mm** — 794 to 1122 CSS pixels,
two to three times a phone's viewport — with no scroll container: `/parent-report`,
`/print-student-age`, `/student-tracking`. `/inventory` too, found by the rule below.

Without one the **page body** scrolls sideways, dragging the navigation and every control
off-screen. The defect predates this phase; `PageContainer`'s padding neither caused nor cured
it. But `.preview-scroll` already existed as the shared answer — and `globals.css` already sets
it to `overflow: visible` under `@media print`, so pagination is untouched — which made this the
right phase to close it. Four sheets wrapped, and **R6** added so it cannot come back.

Verified, not assumed. At a 360px viewport, on the widest sheet in the product:

```
/print-list       viewport 360 · scrollWidth 360 · bodyOverflows false · uncontained []
/student-tracking viewport 360 · scrollWidth 360 · bodyOverflows false · uncontained []
```

And the property the whole migration rests on, measured on the DOM: the sheet's ancestor chain
to `<main>` is `.preview-scroll` → `PageContainer[data-app-frame]` → `main[data-app-frame]` →
… — every one of them either `data-app-frame` (`display: contents` under print) or the
print-neutralised scroller. The sheet measured **1123px = 297mm** inside the 1600px column,
uncompressed. **Moving a printable screen into the frame costs its printed output nothing.**

---

## 4. `scripts/verify-page-frame.mts`

Written **before** the migration, so it produced the work list and then the proof. Six rules:

| | Rule |
| --- | --- |
| **R1** | the route renders inside `PageContainer` |
| **R2** | it declares no page height or background of its own |
| **R3** | it titles itself through a declared header component, never a loose `<h1 className="kh-moul">` |
| **R4** | a class-scoped route says **which** class |
| **R5** | it declares none of the six competing page columns |
| **R6** | a fixed-millimetre sheet sits in a `.preview-scroll` |

Three things it does that a cruder version would get wrong:

- **Documents are not page columns.** A file that *is* a sheet (`ScoreTotalPrint.tsx`,
  `HomeworkPrintSheet.tsx`) is excluded whole; a screen that merely *contains* one is read line
  by line, skipping print-marked lines. Otherwise every A4 width and every document heading
  would read as a violation.
- **It follows the frame transitively.** `/yearly-report/promoted` renders
  `../PromotionListClient`, which renders `./ReportFrame`. Reading only a route's own directory
  would report all three as bare.
- **Pure redirects are detected, not listed.** `/classroom/classes` and `/score/template` render
  no element; retiring one needs no edit to the harness.

`verify-all.mjs` discovers harnesses from the filesystem, so it was picked up with no
registration: **27 → 28**.

### A latent bug in three harnesses

Building R3 surfaced a real flaw in an idiom shared by `verify-score-workspace.mts` and
`verify-class-context.mts`. Stripping comments with `/\/\*[\s\S]*?\*\//` also matches the `/*`
inside `accept="image/*"`, then runs to the next real `*/` — swallowing thirty lines of JSX
including whatever the check was looking for. It made `/id-student` fail a rule it satisfied,
and it could as easily have made a check **pass** on code that had lost the thing it asserts.
Fixed in all three: the `/*` must now follow a delimiter or start a line.

---

## 5. Verified in a browser, not only in the diff

A layout phase that only compiles has not been checked. Signed in as the
`legacy_single_teacher` fixture — deliberately, because a pre-V2 account is the riskier path:
`ClassContextBar` renders nothing for it, so every converted page had to hold up without one.

| Screen | Result |
| --- | --- |
| `/ranking` | shell + breadcrumb + `ScoreWorkspaceHeader`, `ថ្នាក់ —` for the legacy account — the honest fallback working |
| `/score-analyse` | standard header, year picker and refresh as actions, brand band gone |
| `/profile` | standard header, gradient hero gone, tabs and form intact |
| `/print-list`, `/student-tracking` | no body overflow at 360px; sheet uncompressed at desktop |

---

## 6. What was deliberately not done

1. **The dashboard's context region was not replaced.** It is server-resolved and conditional
   (§2). Converting it would have traded a working, deliberate, harness-pinned feature for
   visual tidiness — the audit's rule 42.
2. **No colour-token sweep.** Phase 0 §P2-9 counted raw `gray-*` and hex literals concentrated
   in these same files (`parent-report` 65, `honor-roll` 24, …). Some are legitimate — paper has
   no theme — and separating those from screen-chrome drift is a judgement call per literal, not
   a mechanical one. A few were fixed where they sat in markup this phase was already rewriting
   (`bg-white/95` → `bg-bg-surface/95`, `border-white/50` → `border-divider`); the rest is its
   own piece of work.
3. **No content or behaviour changes.** Filters, tabs, exports, print handlers and queries are
   as they were. The one query removed was the dead `classes.name` fetch in §2.
4. **`/administration` stays hidden from navigation** (Phase 1, P0-3). It was converted to the
   frame anyway — leaving one screen outside it to rot is how the seam grows back — but it still
   renders mock data and is still unreachable from the rail.

---

## 7. Known remaining work

1. **Token drift** (§6.2) — the biggest single item left from Phase 0's P2 list.
2. **`/score-analyse` vs `/score-analysis/subject`** — two routes one character apart. Phase 0
   proposed folding the second into the first as a view; both are now framed identically, which
   makes that fold a smaller change than it was.
3. **Print output was verified structurally, not on paper.** The ancestor chain and the CSS
   contract are proven; nobody has diffed a PDF before and after. `@media print` emulation over
   the twenty-one printable screens is the honest completion.
4. **Phase 1's two open items** stand unchanged: the fallback-path denominator, and Test A
   end-to-end.
