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
