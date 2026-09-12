/**
 * High-performance writer for the Cambodian TPP 2026 Master Gradebook (.xlsm / .xlsx).
 *
 * `TPP2026_PERFECT.xlsm` is a 23MB macro-enabled workbook containing 145 worksheets
 * and comprehensive administrative, score, ranking, attendance, and student profile sheets.
 *
 * PERFORMANCE STRATEGY
 * Instead of loading 145 worksheets into full memory with DOM-based parsers (which takes 30s+
 * and can crash server workers with 1GB+ RAM), this writer leverages JSZip to perform
 * surgical, ultra-fast XML replacements only on the master data sheets:
 *   - `xl/worksheets/sheet16.xml` (`inforT` - Teacher & School Info)
 *   - `xl/worksheets/sheet15.xml` (`inforS` - Student Roster & Demographics)
 *
 * All other 140+ worksheets (rankings, annual results, certificates, student cards,
 * leave books, administration books) update automatically via Excel's internal formula graph
 * because they are directly formula-linked to `inforS` and `inforT`.
 */

import JSZip from 'jszip'

export interface TppStudentData {
  id?: string
  studentId: string
  lastName: string
  firstName: string
  nameEn?: string | null
  gender: string // 'female' | 'male' | 'ស' | 'ប'
  dob?: string | null
  village?: string | null
  commune?: string | null
  district?: string | null
  province?: string | null
  fatherName?: string | null
  fatherJob?: string | null
  motherName?: string | null
  motherJob?: string | null
}

export interface TppTeacherData {
  teacherName: string
  gender?: string | null
  schoolName: string
  schoolCode?: string | null
  className: string
  academicYear: string
  phone?: string | null
  directorName?: string | null
  directorRole?: string | null
  managementUnit1?: string | null
  managementUnit2?: string | null
  lunarDate?: string | null
  solarDate?: string | null
}

export interface TppStudentScoreItem {
  studentId: string
  scores: Record<string, number | string | null>
  total?: number
  average?: number | null
  rank?: number
}

export interface TppMonthlyScores {
  monthId: string // 'nov', 'dec', 'jan', ...
  denominator?: number
  students: TppStudentScoreItem[]
}

export interface TppMasterPayload {
  teacher: TppTeacherData
  students: TppStudentData[]
  monthlyScores?: TppMonthlyScores
  format?: 'xlsm' | 'xlsx'
}

/** Escapes special XML characters. */
function escapeXml(str: unknown): string {
  if (str === null || str === undefined) return ''
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/**
 * Replaces cell values in a row's inner XML while strictly preserving
 * existing cell style IDs (`s="1699"`), column widths, and fonts.
 */
function updateRowCells(
  rowXml: string,
  rowNumber: number,
  cellUpdates: Record<string, string | number | null | undefined>,
): string {
  const cellRegex = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:>([\s\S]*?)<\/c>|\/>)/g

  return rowXml.replace(cellRegex, (full, col, rNumStr, attrs) => {
    if (!(col in cellUpdates)) return full

    const styleMatch = attrs.match(/\bs="(\d+)"/)
    const styleAttr = styleMatch ? ` s="${styleMatch[1]}"` : ''
    const val = cellUpdates[col]

    if (val === null || val === undefined || val === '') {
      return `<c r="${col}${rowNumber}"${styleAttr}/>`
    }

    if (typeof val === 'number') {
      return `<c r="${col}${rowNumber}"${styleAttr}><v>${val}</v></c>`
    }

    return `<c r="${col}${rowNumber}"${styleAttr} t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`
  })
}

/**
 * Updates `inforT` (Sheet 16) with school, teacher, class, and academic year details.
 */
function updateInforT(sheetXml: string, teacher: TppTeacherData): string {
  const teacherGenderKh =
    teacher.gender === 'female' || teacher.gender === 'ស្រី' || teacher.gender === 'ស'
      ? 'ស្រី'
      : teacher.gender === 'male' || teacher.gender === 'ប្រុស' || teacher.gender === 'ប'
        ? 'ប្រុស'
        : teacher.gender || 'ប្រុស'

  const updatesByRow: Record<number, Record<string, string | number | null | undefined>> = {
    1: {
      A: teacher.managementUnit1 ?? undefined,
    },
    2: {
      A: teacher.managementUnit2 ?? undefined,
    },
    3: {
      H: teacher.lunarDate ?? undefined,
    },
    5: {
      C: teacher.directorName ?? 'នាយកសាលា',
    },
    7: {
      C: teacher.teacherName,
      E: teacherGenderKh,
      H: teacher.solarDate ?? undefined,
    },
    9: {
      C: teacher.schoolName,
    },
    11: {
      C: teacher.className,
      E: teacher.phone ?? undefined,
    },
    13: {
      C: teacher.schoolCode ?? undefined,
    },
    15: {
      C: teacher.academicYear,
    },
  }

  return sheetXml.replace(
    /<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g,
    (fullRow, rNumStr, rowAttrs, inner) => {
      const rNum = parseInt(rNumStr, 10)
      const updates = updatesByRow[rNum]
      if (!updates) return fullRow
      const updatedInner = updateRowCells(inner, rNum, updates)
      return `<row r="${rNumStr}"${rowAttrs}>${updatedInner}</row>`
    },
  )
}

