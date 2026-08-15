-- =============================================================================
-- supabase/fixtures/legacy_single_teacher.sql
-- =============================================================================
-- LOCAL DEVELOPMENT FIXTURE — *not* a migration. Never run against production.
--
-- Recreates the pre-V2 single-teacher shape so the Phase 2 backfill can be
-- exercised, and creates sign-in-capable local accounts.
--
--   T1  krusmart.teacher@gmail.com   full settings · 3 students · scores · attendance
--   T2  teacher.two@krusmart.test    same school, different class — proves schools de-duplicate
--   T3  teacher.three@krusmart.test  NO settings row, 1 student — proves nobody is dropped
--
-- PASSWORD FOR ALL THREE: krusmart123
--
-- T1 reuses the UUID your local account had before the reset
-- (adc259c9-c3e4-4616-9648-66be9a735c72), so anything that referenced it still
-- resolves.
--
-- Idempotent: safe to re-run.
-- =============================================================================

BEGIN;

-- --- auth users -------------------------------------------------------------
-- Passwords are hashed with pgcrypto's bcrypt, which is what GoTrue verifies
-- against. A literal string here would be accepted by the INSERT but would make
-- sign-in fail with "Invalid login credentials".
INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data,
    confirmation_token, recovery_token, email_change_token_new, email_change
) VALUES
    ('00000000-0000-0000-0000-000000000000','adc259c9-c3e4-4616-9648-66be9a735c72','authenticated','authenticated','krusmart.teacher@gmail.com', crypt('krusmart123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-4000-8000-000000000002','authenticated','authenticated','teacher.two@krusmart.test',   crypt('krusmart123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', ''),
    ('00000000-0000-0000-0000-000000000000','aaaaaaaa-0000-4000-8000-000000000003','authenticated','authenticated','teacher.three@krusmart.test', crypt('krusmart123', gen_salt('bf')), now(), now(), now(), '{"provider":"email","providers":["email"]}', '{}', '', '', '', '')
ON CONFLICT (id) DO NOTHING;

-- GoTrue requires a matching identity row for the email provider, otherwise the
-- user exists but no login method is attached to it.
INSERT INTO auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
SELECT gen_random_uuid(), u.id::text, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
       'email', now(), now(), now()
  FROM auth.users u
 WHERE u.email IN ('krusmart.teacher@gmail.com','teacher.two@krusmart.test','teacher.three@krusmart.test')
   AND NOT EXISTS (
        SELECT 1 FROM auth.identities i WHERE i.user_id = u.id AND i.provider = 'email');

-- --- settings (T3 intentionally absent) -------------------------------------
INSERT INTO public.settings (teacher_id, surname, name, teacher_name, school_name, school_code, class_name, academic_year, homeroom_teacher)
VALUES
    ('adc259c9-c3e4-4616-9648-66be9a735c72','សុខ','សុភា','សុខ សុភា','សាលាបឋមសិក្សាហ៊ុនសែន','PS-001','១ក','2025-2026','សុខ សុភា'),
    ('aaaaaaaa-0000-4000-8000-000000000002','ចាន់','ដារា','ចាន់ ដារា','សាលាបឋមសិក្សាហ៊ុនសែន','PS-001','២ខ','2025-2026','ចាន់ ដារា')
ON CONFLICT (teacher_id) DO NOTHING;

-- --- students ---------------------------------------------------------------
INSERT INTO public.students (id, teacher_id, student_id, grade, name_kh, gender, dob, order_index)
VALUES
    ('b0000000-0000-4000-8000-000000000001','adc259c9-c3e4-4616-9648-66be9a735c72','001','១ក','សុខ ចន្ថា','ស្រី','2018-03-12',1),
    ('b0000000-0000-4000-8000-000000000002','adc259c9-c3e4-4616-9648-66be9a735c72','002','១ក','លី សុវណ្ណ','ប្រុស','2018-07-01',2),
    ('b0000000-0000-4000-8000-000000000003','adc259c9-c3e4-4616-9648-66be9a735c72','003','១ក','ម៉ៅ សុខា','ស្រី','2018-11-20',3),
    ('b0000000-0000-4000-8000-000000000004','aaaaaaaa-0000-4000-8000-000000000002','001','២ខ','ពៅ រតនា','ប្រុស','2017-05-09',1),
    ('b0000000-0000-4000-8000-000000000005','aaaaaaaa-0000-4000-8000-000000000002','002','២ខ','ស៊ុន ស្រីនិច','ស្រី','2017-09-14',2),
    -- T3 has no settings row: the backfill must still place this student.
    ('b0000000-0000-4000-8000-000000000006','aaaaaaaa-0000-4000-8000-000000000003','001','៧ក','ខៀវ ពិសិដ្ឋ','ប្រុស','2012-02-02',1)
ON CONFLICT (id) DO NOTHING;

-- --- scores: monthly + semester, exercising the score_type discrimination ----
INSERT INTO public.scores (teacher_id, student_id, subject, score_type, score_period, score_value)
VALUES
    ('adc259c9-c3e4-4616-9648-66be9a735c72','b0000000-0000-4000-8000-000000000001','kh_read','monthly','nov-2025-2026', 8.5),
    ('adc259c9-c3e4-4616-9648-66be9a735c72','b0000000-0000-4000-8000-000000000001','math_num','monthly','nov-2025-2026', 9.0),
    ('adc259c9-c3e4-4616-9648-66be9a735c72','b0000000-0000-4000-8000-000000000002','kh_read','monthly','nov-2025-2026', 6.0),
    ('adc259c9-c3e4-4616-9648-66be9a735c72','b0000000-0000-4000-8000-000000000003','math_num','monthly','dec-2025-2026', 7.25),
    ('adc259c9-c3e4-4616-9648-66be9a735c72','b0000000-0000-4000-8000-000000000001','sem_math','semester','sem1-2025-2026', 8.0),
    ('aaaaaaaa-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000004','kh_read','monthly','nov-2025-2026', 5.5),
    ('aaaaaaaa-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000005','math_num','monthly','nov-2025-2026', 9.75),
    ('aaaaaaaa-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000006','sci_phy','monthly','nov-2025-2026', 7.0)
ON CONFLICT (teacher_id, student_id, subject, score_type, score_period) DO NOTHING;

-- --- attendance (owner-stamped, per the B2 fix) -----------------------------
INSERT INTO public.attendance (teacher_id, student_id, date, status, reason)
VALUES
    ('adc259c9-c3e4-4616-9648-66be9a735c72','b0000000-0000-4000-8000-000000000001','2025-11-03','P',''),
    ('adc259c9-c3e4-4616-9648-66be9a735c72','b0000000-0000-4000-8000-000000000002','2025-11-03','A','ឈឺ'),
    ('adc259c9-c3e4-4616-9648-66be9a735c72','b0000000-0000-4000-8000-000000000003','2025-11-03','L',''),
    ('aaaaaaaa-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000004','2025-11-03','P',''),
    ('aaaaaaaa-0000-4000-8000-000000000003','b0000000-0000-4000-8000-000000000006','2025-11-03','P','')
ON CONFLICT (student_id, date) DO NOTHING;

COMMIT;
