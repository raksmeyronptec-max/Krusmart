# Phase 17 — Attendance status semantics

Implements `docs/phase17-attendance-semantics.md`, measured against `6eef005`.

---

## 1. The domain decision

**Model A: three statuses, no stored lateness. Unchanged.**

```
P  មក        in class
L  ច្បាប់     absent WITH the school's permission
A  អវត្តមាន   absent without
AP            a legacy spelling of L; read, never written
```

> **មកយឺត does not exist in KruSmart.** Lateness is recorded by no screen, stored by no column, and
> counted by no total.

**This decision is taken against verified evidence that MoEYS models lateness.** Three authoritative
research passes were run, and they disagreed:

| Official source | States | Lateness |
| --- | --- | --- |
| **PLP** `plp.moeys.gov.kh` — Dept. of Primary Education | `PRESENT / ABSENT / LATE / LEAVE` = វត្តមាន / អវត្តមាន / **យឺត** / ច្បាប់ | **yes** |
| **SIS** `sis.moeys.gov.kh` | `Attend / Excused / Unexcused` = ចូលរៀន / មានច្បាប់ / ឥតច្បាប់ | no — `យឺត` absent from all 159 translation files |
| **Prakas №១២៦៩** Model Primary School Standards, 126 pp | វត្តមាន / អវត្តមាន only | no — all 30+ `យឺត` mean *slow learner* |

And current ministry instructions (№៤១ for 2025-2026, №៤៧ for 2026-2027 p.8) require primary teachers
to record attendance **on PLP** — the four-state system.

So `docs/phase16-implementation.md`, which deferred a late mark citing "the ministry registers (which
have no late column)", was **right to defer and wrong about why**. That premise is now falsified and
is corrected in the audit.

Three reasons it is still the wrong change for this phase, in order of weight:

1. **No source defines how a late mark counts.** PLP lists `LATE` beside `PRESENT` rather than under
   it, implying a late pupil is not counted present — a child five minutes late scoring 0% for the
   day. No ministry document found states that. §7 requires the arithmetic before the status exists.
2. **All three ministry forms in this product are structurally unable to print it.** The monthly
   sheet gives each day exactly two sub-columns (`អ`, `ច្ប`); the yearly totals `ច្ប` / `អច្ប`; the
   record book splits `ចំនួនពេលអវត្តមាន` into `មានច្បាប់` / `គ្មានច្បាប់`. A `យឺត` mark would print
   as nothing on all three — the exact *database ≠ paper* failure §18 forbids. The instruction that
   would say how to redesign them (№១១ អយក.សណន, 19 Feb 2021) could not be obtained from any
   reachable ministry surface.
3. **The two ministry systems disagree**, so which to mirror is a product-owner fact.

**Established beyond doubt, and this matters more than the deferral:** `L` = ច្បាប់ is named and
modelled correctly. PLP uses the *same word* for the *same concept* — a status distinct from
`ABSENT`, where permission does not make the pupil present. KruSmart's `A` = អវត្តមាន matches PLP's
`ABSENT` likewise. Three of KruSmart's marks map 1:1 onto three of PLP's four.

---

## 2. What changed

The counting was already unified before this phase — `tallyAttendance` is the one arithmetic and the
parent portal's old "L is late and counts as present" reading was closed earlier. What this phase
found was eight ways the product could still **say** two things about one mark, plus one hole where
it would store a mark that means nothing at all.

### D1 · `lib/types.ts` called `L` "late"

A second declaration of the union sat above `/** Attendance mark: present / **late** / … */`. The
file every row type is looked up in told a developer the discredited meaning. It now re-exports the
single declaration.

### D2 · The 3D room counted by hand, and called unmarked pupils present

```ts
const getStatus3 = (…) => (…[uid].status) || 'P';               // unmarked → present
if (st === 'P') p++; else if (st === 'L') l++; else a++;         // AP and unknown → absent
```

Three faults: an unmarked pupil was coloured and counted as present; `AP` (a *permitted absence*) and
every unrecognised value were folded into *absent*; and it was a private copy of an arithmetic that
exists once. It runs `tallyAttendance` now, resolves colour through `markFor`, paints unmarked seats
a neutral grey, and shows a `មិនទាន់` count.

**Why the harness missed it for so long:** A5 scanned for `/status\s*(?:===|!==)…/`. This variable was
named `st`. A rule enforced by a regex that matches one variable name is not enforced.

### D3 · Nothing validated the stored value — demonstrated, not theorised

`saveAttendance(status: string)` went straight into the upsert, and the column is free `TEXT` with no
`CHECK`. Proven against the running stack as the signed-in fixture teacher, through PostgREST:

```
PATCH /rest/v1/attendance?student_id=eq.…&date=eq.2026-09-11
{ "status": "late123" }   →  200, row updated
```