/**
 * Updates `inforS` (Sheet 15) with the student roster and demographics.
 * Active students start at row 6. Rows beyond active students are cleared
 * so formula-driven downstream sheets do not calculate empty rows.
 */
function updateInforS(sheetXml: string, students: TppStudentData[]): string {
  const updatesByRow: Record<number, Record<string, string | number | null | undefined>> = {}

  // Active students: Row 6 onwards
  for (let i = 0; i < students.length; i++) {
    const r = 6 + i
    const s = students[i]
    const genderKh =
      s.gender === 'female' || s.gender === 'ស្រី' || s.gender === 'ស' ? 'ស' : 'ប'

    updatesByRow[r] = {
      B: s.studentId,
      C: s.lastName,
      D: s.firstName,
      E: s.nameEn ?? '',
      G: genderKh,
      H: s.dob ?? '',
      I: s.village ?? '',
      J: s.commune ?? '',
      K: s.district ?? '',
      L: s.province ?? '',
      M: s.fatherName ?? '',
      O: s.fatherJob ?? '',
      P: s.motherName ?? '',
      R: s.motherJob ?? '',
    }
  }

  // Clear leftover rows up to row 100 to ensure blank student slots don't trigger errors
  const maxRow = Math.max(60, 6 + students.length + 15)
  for (let r = 6 + students.length; r <= maxRow; r++) {
    updatesByRow[r] = {
      B: '', C: '', D: '', E: '', G: '', H: '',
      I: '', J: '', K: '', L: '', M: '', N: '',
      O: '', P: '', Q: '', R: '',
    }
  }

  return sheetXml.replace(
    /<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g,
    (fullRow, rNumStr, rowAttrs, inner) => {
      const rNum = parseInt(rNumStr, 10)
      const updates = updatesByRow[rNum]
      if (!updates) return fullRow
      const updatedInner = updateRowCells(inner, rNum, updates)
      return `<row r="${rNumStr}"${rowAttrs}>${updatedInner}</row>`
    },
  )
}

/**
 * Worksheet XML paths for each academic month (a1 to a10).
 */
export const MONTH_TO_TPP_SHEET: Record<string, string> = {
  nov: 'xl/worksheets/sheet142.xml', // a1 (Month 1 / វិច្ឆិកា)
  dec: 'xl/worksheets/sheet40.xml',  // a2 (Month 2 / ធ្នូ)
  jan: 'xl/worksheets/sheet45.xml',  // a3 (Month 3 / មករា)
  feb: 'xl/worksheets/sheet50.xml',  // a4 (Month 4 / កុម្ភៈ)
  mar: 'xl/worksheets/sheet55.xml',  // a5 (Month 5 / មីនា)
  apr: 'xl/worksheets/sheet60.xml',  // a6 (Month 6 / មេសា)
  may: 'xl/worksheets/sheet65.xml',  // a7 (Month 7 / ឧសភា)
  jun: 'xl/worksheets/sheet70.xml',  // a8 (Month 8 / មិថុនា)
  jul: 'xl/worksheets/sheet75.xml',  // a9 (Month 9 / កក្កដា)
  aug: 'xl/worksheets/sheet80.xml',  // a10 (Month 10 / សីហា)
}

/**
 * Maps subject and sub-skill scores to the official TPP 2026 columns:
 *   G: Khmer Listening (or Khmer Total)
 *   H: Khmer Writing
 *   I: Khmer Reading
 *   J: Khmer Speaking
 *   K: Math Number (or Math Total)
 *   L: Math Measurement
 *   M: Math Geometry
 *   N: Math Algebra
 *   O: Math Statistics
 *   P: Science Physics (or Science Total)
 *   Q: Science Chemistry
 *   R: Science Biology
 *   S: Science Earth
 *   T: Social Ethics / Civics (or Social Total)
 *   U: Social Geography
 *   V: Social History
 *   W: Social Home / Arts
 *   X: Physical Education
 *   Y: Health
 *   Z: Life Skills
 *   AA: Foreign Language
 */
