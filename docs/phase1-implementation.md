# Phase 1 — P0 correctness, global class context, page-frame foundation

**Companion to** [docs/phase0-ux-audit.md](phase0-ux-audit.md), which stays the historical audit
and is not rewritten here. This is the implementation record.

**Baseline before any change:** lint clean · `tsc --noEmit` clean · 27/27 offline harnesses.
**After:** lint clean · `tsc --noEmit` clean · **27/27 offline harnesses** · `next build` clean ·
**57/57 live RLS behavioural checks** (was 46/46 — eleven added here).

Two files were added, twenty modified. No route was renamed, no formula changed, no existing
policy widened, and no state moved into `localStorage`.

---

## 1. P0-1 — the ranking screen and the ranking report now rank the same subjects

**File:** [app/(main)/ranking/RankingClient.tsx](../app/(main)/ranking/RankingClient.tsx)

### What was wrong

`/ranking` resolved the class's raw template rows and stopped:

```ts
resolveTemplate(templateRows.length > 0 ? templateRows : SYSTEM_PRIMARY_TEMPLATE, mode, ctx)
```

`/score/total` reads the hook's `classSubjects`, which is `applySelection(subjects, selection)`.
The report engine's `resolveMonthlyClass` — which backs `ranking_monthly`, `ranking_semester`
**and** `ranking_annual`, all three of which funnel through it — composes
`applySelection(resolveTemplate(…), selection)` at [report-data.ts:197](../lib/reporting/report-data.ts).

Same class, same period, same builder (`buildPeriodResults`), **different subject set**. A class
holding a mark under a subject it has since de-selected ranked on that mark on screen and not on
the sheet printed beside it — so both the averages and the order could differ. That is the
screen-vs-report disagreement the brief calls P0.

### What changed

One resolution point, narrowed, feeding both the denominator and the full marks:

```ts
const narrowedTemplateFor = useCallback(
  (m: MarkedScoreType) =>
    applySelection(
      resolveTemplate(templateRows.length > 0 ? templateRows : SYSTEM_PRIMARY_TEMPLATE, m, templateContext),
      selection,
    ),
  [templateRows, templateContext, selection],
)
```

`keysForMode` and both `maxScoreByColumn` call sites now read it. The screen previously called
`resolveTemplate` twice — once for keys, once for maxima — which is how a denominator and its
weights drift apart; there is one call now, and a harness check pins that.

No formula, no tie behaviour, no ranking semantics were touched. `applySelection` is imported, not
reproduced. `buildPeriodResults` and `assignRanks` are untouched.

### What was deliberately NOT changed, and why it matters

The `levelCurriculum` gate stays:

```ts
if (!levelCurriculum) return FALLBACK_NUMERIC_KEYS[mode]
```

Measured, not assumed. `FALLBACK_NUMERIC_KEYS` carries **29** monthly and **13** semester primary
columns; the compiled-in `SYSTEM_PRIMARY_TEMPLATE` resolves **16** and **2**:

```
monthly   FALLBACK 29  ·  template 16  ·  in fallback only:
          sci_phy sci_chem sci_bio sci_earth sci_applied
          soc_ethic soc_geo soc_hist soc_home
          pe_sport health_hygiene life_skill foreign
semester  FALLBACK 13  ·  template  2
```

Removing the gate to "make screen and report identical everywhere" would have silently stopped
counting those thirteen columns for exactly the pre-V2 accounts the fallback protects. On a
migrated database a primary class resolves `level_key='primary'` rows from 00028, so
`levelCurriculum` is **true** and the narrowed template is what both surfaces use — which is the
path that matters. `verify-score-workspace.mts` §7 asserts the size relationship *and* that the
gate is still present, so a future "cleanup" fails loudly.

**Residual divergence, stated plainly:** on the compiled-in fallback path (an un-migrated database
or a failed template fetch) the screen still uses the 29-key legacy denominator while the report
uses whatever `resolveTemplate` returns. Closing that means changing what a legacy account's
average counts, which is a business-rule change and out of Phase 1 scope. Recorded for Phase 3.

