"use client"

/**
 * Bulk import from the MoEYS-shaped spreadsheet.
 *
 * The old flow was fire-and-forget: pick a file and rows were inserted
 * immediately, with the only feedback a count in a toast. A misaligned column
 * or a header row counted as data therefore reached the database, and undoing
 * it meant deleting students one at a time from the roster.
 *
 * There is a preview step now. Parsing is local and free, so the teacher sees
 * exactly what will be created — and which rows were skipped and why — before
 * anything is written.
 */

import { useRef, useState } from "react"
import { AlertTriangle, Download, FileSpreadsheet, Upload } from "lucide-react"
import * as XLSX from "xlsx-js-style"

import { Button } from "@/components/ui/actions/Button"
import { Dialog } from "@/components/ui/overlay/Dialog"
import { notify } from "@/components/ui/feedback/notify"
import { getErrorMessage } from "@/lib/utils/errors"
import { toKhmerNumber } from "@/lib/utils/khmer-num"
import type { StudentImportRow } from "@/lib/types"
import type { SheetImportRow } from "@/lib/utils/xlsx"

export interface ParseResult {
  valid: { rowNumber: number; student: StudentImportRow }[]
  skipped: { rowNumber: number; reason: string }[]
  /** Rows that import but with a value the teacher should look at. */
  warnings: { rowNumber: number; reason: string }[]
}

const text = (cell: SheetImportRow[number] | undefined) => (cell ?? "").toString().trim()
const flag = (cell: SheetImportRow[number] | undefined) => text(cell) !== ""

/**
 * Excel stores a date as days since 1899-12-30. A CSV gives a string, which
 * arrives as either `YYYY-MM-DD` or `DD-MM-YYYY` depending on the teacher's
 * locale — both are accepted, and anything else is reported rather than
 * silently stored as an unparseable string.
 */
function parseDob(raw: SheetImportRow[number] | undefined): { value: string; ok: boolean } {
  if (raw === undefined || raw === null || raw === "") return { value: "", ok: true }

  if (typeof raw === "number") {
    const date = new Date(Math.round((raw - 25569) * 86400 * 1000))
    if (Number.isNaN(date.getTime())) return { value: "", ok: false }
    return { value: date.toISOString().split("T")[0], ok: true }
  }

  let value = raw.toString().trim()
  const parts = value.split(/[-/]/)
  if (parts.length === 3 && parts[0].length === 2) value = `${parts[2]}-${parts[1]}-${parts[0]}`
  if (Number.isNaN(new Date(value).getTime())) return { value: "", ok: false }
  return { value, ok: true }
}

function parseOrphan(raw: SheetImportRow[number] | undefined): string {
  const value = text(raw)
  if (!value) return "ទេ"
  if (value.includes("ទាំងពីរ")) return "កំព្រាទាំងពីរ"
  if (value.includes("ម្តាយ")) return "កំព្រាម្តាយ"
  if (value.includes("ឪពុក")) return "កំព្រាឪពុក"
  return "កំព្រាទាំងពីរ"
}

/** Column order matches `public/sample_data.xlsx`. */
export function parseSheet(rows: SheetImportRow[]): ParseResult {
  const result: ParseResult = { valid: [], skipped: [], warnings: [] }

  rows.slice(1).forEach((row, index) => {
    const rowNumber = index + 2 // 1-based, and the header occupies row 1
    if (!row || row.every((cell) => text(cell) === "")) return // blank spacer row

    const student_id = text(row[0])
    const name_kh = text(row[2])
    if (!student_id) {
      result.skipped.push({ rowNumber, reason: "គ្មានអត្តលេខ" })
      return
    }
    if (!name_kh) {
      result.skipped.push({ rowNumber, reason: "គ្មានឈ្មោះសិស្ស" })
      return
    }

    const dob = parseDob(row[5])
    if (!dob.ok) result.warnings.push({ rowNumber, reason: "ថ្ងៃខែឆ្នាំកំណើតមិនត្រឹមត្រូវ — នឹងទុកទទេ" })

    result.valid.push({
      rowNumber,
      student: {
        student_id, grade: text(row[1]), name_kh, name_latin: text(row[3]),
        gender: text(row[4]), dob: dob.value, phone: text(row[6]),
        birth_province: text(row[7]), birth_district: text(row[8]),
        birth_commune: text(row[9]), birth_village: text(row[10]),
        curr_province: text(row[11]), curr_district: text(row[12]),
        curr_commune: text(row[13]), curr_village: text(row[14]),
        is_new_student: flag(row[15]), is_repeater: flag(row[16]),
        orphan_status: parseOrphan(row[17]), is_disabled: flag(row[18]),
        poor_status: flag(row[19]) ? "ក្រ១" : flag(row[20]) ? "ក្រ២" : "គ្មាន",
        is_equity: flag(row[21]), is_scholarship: flag(row[22]),
        father_name: text(row[23]), father_job: text(row[24]),
        mother_name: text(row[25]), mother_job: text(row[26]),
        guardian_name: text(row[27]), guardian_job: text(row[28]),
        ethnicity: text(row[29]), special_features: text(row[30]),
        other_remarks: text(row[31]), photo_url: text(row[32]),
      },
    })
  })

  // A duplicated id inside one file fails the whole insert on the unique index,
  // so it is worth naming before the round trip.
  const seen = new Map<string, number>()
  result.valid.forEach(({ student, rowNumber }) => {
    const id = student.student_id ?? ""
    const first = seen.get(id)
    if (first !== undefined) {
      result.warnings.push({ rowNumber, reason: `អត្តលេខ ${id} ស្ទួនជាមួយជួរទី ${toKhmerNumber(first)}` })
    } else {
      seen.set(id, rowNumber)
    }
  })

  return result
}

