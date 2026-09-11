# Phase 17 — Attendance status semantics

**Read-only audit.** Measured against the working tree at `6eef005`.

The question this phase answers is not "which button should we add?" but **"what exactly does each
attendance mark mean, and does every surface tell the same truth about it?"**

---

## 1. Current KruSmart status model

### 1.1 What is stored

`public.attendance.status` is **free `TEXT`, `NOT NULL`, `DEFAULT 'P'`**, with **no `CHECK`
constraint** — confirmed against the live database:

```
column_name | data_type | is_nullable | column_default
status      | text      | NO          | 'P'::text
```

Constraints on the table are the primary key, the two foreign keys, and `UNIQUE (student_id, date)`.
Nothing constrains the *value*.

What is actually stored in the live database today:

| status | rows |
| --- | --- |
| `P` | 34 |
| `L` | 2 |

No `A` rows and **no `AP` rows exist**. `AP` has never been written by any build of this
application; it is read-only legacy tolerance.

### 1.2 What the codes mean

`lib/attendance/status.ts` is the declared vocabulary, and every counting surface reads it:

| Code | `label` | `short` | `inClass` | `excused` | Offered for entry |
| --- | --- | --- | --- | --- | --- |
| `P` | មក | ✓ | **true** | false | yes |
| `L` | ច្បាប់ | ច | false | **true** | yes |
| `A` | អវត្តមាន | អ | false | false | yes |
| `AP` | សុំច្បាប់ | ច | false | **true** | **no** — legacy synonym of `L` |

**`L` means ច្បាប់ — an absence the school permitted. It does not mean late.** This is settled by
the only screen that writes a status: its button is labelled ច្បាប់.

### 1.3 Where each value is interpreted

| Surface | Reads through | Verdict |
| --- | --- | --- |
| `/attendance/layout` register | `ENTRY_MARKS`, `markFor`, `registerSummary` | ✅ |
| `/attendance/layout` seating plan (2D) | `markFor` + `SEAT_TONE` | ✅ |
| **`/attendance/layout` 3D room** | **hand-written comparisons** | ❌ **D2** |
| `/attendance/monthly` | `markFor` → `inClass` / `excused` | ✅ |
| `/attendance/yearly` | `markFor` → `inClass` / `excused` | ✅ |
| `/dashboard` | `tallyAttendance` | ✅ |
| `/students/[id]` counts | `tallyAttendance` | ✅ |
| `/students/[id]` badges | `ATTENDANCE_BADGE` | ⚠️ **D8**, and prints raw unknown values |
| `/score-analyse` | `tallyAttendance` | ✅ |
| `/parent-report` | `tallyAttendance` | ✅ |
| `/record-book` screen | `markFor` → `inClass` / `excused` | ✅ |
| `/admin` dashboard rate | `tallyAttendance` | ✅ |
| Parent portal summary | `tallyAttendance` | ✅ |
| Parent portal tiles/rows | local `STATUS` map → i18n keys | ⚠️ **D5** |
| Reporting engine `attendance_monthly` | `absenceKind` / `attendanceMark` → `markFor` | ✅ |
| Reporting engine `resolveRecordBook` | `markFor` | ✅ |

**The counting is already unified.** The arithmetic defect that made `L` mean two different things
was closed before this phase: the parent portal no longer reads `L` as "late" and no longer adds it
to the attendance numerator. The rate is `present ÷ marked` everywhere, and only `P` counts as
present.

### 1.4 Where `L` becomes មកយឺត today

**Nowhere that a user can see.** The string `មកយឺត` survives in exactly two places, both inert:

* `app/parent/i18n.ts:69` — `late: 'មកយឺត'` (and `en:167` `late: 'Late'`). **Dead keys**: nothing
  calls `t('late')`. This is the exact string that produced the original defect.
* Comments in `app/parent/queries.ts` and `AttendanceClient.tsx` describing the closed defect.

One further occurrence is a **different domain and must not be conflated**: `app/admin/teacher-
attendance` shows `status: "យឺត"` for a **teacher's** GPS check-in, backed by the separate
`public.teacher_attendance` table. Lateness is meaningful when a teacher clocks in against a school
start time. It is not the pupil register.

And one is a false friend: class-administration book 9 is `សៀវភៅសិស្សរៀនយឺត` — pupils who learn
**slowly**, not pupils who arrive late. `យឺត` there means slow.

---

## 2. Ministry / reference evidence

