# Phase 15 — Adding a pupil asks for what the pupil needs

Implements the four-finding scope from [phase15-ux-audit.md](phase15-ux-audit.md) §5.
Attendance remains excluded (in-flight register work).

---

## 1. Selected scope

| ID | Sev | What was wrong |
| --- | --- | --- |
| **F15-1** | P1 | The form required four fields the database does not — saving was gated on the child's birth village |
| **F15-2** | P1 | The teacher typed the class they were already in, and which the page named twice |
| **F15-5** | P2 | Edit mode said it does not move a pupil, then named "the transfer" without saying where it is |
| **F15-6** | P3 | The save fallback printed the database's own error message to the teacher |

**Not implemented, per the audit's own gate:** F15-3 (existing-pupil search — needs an authorization
decision first), F15-4 (live duplicate hint), F15-7 (search/sort whitespace).

**Not re-opened:** new-pupil findability. Phase 14 (`916a69f`) already pages to the pupil, marks the
row `ទើបបញ្ចូល`, announces it in a `role="status"` and consumes the parameter. Verified intact and
exercised again in Case B below. §28's first priority needed no work.

---

## 2. F15-1 · The birthplace no longer gates a pupil's record

**The defect, measured.** With every `NOT NULL` column on `students` filled — `student_id`, `grade`,
`name_kh`, `gender`, `dob` — the form read **៥/៩** and the save was refused with **four** errors, all
on the birthplace cascade province → district → commune → **village**.

Those four columns are `is_nullable = YES`. The requirement was the form's own invention, and the
repository's own fixture (`primary_ranking_teacher.sql`) inserts pupils with no address at all.

**The change.** In `formState.ts`, `SECTIONS[1].required` becomes `[]` and the four fields move to
`optional`; the four `LocationField`s drop their `required` marker so the asterisk and the rule
agree. **Nothing is removed** — the section, the fields and the cascade stay exactly where they were,
and a teacher who has the information still enters it.

`REQUIRED_FIELDS` is derived from `SECTIONS`, so the counter became `០/៥` by itself.

---

## 3. F15-2 · The class is prefilled, not typed

`ថ្នាក់ទី` is required (`students.grade` is `NOT NULL`) but the page was reached from a link carrying
`?class=` and states the class **twice** on screen. Re-keying it risks a pupil whose
`students.grade` disagrees with their own enrolment — and that column is the stale one every roster
read bypasses in favour of `student_enrollments`.

It is prefilled from the active class for a **new** pupil, editable, and applied only while the field
is empty — so it cannot overwrite typed input or a restored `enrollmentDraft`. Edit mode is never
prefilled: the stored value is the record.

### The bug this walked into first, and the fix

The first implementation prefilled on the first render where a class name existed. **It wrote the
wrong class.** Arriving at `/enrollment?class=<៤ខ តេស្ត>` filled the box with **៤ក** — the teacher's
default — because `className` comes from `TeacherContext`, and `?class=` reaches that context through
`ClassParamSync` **one render later**.

The pupil would still have been enrolled into the right class (that comes from `activeClassId`,
which prefers the URL), so the only wrong thing would have been the printed grade label: the silent
half, and exactly the failure mode this codebase keeps warning about.

It now fills only once the context's own class **is** the class the form will write into
(`contextClassId === activeClassId`). With no `?class=` the two are equal immediately and nothing
waits. Caught in the browser, not by a harness — and now pinned by one.

---

## 4. F15-5 · The sentence about transfer now has a door

The audit initially overstated this, and the audit document was corrected before publication: the
form **already** said

> ការកែនេះមិនប្តូរថ្នាក់របស់សិស្សទេ — ការប្តូរថ្នាក់ធ្វើឡើងដោយការផ្ទេរ។

What was missing was the pointer — it named the transfer as the thing that moves a pupil and did not
say where transfer is. `ការផ្ទេរសិស្ស` is now a link to the pupil's own page, where `TransferPanel`
lives. No copy rewrite, no behaviour change, and the two workflows stay separate (§11).

---

## 5. F15-6 · The teacher gets a sentence, the log gets the detail

