# Phase 14 — The pupil you just created is on the screen you are returned to

Closes **Phase 12 F1**, the last open P1 in the audit, and **F19**, its mobile half.

---

## 1. The failure

`/enrollment` pushes to `/student-list` after a save. The roster sorts oldest-first
(`sortRoster`'s `default` orders by `order_index` then `created_at` **ascending**) and pages at
**twenty**. So on a class of thirty-five, the pupil a teacher had just spent forty fields creating
was the **last row of page two** — present, correct, and off the screen they were returned to.

Nothing marked a recently added pupil, so even landing on the right page there was no way to pick
them out of twenty rows.

> The teacher's own question after saving is *"did that work?"*. The toast answered it; the screen
> did not — and a toast is gone in four seconds and is announced to nobody.

**F19: it is worse on a phone.** Twenty rows plus a header is several screens and one pagination
control away, on the device where the teacher has just typed forty fields, and where the card grid
— not the table — is the default view.

---

## 2. What changed

Three links in one chain, each of which fails silently on its own.

### The action hands back the id

`createStudent` returned `{ success: true }`. It returns `{ success: true, studentId }`.

The v2 branch already read the id back because `enrolOrCompensate` needs it. **The legacy branch
did not**, so a pre-V2 account had no id to hand over and would have got none of this. It selects
now too — the row was just written by the caller, and `students_select_own` gates on
`teacher_id = auth.uid()`, so reading it costs the insert nothing.

### The redirect names the pupil

```ts
const createdId = result && 'studentId' in result ? result.studentId : null
const roster = createdId
  ? classHref(`/student-list?new=${encodeURIComponent(createdId)}`)
  : classHref("/student-list")
```

Through `classHref`, so `withClassParam` **merges** the two parameters — a hand-built query string
here would drop `?class=` and land the teacher on another class's roster. `in` narrows the union of
`createStudent`'s and `updateStudent`'s returns: only the first mints an id, and an edit already
knows which pupil it is. A null id falls back to the plain roster link rather than putting the word
`null` in the address bar.

### The roster opens on the pupil and marks them

`/student-list` reads `?new=`, and:

| | |
| --- | --- |
| **adopts it** | during **render**, not in an effect — the same adjustment `GenerateReportDialog` makes when it re-seeds. It is a derivation from a prop-like input, not a synchronisation with an external system, so an effect would paint the roster once without the mark and again with it. Only when the pupil is actually in the roster: a stale parameter marks nothing rather than pointing at a row that is not there. |
| **pages to them** | `setCurrentPage(Math.floor(index / pageSize) + 1)`, once per pupil. |
| **scrolls to the row** | after the jump has rendered, honouring `prefers-reduced-motion`. |
| **states it** | a `role="status"` naming the pupil, the page they are on, and a link to their record. |
| **marks the row** | a `ទើបបញ្ចូល` badge **and** a tint, on both the table and the card. |
| **consumes the parameter** | so a refresh does not re-announce a pupil added ten minutes ago, and a shared link does not mark somebody else's screen. |

---

## 3. The three things that were easy to get wrong

**The page must be computed against the list that is RENDERED.** `visible` is the sorted, filtered
roster; `students` is the raw one. They differ by sort, by search and by every filter in the
sidebar, so a page number derived from the raw array is the right index of the *wrong list* — and
lands a teacher one page away from the pupil while looking like it worked. Pinned:
`verify-students.mts` asserts `visible.findIndex(`, not `students.findIndex(`.

**Exactly one effect may write the query string.** The first attempt deleted `new` in an effect of
its own, beside the existing search-sync effect. It did not work, and the browser said so: both
effects read `searchParams` from the same render, so the search sync rebuilt the query from a value
that still contained `new` and **put it straight back**. Two effects writing one string is a race
the last one declared wins. The deletion moved into that one effect, and the harness now asserts
there is exactly one `router.replace(` in the file.

**The mark must not be colour alone, and it is not `សិស្សថ្មី`.** `is_new_student` is a fact about
the *pupil* — new to the school this year — stored on the row. This is a fact about the last few
seconds. Two different claims, so two different words: the new mark is `ទើបបញ្ចូល`, pushed to the
front of the card's badge list so `slice(0, 3)` can never drop it.

---

## 4. One regression found and fixed in the browser

Tinting the card's foreground exposed something that had been true all along: the swipe-action
layer (`កែ` / `លុប`) was hidden only because the foreground happened to be an **opaque** `bg-paper`.
The moment that layer took a translucent tint, the two icons showed through the right-hand third of
the card as though it were half-swiped.

The layer is now `opacity-0` until swiped, and `aria-hidden` while it is. Opacity states what is
meant; *"something opaque happens to be on top of it"* did not.

Caught by looking at the built page at 360px, not by any harness.

---

## 5. Files changed

| File | Change |
| --- | --- |
| `app/(main)/enrollment/actions.ts` | `createStudent` returns `studentId`; the legacy branch reads the id back too |
| `app/(main)/enrollment/page.tsx` | the redirect carries `?new=` through `classHref` |
| `app/(main)/student-list/StudentTableClient.tsx` | adopts `?new=`, pages to the pupil, scrolls, announces, and owns the query string in one effect |
| `components/ui/views/StudentCompactTable.tsx` | `highlightId` prop: `data-student-row`, tint, `ទើបបញ្ចូល` badge |
| `components/ui/views/StudentCard.tsx` | `highlighted` prop: same three, plus the swipe-layer fix |
| `scripts/verify-students.mts` | 14 checks pinning the whole chain |

---

## 6. Tests

| Gate | Result |
| --- | --- |
| `npm run lint` / `typecheck` | clean |
| `npm run verify` | **32/32** |
| `npm run build` | compiled |
| `npm run verify:live` | **35/35** |
| `scripts/validate-rls.mjs` | **64/64** |

**Browser walkthrough**, production build against the live stack, class ៤ក at thirty-one pupils —
the real failure case, since twenty per page puts the new pupil on page two:

- table view at 1400px: opens on **page 2/2**, scrolled to the row, tinted, badged, `role="status"`
  reading *"បានបញ្ចូល សុភ័ក្ត្រ តេស្ត ក្នុងបញ្ជីរួចរាល់ · ទំព័រ ២"*;
- card view at 360px (the phone default): same, and the swipe-layer bleed-through fixed;
- the URL settles to `?class=…` with `new=` consumed.

The pupil created for the walkthrough was **removed afterwards** — ៤ក is back to its thirty. Not
leaving test data in a class somebody browses is the rule the previous commit's fixture repair was
about.

**One half is checked structurally rather than clicked**: the enrolment form's four required
address dropdowns are portal listboxes, so the save was not driven through the UI. `createStudent`
returning an id and `/enrollment` passing it are covered by `verify-students.mts` and by
`typecheck` (the `'studentId' in result` narrowing does not compile if the action stops returning
it); the roster half — everything the change actually redesigns — was exercised end to end against
real data at real scale.

---

## 7. Deferred

Bulk `importStudents` is untouched: it adds many pupils at once and the count is the answer there,
not a mark on one row. `sortRoster`'s `default` comparator is not a total order when some pupils
have `order_index` and others do not — pre-existing, harmless here (the page is computed from the
same array that is rendered), and not this change's business.

Still open from Phase 12: F2, F3, F4, F8, F10, F12, F15–F18, F20–F25.

---

*Phase 14 complete. Stopping here.*