*(External verification pending — see §2.2. Internal evidence below is independent of it.)*

### 2.1 Internal evidence: the forms this product already reproduces

KruSmart already renders three Cambodian school forms, transcribed from real documents by the
product owner. **All three have exactly two absence categories and no lateness column.**

**`/attendance/monthly` — សម្រង់អវត្តមានប្រចាំខែ (monthly absence extract).** Every day of the month
is a column pair:

```
ល.រ │ គោត្តនាម និងនាម │ ភេទ │ ១ │ ២ │ … │ ៣១ │ សរុប
                             ├─┬─┼─┬─┼   ┼─┬─┼─┬─
                             អ│ច្ប│អ│ច្ប│   │អ│ច្ប│អ│ច្ប
```

A day cell records **អ** (absent without permission) or **ច្ប** (absent with permission). Being
present is recorded as a **blank**. There is no third sub-column. The form is an *absence* extract:
it has no vocabulary for "arrived late".

**`/attendance/yearly`** totals the same two per month: `ច្ប = ច្បាប់ · អច្ប = អត់ច្បាប់`, rolled
into semester and annual columns.

**`/record-book`** prints section `ខ. ចំនួនពេលអវត្តមាន` — "number of absences" — with exactly two
columns: `មានច្បាប់` and `គ្មានច្បាប់`.

Three forms, three different spellings of the same pair, one structure:

> **An attendance record is: present, or an absence — and an absence is either permitted or not.**

Note what this says about the register's own wording, which is discussed in §7.

### 2.2 External verification

Three independent research passes against official Cambodian government sources. They did **not**
agree, and the disagreement is the most important finding in this document.

#### Source A — ថ្នាលបឋម / PLP · `plp.moeys.gov.kh` · **authoritative**

MoEYS's own primary-education platform, published by **នាយកដ្ឋានបឋមសិក្សា** (Department of Primary
Education). Its production JavaScript was read directly, and **two separate passes extracted the same
enum**:

```js
// plp.moeys.gov.kh/assets/attendance-D_tvzTT7.js
const g = { PRESENT:"PRESENT", ABSENT:"ABSENT", LATE:"LATE", LEAVE:"LEAVE" }

// plp.moeys.gov.kh/assets/AttendancePage-CNoFZJ3M.js
[{status:N.PRESENT, label:"វត្តមាន"}, {status:N.ABSENT, label:"អវត្តមាន"},
 {status:N.LATE,    label:"យឺត"},     {status:N.LEAVE,  label:"ច្បាប់"}]
```

**Four states, and one of them is យឺត.** It also carries a closed reason list (`ប្រភេទមូលហេតុ`:
បញ្ហាសុខភាព · បញ្ហាគ្រួសារ · បញ្ហាផ្ទាល់ខ្លួន · បញ្ហាមធ្យោបាយធ្វើដំណើរ · បញ្ហាកត្តាធម្មជាតិ).

Two current ministry instructions make this the register primary teachers actually file into:

* **សេចក្តីណែនាំលេខ ៤១ អយក.សណន** (2025-2026): teachers may *print* the roll-call list **from PLP**.
* **សេចក្តីណែនាំលេខ ៤៧ អយក.សណន** (2026-2027), p.8: «ពង្រឹងការអនុវត្តការគ្រប់គ្រងវត្តមាន គ្រូ សិស្ស
  ដោយត្រូវចុះវត្តមានតាមថ្នាលបឋម (PLP) ជាប្រចាំ» — pupil and teacher attendance **must** be recorded
  on PLP.

#### Source B — SIS · `sis.moeys.gov.kh` · **authoritative**

The ministry's student information system. Its shipped enum and all 159 Khmer translation files were
read:

```js
p[p.Attend=1]="Attend", p[p.Excused=2]="Excused", p[p.Unexcused=3]="Unexcused"
"ATTENDANCE_STATUS": { "ATTEND":"ចូលរៀន", "EXCUSED":"មានច្បាប់", "UNEXCUSED":"ឥតច្បាប់" }
```

**Three states, no lateness** — `យឺត` occurs **zero times** across all 159 namespaces. SIS also ships
a per-school data dictionary called `អក្សរកាត់ប្រភេទវត្តមាន` ("attendance abbreviation"), i.e. **each
school defines its own day-cell letters** in the ministry's system.

#### Source C — ស្តង់ដាសាលាបឋមសិក្សាគំរូ (Prakas №១២៦៩) · **authoritative**

