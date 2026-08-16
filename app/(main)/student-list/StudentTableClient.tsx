'use client'

import { useMemo, useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams, usePathname } from 'next/navigation'
import { UserPlus, Printer, Trash2, Save, Search, LayoutGrid, List, Filter, ChevronRight, Download } from 'lucide-react'

import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { useIsClient } from '@/components/ui/overlay/useIsClient'
import { Dialog } from '@/components/ui/overlay/Dialog'
import { Button } from '@/components/ui/actions/Button'
import { notify } from '@/components/ui/feedback/notify'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
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
import { useDebounce } from '@/lib/hooks/useDebounce'
import { exportStudentsToExcel } from '@/lib/utils/export'

import { StudentCard } from '@/components/ui/views/StudentCard'
import { StudentCompactTable } from '@/components/ui/views/StudentCompactTable'
import { AdvancedFilterSidebar, type FilterState as FilterOptions } from '@/components/ui/forms/AdvancedFilterSidebar'
import { BulkActionBar } from '@/components/ui/actions/BulkActionBar'

const SORT_OPTIONS = [
    { value: 'default', label: 'លំដាប់ដើម' },
    { value: 'id_asc', label: 'អ.ល ↑' },
    { value: 'id_desc', label: 'អ.ល ↓' },
    { value: 'name_asc', label: 'ឈ្មោះ ក→អ' },
    { value: 'name_desc', label: 'ឈ្មោះ អ→ក' },
]

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
    const searchParams = useSearchParams()
    const pathname = usePathname()
    const { classId, className } = useActiveClass()

    const [students, setStudents] = useState<Student[]>(initialStudents)
    const [sortKey, setSortKey] = useState('default')
    
    // View Mode State (with hydration safety)
    /**
     * The saved view, or the one this screen width deserves.
     *
     * Resolved lazily rather than in an effect. `useState` runs the initialiser
     * only on the client — the server never reaches it — so `localStorage` and
     * `innerWidth` are both safe here, and there is no second render to correct
     * the value afterwards. Hydration is kept honest by `isMounted` below, which
     * holds the server's markup until the client has taken over.
     */
    const [viewMode, setViewMode] = useState<'grid' | 'table'>(() => {
        if (typeof window === 'undefined') return 'table'
        const saved = localStorage.getItem('rosterViewMode')
        if (saved === 'grid' || saved === 'table') return saved
        return window.innerWidth < 768 ? 'grid' : 'table'
    })
    const isMounted = useIsClient()
    
    // Selection and Sidebar State
    const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
    const [isFilterOpen, setIsFilterOpen] = useState(false)
    const [photoUrl, setPhotoUrl] = useState<string | null>(null)

    // Search and Filter State
    const [query, setQuery] = useState(searchParams.get('q') || '')
    const debouncedQuery = useDebounce(query, 300)
    
    const [filters, setFilters] = useState<FilterOptions>({
        grade: [],
        gender: '',
        is_new_student: false,
        is_repeater: false,
        is_disabled: false,
        is_equity: false,
        is_scholarship: false,
        poor_status: '',
        orphan_status: '',
        minAge: 5,
        maxAge: 25
    })
    // Pagination State
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [isSavingOrder, setIsSavingOrder] = useState(false)
    const { confirm, dialog } = useConfirm()

    // Update URL query when debounced search changes
    useEffect(() => {
        const params = new URLSearchParams(searchParams.toString())
        if (debouncedQuery) params.set('q', debouncedQuery)
        else params.delete('q')
        router.replace(`${pathname}?${params.toString()}`, { scroll: false })
    }, [debouncedQuery, searchParams, pathname, router])

    const handleViewModeChange = (mode: 'grid' | 'table') => {
        setViewMode(mode)
        localStorage.setItem('rosterViewMode', mode)
    }

    // Data Processing
    const sortedAll = useMemo(() => sortRoster(students, sortKey), [students, sortKey])

    const visible = useMemo(() => {
        let arr = sortedAll

        if (filters.grade.length > 0) {
            arr = arr.filter(s => s.grade_letter && filters.grade.includes(s.grade_letter))
        }

        if (filters.gender) {
            arr = arr.filter(s => s.gender === filters.gender)
        }

        if (filters.is_new_student) arr = arr.filter(s => s.is_new_student)
        if (filters.is_repeater) arr = arr.filter(s => s.is_repeater)
        if (filters.is_disabled) arr = arr.filter(s => s.is_disabled)
        if (filters.is_equity) arr = arr.filter(s => s.is_equity)
        if (filters.is_scholarship) arr = arr.filter(s => s.is_scholarship)

        if (filters.poor_status) {
            arr = arr.filter(s => s.poor_status === filters.poor_status)
        }
        
        if (filters.orphan_status) {
            arr = arr.filter(s => s.orphan_status === filters.orphan_status)
        }

        const q = debouncedQuery.trim().toLowerCase()
        if (q) {
            arr = arr.filter((s) =>
                [s.name_kh, s.name_en, s.student_id, fromKhmerNumber(s.student_id)]
                    .some((f) => String(f ?? '').toLowerCase().includes(q)),
            )
        }
        return arr
    }, [sortedAll, debouncedQuery, filters])

    const totalPages = Math.max(1, Math.ceil(visible.length / pageSize))
    const page = Math.min(currentPage, totalPages)
    const startIdx = (page - 1) * pageSize
    const rows = visible.slice(startIdx, startIdx + pageSize)

    // Handlers
    const handleSelect = (id: string, checked: boolean) => {
        const newSet = new Set(selectedIds)
        if (checked) newSet.add(id)
        else newSet.delete(id)
        setSelectedIds(newSet)
    }

    const handleSelectAll = (checked: boolean) => {
        if (checked) {
            setSelectedIds(new Set(visible.map(s => s.id)))
        } else {
            setSelectedIds(new Set())
        }
    }

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

    const handleBulkDelete = async () => {
        if (await confirm({
            title: 'លុបសិស្ស',
            message: `អ្នកពិតជាចង់លុបសិស្សចំនួន ${toKhmerNumber(selectedIds.size)} នាក់មែនទេ? សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ។`,
            confirmLabel: 'លុប',
            tone: 'danger'
        })) {
            const toastId = notify.loading('កំពុងលុប...')
            let hasError = false
            for (const id of Array.from(selectedIds)) {
                const res = await deleteStudent(id)
                if (res.error) hasError = true
            }
            if (hasError) {
                notify.error('មានបញ្ហាក្នុងការលុបសិស្សមួយចំនួន')
            } else {
                notify.success(`បានលុបសិស្សចំនួន ${toKhmerNumber(selectedIds.size)} នាក់`)
            }
            setSelectedIds(new Set())
            setStudents(list => list.filter(s => !selectedIds.has(s.id)))
            notify.dismiss(toastId)
        }
    }

    const handleBulkExport = () => {
        const selectedStudents = sortedAll.filter(s => selectedIds.has(s.id))
        exportStudentsToExcel(selectedStudents, className || 'Students')
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

    const activeFilterCount = useMemo(() => {
        let count = 0
        if (filters.grade.length > 0) count++
        if (filters.gender) count++
        if (filters.is_new_student) count++
        if (filters.is_repeater) count++
        if (filters.is_disabled) count++
        if (filters.is_equity) count++
        if (filters.is_scholarship) count++
        if (filters.poor_status) count++
        if (filters.orphan_status) count++
        if (filters.minAge > 5 || filters.maxAge < 25) count++
        return count
    }, [filters])
    const allSelected = visible.length > 0 && selectedIds.size === visible.length

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
                            <Printer className="h-4 w-4" aria-hidden="true" /> ទម្រង់បោះពុម្ព
                        </Link>
                        <Button 
                            variant="primary"
                            printHidden={false} 
                            onClick={() => exportStudentsToExcel(students, className || 'Students')} 
                            icon={<Download className="h-4 w-4" />}
                        >
                            ទាញយក
                        </Button>
                        <Button variant="danger" printHidden={false} onClick={handleDeleteAll} icon={<Trash2 className="h-4 w-4" />}>
                            លុបទាំងអស់
                        </Button>
                    </>
                }
            />

            {/* Sticky Header Bar */}
            <div className="sticky top-0 z-30 mb-6 flex flex-col gap-3 border-b border-divider bg-bg-surface/90 p-4 pb-4 pt-4 backdrop-blur-md md:flex-row md:items-center print:hidden rounded-b-xl shadow-sm">
                <div className="relative min-w-0 flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => { setQuery(e.target.value); setCurrentPage(1) }}
                        placeholder="ស្វែងរកតាមឈ្មោះ ឬលេខសម្គាល់"
                        aria-label="ស្វែងរកសិស្ស"
                        className={controlClass(false, 'pl-9 bg-paper')}
                    />
                </div>

                <div className="flex items-center gap-2 overflow-x-auto pb-1 md:pb-0">
                    <button
                        onClick={() => setIsFilterOpen(true)}
                        className={`flex items-center gap-2 rounded-lg border border-divider px-3 py-2 text-[13px] font-medium transition-colors whitespace-nowrap ${
                            activeFilterCount > 0 
                                ? 'bg-brand/10 text-brand border-brand/20 dark:bg-brand/20 dark:text-brand-300' 
                                : 'bg-paper text-text-heading hover:bg-gray-50 dark:hover:bg-gray-800'
                        }`}
                    >
                        <Filter className="h-4 w-4" />
                        តម្រង
                        {activeFilterCount > 0 && (
                            <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand text-[11px] text-white">
                                {activeFilterCount}
                            </span>
                        )}
                    </button>

                    <Select
                        options={SORT_OPTIONS}
                        value={sortKey}
                        onChange={(v) => { setSortKey(v); setCurrentPage(1) }}
                        ariaLabel="តម្រៀបតាម"
                        wrapperClassName="w-36 shrink-0"
                    />

                    <Button
                        variant="success"
                        printHidden={false}
                        onClick={handleSaveOrder}
                        loading={isSavingOrder}
                        icon={<Save className="h-4 w-4" />}
                    >
                        រក្សាទុកលំដាប់
                    </Button>

                    <div className="mx-1 h-6 w-px bg-divider" />

                    <div className="flex shrink-0 items-center rounded-lg border border-divider bg-paper p-1">
                        <button
                            onClick={() => handleViewModeChange('grid')}
                            className={`rounded-md p-1.5 transition-colors ${viewMode === 'grid' ? 'bg-gray-100 text-brand dark:bg-gray-800' : 'text-text-muted hover:text-text-heading'}`}
                            aria-label="Grid View"
                        >
                            <LayoutGrid className="h-4 w-4" />
                        </button>
                        <button
                            onClick={() => handleViewModeChange('table')}
                            className={`rounded-md p-1.5 transition-colors ${viewMode === 'table' ? 'bg-gray-100 text-brand dark:bg-gray-800' : 'text-text-muted hover:text-text-heading'}`}
                            aria-label="Table View"
                        >
                            <List className="h-4 w-4" />
                        </button>
                    </div>
                </div>
            </div>

            {/* List Content */}
            <div className="min-h-[50vh]">
                {visible.length === 0 ? (
                    query.trim() || activeFilterCount > 0 ? (
                        <EmptyState
                            kind="filtered"
                            title="រកមិនឃើញសិស្សដែលត្រូវនឹងការស្វែងរក"
                            description="សាកល្បងប្តូរពាក្យស្វែងរក ឬលុបតម្រងចោល។"
                            action={
                                <button 
                                    onClick={() => { 
                                        setQuery(''); 
                                        setFilters({
                                            grade: [],
                                            gender: '',
                                            is_new_student: false,
                                            is_repeater: false,
                                            is_disabled: false,
                                            is_equity: false,
                                            is_scholarship: false,
                                            poor_status: '',
                                            orphan_status: '',
                                            minAge: 5,
                                            maxAge: 25
                                        }); 
                                    }}
                                    className="mt-4 rounded-lg bg-brand px-4 py-2 text-sm font-bold text-white transition hover:bg-brand-hover"
                                >
                                    លុបការស្វែងរក
                                </button>
                            }
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
                ) : (
                    isMounted && (
                        viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                                {rows.map((student, idx) => (
                                    <StudentCard
                                        key={student.id}
                                        student={student}
                                        index={startIdx + idx}
                                        isSelected={selectedIds.has(student.id)}
                                        onToggleSelect={(id) => handleSelect(id, !selectedIds.has(id))}
                                        onDelete={(s) => handleDelete(s)}
                                    />
                                ))}
                            </div>
                        ) : (
                            <div className="overflow-hidden rounded-2xl border border-divider bg-paper shadow-sm">
                                <StudentCompactTable
                                    students={rows}
                                    selectedIds={selectedIds}
                                    onToggleSelect={(id) => handleSelect(id, !selectedIds.has(id))}
                                    onToggleAll={() => handleSelectAll(!allSelected)}
                                    onSort={(col) => setSortKey(col === 'name' ? 'name_asc' : col === 'id' ? 'id_asc' : 'default')}
                                    sortConfig={{ column: sortKey.split('_')[0], direction: sortKey.endsWith('desc') ? 'desc' : 'asc' }}
                                    onAction={(action, s) => {
                                        if (action === 'view') router.push(`/students/${s.id}`)
                                        else if (action === 'edit') router.push(`/students/${s.id}?edit=true`)
                                        else if (action === 'delete') handleDelete(s)
                                    }}
                                />
                            </div>
                        )
                    )
                )}
            </div>

            {/* Pagination */}
            {visible.length > 0 && (
                <div className="mt-6 print:hidden">
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
            )}

            {/* Sidebars & Overlays */}
            <AdvancedFilterSidebar
                isOpen={isFilterOpen}
                onClose={() => setIsFilterOpen(false)}
                filters={filters}
                onFilterChange={(newFilters) => {
                    setFilters(newFilters)
                    setCurrentPage(1)
                }}
                onClear={() => {
                    setFilters({
                        grade: [],
                        gender: '',
                        is_new_student: false,
                        is_repeater: false,
                        is_disabled: false,
                        is_equity: false,
                        is_scholarship: false,
                        poor_status: '',
                        orphan_status: '',
                        minAge: 5,
                        maxAge: 25
                    })
                    setQuery('')
                }}
            />

            <BulkActionBar
                selectedCount={selectedIds.size}
                onClear={() => setSelectedIds(new Set())}
                onDelete={handleBulkDelete}
                onExport={handleBulkExport}
                onPrintID={() => notify.info('មុខងារបោះពុម្ពប័ណ្ណមិនទាន់មាននៅឡើយទេ')}
                onSendSMS={() => notify.info('មុខងារផ្ញើសារមិនទាន់មាននៅឡើយទេ')}
            />

            <Dialog
                open={photoUrl !== null}
                onClose={() => setPhotoUrl(null)}
                title="រូបថតសិស្ស"
                size="sm"
            >
                {photoUrl && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} referrerPolicy="no-referrer" className="h-auto w-full rounded-lg" alt="រូបថតសិស្ស" />
                )}
            </Dialog>

            {dialog}
        </PageContainer>
    )
}
