'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac/server'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import { getErrorMessage } from '@/lib/utils/errors'

import {
  resolveCertificateCandidates, resolveReport,
  type CertificateCandidate, type ReportRequest,
} from '@/lib/reporting/report-data'
import { loadTemplateFile } from '@/lib/reporting/report-storage'
import { activeTemplate, downloadFileName, templateById } from '@/lib/reporting/report-template'
import { fillXlsxTemplate } from '@/lib/reporting/xlsx-writer'
import { previewWorkbook, type SheetPreview } from '@/lib/reporting/xlsx-preview'
import { fillDocxTemplate } from '@/lib/reporting/docx-writer'
import { isReportType, reportDefinition } from '@/lib/reporting/report-types'

/**
 * The one endpoint that generates a document.
 *
 * Every report goes through here — that is the point of §29's closing
 * requirement. Adding a report means a definition, a resolver case and a
 * template; it does not mean another export endpoint with its own idea of who
 * may call it.
 *
 * SECURITY (§18). Three checks, in order, before a byte is read:
 *   1. `requirePermission('scores:view')` — the caller may read results at all.
 *   2. `resolveReport` resolves the class through `resolveServerScope`, which
 *      validates any requested class id against the caller's own assignments,
 *      so a forged `classId` cannot widen access. RLS refuses it again at the
 *      database regardless.
 *   3. The report type and template id are matched against compile-time
 *      registries, so neither can name a file the product does not ship.
 */

export interface GenerateResult {
  error?: string
  /** Base64 so the document can cross the server-action boundary. */
  file?: string
  fileName?: string
  mimeType?: string
  meta?: {
    templateId: string
    templateVersion: number
    rowCount: number
    subjectCount: number
    generatedAt: string
  }
}

const MIME: Record<string, string> = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
}

/**
 * How many pupil rows a preview draws.
 *
 * The ONE deliberate inexactness in the preview, and the reason it is a
 * constant rather than a guess: layout is exact — the letterhead, every column,
 * the summary block and the signatures are the real template's — while a
 * fifty-pupil class does not push a thousand styled cells across the action
 * boundary every time the teacher changes the month. Scalars are untouched, so
 * the tallies under the table still describe the whole class. The UI says how
 * many rows it is not showing; a short class shown silently would be worse than
 * no preview at all.
 */
const PREVIEW_ROW_LIMIT = 12

export interface PreviewResult {
  error?: string
  summary?: {
    studentCount: number; subjectCount: number; average: number | null
    periodLabel: string; className: string
    honorCount?: number; criteriaLabel?: string; criteriaProvisional?: boolean
  }
  /** The filled sheet, for spreadsheet reports. */
  preview?: SheetPreview
  /** The template the preview was drawn from, so the UI can name it. */
  templateId?: string
  /**
   * Why there is no sheet. `docx` is a Word report, which has no sheet to draw;
   * `failed` means building one did not work and generation is still offered.
   */
  previewUnavailable?: 'docx' | 'failed'
}

/**
 * The pre-generation preview (§15).
 *
 * Separate from generating so a teacher can confirm they are about to print the
 * right class and period before a document is built — "32 students, 3 subjects,
 * average 8.24" is the check that catches the wrong month before it reaches
 * paper, not after.
 *
 * It also draws the SHEET, because the counts answer "is this the right class?"
 * and nothing else. They cannot answer "is this the right document?" — which is
 * the question the ទម្រង់ឯកសារ selector beside them poses and whose entire
 * consequence is visual. So this fills the chosen template exactly as
 * `generateReport` does and returns it as a drawable model: same resolver, same
 * template file, same writer, so the picture cannot disagree with the download.
 *
 * SECURITY. The same three checks generation makes, in the same order, because
 * this reads a template file off disk on a client-supplied id: the permission,
 * the scope-validated resolve, and — critically — the cross-check that the
 * template belongs to THIS report. A preview with a weaker guard than the
 * download would be the hole.
 *
 * NO AUDIT ENTRY. `report.generated` means a document left the building. A
 * preview is not one, and logging it would make the trail claim documents that
 * were never produced.
 */
