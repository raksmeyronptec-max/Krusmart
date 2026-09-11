# Phase 15 — Enrollment UX + Student Lifecycle Audit

**Read-only.** Measured against the working tree at `d8f1dfb`, not against earlier audit text.
Attendance remains excluded (in-flight register work — Phase 14 audit §0).

---

## 1. Executive summary

**The lifecycle is sound. The front door is not.**

Every join in the pupil journey works, the class context holds throughout, transfer is a deliberate
and well-built action, and — since Phase 14 — a newly created pupil is paged to, marked and
announced on the roster it returns to. §28's first priority is therefore **already met** and is not
re-opened here.

What is wrong is concentrated in one screen, and it is concrete:

> **A teacher who fills in every field the database actually requires cannot save the pupil.**

Measured live: with `អត្តលេខ`, `ថ្នាក់ទី`, `ឈ្មោះសិស្ស`, `ភេទ` and `ថ្ងៃខែឆ្នាំកំណើត` all filled —
the five `NOT NULL` columns on `students` — the form reads **៥/៩** and the save is refused with
**four errors**, all on the birthplace cascade: province → district → commune → **village**.

Those four columns are `is_nullable = YES`. The form invents the requirement. A primary teacher
adding a pupil to their own class must produce the child's birth **village** before the software
will record their name, through four dependent portal dropdowns, on a 360px phone, 7.2 screens down.

Two smaller things compound it: the form asks the teacher to type the class they are already in and
which the page names twice on screen, and duplicate pupil numbers are only discovered *after*
submitting, as a translated Postgres `23505`.

**What works and must not be rebuilt:** the transfer panel, the class-context chain, the Phase 14
findability work, the roster's search and paging, `/students/[id]` as the pupil's home, and the
server-scope/RLS boundary.

---

## 2. Student lifecycle map

Traced live as the fixture teacher (classes `៤ក` 30 pupils, `៤ខ តេស្ត` 5, `២ក` 0).

```
CLASSROOM ?class=A
     │  card tool បញ្ចូលសិស្ស  → /enrollment?class=A            ✅ class carried
     ▼
FIND or CREATE ───────────────────────────────────────────────  ❌ F15-3: no FIND
     │   /enrollment only ever CREATES. `?student=` edits one.
     │   There is no "this pupil exists — put them in my class".
     ▼
CREATE  27 fields · 5 sections · 7.2 phone screens              ❌ F15-1
     │   ៩ required, of which 4 are not required by the database
     │   ថ្នាក់ទី typed by hand though the class is known        ❌ F15-2
     │   duplicate អត្តលេខ discovered only on submit            ⚠️ F15-4
     ▼
SAVE ──▶ enrolled into A, `?new=<id>` carried                   ✅
     ▼
FIND IMMEDIATELY ─ paged to · row marked ទើបបញ្ចូល · announced  ✅ Phase 14
     ▼
VIEW /students/[id] ─ 6 outbound actions, enrolment history     ✅
     │
     ├──▶ EDIT /enrollment?student=<id> ─ identical form         ⚠️ F15-5
     │       nothing says this does NOT move the pupil
     │
     └──▶ TRANSFER TransferPanel ─ confirm, names both ends,     ✅
             keeps the old enrolment as history
     ▼
ATTENDANCE / SCORE / RESULT                                     ✅
```

---

## 3. Findings

### F15-1 · The form requires four fields the database does not · **P1**

**Route** `/enrollment` · **Component** `app/(main)/enrollment/formState.ts` → `SECTIONS[1]`

**Problem.** Saving is gated on the pupil's **birthplace to village level**. A teacher who has the
child in front of them and knows their name, sex and date of birth still cannot record them.

**Evidence.** `formState.ts`:

```ts
{ id: 'addresses', … required: ['birthProvince','birthDistrict','birthCommune','birthVillage'] }
```

against the live schema:

| column | `is_nullable` |
| --- | --- |
| `student_id`, `grade`, `name_kh`, `gender`, `dob` | **NO** |
| `birth_province`, `birth_district`, `birth_commune`, `birth_village` | **YES** |
| `curr_province` … `curr_village` | YES |