---

## 2. P0-2 — `/homework/send` is class-scoped

This was the only workflow in the product with no class dimension at all, and the only P0 that
could not be fixed without touching the schema.

### Why a migration was unavoidable

`homework_assignments` (00001) has `teacher_id` and no class column. The feature has no
recipients, no per-child rows and no receipts — `HomeworkSendClient` is explicit that it never
claims otherwise — so there is nothing to join through and nothing to derive the class from.
The audit's own rule was "no migrations for UX work"; this is not UX work, it is the one place
where the data model provably could not answer the question.

The teacher-facing symptom was a merged list. The real one was on the parent side:
`homework_assignments_select_own_or_parent` (00010) matched `is_teacher_of_my_child(teacher_id)`,
so an assignment written for ៥ក was readable by **every** parent of every pupil that teacher
taught — ៦ក's parents included.

### [supabase/migrations/00032_homework_assignments_class_scope.sql](../supabase/migrations/00032_homework_assignments_class_scope.sql)

| | |
| --- | --- |
| **Column** | `class_id UUID REFERENCES classes(id) ON DELETE SET NULL`, nullable, **no backfill** |
| **Index** | `(teacher_id, class_id, created_at DESC)` — the composite the list predicate wants |
| **Function** | `is_class_of_my_child(cls)` — SECURITY DEFINER with pinned `search_path`, matching `is_parent_of` / `is_teacher_of_my_child` |
| **SELECT** | teacher branch untouched; parent branch splits — `class_id IS NULL` keeps 00010's clause **character-for-character**, `class_id IS NOT NULL` narrows to that class |
| **INSERT/UPDATE** | 00001's policies **replaced**, not supplemented |
| **DELETE** | untouched |

Three decisions worth restating:

**Nullable with no backfill.** A NULL means "written before assignments had a class" and is given
exactly the reach it has today. There is no safe backfill: an existing row was genuinely addressed
to the teacher's whole audience, and stamping it with one class would retroactively withdraw it
from the others' parents. So every row that exists on the day this runs keeps its exact reach, and
only rows written afterwards are narrowed — which is what makes the SELECT change a strict
addition rather than a change.

**`ON DELETE SET NULL`, never CASCADE.** Removing a class must not destroy the homework written
for it; the row degrades to its pre-00032 meaning, which is a defined state.

**The write policies are replaced, not joined.** `class_id` is an *address* — it decides which
parents may read the row — so a teacher who could stamp any UUID could publish into a colleague's
class. Permissive policies are ORed, so leaving `auth.uid() = teacher_id` standing beside a
stricter sibling would have made the new check decorative. The predicate is written inline rather
than as a definer helper, per 00031's reasoning: a policy stays visible to `\d+`, to `pg_policies`
and to `validate-rls.mjs`. There is no recursion to avoid — it reads `teacher_assignments`, whose
own policies never read this table.

### Application layer

| File | Change |
| --- | --- |
| `homework/send/page.tsx` | `classIdFromSearchParams` → `resolveServerScope`, passes `scopeClassId` |
| `homework/send/actions.ts` | `getAssignments(classId?)` and `addAssignment(payload, classId?)` both re-resolve through `resolveServerScope`; the class is stamped from the **resolved scope**, never from the payload |
| `homework/send/HomeworkSendClient.tsx` | takes `scopeClassId`, threads it through `refresh` and `publish` (and their dependency arrays), renders `<ClassContextBar />` |
| `lib/types.ts` | `HomeworkAssignment.class_id`; `class_id` added to `HomeworkAssignmentInput`'s `Omit` so the browser cannot send it |
| `lib/utils/classHref.ts` | `/homework/send` added to `CLASS_SCOPED_ROUTES` |

The list shows `class_id = <active> OR class_id IS NULL`. Hiding the NULL rows would have made a
teacher's existing homework vanish the day this shipped, which reads as data loss.

### Proven, not asserted

