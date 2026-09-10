# Phase 7 — Documents Tier B

**Follows** [phase6-implementation.md](phase6-implementation.md). Covers the brief's Phases
13–17 plus [phase0-ux-audit.md](phase0-ux-audit.md)'s P2-9 (token drift), P2-10 (A4 in flow) and
P2-11 (accessibility on the print screens).

**Gates:** lint clean · `tsc --noEmit` clean · **29/29 harnesses** (new: `verify-documents.mts`)
· `next build` clean · every fix checked in a real browser in both themes, and four documents
diffed as printed PDFs.

No migration. One new harness, one new shared function, one CSS contract, 30 files touched.

---

## 0. What was already delivered

The brief's Phases 12–17 are *product* work, and most of it was done before this phase started.
Rebuilding it would have been the audit's rule 42 violation, so this phase **verified** it and
says so rather than claiming credit:

| Brief phase | State | Where |
| --- | --- | --- |
| 12 · Print Center | families, category nav, search, availability, generation dialog — as the brief asks, not a wall of equal cards | `PrintCenterClient.tsx` |
| 13 · Report generation UX | context (class · year · period), period selector, template picker, **rendered sheet preview**, generate-then-state-what-was-produced | `GenerateReportDialog.tsx` |
| 14 · Honor | criteria + provenance printed, podium plus an "also eligible" list, not a generic table | Phase 3 |
| 15 · Certificate | candidate list with per-pupil status, pre-selected to the passing cohort, server re-intersects with the validated roster | `listCertificateCandidates` |
| 16 · Annual family | one resolver, pinned by `verify-annual.mts` §K | earlier work |
| 17 · Record book | class template, live roster, the class's own calendar | earlier work |

One brief line is deliberately **not** implemented: §13 asks for a `[Print]` action beside the
exports. The engine produces .xlsx and .docx; there is nothing to print without first opening
the file in Excel or Word, and a button that silently downloaded and then did nothing would be
the "advertise unsupported output" the same section forbids.

So the work of this phase is the half Phase 0 assigned to it and nobody had done: **the
documents themselves.**

---

## 1. ★ The finding: two theories of what a sheet is

Eleven screens render an A4 sheet. They held two contradictory ideas of what one is, and
neither was written down anywhere:

| | Theory | Screens |
| --- | --- | --- |
| **A** | a sheet is **paper** — `bg-white text-black`, both themes, screen and print | nine |
| **B** | a sheet is a **themed card that becomes paper when printed** — `bg-bg-surface print:bg-white` | `/yearly-report`'s three sheets, `/attendance/yearly` |

Every dark-mode defect on a document screen turned out to be a fragment of one theory sitting
inside the other. Measured in a real browser at 2.5:1 (SC 1.4.3 is 4.5:1; below ~2 is
effectively invisible):

| Route | Failing text nodes | What was wrong |
| --- | --- | --- |
| `/print-list` | **202** | the sheet declared its ground and not its ink, so every name and number inherited `--foreground`: near-white on white paper |
| `/student-tracking` | **106** | the same, plus `bg-white` pupil cards in the screen chrome |
| `/attendance/yearly` | **53** | `.abs-table th { background:#f1f5f9 }` — a fixed light header inside a *themed* sheet |
| `/print-student-codes` | 35 | the tint pair below, once per pupil |
| `/cleaning-schedule` | 27 | `bg-bg-surface text-black` — a navy sheet carrying black ink |
| `/ranking` | 17 | a literal `bg-white` card, exactly as Phase 0 P2-9 predicted |
| `/yearly-report/promoted` · `/repeated` | 10 each | `.report-table th`, same as `/attendance/yearly` |
| `/print-student-age` · `/certificate` · `/notifications` · `/honor-roll` · `/parent-report` · `/inventory` | 1–6 each | tint pairs, one jsx `background: white`, one loading overlay |

**477 text nodes across 16 routes.** After this phase: **0** — the two remaining probe hits are
my measuring script failing to parse `oklab()`, verified by hand.

`/inventory` and `/cleaning-schedule` were the worst of the two, because their defect was not
confined to the screen: an element background survives `@media print` and
`print-color-adjust: exact` is on, so a teacher printing those two sheets **while the app was in
dark mode printed a navy block**. That was reproduced and then re-checked as a PDF (§4).

### A wins, and why

Not because it had more votes. **A document screen is a preview of a printed thing.** It is the
same reason the shell disappears through `data-app-frame: display: contents` rather than being
restyled for paper: what is on screen has to be what comes out of the printer. B makes the
preview disagree with the print, and converting the other nine to B would mean theming every ink
colour inside a ministry document.

