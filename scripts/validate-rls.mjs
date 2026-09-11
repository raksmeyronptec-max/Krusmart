/**
 * Does the RLS actually deny what the policy comments claim?
 *
 * scripts/verify-migrations.mts proves structure (a policy exists, a function
 * pins search_path). scripts/validate-migrations.mjs proves the SQL executes.
 * Neither proves BEHAVIOUR, and behaviour is where the damage is: a policy that
 * grants more than its comment says is invisible until a teacher reads another
 * school's pupils.
 *
 * This signs in as two teachers in DIFFERENT schools and has each try to reach
 * the other's rows, the way PostgREST does it — `SET LOCAL ROLE authenticated`
 * plus `request.jwt.claims`, against the genuine auth.uid() copied out of the
 * running Supabase instance. `postgres` is a superuser and bypasses RLS
 * entirely, so every assertion below runs as `authenticated` or `anon`.
 *
 * WHAT THIS CANNOT COVER — see the foot of the file for the full list.
 *
 * Usage: supabase start && node scripts/validate-rls.mjs
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PG = process.env.PG_MODULE || 'pg'
let Client
try { ({ Client } = (await import(PG)).default ?? await import(PG)) }
catch { console.error(`Cannot load "pg" (tried ${PG}). See scripts/validate-migrations.mjs header.`); process.exit(2) }

const REPO = new URL('..', import.meta.url).pathname
const MIG = join(REPO, 'supabase/migrations')
const ADMIN = { host:'127.0.0.1', port:54322, user:'postgres', password:'postgres', database:'postgres' }
const DB = 'v_rls'

const out = []
const log = (...a) => console.log(...a)
function check(name, pass, detail='') {
  out.push({ name, pass })
  log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`)
}

const conn = async (database) => { const c = new Client({...ADMIN, database}); await c.connect(); return c }
function splitStatements(sql) {
  const o=[]; let b='',i=0,s=false,l=false,k=false,t=null
  while(i<sql.length){ const c=sql[i],two=sql.slice(i,i+2)
    if(l){b+=c;if(c==='\n')l=false;i++;continue}
    if(k){b+=c;if(two==='*/'){b+=sql[i+1];i+=2;k=false;continue}i++;continue}
    if(t){if(sql.startsWith(t,i)){b+=t;i+=t.length;t=null;continue}b+=c;i++;continue}
    if(s){if(c==="'"){if(sql[i+1]==="'"){b+="''";i+=2;continue}s=false}b+=c;i++;continue}
    if(two==='--'){l=true;b+=two;i+=2;continue}
    if(two==='/*'){k=true;b+=two;i+=2;continue}
    if(c==="'"){s=true;b+=c;i++;continue}
    const d=sql.slice(i).match(/^\$[A-Za-z_]*\$/)
    if(d){t=d[0];b+=t;i+=t.length;continue}
    if(c===';'){const x=b.trim();if(x)o.push(x);b='';i++;continue}
    b+=c;i++ }
  const x=b.trim(); if(x)o.push(x)
  return o.filter(z=>z.replace(/--[^\n]*/g,'').trim().length>0)
}

/** Run fn with the connection acting as `uid` (or anon when uid is null). */
async function as(c, uid, fn) {
  await c.query('BEGIN')
  try {
    await c.query(`SET LOCAL ROLE ${uid ? 'authenticated' : 'anon'}`)
    if (uid) await c.query(`SELECT set_config('request.jwt.claims', $1, true)`,
      [JSON.stringify({ sub: uid, role: 'authenticated' })])
    return { ok: true, value: await fn() }
  } catch (e) { return { ok: false, error: e.message, code: e.code } }
  finally { await c.query('ROLLBACK').catch(()=>{}) }
}
const rows = async (c, sql, p) => (await c.query(sql, p)).rows

