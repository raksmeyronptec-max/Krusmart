/**
 * Document templates — the official file a report is printed onto.
 *
 * NOT the score template, and the distinction is the one §4 insists on because
 * conflating them is how a curriculum change silently reformats a ministry
 * document:
 *
 *     score template     which SUBJECTS a class assesses
 *                        -> score_template_subjects, lib/scores/template.ts
 *     document template  which FILE the results are printed onto
 *                        -> this module
 *
 * A class changing from three subjects to four changes the score template and
 * changes nothing here: the document template describes a layout with a
 * *variable* subject region, which the generator expands to fit.
 *
 * WHERE THE FILES LIVE
 * In the repository, under `lib/reporting/templates/`, and resolved through
 * `TEMPLATE_REGISTRY` below. That was a deliberate choice over a storage bucket
 * for the first phase: a template is code-shaped, not user data — it changes
 * with a deploy, it must be reviewable in a diff, and every environment must
 * have the same one. A bucket would add an upload screen, a policy surface and
 * a way for staging and production to disagree about what a ministry document
 * looks like, none of which buys anything until schools start supplying their
 * own files. The registry's shape is the same one a `report_document_templates`
 * row would have, so moving to a bucket later is a resolver change, not a
 * redesign.
 *
 * Pure and free of server-only imports: the Print Center lists versions in the
 * browser, and only `loadTemplateFile` (server-only, separate module) touches
 * the filesystem.
 */

import type { ReportFormat, ReportType } from './report-types.ts'

/**
 * One version of one report's document template.
 *
 * `id` and `version` are recorded on every generated document (§7/§24) so a
 * file can be traced back to the exact layout that produced it — which is the
 * whole reason versions are values rather than "whatever is on disk today".
 */
export interface DocumentTemplate {
  /** Stable id, recorded in generation metadata. `${reportType}_v${version}`. */
  id: string
  reportType: ReportType
  version: number
  /** Khmer label for the version picker, when a report has more than one. */
  label: string
  format: ReportFormat
  /** Path under `lib/reporting/templates/`, resolved server-side. */
  file: string
  /** Which curriculum this layout is for. Primary only for now (§1). */
  educationLevel: 'primary'
  /** Grades this layout suits; empty means every grade of the level. */
  grades: number[]
  /** Newer versions supersede older ones; exactly one active per report. */
  isActive: boolean
  /**
   * Where the layout came from — the honest provenance §5 needs.
   *
   * `derived` means it was generated from a screen this product already ships
   * (see `scripts/build-report-templates.mts`), so it reproduces output that
   * has been in use, but it is NOT a transcription of a ministry file. An
   * `official` template is one a school or the ministry supplied. The Print
   * Center says which, because a teacher submitting paperwork upward needs to
   * know whether the layout is authoritative.
   */
  provenance: 'derived' | 'official'
  notes?: string
}

/**
 * Every document template the build ships.
 *
 * One entry per version. Superseding a layout means adding a row with
 * `isActive: true` and flipping the old one to `false` — never editing a
 * shipped version in place, because a document generated last term must stay
 * reproducible from the version it recorded.
 */
export const TEMPLATE_REGISTRY: DocumentTemplate[] = [
  {
    id: 'score_monthly_v1',
    reportType: 'score_monthly',
    version: 1,
    label: 'ទម្រង់ក្រសួង (v1)',
    format: 'xlsx',
    file: 'score_monthly_v1.xlsx',
    educationLevel: 'primary',
    grades: [],
    isActive: true,
    provenance: 'derived',
    notes:
      'បង្កើតចេញពីទម្រង់ដែល /score/print បង្ហាញរួចហើយ — មិនមែនចម្លងផ្ទាល់ពីឯកសារក្រសួងទេ។',
  },
]

/** Templates available for a report, newest first. */
export function templatesFor(reportType: ReportType): DocumentTemplate[] {
  return TEMPLATE_REGISTRY
    .filter((t) => t.reportType === reportType)
    .sort((a, b) => b.version - a.version)
}

/** The version a new generation should use unless the teacher picks another. */
export function activeTemplate(reportType: ReportType): DocumentTemplate | undefined {
  return templatesFor(reportType).find((t) => t.isActive)
}

/** Look one up by the id recorded in generation metadata. */
export function templateById(id: string): DocumentTemplate | undefined {
  return TEMPLATE_REGISTRY.find((t) => t.id === id)
}

/**
 * Does this report generate through the engine, or only through its legacy
 * screen?
 *
 * A report with no template cannot be generated however complete its resolver
 * is, so the Print Center asks this before offering a Generate button.
 */
export function hasTemplate(reportType: ReportType): boolean {
  return TEMPLATE_REGISTRY.some((t) => t.reportType === reportType && t.isActive)
}

// --------------------------------------------------------------- metadata

/**
 * What is recorded about a generated document (§7/§24).
 *
 * Returned to the caller and written to the audit log. Enough to reproduce the
 * file: the same inputs plus the same template version must yield the same
 * document, which is why the template id is part of it rather than "the active
 * one at the time".
 */
export interface GenerationMetadata {
  reportType: ReportType
  templateId: string
  templateVersion: number
  classId: string | null
  academicYear: string
  /** `nov`, `sem1`, or the year itself — whatever the report's period is. */
  period: string
  generatedBy: string
  generatedAt: string
  fileName: string
  format: ReportFormat
  /** Rows written, so an empty document is visible in the audit trail. */
  rowCount: number
}
