# Phase 16 — Attendance UX + Attendance Lifecycle

Implements `docs/phase16-ux-audit.md`, measured against `ede3474`.

---

## 1. What the audit found

The daily register landed in `ede3474` and does its job: it opens on the active class and today,
paints the real marks server-side, offers `មកទាំងអស់`, filters to the exceptions, saves optimistically
with per-row failure and retry, and says when the register is finished. The brief's F16-1 (register
speed) and F16-2 (save feedback) were therefore largely spent, and are **not re-opened**.

Everything after the register was the problem.

| ID | P | Finding |
| --- | --- | --- |
| F16-1 | P1 | Register ↔ monthly ↔ yearly was a two-node loop with the daily action outside it |
| F16-2 | P1 | Both attendance sheets printed the wrong class name; the .xlsx also printed a stale year |
| F16-3 | P2 | The monthly screen had no class total anywhere on it |
| F16-4 | P2 | The monthly preview could blank silently, and truncated the export without saying so |
| F16-5 | P3 | The future-date guard was markup only |

All five implemented. One further defect (F16-2b) surfaced during browser acceptance and is included.

---

## 2. Selected scope and what changed

### F16-1 — three screens, one job

The register had exactly one outbound link (`/enrollment`, and only when the roster was empty).
Monthly linked to yearly; yearly linked to monthly. The thing a teacher does every morning was
reachable from neither, and reached neither.

New `lib/attendance/views.ts` declares the three views once — id, Khmer label, href, and the question
each answers. New `components/attendance/AttendanceViewNav.tsx` renders *the other two* on whichever
screen it sits on, as a quiet secondary chip row, carrying `?class=` through the existing
`useClassHref`.

Both sheets' hand-rolled links were **deleted**, not supplemented: a per-screen list of where a
screen links to is exactly how the register fell out of the loop. `useClassHref` is now unused in
both and its import removed.

### F16-2 — a document names the class whose data it carries

`settings.class_name` is the legacy per-**teacher** row. For the fixture teacher its value is
**`ថ្នាក់ទី៣`** — so before this change, the monthly register for `៤ក`, for `៤ខ តេស្ត` and for `២ក`
all printed `ថ្នាក់៖ ថ្នាក់ទី៣` above a signature line for the នាយកសាលា.

This is the defect Phase 14 closed on nineteen screens through `documentClassName()`. Attendance was
the deferred case, and `verify-document-identity.mts` named it as a known gap. Both sheets now read
`useDocumentClassName(settings?.class_name)`, screen **and** Excel export alike.

The monthly `.xlsx` carried two further hard-coded literals in its header row:

```
r7[0]              'ថ្នាក់ទី..................'      → `ថ្នាក់៖ ${documentClass}`
r7[totalCols - 3]  `ឆ្នាំសិក្សា ២០២៤-២០២៥`           → the computed academic year
```

Every export, for every class, in every month, printed a row of dots and a two-year-stale year.

### F16-2b — and the year it carries (found in the browser)

Acceptance on 11 September 2026 showed the monthly sheet printing `ឆ្នាំសិក្សា ២០២៦-២០២៧` directly
beneath a class bar reading `ឆ្នាំសិក្សា ២០២៥-២០២៦`, on the same screen. The sheet derived the year
itself from `month >= 8` — a **September** boundary, in a product whose school year runs November →
October (`ACADEMIC_YEAR_START_MONTH_INDEX`).

It now calls `getCurrentAcademicYear(new Date(year, month, 1))` — the product's own rule, applied to
the month being printed rather than to today, so browsing back to មីនា ២០២៦ still prints ២០២៥-២០២៦.
One derivation, read by the sheet and the export.

This was in scope because §29 makes document identity correctness a Phase 16 acceptance item, and
because propagating the old rule into the export would have made a wrong year travel further.

### F16-3 — the monthly screen reports the month

The screen rendered a 297mm ministry sheet and nothing else. Its only aggregates were per-pupil
`អ`/`ច្ប` columns at the far right, off-screen on a phone. A compact strip now sits above the preview:

```
៣០ សិស្ស · កត់ត្រា ១ ថ្ងៃ · ○ ១ ច្បាប់ · × ១ អវត្តមាន · មក ៩៣.៣%
```

