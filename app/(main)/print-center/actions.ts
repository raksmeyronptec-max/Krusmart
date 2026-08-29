'use server'

import { createClient } from '@/lib/supabase/server'
import { requirePermission } from '@/lib/rbac/server'
import { auditLog } from '@/lib/audit/log'
import { logger } from '@/lib/utils/logger'
import { getErrorMessage } from '@/lib/utils/errors'

import { resolveReport, type ReportRequest } from '@/lib/reporting/report-data'
import { downloadFileName, loadTemplateFile } from '@/lib/reporting/report-storage'
import { activeTemplate, templateById } from '@/lib/reporting/report-template'
import { fillXlsxTemplate } from '@/lib/reporting/xlsx-writer'
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
 * Data counts for the pre-generation preview (§15).
 *
 * Separate from generating so a teacher can confirm they are about to print the
 * right class and period before a document is built — "32 students, 3 subjects,
 * average 8.24" is the check that catches the wrong month before it reaches
 * paper, not after.
 */
export async function previewReport(
  request: ReportRequest,
): Promise<{ error?: string; summary?: {
  studentCount: number; subjectCount: number; average: number | null
  periodLabel: string; className: string
} }> {
  if (!isReportType(request.reportType)) return { error: 'របាយការណ៍មិនត្រឹមត្រូវ' }

  try {
    await requirePermission('scores:view')
  } catch (e) {
    return { error: getErrorMessage(e) }
  }

  const resolved = await resolveReport(request)
  if ('error' in resolved) return { error: resolved.error }
  return { summary: resolved.summary }
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
    request.reportType,
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
