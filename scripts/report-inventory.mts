/**
 * The document inventory — what the Print Center can actually produce, today.
 *
 *     npx tsx scripts/report-inventory.mts
 *     npx tsx scripts/report-inventory.mts --json
 *
 * ── Why this exists ───────────────────────────────────────────────────────
 *
 * "Is this report ready?" has four different answers in this codebase and they
 * are easy to conflate: a `ReportType` exists, a resolver exists, a document
 * template exists, a working screen exists. A route in `lib/navigation.ts` is
 * not a document. A `resolver: true` is not a printable file. The Print Center
 * already refuses to conflate them — `reportAvailability` is the single place
 * that decides what a row may claim — but that answer is only visible one row
 * at a time, in a browser, by a teacher.
 *
 * This prints the whole table at once, for a developer deciding what to build
 * next. It DERIVES everything from the canonical catalogue and the template
 * registry; it stores no list of its own, so it cannot drift from what the
 * product actually offers, and a report added to `REPORT_DEFINITIONS` appears
 * here without anybody remembering to add it.
 *
 * ── The six states ────────────────────────────────────────────────────────
 *
 *   READY             a resolver AND an active template. Generates a file.
 *   LEGACY_OPEN       no resolver, but a working screen. Opens that screen.
 *   PENDING_TEMPLATE  a resolver, nothing to print it onto. Never generates.
 *   PENDING_RESOLVER  a template, but no resolver to fill it. Never generates.
 *   MISSING           named as a planned document, with nothing behind it yet.
 *   NOT_APPLICABLE    a printable screen deliberately excluded from the index.
 *
 * The first four are `ReportStatus` renamed for a reader — the mapping is one
 * line and is asserted by `verify-reporting.mts`, so this file introduces no
 * second availability model. `MISSING` and `NOT_APPLICABLE` are the two the
 * catalogue cannot express, because their subjects are not in it.
 */

import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  PLANNED_DOCUMENT_GROUPS,
  QUICK_ACTION_REPORTS,
  REPORT_CATEGORIES,
  REPORT_DEFINITIONS,
  reportPriority,
  sectionForCategory,
  type ReportDefinition,
} from '../lib/reporting/report-types.ts'
import { activeTemplate, reportAvailability, templatesFor } from '../lib/reporting/report-template.ts'

const root = fileURLToPath(new URL('../', import.meta.url))
const MAIN = join(root, 'app', '(main)')

export type InventoryState =
  | 'READY'
  | 'LEGACY_OPEN'
  | 'PENDING_TEMPLATE'
  | 'PENDING_RESOLVER'
  | 'MISSING'
  | 'NOT_APPLICABLE'

/**
 * The catalogue's four availability states, named for a developer reading a
 * roadmap rather than for a teacher reading a badge.
 *
 * `PENDING_RESOLVER` cannot arise from `reportAvailability` alone — a template
 * with no resolver still reports `legacy_only` or `not_implemented`, because
 * availability is asked about what the TEACHER can do. It is separated here
 * because "the layout is drawn, the data is not wired" is a different piece of
 * work from "nothing exists", and a roadmap that cannot say so is useless.
 */
export function inventoryState(definition: ReportDefinition): InventoryState {
  const status = reportAvailability(definition).status
  if (status === 'engine_ready') return 'READY'
  if (status === 'needs_template') return 'PENDING_TEMPLATE'
  if (activeTemplate(definition.type) && !definition.resolver) return 'PENDING_RESOLVER'
  if (status === 'legacy_only') return 'LEGACY_OPEN'
  return 'MISSING'
}

export interface InventoryRow {
  type: string
  label: string
  section: string
  category: string
  period: string
  legacyHref: string | null
  legacyExists: boolean | null
  resolver: boolean
  templateId: string | null
  templateVersions: number
  /** What ONE press of the row's button produces. Never a list of maybes. */
  output: string
  state: InventoryState
  /** What the teacher's button says, from the one place allowed to decide. */
  action: string
  priority: 0 | 1 | 2
  quickAction: boolean
}