Reproduced in the browser at 360×732: all five `NOT NULL` fields filled → counter **៥/៩**, save
pressed → **4** × `វាលនេះត្រូវការបំពេញ`, banner `ត្រូវពិនិត្យ ៤ វាល`, still on `/enrollment`.

The repository's own fixtures agree the data is optional: `primary_ranking_teacher.sql` inserts
pupils with no address at all.

**Recommendation.** Move the four birthplace fields from `required` to `optional`. Nothing is
deleted and no schema changes — the section, the fields and the cascade all stay exactly where they
are, and a teacher who has the information still enters it. This is a one-line change to a data
table plus whatever the section's own progress display implies.

**Risk.** Low. `REQUIRED_FIELDS` is derived from `SECTIONS`, and `validateField` already treats
non-required fields as valid when empty. The `០/៩` counter becomes `០/៥` on its own.

---

### F15-2 · The teacher types the class they are already in · **P1**

**Route** `/enrollment`

**Problem.** `ថ្នាក់ទី` is a required free-text box (`placeholder="ឧ. ១ក"`) on a page that states the
class **twice** — in the top bar and in the class-context strip — and that was reached from a link
carrying `?class=`. The teacher re-keys a fact the software already holds, and a typo produces a
pupil whose `students.grade` disagrees with their enrolment.

**Evidence.** Live at `/enrollment?class=a0000000-…-015`: `input[name="grade"]` value `""`, while
`៤ខ តេស្ត` appears twice in the page text. `students.grade` is `NOT NULL`, so the field cannot
simply be removed.

CLAUDE.md is explicit that this column is the stale one — *"free text on the pupil row; it goes
stale the moment a pupil is promoted, while `student_enrollments` is what every roster read
actually uses"* — so it is a label, not a key, and prefilling it is safe.

**Recommendation.** Prefill from the active class name when the form opens for a **new** pupil in a
resolved class, leaving it editable. Do not prefill in edit mode (the stored value is the record).
A pre-V2 account with no class resolves nothing and types as before.

**Risk.** Low–medium. Must not touch the edit path, and must not fight the `enrollmentDraft`
restore — a prefill that overwrote a restored draft would lose typed input.

---

### F15-3 · There is no "this pupil already exists" path · **P2**

**Route** `/enrollment`

**Problem.** §7's distinction does not exist in the UI. `/enrollment` creates; `?student=` edits a
pupil you already have. A pupil who exists in the school but not in your class can only be reached
by transfer from `/students/[id]`, which requires finding them first — and the roster only shows
your own class.

**Evidence.** `SearchableSelect` appears in `/enrollment` **only** for the four location cascades.
No roster or school-wide pupil search exists on the route.

