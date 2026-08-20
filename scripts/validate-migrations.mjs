/**
 * Executes the pending migrations against a real PostgreSQL and checks that the
 * deployment runbook tells the truth.
 *
 * ---------------------------------------------------------------------------
 * THERE ARE TWO MIGRATION TOOLS IN THIS REPO. THEY DO NOT OVERLAP.
 *
 *   scripts/verify-migrations.mts   STATIC. Parses the .sql files and proves
 *     structural properties without a database: every statement is guarded so a
 *     second run is a no-op, every ON CONFLICT list matches a real unique index,
 *     every SECURITY DEFINER function pins search_path. Runs in milliseconds,
 *     needs nothing installed, and is the one to run on every edit.
 *
 *   scripts/validate-migrations.mjs (this file)   EXECUTION. Applies the
 *     migrations to a live local Postgres and checks what actually happens:
 *     that the SQL runs at all, that the runbook's preflight and verification
 *     queries return the right answers before and after, and that the rollbacks
 *     restore the previous state. Needs Docker and `supabase start`.
 *
 * Keep both. The static checker cannot catch a rollback that aborts halfway;
 * this one cannot run in CI without a database. Each has found defects the
 * other missed — the static checker flagged idx_score_template_subjects_level
 * as un-dropped when the column drop covers it (false positive this one
 * disproved), and this one found 00022's rollback leaving my_join_requests()
 * behind and 00023's rollback aborting on a placeholder (both invisible
 * statically).
 * ---------------------------------------------------------------------------
 *
 * FIDELITY. Test databases are built inside the running Supabase Postgres, so
 * the roles (anon/authenticated/service_role), the RLS engine and the Postgres
 * version are the real ones. `auth.uid()` is copied verbatim out of the running
 * instance rather than reimplemented. `auth.users` is a STRUCTURAL STAND-IN
 * carrying only the columns the migrations reference — they only FK to `id`, so
 * the gap is real but bounded. Anything depending on GoTrue's own columns is
 * out of scope here.
 *
 * FIXTURES MATTER. Two of the eight tests are meaningless on an empty database:
 * 00023 only acts on education_levels that exist, and the recovery audit only
 * flags an account that has a homeroom assignment, an orphan and a later score.
 * Both fixtures are built below. An early version of this harness lacked them
 * and reported three failures that were its own fault.
 *
 * Usage:
 *   supabase start
 *   node scripts/validate-migrations.mjs
 *
 * Requires the `pg` package. It is deliberately not a dependency of the app —
 * install it anywhere on NODE_PATH, or set PG_MODULE to its entry point.
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const PG = process.env.PG_MODULE || 'pg'
let Client
try { ({ Client } = (await import(PG)).default ?? await import(PG)) }
catch {
  console.error(`Cannot load the "pg" client (tried: ${PG}).\n` +
    `Install it, or point PG_MODULE at it:\n` +
    `  mkdir -p /tmp/pgc && cd /tmp/pgc && npm init -y && npm i pg\n` +
    `  PG_MODULE=/tmp/pgc/node_modules/pg/lib/index.js node scripts/validate-migrations.mjs`)
  process.exit(2)
}

const REPO = new URL('..', import.meta.url).pathname
const MIG = join(REPO, 'supabase/migrations')
const ADMIN = { host: '127.0.0.1', port: 54322, user: 'postgres', password: 'postgres', database: 'postgres' }
const V2 = [18, 19, 20, 21, 22, 23, 24, 25, 26]

const log = (...a) => console.log(...a)
const results = []
const record = (n, name, pass, note = '') => { results.push({ n, name, pass, note }); log(`  => TEST ${n} ${pass ? 'PASS' : 'FAIL'}${note ? ' — ' + note : ''}\n`) }
const errOf = (e) => ({ message: e.message, code: e.code, detail: e.detail, hint: e.hint })

const files = () => readdirSync(MIG).filter(f => /^\d{5}_.*\.sql$/.test(f)).sort()
const fileFor = (n) => files().find(f => f.startsWith(String(n).padStart(5, '0') + '_'))
const readMig = (f) => readFileSync(join(MIG, f), 'utf8')
const upTo17 = () => files().filter(f => parseInt(f.slice(0, 5), 10) <= 17)
const pending = () => V2.map(fileFor)

/** Split SQL into statements, respecting dollar-quotes, literals and comments. */
export function splitStatements(sql) {
  const out = []; let buf = ''
  let i = 0, inS = false, inLine = false, inBlock = false, tag = null
  while (i < sql.length) {
    const c = sql[i], two = sql.slice(i, i + 2)
    if (inLine) { buf += c; if (c === '\n') inLine = false; i++; continue }
    if (inBlock) { buf += c; if (two === '*/') { buf += sql[i + 1]; i += 2; inBlock = false; continue } i++; continue }
    if (tag) { if (sql.startsWith(tag, i)) { buf += tag; i += tag.length; tag = null; continue } buf += c; i++; continue }
    if (inS) { if (c === "'") { if (sql[i + 1] === "'") { buf += "''"; i += 2; continue } inS = false } buf += c; i++; continue }
    if (two === '--') { inLine = true; buf += two; i += 2; continue }
    if (two === '/*') { inBlock = true; buf += two; i += 2; continue }
    if (c === "'") { inS = true; buf += c; i++; continue }
    const dm = sql.slice(i).match(/^\$[A-Za-z_]*\$/)
    if (dm) { tag = dm[0]; buf += tag; i += tag.length; continue }
    if (c === ';') { const t = buf.trim(); if (t) out.push(t); buf = ''; i++; continue }
    buf += c; i++
  }
  const t = buf.trim(); if (t) out.push(t)
  return out.filter(s => s.replace(/--[^\n]*/g, '').trim().length > 0)
}

