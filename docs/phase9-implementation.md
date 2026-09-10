# Phase 9 — Dashboard

**Follows** [phase8-implementation.md](phase8-implementation.md). Covers the brief's Phase 9,
which [phase0-ux-audit.md](phase0-ux-audit.md) §7 scheduled as *"already rebuilt and pinned;
verify against the new IA only"*.

**Gates:** lint clean · `tsc --noEmit` clean · **30/30 harnesses** · `next build` clean · the fix
confirmed live.

No migration, no new file. One field added to a shared type, two call sites, four harness checks.

---

## 0. Verified against the brief

Every item the brief asks for is present and was checked on the running app: active class ·
student count · attendance today · **score completion** · pending work · recent activity · quick
actions — and the quick actions are exactly the four named, plus homework.

`FeatureGrid`'s tile wall sits **below** the day's work and is derived from `NAV_SECTIONS`, so it
is an overview rather than the menu the brief warns against; adding a route to
`lib/navigation.ts` adds it there with the right label, and a route not declared there cannot
appear.

One item did not survive the check.

---

## 1. ★ The marking bar could not reach 100%

The dashboard read:

> **ការបញ្ចូលពិន្ទុ · ៩%** — គ្រប់ ០ · មិនគ្រប់ ៦ · មិនទាន់ ២៩ **ក្នុងចំណោម ៣៥ មុខវិជ្ជា**

and the attention list read **មុខវិជ្ជា ៣៥ មិនទាន់បញ្ចូលពិន្ទុគ្រប់**.

The class teaches **three** subjects. Resolved against the live database:

```
monthly   template 35   entry grid (narrowed) 3   selection rows 4
```

`/score/enter`'s grid narrows by `class_template_subjects`; the two completion surfaces —
the dashboard and `/score/collect` — both fed `subjectProgress` the **unnarrowed** template. So
thirty-two of the thirty-five subjects counted as outstanding work could not be marked at all,
the bar was pinned near 9% for ever, and the attention list named a number nobody could act on.

This is the `/ranking` divergence Phase 1 closed, one surface further on: same template, two
resolutions, one of them narrowed and one not.

### Progress and averages are two questions

The existing rule — *"narrowing a template must never narrow an average"* — is right and stays:
a class that stops teaching a subject must not retroactively change last term's marks. But
**progress is not an average.** It measures work a teacher can actually do, so its denominator is
the entry grid.

`ServerGradingContext` now carries both lists and neither screen decides for itself:

| | reads | used by |
| --- | --- | --- |
| `subjects` | the whole curriculum | every average, rank, certificate, report |
| `taughtSubjects` | narrowed by the class's selection | the progress bar and `/score/collect` |

`applySelection` returns the full list for a class that has configured nothing, so an account
that never opened `/score/subjects` is unchanged.

**Live, after:** `១៨% · គ្រប់ ០ · មិនគ្រប់ ១ · មិនទាន់ ២ ក្នុងចំណោម ៣ មុខវិជ្ជា`, and the
attention line reads `មុខវិជ្ជា ៣`.

`verify-dashboard.mts` §3 gained four checks, including that the averages did **not** move to the
narrowed list.

---

## 2. Known remaining work

Unchanged from [phase8-implementation.md](phase8-implementation.md) §6, minus nothing — this
phase closed no items from that list and added none.