**Recommendation.** **Do not build one in this phase.** It needs a product decision first: whether a
teacher may search pupils outside their own classes at all is an authorization question (RLS
currently scopes `students` to the teacher's own rows and enrolled roster), and §23 forbids relaxing
that for UX. Recorded, deferred, and named so the next phase starts from the question rather than
the screen.

---

### F15-4 · Duplicate pupil numbers are caught late · **P2**

**Route** `/enrollment` · `actions.ts` `friendlyDbError`

**Problem.** A duplicate `អត្តលេខ` is discovered only after the teacher completes the form and
submits, as a translated `23505`. The message is good —
`អត្តលេខនេះមានក្នុងបញ្ជីរួចហើយ។ សូមប្តូរអត្តលេខសិស្ស។` — but it arrives at the end of the task.

**Recommendation.** Check the value against the roster already in memory on the roster screen and
warn beside the field as it is typed. The server check stays authoritative — this is a hint, not a
gate, and it cannot see pupils outside the caller's scope.

**Risk.** Low, if it warns rather than blocks. A client-side check that *prevented* submission would
be wrong: it cannot see the whole uniqueness domain.

---

### F15-5 · Editing a pupil looks exactly like moving one · **P2** (carried: Phase 12 F2)

**Routes** `/enrollment?student=<id>`, `/students/[id]`

**Problem — narrower than Phase 12 recorded it.** The form *does* already say it, and this audit
initially overstated the gap. `PageHeader`'s description in edit mode reads:

> ការកែនេះមិនប្តូរថ្នាក់របស់សិស្សទេ — ការប្តូរថ្នាក់ធ្វើឡើងដោយការផ្ទេរ។

So the distinction is stated. What is missing is the **pointer**: it names the transfer as the thing
that moves a pupil and does not say where transfer is. The control lives on `/students/[id]`, a
route the teacher has to already know about — which is exactly the half Phase 12 F2 described
("with no pointer to where that is done").

**Evidence.** `page.tsx:443-462` carries the sentence; no link accompanies it. `page.tsx:286` —
`editingId ? updateStudent(...) : createStudent(...)` — confirms the two paths are genuinely
separate, so the sentence is true.

**Recommendation.** Add the link the sentence implies, to the pupil's own page where `TransferPanel`
lives. No copy rewrite, no behaviour change, and no merging of the two workflows (§11 forbids that,
correctly).

**Risk.** Very low.

---

### F15-6 · The error fallback prints the database's own message · **P3**

`actions.ts:33` — `return \`មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ៖ ${error.message}\``. Every mapped code
is handled well; the fallback shows a raw Postgres/Supabase string to a teacher, which §20 forbids.
**Recommendation.** A generic Khmer sentence to the teacher; the detail to `logger` where it already
goes for other paths.

---

### F15-7 · Search and sort disagree about spaces · **P3**

`StudentTableClient` sorts on `name_kh` with `.replace(/\s/g,'')` but searches with a plain
`includes` on the untrimmed value. Searching `សុវណ្ណាចាន់` for a pupil stored as `សុវណ្ណា ចាន់`
finds nothing, while the sort treats them as the same string. Low frequency; noted for whoever
touches search next.

---

## 4. Top UX problems, ranked

| # | ID | Problem | Sev | Safety |
| --- | --- | --- | --- | --- |
| 1 | F15-1 | Cannot save a pupil without their birth village | P1 | High |
| 2 | F15-2 | Must type the class they are already in | P1 | Medium |
| 3 | F15-5 | Edit looks like move | P2 | Very high |
| 4 | F15-4 | Duplicate number caught only on submit | P2 | High |
| 5 | F15-3 | No existing-pupil path | P2 | — needs a product decision |
| 6 | F15-6 | Raw DB message in the fallback | P3 | Very high |
| 7 | F15-7 | Search/sort whitespace mismatch | P3 | High |

---

## 5. Recommended scope

Four findings, one theme:

> ### **Adding a pupil should ask for what the pupil needs — and editing one should not look like moving them.**

| Step | Finding | Why here |
| --- | --- | --- |
| 1 | **F15-1** birthplace becomes optional | The blocker. One data-table change, immediately testable. |
| 2 | **F15-2** prefill the class | Same form, same save, removes the last piece of re-keying. |
| 3 | **F15-5** edit says what it is not | Same form again, and it is the safety half of the same screen. |
| 4 | **F15-6** stop printing the DB message | Same file as the save path; one sentence. |

`F15-4` and `F15-7` are small but sit in other files, and `F15-3` needs a decision before code.
Deferring them keeps this phase to one screen and one action file.

**Acceptance criteria**

- A pupil can be saved with the five fields the database requires and nothing else.
- Opening `/enrollment?class=X` for a new pupil prefills the class; edit mode does not.
- Edit mode states that it does not move the pupil, and points at what does.
- No teacher-facing message contains a raw database string.
- Phase 14's findability, the class chain and the transfer flow are unchanged.

---

## 6. Explicitly deferred

- **F15-3** existing-pupil search — needs an authorization decision first (§23).
- **F15-4** live duplicate hint · **F15-7** search whitespace.
- **Attendance** — still in-flight.
- Everything §26 names: score engine, reporting engine, Print Center, attendance semantics, class
  context, RLS, navigation, `documentClassName()`, `ResultDocumentLink`.
- **New-pupil findability** — delivered in Phase 14 (`916a69f`) and verified intact here: the roster
  pages to the pupil, marks the row `ទើបបញ្ចូល`, announces it in a `role="status"` and consumes the
  parameter. §28's first priority needs no work.

---

*Phase 15 audit complete and read-only.*