function mapScoresToColumns(
  scores: Record<string, number | string | null | undefined>,
): Record<string, number | null> {
  const cols: Record<string, number | null> = {}

  function getVal(keys: string[]): number | null {
    for (const k of keys) {
      const v = scores[k]
      if (v !== null && v !== undefined && v !== '') {
        const n = Number(v)
        if (Number.isFinite(n)) return n
      }
    }
    return null
  }

  // Khmer: G, H, I, J
  const khListen = getVal(['kh_listen'])
  const khWrite = getVal(['kh_write'])
  const khRead = getVal(['kh_read'])
  const khSpeak = getVal(['kh_speak'])
  const khGeneral = getVal(['khmer', 'khmer_all', 'kh_total', 'kh'])

  if (khListen !== null || khWrite !== null || khRead !== null || khSpeak !== null) {
    if (khListen !== null) cols.G = khListen
    if (khWrite !== null) cols.H = khWrite
    if (khRead !== null) cols.I = khRead
    if (khSpeak !== null) cols.J = khSpeak
  } else if (khGeneral !== null) {
    cols.G = khGeneral
  }

  // Math: K, L, M, N, O
  const mathNum = getVal(['math_num'])
  const mathMeas = getVal(['math_meas'])
  const mathGeo = getVal(['math_geo'])
  const mathAlg = getVal(['math_alg'])
  const mathStat = getVal(['math_stat'])
  const mathGeneral = getVal(['math', 'math_general', 'math_total'])

  if (mathNum !== null || mathMeas !== null || mathGeo !== null || mathAlg !== null || mathStat !== null) {
    if (mathNum !== null) cols.K = mathNum
    if (mathMeas !== null) cols.L = mathMeas
    if (mathGeo !== null) cols.M = mathGeo
    if (mathAlg !== null) cols.N = mathAlg
    if (mathStat !== null) cols.O = mathStat
  } else if (mathGeneral !== null) {
    cols.K = mathGeneral
  }

  // Science: P (physics), Q (chem), R (bio), S (earth)
  const sciPhys = getVal(['science_physics', 'phys', 'physics', 'hs_physics'])
  const sciChem = getVal(['science_chem', 'chem', 'chemistry', 'hs_chemistry'])
  const sciBio = getVal(['science_bio', 'bio', 'biology', 'hs_biology'])
  const sciEarth = getVal(['science_earth', 'earth', 'earth_science', 'hs_earth'])
  const sciGeneral = getVal(['science', 'science_total', 'sci'])

  if (sciPhys !== null || sciChem !== null || sciBio !== null || sciEarth !== null) {
    if (sciPhys !== null) cols.P = sciPhys
    if (sciChem !== null) cols.Q = sciChem
    if (sciBio !== null) cols.R = sciBio
    if (sciEarth !== null) cols.S = sciEarth
  } else if (sciGeneral !== null) {
    cols.P = sciGeneral
  }

  // Social: T (ethics), U (geo), V (hist), W (home/art)
  const socEthics = getVal(['social_ethics', 'moral', 'civics', 'hs_morals'])
  const socGeo = getVal(['social_geo', 'geo', 'geography', 'hs_geography'])
  const socHist = getVal(['social_hist', 'hist', 'history', 'hs_history'])
  const socHome = getVal(['social_home', 'home', 'art', 'hs_arts'])
  const socGeneral = getVal(['social', 'social_studies', 'soc'])

  if (socEthics !== null || socGeo !== null || socHist !== null || socHome !== null) {
    if (socEthics !== null) cols.T = socEthics
    if (socGeo !== null) cols.U = socGeo
    if (socHist !== null) cols.V = socHist
    if (socHome !== null) cols.W = socHome
  } else if (socGeneral !== null) {
    cols.T = socGeneral
  }

  // PE: X (sport), Y (health)
  const pe = getVal(['pe', 'sport', 'physical_education', 'hs_sports'])
  const health = getVal(['health', 'hygiene'])
  if (pe !== null) cols.X = pe
  if (health !== null) cols.Y = health

  // Life skills: Z
  const skills = getVal(['skills', 'lifeskills', 'life_skills', 'craft', 'hs_lifeskill'])
  if (skills !== null) cols.Z = skills

  // Foreign language: AA
  const foreignLang = getVal(['english', 'foreign_lang', 'foreign_language', 'language', 'hs_english'])
  if (foreignLang !== null) cols.AA = foreignLang

  return cols
}

function injectValueIntoFormulaCell(body: string, val: string | number): string {
  if (/<v>[\s\S]*?<\/v>/.test(body)) {
    return body.replace(/<v>[\s\S]*?<\/v>/, `<v>${val}</v>`)
  }
  if (/<v\/>/.test(body)) {
    return body.replace(/<v\/>/, `<v>${val}</v>`)
  }
  return body.replace(/<\/f>/, `</f><v>${val}</v>`)
}

function clearFormulaCellValue(body: string): string {
  if (/<v>[\s\S]*?<\/v>/.test(body)) {
    return body.replace(/<v>[\s\S]*?<\/v>/, `<v/>`)
  }
  return body
}

/**
 * Injects scores into a monthly worksheet (e.g. `a1`, `a2`, etc.).
 * Students start at row 8 (`r = 8 + i`).
 * Empty rows beyond active students (up to row 87) are cleared.
 */
