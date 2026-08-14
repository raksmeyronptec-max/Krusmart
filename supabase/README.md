# Database schema

## ⚠️ These files are a stale snapshot, not the source of truth

The live Supabase project has drifted from everything in this directory. Verify
columns against the live database before relying on any of it, and expect to
write the migration yourself when you add one.

## Layout

| Path | What it is |
| --- | --- |
| `migrations/00001_init.sql` | The canonical baseline — every table, its RLS policies and indexes. |
| `legacy/` | Superseded partial snapshots from earlier in the project's history. Kept for reference only; each one is a strict subset of the baseline. **Do not apply these.** |
| `config.toml` | Supabase CLI config. |

`master_schema.sql` used to sit alongside `migrations/00001_init.sql` as a
byte-identical copy. It has been removed — `migrations/00001_init.sql` is the
one to read.

## Known drift from the live database

These differences are real and load-bearing; the app follows the *live* shape.

| Table | Divergence |
| --- | --- |
| `scores` | Code writes `score_period` and `score_value`. The SQL still declares `month` and `score`. Upserts use `onConflict: 'student_id, subject, score_type, score_period'`. |
| `attendance` | Live table has a `reason` column (written by `saveAttendance`); the SQL does not declare it. |
| `settings` | Code reads `photo_url`, `school_code`, `school_logo`, `director_name`, `manager_name`, `teacher_name` and `province_date`, none of which appear in the SQL. |
| `profiles`, `schools`, `teacher_attendance` | Used by `TopNav`'s GPS check-in and `app/admin/teacher-attendance`, but have **no SQL file at all**. |
| `homework_scores` | Declared here, unused by the app — homework marks live in `scores` under `score_type = 'homework'`. |

## Multi-tenancy

Every table is keyed on `teacher_id → auth.users(id)` with four RLS policies of
the form `auth.uid() = teacher_id`. A "class" is a teacher account; there is no
classes table.

Application queries scope by `.eq('teacher_id', user.id)` on top of RLS — see
the convention note in `CLAUDE.md`. One exception is currently outstanding:
`app/(main)/attendance/layout/actions.ts` queries and upserts `attendance`
without `teacher_id`, on the basis of a code comment claiming the live table has
no such column. That contradicts the RLS policy above and is worth verifying
against the live database.