`scripts/validate-rls.mjs` gained a `homework class scope (00032)` section that runs against a real
Postgres as real JWT identities — a parent linked to a pupil in ៥ក, a second class ៦ក taught by
the same teacher:

```
ok  a parent still sees pre-00032 homework (NULL class keeps its reach)      — 1 row(s)
ok  ...and homework stamped with their own child's class                     — 1 row(s)
ok  ...but NOT the same teacher's homework for another class  ← the fix      — 0 row(s)
ok  the author still sees all of their own, whatever the class               — 3 row(s)
ok  a teacher in another school sees none of A's                             — 0 row(s)
ok  anon sees none                                        — permission denied
ok  A CAN publish into a class they actually teach
ok  A CANNOT stamp another school's class  ← a forged class_id would widen the audience  — 42501
ok  ...and CAN still publish without a class (the pre-V2 path)
ok  ...nor re-address an existing row to a class they do not teach           — 42501
ok  a teacher CANNOT publish homework owned by somebody else                 — 42501
```

The migration also executes cleanly: `validate-rls.mjs` builds its database by applying every
migration in order, so 00032 running is a precondition of those results.

---

## 3. P0-3 — `/administration` is no longer offered

**Decision: removed from navigation, route preserved, mock data NOT wired.** This is the option
the brief specified, and it matches Phase 0 §10 assumption 1.

`AdministrationClient` renders `MOCK_SCHOOL_STATS`, `MOCK_TEACHERS` and `MOCK_TEACHER_DETAIL`. Its
role gate is correct — the page resolves the actor and redirects a parent to their portal and a
teacher to `/dashboard` — but a gate decides *who* may see a screen, never whether its figures are
real. A plausible invented figure is worse than a missing screen, because it is indistinguishable
from a true one.

The link in `lib/navigation.ts` is now `hidden: true`, the same pattern `/score/template` and
`/classroom/classes` use:

- **hidden, not deleted** — the route keeps working, nothing that links to it breaks, no bookmark
  404s, and `moduleForPath` still resolves it so an administrator arriving by URL gets a
  breadcrumb rather than the blank one this declaration was originally added to fix;
- **the `permission` gate stays** — `hidden` decides what is offered; the gate is what survives if
  the row is ever offered again;
- **no security change** — the page's own redirect and RLS are untouched. Navigation visibility was
  never authorization and is not being used as such here.

All four rendered surfaces filter `hidden`: `Sidebar` and `RailFlyout` filter it directly,
`CommandPalette` and the dashboard's `FeatureGrid` both go through `searchEntries`, which filters
it. `verify-navigation.mts` checks each of the four roles that could hold `school_settings:view`.

**Phase 11** wires it to real aggregates — `app/admin/queries.ts` already computes
`getSchoolStats` / `getTeachers` / `getAuditLogs` for the console, so the data exists; the screen
does not read it yet. Un-hide the row when it does, and not before.

---

## 4. Global class context

### `ClassContextBar` — [components/shell/ClassContextBar.tsx](../components/shell/ClassContextBar.tsx)

```
🎓  ថ្នាក់ទី ៥ក · ថ្នាក់ទី៥ · ឆ្នាំសិក្សា ២០២៦-២០២៧          ប្តូរថ្នាក់នៅរបារខាងលើ
```

Presentation only. It holds **no state**, reads `useActiveClass()` like every other consumer, and
is **not a selector** — `ClassContextSwitcher` in `TopNav` remains the single authoritative place
to change class. When the teacher holds more than one it points at the switcher instead of
duplicating it. `verify-class-context.mts` §5 asserts it contains no `useState`, no `localStorage`,
no `setAssignmentId`, no `useSelectActiveClass` and no `syncFromClassId`.

**Where it renders is decided by one list.** It gates on `isClassScopedPath` — the *same* predicate
that decides whether `withClassParam` appends `?class=`, already verified route-by-route against
the filesystem by `verify-class-context.mts` §1. There is deliberately no second array of route
prefixes: a page that carries the class in its URL and a page that names the class on screen must
be the same set, or one of the two is lying. The harness asserts the absence of a local list.