Model Primary School Standards, 126 pp, MoEYS letterhead.
`sala.moeys.gov.kh/kh/library/00002815`

* Names the register: `បញ្ជីវត្តមានប្រចាំថ្ងៃ`, kept in the `សៀវភៅបញ្ជីហៅឈ្មោះសិស្ស`.
* Standard 2.7 is `ភាគរយសិស្សអវត្តមានលើស ៤ ដងក្នុងមួយឆ្នាំសិក្សា`, with a school-level annual
  `របាយការណ៍បូកសរុបស្តីពីសិស្សអវត្តមានប្រចាំឆ្នាំ`.
* Policy: «សាលារៀនមិនអនុញ្ញាតឱ្យសិស្សណាម្នាក់អវត្តមាន ក្រៅពីមានមូលហេតុឈឺពិតប្រាកដ និងមានសំបុត្រពេទ្យ
  បញ្ជាក់ត្រឹមត្រូវនោះទេ» — only genuine illness with a medical certificate is tolerated.
* **Only `វត្តមាន` / `អវត្តមាន`.** No ច្បាប់/ឥតច្បាប់ split for pupils, and **no lateness**: every one
  of its 30+ occurrences of `យឺត` is `សិស្សរៀនយឺត` — a **slow learner**, not a late arrival.

#### What could NOT be verified

| Question | Status |
| --- | --- |
| The single-character day-cell marks (`ច` / `អ` / `ច្ប`) | **Unverified.** No official source documents them. SIS positively suggests there is no national set — schools define their own abbreviations. KruSmart's marks remain product-owner transcription: plausible, unrefuted, unconfirmed. |
| The printed `សម្រង់អវត្តមានប្រចាំខែ` column layout | **Unverified.** The term appears in no ministry source found; `សម្រង់` is used officially only for **marks** (`បញ្ជីស្រង់ពិន្ទុ`). The annual school-level summary *is* mandated, but only its metric is specified, not its columns. |
| **សេចក្តីណែនាំលេខ ១១ អយក.សណន (19 Feb 2021)** | **Not obtainable.** This is the instruction that actually specifies how the roll-call register is filled — cited by name in instruction №41 — and it is published on no reachable ministry surface. It is the one document that would settle the two rows above. |

`moeys.gov.kh` itself rejects automated fetching (F5 WAF); the findings above come from reachable
ministry sub-domains and from a byte-identical UNESCO GEM mirror of the Prakas.

#### What this establishes, and what it overturns

**Established beyond doubt:** `L` = ច្បាប់ is named and modelled correctly. PLP uses the **same
word** for the **same concept** — a status distinct from `ABSENT`, where permission does *not* make
the pupil present. KruSmart's `A` = អវត្តមាន matches PLP's `ABSENT` likewise. Three of KruSmart's
marks correspond 1:1 to three of PLP's four.

**Overturned:** `docs/phase16-implementation.md` deferred a late mark citing "the ministry registers
(which have no late column)". **That premise is false.** MoEYS's own primary-school platform has a
first-class `យឺត` status, and current ministry instructions require primary teachers to use it. The
deferral was right; the stated reason was not.

**Also worth recording:** KruSmart's `excused` / `unexcused` split of absences is **its own derived
rule**, not a ministry category. PLP does not subdivide `អវត្តមាន` — it puts permitted absence in a
*separate status* and attaches a reason. SIS does subdivide it (`មានច្បាប់` / `ឥតច្បាប់`). The two
ministry systems disagree with each other on this too.

---

## 3. Product decision

### Model A — three statuses, no stored lateness. **Unchanged this phase.**

```
P  មក        in class
L  ច្បាប់     absent WITH the school's permission
A  អវត្តមាន   absent without
AP            a legacy spelling of L; read, never written
```

No new stored concept. No new code. `ENTRY_MARKS` still offers three.

### Why not Model B, given PLP has យឺត

The evidence now *justifies* the concept — this is no longer a speculative feature. It is still the
wrong change to make in this phase, for three reasons, in order of weight:

**1. No source anywhere defines how a late mark COUNTS.** §7 of this phase requires every status to
declare its contribution to the attendance percentage before it exists. PLP lists `LATE` beside
`PRESENT` rather than under it, which implies a late pupil is *not* counted present — meaning a child
who arrived five minutes late would score 0% attendance for the day. No ministry document found
states that, and it is a consequential policy. Adding a status whose arithmetic must be guessed is
precisely the invention §5 and §30 forbid.

