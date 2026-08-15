'use client'

import { useMemo, useState } from 'react'
import { UserPlus, Printer, Trash2, Save, FolderSearch, Trash } from 'lucide-react'
import Link from 'next/link'
import { deleteStudent, deleteAllStudents, saveStudentsOrder } from './actions'
import Pagination from "@/components/ui/navigation/Pagination"
import type { Student } from "@/lib/types"
import { fromKhmerNumber } from '@/lib/utils/khmer-num'
import { calculateAge } from '@/lib/utils/date'
import { useActiveClass } from '@/lib/hooks/useActiveClass'

const getDriveImageUrl = (url: string | null | undefined) => {
    if (!url) return '';
    try {
        const urlObj = new URL(url);
        if (urlObj.hostname.includes('drive.google.com')) {
            let fileId = null;
            if (urlObj.pathname.includes('/file/d/')) {
                fileId = urlObj.pathname.split('/file/d/')[1].split('/')[0];
            } else if (urlObj.searchParams.has('id')) {
                fileId = urlObj.searchParams.get('id');
            }
            if (fileId) {
                return `https://lh3.googleusercontent.com/d/${fileId}`;
            }
        }
    } catch {
        return url;
    }
    return url;
}

export default function StudentTableClient({ initialStudents }: { initialStudents: Student[] }) {
    // Which class the roster belongs to. Null on a pre-V2 account, in which case
    // the server action falls back to the legacy teacher-wide behaviour.
    const { classId, className } = useActiveClass()
    // The page remounts this component (via `key`) when ?class= changes, so the
    // initialiser re-runs with the new roster — no syncing effect needed.
    const [students, setStudents] = useState<Student[]>(initialStudents)
    const [sortKey, setSortKey] = useState('default')
    const [currentPage, setCurrentPage] = useState(1)
    const [pageSize, setPageSize] = useState(20)
    const [isSavingOrder, setIsSavingOrder] = useState(false)

    // Modals
    const [showPhotoModal, setShowPhotoModal] = useState(false)
    const [photoUrl, setPhotoUrl] = useState('')

    // Calculations
    const formatLocation = (v?: string | null, c?: string | null, d?: string | null, p?: string | null) => {
        const parts = []
        if (v) parts.push(v)
        if (c) parts.push(c)
        if (d) parts.push(d)
        if (p) parts.push(p)
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
        if (parts.length === 3) {
            return `${parts[2]}/${parts[1]}/${parts[0]}`
        }
        return dobStr
    }

    // Sort Logic
    const sortedStudents = useMemo(() => {
        const arr = [...students]
        if (sortKey === 'default') {
            arr.sort((a, b) => {
                if (a.order_index !== undefined && b.order_index !== undefined && a.order_index !== null && b.order_index !== null) {
                    return a.order_index - b.order_index
                }
                const timeA = new Date(a.created_at || 0).getTime()
                const timeB = new Date(b.created_at || 0).getTime()
                return timeA - timeB
            })
            return arr
        }

        arr.sort((a, b) => {
            if (sortKey === 'id_asc' || sortKey === 'id_desc') {
                const idA = fromKhmerNumber(a.student_id)
                const idB = fromKhmerNumber(b.student_id)
                const cmp = idA.localeCompare(idB, 'en', { numeric: true })
                return sortKey === 'id_asc' ? cmp : -cmp
            }
            if (sortKey === 'name_asc' || sortKey === 'name_desc') {
                const nameA = String(a.name_kh || '').replace(/[\s]/g, '')
                const nameB = String(b.name_kh || '').replace(/[\s]/g, '')
                const cmp = nameA.localeCompare(nameB, 'km')
                return sortKey === 'name_asc' ? cmp : -cmp
            }
            return 0
        })
        return arr
    }, [students, sortKey])

    // Pagination — clamp the page so deleting rows or growing the page size
    // can never strand the table on an empty page.
    const totalPages = Math.max(1, Math.ceil(sortedStudents.length / pageSize))
    const page = Math.min(currentPage, totalPages)
    const startIdx = (page - 1) * pageSize
    const paginatedStudents = sortedStudents.slice(startIdx, startIdx + pageSize)

    const handleSort = (key: string) => {
        setSortKey(key)
        setCurrentPage(1)
    }

    const handleDelete = async (id: string) => {
        if (confirm('តើអ្នកពិតជាចង់លុបសិស្សនេះមែនទេ?')) {
            await deleteStudent(id)
            setStudents(students.filter(s => s.id !== id))
        }
    }

    const handleDeleteAll = async () => {
        // Name the class in the prompt: with several classes per teacher, a bare
        // "delete all students" is ambiguous about how much is about to go.
        const scopeLabel = className ? `ថ្នាក់ ${className}` : 'ថ្នាក់នេះ'
        if (confirm(`ការព្រមាន៖ តើអ្នកពិតជាចង់លុបទិន្នន័យសិស្សទាំងអស់ក្នុង${scopeLabel}មែនទេ? សកម្មភាពនេះមិនអាចត្រឡប់វិញបានទេ!`)) {
            const res = await deleteAllStudents(classId ?? undefined)
            if (res.error) {
                alert(res.error)
                return
            }
            setStudents([])
        }
    }

    const handleSaveOrder = async () => {
        if (!confirm('តើអ្នកពិតជាចង់រក្សាទុកលំដាប់នេះជាអចិន្ត្រៃយ៍មែនទេ?\\n(ទំព័រវត្តមាន និងពិន្ទុ នឹងហៅឈ្មោះសិស្សតាមលំដាប់នេះ)')) return
        setIsSavingOrder(true)
        const orderedIds = sortedStudents.map(s => s.id)
        const res = await saveStudentsOrder(orderedIds)
        if (res.error) {
            alert(res.error)
        } else {
            alert('រក្សាទុកលំដាប់ប្រកបដោយជោគជ័យ!')
        }
        setIsSavingOrder(false)
    }

    return (
        <div className="min-h-screen bg-paper dark:bg-bg-app pb-20 transition-colors">

            <div className="container mx-auto p-4 md:p-6 mt-4 pb-20 max-w-[100%]">
                <div className="bg-bg-surface dark:bg-bg-surface rounded-xl shadow-sm border border-divider dark:border-divider overflow-hidden relative">
                    <div className="h-2 w-full bg-success print:hidden"></div>

                    <div className="p-6 md:p-8">
                        {/* Header & Actions */}
                        <div className="flex flex-col md:flex-row items-start md:items-center justify-between border-b border-divider dark:border-divider pb-4 mb-6 gap-4">
                            <div>
                                <h2 className="kh-moul text-brand dark:text-brand-400 text-xl">បញ្ជីរាយនាមសិស្សានុសិស្ស</h2>
                                <p className="text-sm text-text-muted dark:text-text-muted mt-1">សិស្សសរុប៖ {students.length} នាក់ (ស្រី {students.filter(s => s.gender === 'ស្រី').length} នាក់)</p>
                            </div>
                            
                            <div className="flex flex-wrap gap-2 print:hidden">
                                <Link href="/enrollment" className="bg-success hover:opacity-90 text-white px-4 py-2 rounded text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors">
                                    <UserPlus className="w-4 h-4" /> បញ្ចូលសិស្សថ្មី
                                </Link>

                                <Link href="/print-list" className="bg-brand hover:bg-brand-hover text-white px-4 py-2 rounded text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors">
                                    <Printer className="w-4 h-4" /> ទម្រង់បោះពុម្ព និង ទាញយក
                                </Link>
                                
                                <button onClick={handleDeleteAll} className="bg-danger hover:opacity-90 text-white px-4 py-2 rounded text-[13px] font-bold flex items-center gap-2 shadow-sm transition-colors ml-auto md:ml-4">
                                    <Trash2 className="w-4 h-4" /> លុបទាំងអស់
                                </button>
                            </div>
                        </div>

                        {/* Sort Controls */}
                        <div className="flex items-center gap-2 flex-wrap mb-4 p-3 bg-paper dark:bg-bg-app border border-divider dark:border-divider rounded-lg print:hidden">
                            <span className="text-[12px] text-text-body dark:text-text-body font-bold whitespace-nowrap flex items-center gap-1">
                                តម្រៀប៖
                            </span>

                            <button onClick={() => handleSort('default')} className={`px-3 py-1.5 rounded-md border text-xs font-bold transition-colors ${sortKey === 'default' ? 'border-brand bg-brand text-white' : 'border-divider bg-bg-surface text-text-body hover:bg-paper dark:bg-bg-surface dark:text-white'}`}>
                                លំដាប់ដើម
                            </button>
                            <div className="w-[1px] h-5 bg-divider mx-1"></div>
                            <button onClick={() => handleSort('id_asc')} className={`px-3 py-1.5 rounded-md border text-xs font-bold transition-colors ${sortKey === 'id_asc' ? 'border-brand bg-brand text-white' : 'border-divider bg-bg-surface text-text-body hover:bg-paper dark:bg-bg-surface dark:text-white'}`}>
                                អ.ល ↑
                            </button>
                            <button onClick={() => handleSort('id_desc')} className={`px-3 py-1.5 rounded-md border text-xs font-bold transition-colors ${sortKey === 'id_desc' ? 'border-brand bg-brand text-white' : 'border-divider bg-bg-surface text-text-body hover:bg-paper dark:bg-bg-surface dark:text-white'}`}>
                                អ.ល ↓
                            </button>
                            <div className="w-[1px] h-5 bg-divider mx-1"></div>
                            <button onClick={() => handleSort('name_asc')} className={`px-3 py-1.5 rounded-md border text-xs font-bold transition-colors ${sortKey === 'name_asc' ? 'border-brand bg-brand text-white' : 'border-divider bg-bg-surface text-text-body hover:bg-paper dark:bg-bg-surface dark:text-white'}`}>
                                ឈ្មោះ ក→អ
                            </button>
                            <button onClick={() => handleSort('name_desc')} className={`px-3 py-1.5 rounded-md border text-xs font-bold transition-colors ${sortKey === 'name_desc' ? 'border-brand bg-brand text-white' : 'border-divider bg-bg-surface text-text-body hover:bg-paper dark:bg-bg-surface dark:text-white'}`}>
                                ឈ្មោះ អ→ក
                            </button>

                            <div className="ml-auto w-full sm:w-auto mt-2 sm:mt-0">
                                <button onClick={handleSaveOrder} disabled={isSavingOrder} className="w-full sm:w-auto bg-success hover:opacity-90 disabled:opacity-50 text-white px-3 py-1.5 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 shadow-sm transition-colors">
                                    <Save className={`w-4 h-4 ${isSavingOrder ? 'animate-spin' : ''}`} /> {isSavingOrder ? 'កំពុងរក្សាទុក...' : 'រក្សាទុកលំដាប់នេះ'}
                                </button>
                            </div>
                        </div>

                        {students.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-16 px-4 bg-paper dark:bg-bg-app rounded-xl border border-dashed border-divider dark:border-divider">
                                <FolderSearch className="w-16 h-16 mb-4 text-text-muted" />
                                <h3 className="text-xl font-bold text-text-body dark:text-text-body mb-2">មិនទាន់មានទិន្នន័យសិស្សនៅក្នុងគណនីនេះទេ</h3>
                                <div className="bg-brand-100 dark:bg-brand-900/40 text-brand-800 dark:text-brand-300 p-4 rounded-lg max-w-2xl text-center text-sm shadow-sm border border-divider dark:border-brand-800">
                                    <p className="mb-2 font-bold">⚠️ បញ្ជាក់ការរក្សាទុកទិន្នន័យ៖</p>
                                    <p>សូមប្រាកដថាអ្នកបានបញ្ចូលសិស្សនៅក្នុងទំព័រ <b>បញ្ចូលសិស្សថ្មី</b> រួចរាល់។</p>
                                </div>
                                <Link href="/enrollment" className="mt-6 bg-success text-white px-6 py-2.5 rounded font-bold hover:opacity-90 transition-colors flex items-center gap-2 shadow-md">
                                    ទៅកាន់ទំព័របញ្ចូលសិស្ស
                                </Link>
                            </div>
                        ) : (
                            <div className="overflow-x-auto border border-divider dark:border-divider rounded-lg pb-4">
                                <table className="w-full text-left border-collapse text-[12px] dark:text-text-body">
                                    <thead>
                                        <tr className="bg-paper dark:bg-bg-surface text-brand dark:text-brand-400 border-b border-divider dark:border-divider">
                                            <th className="p-2 border-r border-divider dark:border-divider text-center w-10">ល.រ</th>
                                            <th className="p-2 border-r border-divider dark:border-divider min-w-[80px]">អ.ល</th>
                                            <th className="p-2 border-r border-divider dark:border-divider min-w-[180px] sticky left-0 bg-paper dark:bg-bg-surface z-20 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)]">គោត្តនាម និងនាម</th>
                                            <th className="p-2 border-r border-divider dark:border-divider">ភេទ</th>
                                            <th className="p-2 border-r border-divider dark:border-divider">ថ្ងៃខែឆ្នាំកំណើត</th>
                                            <th className="p-2 border-r border-divider dark:border-divider text-center">អាយុ</th>
                                            <th className="p-2 border-r border-divider dark:border-divider min-w-[200px]">ទីកន្លែងកំណើត</th>
                                            <th className="p-2 border-r border-divider dark:border-divider min-w-[160px]">ឈ្មោះឪពុក និង មុខរបរ</th>
                                            <th className="p-2 border-r border-divider dark:border-divider min-w-[160px]">ឈ្មោះម្តាយ និង មុខរបរ</th>
                                            <th className="p-2 border-r border-divider dark:border-divider min-w-[160px]">អាណាព្យាបាល និងមុខរបរ</th>
                                            <th className="p-2 border-r border-divider dark:border-divider">លេខទូរសព្ទអាណាព្យាបាល</th>
                                            <th className="p-2 border-r border-divider dark:border-divider min-w-[200px]">អាសយដ្ឋានសព្វថ្ងៃ</th>
                                            <th className="p-2 border-r border-divider dark:border-divider text-center">សិស្សថ្មី</th>
                                            <th className="p-2 border-r border-divider dark:border-divider text-center">ស.ត្រួត</th>
                                            <th className="p-2 border-r border-divider dark:border-divider text-center">ស.កំព្រា</th>
                                            <th className="p-2 border-r border-divider dark:border-divider text-center">ស.ពិការ</th>
                                            <th className="p-2 border-r border-divider dark:border-divider text-center">ក្រ១</th>
                                            <th className="p-2 border-r border-divider dark:border-divider text-center">ក្រ២</th>
                                            <th className="p-2 border-r border-divider dark:border-divider text-center">ស.ធម៌</th>
                                            <th className="p-2 border-r border-divider dark:border-divider text-center">អ.រូបករណ៍</th>
                                            <th className="p-2 border-r border-divider dark:border-divider min-w-[120px]">លក្ខណៈពិសេស</th>
                                            <th className="p-2 border-r border-divider dark:border-divider">ជនជាតិភាគតិច</th>
                                            <th className="p-2 border-r border-divider dark:border-divider min-w-[120px]">ឈ្មោះឡាតាំង</th>
                                            <th className="p-2 border-r border-divider dark:border-divider min-w-[120px]">ផ្សេងៗ</th>
                                            <th className="p-2 text-center sticky right-0 bg-paper dark:bg-bg-surface z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] print:hidden">សកម្មភាព</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {paginatedStudents.map((s, idx) => (
                                            <tr key={s.id} className={`border-b border-divider dark:border-divider hover:bg-brand-100 dark:hover:bg-paper ${idx % 2 === 1 ? 'bg-paper dark:bg-bg-surface/50' : 'bg-bg-surface dark:bg-bg-surface'}`}>
                                                <td className="p-2 border-r border-divider dark:border-divider text-center">{startIdx + idx + 1}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider">{s.student_id}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider font-bold text-brand dark:text-brand-400 sticky left-0 z-10 shadow-[2px_0_5px_-2px_rgba(0,0,0,0.1)] bg-inherit">
                                                    <div className="flex items-center gap-2">
                                                        {s.photo_url ? (
                                                            // eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture
                                                            <img src={getDriveImageUrl(s.photo_url)} alt={s.name_kh || 'រូបថតសិស្ស'} referrerPolicy="no-referrer" className="w-6 h-6 rounded-full object-cover cursor-pointer border border-divider" onClick={() => { setPhotoUrl(getDriveImageUrl(s.photo_url)); setShowPhotoModal(true); }} />
                                                        ) : (
                                                            <div className="w-6 h-6 rounded-full bg-divider border border-divider"></div>
                                                        )}
                                                        <span>{s.name_kh}</span>
                                                    </div>
                                                </td>
                                                <td className="p-2 border-r border-divider dark:border-divider">{s.gender}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider">{formatDateDisplay(s.dob)}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider text-center">{calculateAge(s.dob) ?? '-'}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider whitespace-pre-wrap">{formatLocation(s.birth_village, s.birth_commune, s.birth_district, s.birth_province)}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider">{formatParent(s.father_name, s.father_job)}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider">{formatParent(s.mother_name, s.mother_job)}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider">{formatParent(s.guardian_name, s.guardian_job)}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider">{s.phone || '-'}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider whitespace-pre-wrap">{formatLocation(s.curr_village, s.curr_commune, s.curr_district, s.curr_province)}</td>
                                                
                                                <td className="p-2 border-r border-divider dark:border-divider text-center">{s.is_new_student ? '✓' : ''}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider text-center">{s.is_repeater ? '✓' : ''}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider text-center">{s.orphan_status !== 'ទេ' ? s.orphan_status : ''}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider text-center">{s.is_disabled ? '✓' : ''}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider text-center text-danger font-bold">{s.poor_status === 'ក្រ១' ? '✓' : ''}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider text-center text-warning font-bold">{s.poor_status === 'ក្រ២' ? '✓' : ''}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider text-center">{s.is_equity ? '✓' : ''}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider text-center">{s.is_scholarship ? '✓' : ''}</td>
                                                
                                                <td className="p-2 border-r border-divider dark:border-divider">{s.special_features || '-'}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider">{s.ethnicity || '-'}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider">{s.name_en || '-'}</td>
                                                <td className="p-2 border-r border-divider dark:border-divider">{s.other_remarks || '-'}</td>
                                                <td className="p-2 text-center sticky right-0 bg-inherit z-10 shadow-[-2px_0_5px_-2px_rgba(0,0,0,0.1)] print:hidden">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button onClick={() => handleDelete(s.id)} className="text-danger hover:text-danger bg-danger/10 hover:bg-danger/15 p-1.5 rounded" title="លុបសិស្ស">
                                                            <Trash className="w-4 h-4" />
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}

                        <div className="print:hidden">
                            <Pagination
                                currentPage={page}
                                totalPages={totalPages}
                                totalItems={sortedStudents.length}
                                pageSize={pageSize}
                                pageSizeOptions={[10, 20, 50, 100]}
                                onPageChange={setCurrentPage}
                                onPageSizeChange={(size) => { setPageSize(size); setCurrentPage(1) }}
                            />
                        </div>

                    </div>
                </div>
            </div>

            {/* Photo Modal */}
            {showPhotoModal && (
                <div className="fixed inset-0 bg-black/50 z-[100] flex justify-center items-end sm:items-center p-0 sm:p-4" onClick={() => setShowPhotoModal(false)}>
                    <div className="bg-bg-surface dark:bg-bg-surface p-2 rounded-xl shadow-lg max-w-sm w-full mx-4" onClick={e => e.stopPropagation()}>
                        {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
                        <img src={photoUrl} referrerPolicy="no-referrer" className="w-full h-auto rounded-lg" alt="Student Photo" />
                        <button onClick={() => setShowPhotoModal(false)} className="mt-4 w-full bg-divider dark:bg-paper hover:bg-paper dark:hover:bg-paper dark:text-white font-bold py-2 rounded transition-colors">បិទ</button>
                    </div>
                </div>
            )}
        </div>
    )
}