const connect = async (database) => { const c = new Client({ ...ADMIN, database }); await c.connect(); return c }
const createDb = async (n) => { const a = await connect('postgres'); await a.query(`DROP DATABASE IF EXISTS ${n} WITH (FORCE)`); await a.query(`CREATE DATABASE ${n}`); await a.end() }
const dropDb = async (n) => { const a = await connect('postgres'); await a.query(`DROP DATABASE IF EXISTS ${n} WITH (FORCE)`).catch(() => {}); await a.end() }

async function realAuthUid() {
  const c = await connect('postgres')
  const r = await c.query(`SELECT prosrc FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                           WHERE n.nspname='auth' AND p.proname='uid'`)
  await c.end()
  if (!r.rows.length) throw new Error('auth.uid() not found — is `supabase start` running?')
  return r.rows[0].prosrc
}

async function bootstrap(c, uidBody) {
  await c.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`)
  await c.query(`CREATE SCHEMA IF NOT EXISTS auth`)
  await c.query(`CREATE TABLE IF NOT EXISTS auth.users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(), email text,
      raw_user_meta_data jsonb DEFAULT '{}'::jsonb, created_at timestamptz DEFAULT now())`)
  await c.query(`CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $fn$ ${uidBody} $fn$`)
  await c.query(`CREATE OR REPLACE FUNCTION auth.role() RETURNS text LANGUAGE sql STABLE AS $fn$
      select coalesce(nullif(current_setting('request.jwt.claims', true)::jsonb->>'role',''),'authenticated') $fn$`)
  for (const r of ['anon', 'authenticated', 'service_role'])
    await c.query(`DO $do$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='${r}') THEN CREATE ROLE ${r} NOLOGIN; END IF; END $do$`)
  await c.query(`GRANT USAGE ON SCHEMA public, auth TO anon, authenticated, service_role`)
  await c.query(`GRANT SELECT ON auth.users TO authenticated, service_role`)
}

async function applyFile(c, f) {
  for (const s of splitStatements(readMig(f))) {
    try { await c.query(s) }
    catch (e) { try { await c.query('ROLLBACK') } catch {} ; return { ok: false, file: f, error: errOf(e), statement: s } }
  }
  return { ok: true, file: f }
}
async function applyMany(c, fs) {
  const bad = []
  for (const f of fs) { const r = await applyFile(c, f); if (!r.ok) bad.push(r) }
  return bad
}
const showBad = (bad) => bad.forEach(b => {
  log(`     ${b.file}`)
  log(`       ${b.error.message}${b.error.code ? `  [SQLSTATE ${b.error.code}]` : ''}`)
  if (b.error.detail) log(`       detail: ${b.error.detail}`)
  log(`       statement: ${b.statement.slice(0, 240).replace(/\s+/g, ' ')}`)
})

async function snapshot(c) {
  const q = async (s) => { try { return (await c.query(s)).rows } catch { return [] } }
  return {
    columns: await q(`SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY 1,2`),
    indexes: await q(`SELECT indexname,indexdef FROM pg_indexes WHERE schemaname='public' ORDER BY 1`),
    policies: await q(`SELECT tablename,policyname,cmd,qual,with_check FROM pg_policies WHERE schemaname='public' ORDER BY 1,2`),
    functions: await q(`SELECT p.proname,p.prosecdef,array_to_string(p.proconfig,',') cfg,md5(p.prosrc) src FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' ORDER BY 1,4`),
    constraints: await q(`SELECT conrelid::regclass::text tbl,conname,pg_get_constraintdef(oid) def FROM pg_constraint WHERE connamespace='public'::regnamespace ORDER BY 1,2`),
    template: await q(`SELECT scope,level_key,grade_number,track,subject_key,max_score FROM public.score_template_subjects ORDER BY subject_key,track NULLS FIRST`),
    schemes: await q(`SELECT education_level_id,name,is_default,config->>'maxScore' mx,config->>'weighting' w FROM public.grading_schemes ORDER BY name,education_level_id`),
  }
}
function diff(a, b) {
  const d = []
  for (const k of Object.keys(a)) if (JSON.stringify(a[k]) !== JSON.stringify(b[k]))
    d.push({ key: k, onlyAfter: b[k].filter(x => !a[k].some(y => JSON.stringify(y) === JSON.stringify(x))).slice(0, 6),
             onlyBefore: a[k].filter(x => !b[k].some(y => JSON.stringify(y) === JSON.stringify(x))).slice(0, 6) })
  return d
}

