# Phase 8 — Attendance + homework

**Follows** [phase7-implementation.md](phase7-implementation.md). Covers the brief's Phases 10
and 11, which [phase0-ux-audit.md](phase0-ux-audit.md) §7 predicted as *"attendance is healthy;
homework needs the class dimension from Phase 1"*.

**Gates:** lint clean · `tsc --noEmit` clean · **30/30 harnesses** (new: `verify-attendance.mts`)
· `next build` clean · the divergence reproduced and the fix confirmed against a real database.

No migration. One new shared module, one new component, one new harness, 12 files converged.

---

## 0. The prediction was half right

Attendance's *screens* are healthy, and homework's class dimension did land in Phase 1. What
neither audit looked at was the **data underneath both**, and that is where this phase went.

`attendance.status` is a TEXT column with no CHECK constraint, four values in play, and — until
this phase — **nothing anywhere declaring what any of them mean**. So eleven surfaces each
decided for themselves, and they did not agree.

---

## 1. ★ The register said one thing; the parent portal told the parent another

The only screen that writes a status is the register, and its middle button is labelled
**ច្បាប់** — absent *with* the school's permission. It writes `L`.

`/students/[id]`, the monthly register (which prints "ច"), the yearly sheet (which gives it a
ច្ប column of its own), the printed parent report and the reporting engine all read `L` that
way. The **parent portal** did not:

```ts
// app/parent/queries.ts, before
const late = count('L')
// Late still counts as attending — the legacy portal treated it that way.
rate: total ? Math.round(((present + late) / total) * 1000) / 10 : null,
```

and rendered it under `late: 'មកយឺត'` — *arrived late*.

So a pupil their teacher recorded as **away with permission** appeared to their own parent as
**present and on time**, and lifted that child's attendance rate while doing it. The sheet the
teacher prints and hands over and the portal the parent signs into stated **different attendance
rates for the same days**: `/parent-report` divides `present / (present + excused + absent)`, the
portal divided `(present + excused) / total`.

### And `AP` was an absence to half the app

`AttendanceStatus` declares a fourth value, `AP`. Nothing has ever written it — the register
offers three marks. But five readers counted it as an absence and five dropped it silently, so a
legacy row was an absence on the yearly sheet, the record book and `/score-analyse`, and
invisible on the dashboard, the pupil page, the monthly register and the parent report.

**`report-data.ts` disagreed with itself.** `absenceKind` folded `AP` into *unexcused*;
`resolveRecordBook`, 800 lines later, counted `AP` as the *excused* half. Same file, same
column, opposite readings.

### ★ …which made every printed record book's excused column structurally zero

`resolveRecordBook` and `RecordBookClient` both said:

```ts
// "AP is an excused absence, A an unexcused one — the two statuses the
//  attendance feature writes."
if (row.status !== 'A' && row.status !== 'AP') continue
```

The attendance feature writes **neither** of those as its excused mark. It writes `L`. So the
`continue` skipped every permitted absence a teacher had ever recorded — counted in neither
column — and the excused column could only ever be filled by a value nothing produces.

Proven against the live database rather than argued. Four days seeded for one fixture pupil
(P, P, ច្បាប់, absent), then both rules run over the rows as they came back:

```
live rows : ["P","P","P","L","A"]
OLD record book -> excused 0 · unexcused 1
NEW record book -> excused 1 · unexcused 1
```

---

## 2. The fix: one vocabulary

[lib/attendance/status.ts](../lib/attendance/status.ts) is the declaration those eleven surfaces
were missing — pure, node-loadable, imported by the teacher app, the reporting engine, the admin
console and the parent portal alike. It is the counterpart of `lib/scores/completion.ts`, and it
exists for the same reason.

| | `inClass` | `excused` | prints |
| --- | --- | --- | --- |
| `P` វត្តមាន | ✓ | — | ✓ |
| `L` ច្បាប់ | ✗ | ✓ | ច |
| `A` អវត្តមាន | ✗ | ✗ | អ |
| `AP` សុំច្បាប់ | ✗ | ✓ | ច |

Two rules do all the work:

- **`inClass` is the only question a rate may ask, and only `P` answers yes.** Permission
  excuses an absence; it does not undo it.
- **`AP` is a legacy spelling of `L`.** It is read, never written, and kept out of `ENTRY_MARKS`
  so a teacher is never offered two spellings of one mark.

`tallyAttendance()` is the arithmetic — present / excused / unexcused / absent / marked /
unknown / rate — and an unrecognised status is counted as `unknown` rather than being folded
into something it is not. The denominator is days **recorded**, not days in the month: a
register kept for nine days of twenty describes nine days.

### What moves on screen