`/students/[id]` then printed **late123** verbatim as that pupil's mark for the day, beside a real
one. RLS was never at fault: the row belonged to that teacher. Nothing said the *value* was nonsense.

Closed at both layers:

* `isEnterableStatus()` in the vocabulary, called by **both** server writers before the scope is
  resolved.
* **Migration `00034`** — `CHECK (status IN ('P','L','A','AP')) NOT VALID`.

`NOT VALID` is deliberate: it enforces every future insert and update while leaving existing rows
unchecked, so the migration cannot turn a data problem into an outage on a table every teacher writes
to daily, and no historical row is silently rewritten into a meaning somebody guessed. The same
attack re-run after the migration returns `23514`.

The constraint allows four codes where the action allows three: **the database says what may be
stored, the action says what may be entered.** Excluding `AP` would make legacy rows unwritable,
which is the silent reinterpretation §11 forbids.

### D4 · One meaning, two words — `L` vs `AP`

`AP` is declared identical to `L` in `inClass`, `excused` and `short`, yet carried its own label
(`សុំច្បាប់`) and its own badge colour. The same permitted absence rendered two ways depending on
which spelling was stored. `AP` now carries `L`'s label and `L`'s tone. No stored row changes
meaning; nothing has ever written `AP`.

### D6 · Dead `late` keys

`late: 'មកយឺត'` and `late: 'Late'` remained in both parent locales with no consumer — the exact
string that produced the original defect, sitting there waiting to be wired up. Removed, with the
reason recorded in place.

### D7 + D8 · A second label map, whose comment had already drifted

`ATTENDANCE_BADGE` re-declared all four Khmer labels as literals, and its doc comment still asserted
that the parent portal called `L` `មកយឺត` and "should change" — long after the portal had changed.
Documentation describing a live contradiction that no longer exists invites someone to resolve it the
wrong way. The map is now **derived** from `ATTENDANCE_MARKS`; only the tone is decided locally,
because a colour is a property of the badge and not of the mark.

### Found during browser acceptance · a hydration mismatch on the parent's attendance list

`toLocaleDateString('km-KH', …)` resolved differently on the two sides — the server rendered
`១១ កញ្ញា 2026`, the browser `September 11, 2026` — so React threw a hydration error and regenerated
the list on every load. Replaced with the product's own `formatKhmerDate`, which is pure string
formatting over `YYYY-MM-DD` and cannot drift. The parent portal's console is now clean.

### D5 · Two audiences, two registers of language — **deliberately kept**

| Code | Teacher app | Parent portal |
| --- | --- | --- |
| `P` | មក | មានវត្តមាន |
| `L` | ច្បាប់ | សុំច្បាប់ |

The *meanings* agree and are now pinned. The *words* differ, because the portal addresses a parent
formally and is bilingual, and because the Phase 16 brief chose `មក` for the register deliberately.
What is guarded instead is the failure mode: A9 asserts the portal maps `L` and `AP` to one tile,
counts through `tallyAttendance`, and has no `late` key left to wire up.

---

## 3. Files changed

| File | Change |
| --- | --- |
| `supabase/migrations/00034_attendance_status_domain.sql` | **new** — `CHECK … NOT VALID`, idempotent, reports rather than repairs |
| `lib/attendance/status.ts` | `isEnterableStatus()`; `AP` takes `L`'s label |
| `lib/types.ts` | re-exports the union instead of re-declaring it |
| `components/ui/feedback/Badge.tsx` | badge map derived from the vocabulary; `ATTENDANCE_UNMARKED_COLOR` |
| `app/(main)/attendance/layout/actions.ts` | both writers validate before writing |
| `app/(main)/attendance/layout/ThreeClassroom.tsx` | shared tally + `markFor` colours + unmarked state |
| `app/parent/i18n.ts` | dead `late` keys removed, both locales |
| `app/parent/(portal)/attendance/AttendanceClient.tsx` | deterministic Khmer date |
| `scripts/verify-attendance.mts` | A5 widened; **A9** added (18 checks) |
| `scripts/validate-rls.mjs` | attendance status domain (7 checks) |
| `docs/phase17-attendance-semantics.md`, `docs/phase17-implementation.md` | **new** |

No score, result, ranking, Print Center, enrollment, classroom, grading or navigation code was
touched. No RLS policy changed.

---

## 4. Automated verification

| Gate | Before | After |
| --- | --- | --- |
| `npm run lint` | clean | clean |
| `npm run typecheck` | clean | clean |
| `npm run verify` | 33/33 | **33/33** |
| `npm run verify:live` | 36/36 | **36/36** |
| `node scripts/validate-rls.mjs` | 64/64 | **71/71** |
| `npm run build` | clean | clean |

