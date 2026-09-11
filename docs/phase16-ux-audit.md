# Phase 16 — Attendance UX + Attendance Lifecycle Audit

**Read-only.** Measured against the working tree at `ede3474`, not against earlier audit text.

Attendance was excluded from the Phase 14 and Phase 15 audits on the grounds that the register
rewrite was in flight. It has since landed (`ede3474`), so this is the first audit to measure the
attendance tree as it actually stands. Findings that the rewrite already closed are recorded as
**closed**, not re-opened.

---

## 1. Executive summary

**The daily register is in good shape. Everything after it is a print preview.**

`/attendance/layout` now does the job the phase brief describes: it opens on the active class and
today, paints the real marks server-side, offers one primary action (`មកទាំងអស់`), filters to the
exceptions, saves optimistically with per-row failure and retry, and says when the register is
finished. Sections §8, §9, §10, §11 and §23 of the brief are substantially **already met**, and
§33's F16-1 and F16-2 are therefore largely spent. They are not rebuilt here.

The weakness is the other two thirds of the lifecycle:

> **A teacher who finishes today's register has no way to reach the month, and a teacher looking at
> the month has no way back to the register.**

`/attendance/monthly` links to `/attendance/yearly`. `/attendance/yearly` links back to
`/attendance/monthly`. Neither names `/attendance/layout`, and the register names neither of them.
The three screens that make up one job are a two-node loop with the daily action outside it.

And when the teacher does get to the month, the screen does not answer a question — it renders a
297mm ministry sheet and nothing else. There is no class total anywhere on screen. The teacher
reads twenty-eight per-pupil `អ`/`ច្ប` cells and adds them up themselves.

Underneath both sits a correctness defect the Phase 14 harness already names as a known gap:

> **Both attendance sheets print `settings.class_name`** — the legacy per-teacher value — so a
> teacher holding three classes prints every month of every class under one name. This is the exact
> defect Phase 14 closed on nineteen other screens. Attendance was the deferred case.

**What works and must not be rebuilt:** the status vocabulary and its harness, the server-resolved
date, the optimistic-save and rollback machinery, the lock (client-refused *and* server-enforced),
the class-scope chain, the seating plan's separated edit mode, and the roster's server scope.

---

## 2. Attendance journey map

Traced against the code at `ede3474`.

```
CLASSROOM ?class=A                            ✅ card វត្តមាន → /attendance/layout
DASHBOARD                                     ✅ quick action ចុះវត្តមាន → /attendance/layout
SIDEBAR វត្តមាន                                ✅ module front door → /attendance/layout
     │
     ▼
REGISTER /attendance/layout?class=A
     │   class + grade + year          ✅ ClassContextBar, self-gating
     │   today                         ✅ server-resolved todayISO(), never client-derived
     │   marks                         ✅ shipped with the page, no post-mount fetch
     │   mark one / mark all           ✅ optimistic + rollback + per-row retry
     │   completion                    ✅ មិនទាន់ count, never "complete" while unmarked
     │   lock                          ✅ client-refused AND server-enforced
     │   future date                   ⚠️ F16-5 — UI-only `max`, no clamp on the handler
     │
     ├── ▶ monthly ?                   ❌ F16-1 — no link exists
     └── ▶ yearly  ?                   ❌ F16-1 — no link exists
     ▼
MONTHLY /attendance/monthly?class=A
     │   class name on the sheet       ❌ F16-2 — settings.class_name
     │   academic year in the .xlsx    ❌ F16-2 — hard-coded ២០២៤-២០២៥
     │   class total for the month     ❌ F16-3 — none on screen at all
     │   empty class                   ❌ F16-4 — blank white area, no message
     │   cleared ចំនួនសិស្ស field        ❌ F16-4 — whole preview vanishes silently
     │   ▶ yearly                      ✅ linked, class carried
     │   ▶ register                    ❌ F16-1 — no link
     ▼
YEARLY /attendance/yearly?class=A
     │   class name on the sheet       ❌ F16-2 — settings.class_name (screen and .xlsx)
     │   ▶ monthly                     ✅ linked, class carried
     │   ▶ register                    ❌ F16-1 — no link
     └── ▶ (dead end)
```

---

## 3. Findings

### F16-1 · P1 · The three attendance screens are not one workflow

**Route/component:** `app/(main)/attendance/layout/AttendanceLayoutClient.tsx`,
`app/(main)/attendance/monthly/MonthlyAttendanceClient.tsx`,
`app/(main)/attendance/yearly/YearlyAbsenceClient.tsx`

**Problem.** The register has exactly one outbound link, `/enrollment`, and it appears only when the
roster is empty. Monthly links to yearly; yearly links to monthly. The daily action — the thing a
teacher does every morning — is reachable from neither review screen, and neither review screen is
reachable from it.