The arithmetic is new `periodSummary()` in `lib/attendance/register.ts`, which runs the canonical
`tallyAttendance` — the same call the printed sheets, the daily strip and the parent portal make. Two
bounds are deliberate and tested: only **roster** pupils are counted (both attendance reads are
teacher-scoped, so other classes' pupils arrive in the same payload), and `daysRecorded` counts days
actually marked, never days in the month.

No new report and no new engine. §30 is respected: the Print Center still catalogues both sheets as
`legacy_only`.

### F16-4 — the preview explains itself

Two ways to get a blank white area, both closed:

* **An empty class.** `renderPages()` returns `null`; the file did not import `EmptyState`. It now
  renders one naming the next step.
* **A cleared `ចំនួនសិស្ស` field.** `parseInt('')` is `NaN`, `Math.min(NaN, n)` is `NaN`, `NaN === 0`
  is false so the empty guard never fired, and `while (current <= NaN)` never ran. The whole preview
  vanished while the field showed empty. The control is clamped to `[1, roster]`.

That control also silently truncated the printed sheet **and** the Excel export. When it is below the
roster the screen now says so, in Khmer, above the preview. The legacy behaviour is preserved — it is
only bounded and made visible.

### F16-5 — the future-date guard becomes true

The date input carried `max={initialDate}`, which paints the control invalid but does not stop
`onChange`. `changeDate` accepted whatever it was given. It now refuses a date after the
server-resolved today with `មិនអាចចុះវត្តមានសម្រាប់ថ្ងៃអនាគតបានទេ`.

No server policy is invented — the database still accepts such a row, exactly as before. This makes
the claim already on screen true. (The unlock confirmation also now shows `formatKhmerDate(date)`
rather than a raw ISO string.)

---

## 3. Files changed

| File | Change |
| --- | --- |
| `lib/attendance/views.ts` | **new** — the three views declared once, plus `otherAttendanceViews` |
| `components/attendance/AttendanceViewNav.tsx` | **new** — renders the other two, class carried |
| `lib/attendance/register.ts` | `periodSummary()` + `MarksByDate`; module doc widened to a day *and* a month |
| `app/(main)/attendance/layout/AttendanceLayoutClient.tsx` | the join; future-date clamp; Khmer date in the unlock confirmation |
| `app/(main)/attendance/monthly/MonthlyAttendanceClient.tsx` | document class + academic year (screen and .xlsx); summary strip; empty state; clamped row count; truncation notice; hand-rolled link removed |
| `app/(main)/attendance/yearly/YearlyAbsenceClient.tsx` | document class (sheet and .xlsx); hand-rolled link removed |
| `scripts/verify-attendance.mts` | **A8** — 22 new checks |
| `scripts/verify-document-identity.mts` | both sheets added to `PRINT_SCREENS`; known-gap note deleted |
| `docs/phase16-ux-audit.md` | **new** |
| `docs/phase16-implementation.md` | **new** |

No server action, migration, RLS policy, score/result/report engine or navigation module was touched.

---

## 4. Automated verification

| Gate | Result |
| --- | --- |
| `npm run lint` | clean |
| `npm run typecheck` | clean |
| `npm run verify` | **33/33** |
| `npm run verify:live` | **36/36** |
| `node scripts/validate-rls.mjs` | **64/64** |
| `npm run build` | clean |

The live stack needs `PATH` to include `/Applications/Docker.app/Contents/Resources/bin` (the
`docker` binary is not on `PATH` on this machine), and the RLS validator needs `PG_MODULE` pointed at
any `pg` on disk — `pg` is not a dependency of this repo.

### New harness coverage — `verify-attendance.mts` §A8

Runs the new modules and pins the screens. The negative checks were proved discriminating rather
than vacuous (each regex was tested against both a violating and a conforming string).

* the three views are declared once, register first, each with a label and a purpose
* a screen never links to itself, and offers the other two
* all three screens render the shared join, and no screen keeps a hand-rolled attendance link
* the join carries the class
* `periodSummary` counts only the roster, keeps excused and unexcused apart, counts days **marked**,
  matches `tallyAttendance`'s rate, and returns `null` (not `0`) for an unmarked month
* the monthly screen counts through the shared module
* the monthly sheet uses the product's academic-year rule, and `month >= 8` is gone
* the .xlsx carries no hard-coded year and names the class
* the register refuses a future date in the handler, not just in the markup
* the empty class is explained, and the row-count control cannot blank the preview

`verify-document-identity.mts` now covers **17** print screens, up from 15.

---

## 5. Browser acceptance

Run against the live local stack as `ranktest@krusmart.local`, who holds three real classes:
`២ក` (0 pupils), `៤ក` (30) and `៤ខ តេស្ត` (5).

| Case | Result |
| --- | --- |
| **A** daily attendance | `៤ក` opened on today with 30 pupils already marked. Marked ផាន តុលា absent → reason sheet opened with the mark already saved; picked ឈឺ; tally moved 29/1/0 → 28/1/1, 96.7% → 93.3% |
| **B** reload | Mark and reason both persisted; row read `ផាន តុលា · P021 · ឈឺ` |
| **C** date switch | 11 Sep (28/1/1) → 10 Sep (**0/30, ៣០ មិនទាន់**) → 11 Sep (28/1/1 again). No cross-contamination in either direction |
| **D** class switch | `៤ក` → `៤ខ តេស្ត`: class bar, roster (30 → 5), tally and **both review links** all switched together |
| **E** lock | Locked from the completion panel → banner shown, all 15 mark buttons disabled. **A button was then forcibly re-enabled in the DOM and clicked**: the server refused, the optimistic mark rolled back, and the database still read `P`. Unlock asked for confirmation naming `ថ្ងៃទី ១១ កញ្ញា ២០២៦` |
| **F** monthly review | Reached from the register with the class carried. Sheet printed `ថ្នាក់៖ ៤ខ តេស្ត` — where `settings.class_name` is `ថ្នាក់ទី៣`. Summary read `៥ សិស្ស · កត់ត្រា ២ ថ្ងៃ · ○ ១ ច្បាប់ · × ០ អវត្តមាន · មក ៨៣.៣%`. Empty class `២ក` rendered the empty state, not a blank area |
| **G** yearly review | `ថ្នាក់៖ ៤ខ តេស្ត · ឆ្នាំសិក្សា 2025-2026`, linking back to **both** the register and the monthly sheet |
| **H** mobile | 360 / 390 / 430px: no horizontal page scroll at any width; minimum tap target **44px**; the view switcher is correctly absent below `lg`, so the list is the whole screen |

Two further observations worth recording:

* A **forged `?class=`** (a uuid the teacher does not hold) resolved to their own default class rather
  than erroring or leaking — `resolveServerScope` doing exactly what §28 requires. Observed by
  accident while guessing a class id.
* The only console errors during the session were Next.js HMR websocket failures after a dev-server
  restart. No application errors.

Fixture data was restored afterwards: the test mark reverted to `P` with an empty reason, and no lock
left behind.

---

## 6. Regression contracts

| Contract | How it is held |
| --- | --- |
| Class isolation | `resolveServerScope` re-validates `?class=`; proved live (forged id → own default) and by 64/64 RLS |
| Student isolation | Roster from `fetchStudentsForScope`, never re-filtered in the UI; `periodSummary` bounded to it |
| Lock isolation | Locks are per class/date; server re-checks on every write — proved by bypassing the client guard |
| Date isolation | Marks stored per date in `attendanceHistory[date]`; Case C proved both directions |
| Document identity | Both sheets and both exports name the class and year of the data they carry; pinned by two harnesses |
| Status semantics | `P`/`L`/`A`/`AP` meanings untouched; `verify-attendance.mts` A1–A4 unchanged and passing |

---

## 7. Remaining known issues

* **The monthly and yearly attendance reads are scoped by `teacher_id`, not by class.** Both filter to
  the roster at render, so no wrong mark is ever displayed, and `periodSummary` is bounded to the
  roster for the same reason. Narrowing the query is a performance change, not a correctness one.
* **The 3D room paints an unmarked pupil in the present colour.** Real, and out of scope per §31. The
  2D plan distinguishes them (dashed grey plus a `—` glyph); the 3D view does not.
* **`ចំនួនសិស្ស` still exists** on the monthly screen. Bounded and explained now, but a legacy paper-form
  affordance; removing it is a product decision.
* **The monthly A4 preview is still 297mm on a phone.** It scrolls inside its own `.preview-scroll`
  as the frame contract requires. The answer for phone review is the F16-3 summary, not reflowing a
  ministry document.

## 8. Deferred

| Item | Why |
| --- | --- |
| A `late` (`មកយឺត`) status | The vocabulary has three entry marks and `L` means ច្បាប់, not late — the parent portal misreading `L` as late was a recorded defect. A fourth code touches every counting surface, the ministry registers (no late column) and `verify-attendance.mts` A1/A4. §4 forbids redefining semantics for UI convenience. Needs a product decision. |
| An engine report for monthly/yearly | §30 — the Print Center already catalogues both correctly as `legacy_only`. |
| Class-scoping the two attendance queries | See §7. |
| Register speed / save feedback | Done in `ede3474`; §31 warns against re-opening. |
