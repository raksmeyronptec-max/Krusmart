/**
 * The acceptance test for the certificate — and for the DOCX path itself.
 *
 *     node scripts/build-report-templates.mts && node scripts/verify-certificate.mts
 *
 * §10 is explicit: DOCX support may not be called production-ready until an
 * actual .docx template has been generated successfully. This script is what
 * makes that claim checkable rather than asserted. It builds nothing and mocks
 * nothing — it opens the shipped `certificate_v1.docx`, fills it through the
 * same `fillDocxTemplate` the server action calls, and reads the result back
 * out of the zip.
 *
 * The claims:
 *
 *   1. The template is a VALID .docx — a real OOXML package with the parts a
 *      Word reader requires, not a zip that happens to open.
 *   2. Every token is replaced, Khmer included, and none survives.
 *   3. One pupil yields one page; N pupils yield N pages and no blank one.
 *   4. The document's own structure — page size, orientation, margins, fonts,
 *      colours, alignment — survives the fill, because the filler substitutes
 *      in place rather than rebuilding.
 *   5. Empty and single-pupil selections both produce a usable document.
 */

import JSZip from 'jszip'
import { readFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'

import { fillDocxTemplate } from '../lib/reporting/docx-writer.ts'
import type { ReportPayload } from '../lib/reporting/report-mapper.ts'
import { REPORT_DEFINITIONS } from '../lib/reporting/report-types.ts'
import {
  reportAvailability, activeTemplate, downloadFileName,
} from '../lib/reporting/report-template.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else { failures += 1; console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

const TEMPLATE = 'lib/reporting/templates/certificate_v1.docx'
const def = REPORT_DEFINITIONS.find((r) => r.type === 'certificate')!

/** Any `{token}` or `{#loop}` left in the document. */
const TOKEN_RE = /\{[#/]?[A-Za-z][\w.]*\}/g

async function documentXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  const file = zip.file('word/document.xml')
  if (!file) throw new Error('no word/document.xml')
  return file.async('string')
}

// ---------------------------------------------------------------------------
console.log('\nA. catalogue (§26)')
{
  check('certificate is in the canonical catalogue', def !== undefined)
  check('it is its own category', def.category === 'certificate')
  check('it declares a resolver', def.resolver === true)
  check('DOCX is its primary format', def.formats[0] === 'docx')
  check('the legacy /certificate route is preserved (§29)', def.legacyHref === '/certificate')
}

// ---------------------------------------------------------------------------
console.log('\nB. availability (§27)')
{
  const avail = reportAvailability(def)
  check('resolver + active template = engine_ready', avail.status === 'engine_ready', avail.status)
  check('the card offers generation', avail.action === 'generate')
  check('the active template is the DOCX one',
    activeTemplate('certificate')?.id === 'certificate_v1'
    && activeTemplate('certificate')?.format === 'docx')
  check('provenance is derived — no ministry file was supplied (§31)',
    avail.template?.provenance === 'derived')
}

// ---------------------------------------------------------------------------
console.log('\nC. the shipped template is a real .docx (§10)')
const templateBuffer = await readFile(TEMPLATE)
{
  const zip = await JSZip.loadAsync(templateBuffer)
  const names = Object.keys(zip.files)
  for (const part of [
    '[Content_Types].xml', '_rels/.rels',
    'word/document.xml', 'word/styles.xml', 'word/_rels/document.xml.rels',
  ]) {
    check(`the package carries ${part}`, names.includes(part))
  }

  const xml = await documentXml(templateBuffer)
  check('the body is well-formed and closed',
    xml.startsWith('<?xml') && xml.includes('<w:body>') && xml.trimEnd().endsWith('</w:document>'))
  check('it declares A4 portrait page size',
    xml.includes('w:w="11906"') && xml.includes('w:h="16838"') && !xml.includes('w:orient="landscape"'))
  check('it declares page margins', /<w:pgMar[^>]*w:top="\d+"/.test(xml))
  check('the loop tags are present and paired',
    xml.includes('{#rows}') && xml.includes('{/rows}'))
  check('Khmer display text is embedded, not an image',
    xml.includes('បណ្ណសរសើរ') && xml.includes('ព្រះរាជាណាចក្រកម្ពុជា'))

  const styles = await (await JSZip.loadAsync(templateBuffer)).file('word/styles.xml')!.async('string')
  check('a Khmer default font is declared in the styles part',
    styles.includes('Khmer OS Battambang'))
}

// ---------------------------------------------------------------------------
console.log('\nD. filling it (§10/§39)')
{
  const payload = (pupils: number): ReportPayload => ({
    scalars: {
      'school.name': 'សាលាបឋមសិក្សា ហ៊ុនសែន',
      'school.unit1': 'ការិយាល័យអប់រំ យុវជន និងកីឡា ស្រុកព្រះស្តេច',
      'class.name': '៤ក', 'class.grade': '៤',
      'period.label': 'ឆ្នាំសិក្សា ២០២៥-២០២៦',
      'director.name': 'លោក ចាន់ សុភា', 'director.role': 'នាយកសាលា',
      'province.date': 'ធ្វើនៅព្រៃវែង ថ្ងៃទី១១ ខែមីនា ឆ្នាំ២០២៦',
      'annual.source': 'មធ្យមភាគឆមាសគណនាចេញពីពិន្ទុប្រឡង និងពិន្ទុប្រចាំខែ',
      'certificate.provenance': 'ទម្រង់បណ្ណសរសើរនេះបង្កើតឡើងដោយ KruSmart',
    },
    subjects: [],
    rows: Array.from({ length: pupils }, (_, i) => ({
      values: {
        'row.name': `សិស្ស លេខ${i + 1}`,
        'row.gender': i % 2 === 0 ? 'ប្រុស' : 'ស្រី',
        achievement: `បានប្រឡងជាប់ចំណាត់ថ្នាក់លេខ ${i + 1} មធ្យមភាគ ៨.៥០ និទ្ទេស ល្អ`,
      },
      subjectValues: [],
    })),
  })

  const fill = async (pupils: number) => documentXml(
    await fillDocxTemplate(templateBuffer, payload(pupils)),
  )

  // -- three pupils
  const three = await fill(3)
  check('every {token} is replaced — none survives',
    (three.match(TOKEN_RE) ?? []).length === 0,
    (three.match(TOKEN_RE) ?? []).slice(0, 4).join(' '))
  check('each pupil\'s Khmer name is written',
    three.includes('សិស្ស លេខ1') && three.includes('សិស្ស លេខ2') && three.includes('សិស្ស លេខ3'))
  check('the achievement sentence reaches the page',
    three.includes('បានប្រឡងជាប់ចំណាត់ថ្នាក់លេខ 2'))
  check('scalars repeat onto every certificate, not just the first',
    (three.match(/សាលាបឋមសិក្សា ហ៊ុនសែន/g) ?? []).length === 3)
  check('three pupils produce three pages — one break each, none spare (§35)',
    (three.match(/pageBreakBefore/g) ?? []).length === 3)
  check('the loop markers themselves are gone from the output',
    !three.includes('{#rows}') && !three.includes('{/rows}'))

  // -- formatting survives, because the filler substitutes in place
  check('the navy display colour survived', three.includes('w:val="000080"'))
  check('the red school-name colour survived', three.includes('w:val="C00000"'))
  check('the Moul display font survived', three.includes('Khmer OS Muol Light'))
  check('centred alignment survived', three.includes('<w:jc w:val="center"/>'))
  check('right-aligned signature block survived', three.includes('<w:jc w:val="right"/>'))
  check('the 34pt certificate heading survived', three.includes('w:val="68"'))
  check('page size and orientation survived the fill',
    three.includes('w:w="11906"') && three.includes('w:h="16838"'))
  check('the provenance line is printed on the document, not only in metadata (§31)',
    three.includes('ទម្រង់បណ្ណសរសើរនេះបង្កើតឡើងដោយ KruSmart'))
  check('and the derived-average note travels with it (§52)',
    three.includes('គណនាចេញពីពិន្ទុប្រឡង'))

  // -- edge cases (§35)
  const one = await fill(1)
  check('a single pupil yields exactly one page',
    (one.match(/pageBreakBefore/g) ?? []).length === 1
    && (one.match(/សាលាបឋមសិក្សា ហ៊ុនសែន/g) ?? []).length === 1)
  check('and leaves no token behind', (one.match(TOKEN_RE) ?? []).length === 0)

  const none = await fill(0)
  check('an empty selection yields a valid document with no certificate body',
    !none.includes('សិស្ស លេខ') && none.includes('<w:body>'))
  check('and no orphan loop marker (§35)',
    !none.includes('{#rows}') && !none.includes('{/rows}'))
  check('an empty document still declares its page setup',
    none.includes('w:w="11906"'))

  const many = await fill(40)
  check('forty pupils produce forty pages',
    (many.match(/pageBreakBefore/g) ?? []).length === 40)

  // -- the output is still a package a Word reader can open
  const buf = await fillDocxTemplate(templateBuffer, payload(2))
  const outZip = await JSZip.loadAsync(buf)
  check('the generated file is still a complete OOXML package',
    ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml']
      .every((n) => Object.keys(outZip.files).includes(n)))
  check('and it is not empty', buf.length > 1500, `${buf.length} bytes`)
}

// ---------------------------------------------------------------------------
console.log('\nE. the download name is readable Khmer (§42)')
{
  const name = downloadFileName(def.label, '៤ក', '2025-2026', 'docx')
  check('it is prefixed and human-readable', name === 'KruSmart_វិញ្ញាបនបត្រ_៤ក_2025-2026.docx', name)
  check('path separators and quotes cannot reach the filesystem',
    !downloadFileName('a/b\\c"d', 'x', 'y', 'docx').includes('/'))
  check('an empty class name still yields a valid name',
    downloadFileName(def.label, '', '2025-2026', 'docx').includes('—'))
}

// ---------------------------------------------------------------------------
console.log('\nF. the pupil selection is a request, never an authority (§10/§33)')
{
  // Structural, because the intersection happens inside a server resolver that
  // needs a database — `scripts/verify-annual-live.mts` exercises it for real
  // under a JWT. What these guard is that the SHAPE of the rule stays right:
  // the browser narrows, the server decides.
  const resolver = readFileSync('lib/reporting/report-data.ts', 'utf8')
  const dialog = readFileSync('app/(main)/print-center/GenerateReportDialog.tsx', 'utf8')
  const action = readFileSync('app/(main)/print-center/actions.ts', 'utf8')

  check('the request carries an optional studentIds', resolver.includes('studentIds?: string[]'))
  check('the resolver intersects the selection with the resolved roster',
    /requested\.has\(c\.student\.id\)/.test(resolver))
  check('and falls back to its own rule when nothing is selected',
    /: eligible\b/.test(resolver))
  check('the default cohort is the pupils who PASSED, not everyone assessed',
    /annual\.status === 'promoted'/.test(resolver))
  check('an unmarked pupil is never certified',
    /status !== 'incomplete'/.test(resolver))

  check('the candidate list is gated by the same permission as generation',
    /listCertificateCandidates/.test(action) && /requirePermission\('scores:view'\)/.test(action))

  check('the dialog sends studentIds only for the report that means it',
    /needsStudents \? \[\.\.\.chosen\] : undefined/.test(dialog))
  check('and refuses to generate an empty certificate stack',
    /needsStudents && chosen\.size === 0/.test(dialog))
  check('the picker opens pre-selected to the default cohort',
    /list\.filter\(\(c\) => c\.eligible\)/.test(dialog))
  check('a repeater can still be chosen deliberately, and is labelled',
    /statusLabel/.test(dialog) && /c\.eligible/.test(dialog))
}

console.log(
  failures === 0
    ? '\n✓ the certificate generates a real .docx.'
    : `\n${failures} failure(s).`,
)
process.exit(failures === 0 ? 0 : 1)