**Evidence.** `grep -n "Link\|href("` on the register returns three hits, all inside the empty-roster
state. Monthly's only outbound link is `classHref("/attendance/yearly")`; yearly's is
`classHref("/attendance/monthly")`.

**Fix.** One shared declaration of the three views, rendered as a small secondary strip on each
screen showing the other two. Not a toolbar — §18 is explicit that the register must not grow one.

**Risk.** Low. Additive links, class carried by the existing `useClassHref`.

---

### F16-2 · P1 · Both attendance sheets print the wrong class name

**Route/component:** monthly client line 310; yearly client lines 159 and 229.

**Problem.** `settings.class_name` is the legacy per-**teacher** row — one value for the whole
account. A teacher holding `៤ក`, `៤ខ តេស្ត` and `២ក` prints all three registers under whichever name
is stored there. Phase 14 closed this on nineteen screens through `documentClassName()`;
`verify-document-identity.mts` names attendance as the deliberate exception:

> *"Attendance is absent from this list on purpose: its screens were excluded from the Phase 14
> audit because the register was being rewritten at the time, so they are a KNOWN gap."*

**Evidence.**
```
monthly:310   const className = settings?.class_name || "........"
yearly:229    <p>ថ្នាក់ទី៖ {settings?.class_name || '..........'} · ឆ្នាំសិក្សា {academicYear}</p>
yearly:159    [`ឆ្នាំសិក្សា ${academicYear} · ថ្នាក់ ${settings?.class_name || ''}`]
```

A second, separate defect in the same region: the monthly **Excel** export hard-codes both fields.

```
monthly:139   r7[0] = { v: 'ថ្នាក់ទី..................', … }
monthly:140   r7[totalCols-3] = { v: `ឆ្នាំសិក្សា ២០២៤-២០២៥`, … }
```

The .xlsx therefore prints a literal row of dots for the class and a **two-year-stale academic
year**, on every export, for every class, regardless of what the on-screen sheet says.

**Fix.** `useDocumentClassName(settings?.class_name)` on both screens, screen and export alike, and
the computed academic year in the export. Add both files to `PRINT_SCREENS` in
`verify-document-identity.mts` and delete the known-gap paragraph.

**Risk.** Low, and it is the contract Phase 14 already built. This is a document identity fix, not
an attendance semantic change.

---

### F16-3 · P2 · The monthly screen prints a month; it does not report one

**Route/component:** `app/(main)/attendance/monthly/MonthlyAttendanceClient.tsx`

**Problem.** §16 asks the screen to answer *"what was attendance like throughout this month?"* and
warns against making the teacher calculate totals. The screen is an A4 preview and nothing else:
the only aggregates on it are the per-pupil `អ` and `ច្ប` columns at the right-hand edge of a 297mm
sheet. There is no class figure anywhere — not pupils, not days recorded, not total absences.

On a phone the sheet is inside a horizontal scroller, so those per-pupil totals are off-screen at
rest. The teacher scrolls right, reads twenty-eight numbers and adds them up.

**Fix.** A compact summary strip above the preview, computed through the canonical
`tallyAttendance` so it cannot disagree with the sheet below it or with the parent portal. No new
report, no new engine — screen chrome over existing data.

**Risk.** Low, provided the arithmetic is the shared one. Writing a private loop here would be the
twelfth reading `lib/attendance/status.ts` exists to prevent.

---

### F16-4 · P2 · The monthly preview can vanish with no explanation

**Route/component:** `app/(main)/attendance/monthly/MonthlyAttendanceClient.tsx:297-300`

**Problem.** Two ways to get a blank white area with no message:

1. A class with no pupils. `renderPages()` returns `null` and nothing is rendered. The file does not
   import `EmptyState`; `grep -c EmptyState` returns `0`.
2. Clearing the `ចំនួនសិស្ស` number field. `parseInt('')` is `NaN`, `Math.min(NaN, n)` is `NaN`,
   `NaN === 0` is false so the guard does not fire, and `while (current <= NaN)` never runs. The
   entire preview disappears while the field shows empty.

The same control silently truncates the **Excel export** (line 176) and the printed sheet: setting
it to 10 for a class of 30 prints a register missing twenty pupils, with nothing on the sheet or the
screen saying so.

**Fix.** An `EmptyState` for the empty class. Clamp the count to the roster, and say on screen when
it is truncating.

**Risk.** Low. The control's legacy behaviour is preserved — it is only made visible and bounded.

---

### F16-5 · P3 · The register's future-date guard is a UI claim only

**Route/component:** `app/(main)/attendance/layout/AttendanceLayoutClient.tsx`

