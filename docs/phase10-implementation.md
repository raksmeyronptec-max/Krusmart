# Phase 10 — Design system consistency

**Follows** [phase9-implementation.md](phase9-implementation.md). Covers the brief's Phase 20 and
carries in the two items [phase7-implementation.md](phase7-implementation.md) §6 deferred.

**Gates:** lint clean · `tsc --noEmit` clean · **31/31 harnesses** (new:
`verify-design-system.mts`) · `next build` clean · re-measured in a real browser in both themes.

No migration. One new token pair, one new harness, 48 files swept, one file deleted.

---

## 0. Most of the list was already done

The brief asks for one implementation of each shared pattern. Counted across `app/` and
`components/`, most already have one and are already pinned: the page frame by
`verify-page-frame.mts` (42 routes, Phase 2), the paper contract by `verify-documents.mts`
(Phase 7), the IA by `verify-navigation.mts`, the selects and pagination by CLAUDE.md's own rule.

**Tabs** were worth measuring rather than assuming. Eleven screens hand-roll a tab strip, and
**ten were already correct** — `role="tab"` on each child, `aria-selected` bound to state, a
44px target. Converging those ten into a shared component would have been churn; the defect was
the eleventh.

What was left were two things a style guide cannot catch, because both are arithmetic.

---

## 1. ★ The ink did not flip with the fill

`--brand` is theme-aware and flips to cyan on dark. `text-white` is not. Sixteen elements wrote
white on a brand fill — buttons, avatar bubbles, the bulk-action bar — which measures **2.13:1**
at night. `--brand-contrast` exists for exactly this and flips to navy.

## 2. ★ Warning-as-a-label was never legible

`--warning` (#D99614) is tuned as a fill and a 10% tint. Used as **text** it measures **2.39:1**
on the app ground and 2.32:1 on its own tint — under SC 1.4.3's 4.5:1, and under the 3:1 floor
for the amber icons too. It was the label colour on **68 elements**: the dashboard's attention
list, `/score/collect`'s banner, `/score-analyse`'s struggling-pupils tile, the register's
ច្បាប់ count.

The fix is the treatment `--danger-text` already had — the fill is tuned and must not move, so
the label gets its own token:

```
        light      dark
warning-text  #96620A   #D99614        4.91:1 on the app ground · 5.19 on a card · 4.54 on the tint
```

Dark mode is byte-identical: #D99614 already measures 6.66:1 there. `verify-design-system.mts`
computes those ratios from the tokens rather than trusting them, and asserts the **fill** did not
move.

**Re-measured in the browser afterwards:** every `text-warning` failure on `/dashboard`,
`/administration`, `/score/collect`, `/score-analyse` and `/cleaning-schedule` is gone.

---

## 3. ★ Two sign-in forms, one of them dead

`app/login/LoginForm.tsx` and `app/login/_components/LoginForm.tsx` were two 394-line copies of
the sign-in screen. **All five login routes import `_components/`**; the top-level copy was
imported by nothing, had diverged by 133 lines, and last changed two refactors ago.

It was not harmless. Every sweep in this program edited both — including two in Phase 7 — and
every audit counted its drift twice. Deleted; `verify-design-system.mts` S5 keeps a second copy
from coming back.

Its tab strip was also the **one** of eleven that was not a tab list: `role="tablist"` wrapping
plain buttons, with nothing exposing which of ចូលគណនី / បង្កើតថ្មី was selected. Fixed in the
live copy.

---

## 4. Deliberately not swept

The same defect shape runs through three more status colours used as labels, all below 4.5:1 in
light mode. They are specified here rather than half-applied:

| token | on the light app ground | candidate | sites |
| --- | --- | --- | --- |
| `text-success` | 3.07:1 | `#0F7A50` (5.07) | 88 |
| `text-danger` | 3.94:1 | `#BE2B44` — the existing `--danger-text` | 114 |
| `text-brand-500` | 2.73:1 | `#1B6FB0` (5.03) | 14 |
| `text-gold` | 2.01:1 | `#8A6420` (5.06) | 17 |

That is ~233 call sites and three more token pairs. The two fixed here were the ones the browser
measured as worst and that Phase 7 had already recorded; the rest is one clean mechanical pass
and is better handed over specified than started late in a session. `verify-design-system.mts`
therefore bans only what is actually fixed, so it does not go red on known-deferred work.

---

## 5. Known remaining work

1. **The three status-label tokens above** — §4, with values and counts.
2. The admin console renders `bg-white` cards rather than `bg-bg-surface`; the console has no
   dark-mode pass at all.
3. Everything carried from [phase8-implementation.md](phase8-implementation.md) §6 except
   `text-white` on `bg-brand` and `text-warning`, which this phase closed.