function updateMonthlyScoreSheet(
  sheetXml: string,
  monthlyScores: TppMonthlyScores,
  students: TppStudentData[],
): string {
  const scoreMap = new Map<string, TppStudentScoreItem>()
  for (const item of monthlyScores.students) {
    scoreMap.set(item.studentId, item)
  }

  const updatesByRow: Record<number, Record<string, number | string | null>> = {}

  // 1. Set denominator in AW4 if provided
  if (monthlyScores.denominator && monthlyScores.denominator > 0) {
    updatesByRow[4] = { AW: monthlyScores.denominator }
  }

  // 2. Active students: row 8 onwards
  for (let i = 0; i < students.length; i++) {
    const r = 8 + i
    const s = students[i]
    const item = (s.id ? scoreMap.get(s.id) : undefined) ?? monthlyScores.students[i]

    const cellUpdates: Record<string, number | string | null> = item
      ? mapScoresToColumns(item.scores)
      : {}

    if (item) {
      if (item.total !== undefined && item.total !== null) {
        cellUpdates.AQ = item.total
      }
      if (item.average !== undefined && item.average !== null) {
        cellUpdates.AR = item.average
      }
      if (item.rank !== undefined && item.rank !== null && item.rank > 0) {
        cellUpdates.AS = item.rank
      }
    }

    updatesByRow[r] = cellUpdates
  }

  const maxStudentRow = Math.max(60, 8 + students.length + 10)
  const cellRegex = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:>([\s\S]*?)<\/c>|\/>)/g

  return sheetXml.replace(
    /<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g,
    (fullRow, rNumStr, rowAttrs, inner) => {
      const rNum = parseInt(rNumStr, 10)

      // Active student rows or header row 4
      if (rNum in updatesByRow) {
        const updates = updatesByRow[rNum]
        const updatedInner = inner.replace(
          cellRegex,
          (fullCell: string, col: string, rStr: string, attrs: string, body?: string) => {
            if (!(col in updates)) return fullCell
            const val = updates[col]
            const styleMatch = attrs.match(/\bs="(\d+)"/)
            const styleAttr = styleMatch ? ` s="${styleMatch[1]}"` : ''

            // If this cell has a formula, preserve the formula tag and update its calculated value
            if (body && body.includes('<f')) {
              if (val === null || val === undefined || val === '') {
                return `<c r="${col}${rStr}"${attrs}>${clearFormulaCellValue(body)}</c>`
              }
              return `<c r="${col}${rStr}"${attrs}>${injectValueIntoFormulaCell(body, val)}</c>`
            }

            if (val === null || val === undefined || val === '') {
              return `<c r="${col}${rStr}"${styleAttr}/>`
            }
            if (typeof val === 'number') {
              return `<c r="${col}${rStr}"${styleAttr}><v>${val}</v></c>`
            }
            return `<c r="${col}${rStr}"${styleAttr} t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`
          },
        )
        return `<row r="${rNumStr}"${rowAttrs}>${updatedInner}</row>`
      }

      // Leftover student rows up to maxStudentRow: clear scores and formula values
      if (rNum >= 8 + students.length && rNum <= maxStudentRow) {
        const clearedInner = inner.replace(
          cellRegex,
          (fullCell: string, col: string, rStr: string, attrs: string, body?: string) => {
            const styleMatch = attrs.match(/\bs="(\d+)"/)
            const styleAttr = styleMatch ? ` s="${styleMatch[1]}"` : ''

            if (body && body.includes('<f')) {
              return `<c r="${col}${rStr}"${attrs}>${clearFormulaCellValue(body)}</c>`
            }
            // Clear score columns G through AP
            if ((col.length === 1 && col >= 'G') || (col.length === 2 && col <= 'AP')) {
              return `<c r="${col}${rStr}"${styleAttr}/>`
            }
            return fullCell
          },
        )
        return `<row r="${rNumStr}"${rowAttrs}>${clearedInner}</row>`
      }

      return fullRow
    },
  )
}

/**
 * Injects semester scores into a semester worksheet (`a11` for Sem 1, `a12` for Sem 2).
 * Students start at row 7 (`r = 7 + i`).
 */