**Three states.**

| State | Renders | Why |
| --- | --- | --- |
| not class-scoped | nothing | a context strip on a page that does not read a class is a claim the page does not honour |
| legacy / still loading | nothing | a pre-V2 account has no class entity; a label over an absence is worse than none — and the brief's §14 is explicit |
| resolved | class · grade · year | with an honest `ថ្នាក់ទី —` for an unresolvable grade |

### Grade — resolved from the existing relationship, **no migration**

`TeacherAssignmentDetail` carried class, subject, year and school but no grade. The relationship
already existed (`classes.grade_id → grades`), and `grades.sort_order` already carries the grade
number — the invariant `resolveClassTemplateContext` relies on server-side. So the fix is one
embedded read on a query that was already running:

```diff
- classes(name), subjects(name), …
+ classes(name, grades(name, sort_order)), subjects(name), …
```

No column was added, no table created, no second query issued. A per-assignment grade lookup would
have been an N+1 in the one provider that wraps every page in the teacher app.

`grade_name` and `grade_number` are `string | null` / `number | null` on `TeacherAssignmentDetail`,
surfaced as `gradeName` / `gradeNumber` on `useActiveClass()` alongside `academicYearName`.

**`null` is a real state, not a bug.** `grades_select_member` (00003) gates the row on the caller's
`current_school_ids()`, so a teacher whose `profiles.school_id` hint is unset legitimately reads no
grade row. Every surface prints an honest dash rather than deriving a number from `class_name`,
which is free text by the time it reaches the client — a wrong grade is worse than an absent one.
Preference order everywhere: **the grade row's own name → the number formatted in Khmer → a dash.**
`grades.name` is written as `ថ្នាក់ទី៥` by `gradeName()`, so the two forms agree.

### Where it is shown

Six routes, all of which **already** conform to the page frame — one line each, no layout migration:

| Route | How |
| --- | --- |
| `/student-list` | `<ClassContextBar />` under `PageHeader` |
| `/attendance/layout` | same |
| `/attendance/monthly` | same |
| `/homework/send` | same — load-bearing here, since the assignment reaches this class's parents and no others |
| `/score/enter`, `/score/total`, `/ranking` | a `កម្រិតថ្នាក់` fact added to `ScoreWorkspaceHeader`, which already stated class and year |
| `/homework/enter` | a grade chip added to `HomeworkEntryHeader`, which already stated class and year |

The two headers were extended rather than having a bar stacked above them: they already name the
class, and a second strip saying the same thing is duplication, not context. All three surfaces
follow the identical name → number → absent rule, so they cannot disagree.

`/homework/enter` reads its grade off the assignment **it resolved** (`scopeClassId`), not off the
ambient `useActiveClass()`, for the same reason its `activeAssignment` already did: the server may
have resolved a different class from the one the top bar has selected, and the grade must describe
the class whose marks are on screen.

---

## 5. Page-frame foundation — documented, not migrated

Per §11, **no route was migrated.** `PageContainer` and `PageHeader` were inspected and need no
functional change:

- `data-app-frame` → `display: contents` under `@media print` already means a printable screen can
  move inside the container without its A4 sheet measuring differently;
- `bleed` already covers the full-bleed case (the 3D seating view);
- `PageHeader` already carries `print:hidden`.

What was missing was the **contract**, written where the Phase 2 migrator will read it. It is now
the module header of [components/shell/PageContainer.tsx](../components/shell/PageContainer.tsx):
the composition order, why `ClassContextBar` is written out rather than folded into `PageHeader`
(so `ScoreWorkspaceHeader` screens can leave it out), the four things a converting page must
**delete** rather than wrap, and the two it must keep.

```
<PageContainer>
  <PageHeader title description actions />
  <ClassContextBar />        ← class-scoped routes only; self-gating
  …content
</PageContainer>
```

---

## 6. Verification

### Commands

