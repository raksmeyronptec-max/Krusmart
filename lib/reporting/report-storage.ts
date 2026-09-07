import 'server-only'

import { readFile } from 'node:fs/promises'
import { basename, join, resolve } from 'node:path'

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
 * because nothing it supplies becomes part of the path; the traversal check
 * below is belt-and-braces against a bad registry edit, not against a user.
 */

const TEMPLATE_DIR = join(process.cwd(), 'lib', 'reporting', 'templates')

/** Load a template's bytes by the id recorded in generation metadata. */
export async function loadTemplateFile(
  templateId: string,
): Promise<{ template: DocumentTemplate; buffer: Buffer } | { error: string }> {
  const template = templateById(templateId)
  if (!template) return { error: 'រកមិនឃើញទម្រង់ឯកសារនេះទេ' }

  // A registry entry may specify a relative path within TEMPLATE_DIR (e.g. 'scores/...'),
  // but must never escape TEMPLATE_DIR.
  const targetPath = resolve(TEMPLATE_DIR, template.file)
  if (template.file.includes('..') || !targetPath.startsWith(TEMPLATE_DIR)) {
    return { error: 'ទម្រង់ឯកសារនេះមានផ្លូវមិនត្រឹមត្រូវ' }
  }

  try {
    const buffer = await readFile(targetPath)
    return { template, buffer }
  } catch {
    // Fallback: check flat root in case template exists at root of TEMPLATE_DIR
    try {
      const fallbackPath = resolve(TEMPLATE_DIR, basename(template.file))
      const buffer = await readFile(fallbackPath)
      return { template, buffer }
    } catch {
      // A template listed but not built — `npm run build:templates` was skipped.
      return { error: 'ឯកសារទម្រង់មិនមាននៅលើម៉ាស៊ីនមេទេ' }
    }
  }
}
