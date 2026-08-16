'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { UserPlus, Printer, Trash2, Save, Search, Trash, ChevronRight } from 'lucide-react'

import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { Button } from '@/components/ui/actions/Button'
import { notify } from '@/components/ui/feedback/notify'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { DataTable, type Column } from '@/components/ui/data/DataTable'
import Select from '@/components/ui/forms/Select'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import Pagination from '@/components/ui/navigation/Pagination'
import { controlClass } from '@/components/ui/forms/fieldStyles'

import { deleteStudent, deleteAllStudents, saveStudentsOrder } from './actions'
import type { Student } from '@/lib/types'
import { fromKhmerNumber, toKhmerNumber } from '@/lib/utils/khmer-num'
import { calculateAge } from '@/lib/utils/date'
import { getDriveImageUrl } from '@/lib/utils/drive-image'
import { useActiveClass } from '@/lib/hooks/useActiveClass'

/**
 * The class roster.
 *
 * It carries the twenty-five MoEYS columns a teacher is required to keep, and
 * that is not negotiable — none were dropped. What changed is how they are
 * reached:
 *
 *   desktop  the full table, unchanged in content, inside `DataTable`
 *   phone    name, student number, sex and age as a list; the remaining
 *            columns live on the pupil's own page, one tap away
 *
 * That is the point of the new `/students/[id]` route. Previously the only way
 * to read a pupil's guardian or birthplace on a phone was to drag a 25-column
 * table sideways; now the table is the index and the detail page is the record.
 * Nothing is hidden — it is re-laid-out.
 *
 * SORTING AND `order_index`
 * Sorting stays in this component rather than moving to `DataTable`'s own
 * column sort, because "រក្សាទុកលំដាប់នេះ" persists whatever order is on screen
 * into `order_index`. If the table sorted itself, that button would write an
 * order the teacher never chose.
 */

const SORT_OPTIONS = [
  { value: 'default', label: 'លំដាប់ដើម' },
  { value: 'id_asc', label: 'អ.ល ↑' },
  { value: 'id_desc', label: 'អ.ល ↓' },
  { value: 'name_asc', label: 'ឈ្មោះ ក→អ' },
  { value: 'name_desc', label: 'ឈ្មោះ អ→ក' },
]

const formatLocation = (v?: string | null, c?: string | null, d?: string | null, p?: string | null) => {
    const parts = [v, c, d, p].filter(Boolean)
    return parts.length > 0 ? parts.join(' ') : '-'
}

const formatParent = (name?: string | null, job?: string | null) => {
    if (!name && !job) return '-'
    let res = name ? name.trim() : 'មិនស្គាល់'
    if (job && job.trim()) res += ` (${job.trim()})`
    return res
}