```
npm run lint        clean
npm run typecheck   clean
npm run verify      27/27 harnesses
npm run build       clean
PG_MODULE=… node scripts/validate-rls.mjs   57/57 behavioural checks
```

### Checks added

| Harness | Section | Proves |
| --- | --- | --- |
| `verify-score-workspace.mts` | **§7 (new)** | ranking screen, `/score/total` and the report engine all narrow with `applySelection`; the screen resolves its template exactly **once**; denominator and maxima both come from it; the compiled-in template really is narrower than the legacy denominator; the `levelCurriculum` gate is still present |
| `verify-class-context.mts` | **§5 (new)** | the bar gates on `isClassScopedPath` and declares **no route list of its own**; it never writes the active class and stores nothing; legacy renders nothing; an unresolved grade prints a dash; grade rides the existing select and uses `sort_order` |
| `verify-class-context.mts` | **§6 (new)** | `/homework/send` is declared class-scoped; the page resolves server-side; the actions re-validate (≥2 `resolveServerScope` calls); the class is stamped from scope not payload; legacy still publishes NULL; pre-00032 rows stay visible |
| `verify-navigation.mts` | **§4 (new)** | `/administration` is declared but `hidden`, keeps its permission, still resolves via `moduleForPath`, and is offered to **none** of teacher / owner / principal / school_admin |
| `verify-migrations.mts` | window | extended to 00032; still all-statements-guarded, BEGIN/COMMIT, documented rollback, definer pins `search_path` |
| `validate-rls.mjs` | **homework (new)** | the eleven live checks in §2 above |

### UX acceptance tests (§18)

| Test | Result |
| --- | --- |
| **A — Ranking** | screen and report now resolve the same subject set for the same class/year/period/selection. Structurally pinned by `verify-score-workspace.mts` §7. Not exercised end-to-end against seeded marks — see §7. |
| **B — Homework** | the list and the composer both follow the active class; switching class re-fetches through `scopeClassId` (in the dependency array). The *recipient* half is proven at the database: a parent of a ៥ក pupil cannot read ៦ក's homework. |
| **C — Context** | `/student-list`, `/score/enter`, `/score/total`, `/attendance/layout`, `/attendance/monthly`, `/homework/enter`, `/homework/send` all state class · grade · year, with no second selector on any of them. |
| **D — Non-class page** | `/profile`, `/team`, `/tutorial` render no bar: `isClassScopedPath` returns false, asserted in `verify-class-context.mts` §4. |

---

## 7. Known remaining work

**Deliberately out of Phase 1.**

1. **The fallback-path denominator** (§1). On the compiled-in `SYSTEM_PRIMARY_TEMPLATE` path the
   ranking screen counts 29 primary columns while the report counts what `resolveTemplate` returns.
   Closing it changes what a legacy account's average counts — a business-rule change. Phase 3.
2. **Test A end-to-end.** The screen/report agreement is pinned structurally, not by generating a
   report and diffing it against the screen for a seeded class. `verify-ranking-live.mts` exists and
   needs `supabase/fixtures/primary_ranking_teacher.sql`; extending it to assert screen-vs-report
   equality on a de-selected subject is the honest completion of this check.
3. **The 29 un-framed routes.** Phase 2. The contract is written; nothing was migrated.
4. **`/administration`.** Still mock, now unreachable from navigation. Phase 11.
5. **The `ClassContextBar` legacy state.** It renders nothing for a pre-V2 account, per the brief's
   §14. Phase 0 §8 scenario 7 wanted such an account never to see an *empty* strip, which this
   satisfies — but it also means a legacy teacher still has no context line anywhere. If that
   should change, it needs a roster-derived label, which is a product decision rather than a bug.
6. **Parent-side homework UI.** The portal reads `homework_assignments` through RLS and needs no
   change to benefit from 00032, but it was not re-examined in this phase.

**Deployment note.** 00032 must be applied before the application code that reads `class_id` ships,
or `getAssignments`'s `.or('class_id.eq.…,class_id.is.null')` will error against a table without
the column. It is additive and safe to apply ahead of the deploy.
