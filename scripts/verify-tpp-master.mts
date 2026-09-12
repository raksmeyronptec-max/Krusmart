/**
 * Verification test for Cambodian TPP 2026 Master Gradebook integration.
 *
 *     node --loader ts-node/esm scripts/verify-tpp-master.mts
 *  or node scripts/verify-tpp-master.mts
 */

import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import JSZip from 'jszip'

import { REPORT_DEFINITIONS } from '../lib/reporting/report-types.ts'
import { templateById, templatesFor } from '../lib/reporting/report-template.ts'
import {
  fillTppMasterWorkbook,
  fillTppSectionWorkbook,
  type TppMasterPayload,
  type TppStudentData,
  type TppTeacherData,
} from '../lib/reporting/tpp-master-writer.ts'

let failures = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) console.log(`  ✓ ${name}`)
  else {
    failures += 1
    console.error(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`)
  }
}

async function run() {
  console.log('\n--- 1. Testing Catalogue and Registries ---')

  const def = REPORT_DEFINITIONS.find((r) => r.type === 'tpp_master_book')
  check('tpp_master_book is in REPORT_DEFINITIONS', !!def)
  check('tpp_master_book has resolver enabled', def?.resolver === true)
  check('tpp_master_book is under category tracking', def?.category === 'tracking')
  check('tpp_master_book supports both xlsx and xlsm', Boolean(def?.formats.includes('xlsx') && def?.formats.includes('xlsm')))

  const templates = templatesFor('tpp_master_book')
  check('tpp_master_book has at least 2 templates registered', templates.length >= 2)

  const v1 = templateById('tpp_master_v1')
  check('tpp_master_v1 exists and is active xlsx', v1?.isActive === true && v1?.format === 'xlsx')

  const xlsmTmpl = templateById('tpp_master_xlsm')
  check('tpp_master_xlsm exists as xlsm format', xlsmTmpl?.format === 'xlsm')

  console.log('\n--- 2. Testing Template File on Disk ---')
  const templatePath = join(process.cwd(), 'lib', 'reporting', 'templates', 'tracking', 'tpp2026_master.xlsm')
  let templateBuffer: Buffer
  try {
    templateBuffer = await readFile(templatePath)
    check('tpp2026_master.xlsm exists on disk', templateBuffer.length > 0, `Size: ${(templateBuffer.length / 1024 / 1024).toFixed(2)} MB`)
  } catch (e) {
    check('tpp2026_master.xlsm exists on disk', false, String(e))
    process.exit(1)
  }

  console.log('\n--- 3. Testing TPP Master Writer Injection ---')
  const sampleTeacher: TppTeacherData = {
    teacherName: 'លោកគ្រូ អ៊ុក សុវណ្ណ',
    gender: 'ប្រុស',
    schoolName: 'សាលាបឋមសិក្សា អនុវត្តរាជធានី',
    schoolCode: '1201020304',
    className: '៥ក',
    academicYear: '២០២៥-២០២៦',
    phone: '012345678',
    directorName: 'លោក ហែម វុទ្ធី',
    directorRole: 'នាយកសាលា',
    lunarDate: 'ថ្ងៃចន្ទ ១៣កើត ខែផល្គុន ឆ្នាំម្សាញ់ សប្តស័ក ព.ស. ២៥៦៩',
    solarDate: 'ថ្ងៃទី ០២ ខែ មីនា ឆ្នាំ ២០២៦',
    managementUnit1: 'ការិយាល័យអប់រំ យុវជន និងកីឡា នៃខណ្ឌដូនពេញ',
    managementUnit2: 'កម្រងសាលា វត្តភ្នំ',
  }

  const sampleStudents: TppStudentData[] = [
    {
      studentId: 'ST001',
      lastName: 'ចាន់',
      firstName: 'តារា',
      nameEn: 'Chan Dara',
      gender: 'ប',
      dob: '12/05/2014',
      village: 'វត្តភ្នំ',
      commune: 'វត្តភ្នំ',
      district: 'ដូនពេញ',
      province: 'ភ្នំពេញ',
      fatherName: 'ចាន់ ថន',
      fatherJob: 'កសិករ',
      motherName: 'ស៊ុយ នី',
      motherJob: 'មេផ្ទះ',
    },
    {
      studentId: 'ST002',
      lastName: 'សុខ',
      firstName: 'ចរិយា',
      nameEn: 'Sok Chariya',
      gender: 'ស',
      dob: '22/09/2014',
      village: 'ផ្សារថ្មី',
      commune: 'ផ្សារថ្មី១',
      district: 'ដូនពេញ',
      province: 'ភ្នំពេញ',
      fatherName: 'សុខ វិបុល',
      fatherJob: 'អាជីវករ',
      motherName: 'អ៊ុំ សុភាព',
      motherJob: 'អាជីវករ',
    },
  ]

  const payload: TppMasterPayload = {
    teacher: sampleTeacher,
    students: sampleStudents,
  }

  const startTime = Date.now()
  const outBufferXlsx = await fillTppMasterWorkbook(templateBuffer, payload, { format: 'xlsx' })
  const elapsedXlsx = Date.now() - startTime
  console.log(`  Generation time (Clean XLSX): ${elapsedXlsx}ms`)
  check('Clean XLSX generated under 10 seconds', elapsedXlsx < 10000)

  // Verify XLSX content
  const zipXlsx = await JSZip.loadAsync(outBufferXlsx)
  check('Clean XLSX has no vbaProject.bin', !zipXlsx.file('xl/vbaProject.bin'))

  const inforTXlsx = await zipXlsx.file('xl/worksheets/sheet16.xml')?.async('string')
  check('inforT contains updated teacher name', inforTXlsx?.includes('លោកគ្រូ អ៊ុក សុវណ្ណ') === true)
  check('inforT contains updated school name', inforTXlsx?.includes('សាលាបឋមសិក្សា អនុវត្តរាជធានី') === true)
  check('inforT contains updated class name', inforTXlsx?.includes('៥ក') === true)
  check('inforT contains updated academic year', inforTXlsx?.includes('២០២៥-២០២៦') === true)

  const inforSXlsx = await zipXlsx.file('xl/worksheets/sheet15.xml')?.async('string')
  check('inforS contains student ST001', inforSXlsx?.includes('ST001') === true)
  check('inforS contains student ST002', inforSXlsx?.includes('ST002') === true)
  check('inforS contains student last name ចាន់', inforSXlsx?.includes('ចាន់') === true)
  check('inforS contains student first name តារា', inforSXlsx?.includes('តារា') === true)
  check('inforS contains father name ចាន់ ថន', inforSXlsx?.includes('ចាន់ ថន') === true)

  console.log('\n--- 4. Testing XLSM Macro-Enabled Output ---')
  const startXlsm = Date.now()
  const outBufferXlsm = await fillTppMasterWorkbook(templateBuffer, payload, { format: 'xlsm' })
  const elapsedXlsm = Date.now() - startXlsm
  console.log(`  Generation time (Macro XLSM): ${elapsedXlsm}ms`)
  const zipXlsm = await JSZip.loadAsync(outBufferXlsm)
  check('Macro XLSM preserves xl/vbaProject.bin', !!zipXlsm.file('xl/vbaProject.bin'))

  console.log('\n--- 5. Testing Monthly Score Sheet Injection (Month 1: nov) ---')
  const payloadWithScores: TppMasterPayload = {
    teacher: sampleTeacher,
    students: sampleStudents,
    monthlyScores: {
      monthId: 'nov',
      denominator: 5,
      students: [
        {
          studentId: 'ST001',
          scores: {
            kh_listen: 8.5,
            kh_write: 8,
            kh_read: 9,
            kh_speak: 8.5,
            math_num: 9.5,
          },
          total: 43.5,
          average: 8.7,
          rank: 1,
        },
        {
          studentId: 'ST002',
          scores: {
            kh_listen: 7,
            kh_write: 7.5,
            kh_read: 8,
            kh_speak: 7,
            math_num: 8,
          },
          total: 37.5,
          average: 7.5,
          rank: 2,
        },
      ],
    },
  }

  const outBufferWithScores = await fillTppMasterWorkbook(templateBuffer, payloadWithScores, { format: 'xlsx' })
  const zipWithScores = await JSZip.loadAsync(outBufferWithScores)

  const wbXml = await zipWithScores.file('xl/workbook.xml')?.async('string')
  check('Clean XLSX enables showSheetTabs="1"', wbXml?.includes('showSheetTabs="1"') === true)

  const monthXml = await zipWithScores.file('xl/worksheets/sheet142.xml')?.async('string')
  check('sheet142.xml exists in output', !!monthXml)
  check('Row 8 has score for kh_listen (8.5)', monthXml?.includes('<c r="G8" s="14"><v>8.5</v></c>') === true)
  check('Row 8 has score for math_num (9.5)', monthXml?.includes('<c r="K8" s="14"><v>9.5</v></c>') === true)
  check('Row 8 has total in AQ8 (43.5)', monthXml?.includes('<v>43.5</v></c>') === true)
  check('Row 8 has average in AR8 (8.7)', monthXml?.includes('<v>8.7</v></c>') === true)
  check('Row 8 has rank in AS8 (1)', monthXml?.includes('<v>1</v></c>') === true)
  check('Row 4 has denominator AW4 (5)', monthXml?.includes('<c r="AW4" s="1705"><v>5</v></c>') === true)

  console.log('\n--- 6. Testing Standalone Monthly Score Section ---')
  const startSecMonth = Date.now()
  const outSecMonth = await fillTppSectionWorkbook(templateBuffer, 'monthly', payloadWithScores)
  const elapsedSecMonth = Date.now() - startSecMonth
  console.log(`  Monthly section generated in ${elapsedSecMonth}ms, size: ${(outSecMonth.length / 1024 / 1024).toFixed(2)} MB`)
  check('Monthly section generated under 5 seconds', elapsedSecMonth < 5000)
  check('Monthly section is lightweight (< 3MB)', outSecMonth.length < 3 * 1024 * 1024)

  const zipSecMonth = await JSZip.loadAsync(outSecMonth)
  check('Monthly section keeps inforS', !!zipSecMonth.file('xl/worksheets/sheet15.xml'))
  check('Monthly section keeps inforT', !!zipSecMonth.file('xl/worksheets/sheet16.xml'))
  check('Monthly section keeps sheet142.xml (a1)', !!zipSecMonth.file('xl/worksheets/sheet142.xml'))
  check('Monthly section removed unused sheet40.xml', !zipSecMonth.file('xl/worksheets/sheet40.xml'))
  check('Monthly section removed vbaProject.bin', !zipSecMonth.file('xl/vbaProject.bin'))

  const wbSecMonth = await zipSecMonth.file('xl/workbook.xml')?.async('string')
  check('Monthly section hides inforS and inforT', Boolean(wbSecMonth?.includes('r:id="rId15"') && wbSecMonth?.includes('r:id="rId16"')))
  check('Monthly section sets activeTab="2"', wbSecMonth?.includes('activeTab="2"') === true)

  console.log('\n--- 7. Testing Standalone Monthly Ranking Section ---')
  const startSecRankMonth = Date.now()
  const outSecRankMonth = await fillTppSectionWorkbook(templateBuffer, 'ranking_monthly', payloadWithScores)
  const elapsedSecRankMonth = Date.now() - startSecRankMonth
  console.log(`  Monthly ranking section generated in ${elapsedSecRankMonth}ms, size: ${(outSecRankMonth.length / 1024 / 1024).toFixed(2)} MB`)
  check('Monthly ranking section generated under 5 seconds', elapsedSecRankMonth < 5000)
  check('Monthly ranking section is lightweight (< 3MB)', outSecRankMonth.length < 3 * 1024 * 1024)

  const zipSecRankMonth = await JSZip.loadAsync(outSecRankMonth)
  check('Ranking section keeps inforS', !!zipSecRankMonth.file('xl/worksheets/sheet15.xml'))
  check('Ranking section keeps inforT', !!zipSecRankMonth.file('xl/worksheets/sheet16.xml'))
  check('Ranking section keeps score sheet sheet142.xml', !!zipSecRankMonth.file('xl/worksheets/sheet142.xml'))
  check('Ranking section keeps ranking sheet sheet31.xml (b1)', !!zipSecRankMonth.file('xl/worksheets/sheet31.xml'))
  check('Ranking section sets activeTab="3"', (await zipSecRankMonth.file('xl/workbook.xml')?.async('string'))?.includes('activeTab="3"') === true)

  console.log('\n--- 8. Testing Standalone Semester Score Section ---')
  const payloadSemScores: TppMasterPayload = {
    teacher: sampleTeacher,
    students: sampleStudents,
    monthlyScores: {
      monthId: 'sem1',
      denominator: 5,
      students: [
        {
          studentId: 'ST001',
          scores: {
            kh_read: 8.5,
            math: 9,
            science: 8.5,
            social: 8,
            pe: 9,
          },
          total: 43,
          average: 8.6,
          rank: 1,
        },
      ],
    },
  }

  const startSecSem = Date.now()
  const outSecSem = await fillTppSectionWorkbook(templateBuffer, 'semester', payloadSemScores)
  const elapsedSecSem = Date.now() - startSecSem
  console.log(`  Semester score section generated in ${elapsedSecSem}ms, size: ${(outSecSem.length / 1024 / 1024).toFixed(2)} MB`)
  check('Semester score section generated under 5 seconds', elapsedSecSem < 5000)
  check('Semester score section is lightweight (< 3MB)', outSecSem.length < 3 * 1024 * 1024)

  const zipSecSem = await JSZip.loadAsync(outSecSem)
  check('Semester score section keeps sheet95.xml (a11)', !!zipSecSem.file('xl/worksheets/sheet95.xml'))
  const semXml = await zipSecSem.file('xl/worksheets/sheet95.xml')?.async('string')
  check('Semester score sheet row 7 has math (9)', semXml?.includes('<v>9</v></c>') === true)

  console.log('\n--- 9. Testing Standalone Semester Ranking Section ---')
  const startSecRankSem = Date.now()
  const outSecRankSem = await fillTppSectionWorkbook(templateBuffer, 'ranking_semester', payloadSemScores)
  const elapsedSecRankSem = Date.now() - startSecRankSem
  console.log(`  Semester ranking section generated in ${elapsedSecRankSem}ms, size: ${(outSecRankSem.length / 1024 / 1024).toFixed(2)} MB`)
  check('Semester ranking section generated under 5 seconds', elapsedSecRankSem < 5000)
  check('Semester ranking section is lightweight (< 3MB)', outSecRankSem.length < 3 * 1024 * 1024)

  const zipSecRankSem = await JSZip.loadAsync(outSecRankSem)
  check('Semester ranking section keeps sheet97.xml (b11)', !!zipSecRankSem.file('xl/worksheets/sheet97.xml'))
  check('Semester ranking section keeps sheet95.xml (a11)', !!zipSecRankSem.file('xl/worksheets/sheet95.xml'))
  check('Semester ranking section sets activeTab="3"', (await zipSecRankSem.file('xl/workbook.xml')?.async('string'))?.includes('activeTab="3"') === true)

  if (failures > 0) {
    console.error(`\nFAILED: ${failures} check(s) failed.`)
    process.exit(1)
  } else {
    console.log('\nALL CHECKS PASSED SUCCESSFULLY! ✓✓✓')
  }
}

run().catch((e) => {
  console.error('Unhandled error during test:', e)
  process.exit(1)
})