function updateSemesterScoreSheet(
  sheetXml: string,
  scores: TppMonthlyScores,
  students: TppStudentData[],
): string {
  const scoreMap = new Map<string, TppStudentScoreItem>()
  for (const item of scores.students) {
    scoreMap.set(item.studentId, item)
  }

  const updatesByRow: Record<number, Record<string, number | string | null>> = {}

  function getVal(s: Record<string, number | string | null>, keys: string[]): number | null {
    for (const k of keys) {
      const v = s[k]
      if (v !== null && v !== undefined && v !== '') {
        const n = Number(v)
        if (Number.isFinite(n)) return n
      }
    }
    return null
  }

  for (let i = 0; i < students.length; i++) {
    const r = 7 + i
    const s = students[i]
    const item = (s.id ? scoreMap.get(s.id) : undefined) ?? scores.students[i]
    if (!item) continue

    const sc = item.scores
    const rowUpdates: Record<string, number | string | null> = {}

    // Khmer: I (reading), J (listen/speak), K (dictation/writing), L (essay)
    const khRead = getVal(sc, ['kh_read', 'khmer', 'khmer_all', 'sem_kh_reading'])
    const khSpeak = getVal(sc, ['kh_speak', 'kh_listen'])
    const khWrite = getVal(sc, ['kh_write', 'kh_dict'])
    const khEssay = getVal(sc, ['kh_essay'])
    if (khRead !== null) rowUpdates.I = khRead
    if (khSpeak !== null) rowUpdates.J = khSpeak
    if (khWrite !== null) rowUpdates.K = khWrite
    if (khEssay !== null) rowUpdates.L = khEssay

    // Math: S
    const math = getVal(sc, ['math', 'math_general', 'math_num', 'sem_math'])
    if (math !== null) rowUpdates.S = math

    // Science: AD
    const science = getVal(sc, ['science', 'phys', 'chem', 'bio', 'science_physics'])
    if (science !== null) rowUpdates.AD = science

    // Social: AL (social), AM (art)
    const social = getVal(sc, ['social', 'moral', 'geo', 'hist', 'social_ethics'])
    const art = getVal(sc, ['art', 'social_home'])
    if (social !== null) rowUpdates.AL = social
    if (art !== null) rowUpdates.AM = art

    // PE: AT
    const pe = getVal(sc, ['pe', 'sport', 'health'])
    if (pe !== null) rowUpdates.AT = pe

    // Life skills: AU
    const skills = getVal(sc, ['skills', 'craft', 'hs_lifeskill'])
    if (skills !== null) rowUpdates.AU = skills

    // Totals, averages, rank
    if (item.total !== undefined && item.total !== null) rowUpdates.AY = item.total
    if (item.average !== undefined && item.average !== null) rowUpdates.AZ = item.average
    if (item.rank !== undefined && item.rank !== null && item.rank > 0) rowUpdates.BA = item.rank

    updatesByRow[r] = rowUpdates
  }

  const maxStudentRow = Math.max(60, 7 + students.length + 10)
  const cellRegex = /<c r="([A-Z]+)(\d+)"([^>]*?)(?:>([\s\S]*?)<\/c>|\/>)/g

  return sheetXml.replace(
    /<row r="(\d+)"([^>]*)>([\s\S]*?)<\/row>/g,
    (fullRow, rNumStr, rowAttrs, inner) => {
      const rNum = parseInt(rNumStr, 10)

      if (rNum in updatesByRow) {
        const updates = updatesByRow[rNum]
        const updatedInner = inner.replace(
          cellRegex,
          (fullCell: string, col: string, rStr: string, attrs: string, body?: string) => {
            if (!(col in updates)) return fullCell
            const val = updates[col]
            const styleMatch = attrs.match(/\bs="(\d+)"/)
            const styleAttr = styleMatch ? ` s="${styleMatch[1]}"` : ''

            if (body && body.includes('<f')) {
              if (val === null || val === undefined || val === '') {
                return `<c r="${col}${rStr}"${attrs}>${clearFormulaCellValue(body)}</c>`
              }
              return `<c r="${col}${rStr}"${attrs}>${injectValueIntoFormulaCell(body, val)}</c>`
            }

            if (val === null || val === undefined || val === '') {
              return `<c r="${col}${rStr}"${styleAttr}/>`
            }
            if (typeof val === 'number') {
              return `<c r="${col}${rStr}"${styleAttr}><v>${val}</v></c>`
            }
            return `<c r="${col}${rStr}"${styleAttr} t="inlineStr"><is><t>${escapeXml(val)}</t></is></c>`
          },
        )
        return `<row r="${rNumStr}"${rowAttrs}>${updatedInner}</row>`
      }

      // Clear leftover rows up to maxStudentRow
      if (rNum >= 7 + students.length && rNum <= maxStudentRow) {
        const clearedInner = inner.replace(
          cellRegex,
          (fullCell: string, col: string, rStr: string, attrs: string, body?: string) => {
            const styleMatch = attrs.match(/\bs="(\d+)"/)
            const styleAttr = styleMatch ? ` s="${styleMatch[1]}"` : ''

            if (body && body.includes('<f')) {
              return `<c r="${col}${rStr}"${attrs}>${clearFormulaCellValue(body)}</c>`
            }
            if ((col.length === 1 && col >= 'G') || (col.length === 2 && col <= 'AU')) {
              return `<c r="${col}${rStr}"${styleAttr}/>`
            }
            return fullCell
          },
        )
        return `<row r="${rNumStr}"${rowAttrs}>${clearedInner}</row>`
      }

      return fullRow
    },
  )
}

export const MONTH_TO_TPP_SCORE_SHEET: Record<string, { file: string; rId: string }> = {
  nov: { file: 'sheet142.xml', rId: 'rId142' },
  dec: { file: 'sheet40.xml', rId: 'rId40' },
  jan: { file: 'sheet45.xml', rId: 'rId45' },
  feb: { file: 'sheet50.xml', rId: 'rId50' },
  mar: { file: 'sheet55.xml', rId: 'rId55' },
  apr: { file: 'sheet60.xml', rId: 'rId60' },
  may: { file: 'sheet65.xml', rId: 'rId65' },
  jun: { file: 'sheet70.xml', rId: 'rId70' },
  jul: { file: 'sheet75.xml', rId: 'rId75' },
  aug: { file: 'sheet80.xml', rId: 'rId80' },
}