The cost is stated honestly: on `/yearly-report` and `/attendance/yearly` a dark-mode user now
sees a white sheet where they saw a dark one. In **light** mode nothing moves at all —
`bg-bg-surface` is `#FFFFFF` there, so those two screens render identically to before.

### The contract

```css
@layer components {
  .print-container,
  .print-sheet { background: #FFFFFF; color: #111827; }
}
```

`@layer components` and not `@layer utilities` is load-bearing: a sheet that means something
else by its ink — `/ranking` prints navy, four screens print pure black — says so with a utility
class, and a utility must keep winning the cascade. `verify-documents.mts` D1 fails if the
contract moves.

The `th` rules that started this (`#f1f5f9` with no colour) needed no edit: once the sheet
declares its ink, the header cells inherit it.

---

## 2. ★ The brand tint has no dark mode; the brand token does

`bg-brand-100 text-brand` was the app's spelling of "a quiet brand-coloured chip" — an avatar
bubble, a step number, a count badge, a highlighted row. It is correct on light (#245A9B on
#EAF8FB, **6.42:1**) and broken on dark, because **the two halves do not move together**: the
ramp is fixed by design ("`bg-brand-800` must mean the same navy on a light page and a dark
one"), so `brand-100` stays pale, while `--brand` flips to cyan for a dark ground. Cyan on
near-white measures **1.96:1**.

This is not a Tier-B defect. It was on **43 elements in 21 files**, from `/dashboard` to the
admin console — the pupil initials on `/student-tracking`, the certificate's step numbers, the
notification counters, every one of them a pale chip with invisible text at night. Ten call
sites had already noticed and written `dark:bg-brand-900/30` by hand, which is what makes the
other 43 drift rather than a decision.

**Moving the ramp is not the fix.** `bg-brand-100 text-brand-800` is a second, *working* pairing
on 23 elements that a darker `brand-100` would break in the opposite direction. So the tint gets
a semantic pair of its own — exactly what the filled-success action got, for exactly this
reason — and both halves move together:

```
        light                    dark
soft    #EAF8FB (brand-100)      #172B57 (brand-900)
on-soft #245A9B (brand-700)      #8ADCE6 (brand-300)   → 8.86:1
```

Existing rungs, no new colours, and nothing moves in light mode.

**Four spellings had to be found, and a mechanical sweep found only one:**

| Spelling | Example | Caught by |
| --- | --- | --- |
| one class list | `bg-brand-100 text-brand` | the sweep |
| a variant prefix | `peer-checked:bg-brand-100 … text-brand` | the harness |
| two object properties | `{ color: 'bg-brand-100', text: 'text-brand' }` | the harness |
| tint on hover only | `text-brand … hover:bg-brand-100` — a button that vanishes as you press it | the harness |
| parent tint, child ink | `<div class="bg-brand-100"><h3 class="text-brand">` | the browser probe |

The sweep also **mis-converted four elements** — it changed the ink on controls that carry no
tint ground (two `/certificate` checkboxes, two `/decorations` labels). Those were reverted by
hand. A regex over class strings is not a reliable instrument for this; the harness and the
browser were.

---

## 3. ★ Test A, and what it found

Phase 0's acceptance scenario 4 — *"Results → ranking → sem 1, and the figure equals the printed
sheet"* — has been the last open item of the P0-1 family since Phase 1. It was run, live, against
a real database as `ranktest@krusmart.local`.

**The good half.** `/ranking`'s November table matched the canonical figures exactly, ties
included: សុខា 9.00 rank ១ · ដារា 7.00 rank ២ · វិចិត្រ 7.00 **sharing** rank ២ · the next rank
skipping to ៤. Screen and engine agree on every average and every placing that exists.

**The defect.** The screen then printed `៤` beside two pupils who have **no marks at all**, where
`ranking_monthly`, built from the same figures, leaves the cell blank. `assignRanks` weighs a
null average as 0 so unmarked pupils sort last — that ordering position is not a placing, and
`report-data.ts` said so **five times** (`average === null ? '' : toKhmerNumber(c.rank)`) while
no screen said it once. Its own comment states the rule: *"'placed 4th' would state a result they
have not been assessed for."*

One rule, five copies in the resolver, zero in the screen — the exact shape `buildPeriodResults`
was extracted to prevent, one field further on. `placing()` now lives beside the result it is a
property of, and both surfaces read it. `/ranking` shows `-` where the sheet prints blank,
confirmed live.

**The semester half could not be compared, and that is a finding too.** This database's
`sem1-2025-2026` exam rows are keyed `kh_listen` and `math_num` — **monthly** column ids. The
semester template's numeric keys are all `sem_`-prefixed, so the semester screen correctly
averages nothing and shows `0.00` for everyone. `verify-ranking-live.mts` does not notice
because its semester section reuses the `keys` it computed for the *monthly* section: **the one
harness that exercises a real JWT proves the semester arithmetic against a subject set the
semester screen would never read.** Not a product defect — a test that would pass while the
screen showed blanks, which is this program's recurring failure shape. Recorded, not fixed:
correcting it means editing `supabase/fixtures/primary_ranking_teacher.sql` and re-seeding, and
re-seeding the owner's database is the owner's call (§6).

---

## 4. Verified on paper, not only structurally

Phase 2 §7.3 left this open: *"the ancestor chain and the CSS contract are proven; nobody has
diffed a PDF."* This phase closes it for the sheets it changed.

Under `@media print` emulation, with the app in **dark** mode, on eleven sheets: body `#FFFFFF`,
`[data-app-chrome]` `display: none`, `[data-app-frame]` `display: contents`, and every sheet
`background: rgb(255,255,255)` with dark ink. Four were then rendered as actual PDFs and read:
`/cleaning-schedule` and `/inventory` — the two that used to print navy — come out as white A4
with a correct ministry letterhead, and `/yearly-report/repeated` prints legible header cells and
real averages where the header row used to be near-white on near-white.

(One measurement misled me first: `getComputedStyle` on `body` during the 300 ms
`transition: background-color` returns an interpolated value, so the print reset looks like it is
not applying. Wait for the transition before reading it.)

---

## 5. Everything else

- **`/class-admin/[book]`'s back link** was the last bare class-scoped `href` in `app/(main)`;
  it goes through `useClassHref` now. A whole-tree scan found no others, in either spelling.
- **The retired brand blue.** `#0054a6` was the brand before the ramp in `globals.css` replaced
  it, and it survived in the documents: `/parent-report` printed a **fourteen-token** letterhead
  in a blue the product no longer has, and two charts drew their line in it — 2.26:1 on a dark
  card. Converged on brand-800 `#1D3E73`, which is already the blue `/print-student-codes`
  prints; the two chart strokes read `var(--brand)` and follow the theme. D5 keeps it out.
- **`text-white` on `bg-brand`** measures 2.13:1 in dark mode, because `--brand-contrast` is what
  flips and `text-white` does not. Fixed on `/inventory` (a document screen). **Left, and
  counted: 19 more sites** across the shell, the login screens and the admin console — chrome,
  not documents, and a coherent piece of work on its own.
- **P2-10 (A4 in screen flow)** was closed in Phase 2 and re-verified here: every fixed-mm sheet
  sits in a `.preview-scroll`. `verify-documents.mts` excludes that wrapper from D2 explicitly
  rather than by accident.

---

## 6. Known remaining work

1. **`verify-ranking-live.mts`'s semester section** (§3) — reuses the monthly key set, and this
   database's fixture writes semester exam marks under monthly column ids. Fixing it means
   editing the fixture and re-seeding.
2. **`text-white` on `bg-brand`** — 19 sites, listed above.
3. **`text-warning` on a light ground** measures 2.39:1 and appears on `/dashboard`,
   `/administration`, `/score/collect`, `/score-analyse` and `/cleaning-schedule`. Same shape as
   the `--danger-text` / `--success-solid` pairs already in `globals.css`, and the same fix; not
   a document defect, so not taken here.
4. **P2-11, accessibility on the print screens** — the contrast half is done and measured. The
   live-region and keyboard half is untouched: `/score/enter` is still the only model.
5. **00033 is not applied to the dev database** — unchanged since Phase 6.
6. **Class-card completion + attendance** — unchanged since Phase 6.
7. **Two rows for one mark** — unchanged since Phase 4.
8. **CLAUDE.md** — its migration table still stops at 00031, and it does not mention 00032,
   00033, `ClassContextBar`, the `results` module, the transfer, the paper contract, `placing()`
   or `--brand-soft`. Overdue.

---

## 7. A process note

Recovering a `git stash push --keep-index` that conflicted on `pop` left sixteen files with
conflict markers and staged twenty-three files that the user had not staged. Both were restored
exactly — the working tree from the conflict's stage 3, the index from `stash@{0}^2`, which is
the index commit git records at push time and therefore a byte-exact record of what was staged
before. **Do not use `git stash` to A/B a working tree in this repository**; run the comparison
on a copy instead. The answer it bought — that
`verify-ranking-live.mts`'s seven failures are fixture drift and pre-date this phase — was not
worth the risk.
