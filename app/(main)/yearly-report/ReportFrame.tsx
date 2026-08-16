'use client'

import Link from 'next/link'
import { ArrowLeft, Printer, FileSpreadsheet } from 'lucide-react'
import { Button } from '@/components/ui/actions/Button'
import type { Settings } from '@/lib/types'

/**
 * The A4 frame every yearly sub-report prints inside.
 *
 * The three reports differ only in their table; the ministry header, the
 * signature block and the print rules are identical. Keeping them here means a
 * correction to the letterhead lands on all three, rather than on whichever two
 * someone remembered.
 *
 * Landscape by default — these tables are wide. `orientation="portrait"` for the
 * narrow ones.
 */
export function ReportFrame({
  settings,
  academicYear,
  title,
  subtitle,
  summary,
  onExport,
  orientation = 'landscape',
  children,
  controls,
}: {
  settings: Settings | null
  academicYear: string
  title: string
  subtitle?: string
  /** Line printed above the table, e.g. pupil counts. */
  summary?: React.ReactNode
  onExport?: () => void
  orientation?: 'landscape' | 'portrait'
  children: React.ReactNode
  /** Filters rendered on screen only. */
  controls?: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-paper text-text-heading pb-10 print:bg-white">
      <style jsx global>{`
        @media print {
          @page { size: A4 ${orientation}; margin: 10mm; }
          body { background: white !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          .print-sheet { box-shadow: none !important; margin: 0 !important; padding: 0 !important; width: 100% !important; }
        }
        .report-table { width: 100%; border-collapse: collapse; font-size: 11pt; }
        .report-table th, .report-table td { border: 1px solid #444; padding: 4px 6px; vertical-align: middle; }
        .report-table th { background-color: #f1f5f9; font-weight: 700; text-align: center; }
      `}</style>

      <div className="no-print mx-auto mt-8 max-w-7xl px-4">
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
          <Link
            href="/yearly-report"
            className="inline-flex w-fit items-center gap-2 rounded-xl bg-bg-surface/50 px-4 py-2 font-bold text-brand shadow-sm backdrop-blur-sm transition hover:text-brand-800"
          >
            <ArrowLeft className="h-5 w-5" /> ត្រឡប់ទៅរបាយការណ៍ប្រចាំឆ្នាំ
          </Link>
          <div className="flex flex-wrap items-center gap-2">
            {controls}
            {onExport && (
              <Button variant="secondary" printHidden={false} onClick={onExport} icon={<FileSpreadsheet className="h-4 w-4" />}>
                នាំចេញ Excel
              </Button>
            )}
            <Button printHidden={false} onClick={() => window.print()} icon={<Printer className="h-4 w-4" />}>
              បោះពុម្ព
            </Button>
          </div>
        </div>
      </div>

      <div className="print-sheet mx-auto max-w-7xl bg-bg-surface p-6 shadow-lg print:bg-white md:p-10">
        <div className="mb-6 flex items-start justify-between">
          <div className="kh-moul text-[10pt] leading-relaxed" style={{ marginTop: '30pt' }}>
            <p>{settings?.management_unit_1 || 'មន្ទីរអប់រំ យុវជន និងកីឡា...'}</p>
            <p>{settings?.management_unit_2 || 'ការិយាល័យអប់រំ យុវជន និងកីឡា...'}</p>
            <p>{settings?.school_name || 'សាលា...'}</p>
            <p>ឆ្នាំសិក្សា {academicYear}</p>
          </div>
          <div className="text-center">
            <h3 className="kh-moul mb-1 text-[12pt]">ព្រះរាជាណាចក្រកម្ពុជា</h3>
            <h3 className="kh-moul mb-1 text-[12pt]">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
          </div>
        </div>

        <h2 className="kh-moul mt-4 mb-1 text-center text-[14pt] uppercase">{title}</h2>
        {subtitle && <p className="mb-4 text-center text-[11pt]">{subtitle}</p>}

        {summary && (
          <div className="mb-2 flex flex-wrap items-end justify-between gap-2 text-[11pt] font-bold">
            {summary}
            <p>ថ្នាក់ទី៖ {settings?.class_name || '..........'}</p>
          </div>
        )}

        <div className="overflow-x-auto">{children}</div>

        <div className="mt-10 flex justify-between text-[11pt]">
          <div className="text-center">
            <p className="kh-moul uppercase">{settings?.manager_role || 'នាយកសាលា'}</p>
            <p className="mt-16">{settings?.manager_name || settings?.director_name || ''}</p>
          </div>
          <div className="text-center">
            <p className="mb-1">
              ធ្វើនៅ {settings?.province_date || settings?.province_for_date || '..............'}, ថ្ងៃទី....... ខែ........... ឆ្នាំ២០២...
            </p>
            <p className="kh-moul">គ្រូបន្ទុកថ្នាក់</p>
            <p className="mt-12">{settings?.homeroom_teacher || settings?.teacher_name || ''}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

export default ReportFrame