export const MONTH_TO_TPP_RANKING_SHEET: Record<
  string,
  { rankingFile: string; rankingRId: string; scoreFile: string; scoreRId: string }
> = {
  nov: { rankingFile: 'sheet31.xml', rankingRId: 'rId31', scoreFile: 'sheet142.xml', scoreRId: 'rId142' },
  dec: { rankingFile: 'sheet42.xml', rankingRId: 'rId42', scoreFile: 'sheet40.xml', scoreRId: 'rId40' },
  jan: { rankingFile: 'sheet47.xml', rankingRId: 'rId47', scoreFile: 'sheet45.xml', scoreRId: 'rId45' },
  feb: { rankingFile: 'sheet52.xml', rankingRId: 'rId52', scoreFile: 'sheet50.xml', scoreRId: 'rId50' },
  mar: { rankingFile: 'sheet57.xml', rankingRId: 'rId57', scoreFile: 'sheet55.xml', scoreRId: 'rId55' },
  apr: { rankingFile: 'sheet62.xml', rankingRId: 'rId62', scoreFile: 'sheet60.xml', scoreRId: 'rId60' },
  may: { rankingFile: 'sheet67.xml', rankingRId: 'rId67', scoreFile: 'sheet65.xml', scoreRId: 'rId65' },
  jun: { rankingFile: 'sheet72.xml', rankingRId: 'rId72', scoreFile: 'sheet70.xml', scoreRId: 'rId70' },
  jul: { rankingFile: 'sheet77.xml', rankingRId: 'rId77', scoreFile: 'sheet75.xml', scoreRId: 'rId75' },
  aug: { rankingFile: 'sheet82.xml', rankingRId: 'rId82', scoreFile: 'sheet80.xml', scoreRId: 'rId80' },
}

export const SEMESTER_TO_TPP_SCORE_SHEET: Record<string, { file: string; rId: string }> = {
  sem1: { file: 'sheet95.xml', rId: 'rId95' },
  sem2: { file: 'sheet99.xml', rId: 'rId99' },
}

export const SEMESTER_TO_TPP_RANKING_SHEET: Record<
  string,
  { rankingFile: string; rankingRId: string; scoreFile: string; scoreRId: string }
> = {
  sem1: { rankingFile: 'sheet97.xml', rankingRId: 'rId97', scoreFile: 'sheet95.xml', scoreRId: 'rId95' },
  sem2: { rankingFile: 'sheet101.xml', rankingRId: 'rId101', scoreFile: 'sheet99.xml', scoreRId: 'rId99' },
}

export type TppSectionType =
  | 'monthly'
  | 'semester'
  | 'ranking_monthly'
  | 'ranking_semester'

/**
 * Extracts and fills ONLY a specific section (e.g. Monthly Score Sheet, Semester Score Sheet)
 * from the master TPP 2026 workbook. Trims all other 142 sheets and media to produce a clean,
 * ultra-lightweight (~1.5 MB) standalone Excel file with formulas preserved.
 */
