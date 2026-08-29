import 'server-only'

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'

import { templateById, type DocumentTemplate } from './report-template'

/**
 * Reading a document template off disk.
 *
 * The `server-only` guard lives here rather than on the writers, and the
 * distinction is deliberate: the writers are pure Buffer-to-Buffer transforms
 * with nothing privileged about them, while this module reads the filesystem.
 * Guarding by capability rather than by file size is also what lets the writers
 * be tested under plain Node.
 *
 * PATH SAFETY. `file` never comes from a request — it is read from
 * `TEMPLATE_REGISTRY`, a compile-time constant, and the id is looked up in that
 * registry first. A caller cannot reach outside `lib/reporting/templates/`
 * because nothing it supplies becomes part of the path; the basename check
 * below is belt-and-braces against a bad registry edit, not against a user.
 */

const TEMPLATE_DIR = join(process.cwd(), 'lib', 'reporting', 'templates')

/** Load a template's bytes by the id recorded in generation metadata. */
export async function loadTemplateFile(
  templateId: string,
): Promise<{ template: DocumentTemplate; buffer: Buffer } | { error: string }> {
  const template = templateById(templateId)
  if (!template) return { error: 'រកមិនឃើញទម្រង់ឯកសារនេះទេ' }

  // A registry entry must name a plain file, never a path.
  if (template.file.includes('/') || template.file.includes('..')) {
    return { error: 'ទម្រង់ឯកសារនេះមានផ្លូវមិនត្រឹមត្រូវ' }
  }

  try {
    const buffer = await readFile(join(TEMPLATE_DIR, template.file))
    return { template, buffer }
  } catch {
    // A template listed but not built — `npm run build:templates` was skipped.
    return { error: 'ឯកសារទម្រង់មិនមាននៅលើម៉ាស៊ីនមេទេ' }
  }
}

/**
 * The filename a teacher downloads.
 *
 * Khmer class names reach the filesystem intact — every browser this app
 * targets handles UTF-8 filenames — but separators and quotes are stripped
 * because they would break the `Content-Disposition` header the download rides
 * on.
 */
export function downloadFileName(
  reportType: string,
  className: string,
  period: string,
  extension: string,
): string {
  const safe = (s: string) => s.replace(/[/\\"'\r\n]+/g, '').trim() || '—'
  return `${safe(reportType)}_${safe(className)}_${safe(period)}.${extension}`
}