**2. All three ministry forms in this product are structurally unable to print it.** The monthly
sheet gives each day exactly two sub-columns, `អ` and `ច្ប`; the yearly sheet totals `ច្ប` and
`អច្ប`; the record book prints `ចំនួនពេលអវត្តមាន` split `មានច្បាប់` / `គ្មានច្បាប់`. A `យឺត` mark
would print as **nothing** on all three — a stored fact invisible on every sheet the teacher hands
in. §18 forbids exactly that: *database meaning ≠ UI meaning ≠ paper meaning*. Adding the status
without first redesigning three ministry documents would make the product less truthful, not more.
And the document that would tell us how to redesign them — Instruction №11 — could not be obtained.

**3. Two official ministry systems disagree.** SIS models three states and no lateness; PLP models
four. Which one KruSmart should mirror depends on what its schools actually file into — a
product-owner fact, not an engineering one.

### What this phase does instead

It makes the existing three unambiguous everywhere, and makes a future fourth a **bounded** change:
every surface now derives its labels, colours and counts from `ATTENDANCE_MARKS`, so adding a mark is
an edit to that array plus the CHECK constraint in migration `00034`, rather than an edit to eleven
screens. The defects in §5 are all closed. See `docs/phase17-implementation.md`.

### The explicit answer §35 asks for

> **មកយឺត does not exist in KruSmart.** A pupil is in class, absent with permission, or absent
> without. Lateness is recorded by no screen, stored by no column, and counted by no total.
>
> This is a decision, not an oversight, and it is now a decision taken **against** verified evidence
> that the ministry's own primary platform does model it. Reopening it is a product-owner call and
> needs three things first: the counting rule, a form that can print the mark, and confirmation of
> which ministry system the target schools file into.

---

## 4. Counting rules

These are the rules in force today, produced by `tallyAttendance` in `lib/attendance/status.ts`,
and they are **unchanged by this phase**.

| Status | Present count | Absent count | Excused count | Unexcused count | In attendance % |
| --- | --- | --- | --- | --- | --- |
| `P` | 1 | 0 | 0 | 0 | numerator **and** denominator |
| `L` | 0 | 1 | 1 | 0 | denominator only |
| `A` | 0 | 1 | 0 | 1 | denominator only |
| `AP` | 0 | 1 | 1 | 0 | denominator only |
| anything else | 0 | 0 | 0 | 0 | **neither** — counted as `unknown` |

Two properties are load-bearing and already asserted by `verify-attendance.mts`:

* **`inClass` is the only question a rate may ask, and only `P` answers yes.** Permission excuses an
  absence; it does not undo it.
* **The denominator is days recorded, not days in the month.** A register kept for nine days of
  twenty describes nine days. An empty register has `rate === null`, never `0`.

---

## 5. Defects found

### D1 · `lib/types.ts` documents `L` as "late"

```ts
/** Attendance mark: present / late / absent-with-leave / absent. */
export type AttendanceStatus = 'P' | 'L' | 'A' | 'AP'
```

A **second declaration** of the union, with a doc comment that states the discredited meaning. A
developer who reads `lib/types.ts` — the file every row type lives in — is told `L` is late. This is
precisely the ambiguity §35 requires be eliminated.

### D2 · The 3D room counts by hand, and calls unmarked pupils present

`app/(main)/attendance/layout/ThreeClassroom.tsx`:

```ts
const getStatus3 = (ts, uid) => (…[uid].status) || 'P';          // line 381
if (st === 'P') p++; else if (st === 'L') l++; else a++;          // line 390
```

Three separate faults:

1. An **unmarked** pupil defaults to `'P'` and is counted and coloured as present. Every other
   surface distinguishes "not marked" from "marked present" — the whole point of the `មិនទាន់` count.
2. `else a++` folds `AP` **and every unrecognised value** into *absent*, contradicting the shared
   rule under which `AP` is excused and an unknown value is `unknown`.
3. It is a private copy of an arithmetic that exists once, in `tallyAttendance`.

**Why the harness missed it:** `verify-attendance.mts` A5 scans for
`/status\s*(?:===|!==)\s*['"](?:P|L|A|AP)['"]/`. The variable here is named `st`, not `status`, so
the pattern does not match. A rule enforced by a regex that only matches one variable name is not
enforced.

### D3 · Nothing validates the stored value

`saveAttendance(studentId, date, status: string, …)` puts `status` straight into the upsert. There is
no server-side check, and no `CHECK` constraint on the column. The UI buttons are the only thing
stopping `"late123"` from being persisted.

