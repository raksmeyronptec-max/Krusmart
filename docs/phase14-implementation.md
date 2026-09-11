# Phase 14 — The document tells the truth, and the screen explains itself

Implements the four-finding scope recommended by [phase14-ux-audit.md](phase14-ux-audit.md) §5.
Attendance remains excluded (in-flight work — audit §0).

---

## 1. Selected findings

| ID | Sev | What was wrong |
| --- | --- | --- |
| **F14-1** | P0 | Printed documents named the wrong class for a multi-class teacher |
| **F14-2** | P1 | The ranking sheet printed a database UUID as the pupil number |
| **F14-3** | P1 | A class with no pupils still produced a complete, signed, printable sheet |
| **F14-4** | P1 | Results screens did not explain themselves when empty |

All four are one sentence: **a results surface should either tell the truth about the class it is
about, or say why it cannot.** They share files and a harness, and none touches the score engine,
the reporting engine, RLS, the class-scope architecture, the page frame, the Print Center
architecture, attendance semantics or the navigation tree.

**Deferred as planned:** F14-5 (mobile chrome budget), F14-6 (enrollment progressive disclosure),
F14-7/8 (dashboard duplication and activity links), F14-9, F14-10.

---

## 2. F14-1 · The document's class name

### The defect

Nineteen screens printed `settings.class_name` in their letterhead. That is the **legacy
per-teacher row** — one value for the whole account — so a teacher holding three classes printed
every sheet under whichever name happened to be stored there.

Observed before the fix, class `៤ខ តេស្ត` selected:

```
top bar            2025-2026 › ៤ខ តេស្ត
sheet letterhead   ថ្នាក់ទី៣                 ← settings.class_name
sheet rows         សុខា 9.00 rank 1          ← correct data for ៤ខ តេស្ត
```

Correct marks, wrong class, above a signature line for the នាយកសាលា. A wrong class name on a signed
document is worse than a missing one: the person receiving it cannot tell.

**The engine already had the right rule** (`report-data.ts`: take the class row's `name`, fall back
to settings), so the product contained the right answer and the wrong answer at once and printed
whichever route the teacher took.

### The fix

One rule, `documentClassName(activeClassName, settingsClassName)` in
[lib/reporting/document-identity.ts](../lib/reporting/document-identity.ts) — pure, isomorphic,
node-loadable:

- the active class's own name wins;
- `settings.class_name` is the **fallback**, reached only by a pre-V2 account that has no class row;
- neither resolves → `''`, never an invented placeholder (a sheet's own `ថ្នាក់៖ ......` blank is
  the sheet's business).

**The engine was rewired to compose the header through it**, so this is genuinely one copy rather
than a second one — that was the whole defect. `useDocumentClassName(settings?.class_name)`
([lib/hooks/useDocumentClassName.ts](../lib/hooks/useDocumentClassName.ts)) is the client half; it
reads `useActiveClass()`, the same selection `?class=` carries to the server, so the letterhead and
the rows beneath it are the same class by construction.

**Fifteen screens adopted it.** Each keeps its own placeholder — they differ, and that is the
sheet's business:

`certificate` · `class-admin/[book]` · `homework/enter` (print sheet) · `honor-roll` · `id-student` ·
`parent-report` · `print-list` · `print-student-age` · `ranking` · `record-book` · `score-analyse`
(cognitive panel) · `score/print` · `score/total` (print) · `student-tracking` · `yearly-report`
(shared `ReportFrame`)

**Two screens still read `settings` and are named in the harness so the exception is a checked fact:**

| Screen | Why |
| --- | --- |
| `/inventory` | the room, not the class — the route is not class-scoped, so there is no active class to prefer |
| `/print-center` (server) | resolved as the legacy label for `ClassContextBar`, only when the account has no class row |

`record-book` keeps `student.grade` as its first preference — it prints one page per pupil and that
is a deliberate per-pupil choice; only its **fallback** moved.

**Attendance screens were not touched** (audit §0) and are therefore a known remaining gap.

---

## 3. F14-2 · The pupil's number, not a database id

`RankingClient`'s `អត្តលេខ` column rendered `{stu.id}` — the 36-character row uuid
(`b0000000-0000-0000-0000-000000000001`) — on the sheet handed to the school director. Every other
surface prints `student_id`; `record-book` does it three files away.

Now `{toKhmerNumber(stu.student_id || '')}`. Verified live: **`S០១`**.

---

## 4. F14-3 / F14-4 · A result, or the reason there isn't one

### The defect

`/ranking`'s `loadData` ran straight through to `setShowPreview(true)` with **no guard**. A class
with zero pupils rendered the complete ministry sheet — royal letterhead, title
*តារាងចំណាត់ថ្នាក់សិស្ស*, a totals block reading `0 នាក់ ស្រី 0 នាក់ 0.00%`, and signature lines for
the នាយកសាលា and the គ្រូបន្ទុកថ្នាក់ — with print and Excel live beside it.

Its sibling `/honor-roll` already refused and distinguished *"no marks yet"* from *"nobody cleared
the bar"* — but in a **toast that was gone in four seconds**, leaving a picker that looked as though
it had done nothing.

And `/certificate` showed **"សូមរង់ចាំបន្តិច ទិន្នន័យកំពុងទាញយក..."** whenever its list was empty —
including for a class with no pupils, where nothing is coming and the teacher waits for ever. An
empty state disguised as a permanent spinner.

### The fix

[lib/scores/resultAvailability.ts](../lib/scores/resultAvailability.ts) — pure, node-runnable:

```
resultAvailability(rosterSize, markedPupils) → 'no-roster' | 'no-marks' | 'ready'
```

**The order is load-bearing**: an empty class reports an empty *class*, never missing marks —
telling a teacher with no pupils to go and enter marks sends them to a grid with no rows in it.
`RESULT_EMPTY_COPY` carries the Khmer copy and, for each state, **the one action that resolves it**.

[components/score/ResultEmptyState.tsx](../components/score/ResultEmptyState.tsx) renders it on the
shared `EmptyState` — the component fifteen entry screens already use and the results family was the
one group without. It is a `role="status"`, so the reason reaches a screen reader when the sheet
disappears from under it, and its action goes through `useClassHref` so the teacher lands on the
class they were looking at.

**Eligibility is deliberately not in it.** A fully marked class can honour nobody; that is a result,
not an absence. `/honor-roll` keeps that third answer (`none-eligible`) and names the criterion it
was judged against. The harness asserts the shared module does not grow it.

| Screen | Before | After |
| --- | --- | --- |
| `/ranking` | complete signed sheet from nothing | refuses, explains on screen, offers the action |
| `/honor-roll` | correct rule, vanishing toast | same rule, on screen, three distinct answers |
| `/certificate` | "loading…" for ever | terminal empty state with an action |

**Left alone, with reasons:** `/student-tracking`'s `មិនមានសិស្សនោះទេ!` is a *search* empty and is
correct; `/yearly-report`'s sheets already use `EmptyState`; `/score-analyse`'s branch is about risk
lists, not emptiness; `/record-book` states the fact accurately in a toolbar chip and disables the
control, so it is not a dead end.

---

## 5. Files changed

**New**

| File | What |
| --- | --- |
| `lib/reporting/document-identity.ts` | the one rule for a document's class name |
| `lib/hooks/useDocumentClassName.ts` | its client half |
| `lib/scores/resultAvailability.ts` | the three states, and what to say for each |
| `components/score/ResultEmptyState.tsx` | how they are rendered |
| `scripts/verify-document-identity.mts` | 36 checks; offline harness **33** |

**Modified** — `lib/reporting/report-data.ts` (composes through the shared rule); the fifteen print
screens above; `app/(main)/ranking/RankingClient.tsx` (guard + `student_id` + empty state);
`app/(main)/honor-roll/HonorRollClient.tsx` (toast → on-screen, three states);
`app/(main)/certificate/CertificateClient.tsx` (loading vs empty).

---

## 6. Verification

| Gate | Before | After |
| --- | --- | --- |
| `npm run lint` / `typecheck` | clean | clean |
| `npm run verify` | 32/32 | **33/33** |
| `npm run build` | compiled | compiled |
| `npm run verify:live` | 35/35 | **36/36** |
| `scripts/validate-rls.mjs` | 64/64 | **64/64** |

### Browser, against the live stack

| Check | Result |
| --- | --- |
| `/ranking`, class `៤ខ តេស្ត` | letterhead **៤ខ តេស្ត** (was ថ្នាក់ទី៣) |
| same sheet, `អត្តលេខ` | **S០១** (was `b0000000-…-000000000001`) |
| `/ranking`, empty class `២ក` | no sheet; announced empty state; action → `/enrollment?class=2k` |
| `/honor-roll`, empty class | same, on screen instead of a toast |
| `/certificate`, empty class | terminal empty state; the word "loading" is gone |

### The harness

`verify-document-identity.mts` runs both pure modules and reads the screens. Notable checks:

- the exact pair that was printing wrong — `documentClassName('៤ខ តេស្ត', 'ថ្នាក់ទី៣')` — returns the
  active class;
- the engine composes through the shared rule, so there cannot be two copies again;
- each of the fifteen screens reads the rule and not `settings`, with the hook call stripped first
  so passing it as the *fallback argument* is not mistaken for reading it;
- the two by-design exceptions are asserted to still be true — if one stops reading settings, the
  exception must be deleted rather than left;
- `resultAvailability(0, 0) === 'no-roster'`, the ordering that stops an empty class being reported
  as missing marks;
- the shared module does **not** mention eligibility, and `/honor-roll` still owns its third state.

---

## 7. Known remaining work

- **Attendance** — excluded throughout (audit §0). Its print screens still read
  `settings.class_name`, so `/attendance/monthly` and `/attendance/yearly` carry F14-1. They are
  deliberately absent from the harness's screen list; add them when the register work lands.
- **F14-5 / F14-6 / F14-7 / F14-8 / F14-9 / F14-10** — deferred per the audit's scope gate.
- `/print-student-codes` prints `s.id` under `អត្តលេខ`, but that screen is about the **parent-portal
  code** a guardian types to link an account, so the uuid may be the correct value there. Not
  changed; flagged for someone who knows what `parent_students` links on.
- `/class-admin` still renders the third private class strip (Phase 12 F12), named in
  `PRIVATE_CONTEXT_BARS`.

---

*Phase 14 implementation complete. Stopping here.*