`scripts/validate-migrations.mjs` reports 7/9. Both failures (tests 3 and 4, preflights around
migration 00017) were confirmed **pre-existing** by stashing this phase's changes and re-running.
That script is not part of `npm run verify`.

### A5, widened

The scan now captures any identifier, and was proved to discriminate rather than pass vacuously:

| Input | Flagged |
| --- | --- |
| `if (st === 'P') p++; else if (st === 'L') l++;` — the line that slipped through | **2** |
| `if (row.status === 'A') absent++` | 1 |
| `marks[s.id].status === 'AP'` | 1 |
| `else if (grade === 'A')` — a letter grade | 0 |
| `stu.grade === 'A'` | 0 |
| `if (kind === 'L')` — the result of `absenceKind()` | 0 |

Letter grades and module-derived values are excluded by identifier name, both documented at the
pattern.

---

## 5. Browser acceptance

Live local stack, real classes, fixture teacher `ranktest@krusmart.local`.

| Case | Result |
| --- | --- |
| Every status writes | `៤ខ តេស្ត` marked to hold one of each: 3 × `P`, 1 × `L` (ដារា, reason ឈឺ), 1 × `A` (រតនា). All persisted through the server action **with the new constraint active** |
| Reload | Marks and reason survive; register reads `៥ សិស្ស · ៣ មក · ១ ច្បាប់ · ១ អវត្តមាន · ៦០%` |
| Daily = monthly | Monthly sheet: `ដារា អ=០ ច្ប=១`, `រតនា អ=១ ច្ប=០`; summary `១ ច្បាប់ · ១ អវត្តមាន`. The rate differs (60% vs 66.7%) **correctly** — one day against the month, both `present ÷ marked` |
| Daily = yearly | `ដារា ច្ប=១`, `រតនា អច្ប=១`, class totals `ច្បាប់ ១ · អត់ច្បាប់ ១` |
| **Parent portal** | For ដារា, whose teacher pressed **ច្បាប់**: tiles read `មានវត្តមាន ០ · សុំច្បាប់ ១ · អវត្តមាន ០`, rate **០%**, row `១១ កញ្ញា ២០២៦ · ឈឺ · សុំច្បាប់`. **No `យឺត` anywhere on the page.** Before the earlier fix this showed មកយឺត and 100% |
| Invalid status, database | `late123` → `23514 check_violation`; a legitimate `L` still writes |
| Invalid status, UI | `/students/[id]` no longer has a garbage value to print, because none can be stored |

A test parent account was created for the portal check and **deleted afterwards**; `parent_students`
is back to 0 rows and no test user remains.

---

## 6. Remaining known issues

* **`/students/[id]` still falls back to `{ label: r.status }`** for a status it does not recognise.
  Unreachable for new data now that the column is constrained, but a pre-00034 row carrying a
  stray value would still print raw. Left deliberately: the alternative is hiding a row that exists.
* **`ច` / `អ` / `ច្ប` day-cell marks are unverified.** No official source documents them, and SIS
  positively suggests there is no national set — it ships a per-school `អក្សរកាត់ប្រភេទវត្តមាន`
  dictionary. KruSmart's marks are product-owner transcription: plausible, unrefuted, unconfirmed.
* **`excused` / `unexcused` is KruSmart's own derived split**, not a ministry category. PLP does not
  subdivide `អវត្តមាន`; SIS does. Both official, mutually inconsistent.
* **`validate-migrations.mjs` 7/9**, pre-existing.
* `/parent/(portal)/homework` has the same `toLocaleDateString` pattern that caused the attendance
  hydration error. Not touched — out of this phase's scope.

## 7. Deferred

| Item | What it needs first |
| --- | --- |
| **A `យឺត` status (Model B)** | (1) the counting rule — does a late pupil count present? no source says; (2) a printed form that can carry it — all three currently cannot; (3) which ministry system the target schools file into, PLP (4 states) or SIS (3). Now **justified** rather than speculative: PLP has it and instruction №៤៧ mandates PLP. |
| Obtaining **សេចក្តីណែនាំលេខ ១១ អយក.សណន (19 Feb 2021)** | It specifies how the roll-call register is filled and would settle the day-cell marks and the summary form. Published on no reachable ministry surface; `moeys.gov.kh` blocks automated fetching. A logged-in PLP teacher account could export the ministry's own `បញ្ជីហៅឈ្មោះសិស្ស` and show the real columns. |
| Aligning `P`'s label to the ministry's `ចូលរៀន`/`វត្តមាន` | The Phase 16 brief chose `មក` deliberately for the register. Not wrong, just not the ministry's word. A wording decision, not a semantic one. |
| `VALIDATE CONSTRAINT attendance_status_known` | Run on a deployment once its existing data is known clean. The command is in the migration header. |