**Three teacher-facing rates read lower** for any pupil with a ច្បាប់ day, because
`/students/[id]`, the dashboard and the parent portal all counted excused absence as attendance.
The pupil page's own comment gave the game away — *"it counts as attending here … the child is
not truant"* — which measures truancy and calls it attendance. Truancy and attendance are two
questions; `unexcused` answers the first, `rate` answers the second, and both are on the page.

Verified live for the seeded pupil: **វត្តមានប្រចាំឆ្នាំ ៦០% · ៥ ថ្ងៃបានកត់ត្រា · អវត្តមាន ២ ·
ច្បាប់ ១ ថ្ងៃ** — three of five recorded days in class. The old rule said 80%.

The dashboard's `todayLate` is `todayExcused`, and its tile says ច្បាប់ rather than យឺត.
The parent portal loses its "late" tile — **nothing in this product records lateness** — and
shows present / ច្បាប់ / អវត្តមាន, with `L` and `AP` folded into one, which is what they always
meant.

`verify-attendance.mts` pins all of it, including the two numbers the parent-facing surfaces
disagreed about: on eight days with four in class, the rate is 50% and *not* the 62.5% the old
portal formula produced.

---

## 3. Completion, on all three views

The brief asks every attendance surface for a completion indication. The app had one — inside
`RosterCheckIn`, which is the **list** view only. A teacher working from the seating plan or the
3D room, the two a desk user is most likely to pick, was never told how many pupils were still
unmarked, and neither of those views distinguishes "not marked" from "marked present" at a
glance.

[RegisterTally](<../app/(main)/attendance/layout/RegisterTally.tsx>) moved it above the view
switcher, computed once from the same `tallyAttendance` the sheets and the portal run. Confirmed
live across all three views; on the ច្បាប់ date it reads **០ វត្តមាន · ១ ច្បាប់ · ០ អវត្តមាន ·
៣៤ មិនទាន់**.

A pupil carrying a status this application does not recognise counts as *not yet marked* — the
safe direction, because it prompts a teacher to look rather than reporting a day as finished.

---

## 4. The navigation named a view, not the job

The brief is explicit: *"Do not make the 3D/seating interaction the primary mental model for
ordinary attendance."* The **screen** has not worked that way since it grew a list view, which
is its default and the only one that works on a phone. The **navigation** still did: វត្តមាន's
only visible entry read `ចុះវត្តមានតាមប្លង់តុ` — "check in by desk layout".

It reads `ចុះវត្តមានប្រចាំថ្ងៃ` now. The URL is untouched (§34) and the seating plan is still
one tap inside; the alias keeps `seating layout` so the command palette still finds it.

---

## 5. Homework — verified, not rebuilt

The brief wants `Homework ├─ Enter ├─ Review └─ Send`, inheriting active class, students,
teacher and academic year. All of it is already there, and rebuilding it would have been the
audit's rule 42:

- **Enter** is `/homework/enter`, class-scoped, with `cycleProgress` / `dayProgress`, an
  `aria-live` region, one undo for a bulk fill, and dirty-cell saving.
- **Review** is `ពិនិត្យប្រចាំខែ`, a tab on the entry screen over the *same loaded period*, so
  switching discards nothing. Making it a third route would duplicate the screen for no gain,
  and the brief also says not to duplicate the score architecture unnecessarily.
- **Send** is `/homework/send`, given its class dimension in Phase 1 (migration 00032). Re-read
  this phase: `getAssignments` resolves the scope server-side and filters
  `class_id.eq.<class>,class_id.is.null`; `class_id` on a write comes from `resolveServerScope`
  and never from the payload.

Nothing to change. Homework's inheritance is intact and its three legs are all reachable.

---

## 6. Known remaining work

1. **The parent-portal half is proven in code and in the harness, not in a browser.** The dev
   database has no `parent_students` link and creating a parent auth user needs rights this
   session does not have. The teacher-side correction was confirmed live; the portal now calls
   the same function.
2. **No CHECK constraint on `attendance.status`.** The column still accepts anything, and
   `tallyAttendance` counts the unrecognised separately rather than guessing. A constraint would
   be a migration, and this phase needed none.
3. **`verify-ranking-live.mts`'s semester section** — unchanged since Phase 7 §3.
4. **`text-white` on `bg-brand`** (19 sites) and **`text-warning` on light** — unchanged since
   Phase 7 §6.
5. **P2-11 accessibility** — the live-region and keyboard half of the print screens, unchanged.
6. **00033 not applied to the dev database** — unchanged since Phase 6.
7. **Class-card completion + attendance summary** — unchanged since Phase 6. Now cheaper: the
   card needs one aggregate query and `tallyAttendance` to read it.
8. **CLAUDE.md** — its migration table stops at 00031 and it now also omits `lib/attendance/`,
   the paper contract, `placing()` and `--brand-soft`. Overdue since Phase 6.

**Disclosed side effect:** four attendance rows were written for fixture pupil សុខា to reproduce
the defect and were deleted afterwards; the register is back to the single pre-existing row.