const formatDateDisplay = (dobStr: string) => {
    if (!dobStr) return '-'
    const parts = dobStr.split('-')
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`
    return dobStr
}

const tick = (on: boolean | null | undefined) => (on ? '✓' : '')

function sortRoster(list: Student[], sortKey: string): Student[] {
    const arr = [...list]

    if (sortKey === 'default') {
        arr.sort((a, b) => {
            if (a.order_index !== undefined && b.order_index !== undefined && a.order_index !== null && b.order_index !== null) {
                return a.order_index - b.order_index
            }
            return new Date(a.created_at || 0).getTime() - new Date(b.created_at || 0).getTime()
        })
        return arr
    }

    arr.sort((a, b) => {
        if (sortKey === 'id_asc' || sortKey === 'id_desc') {
            const cmp = fromKhmerNumber(a.student_id).localeCompare(
                fromKhmerNumber(b.student_id), 'en', { numeric: true },
            )
            return sortKey === 'id_asc' ? cmp : -cmp
        }
        if (sortKey === 'name_asc' || sortKey === 'name_desc') {
            const cmp = String(a.name_kh || '').replace(/\s/g, '')
                .localeCompare(String(b.name_kh || '').replace(/\s/g, ''), 'km')
            return sortKey === 'name_asc' ? cmp : -cmp
        }
        return 0
    })
    return arr
}

export default function StudentTableClient({ initialStudents }: { initialStudents: Student[] }) {
    const router = useRouter()
    // Which class the roster belongs to. Null on a pre-V2 account, in which case
    // the server action falls back to the legacy teacher-wide behaviour.
    const { classId, className } = useActiveClass()
    // The page remounts this component (via `key`) when ?class= changes, so the
    // initialiser re-runs with the new roster — no syncing effect needed.
    const [students, setStudents] = useState<Student[]>(initialStudents)
    const [sortKey, setSortKey] = useState('default')
    const [query, setQuery] = useState('')
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [isSavingOrder, setIsSavingOrder] = useState(false)
    const [photoUrl, setPhotoUrl] = useState<string | null>(null)
    const { confirm, dialog } = useConfirm()

    // Sorted but unfiltered. `saveStudentsOrder` writes from this, never from the
    // search results — persisting a filtered view would renumber the matches and
    // leave everyone else's `order_index` pointing at the old positions.
    const sortedAll = useMemo(() => sortRoster(students, sortKey), [students, sortKey])

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase()
        if (!q) return sortedAll
        return sortedAll.filter((s) =>
            [s.name_kh, s.name_en, s.student_id, fromKhmerNumber(s.student_id)]
                .some((f) => String(f ?? '').toLowerCase().includes(q)),
        )
    }, [sortedAll, query])

    // Clamp the page so deleting rows, searching, or growing the page size can
    // never strand the table on an empty page.
    const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
    const page = Math.min(currentPage, totalPages)
    const startIdx = (page - 1) * pageSize
    const rows = visible.slice(startIdx, startIdx + pageSize)

    const handleDelete = async (s: Student) => {
        if (await confirm({
            title: 'លុបសិស្ស',
            message: `ព័ត៌មានរបស់ ${s.name_kh} នឹងត្រូវលុបចេញជាអចិន្ត្រៃយ៍។`,
        })) {
            const res = await deleteStudent(s.id)
            if (res.error) {
                notify.error(res.error)
                return
            }
            setStudents((list) => list.filter((x) => x.id !== s.id))
            notify.success(`បានលុប ${s.name_kh}`)
        }
    }

    const handleDeleteAll = async () => {
        // Name the class in the prompt: with several classes per teacher, a bare
        // "delete all students" is ambiguous about how much is about to go.
        const scopeLabel = className ? `ថ្នាក់ ${className}` : 'ថ្នាក់នេះ'
        if (await confirm({
            title: 'លុបសិស្សទាំងអស់',
            message: `ទិន្នន័យសិស្សទាំងអស់ក្នុង${scopeLabel} នឹងត្រូវលុបចេញជាអចិន្ត្រៃយ៍។ សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។`,
            confirmLabel: 'លុបទាំងអស់',
        })) {
            const res = await deleteAllStudents(classId ?? undefined)
            if (res.error) {
                notify.error(res.error)
                return
            }
            setStudents([])
            notify.success('បានលុបសិស្សទាំងអស់')
        }
    }

    const handleSaveOrder = async () => {
        if (!(await confirm({
            title: 'រក្សាទុកលំដាប់',
            message: 'លំដាប់សិស្សថ្មីនេះនឹងជំនួសលំដាប់ចាស់។',
            tone: 'warning',
            confirmLabel: 'រក្សាទុក',
        }))) return

        setIsSavingOrder(true)
        const toastId = notify.loading('កំពុងរក្សាទុកលំដាប់...')
        const res = await saveStudentsOrder(sortedAll.map((s) => s.id))
        notify.settle(toastId, !res.error, res.error ?? 'រក្សាទុកលំដាប់ប្រកបដោយជោគជ័យ')
        setIsSavingOrder(false)
    }

    const columns: Column<Student>[] = [
        {
            key: 'no', header: 'ល.រ', align: 'center', width: 'w-12', hideOnMobile: true,
            cell: (s) => toKhmerNumber(visible.indexOf(s) + 1),
        },
        { key: 'student_id', header: 'អ.ល', secondary: true, cell: (s) => s.student_id || '-' },
        {
            key: 'name', header: 'គោត្តនាម និងនាម', primary: true, width: 'min-w-[200px]',
            cell: (s) => (
                <span className="flex items-center gap-2">
                    {s.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element -- user-pasted remote image; next/image needs an allow-listed host and adds nothing at 24px
                        <img
                            src={getDriveImageUrl(s.photo_url)}
                            alt=""
                            referrerPolicy="no-referrer"
                            className="h-6 w-6 shrink-0 cursor-zoom-in rounded-full border border-divider object-cover"
                            onClick={(e) => { e.stopPropagation(); setPhotoUrl(getDriveImageUrl(s.photo_url)) }}
                        />
                    ) : (
                        <span className="h-6 w-6 shrink-0 rounded-full border border-divider bg-paper" aria-hidden="true" />
                    )}
                    <span className="font-bold text-brand">{s.name_kh}</span>
                </span>
            ),
        },
        { key: 'gender', header: 'ភេទ', secondary: true, cell: (s) => s.gender || '-' },
        { key: 'dob', header: 'ថ្ងៃខែឆ្នាំកំណើត', hideOnMobile: true, cell: (s) => formatDateDisplay(s.dob) },
        {
            key: 'age', header: 'អាយុ', align: 'center', secondary: true,
            cell: (s) => { const a = calculateAge(s.dob); return a === null ? '-' : `${toKhmerNumber(a)} ឆ្នាំ` },
        },
        {
            key: 'birthplace', header: 'ទីកន្លែងកំណើត', width: 'min-w-[200px]', hideOnMobile: true,
            cell: (s) => formatLocation(s.birth_village, s.birth_commune, s.birth_district, s.birth_province),
        },
        {
            key: 'father', header: 'ឈ្មោះឪពុក និង មុខរបរ', width: 'min-w-[160px]', hideOnMobile: true,
            cell: (s) => formatParent(s.father_name, s.father_job),
        },
        {
            key: 'mother', header: 'ឈ្មោះម្តាយ និង មុខរបរ', width: 'min-w-[160px]', hideOnMobile: true,
            cell: (s) => formatParent(s.mother_name, s.mother_job),
        },
        {
            key: 'guardian', header: 'អាណាព្យាបាល និងមុខរបរ', width: 'min-w-[160px]', hideOnMobile: true,
            cell: (s) => formatParent(s.guardian_name, s.guardian_job),
        },
        { key: 'phone', header: 'លេខទូរសព្ទអាណាព្យាបាល', hideOnMobile: true, cell: (s) => s.phone || '-' },
        {
            key: 'address', header: 'អាសយដ្ឋានសព្វថ្ងៃ', width: 'min-w-[200px]', hideOnMobile: true,
            cell: (s) => formatLocation(s.curr_village, s.curr_commune, s.curr_district, s.curr_province),
        },
        { key: 'new', header: 'សិស្សថ្មី', align: 'center', hideOnMobile: true, cell: (s) => tick(s.is_new_student) },
        { key: 'repeater', header: 'ស.ត្រួត', align: 'center', hideOnMobile: true, cell: (s) => tick(s.is_repeater) },
        {
            key: 'orphan', header: 'ស.កំព្រា', align: 'center', hideOnMobile: true,
            cell: (s) => (s.orphan_status !== 'ទេ' ? s.orphan_status : ''),
        },
        { key: 'disabled', header: 'ស.ពិការ', align: 'center', hideOnMobile: true, cell: (s) => tick(s.is_disabled) },
        {
            key: 'poor1', header: 'ក្រ១', align: 'center', hideOnMobile: true,
            cell: (s) => <span className="font-bold text-danger">{s.poor_status === 'ក្រ១' ? '✓' : ''}</span>,
        },
        {
            key: 'poor2', header: 'ក្រ២', align: 'center', hideOnMobile: true,
            cell: (s) => <span className="font-bold text-warning">{s.poor_status === 'ក្រ២' ? '✓' : ''}</span>,
        },
        { key: 'equity', header: 'ស.ធម៌', align: 'center', hideOnMobile: true, cell: (s) => tick(s.is_equity) },
        { key: 'scholarship', header: 'អ.រូបករណ៍', align: 'center', hideOnMobile: true, cell: (s) => tick(s.is_scholarship) },
        { key: 'special', header: 'លក្ខណៈពិសេស', width: 'min-w-[120px]', hideOnMobile: true, cell: (s) => s.special_features || '-' },
        { key: 'ethnicity', header: 'ជនជាតិភាគតិច', hideOnMobile: true, cell: (s) => s.ethnicity || '-' },
        { key: 'name_en', header: 'ឈ្មោះឡាតាំង', width: 'min-w-[120px]', hideOnMobile: true, cell: (s) => s.name_en || '-' },
        { key: 'remarks', header: 'ផ្សេងៗ', width: 'min-w-[120px]', hideOnMobile: true, cell: (s) => s.other_remarks || '-' },
    ]

    const toolbar = (
        <div className="flex flex-col gap-3 rounded-xl border border-divider bg-paper p-3 print:hidden md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
                <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                <input
                    type="search"
                    value={query}
                    onChange={(e) => { setQuery(e.target.value); setCurrentPage(1) }}
                    placeholder="ស្វែងរកតាមឈ្មោះ ឬលេខសម្គាល់"
                    aria-label="ស្វែងរកសិស្ស"
                    className={controlClass(false, 'pl-9')}
                />
            </div>

            <Select
                options={SORT_OPTIONS}
                value={sortKey}
                onChange={(v) => { setSortKey(v); setCurrentPage(1) }}
                ariaLabel="តម្រៀបតាម"
                wrapperClassName="md:w-48"
            />

            <Button
                variant="success"
                printHidden={false}
                onClick={handleSaveOrder}
                loading={isSavingOrder}
                icon={<Save className="h-4 w-4" />}
            >
                រក្សាទុកលំដាប់នេះ
            </Button>
        </div>
    )

    return (
        <PageContainer>
            <PageHeader
                title="បញ្ជីរាយនាមសិស្សានុសិស្ស"
                description={`សិស្សសរុប៖ ${toKhmerNumber(students.length)} នាក់ (ស្រី ${toKhmerNumber(students.filter((s) => s.gender === 'ស្រី').length)} នាក់)`}
                actions={
                    <>
                        <Link
                            href="/enrollment"
                            className="flex min-h-11 items-center gap-2 rounded-lg bg-success px-4 text-[13px] font-bold text-white shadow-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                            <UserPlus className="h-4 w-4" aria-hidden="true" /> បញ្ចូលសិស្សថ្មី
                        </Link>
                        <Link
                            href="/print-list"
                            className="flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 text-[13px] font-bold text-brand-contrast shadow-sm transition hover:bg-brand-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                            <Printer className="h-4 w-4" aria-hidden="true" /> ទម្រង់បោះពុម្ព និង ទាញយក
                        </Link>
                        <Button variant="danger" printHidden={false} onClick={handleDeleteAll} icon={<Trash2 className="h-4 w-4" />}>
                            លុបទាំងអស់
                        </Button>
                    </>
                }
            />

            <DataTable
                rows={rows}
                columns={columns}
                rowKey={(s) => s.id}
                caption="បញ្ជីរាយនាមសិស្សានុសិស្ស"
                toolbar={toolbar}
                onRowClick={(s) => router.push(`/students/${s.id}`)}
                empty={
                    query.trim() ? (
                        <EmptyState
                            kind="filtered"
                            title="រកមិនឃើញសិស្សដែលត្រូវនឹងការស្វែងរក"
                            description="សាកល្បងប្តូរពាក្យស្វែងរក ឬលុបវាចោល។"
                        />
                    ) : (
                        <EmptyState
                            title="មិនទាន់មានទិន្នន័យសិស្សនៅក្នុងគណនីនេះទេ"
                            description="សូមបញ្ចូលសិស្សនៅក្នុងទំព័របញ្ចូលព័ត៌មានសិស្សជាមុនសិន។"
                            action={
                                <Link
                                    href="/enrollment"
                                    className="flex min-h-11 items-center gap-2 rounded-lg bg-success px-6 text-sm font-bold text-white shadow-sm transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                                >
                                    <UserPlus className="h-4 w-4" aria-hidden="true" /> ទៅកាន់ទំព័របញ្ចូលសិស្ស
                                </Link>
                            }
                        />
                    )
                }
                actions={(s) => (
                    <div className="flex items-center justify-end gap-1">
                        <Link
                            href={`/students/${s.id}`}
                            aria-label={`ព័ត៌មានលម្អិតរបស់ ${s.name_kh}`}
                            className="flex h-9 w-9 items-center justify-center rounded-lg text-text-muted transition hover:bg-paper hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                        >
                            <ChevronRight className="h-4 w-4" aria-hidden="true" />
                        </Link>
                        <Button
                            variant="danger"
                            size="sm"
                            printHidden={false}
                            onClick={() => handleDelete(s)}
                            aria-label={`លុប ${s.name_kh}`}
                        >
                            <Trash className="h-4 w-4" />
                        </Button>
                    </div>
                )}
                footer={
                    visible.length > 0 ? (
                        <div className="print:hidden">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                totalItems={visible.length}
                                pageSize={pageSize}
                                pageSizeOptions={[10, 20, 50, 100]}
                                onPageChange={setCurrentPage}
                                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
                            />
                        </div>
                    ) : null
                }
            />

            <Dialog
                open={photoUrl !== null}
                onClose={() => setPhotoUrl(null)}
                title="រូបថតសិស្ស"
                size="sm"
            >
                {photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element -- user-pasted remote image; next/image needs an allow-listed host
                    <img src={photoUrl} referrerPolicy="no-referrer" className="h-auto w-full rounded-lg" alt="រូបថតសិស្ស" />
                )}
            </Dialog>

            {dialog}
        </PageContainer>
    )
}