export async function fillTppSectionWorkbook(
  templateBuffer: Buffer,
  section: TppSectionType,
  data: TppMasterPayload,
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer)

  const monthId = data.monthlyScores?.monthId || 'nov'
  const isRanking = section === 'ranking_monthly' || section === 'ranking_semester'
  const isSemester = section === 'semester' || section === 'ranking_semester'

  let scoreSheetFile: string
  let scoreRId: string
  let visibleSheetFile: string
  let visibleRId: string

  if (section === 'monthly') {
    const info = MONTH_TO_TPP_SCORE_SHEET[monthId] || MONTH_TO_TPP_SCORE_SHEET.nov
    scoreSheetFile = info.file
    scoreRId = info.rId
    visibleSheetFile = scoreSheetFile
    visibleRId = scoreRId
  } else if (section === 'semester') {
    const semId = monthId === 'sem2' ? 'sem2' : 'sem1'
    const info = SEMESTER_TO_TPP_SCORE_SHEET[semId]
    scoreSheetFile = info.file
    scoreRId = info.rId
    visibleSheetFile = scoreSheetFile
    visibleRId = scoreRId
  } else if (section === 'ranking_monthly') {
    const info = MONTH_TO_TPP_RANKING_SHEET[monthId] || MONTH_TO_TPP_RANKING_SHEET.nov
    scoreSheetFile = info.scoreFile
    scoreRId = info.scoreRId
    visibleSheetFile = info.rankingFile
    visibleRId = info.rankingRId
  } else {
    // ranking_semester
    const semId = monthId === 'sem2' ? 'sem2' : 'sem1'
    const info = SEMESTER_TO_TPP_RANKING_SHEET[semId]
    scoreSheetFile = info.scoreFile
    scoreRId = info.scoreRId
    visibleSheetFile = info.rankingFile
    visibleRId = info.rankingRId
  }

  const keepTargets = new Set([
    'xl/worksheets/sheet15.xml', // inforS
    'xl/worksheets/sheet16.xml', // inforT
    `xl/worksheets/${scoreSheetFile}`,
  ])
  const keepRIds = new Set(['rId15', 'rId16', scoreRId])

  if (isRanking) {
    keepTargets.add(`xl/worksheets/${visibleSheetFile}`)
    keepRIds.add(visibleRId)
  }

  // 2. Remove heavy decorative media, unused drawing binaries, activeX, and calcChain
  for (const path of Object.keys(zip.files)) {
    if (
      path.startsWith('xl/media/') ||
      path.startsWith('xl/drawings/') ||
      path.startsWith('xl/activeX/') ||
      path.startsWith('xl/ctrlProps/') ||
      path.startsWith('xl/printerSettings/')
    ) {
      zip.remove(path)
    }
  }
  zip.remove('xl/calcChain.xml')
  zip.remove('xl/vbaProject.bin')

  // 3. Remove all other 142 worksheets
  for (const path of Object.keys(zip.files)) {
    if (path.startsWith('xl/worksheets/sheet') && !keepTargets.has(path)) {
      zip.remove(path)
    }
  }

  // 4. Update inforT (Sheet 16)
  const inforTFile = zip.file('xl/worksheets/sheet16.xml')
  if (inforTFile) {
    const inforTXml = await inforTFile.async('string')
    const updatedInforT = updateInforT(inforTXml, data.teacher)
    zip.file('xl/worksheets/sheet16.xml', updatedInforT)
  }

  // 5. Update inforS (Sheet 15)
  const inforSFile = zip.file('xl/worksheets/sheet15.xml')
  if (inforSFile) {
    const inforSXml = await inforSFile.async('string')
    const updatedInforS = updateInforS(inforSXml, data.students)
    zip.file('xl/worksheets/sheet15.xml', updatedInforS)
  }

  // 6. Update score worksheet with student marks
  const scoreFile = zip.file(`xl/worksheets/${scoreSheetFile}`)
  if (scoreFile && data.monthlyScores) {
    let scoreXml = await scoreFile.async('string')
    if (isSemester) {
      scoreXml = updateSemesterScoreSheet(scoreXml, data.monthlyScores, data.students)
    } else {
      scoreXml = updateMonthlyScoreSheet(scoreXml, data.monthlyScores, data.students)
    }
    zip.file(`xl/worksheets/${scoreSheetFile}`, scoreXml)
  }

  // 7. Strip drawings / legacyDrawings from all kept worksheets
  for (const path of keepTargets) {
    const basename = path.replace('xl/worksheets/', '')
    zip.remove(`xl/worksheets/_rels/${basename}.rels`)
    const sf = zip.file(path)
    if (sf) {
      let sXml = await sf.async('string')
      sXml = sXml.replace(/<drawing [^>]*\/>/g, '').replace(/<legacyDrawing [^>]*\/>/g, '')
      zip.file(path, sXml)
    }
  }

  // 8. Update workbook.xml: hide background sheets in Excel, set target visible sheet as active
  const wbFile = zip.file('xl/workbook.xml')
  if (wbFile) {
    let wbXml = await wbFile.async('string')
    wbXml = wbXml.replace(/<sheet [^>]*\/>/g, (full) => {
      // Background sheets: inforS and inforT are always hidden
      if (full.includes('r:id="rId15"') || full.includes('r:id="rId16"')) {
        return full.replace(/sheetId="([^"]+)"/, 'sheetId="$1" state="hidden"')
      }
      // If ranking sheet is target, scoreSheet is also hidden
      if (isRanking && full.includes(`r:id="${scoreRId}"`)) {
        return full.replace(/sheetId="([^"]+)"/, 'sheetId="$1" state="hidden"')
      }
      // Visible target sheet
      if (full.includes(`r:id="${visibleRId}"`)) return full
      return ''
    })
    const activeTabIndex = isRanking ? 3 : 2
    wbXml = wbXml
      .replace(/activeTab="\d+"/, `activeTab="${activeTabIndex}"`)
      .replace(/firstSheet="\d+"/, 'firstSheet="0"')
      .replace(/showSheetTabs="0"/, 'showSheetTabs="1"')
    zip.file('xl/workbook.xml', wbXml)
  }

  // 9. Update xl/_rels/workbook.xml.rels
  const relsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (relsFile) {
    let relsXml = await relsFile.async('string')
    relsXml = relsXml.replace(/<Relationship [^>]*\/>/g, (full) => {
      for (const rId of keepRIds) {
        if (full.includes(`Id="${rId}"`)) return full
      }
      if (full.includes('styles') || full.includes('sharedStrings') || full.includes('theme')) return full
      return ''
    })
    zip.file('xl/_rels/workbook.xml.rels', relsXml)
  }

  // 10. Update [Content_Types].xml
  const ctFile = zip.file('[Content_Types].xml')
  if (ctFile) {
    let ctXml = await ctFile.async('string')
    ctXml = ctXml.replace(
      /application\/vnd\.ms-excel\.sheet\.macroEnabled\.main\+xml/g,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    )
    ctXml = ctXml.replace(/<Override [^>]*\/>/g, (full) => {
      for (const t of keepTargets) {
        const basename = t.replace('xl/worksheets/', '')
        if (full.includes(basename)) return full
      }
      if (
        full.includes('styles.xml') ||
        full.includes('theme1.xml') ||
        full.includes('sharedStrings.xml') ||
        full.includes('workbook.xml')
      ) {
        return full
      }
      return ''
    })
    zip.file('[Content_Types].xml', ctXml)
  }

  // 11. Return binary buffer
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 1 },
  })
}

