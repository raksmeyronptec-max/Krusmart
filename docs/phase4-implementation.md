# Phase 4 — Score workspace finish

**Follows** [phase3-implementation.md](phase3-implementation.md). Covers the brief's Phase 5
(§13), which the [Phase 0 audit](phase0-ux-audit.md) §1.1 demoted from first to fourth on the
evidence that this workspace was the app's strongest area rather than its weakest.

**Gates:** lint clean · `tsc --noEmit` clean · **28/28 harnesses** · `next build` clean ·
**57/57 live RLS** · 42 routes still in one frame.

Six files changed, plus CLAUDE.md. No route moved, no migration, no domain formula altered.

---

## 0. Two-thirds of this phase was already done

The audit's plan for Phase 4 was *"the fifth tab, the subject-picker link, entry as module front
door"*. Two of those three landed in Phase 3 — they were entangled with the tab strip and the
លទ្ធផល module and could not sensibly be split from them — and the subject-picker link has been
in place since before this program started (`/score/enter`'s picker links to `/score/subjects`;
`verify-score-workspace.mts` §4 has asserted it throughout).

So this phase went back to the brief's §13 and audited what it asks for against what the screen
actually does. Two gaps, and neither was on the Phase 0 list.

| §13 requirement | State |
| --- | --- |
| fast entry, keyboard-friendly, pinned pupil column | ✅ already |
| search pupils, autosave feedback, explicit save | ✅ already |
| locked-period state, validation, empty state | ✅ already |
| **clear progress / "how many are finished"** | ⚠️ **present but wrong** — §1 |
| **server validation authoritative, incl. assignment permissions** | ⚠️ **four of five** — §2 |

---

## 1. Marking progress was counted three times, not once

### The defect

`lib/scores/completion.ts` opens by saying progress is *"counted once for two screens"*.
There were **three**. `/score/enter` — the screen the teacher is actually typing into — carried
its own copy, and the copy used a different rule:

```ts
const numeric = cols.filter(c => c.type !== 'select')      // drops rated columns
if (entries.some(e => e.score !== null)) entered += 1      // numbers only
```

`isMarked` counts `score_text` as a mark, because the `sem_eval_*` columns are Khmer words —
that is the whole point of migration 00012. So **a pupil carrying only a Khmer rating read as
done on `/score/collect` and the dashboard, and as not started on the entry grid**. One
question, three screens, two answers.

This is the same defect class Phases 1 and 3 closed for the subject set and the denominator. It
was not in the Phase 0 audit: §1.1 read `/score/enter`'s progress pill as evidence the screen
was well built, and never checked what it counted.

### The fix

[`rosterProgress(subjects, rows, rosterSize)`](../lib/scores/completion.ts), in the module that
already owns `isMarked` and `subjectProgress`.

It is deliberately **not** `subjectProgress`. That answers "for each subject, how many pupils" —
right for `/score/collect`, which lists subjects. The entry grid asks "how many of my pupils
have I got through", which is a **union** across the displayed subjects, not a sum: a pupil
marked in two of them is one pupil.

The grid feeds it `MarkRow`s built from `scoresData`, its **live** cell state, rather than from
a fetch — a figure that ignored unsaved work would tick *backwards* as the teacher typed.
`splitScoreCell` is the same number-or-text rule `saveScores` applies, so a cell counts here
exactly when it would count once written.

### Proven, not asserted

`verify-score-workspace.mts` §8 **runs** the two functions against the same rows — the module is
pure and node-loadable, so this exercises the real rule rather than checking that a call appears
in a file:

```
✓ a pupil marked only with a Khmer rating counts as entered
✓ for one subject, rosterProgress equals that subject's subjectProgress
✓ across subjects it unions rather than sums
✓ and never reports more pupils than the roster holds
✓ an empty roster is 0%, never NaN
✓ the entry grid counts no pupils of its own
```

**CLAUDE.md was corrected.** Its dashboard section stated the "two screens" claim my change
makes wrong; it now says three and describes which function each screen calls and why.

---

## 2. The fifth validation rule was UI-only

§13 is explicit: *"Never accept a score that violates the subject template, the maximum score,
the grading scheme, a locked period, class scope or teacher assignment permissions. UI
validation is not enough. Server/action validation must remain authoritative."*

Audited against `saveScores`, **four of five were already server-side** and well done:

| Rule | Where |
| --- | --- |
| class scope | `resolveServerScope(user.id, classId)` — a forged `?class=` resolves to the caller's own default |
| locked period | matched by **membership**, so a direct write to a month absorbed inside a locked merged period is refused too |
| maximum score | `clampScoreCell` against the same `maxByColumn` the grid reads |
| number vs Khmer word | `splitScoreCell`, so a rating is not written as `NULL` behind a success toast |
| student relationship | migration **00011** at RLS — `can_access_student` |

**Assignment permissions were not.** "A subject teacher may only enter their own subjects" is a
stated product rule (CLAUDE.md, and `/score/enter`'s picker offers `mySubjects`), enforced
nowhere but the picker. RLS cannot close it: 00011 makes a writer prove a relationship to the
**student**, which a subject teacher of the class genuinely has, and the database has no way to
know `math_num` is not their column.

The consequence was not a silent overwrite — `scores_owner_period_uniq` carries `teacher_id`, so
a foreign write lands as a **second row** beside the real teacher's. Two rows for one pupil, one
subject, one period, and nothing in the product to say which is the mark.

### The three bounds that make enforcing it safe

A check that can block a teacher from saving marks is the highest-consequence change in this
product, so each bound is a property of the code, not a promise in a comment:

1. **`coversWholeClass`** — homeroom teachers, primary teachers and *every legacy account* come
   back true and are not touched at all. The rule bites only the secondary subject teacher it
   was written for.
2. **Columns the class template defines** — anything else passes through. Homework saves through
   this same action and `hw_5` is in no template. It is the same boundary the clamp already
   draws, for the same reason.
3. **Fails open** — `resolveClassTeachingRole` returns whole-class on a failed read, so a
   database hiccup can never lock a teacher out of entering marks.

### And the UI had to move with it

`/score/total` **deliberately shows** the class's whole curriculum to a subject teacher — that is
the right call for reading, and narrowing it would divide their ranking by their own subject
alone. But its cells are editable with no role gate, so enforcing the rule server-side alone
would have produced refusals on cells the grid offered: the boundary and the UI disagreeing,
which is worse than the gap.

The grid now marks a foreign column read-only for a subject teacher (`writableColumns`, `null`
for everyone who covers the whole class) while still displaying every subject. §9 asserts both
halves — that the grid draws the line **and** that it did not narrow the read.

---

## 3. Verification

### Added

`verify-score-workspace.mts` grew two sections, 10 and 10 checks:

- **§8** — progress is counted once for three screens: all three read
  `lib/scores/completion`; the entry grid's private loop is gone; and six runtime properties of
  `rosterProgress` against `subjectProgress` on shared fixtures.
- **§9** — a mark is validated where it is written: all five rules present in `saveScores`, each
  of the three bounds on the new one, and the grid/boundary agreement on both sides.

### Checked in a browser

Signed in as the `legacy_single_teacher` fixture. `/score/enter` renders the five workspace tabs
with បញ្ចូលពិន្ទុ active, ពិន្ទុ and លទ្ធផល both in the rail, and the progress figure
`បានបញ្ចូល ០/៣០` in **both** the header pill and the footer bar — the two places the module
comment promises the same number.

**Stated honestly:** I did not type a mark into the grid to watch the counter move. That fixture
class has not configured its subjects, so `/score/enter` correctly renders its first-visit setup
state ("ថ្នាក់នេះមិនទាន់បានកំណត់មុខវិជ្ជាទេ") instead of the grid, and configuring it would have
written to the developer's own database. The rule is covered instead by §8's runtime checks,
which exercise the real function with the exact inputs the defect turned on — a stronger check
than one keystroke, but not the same as an end-to-end one.

---

## 4. Known remaining work

1. **Test A end-to-end** — unchanged from Phase 3 §7.1, and still the only open item in the
   P0-1 family: generate a report and diff it against the screen for a seeded class.
2. **Two rows for one mark.** §2 stops a subject teacher *creating* the duplicate from now on,
   but says nothing about rows already written that way, and nothing about which of two existing
   rows a read should prefer. The conflict key including `teacher_id` is deliberate and correct
   (two teachers on one class must not overwrite each other); what is missing is a rule for
   *reading* when both exist. Worth deciding before secondary schools are onboarded.
3. **Token drift** (Phase 2 §7.1) — unchanged, still the largest item from Phase 0's P2 list.
4. **Print output verified structurally, not on paper** (Phase 2 §7.3) — unchanged.
5. **`/administration`** — still mock, still unreachable from the rail. Phase 11.
6. **CLAUDE.md's Reporting section** still contradicts its Results section on the honour
   criterion (Phase 3 §5). The completion claim in the dashboard section was corrected here
   because this phase made it wrong; that one predates the program and is still open.
