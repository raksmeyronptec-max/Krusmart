'use client'

/**
 * Live preview of the printed document header and signature block.
 *
 * Mirrors the canonical letterhead every printable renders from `settings`
 * (see app/(main)/yearly-report/ReportFrame.tsx — the shared frame the three
 * yearly reports use, and the structure the ~15 inline copies follow):
 * management units + school on the left, kingdom block on the right, then
 * the director / teacher signature blocks at the bottom. The four image
 * fields exist purely to print here, so the teacher sees the assembled
 * result while they type instead of discovering gaps on a handed-out report.
 *
 * Missing values render as dots — exactly what the real printables do —
 * and missing images render labelled placeholder outlines.
 */

export interface ReportHeaderValues {
  management_unit_1: string
  management_unit_2: string
  school_name: string
  academic_year: string
  manager_role: string
  director_name: string
  province_for_date: string
  homeroom_teacher: string
  school_logo: string
  director_seal: string
  teacher_signature: string
}

function ImageSlot({ src, alt, hint, className }: { src: string; alt: string; hint: string; className: string }) {
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- data-URL preview mirroring a print surface
      <img src={src} alt={alt} className={`${className} object-contain`} />
    )
  }
  return (
    <div
      className={`${className} flex items-center justify-center rounded border border-dashed border-divider bg-paper p-1 text-center text-[9px] leading-[1.7] text-text-muted`}
      lang="km"
    >
      {hint}
    </div>
  )
}

export default function ReportHeaderPreview({ values }: { values: ReportHeaderValues }) {
  const dots = '................'
  return (
    <div
      lang="km"
      aria-label="គំរូក្បាលរបាយការណ៍"
      className="select-none overflow-hidden rounded-lg border border-divider bg-white p-4 text-[10px] leading-[1.8] text-black shadow-inner dark:border-divider"
    >
      {/* Letterhead row */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2">
          <ImageSlot
            src={values.school_logo}
            alt="រូបសញ្ញាសាលា"
            hint="រូបសញ្ញាសាលា"
            className="h-12 w-12 shrink-0"
          />
          <div className="kh-moul text-[9px] leading-[2]">
            <p>{values.management_unit_1 || dots}</p>
            <p>{values.management_unit_2 || dots}</p>
            <p>{values.school_name || dots}</p>
            <p>ឆ្នាំសិក្សា {values.academic_year || '……'}</p>
          </div>
        </div>
        <div className="shrink-0 text-center">
          <p className="kh-moul text-[10px] leading-[2]">ព្រះរាជាណាចក្រកម្ពុជា</p>
          <p className="kh-moul text-[10px] leading-[2]">ជាតិ សាសនា ព្រះមហាក្សត្រ</p>
          <p aria-hidden className="text-[8px]">❧❧❧ ❖ ☙☙☙</p>
        </div>
      </div>

      <p className="kh-moul my-3 text-center text-[11px]">ចំណងជើងរបាយការណ៍</p>
      <div aria-hidden className="space-y-1.5 py-1 opacity-40">
        <div className="h-1.5 rounded bg-black/10" />
        <div className="h-1.5 rounded bg-black/10" />
        <div className="h-1.5 w-2/3 rounded bg-black/10" />
      </div>

      {/* Signature row — director left, teacher right, as every printable lays it out */}
      <div className="mt-4 flex items-start justify-between gap-2 text-[9px]">
        <div className="flex flex-col items-center text-center">
          <p className="kh-moul">{values.manager_role || 'នាយកសាលា'}</p>
          <ImageSlot
            src={values.director_seal}
            alt="ត្រានាយក"
            hint="ត្រានាយក"
            className="my-1 h-11 w-11"
          />
          <p>{values.director_name || dots}</p>
        </div>
        <div className="flex flex-col items-center text-center">
          <p>
            ធ្វើនៅ {values.province_for_date || '……'} ថ្ងៃទី…… ខែ…… ឆ្នាំ……
          </p>
          <p className="kh-moul">គ្រូបន្ទុកថ្នាក់</p>
          <ImageSlot
            src={values.teacher_signature}
            alt="ហត្ថលេខាគ្រូ"
            hint="ហត្ថលេខាគ្រូ"
            className="my-1 h-9 w-16"
          />
          <p>{values.homeroom_teacher || dots}</p>
        </div>
      </div>
    </div>
  )
}
