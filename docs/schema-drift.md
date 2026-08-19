# Schema drift: what is in the repo but not on live

Companion to [`deploy-00018-00024.md`](./deploy-00018-00024.md). That file is
the procedure; this one is the reasoning behind it.

## The state

Migrations `00001`–`00017` are believed applied to the live project.
`00018`–`00024` are in the repo and have **never run anywhere** — not on live,
not on a local database. The app is not deployed either, so there is no running
code that depends on them today.

That combination is unusually safe and worth using deliberately: **there is
currently no user whose data can be damaged by getting this wrong.** Every
decision below gets easier now than it will ever be again.

## Verifying the assumption, not trusting it

"00001–00017 are applied" is an assumption inherited from the repo's history,
not a fact anyone checked. Section 7 of
[`schema_snapshot.sql`](../supabase/audits/schema_snapshot.sql) probes for a
distinctive object from each of 00001–00024 and reports `present` / `absent`.
Run it first. If anything from 00001–00017 reads `absent`, the runbook's
preflight queries are answering a different question than you think.

One migration cannot be probed this way: **00019 creates no object.** It
replaces the body of the function 00018 creates, so presence is
`INDETERMINATE` and must be read out of `prosrc`. The runbook's 00019 preflight
does exactly that.

## The seven, grouped by what they risk

**Two change behaviour of something that already exists.**

- `00019` redefines `backfill_teacher_enrolments()` to fix a real bug — 00018's
  year-scoped guard silently promoted a previous year's roster into a new class.
- `00023` corrects the two secondary levels' stored grading schemes, which 00009
  seeded with the primary `/10` ladder.

`00023` is the safer of the two because **no calculation reads those rows** —
the score screens resolve their scheme from `lib/grading/levelSchemes.ts`. It
only stops the admin grading screen from displaying a ladder nothing uses.
`00019` is the one to think about, because the function it replaces is called
during class creation.

**Five are additive.** `00018`, `00020`, `00021`, `00022`, `00024` create new
tables, columns, indexes and functions. Nothing existing reads them, so applying
them cannot change a number on any screen. The client code was written to fall
back when they are absent: a missing template column resolves to the primary
curriculum, a missing join-request RPC yields an empty list, a missing
`subject_key` resolves every teacher as whole-class.

## What that buys

The five additive migrations can go in ahead of the app with no visible effect.
So the ordering is not a dilemma:

> **Migrations first, verify each one, app second.**

The app expects the functions to exist. The reverse — deploying the app against
a database missing `backfill_teacher_enrolments()` — means no teacher can create
a class, because `createClassAndAssign` treats the backfill failing as fatal and
rolls the class back rather than leave a v2-scoped account with an empty roster.

## The one thing that is not a migration

The roster-recovery regression is a separate question with a separate artefact.
`2686507` widened a backfill in a way that could double-enrol; whether any real
teacher was affected is a data question, not a schema one.
[`audit_recovery_safety.sql`](../supabase/audits/audit_recovery_safety.sql)
answers it and **writes nothing**. Run it after the migrations, read its section
2 before telling anyone to press the recovery banner on `/student-list`.

## Where the real risk is

Not in the SQL. Migration 00017's header exists because of a dependency nobody
could have predicted from reading the repo — `schools_select_member` reads
`profiles.school_id`, not `user_roles.school_id` — and it was found by looking at
a live database.

The static checks pass 31/31, which proves the files are re-runnable and
well-formed. It does not prove they are *right about live*. Take the snapshot,
read it, and expect one more surprise.