**Problem.** The date input carries `max={initialDate}`. That paints the control invalid but does
not stop `onChange` firing for a typed or pasted future date, and `changeDate` accepts whatever it
is given. The server has no future-date rule either, so a mark saved against tomorrow persists.

§7 says to expose an existing restriction clearly and not to invent a new policy. The restriction is
already asserted in the markup; the handler simply does not honour it.

**Fix.** Clamp in `changeDate` and say why in Khmer. This makes the claim already on screen true.
No server policy is invented — a mark against a future date remains something the database accepts,
exactly as before.

**Risk.** Very low.

---

### Closed by `ede3474` — recorded, not re-opened

| Was | Now |
| --- | --- |
| No way to see who is still unmarked | `មិនទាន់` filter chip with a live count |
| Completion implied by a full-looking list | `registerSummary().complete`, false while any pupil is unmarked |
| Save failure reported only in a toast | Per-row `មិនទាន់បានធ្វើសមកាលកម្ម` + `ព្យាយាមម្តងទៀត` carrying the exact mark |
| Four dashboard-style tally cards | One compact strip |
| Seating plan could be tapped into during marking | Arranging is a named mode that cannot write a mark |
| Reason field on every row | Bottom sheet, absences only, with one-tap reasons |

### Verified sound — no change proposed

| Brief § | Contract | Where |
| --- | --- | --- |
| §7 | Today resolved server-side, never client-derived | `layout/page.tsx:todayISO()` |
| §13 | Date switching is race-safe **by construction** — a late response writes into its own date bucket in `attendanceHistory[date]`, so it can never overwrite a newer day | `AttendanceLayoutClient:loadAttendanceFromDB` |
| §14 | Class switch remounts the client via `key={scope.classId}`, so roster, marks and lock cannot be carried across | `layout/page.tsx` |
| §12 | Lock refused client-side *and* re-checked server-side on every write | `layout/actions.ts:isDateLocked` |
| §20 | `/classroom`, `/dashboard` and the sidebar all point `ចុះវត្តមាន` at the register, not a sheet | `ClassroomClient:219`, `dashboard/page.tsx:57`, `navigation.ts:206` |
| §21 | Roster comes from `fetchStudentsForScope`, never filtered again in the UI | all three pages |
| §28 | `?class=` re-validated against the caller's own assignments on every request | `resolveServerScope` |
| §4 | Status semantics unchanged; `P`/`L`/`A`/`AP` meanings pinned by 40 harness checks | `verify-attendance.mts` |

---

## 4. Top priorities

| # | ID | Priority | One line |
| --- | --- | --- | --- |
| 1 | F16-2 | P1 | Both attendance sheets print the wrong class name; the .xlsx also prints a stale year |
| 2 | F16-1 | P1 | Register ↔ monthly ↔ yearly is a two-node loop with the daily action outside it |
| 3 | F16-3 | P2 | The monthly screen has no class total anywhere on it |
| 4 | F16-4 | P2 | The monthly preview can blank silently, and truncates the export without saying so |
| 5 | F16-5 | P3 | The future-date guard is markup only |

---

## 5. Selected implementation scope

All five. They are tightly related — every one lives in the attendance tree, none touches the score,
result or reporting engines, and F16-2 completes a contract Phase 14 already built and tested.

The brief's F16-1 (register speed) and F16-2 (save feedback) are **deliberately not re-opened**:
`ede3474` did that work, and §31 warns against turning this into a general cleanup.

## 6. Deferred work

| Item | Why it stays out |
| --- | --- |
| A `late` (`មកយឺត`) status | The vocabulary has three entry marks and `L` means ច្បាប់, not late. Adding a fourth touches every counting surface, the ministry registers (which have no late column) and `verify-attendance.mts` A1/A4. §4 forbids redefining semantics for UI convenience. |
| Class-scoping the monthly/yearly attendance fetch | Both read by `teacher_id` and filter to the roster at render, so no wrong mark is displayed. Narrowing the query is a performance change, and §27 warns against rewriting working server loading. |
| The monthly `ចំនួនសិស្ស` control's existence | It is a legacy paper-form affordance. Bounding it is in scope; removing it is a product decision. |
| A monthly/yearly engine report | §30 — the Print Center already catalogues both as `legacy_only`, correctly. |
| 3D seat colour for unmarked pupils | The 3D room paints an unmarked pupil in the present colour. Real, but §31 scopes this phase away from it. |
| `/attendance/monthly` mobile sheet layout | A 297mm ministry sheet is paper. It scrolls in a `.preview-scroll` as the frame contract requires. The fix for phone review is F16-3's summary, not reflowing the document. |