export async function previewReport(
  request: ReportRequest,
  templateId?: string,
): Promise<PreviewResult> {
  if (!isReportType(request.reportType)) return { error: 'របាយការណ៍មិនត្រឹមត្រូវ' }

  try {
    await requirePermission('scores:view')
  } catch (e) {
    return { error: getErrorMessage(e) }
  }

  const resolved = await resolveReport(request)
  if ('error' in resolved) return { error: resolved.error }

  const summary = resolved.summary

  const template = templateId ? templateById(templateId) : activeTemplate(request.reportType)
  if (!template || template.reportType !== request.reportType) return { summary }
  if (template.format === 'docx') return { summary, previewUnavailable: 'docx' }

  // A preview that cannot be built must never block the document that can. Every
  // failure below returns the counts and lets the teacher generate anyway.
  try {
    const loaded = await loadTemplateFile(template.id)
    if ('error' in loaded) return { summary, previewUnavailable: 'failed' }

    const omittedRows = Math.max(0, resolved.payload.rows.length - PREVIEW_ROW_LIMIT)
    const buffer = await fillXlsxTemplate(loaded.buffer, {
      ...resolved.payload,
      rows: resolved.payload.rows.slice(0, PREVIEW_ROW_LIMIT),
    })

    return {
      summary,
      preview: await previewWorkbook(buffer, { omittedRows }),
      templateId: template.id,
    }
  } catch (e) {
    logger.error('previewReport:', e)
    return { summary, previewUnavailable: 'failed' }
  }
}

/**
 * The pupils a certificate may be issued to (§10).
 *
 * Separate from `previewReport` because the certificate is the one report whose
 * flow asks *who*, not just *when*. Gated by the same permission and resolved
 * through the same scope, so the list a teacher can pick from is already
 * confined to their own class — the selection they send back is then checked
 * against the roster again in `resolveCertificate`, because a list returned to
 * a browser is a convenience, never an authority.
 */
export async function listCertificateCandidates(
  request: ReportRequest,
): Promise<{ error?: string; className?: string; candidates?: CertificateCandidate[] }> {
  if (!isReportType(request.reportType)) return { error: 'របាយការណ៍មិនត្រឹមត្រូវ' }

  try {
    await requirePermission('scores:view')
  } catch (e) {
    return { error: getErrorMessage(e) }
  }

  const result = await resolveCertificateCandidates(request)
  if ('error' in result) return { error: result.error }
  return result
}

/** Generate a report document and return it for download. */
export async function generateReport(
  request: ReportRequest,
  templateId?: string,
): Promise<GenerateResult> {
  if (!isReportType(request.reportType)) return { error: 'របាយការណ៍មិនត្រឹមត្រូវ' }

  try {
    await requirePermission('scores:view')
  } catch (e) {
    return { error: getErrorMessage(e) }
  }

  const definition = reportDefinition(request.reportType)
  if (!definition) return { error: 'របាយការណ៍មិនត្រឹមត្រូវ' }

  // The requested version, or the active one. Either way it must be a template
  // belonging to THIS report — an id from another report would otherwise print
  // one report's data onto another's layout.
  const template = templateId ? templateById(templateId) : activeTemplate(request.reportType)
  if (!template || template.reportType !== request.reportType) {
    return { error: 'របាយការណ៍នេះមិនទាន់មានទម្រង់ឯកសារទេ' }
  }

  const resolved = await resolveReport(request)
  if ('error' in resolved) return { error: resolved.error }

  const loaded = await loadTemplateFile(template.id)
  if ('error' in loaded) return { error: loaded.error }

  let buffer: Buffer
  try {
    buffer = template.format === 'docx'
      ? await fillDocxTemplate(loaded.buffer, resolved.payload)
      : await fillXlsxTemplate(loaded.buffer, resolved.payload)
  } catch (e) {
    logger.error('generateReport:', e)
    return { error: 'បង្កើតឯកសារមិនបានសម្រេច' }
  }

  const fileName = downloadFileName(
    definition.label,
    resolved.summary.className || 'class',
    request.period,
    template.format,
  )

  // §24: enough to reproduce and audit the document. `audit_logs` has no UPDATE
  // or DELETE policy, so this is an append-only record of what was printed.
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  const generatedAt = new Date().toISOString()

  await auditLog({
    action: 'report.generated',
    entityType: 'report',
    entityId: null,
    newValue: {
      report_type: request.reportType,
      template_id: template.id,
      template_version: template.version,
      academic_year: request.academicYear,
      period: request.period,
      row_count: resolved.payload.rows.length,
      subject_count: resolved.payload.subjects.length,
      file_name: fileName,
    },
    metadata: { class_id: request.classId ?? null, format: template.format },
    actorId: user?.id ?? undefined,
  })

  return {
    file: buffer.toString('base64'),
    fileName,
    mimeType: MIME[template.format] ?? 'application/octet-stream',
    meta: {
      templateId: template.id,
      templateVersion: template.version,
      rowCount: resolved.payload.rows.length,
      subjectCount: resolved.payload.subjects.length,
      generatedAt,
    },
  }
}