const main = async () => {
  const a0 = await conn('postgres')
  await a0.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`); await a0.query(`CREATE DATABASE ${DB}`)
  const uid = (await a0.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                               WHERE n.nspname='auth' AND p.proname='uid'`)).rows[0].prosrc
  await a0.end()

  const c = await conn(DB)
  await c.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`)
  await c.query(`CREATE SCHEMA IF NOT EXISTS auth`)
  await c.query(`CREATE TABLE IF NOT EXISTS auth.users (id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
                 email text, raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now())`)
  await c.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ ${uid} $fn$`)
  for (const r of ['anon','authenticated','service_role'])
    await c.query(`DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${r}') THEN CREATE ROLE ${r} NOLOGIN; END IF; END $do$`)
  await c.query(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role`)
  await c.query(`GRANT SELECT ON auth.users TO authenticated, service_role`)
  for (const f of readdirSync(MIG).filter(f=>/^\d{5}_.*\.sql$/.test(f)).sort())
    for (const s of splitStatements(readFileSync(join(MIG,f),'utf8')))
      { try { await c.query(s) } catch(e){ await c.query('ROLLBACK').catch(()=>{}); console.error('setup failed in',f,e.message); process.exit(1) } }
  log('schema at 00024\n')

  // ---------------- two schools, two teachers, no overlap ------------------
  const one = async (q,p)=>(await c.query(q,p)).rows[0]
  const mk = async (label) => {
    const t = (await one(`INSERT INTO auth.users (email) VALUES ($1) RETURNING id`,[`${label}@example.com`])).id
    const sc= (await one(`INSERT INTO public.schools (name) VALUES ($1) RETURNING id`,[`សាលា ${label}`])).id
    const y = (await one(`INSERT INTO public.academic_years (school_id,name) VALUES ($1,'2025-2026') RETURNING id`,[sc])).id
    const l = (await one(`INSERT INTO public.education_levels (school_id,name) VALUES ($1,'បឋមសិក្សា') RETURNING id`,[sc])).id
    const g = (await one(`INSERT INTO public.grades (education_level_id,name) VALUES ($1,'ថ្នាក់ទី៥') RETURNING id`,[l])).id
    const k = (await one(`INSERT INTO public.classes (grade_id,academic_year_id,name) VALUES ($1,$2,$3) RETURNING id`,[g,y,`៥${label}`])).id
    await c.query(`INSERT INTO public.teacher_assignments (teacher_id,class_id,academic_year_id,is_homeroom,status)
                   VALUES ($1,$2,$3,true,'active')`,[t,k,y])
    await c.query(`INSERT INTO public.profiles (id, school_id) VALUES ($1,$2)
                   ON CONFLICT (id) DO UPDATE SET school_id=EXCLUDED.school_id`,[t,sc])
    const st= (await one(`INSERT INTO public.students (teacher_id,student_id,grade,name_kh,gender,dob)
                   VALUES ($1,$2,'ថ្នាក់ទី៥',$3,'ប្រុស','2014-01-01') RETURNING id`,[t,`S-${label}`,`សិស្ស ${label}`])).id
    await c.query(`INSERT INTO public.student_enrollments (student_id,class_id,academic_year_id,status) VALUES ($1,$2,$3,'active')`,[st,k,y])
    await c.query(`INSERT INTO public.scores (teacher_id,student_id,subject,score_period,score_type,score_value)
                   VALUES ($1,$2,'kh_read','11-2025-2026','monthly',8)`,[t,st])
    return { t, sc, y, k, st }
  }
  const A = await mk('A'), B = await mk('B')
  log(`teacher A ${A.t} (school ${A.sc})`)
  log(`teacher B ${B.t} (school ${B.sc})  — different school, no shared class\n`)

  // ---------------------------------------------------------------- students
  log('students')
  let r = await as(c, A.t, () => rows(c, `SELECT id FROM public.students`))
  check('A sees own pupil', r.ok && r.value.length === 1, `${r.value?.length} row(s)`)
  r = await as(c, B.t, () => rows(c, `SELECT id FROM public.students WHERE id=$1`, [A.st]))
  check("B CANNOT read A's pupil", r.ok && r.value.length === 0, `${r.value?.length} row(s)`)
  r = await as(c, B.t, () => rows(c, `UPDATE public.students SET name_kh='hacked' WHERE id=$1 RETURNING id`, [A.st]))
  check("B CANNOT rename A's pupil", r.ok && r.value.length === 0, `${r.value?.length} row(s) updated`)
  r = await as(c, B.t, () => rows(c, `DELETE FROM public.students WHERE id=$1 RETURNING id`, [A.st]))
  check("B CANNOT delete A's pupil", r.ok && r.value.length === 0, `${r.value?.length} row(s) deleted`)
  r = await as(c, null, () => rows(c, `SELECT id FROM public.students`))
  check('anon sees no pupils', (r.ok && r.value.length === 0) || !r.ok, r.ok ? `${r.value.length} row(s)` : r.error)

  // ------------------------------------------------------------------ scores
  log('\nscores')
  r = await as(c, A.t, () => rows(c, `SELECT id FROM public.scores`))
  check('A sees own marks', r.ok && r.value.length === 1, `${r.value?.length} row(s)`)
  r = await as(c, B.t, () => rows(c, `SELECT id FROM public.scores WHERE teacher_id=$1`, [A.t]))
  check("B CANNOT read A's marks", r.ok && r.value.length === 0, `${r.value?.length} row(s)`)
  r = await as(c, B.t, () => rows(c, `INSERT INTO public.scores (teacher_id,student_id,subject,score_period,score_type,score_value)
                                      VALUES ($1,$2,'kh_read','12-2025-2026','monthly',1) RETURNING id`, [A.t, A.st]))
  check("B CANNOT write a mark owned by A", !r.ok, r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)
  r = await as(c, B.t, () => rows(c, `UPDATE public.scores SET score_value=1 WHERE teacher_id=$1 RETURNING id`, [A.t]))
  check("B CANNOT change A's marks", r.ok && r.value.length === 0, `${r.value?.length} row(s) updated`)

  // -------------------------------- the case 00007 exists to ALLOW ---------
  // Denial across schools is only half the contract. A colleague teaching the
  // same class must be able to READ a subject teacher's marks (that is what
  // scores_select_own_or_assigned is for, and what /score/collect depends on)
  // while still being unable to WRITE them. A policy that is merely too strict
  // breaks the secondary model as surely as one that is too loose.
  log('\ncross-teacher, SAME class (00006 / 00007)')
  const D = (await one(`INSERT INTO auth.users (email) VALUES ('colleague@example.com') RETURNING id`)).id
  await c.query(`INSERT INTO public.profiles (id, school_id) VALUES ($1,$2)
                 ON CONFLICT (id) DO UPDATE SET school_id=EXCLUDED.school_id`, [D, A.sc])
  await c.query(`INSERT INTO public.teacher_assignments (teacher_id,class_id,academic_year_id,is_homeroom,status)
                 VALUES ($1,$2,$3,false,'active')`, [D, A.k, A.y])
  r = await as(c, D, () => rows(c, `SELECT id FROM public.students WHERE id=$1`, [A.st]))
  check("colleague on the same class CAN read the pupil", r.ok && r.value.length === 1, `${r.value?.length} row(s)`)
  r = await as(c, D, () => rows(c, `SELECT id FROM public.scores WHERE teacher_id=$1`, [A.t]))
  check("colleague CAN read a co-teacher's marks (this is what /score/collect needs)",
    r.ok && r.value.length === 1, `${r.value?.length} row(s)`)
  r = await as(c, D, () => rows(c, `UPDATE public.scores SET score_value=1 WHERE teacher_id=$1 RETURNING id`, [A.t]))
  check("colleague still CANNOT change them (read widened, write did not)",
    r.ok && r.value.length === 0, `${r.value?.length} row(s) updated`)

  // ---------------------------------------------------- join_requests (00022)
  log('\njoin_requests (00022)')
  r = await as(c, B.t, () => rows(c, `INSERT INTO public.join_requests (school_id,user_id,message)
                                      VALUES ($1,$2,'ខ្ញុំចង់ចូលរួម') RETURNING id`, [A.sc, B.t]))
  check('B may request to join school A', r.ok && r.value.length === 1, r.ok ? '' : r.error)
  r = await as(c, B.t, () => rows(c, `INSERT INTO public.join_requests (school_id,user_id) VALUES ($1,$2) RETURNING id`, [A.sc, A.t]))
  check('B CANNOT forge a request as A', !r.ok, r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)
  const req = (await one(`INSERT INTO public.join_requests (school_id,user_id) VALUES ($1,$2) RETURNING id`, [A.sc, B.t])).id
  r = await as(c, B.t, () => rows(c, `UPDATE public.join_requests SET status='approved' WHERE id=$1 RETURNING id`, [req]))
  check('B CANNOT approve their own request (no UPDATE policy)', r.ok && r.value.length === 0, `${r.value?.length} row(s) updated`)
  r = await as(c, B.t, () => rows(c, `SELECT id FROM public.join_requests WHERE id=$1`, [req]))
  check('B sees their own pending request', r.ok && r.value.length === 1, `${r.value?.length} row(s)`)
  const reqA = (await one(`INSERT INTO public.join_requests (school_id,user_id) VALUES ($1,$2) RETURNING id`, [B.sc, A.t])).id
  r = await as(c, B.t, () => rows(c, `SELECT id FROM public.join_requests WHERE id=$1`, [reqA]))
  check("B CANNOT read A's request to B's school without an admin role", r.ok && r.value.length === 0, `${r.value?.length} row(s)`)

  // ------------------------------------------------- teacher_profiles (00020)
  log('\nteacher_profiles (00020)')
  r = await as(c, A.t, () => rows(c, `INSERT INTO public.teacher_profiles (teacher_id) VALUES ($1) RETURNING teacher_id`, [A.t]))
  check('A may create own profile', r.ok, r.ok ? '' : r.error)
  r = await as(c, B.t, () => rows(c, `INSERT INTO public.teacher_profiles (teacher_id) VALUES ($1) RETURNING teacher_id`, [A.t]))
  check("B CANNOT create a profile owned by A", !r.ok, r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)
  await c.query(`INSERT INTO public.teacher_profiles (teacher_id) VALUES ($1) ON CONFLICT DO NOTHING`, [A.t])
  r = await as(c, B.t, () => rows(c, `SELECT teacher_id FROM public.teacher_profiles WHERE teacher_id=$1`, [A.t]))
  check("B CANNOT read A's profile", r.ok && r.value.length === 0, `${r.value?.length} row(s)`)

  // ------------------------------------------------------- SECURITY DEFINER
  log('\nSECURITY DEFINER functions')
  // A third teacher asks to join school A, so the negative case is "not an
  // admin of that school" and not "cannot approve your own request" — the
  // function raises 28000 for both, so the CODE alone proves nothing and the
  // assertion has to read the message.
  const C = await mk('C')
  const reqC = (await one(`INSERT INTO public.join_requests (school_id,user_id) VALUES ($1,$2) RETURNING id`, [A.sc, C.t])).id
  r = await as(c, B.t, () => rows(c, `SELECT public.approve_join_request($1)`, [reqC]))
  check('B CANNOT approve a request to a school they do not administer',
    !r.ok && /អ្នកមិនមានសិទ្ធិសម្រេចលើសំណើនេះទេ/.test(r.error || ''),
    r.ok ? 'RETURNED — guard missing' : `${r.code} ${r.error}`)

  // Positive control: without this, the check above would pass even if the
  // function refused everyone unconditionally.
  const ownerRole = (await one(`SELECT id FROM public.roles WHERE name='owner'`)) ||
                    (await one(`INSERT INTO public.roles (name) VALUES ('owner') RETURNING id`))
  await c.query(`INSERT INTO public.user_roles (user_id, role_id, school_id) VALUES ($1,$2,$3)
                 ON CONFLICT DO NOTHING`, [A.t, ownerRole.id, A.sc])
  r = await as(c, A.t, () => rows(c, `SELECT public.approve_join_request($1)`, [reqC]))
  check('A (owner of that school) CAN approve it — the guard discriminates',
    r.ok, r.ok ? '' : `${r.code} ${r.error}`)
  r = await as(c, B.t, () => rows(c, `SELECT * FROM public.my_join_requests()`))
  const mine = r.ok ? r.value : []
  check('my_join_requests() returns only the caller\'s own',
    r.ok && mine.every(x => !x.user_id || x.user_id === B.t), r.ok ? `${mine.length} row(s)` : r.error)
  r = await as(c, null, () => rows(c, `SELECT public.backfill_teacher_enrolments()`))
  check('anon CANNOT run backfill_teacher_enrolments()', !r.ok, r.ok ? 'RAN — grant too wide' : r.code)

  // ------------------------------------------- teacher_assignments (00024)
  // The subject-identity convergence writes `subject_key` through the existing
  // `teacher_assignments_admin_write` policy. Prove the policy discriminates
  // in both directions, that the partial unique index actually fires, and that
  // a pre-convergence row (subject_id, no key) still reads back — the
  // "assignment made before this change still resolves" scenario.
  log('\nteacher_assignments writes (subject_key path)')
  // A holds `owner` in school A from the positive control above.
  // D already holds a committed subject-less row on this class (the colleague
  // fixture above), so this insert succeeding is precisely what 00025 enables:
  // before it, the homeroom index mistook both rows for homeroom duplicates.
  r = await as(c, A.t, () => rows(c, `INSERT INTO public.teacher_assignments
      (teacher_id, class_id, academic_year_id, subject_key, is_homeroom, status)
      VALUES ($1,$2,$3,'math_general',false,'active') RETURNING id`, [D, A.k, A.y]))
  check('school owner CAN assign a subject to a teacher who already has a class row (00025)',
    r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)
  // `as()` rolls its transaction back, so the insert above never persisted.
  // To test the duplicate guard the first row must be COMMITTED — plant it as
  // superuser, then collide with it as the admin.
  await c.query(`INSERT INTO public.teacher_assignments
      (teacher_id, class_id, academic_year_id, subject_key, is_homeroom, status)
      VALUES ($1,$2,$3,'math_general',false,'active')`, [D, A.k, A.y])
  r = await as(c, A.t, () => rows(c, `INSERT INTO public.teacher_assignments
      (teacher_id, class_id, academic_year_id, subject_key, is_homeroom, status)
      VALUES ($1,$2,$3,'math_general',false,'active') RETURNING id`, [D, A.k, A.y]))
  check('the same assignment twice hits teacher_assignments_subject_key_uniq', !r.ok && r.code === '23505', r.ok ? 'DUPLICATE ACCEPTED' : r.code)
  r = await as(c, A.t, () => rows(c, `INSERT INTO public.teacher_assignments
      (teacher_id, class_id, academic_year_id, subject_key, is_homeroom, status)
      VALUES ($1,$2,$3,'khmer_all',false,'active') RETURNING id`, [D, A.k, A.y]))
  check('...but a SECOND subject in the same class is allowed (00025)',
    r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)
  r = await as(c, B.t, () => rows(c, `INSERT INTO public.teacher_assignments
      (teacher_id, class_id, academic_year_id, subject_key, is_homeroom, status)
      VALUES ($1,$2,$3,'kh_read',false,'active') RETURNING id`, [B.t, A.k, A.y]))
  check("a teacher from another school CANNOT write an assignment into A's class", !r.ok, r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)

  // A pre-convergence assignment: subject_id set, subject_key NULL. Planted as
  // superuser because nothing writes this shape any more.
  const oldSubject = (await one(`INSERT INTO public.subjects (school_id, name, code)
      VALUES ($1, 'គណិតវិទ្យា (ចាស់)', 'math_legacy') RETURNING id`, [A.sc])).id
  await c.query(`INSERT INTO public.teacher_assignments
      (teacher_id, class_id, academic_year_id, subject_id, is_homeroom, status)
      VALUES ($1,$2,$3,$4,false,'active')`, [D, A.k, A.y, oldSubject])
  r = await as(c, D, () => rows(c, `SELECT subject_id, subject_key FROM public.teacher_assignments
      WHERE teacher_id = $1 AND class_id = $2 AND subject_id IS NOT NULL`, [D, A.k]))
  check('a pre-convergence subject_id row still reads back, subject_key NULL',
    r.ok && r.value.length === 1 && r.value[0].subject_key === null,
    r.ok ? JSON.stringify(r.value) : r.error)
  // resolveClassTeachingRole treats subject_key NULL as whole-class — the same
  // access every assignment granted before 00024 introduced narrowing, so a
  // pre-convergence row loses nothing. That mapping lives in serverScope and
  // is asserted here at the data level: the row is visible and unkeyed.

  // ------------------------------------------- teacher-created classes (00031)
  // The account the feature exists for: a plain `teacher` in a school somebody
  // else owns — exactly what approve_join_request(00022) creates, and exactly
  // what is_school_admin() refuses. Before 00031 all three inserts below
  // returned "new row violates row-level security policy".
  //
  // The denials matter more than the allowance. An assignment row is what
  // 00003/00006/00007 pivot every class-scoped read on, so a self-assignment
  // policy that is one clause too wide reads a colleague's gradebook.
  log('\nteacher-created classes (00031)')
  const teacherRole = (await one(`SELECT id FROM public.roles WHERE name = 'teacher'`)).id
  const E = (await one(`INSERT INTO auth.users (email) VALUES ('joined@example.com') RETURNING id`)).id
  await c.query(`INSERT INTO public.user_roles (user_id, role_id, school_id) VALUES ($1,$2,$3)`, [E, teacherRole, A.sc])
  await c.query(`INSERT INTO public.profiles (id, school_id) VALUES ($1,$2)
                 ON CONFLICT (id) DO UPDATE SET school_id=EXCLUDED.school_id`, [E, A.sc])
  const lvlA = (await one(`SELECT id FROM public.education_levels WHERE school_id=$1`, [A.sc])).id
  const lvlB = (await one(`SELECT id FROM public.education_levels WHERE school_id=$1`, [B.sc])).id
  const gradeA = (await one(`SELECT id FROM public.grades WHERE education_level_id=$1`, [lvlA])).id
  const gradeB = (await one(`SELECT id FROM public.grades WHERE education_level_id=$1`, [lvlB])).id

  r = await as(c, E, () => rows(c, `INSERT INTO public.grades (education_level_id,name,sort_order)
                                    VALUES ($1,'ថ្នាក់ទី៣',3) RETURNING id`, [lvlA]))
  check('a plain teacher CAN add a missing grade to their own school (ensureGrade)',
    r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)
  r = await as(c, E, () => rows(c, `INSERT INTO public.grades (education_level_id,name,sort_order)
                                    VALUES ($1,'ថ្នាក់ទី៣',3) RETURNING id`, [lvlB]))
  check("...and CANNOT add one to another school's level", !r.ok, r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)
  r = await as(c, E, () => rows(c, `UPDATE public.grades SET name='ថ្នាក់ទីX' WHERE id=$1 RETURNING id`, [gradeA]))
  check('...and still CANNOT rename one (INSERT only; classes.name derives from it)',
    r.ok && r.value.length === 0, r.ok ? `${r.value.length} row(s) updated` : r.error)

  // The whole create flow in one transaction, as createClassAndAssign runs it:
  // class first, then the caller's own homeroom row. `as()` rolls it back.
  r = await as(c, E, async () => {
    const k = (await rows(c, `INSERT INTO public.classes (grade_id,academic_year_id,name)
                              VALUES ($1,$2,'៥អ') RETURNING id, created_by`, [gradeA, A.y]))[0]
    const a = await rows(c, `INSERT INTO public.teacher_assignments
                             (teacher_id,class_id,academic_year_id,is_homeroom,status)
                             VALUES ($1,$2,$3,true,'active') RETURNING id`, [E, k.id, A.y])
    return { k, a }
  })
  check('a plain teacher CAN create a class in their own school', r.ok && !!r.value?.k?.id,
    r.ok ? '' : `${r.code} ${r.error}`)
  check('...RETURNING sees it, via classes_select_creator', r.ok && r.value?.k?.created_by === E,
    r.ok ? `created_by=${r.value?.k?.created_by}` : r.error)
  check('...and CAN make themselves its form master in the same transaction',
    r.ok && r.value?.a?.length === 1, r.ok ? '' : `${r.code} ${r.error}`)

  r = await as(c, E, () => rows(c, `INSERT INTO public.classes (grade_id,academic_year_id,name)
                                    VALUES ($1,$2,'៥អ') RETURNING id`, [gradeB, B.y]))
  check("a teacher CANNOT create a class in a school they do not teach at", !r.ok,
    r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)
  r = await as(c, E, () => rows(c, `INSERT INTO public.classes (grade_id,academic_year_id,name)
                                    VALUES ($1,$2,'៥អ') RETURNING id`, [gradeB, A.y]))
  check("...nor stitch another school's grade onto their own year", !r.ok,
    r.ok ? 'INSERT SUCCEEDED — cross-school hierarchy' : r.code)

  // ★ The escalation test. A.k is a real class with a real roster and real
  // marks, created by an administrator (created_by NULL). Self-assignment must
  // not reach it — 00006/00007 would hand over A's pupils and marks.
  r = await as(c, E, () => rows(c, `INSERT INTO public.teacher_assignments
      (teacher_id,class_id,academic_year_id,is_homeroom,status)
      VALUES ($1,$2,$3,true,'active') RETURNING id`, [E, A.k, A.y]))
  check("a teacher CANNOT self-assign onto a class they did not create", !r.ok,
    r.ok ? 'INSERT SUCCEEDED — reads a colleague gradebook' : r.code)

  // A committed class of E's, for the tests that need one to already exist.
  const kE = (await one(`INSERT INTO public.classes (grade_id,academic_year_id,name,created_by)
                         VALUES ($1,$2,'៥ឯ',$3) RETURNING id`, [gradeA, A.y, E])).id
  r = await as(c, E, () => rows(c, `INSERT INTO public.teacher_assignments
      (teacher_id,class_id,academic_year_id,is_homeroom,status)
      VALUES ($1,$2,$3,true,'active') RETURNING id`, [D, kE, A.y]))
  check('...nor staff anybody but themselves onto their own class', !r.ok,
    r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)
  r = await as(c, B.t, () => rows(c, `INSERT INTO public.teacher_assignments
      (teacher_id,class_id,academic_year_id,is_homeroom,status)
      VALUES ($1,$2,$3,true,'active') RETURNING id`, [B.t, kE, A.y]))
  check("...and an outsider CANNOT claim the class E created", !r.ok,
    r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)
  r = await as(c, E, () => rows(c, `INSERT INTO public.teacher_assignments
      (teacher_id,class_id,academic_year_id,is_homeroom,status)
      VALUES ($1,$2,$3,true,'active') RETURNING id`, [E, kE, B.y]))
  check("...and the assignment cannot name a year the class is not in", !r.ok,
    r.ok ? 'INSERT SUCCEEDED — cross-school year' : r.code)

  // ★ The self-declaration test. `profiles_insert_own` / `profiles_update_own`
  // (00002) let ANY signed-in user set their own profiles.school_id to any
  // school id they can name, so is_school_teacher() must not read that column:
  // an outsider who stamps their profile with school A must still be refused.
  const F = (await one(`INSERT INTO auth.users (email) VALUES ('stranger@example.com') RETURNING id`)).id
  await c.query(`INSERT INTO public.profiles (id, school_id) VALUES ($1,$2)
                 ON CONFLICT (id) DO UPDATE SET school_id=EXCLUDED.school_id`, [F, A.sc])
  r = await as(c, F, () => rows(c, `INSERT INTO public.classes (grade_id,academic_year_id,name)
                                    VALUES ($1,$2,'៥ស') RETURNING id`, [gradeA, A.y]))
  check('a stranger who self-stamps profiles.school_id STILL cannot create a class', !r.ok,
    r.ok ? 'INSERT SUCCEEDED — membership was taken from a self-writable column' : r.code)
  r = await as(c, F, () => rows(c, `INSERT INTO public.grades (education_level_id,name,sort_order)
                                    VALUES ($1,'ថ្នាក់ទី៤',4) RETURNING id`, [lvlA]))
  check('...nor a grade', !r.ok, r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)

  // Creating a class does not become administering one.
  r = await as(c, E, () => rows(c, `UPDATE public.classes SET name='hacked' WHERE id=$1 RETURNING id`, [kE]))
  check('the creator still CANNOT rename their class — that stays administrator-only',
    r.ok && r.value.length === 0, r.ok ? `${r.value.length} row(s) updated` : r.error)

  // The undo rollbackClass depends on, and the line it stops at.
  r = await as(c, E, () => rows(c, `DELETE FROM public.classes WHERE id=$1 RETURNING id`, [kE]))
  check('the creator CAN delete it while it is still empty (rollbackClass)',
    r.ok && r.value.length === 1, r.ok ? `${r.value?.length} row(s) deleted` : `${r.code} ${r.error}`)
  await c.query(`INSERT INTO public.student_enrollments (student_id,class_id,academic_year_id,status)
                 VALUES ($1,$2,$3,'active')`, [A.st, kE, A.y])
  r = await as(c, E, () => rows(c, `DELETE FROM public.classes WHERE id=$1 RETURNING id`, [kE]))
  check('...and CANNOT once a pupil is enrolled — from then on it is archived, never deleted',
    r.ok && r.value.length === 0, r.ok ? `${r.value.length} row(s) deleted` : r.error)

  // --------------------------- teacher-side transfer (00003's own policy) ----
  // `student_enrollments_write_assigned_or_admin` grants FOR ALL to the
  // HOMEROOM teacher of the row's class. The teacher-facing transfer on
  // /students/[id] adds no policy and no migration — it exercises this one.
  //
  // What must hold: a form master may close an enrolment in their class and
  // open one in another class they are form master of, and may do NEITHER for
  // a class they only teach a subject in, or do not teach at all.
  log('\nteacher-side transfer (00003 homeroom branch)')

  // A's own second class, and a class A only holds a SUBJECT row on.
  const gradeAT = (await one(`SELECT g.id FROM public.grades g
                                JOIN public.education_levels el ON el.id = g.education_level_id
                               WHERE el.school_id = $1 LIMIT 1`, [A.sc])).id
  const kA3 = (await one(`INSERT INTO public.classes (grade_id,academic_year_id,name)
                          VALUES ($1,$2,'៥គ') RETURNING id`, [gradeAT, A.y])).id
  await c.query(`INSERT INTO public.teacher_assignments (teacher_id,class_id,academic_year_id,is_homeroom,status)
                 VALUES ($1,$2,$3,true,'active')`, [A.t, kA3, A.y])

  const kSubjectOnly = (await one(`INSERT INTO public.classes (grade_id,academic_year_id,name)
                                   VALUES ($1,$2,'៥ឃ') RETURNING id`, [gradeAT, A.y])).id
  await c.query(`INSERT INTO public.teacher_assignments (teacher_id,class_id,academic_year_id,is_homeroom,status,subject_key)
                 VALUES ($1,$2,$3,false,'active','math_general')`, [A.t, kSubjectOnly, A.y])

  const enrolOf = async (student, cls) => (await one(
    `SELECT id FROM public.student_enrollments WHERE student_id=$1 AND class_id=$2 AND status='active'`,
    [student, cls])).id
  const openRow = await enrolOf(A.st, A.k)

  r = await as(c, A.t, () => rows(c, `UPDATE public.student_enrollments
      SET status='transferred', left_at=now() WHERE id=$1 RETURNING id`, [openRow]))
  check('a form master CAN close an enrolment in their own class',
    r.ok && r.value.length === 1, r.ok ? `${r.value.length} row(s)` : `${r.code} ${r.error}`)

  r = await as(c, A.t, () => rows(c, `INSERT INTO public.student_enrollments
      (student_id,class_id,academic_year_id,status) VALUES ($1,$2,$3,'active') RETURNING id`,
      [A.st, kA3, A.y]))
  check('...and open one in another class they are form master of',
    r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)

  /*
   * E, not A: by this point A holds the `owner` role in their own school (the
   * join-request section grants it), so the admin branch of the policy would
   * carry them and the homeroom requirement would never be exercised. E holds
   * exactly `teacher`.
   */
  await c.query(`INSERT INTO public.teacher_assignments (teacher_id,class_id,academic_year_id,is_homeroom,status,subject_key)
                 VALUES ($1,$2,$3,false,'active','math_general')
                 ON CONFLICT DO NOTHING`, [E, kSubjectOnly, A.y])
  r = await as(c, E, () => rows(c, `INSERT INTO public.student_enrollments
      (student_id,class_id,academic_year_id,status) VALUES ($1,$2,$3,'active') RETURNING id`,
      [A.st, kSubjectOnly, A.y]))
  check('a SUBJECT teacher of a class CANNOT enrol into it  ← homeroom, not merely assigned',
    !r.ok || r.value.length === 0, r.ok ? `${r.value.length} row(s) inserted` : r.code)

  r = await as(c, B.t, () => rows(c, `UPDATE public.student_enrollments
      SET status='transferred' WHERE id=$1 RETURNING id`, [openRow]))
  check("a teacher in another school CANNOT close A's pupil's enrolment",
    r.ok && r.value.length === 0, r.ok ? `${r.value.length} row(s) updated` : r.error)

  /*
   * ★ THE HOLE 00033 CLOSES.
   *
   * B is form master of B.k, which satisfied 00003's class-only predicate — and
   * nothing in it mentioned `student_id`. So B could enrol ANY pupil whose id
   * they could name into their own class, and 00006/00007 would then hand them
   * that pupil's roster row, marks and attendance. The same shape 00011 closed
   * for `scores`, one table further on.
   */
  r = await as(c, B.t, () => rows(c, `INSERT INTO public.student_enrollments
      (student_id,class_id,academic_year_id,status) VALUES ($1,$2,$3,'active') RETURNING id`,
      [A.st, B.k, B.y]))
  check("...nor pull them into their own class  ← 00033", !r.ok || r.value.length === 0,
    r.ok ? 'INSERT SUCCEEDED — a pupil could be taken across schools' : r.code)

  // And the allowance 00033 must not have broken: enrolling a pupil you own.
  const ownPupil = (await one(`INSERT INTO public.students (teacher_id,student_id,grade,name_kh,gender,dob)
                           VALUES ($1,'S-NEW','ថ្នាក់ទី៥','សិស្សថ្មី','ស្រី','2015-02-02') RETURNING id`, [A.t])).id
  r = await as(c, A.t, () => rows(c, `INSERT INTO public.student_enrollments
      (student_id,class_id,academic_year_id,status) VALUES ($1,$2,$3,'active') RETURNING id`,
      [ownPupil, A.k, A.y]))
  check('a teacher CAN enrol a pupil they own (createStudent\'s own write)',
    r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)

  r = await as(c, D, () => rows(c, `INSERT INTO public.student_enrollments
      (student_id,class_id,academic_year_id,status) VALUES ($1,$2,$3,'active') RETURNING id`,
      [A.st, A.k, A.y]))
  check('a colleague who is not form master CANNOT enrol into the shared class',
    !r.ok || r.value.length === 0, r.ok ? `${r.value.length} row(s) inserted` : r.code)

  // ------------------------------------- homework class scope (00032) -------
  // Before 00032 `homework_assignments` had no class at all: the parent-side
  // policy matched `is_teacher_of_my_child(teacher_id)`, so an assignment
  // written for ៥ក was readable by the parents of EVERY class the teacher
  // taught. The column made "this class" expressible; these checks prove the
  // three things that claim rests on.
  //
  //   1. a NULL class still reaches the teacher's whole audience — nothing
  //      written before the migration loses a reader;
  //   2. a stamped class reaches that class's parents and no others;
  //   3. the stamp cannot be forged, because it is an ADDRESS: a write that
  //      widens a read is the shape 00031 was careful about, and this table
  //      has the same hazard.
  log('\nhomework class scope (00032)')

  // A second class of A's, with its own pupil — the class the parent's child is
  // NOT in. Without it "the parent sees their class's homework" is vacuous.
  const gradeA2 = (await one(`SELECT g.id FROM public.grades g
                                JOIN public.education_levels el ON el.id = g.education_level_id
                               WHERE el.school_id = $1 LIMIT 1`, [A.sc])).id
  const kA2 = (await one(`INSERT INTO public.classes (grade_id,academic_year_id,name)
                          VALUES ($1,$2,'៦ក') RETURNING id`, [gradeA2, A.y])).id
  await c.query(`INSERT INTO public.teacher_assignments (teacher_id,class_id,academic_year_id,is_homeroom,status)
                 VALUES ($1,$2,$3,true,'active')`, [A.t, kA2, A.y])

  // A parent of A's pupil, who sits in A.k and not in kA2.
  const P = (await one(`INSERT INTO auth.users (email) VALUES ('parent@example.com') RETURNING id`)).id
  await c.query(`INSERT INTO public.parent_students (parent_id, student_id, relationship, is_primary)
                 VALUES ($1,$2,'mother',true)`, [P, A.st])

  const hw = async (classId) => (await one(
    `INSERT INTO public.homework_assignments (teacher_id,class_id,subject,title,due_date)
     VALUES ($1,$2,'math_general',$3,'2026-01-15') RETURNING id`,
    [A.t, classId, classId ? 'stamped' : 'legacy'])).id
  const hwNull = await hw(null)
  const hwOwn = await hw(A.k)
  const hwOther = await hw(kA2)

  // --- reading, as the parent ------------------------------------------------
  r = await as(c, P, () => rows(c, `SELECT id FROM public.homework_assignments WHERE id=$1`, [hwNull]))
  check('a parent still sees pre-00032 homework (NULL class keeps its reach)',
    r.ok && r.value.length === 1, r.ok ? `${r.value.length} row(s)` : r.error)
  r = await as(c, P, () => rows(c, `SELECT id FROM public.homework_assignments WHERE id=$1`, [hwOwn]))
  check("...and homework stamped with their own child's class",
    r.ok && r.value.length === 1, r.ok ? `${r.value.length} row(s)` : r.error)
  r = await as(c, P, () => rows(c, `SELECT id FROM public.homework_assignments WHERE id=$1`, [hwOther]))
  check("...but NOT the same teacher's homework for another class  ← the fix",
    r.ok && r.value.length === 0, r.ok ? `${r.value.length} row(s)` : r.error)

  // --- reading, across schools ----------------------------------------------
  r = await as(c, A.t, () => rows(c, `SELECT id FROM public.homework_assignments WHERE teacher_id=$1`, [A.t]))
  check('the author still sees all of their own, whatever the class',
    r.ok && r.value.length === 3, `${r.value?.length} row(s)`)
  r = await as(c, B.t, () => rows(c, `SELECT id FROM public.homework_assignments WHERE teacher_id=$1`, [A.t]))
  check("a teacher in another school sees none of A's", r.ok && r.value.length === 0,
    `${r.value?.length} row(s)`)
  r = await as(c, null, () => rows(c, `SELECT id FROM public.homework_assignments`))
  check('anon sees none', (r.ok && r.value.length === 0) || !r.ok,
    r.ok ? `${r.value.length} row(s)` : r.error)

  // --- writing: the class is an address, not a label -------------------------
  r = await as(c, A.t, () => rows(c, `INSERT INTO public.homework_assignments (teacher_id,class_id,subject,title,due_date)
      VALUES ($1,$2,'math_general','own class','2026-02-01') RETURNING id`, [A.t, A.k]))
  check('A CAN publish into a class they actually teach',
    r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)
  r = await as(c, A.t, () => rows(c, `INSERT INTO public.homework_assignments (teacher_id,class_id,subject,title,due_date)
      VALUES ($1,$2,'math_general','forged','2026-02-01') RETURNING id`, [A.t, B.k]))
  check("A CANNOT stamp another school's class  ← a forged class_id would widen the audience",
    !r.ok, r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)
  r = await as(c, A.t, () => rows(c, `INSERT INTO public.homework_assignments (teacher_id,class_id,subject,title,due_date)
      VALUES ($1,NULL,'math_general','legacy','2026-02-01') RETURNING id`, [A.t]))
  check('...and CAN still publish without a class (the pre-V2 path)',
    r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)
  r = await as(c, A.t, () => rows(c, `UPDATE public.homework_assignments SET class_id=$1 WHERE id=$2 RETURNING id`,
      [B.k, hwOwn]))
  check('...nor re-address an existing row to a class they do not teach',
    !r.ok || r.value.length === 0, r.ok ? `${r.value.length} row(s) updated` : r.code)
  r = await as(c, B.t, () => rows(c, `INSERT INTO public.homework_assignments (teacher_id,class_id,subject,title,due_date)
      VALUES ($1,$2,'math_general','impersonation','2026-02-01') RETURNING id`, [A.t, A.k]))
  check("a teacher CANNOT publish homework owned by somebody else", !r.ok,
    r.ok ? 'INSERT SUCCEEDED — policy too wide' : r.code)

  // ------------------------------ attendance status domain (00034) ----------
  // RLS was never the issue here, which is why this sits at the end rather than
  // among the policy sweeps. `attendance.status` was TEXT with no CHECK, so a
  // teacher writing to THEIR OWN row — a write every policy is right to allow —
  // could store any string at all. Demonstrated through PostgREST before 00034:
  //
  //     PATCH /rest/v1/attendance?…  { "status": "late123" }  -> 200, updated
  //
  // and /students/[id] then printed `late123` verbatim as that pupil's mark.
  // The application guard (`isEnterableStatus`) covers the two server actions;
  // this covers a client that never calls them.
  log('\nattendance status domain (00034)')

  const att = async (status) => as(c, A.t, () => rows(c,
    `INSERT INTO public.attendance (teacher_id,student_id,date,status)
     VALUES ($1,$2,$3,$4) RETURNING id`, [A.t, A.st, '2026-03-0' + (attDay++), status]))
  let attDay = 1

  r = await att('P')
  check('a teacher CAN record a declared mark on their own pupil',
    r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)
  r = await att('L')
  check('...ច្បាប់ too', r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)
  r = await att('AP')
  check('...and the legacy spelling stays writable  ← historical rows must not become unwritable',
    r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)
  r = await att('late123')
  check('a teacher CANNOT store a mark this product does not define  ← the fix',
    !r.ok && r.code === '23514', r.ok ? 'INSERT SUCCEEDED — column unconstrained' : r.code)
  r = await att('')
  check('...nor an empty one', !r.ok && r.code === '23514',
    r.ok ? 'INSERT SUCCEEDED' : r.code)
  // Seeded OUTSIDE `as()`, which always rolls back — an UPDATE inside it would
  // otherwise match the zero rows its own INSERT left behind and prove nothing.
  const attRow = (await one(
    `INSERT INTO public.attendance (teacher_id,student_id,date,status)
     VALUES ($1,$2,'2026-04-01','P') RETURNING id`, [A.t, A.st])).id
  r = await as(c, A.t, () => rows(c,
    `UPDATE public.attendance SET status='T' WHERE id=$1 RETURNING id`, [attRow]))
  check('...nor rewrite an existing mark to one', !r.ok && r.code === '23514',
    r.ok ? `UPDATE SUCCEEDED (${r.value.length} row(s))` : r.code)
  r = await as(c, A.t, () => rows(c,
    `UPDATE public.attendance SET status='A' WHERE id=$1 RETURNING id`, [attRow]))
  check('...while a real correction still goes through',
    r.ok && r.value.length === 1, r.ok ? '' : `${r.code} ${r.error}`)

  await c.end()
  const a1 = await conn('postgres'); await a1.query(`DROP DATABASE IF EXISTS ${DB} WITH (FORCE)`); await a1.end()

  const bad = out.filter(x => !x.pass)
  log(`\n================== ${out.length - bad.length}/${out.length} behavioural checks passed ==================`)
  bad.forEach(b => log(`  FAIL  ${b.name}`))
  process.exit(bad.length ? 1 : 0)
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2) })

/* ---------------------------------------------------------------------------
 * WHAT THIS PASS DOES NOT COVER
 *
 * 1. auth.users is a structural stand-in. GoTrue's own columns (email
 *    confirmation, banned_until, MFA factors) do not exist here, so a policy
 *    keyed on any of them would be untested. None currently is — but a future
 *    one would pass here for the wrong reason.
 * 2. Only `authenticated` and `anon` are exercised, plus one `owner` role for
 *    the positive control. `service_role` bypasses RLS by design and is not
 *    swept; nor are principal/school_admin beyond that single case.
 * 3. This is the database, not the API. PostgREST sits above it and decides
 *    column exposure, embedded-resource joins and RPC argument coercion. A
 *    policy correct here can still leak through a badly shaped view or an
 *    over-broad `select=*,related(*)`.
 * 4. Denial is proven for a teacher in a DIFFERENT school and allowance for a
 *    colleague on the SAME class. The middle case — same school, different
 *    class, no shared assignment — is not swept per table.
 * 5. Nothing here tests concurrency: two teachers writing the same score row
 *    at once is governed by scores_owner_period_uniq, not by RLS.
 * ------------------------------------------------------------------------- */