/** The ```sql blocks under a bold marker in the runbook, per migration. */
function runbookQueries(marker) {
  const md = readFileSync(join(REPO, 'docs/deploy-00018-00024.md'), 'utf8')
  const out = {}
  for (const sec of md.split(/\n## /).slice(1)) {
    const m = sec.match(/^(000\d\d)/); if (!m) continue
    const i = sec.indexOf(`**${marker}**`); if (i < 0) continue
    const rest = sec.slice(i)
    const stop = rest.search(/\n\*\*(Apply|Rollback|Still safe|Note|What)\b/)
    const blocks = [...(stop > 0 ? rest.slice(0, stop) : rest).matchAll(/```sql\n([\s\S]*?)```/g)].map(x => x[1].trim())
    if (blocks.length) out[m[1]] = blocks
  }
  return out
}

/** A migration's executable rollback, lifted out of its own comment block. */
function extractRollback(file) {
  const lines = readMig(file).split('\n')
  const idx = lines.map((l, k) => /^--\s*ROLLBACK\s*$/.test(l) ? k : -1).filter(k => k >= 0)
  if (!idx.length) return { kind: 'none' }
  let i = idx[idx.length - 1] + 1
  if (/^--\s*={10,}\s*$/.test(lines[i] || '')) i++
  const body = []
  for (; i < lines.length && !/^--\s*={10,}\s*$/.test(lines[i]); i++) body.push(lines[i].replace(/^--\s?/, ''))
  const t = body.map(l => l.trim())
  const b = t.indexOf('BEGIN;'), e = t.lastIndexOf('COMMIT;')
  const sql = (b >= 0 && e > b ? body.slice(b, e + 1) : body).join('\n')
  const KW = /^\s*(BEGIN|COMMIT|CREATE|DROP|ALTER|UPDATE|DELETE|INSERT|NOTIFY|GRANT|REVOKE)\b/i
  return sql.split('\n').some(l => KW.test(l)) ? { kind: 'sql', sql } : { kind: 'pointer' }
}
/** 00019's rollback is a pointer: re-apply 00018's function definition. */
function rollback00019() {
  const src = readMig(fileFor(18))
  const i = src.indexOf('CREATE OR REPLACE FUNCTION'), j = src.indexOf('$$;', i)
  return src.slice(i, j + 3)
}
/** 00026's rollback step 2 is a pointer: re-run 00021's INSERT block verbatim. */
function rollback00026() {
  const step1 = extractRollback(fileFor(26))
  const src = readMig(fileFor(21))
  const i = src.indexOf('INSERT INTO public.score_template_subjects')
  const j = src.indexOf('DO NOTHING;', i)
  return step1.sql + '\n' + src.slice(i, j + 'DO NOTHING;'.length)
}

/** A school with the three national levels, each on the 00009 default scheme. */
async function seedLevels(c) {
  const school = (await c.query(`INSERT INTO public.schools (name) VALUES ('សាលាសាកល្បង') RETURNING id`)).rows[0].id
  for (const n of ['បឋមសិក្សា', 'មធ្យមសិក្សាបឋមភូមិ', 'មធ្យមសិក្សាទុតិយភូមិ']) {
    const lv = (await c.query(`INSERT INTO public.education_levels (school_id,name) VALUES ($1,$2) RETURNING id`, [school, n])).rows[0].id
    await c.query(`INSERT INTO public.grading_schemes (school_id,education_level_id,name,is_default,config)
      VALUES ($1,$2,$3,true,jsonb_build_object('maxScore',10,'passMark',5,'bands',jsonb_build_array()))`,
      [school, lv, 'ការវាយតម្លៃស្តង់ដារ · ' + n])
  }
  return school
}

let UID
const main = async () => {
  const c0 = await connect('postgres')
  log('LOCAL POSTGRES: ' + (await c0.query('SELECT version()')).rows[0].version)
  await c0.end()
  UID = await realAuthUid()
  log('auth.uid() copied verbatim from the running instance (not a stub)\n')

  // ---- 1 -----------------------------------------------------------------
  log('===== TEST 1 : apply 00001–00026 in order =====')
  await createDb('v_all'); const c1 = await connect('v_all'); await bootstrap(c1, UID)
  const bad1 = await applyMany(c1, files())
  showBad(bad1); await c1.end()
  record(1, 'Apply 00001–00026 in order', bad1.length === 0, `${bad1.length}/${files().length} files failed`)

  // ---- 2 -----------------------------------------------------------------
  log('===== TEST 2 : apply 00018–00024 twice =====')
  await createDb('v_twice'); const c2 = await connect('v_twice'); await bootstrap(c2, UID)
  await applyMany(c2, upTo17()); await seedLevels(c2)
  const p1 = await applyMany(c2, pending()); const sA = await snapshot(c2)
  const p2 = await applyMany(c2, pending()); const sB = await snapshot(c2)
  const d2 = diff(sA, sB)
  if (p1.length) { log('   first pass:'); showBad(p1) }
  if (p2.length) { log('   SECOND pass:'); showBad(p2) }
  if (d2.length) log('   second pass changed: ' + JSON.stringify(d2).slice(0, 1200))
  await c2.end()
  record(2, 'Apply 00018–00026 twice → second pass is a no-op',
    p1.length === 0 && p2.length === 0 && d2.length === 0,
    `errors ${p1.length}/${p2.length}, differences ${d2.length}`)

  // ---- 3,4,5,6 -----------------------------------------------------------
  await createDb('v_run'); const c = await connect('v_run'); await bootstrap(c, UID)
  await applyMany(c, upTo17()); await seedLevels(c)
  const snap17 = await snapshot(c)
  const pre = runbookQueries('Preflight'), ver = runbookQueries('Verify')
  const run = async (s) => { try { return { ok: true, txt: JSON.stringify((await c.query(s)).rows) } } catch (e) { try { await c.query('ROLLBACK') } catch {} ; return { ok: false, txt: 'ERROR: ' + e.message } } }

  log('===== TEST 3 : preflights on a DB at 00017 (expect "not applied") =====')
  let t3 = true
  for (const [m, bs] of Object.entries(pre)) for (const b of bs) {
    const r = await run(b); const good = r.ok && (/absent|apply it|00018 only|not been applied/i.test(r.txt) || r.txt === '[]')
    if (!good) t3 = false; log(`     ${m}: ${good ? 'ok   ' : 'WRONG'} ${r.txt.slice(0, 110)}`)
  }
  record(3, 'Preflights at 00017 report "not applied"', t3)

  const before = {}
  for (const [m, bs] of Object.entries(ver)) before[m] = await Promise.all(bs.map(run))
  const badPend = await applyMany(c, pending())
  if (badPend.length) { log('   applying pending failed:'); showBad(badPend) }

  log('===== TEST 4 : preflights after applying (expect "applied") =====')
  let t4 = true
  for (const [m, bs] of Object.entries(pre)) for (const b of bs) {
    const r = await run(b); const good = r.ok && /present|skip|00019 applied/i.test(r.txt)
    if (!good) t4 = false; log(`     ${m}: ${good ? 'ok   ' : 'WRONG'} ${r.txt.slice(0, 110)}`)
  }
  record(4, 'Preflights after applying report "applied"', t4)

  log('===== TEST 5 : verification queries (pass after, differ before) =====')
  let t5 = true
  for (const [m, bs] of Object.entries(ver)) {
    const after = await Promise.all(bs.map(run))
    after.forEach((a, i) => {
      const b = before[m][i], changed = b.txt !== a.txt
      if (!a.ok || !changed) t5 = false
      log(`     ${m}: after=${a.ok ? 'ok' : 'ERROR'} ${changed ? 'differs before' : '*** IDENTICAL ***'}`)
      log(`        before ${b.txt.slice(0, 100)}`); log(`        after  ${a.txt.slice(0, 100)}`)
    })
  }
  record(5, 'Verification queries pass after, differ before', t5)

  log('===== TEST 6 : roll back 00024 → 00018 in reverse =====')
  const rbErr = []
  for (const n of [...V2].reverse()) {
    const rb = n === 19 ? { kind: 'sql', sql: rollback00019() }
      : n === 26 ? { kind: 'sql', sql: rollback00026() }
      : extractRollback(fileFor(n))
    if (rb.kind !== 'sql') { rbErr.push({ n, note: 'pointer rollback, nothing executable' }); continue }
    for (const s of splitStatements(rb.sql)) {
      try { await c.query(s) } catch (e) { try { await c.query('ROLLBACK') } catch {} ; rbErr.push({ n, msg: e.message, s: s.slice(0, 170).replace(/\s+/g, ' ') }) }
    }
  }
  const back = diff(snap17, await snapshot(c))
  rbErr.forEach(e => log(`     000${e.n}: ${e.note || e.msg}${e.s ? '\n            ' + e.s : ''}`))
  if (back.length) log('     residue: ' + JSON.stringify(back, null, 1).slice(0, 1500))
  await c.end()
  record(6, 'Rollbacks return the database to the 00017 state',
    rbErr.length === 0 && back.length === 0, `${rbErr.length} errors, ${back.length} residual differences`)

  // ---- 7,8 ---------------------------------------------------------------
  await createDb('v_audit'); const ca = await connect('v_audit'); await bootstrap(ca, UID)
  await applyMany(ca, files())
  const auditStmts = splitStatements(readFileSync(join(REPO, 'supabase/audits/audit_recovery_safety.sql'), 'utf8'))
  const counts = async () => { const o = {}; for (const t of ['students', 'student_enrollments', 'classes', 'teacher_assignments', 'scores']) { try { o[t] = (await ca.query(`SELECT count(*)::int n FROM public.${t}`)).rows[0].n } catch { o[t] = null } } return o }

  log('===== TEST 7 : recovery audit on a fresh database =====')
  const b7 = await counts(); const rows7 = [], e7 = []
  for (const s of auditStmts) { try { const r = await ca.query(s); if (r.rows) rows7.push(...r.rows) } catch (e) { try { await ca.query('ROLLBACK') } catch {} ; e7.push(e.message) } }
  const a7 = await counts()
  const wrote7 = JSON.stringify(b7) !== JSON.stringify(a7)
  const zeros = rows7.every(r => Object.entries(r).every(([k, v]) => ['section', 'signal'].includes(k) || v === null || v === 0 || v === '0'))
  e7.forEach(m => log('     ERROR: ' + m))
  log(`     statements ${auditStmts.length}, errors ${e7.length}, wrote data ${wrote7}, all zero ${zeros}`)
  record(7, 'Recovery audit runs, returns zeros, writes nothing', e7.length === 0 && !wrote7 && zeros)

  log('===== TEST 8 : recovery audit with a planted orphan =====')
  const one = async (q, p) => (await ca.query(q, p)).rows[0]
  const teacher = (await one(`INSERT INTO auth.users (email) VALUES ('at-risk@example.com') RETURNING id`)).id
  const control = (await one(`INSERT INTO auth.users (email) VALUES ('control@example.com') RETURNING id`)).id
  const school = (await one(`INSERT INTO public.schools (name) VALUES ('សាលាសាកល្បង') RETURNING id`)).id
  const year = (await one(`INSERT INTO public.academic_years (school_id,name) VALUES ($1,'2025-2026') RETURNING id`, [school])).id
  const level = (await one(`INSERT INTO public.education_levels (school_id,name) VALUES ($1,'បឋមសិក្សា') RETURNING id`, [school])).id
  const grade = (await one(`INSERT INTO public.grades (education_level_id,name) VALUES ($1,'ថ្នាក់ទី៥') RETURNING id`, [level])).id
  const klass = (await one(`INSERT INTO public.classes (grade_id,academic_year_id,name) VALUES ($1,$2,'៥ក') RETURNING id`, [grade, year])).id
  await ca.query(`INSERT INTO public.teacher_assignments (teacher_id,class_id,academic_year_id,is_homeroom,status,created_at)
                  VALUES ($1,$2,$3,true,'active', now() - interval '10 days')`, [teacher, klass, year])
  const mk = async (tid, code, nm) => (await one(`INSERT INTO public.students (teacher_id,student_id,grade,name_kh,gender,dob)
      VALUES ($1,$2,'ថ្នាក់ទី៥',$3,'ប្រុស','2014-01-01') RETURNING id`, [tid, code, nm])).id
  const orphan = await mk(teacher, 'S-ORPHAN', 'សិស្សកំព្រា')
  const enrolled = await mk(teacher, 'S-ENROLLED', 'សិស្សមានឈ្មោះ')
  await ca.query(`INSERT INTO public.student_enrollments (student_id,class_id,academic_year_id,status) VALUES ($1,$2,$3,'active')`, [enrolled, klass, year])
  await ca.query(`INSERT INTO public.scores (teacher_id,student_id,subject,score_period,score_type,score_value,created_at)
                  VALUES ($1,$2,'kh_read','11-2025-2026','monthly',8, now())`, [teacher, enrolled])
  await mk(control, 'S-CONTROL', 'សិស្សផ្សេង')   // orphan but no post-assignment score → must not be flagged

  const b8 = await counts(); const rows8 = [], e8 = []
  for (const s of auditStmts) { try { const r = await ca.query(s); if (r.rows) rows8.push(...r.rows) } catch (e) { try { await ca.query('ROLLBACK') } catch {} ; e8.push(e.message) } }
  const a8 = await counts()
  const blob = JSON.stringify(rows8)
  rows8.forEach(r => log('     ' + JSON.stringify(r)))
  e8.forEach(m => log('     ERROR: ' + m))
  const namesRisk = blob.includes(teacher), namesControl = blob.includes(control)
  log(`     planted orphan ${orphan} under teacher ${teacher}`)
  log(`     names the at-risk teacher ${namesRisk} | names the control teacher ${namesControl} (must be false)`)
  record(8, 'Recovery audit finds exactly the planted orphan',
    e8.length === 0 && JSON.stringify(b8) === JSON.stringify(a8) && namesRisk && !namesControl)
  await ca.end()

  for (const d of ['v_all', 'v_twice', 'v_run', 'v_audit']) await dropDb(d)
  log('================== SUMMARY ==================')
  results.forEach(r => log(`  ${r.pass ? 'PASS' : 'FAIL'}  test ${r.n} — ${r.name}`))
  const ok = results.filter(r => r.pass).length
  log(`\n  ${ok}/${results.length} passed`)
  process.exit(ok === results.length ? 0 : 1)
}
main().catch(e => { console.error('HARNESS ERROR:', e); process.exit(2) })