const routeExists = (href: string) =>
  existsSync(join(MAIN, href.replace(/^\//, ''), 'page.tsx'))

export function inventory(): InventoryRow[] {
  return REPORT_DEFINITIONS.map((definition) => {
    const availability = reportAvailability(definition)
    const template = activeTemplate(definition.type)
    return {
      type: definition.type,
      label: definition.label,
      section: sectionForCategory(definition.category)?.id ?? '—',
      category: definition.category,
      period: definition.period,
      legacyHref: definition.legacyHref,
      legacyExists: definition.legacyHref ? routeExists(definition.legacyHref) : null,
      resolver: definition.resolver,
      templateId: template?.id ?? null,
      templateVersions: templatesFor(definition.type).length,
      // The row advertises one route, so the inventory reports one route.
      output:
        availability.action === 'generate' && template
          ? template.format
          : availability.action === 'open'
            ? 'screen'
            : '—',
      state: inventoryState(definition),
      action: availability.action,
      priority: reportPriority(definition.type),
      quickAction: QUICK_ACTION_REPORTS.some((q) => q.type === definition.type),
    }
  })
}

/**
 * Printable screens that exist and are deliberately NOT in the catalogue.
 *
 * Read out of `verify-students.mts` rather than restated, because that file is
 * where the product judgement is recorded and a second copy of it here would be
 * the drift this whole architecture avoids.
 */
function notApplicable(): { route: string; why: string }[] {
  const src = readFileSync(join(root, 'scripts', 'verify-students.mts'), 'utf8')
  const block = src.slice(src.indexOf('const NOT_DOCUMENTS'), src.indexOf('const printable'))
  return [...block.matchAll(/'([^']+)':\s*'([^']+)'/g)].map((m) => ({ route: m[1], why: m[2] }))
}

/** Every screen in the teacher app that calls `window.print()`. */
function printableScreens(): string[] {
  const walk = (dir: string): string[] =>
    readdirSync(dir).flatMap((entry) => {
      const full = join(dir, entry)
      return statSync(full).isDirectory() ? walk(full) : [full]
    })
  return [
    ...new Set(
      walk(MAIN)
        .filter((f) => readFileSync(f, 'utf8').includes('window.print()'))
        .map((f) => {
          const rel = relative(MAIN, f).replace(/\\/g, '/')
          const dir = rel.slice(0, rel.lastIndexOf('/'))
          return (
            '/' +
            dir.split('/').filter((s) => s && !s.startsWith('[') && !s.startsWith('(')).join('/')
          )
        }),
    ),
  ].sort()
}

// ---------------------------------------------------------------------------

const rows = inventory()
const json = process.argv.includes('--json')

if (json) {
  console.log(
    JSON.stringify(
      {
        rows,
        missing: PLANNED_DOCUMENT_GROUPS.flatMap((g) =>
          g.documents.map((d) => ({ group: g.label, document: d, state: 'MISSING' as const })),
        ),
        notApplicable: notApplicable(),
      },
      null,
      2,
    ),
  )
} else {
  const pad = (s: string, n: number) => (s + ' '.repeat(n)).slice(0, n)
  const ORDER: InventoryState[] = [
    'READY', 'LEGACY_OPEN', 'PENDING_TEMPLATE', 'PENDING_RESOLVER', 'MISSING', 'NOT_APPLICABLE',
  ]

  console.log('\nPRINT CENTER — DOCUMENT INVENTORY')
  console.log('derived from REPORT_DEFINITIONS + TEMPLATE_REGISTRY; nothing here is a second list\n')

  for (const state of ORDER) {
    const group = rows.filter((r) => r.state === state)

    if (state === 'MISSING') {
      const planned = PLANNED_DOCUMENT_GROUPS.flatMap((g) =>
        g.documents.map((d) => `${g.label} · ${d}`),
      )
      console.log(`\n■ MISSING (${group.length + planned.length})`)
      console.log('  named as planned documents; no ReportType, no screen, no template')
      for (const p of planned) console.log(`    ${p}`)
      for (const r of group) console.log(`    ${pad(r.type, 30)} ${r.label}`)
      continue
    }

    if (state === 'NOT_APPLICABLE') {
      const excluded = notApplicable()
      console.log(`\n■ NOT_APPLICABLE (${excluded.length})`)
      console.log('  printable screens deliberately outside the index (verify-students.mts)')
      for (const e of excluded) console.log(`    ${pad(e.route, 30)} ${e.why}`)
      continue
    }

    console.log(`\n■ ${state} (${group.length})`)
    for (const r of group) {
      const flags = [
        r.quickAction ? 'quick' : '',
        r.priority === 0 ? 'P0' : r.priority === 2 ? 'P2' : '',
        r.legacyHref && r.legacyExists === false ? '!! MISSING ROUTE' : '',
      ].filter(Boolean).join(' ')
      console.log(
        `    ${pad(r.type, 30)} ${pad(r.section, 11)} ${pad(r.period, 9)} ` +
        `${pad(r.output, 7)} ${pad(r.templateId ?? (r.legacyHref ?? '—'), 30)} ${flags}`,
      )
    }
  }

  // A screen that prints and is neither catalogued nor excused is a document
  // nobody can find from the index — the exact gap the Print Center exists for.
  const catalogued = new Set(rows.map((r) => r.legacyHref).filter(Boolean))
  const excused = new Set(notApplicable().map((e) => e.route))
  const orphans = printableScreens().filter((s) => !catalogued.has(s) && !excused.has(s))
  console.log(`\n■ UNCATALOGUED PRINTABLE SCREENS (${orphans.length})`)
  for (const o of orphans) console.log(`    ${o}`)

  /*
   * MISSING and NOT_APPLICABLE are counted from their own sources, not from
   * `rows` — their subjects are by definition not in the catalogue, so counting
   * catalogued rows for them always printed a confident zero.
   */
  const plannedCount = PLANNED_DOCUMENT_GROUPS.reduce((n, g) => n + g.documents.length, 0)
  const counts = [
    ...ORDER.slice(0, 4).map((s) => `${s} ${rows.filter((r) => r.state === s).length}`),
    `MISSING ${plannedCount}`,
    `NOT_APPLICABLE ${notApplicable().length}`,
  ]
  console.log(`\n${REPORT_DEFINITIONS.length} catalogued · ${counts.join(' · ')}`)
  console.log(`${REPORT_CATEGORIES.length} categories · ${QUICK_ACTION_REPORTS.length} quick actions\n`)
}