/**
 * Converts a macro-enabled `.xlsm` workbook ZIP archive to a clean standard `.xlsx`
 * by stripping VBA binaries and updating Content_Types. This allows universal opening
 * on iPads, Chromebooks, and Android devices without "Untrusted Macro" warnings.
 * Also enables workbook sheet tabs so teachers can easily click between all 145 sheets.
 */
async function convertToCleanXlsx(zip: JSZip): Promise<void> {
  // 1. Remove binary VBA project
  zip.remove('xl/vbaProject.bin')

  // 2. Adjust [Content_Types].xml
  const ctFile = zip.file('[Content_Types].xml')
  if (ctFile) {
    const ctXml = await ctFile.async('string')
    const updatedCt = ctXml.replace(
      /application\/vnd\.ms-excel\.sheet\.macroEnabled\.main\+xml/g,
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml',
    )
    zip.file('[Content_Types].xml', updatedCt)
  }

  // 3. Remove VBA relationship from xl/_rels/workbook.xml.rels
  const relsFile = zip.file('xl/_rels/workbook.xml.rels')
  if (relsFile) {
    const relsXml = await relsFile.async('string')
    const updatedRels = relsXml.replace(/<Relationship[^>]*Target="vbaProject\.bin"[^>]*\/>/g, '')
    zip.file('xl/_rels/workbook.xml.rels', updatedRels)
  }

  // 4. Ensure sheet tabs are visible in xl/workbook.xml for manual tab clicking without VBA
  const wbFile = zip.file('xl/workbook.xml')
  if (wbFile) {
    const wbXml = await wbFile.async('string')
    const updatedWb = wbXml.replace(/showSheetTabs="0"/g, 'showSheetTabs="1"')
    zip.file('xl/workbook.xml', updatedWb)
  }
}

/**
 * Injects teacher data, student roster, and class info into the master TPP workbook.
 *
 * @param templateBuffer The raw binary buffer of `TPP2026_PERFECT.xlsm`
 * @param data The payload containing teacher, class, and students
 * @param options Target format: 'xlsm' (default) preserves VBA; 'xlsx' produces clean macro-free Excel
 */
export async function fillTppMasterWorkbook(
  templateBuffer: Buffer,
  data: TppMasterPayload,
  options?: { format?: 'xlsm' | 'xlsx' },
): Promise<Buffer> {
  const zip = await JSZip.loadAsync(templateBuffer)

  // 1. Update inforT (Sheet 16)
  const inforTFile = zip.file('xl/worksheets/sheet16.xml')
  if (inforTFile) {
    const inforTXml = await inforTFile.async('string')
    const updatedInforT = updateInforT(inforTXml, data.teacher)
    zip.file('xl/worksheets/sheet16.xml', updatedInforT)
  }

  // 2. Update inforS (Sheet 15)
  const inforSFile = zip.file('xl/worksheets/sheet15.xml')
  if (inforSFile) {
    const inforSXml = await inforSFile.async('string')
    const updatedInforS = updateInforS(inforSXml, data.students)
    zip.file('xl/worksheets/sheet15.xml', updatedInforS)
  }

  // 3. Update Score Sheet if scores provided
  if (data.monthlyScores?.monthId) {
    if (data.monthlyScores.monthId === 'sem1' || data.monthlyScores.monthId === 'sem2') {
      const sheetPath = data.monthlyScores.monthId === 'sem2' ? 'xl/worksheets/sheet99.xml' : 'xl/worksheets/sheet95.xml'
      const semFile = zip.file(sheetPath)
      if (semFile) {
        const semXml = await semFile.async('string')
        const updatedSemXml = updateSemesterScoreSheet(
          semXml,
          data.monthlyScores,
          data.students,
        )
        zip.file(sheetPath, updatedSemXml)
      }
    } else {
      const sheetPath = MONTH_TO_TPP_SHEET[data.monthlyScores.monthId]
      if (sheetPath) {
        const monthFile = zip.file(sheetPath)
        if (monthFile) {
          const monthXml = await monthFile.async('string')
          const updatedMonthXml = updateMonthlyScoreSheet(
            monthXml,
            data.monthlyScores,
            data.students,
          )
          zip.file(sheetPath, updatedMonthXml)
        }
      }
    }
  }

  // 4. Convert to clean .xlsx if requested
  const format = options?.format ?? data.format ?? 'xlsm'
  if (format === 'xlsx') {
    await convertToCleanXlsx(zip)
  }

  // 5. Generate finished binary
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 1 },
  })
}