`friendlyDbError`'s fallback interpolated `error.message` — a raw Postgres/Supabase string, in
English, naming columns and sometimes policies — into a Khmer toast. Every mapped code was already
handled properly; this was the unanticipated path, which is the one a teacher should least be asked
to read. It now logs the error and returns
`មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យ។ សូមព្យាយាមម្តងទៀត។`.

---

## 6. Student lifecycle, before and after

```
                                   BEFORE                    AFTER
open /enrollment?class=X           ថ្នាក់ទី empty             prefilled with X
required to save                   ៩  (incl. birth village)   ៥  (what the DB requires)
fill the five NOT NULL fields      REFUSED, 4 errors          saves
land on the roster                 pupil paged to + marked    unchanged (Phase 14)
open កែព័ត៌មានសិស្ស                  "…done by transfer"        …and a link to it
an unmapped save error             raw Postgres string        one Khmer sentence
```

---

## 7. Files changed

| File | Change |
| --- | --- |
| `app/(main)/enrollment/formState.ts` | birthplace `required` → `optional` |
| `app/(main)/enrollment/page.tsx` | drop four `required` markers; prefill the class once the context matches the URL; link `ការផ្ទេរសិស្ស` |
| `app/(main)/enrollment/actions.ts` | the error fallback logs instead of printing |
| `scripts/verify-students.mts` | 13 new checks |

No component was created — every change uses what was already there. Nothing in §26's list was
touched.

---

## 8. Verification

| Gate | Before | After |
| --- | --- | --- |
| `npm run lint` / `typecheck` | clean | clean |
| `npm run verify` | 33/33 | **33/33** |
| `npm run build` | compiled | compiled |
| `npm run verify:live` | 36/36 | **36/36** |
| `scripts/validate-rls.mjs` | 64/64 | **64/64** |

### Browser acceptance (§30), all at 360×780

| Case | Result |
| --- | --- |
| **B — new pupil** | prefilled `៤ខ តេស្ត`; `៥/៥` after four fields; saved; landed on `/student-list?class=…015`; banner *"បានបញ្ចូល សុវណ្ណា ចាន់ ក្នុងបញ្ជីរួចរាល់"*; row marked `ទើបបញ្ចូល` showing `ថ្នាក់ ៤ខ តេស្ត`; `?new=` consumed |
| **C — edit** | heading `កែព័ត៌មានសិស្ស`; grade shows the **stored** value, not the ambient class; the sentence carries a link to `/students/<id>` |
| **D — transfer** | confirm names both ends and promises the history is kept; database after: `៤ខ តេស្ត` closed and stamped `transferred`, one new `active` row in `២ក` — **membership moved exactly once** |
| **A — existing pupil** | **not run** — the flow does not exist (F15-3, deferred) |
| **E — mobile** | all of the above were run at 360px; no horizontal overflow |

The pupil created for the walkthrough was **removed afterwards**; rosters confirmed back to
`៤ខ តេស្ត` 5, `២ក` 0, `៤ក` 30.

### Regression (§31)

`verify:live` 36/36 covers the Phase 14 document work, ranking, honour, certificate and the annual
family; `validate-rls.mjs` 64/64 covers scope, transfer authorization and class boundaries. Nothing
in this phase touches `documentClassName()`, `ResultDocumentLink`, the class-context chain or the
Print Center.

---

## 9. Known and deferred

- **F15-3 existing-pupil search** — the audit recommends *not* building it until someone decides
  whether a teacher may search pupils outside their own classes. RLS currently scopes `students` to
  the teacher's own rows and enrolled roster, and §23 forbids relaxing that for UX. **This is an
  open product decision, not a backlog item.**
- **F15-4** live duplicate hint · **F15-7** search/sort whitespace.
- **`students.grade` goes stale on transfer** — observed during Case D: after moving to `២ក` the
  pupil's `grade` still read `៤ខ តេស្ត`. Pre-existing and by design (CLAUDE.md: the column is a
  label, `student_enrollments` is the truth), and it is the reason prefilling it is safe. Not
  changed; recorded so nobody reads it as a Phase 15 regression.
- **Attendance** — still in-flight and untouched.

---

*Phase 15 complete. Stopping here.*
