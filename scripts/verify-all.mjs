/**
 * Runs the verification harnesses as one suite.
 *
 *     node scripts/verify-all.mjs          # the offline suite
 *     node scripts/verify-all.mjs --live   # ...plus the ones needing a local stack
 *
 * There are ~30 `verify-*.mts` harnesses in this directory and they are the
 * closest thing this repository has to a test suite — CLAUDE.md cites them as
 * the thing that pins each invariant. Until this runner existed nothing invoked
 * them: each had to be remembered and run by hand, one `node scripts/…` at a
 * time, so in practice a change was merged against `npm run lint` alone.
 *
 * The `*-live.mts` harnesses are opt-in on purpose. They need a running local
 * Supabase stack plus the fixtures in `supabase/fixtures/`, so they cannot be a
 * precondition for `npm run verify` on a laptop or in a bare CI job — but they
 * are the only ones exercising a real JWT and RLS, so they must stay reachable
 * rather than being quietly dropped from the set.
 *
 * Harnesses are independent (each reads source files and asserts on them), so
 * they run concurrently; the cap keeps ~30 node processes from thrashing a
 * laptop. Output is buffered per harness and printed only on failure, because a
 * green suite that prints 27 banners trains you to stop reading it.
 */
import { readdirSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const CONCURRENCY = 8

const live = process.argv.includes('--live')

const harnesses = readdirSync(HERE)
  .filter((f) => f.startsWith('verify-') && f.endsWith('.mts'))
  .filter((f) => live || !f.endsWith('-live.mts'))
  .sort()

if (harnesses.length === 0) {
  console.error('No verify-*.mts harnesses found in scripts/.')
  process.exit(1)
}

/** Runs one harness, capturing its output so a passing run stays silent. */
function run(file) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn(process.execPath, [join(HERE, file)], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = ''
    child.stdout.on('data', (d) => { output += d })
    child.stderr.on('data', (d) => { output += d })
    child.on('close', (code) => {
      resolve({ file, ok: code === 0, output, ms: Date.now() - started })
    })
  })
}

const results = []
let next = 0

async function worker() {
  while (next < harnesses.length) {
    const file = harnesses[next++]
    const result = await run(file)
    results.push(result)
    process.stdout.write(result.ok ? '.' : 'F')
  }
}

const startedAll = Date.now()
await Promise.all(Array.from({ length: Math.min(CONCURRENCY, harnesses.length) }, worker))
process.stdout.write('\n')

const failed = results.filter((r) => !r.ok).sort((a, b) => a.file.localeCompare(b.file))

for (const r of failed) {
  console.error(`\n${'='.repeat(72)}\nFAIL  ${r.file}\n${'='.repeat(72)}`)
  console.error(r.output.trimEnd())
}

const seconds = ((Date.now() - startedAll) / 1000).toFixed(1)
const slowest = [...results].sort((a, b) => b.ms - a.ms)[0]

console.log(
  `\n${results.length - failed.length}/${results.length} harnesses passed in ${seconds}s` +
    `${live ? ' (including --live)' : ''}` +
    `${slowest ? `  ·  slowest: ${slowest.file} (${(slowest.ms / 1000).toFixed(1)}s)` : ''}`,
)

if (failed.length > 0) {
  console.error(`\nFailed: ${failed.map((r) => r.file).join(', ')}`)
  process.exit(1)
}