Consequence if it happened: `markFor` returns `null`, so the readers degrade safely — the row is
`unknown`, excluded from the rate, and shows as `មិនទាន់` on the register. But `/students/[id]`
renders `ATTENDANCE_BADGE[r.status] ?? { label: r.status }`, so the **raw string is printed to the
teacher**. §22 requires this be closed at the action.

### D4 · One meaning, two labels — `L` vs `AP`

`AP` is declared a synonym of `L`: same `inClass`, same `excused`, same `short`. Yet it carries a
**different label** — `សុំច្បាប់` against `L`'s `ច្បាប់`. The product therefore has two Khmer words
for one fact, and which one a teacher sees depends on which spelling happens to be stored.

### D5 · The parent and the teacher use different words for the same mark

| Code | Teacher app | Parent portal (km) | Parent portal (en) |
| --- | --- | --- | --- |
| `P` | **មក** | **មានវត្តមាន** | Present |
| `L` | **ច្បាប់** | **សុំច្បាប់** | Excused |
| `A` | អវត្តមាន | អវត្តមាន | Absent |

The *meanings* now agree — that defect is closed. The *words* do not. This is a milder form of the
same failure: the sheet a teacher hands over and the portal a parent signs into name the same fact
differently.

### D6 · Dead `late` keys

`late: 'មកយឺត'` / `late: 'Late'` remain in both parent locales with no consumer. A future developer
wiring up an unused translation key is exactly how the original defect would return.

### D7 · A stale comment asserts a disagreement that no longer exists

`components/ui/feedback/Badge.tsx` still says:

> *"The parent portal's i18n calls the same code `មកយឺត`; the two disagree, and the portal is the one
> that should change, since attendance is entered on this side."*

The portal changed. Documentation that describes a live contradiction which has been fixed is worse
than no documentation: it invites someone to "resolve" it in the wrong direction.

### D8 · `ATTENDANCE_BADGE` is a second label mapping

`components/ui/feedback/Badge.tsx` re-declares all four Khmer labels as string literals, duplicating
`ATTENDANCE_MARKS[].label`. §13 asks for **one** canonical mapping consumed by every surface. That
the duplicate's own doc comment has already drifted (D7) is the evidence that two copies drift.

---

## 6. Affected surfaces

`lib/attendance/status.ts` · `lib/types.ts` · `components/ui/feedback/Badge.tsx` ·
`app/(main)/attendance/layout/{ThreeClassroom,actions}.tsx|ts` · `app/parent/i18n.ts` ·
`app/parent/(portal)/attendance/AttendanceClient.tsx` · `scripts/verify-attendance.mts`

---

## 7. UX implications

One observation, recorded for the product owner rather than acted on unilaterally.

The register offers **មក · ច្បាប់ · អវត្តមាន** as three coordinate buttons, which reads as three
parallel categories — and implies that ច្បាប់ is *not* អវត្តមាន. Every printed form says otherwise:
the record book's heading is `ចំនួនពេលអវត្តមាន` with `មានច្បាប់` / `គ្មានច្បាប់` beneath it, and the
monthly sheet's two sub-columns are both absence columns.

So on paper an absence is the category and permission is the sub-kind; on screen they look like
siblings. The counting is right either way — `tallyAttendance` treats both as absences — and this is
a wording question, not an arithmetic one.

---

## 8. Verification plan

| What | How |
| --- | --- |
| The three marks mean one thing each | `verify-attendance.mts` A1-A4, unchanged and passing |
| No surface re-derives the rule | A5, **widened** to any identifier — the old pattern matched only variables named `status`, which is how the 3D room's `st === 'P'` survived |
| One mark, one word | A9 — `AP` carries `L`'s label; the badge map is derived, not typed out; `lib/types.ts` re-exports rather than re-declares |
| Nothing may store an undefined mark | A9 (`isEnterableStatus`), both server actions, and migration `00034` at the database |
| The database rejects it behaviourally | `validate-rls.mjs`, 7 new checks: P/L/AP write, `late123` and `''` refused with `23514`, an UPDATE to `'T'` refused, a real correction still allowed |
| The parent sees what the teacher wrote | A9 pins `L` and `AP` to one tile and the absence of a `late` key; verified live in the browser |
| Daily = monthly = yearly | Verified live on one class holding one of each mark |
| Locked days stay locked | Phase 16 acceptance, re-run |
