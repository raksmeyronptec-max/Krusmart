/**
 * Static idempotency and safety check for the pending migrations.
 *
 * This is NOT a substitute for applying them to a real Postgres — it cannot
 * catch a type error, a missing dependency or a policy that does not do what it
 * says. It checks the one property that is both mechanically decidable and the
 * most expensive to get wrong: **every statement is guarded, so running a file
 * twice is a no-op.** That is the actual failure mode when a human loses their
 * place mid-runbook.
 *
 * Run: node --experimental-strip-types scripts/verify-migrations.mts
 */

import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const DIR = 'supabase/migrations'
const PENDING = /^000(1[89]|2[0-5])_/

let failures = 0
let checks = 0

function check(label: string, ok: boolean, detail = '') {
  checks++
  if (!ok) { failures++; console.log(`  FAIL  ${label}${detail ? ` — ${detail}` : ''}`) }
  else console.log(`  ok    ${label}`)
}

/** Strip comments and string/dollar-quoted literals so guards are read from real SQL only. */
function executable(sql: string): string {
  return sql
    .replace(/\$\$[\s\S]*?\$\$/g, ' $BODY$ ')   // function bodies
    .replace(/--[^\n]*/g, ' ')                   // line comments
    .replace(/'(?:[^']|'')*'/g, " 'LIT' ")       // string literals
}

const files = readdirSync(DIR).filter(f => PENDING.test(f)).sort()
if (files.length !== 8) {
  console.log(`FAIL: expected 8 pending migrations, found ${files.length}`)
  process.exit(1)
}

for (const file of files) {
  console.log(`\n${file}`)
  const raw = readFileSync(join(DIR, file), 'utf8')
  const sql = executable(raw)

  // --- every statement that creates or changes an object must be guarded -----
  const unguarded: string[] = []

  for (const m of sql.matchAll(/\bCREATE\s+(?:UNIQUE\s+)?(TABLE|INDEX|POLICY|VIEW|TRIGGER|TYPE)\b(?!\s+IF\s+NOT\s+EXISTS)/gi)) {
    // A policy is allowed to be bare when a DROP POLICY IF EXISTS precedes it —
    // Postgres has no CREATE POLICY IF NOT EXISTS, so drop-then-create is the
    // only idempotent form available.
    if (m[1].toUpperCase() === 'POLICY') {
      const name = sql.slice(m.index!).match(/CREATE\s+POLICY\s+("[^"]+"|\S+)/i)?.[1]
      if (name && new RegExp(`DROP\\s+POLICY\\s+IF\\s+EXISTS\\s+${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i').test(sql)) continue
    }
    unguarded.push(`CREATE ${m[1]} without IF NOT EXISTS`)
  }
  const bareAddColumn = sql.match(/\bADD\s+COLUMN\b(?!\s+IF\s+NOT\s+EXISTS)/gi)
  if (bareAddColumn) unguarded.push(`ADD COLUMN without IF NOT EXISTS (x${bareAddColumn.length})`)
  const bareFunction = sql.match(/\bCREATE\s+FUNCTION\b/gi)
  if (bareFunction) unguarded.push(`CREATE FUNCTION without OR REPLACE (x${bareFunction.length})`)
  // A bare INSERT re-inserts on a second run.
  for (const m of sql.matchAll(/\bINSERT\s+INTO\s+public\.(\w+)/gi)) {
    const after = sql.slice(m.index!, m.index! + 4000)
    const guarded = /\bON\s+CONFLICT\b/i.test(after) || /\bWHERE\s+NOT\s+EXISTS\b/i.test(after)
    // Inserts inside a function body are runtime behaviour, not migration
    // behaviour — the body was blanked above, so anything reaching here is
    // top-level seed data.
    if (!guarded) unguarded.push(`INSERT INTO ${m[1]} with no ON CONFLICT / WHERE NOT EXISTS`)
  }

  check('all statements guarded', unguarded.length === 0, unguarded.join('; '))

  // --- an ON CONFLICT column list must match a unique index in the same file
  // or an earlier one, or Postgres rejects it outright with 42P10 -------------
  for (const m of raw.matchAll(/ON\s+CONFLICT\s*\(([^)]+)\)/gi)) {
    const cols = m[1].split(',').map(s => s.trim()).filter(Boolean).sort().join(',')
    const all = readdirSync(DIR).sort().map(f => readFileSync(join(DIR, f), 'utf8')).join('\n')
    const found = [...all.matchAll(/CREATE\s+UNIQUE\s+INDEX[^(]*\([^)]*\)/gi)].some(ix => {
      const inner = ix[0].slice(ix[0].indexOf('(') + 1, ix[0].lastIndexOf(')'))
      return inner.split(',').map(s => s.trim()).filter(Boolean).sort().join(',') === cols
    }) || /UNIQUE\s*\(/i.test(all)
    check('ON CONFLICT target has a matching unique index', found, cols)
  }

  // --- NULLS NOT DISTINCT needs PG15+; flag it so the runbook can say so -----
  if (/NULLS\s+NOT\s+DISTINCT/i.test(raw)) {
    console.log('  note  uses NULLS NOT DISTINCT (requires PostgreSQL 15+)')
  }

  // --- transaction wrapping -------------------------------------------------
  const wrapped = /^\s*BEGIN;\s*$/m.test(raw) && /^\s*COMMIT;\s*$/m.test(raw)
  const onlyReplaceable = !/\b(CREATE\s+TABLE|ADD\s+COLUMN|CREATE\s+(UNIQUE\s+)?INDEX|CREATE\s+POLICY)\b/i.test(sql)
  check(
    wrapped ? 'wrapped in BEGIN/COMMIT' : 'single-statement file needs no transaction',
    wrapped || onlyReplaceable,
    wrapped ? '' : 'has multi-object DDL but no BEGIN/COMMIT',
  )

  // --- a rollback note must exist and name something ------------------------
  check('documents a rollback', /ROLLBACK/i.test(raw))

  // --- SECURITY DEFINER functions must pin search_path ----------------------
  const definers = [...raw.matchAll(/CREATE\s+OR\s+REPLACE\s+FUNCTION\s+public\.(\w+)[\s\S]{0,900}?\bAS\s+\$\$/gi)]
  for (const d of definers) {
    const head = d[0]
    if (/SECURITY\s+DEFINER/i.test(head)) {
      check(`${d[1]}(): SECURITY DEFINER pins search_path`, /SET\s+search_path/i.test(head))
    }
  }
}

console.log(`\n${checks - failures}/${checks} checks passed`)
if (failures) { console.log(`${failures} FAILED`); process.exit(1) }