async function readRows(file: File): Promise<SheetImportRow[]> {
  if (file.name.toLowerCase().endsWith(".csv")) {
    const raw = await file.text()
    const lines = raw.split(/\r?\n/).filter((line) => line.trim())
    if (!lines.length) return []
    const separator = lines[0].includes(";") ? ";" : ","
    return lines.map((line) => line.split(separator).map((cell) => cell.trim().replace(/^"|"$/g, "")))
  }

  const workbook = XLSX.read(await file.arrayBuffer())
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  return XLSX.utils.sheet_to_json<SheetImportRow>(sheet, { header: 1 })
}

export function ImportDialog({
  open, onClose, onImport, onDownloadTemplate,
}: {
  open: boolean
  onClose: () => void
  /** Resolves to an error message, or `null` on success. */
  onImport: (students: StudentImportRow[]) => Promise<string | null>
  onDownloadTemplate: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [fileName, setFileName] = useState("")
  const [parsed, setParsed] = useState<ParseResult | null>(null)
  const [isReading, setIsReading] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [isDragging, setIsDragging] = useState(false)

  const reset = () => { setFileName(""); setParsed(null); if (inputRef.current) inputRef.current.value = "" }

  const close = () => { if (!isImporting) { reset(); onClose() } }

  const handleFile = async (file: File | undefined | null) => {
    if (!file) return
    setIsReading(true)
    setParsed(null)
    setFileName(file.name)
    try {
      const rows = await readRows(file)
      if (rows.length <= 1) {
        notify.error("ឯកសារនេះគ្មានជួរទិន្នន័យសិស្សទេ។")
        reset()
        return
      }
      setParsed(parseSheet(rows))
    } catch (err) {
      notify.error(`មិនអាចអានឯកសារបានទេ៖ ${getErrorMessage(err)}`)
      reset()
    } finally {
      setIsReading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const commit = async () => {
    if (!parsed?.valid.length) return
    setIsImporting(true)
    const error = await onImport(parsed.valid.map((row) => row.student))
    setIsImporting(false)
    if (!error) reset()
  }

  const validCount = parsed?.valid.length ?? 0

  return (
    <Dialog
      open={open}
      onClose={close}
      size="lg"
      title="នាំចូលទិន្នន័យសិស្ស"
      description="ពិនិត្យមើលទិន្នន័យជាមុនសិន មុននឹងបញ្ចូលទៅក្នុងបញ្ជី។"
      dismissible={!isImporting}
      footer={
        parsed ? (
          <>
            <Button variant="secondary" onClick={reset} disabled={isImporting} printHidden={false}>
              ជ្រើសឯកសារផ្សេង
            </Button>
            <Button variant="success" onClick={commit} loading={isImporting} disabled={validCount === 0} printHidden={false}
              icon={<Upload className="h-4 w-4" />}>
              បញ្ចូល {toKhmerNumber(validCount)} នាក់
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={close} printHidden={false}>បិទ</Button>
        )
      }
    >
      {!parsed ? (
        <div className="space-y-3">
          <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={(e) => { e.preventDefault(); setIsDragging(false); void handleFile(e.dataTransfer.files?.[0]) }}
            className={[
              "flex flex-col items-center gap-3 rounded-xl border-2 border-dashed p-8 text-center transition-colors",
              isDragging ? "border-brand bg-brand/5" : "border-divider bg-paper",
            ].join(" ")}
          >
            <FileSpreadsheet className="h-9 w-9 text-text-muted" aria-hidden="true" />
            <div>
              <p className="text-sm font-bold text-text-heading">ទម្លាក់ឯកសារ Excel ឬ CSV នៅទីនេះ</p>
              <p className="mt-1 text-xs text-text-muted">ទិន្នន័យនឹងមិនត្រូវបានរក្សាទុកភ្លាមៗទេ។</p>
            </div>
            <Button type="button" variant="secondary" size="sm" loading={isReading}
              onClick={() => inputRef.current?.click()}>
              ជ្រើសរើសឯកសារ
            </Button>
            <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" className="sr-only"
              onChange={(e) => void handleFile(e.target.files?.[0])} />
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-divider bg-paper p-3">
            <p className="text-xs leading-5 text-text-muted">
              មិនប្រាកដពីទម្រង់ជួរឈរ? ទាញយកគំរូ Excel ដែលមានលំដាប់ត្រឹមត្រូវ។
            </p>
            <Button type="button" variant="ghost" size="sm" icon={<Download className="h-3.5 w-3.5" />}
              onClick={onDownloadTemplate}>
              គំរូ Excel
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="truncate text-xs text-text-muted" title={fileName}>{fileName}</p>

          <div className="grid grid-cols-3 gap-2">
            <SummaryTile label="នឹងបញ្ចូល" value={validCount} tone="success" />
            <SummaryTile label="រំលង" value={parsed.skipped.length} tone="danger" />
            <SummaryTile label="គួរពិនិត្យ" value={parsed.warnings.length} tone="warning" />
          </div>

          {validCount > 0 && (
            <div className="overflow-hidden rounded-lg border border-divider">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[30rem] text-sm">
                  <thead className="bg-paper text-left text-xs font-extrabold text-text-muted">
                    <tr>
                      <th scope="col" className="px-3 py-2">អត្តលេខ</th>
                      <th scope="col" className="px-3 py-2">ឈ្មោះ</th>
                      <th scope="col" className="px-3 py-2">ថ្នាក់</th>
                      <th scope="col" className="px-3 py-2">ភេទ</th>
                      <th scope="col" className="px-3 py-2">ថ្ងៃកំណើត</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-divider">
                    {parsed.valid.slice(0, 6).map(({ student, rowNumber }) => (
                      <tr key={rowNumber} className="text-text-body">
                        <td className="px-3 py-2 font-bold text-text-heading">{student.student_id}</td>
                        <td className="max-w-[12rem] truncate px-3 py-2">{student.name_kh}</td>
                        <td className="px-3 py-2">{student.grade || "—"}</td>
                        <td className="px-3 py-2">{student.gender || "—"}</td>
                        <td className="px-3 py-2 tabular-nums">{student.dob || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {validCount > 6 && (
                <p className="border-t border-divider bg-paper px-3 py-2 text-xs text-text-muted">
                  និង {toKhmerNumber(validCount - 6)} នាក់ទៀត។
                </p>
              )}
            </div>
          )}

          {(parsed.skipped.length > 0 || parsed.warnings.length > 0) && (
            <div className="rounded-lg border border-warning/30 bg-warning/5 p-3">
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-warning">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                ជួរដែលត្រូវកត់សម្គាល់
              </p>
              <ul className="mt-2 max-h-32 space-y-1 overflow-y-auto text-xs leading-5 text-text-body">
                {[...parsed.skipped.map((r) => ({ ...r, skipped: true })), ...parsed.warnings.map((r) => ({ ...r, skipped: false }))]
                  .slice(0, 20)
                  .map((row, index) => (
                    <li key={`${row.rowNumber}-${index}`}>
                      <span className="font-bold">ជួរទី {toKhmerNumber(row.rowNumber)}</span>
                      {" — "}
                      {row.reason}
                      {row.skipped && <span className="ml-1 text-danger">(រំលង)</span>}
                    </li>
                  ))}
              </ul>
            </div>
          )}

          {validCount === 0 && (
            <p className="rounded-lg border border-danger/30 bg-danger/5 p-3 text-sm text-danger">
              គ្មានជួរណាមួយអាចបញ្ចូលបានទេ។ សូមពិនិត្យលំដាប់ជួរឈរធៀបនឹងគំរូ Excel។
            </p>
          )}
        </div>
      )}
    </Dialog>
  )
}

function SummaryTile({ label, value, tone }: { label: string; value: number; tone: "success" | "danger" | "warning" }) {
  const tones = {
    success: "border-success/30 bg-success/5 text-success",
    danger: "border-danger/30 bg-danger/5 text-danger",
    warning: "border-warning/30 bg-warning/5 text-warning",
  } as const
  return (
    <div className={`rounded-lg border p-3 text-center ${value === 0 ? "border-divider bg-paper text-text-muted" : tones[tone]}`}>
      <p className="text-xl font-extrabold tabular-nums">{toKhmerNumber(value)}</p>
      <p className="mt-0.5 text-[11px] font-bold">{label}</p>
    </div>
  )
}
