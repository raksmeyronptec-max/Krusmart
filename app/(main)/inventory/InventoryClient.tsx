'use client'

import { useEffect, useState, useTransition } from 'react'
import { DataTable } from '@/components/ui/data/DataTable'
import { EmptyState } from '@/components/ui/feedback/EmptyState'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { useConfirm } from '@/components/ui/overlay/ConfirmDialog'
import { Button } from '@/components/ui/actions/Button'
import { Package, PlusCircle, Save, X, List, Printer, Edit, Trash2 } from 'lucide-react'
import { notify } from '@/components/ui/feedback/notify'
import type { InventoryItemRow, Settings } from '@/lib/types'
import { STORAGE_KEYS } from '@/lib/constants/storage'
import {
    createInventoryItem,
    deleteInventoryItem,
    importInventoryItems,
    listInventoryItems,
    updateInventoryItem,
} from './actions'
import { logger } from '@/lib/utils/logger'

/** The shape older builds wrote to `localStorage`, kept for the one-time import. */
interface LegacyInventoryItem {
    id: number
    name: string
    qty: number
    note: string
}

/**
 * Read the browser's old inventory. Returns `[]` when nothing is stored or the
 * value is corrupt, so a bad entry cannot break the page on load.
 */
function readLegacyItems(): LegacyInventoryItem[] {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(STORAGE_KEYS.inventoryItems)
    if (!raw) return []
    try {
        const parsed: unknown = JSON.parse(raw)
        return Array.isArray(parsed) ? (parsed as LegacyInventoryItem[]) : []
    } catch {
        return []
    }
}

export default function InventoryClient({
    settings,
    initialItems,
}: {
    settings: Settings | null
    initialItems: InventoryItemRow[]
}) {
    const [items, setItems] = useState<InventoryItemRow[]>(initialItems)
    const [editId, setEditId] = useState<string | null>(null)
    const [name, setName] = useState('')
    const [qty, setQty] = useState('')
    const [note, setNote] = useState('')
    const [pending, startTransition] = useTransition()
    const { confirm, dialog } = useConfirm()

    /**
     * Import the browser's old localStorage list once.
     *
     * Runs only when the server returned nothing *and* localStorage has
     * something, so it fires at most once per account. The localStorage copy is
     * left in place: an import that fails can be retried, and nothing is
     * destroyed if the insert half-succeeds.
     */
    useEffect(() => {
        if (initialItems.length > 0) return

        const legacy = readLegacyItems()
        if (legacy.length === 0) return

        let cancelled = false
        const run = async () => {
            const res = await importInventoryItems(
                legacy.map((i) => ({ name: i.name, qty: i.qty, note: i.note })),
            )
            if (res.error) {
                logger.error(res.error)
                return
            }
            const rows = await listInventoryItems()
            if (!cancelled) {
                setItems(rows)
                if (res.imported) notify.success(`បាននាំចូលសម្ភារៈ ${res.imported} មុខ`)
            }
        }
        run()
        return () => { cancelled = true }
    }, [initialItems.length])

    const refresh = async () => setItems(await listInventoryItems())

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!name.trim() || !qty) return

        const payload = { name: name.trim(), qty: Number(qty), note: note.trim() || null }

        startTransition(async () => {
            const res = editId
                ? await updateInventoryItem(editId, payload)
                : await createInventoryItem(payload)

            if (res.error) {
                notify.error(res.error)
                return
            }
            await refresh()
            resetForm()
            notify.success(editId ? 'បានកែប្រែសម្ភារៈ' : 'បានបញ្ចូលសម្ភារៈថ្មី')
        })
    }

    const editItem = (item: InventoryItemRow) => {
        setEditId(item.id)
        setName(item.name)
        setQty(String(item.qty))
        setNote(item.note ?? '')
    }

    const deleteItem = async (id: string) => {
        if (!(await confirm({
            title: 'លុបសម្ភារៈ',
            message: 'សម្ភារៈនេះនឹងត្រូវលុបចេញជាអចិន្ត្រៃយ៍។',
        }))) return
        startTransition(async () => {
            const res = await deleteInventoryItem(id)
            if (res.error) {
                notify.error(res.error)
                return
            }
            await refresh()
            if (editId === id) resetForm()
            notify.success('បានលុបសម្ភារៈ')
        })
    }

    const resetForm = () => {
        setEditId(null)
        setName('')
        setQty('')
        setNote('')
    }

    const printPage = () => {
        window.print()
    }

    return (
        <div className="text-text-heading font-battambang print:bg-bg-surface print:m-0 print:p-0">
            <style jsx global>{`
                .print-container { display: none; }
                @media print {
                    @page { size: A4 portrait; margin: 0; }
                    .no-print { display: none !important; }
                    body { background: white !important; margin: 0; padding: 0; }
                    .print-container { 
                        display: block !important; 
                        width: 100%;
                        height: 100%;
                        box-shadow: none !important;
                        padding: 0 15mm !important;
                        margin: 0 !important;
                    }
                    .report-table th { background-color: #f3f4f6 !important; -webkit-print-color-adjust: exact; }
                }
                .report-table { width: 100%; border-collapse: collapse; font-size: 11pt; margin-top: 20px; }
                .report-table th, .report-table td { border: 1px solid #000; padding: 6px 8px; text-align: center; vertical-align: middle; }
                .report-table th { font-family: 'Moul', cursive; font-weight: normal; font-size: 11pt; }
            `}</style>

            <div className="no-print max-w-5xl mx-auto px-4 mt-8 pb-10">

                <div className="bg-bg-surface/95 backdrop-blur border border-divider rounded-xl p-6 md:p-8 shadow-lg mb-8">
                    <div className="flex items-center gap-3 mb-6 border-b pb-4">
                        <div className="p-3 bg-brand-100 rounded-full text-brand">
                            <Package className="w-6 h-6" />
                        </div>
                        <h1 className="kh-moul text-xl md:text-2xl text-brand">បញ្ជីសារពើភ័ណ្ឌថ្នាក់រៀន</h1>
                    </div>

                    <div className="bg-brand-100/50 border border-divider p-5 rounded-xl mb-8">
                        <h3 className="font-bold text-text-body mb-4 flex items-center gap-2">
                            {editId ? <Edit className="w-5 h-5 text-warning" /> : <PlusCircle className="w-5 h-5 text-success" />}
                            {editId ? 'កែប្រែព័ត៌មានសម្ភារៈ' : 'បញ្ចូលសម្ភារៈថ្មី'}
                        </h3>
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                            <div className="md:col-span-5">
                                <label className="block text-sm font-bold text-text-body mb-1">ឈ្មោះសម្ភារៈ <span className="text-danger">*</span></label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="-- ជ្រើសរើស ឬវាយបញ្ចូល --" className="w-full padding-3 rounded-xl border border-divider outline-none bg-bg-surface p-2 font-bold focus:border-brand" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-text-body mb-1">ចំនួន <span className="text-danger">*</span></label>
                                <input type="number" value={qty} onChange={e => setQty(e.target.value)} required min="1" placeholder="ឧ. 20" className="w-full padding-3 rounded-xl border border-divider outline-none bg-bg-surface p-2 text-center font-bold focus:border-brand" />
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-sm font-bold text-text-body mb-1">ផ្សេងៗ (ចំណាំ)</label>
                                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="ស្ថានភាព (ល្អ, ខូច...)" className="w-full padding-3 rounded-xl border border-divider outline-none bg-bg-surface p-2 focus:border-brand" />
                            </div>
                            <div className="md:col-span-2 flex gap-2">
                                <button type="submit" disabled={pending} className={`w-full text-white font-bold py-2.5 rounded-xl transition shadow flex justify-center items-center gap-2 disabled:opacity-60 ${editId ? 'bg-warning hover:bg-warning' : 'bg-brand hover:bg-brand-hover'}`}>
                                    <Save className="w-4 h-4" /> យល់ព្រម
                                </button>
                                {editId && (
                                    <button type="button" aria-label="បោះបង់ការកែប្រែ" onClick={resetForm} className="bg-divider hover:bg-text-muted text-white font-bold py-2.5 px-3 rounded-xl transition shadow">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-text-body flex items-center gap-2">
                            <List className="w-5 h-5 text-brand" /> បញ្ជីទិន្នន័យសម្ភារៈ ({items.length})
                        </h3>
                        <div className="flex gap-2">
                            <Button variant="danger" printHidden={false} onClick={printPage}>
                                <Printer className="w-4 h-4" /> បោះពុម្ព PDF
                            </Button>
                        </div>
                    </div>

                    <DataTable
                        rows={items}
                        rowKey={(item) => item.id}
                        caption="បញ្ជីសារពើភ័ណ្ឌថ្នាក់រៀន"
                        empty={
                            <EmptyState
                                title="មិនទាន់មានទិន្នន័យសម្ភារៈនៅឡើយទេ"
                                description="បញ្ចូលសម្ភារៈដំបូងខាងលើ ដើម្បីចាប់ផ្តើមកត់ត្រា។"
                            />
                        }
                        columns={[
                            {
                                key: 'name',
                                header: 'ឈ្មោះសម្ភារៈ',
                                primary: true,
                                sortable: true,
                                sortValue: (item) => item.name,
                                cell: (item) => <span className="font-bold text-brand">{item.name}</span>,
                            },
                            {
                                key: 'qty',
                                header: 'ចំនួន',
                                align: 'center',
                                width: 'w-24',
                                secondary: true,
                                sortable: true,
                                sortValue: (item) => item.qty,
                                cell: (item) => <span className="font-bold">{toKhmerNumber(item.qty)}</span>,
                            },
                            {
                                key: 'note',
                                header: 'ចំណាំ',
                                cell: (item) => item.note || '-',
                            },
                        ]}
                        actions={(item) => (
                            <div className="flex justify-center gap-2">
                                <Button variant="warning" size="sm" printHidden={false} onClick={() => editItem(item)} aria-label={`កែប្រែ ${item.name}`}>
                                    <Edit className="w-4 h-4" aria-hidden="true" />
                                </Button>
                                <Button variant="danger" size="sm" printHidden={false} onClick={() => deleteItem(item.id)} aria-label={`លុប ${item.name}`}>
                                    <Trash2 className="w-4 h-4" aria-hidden="true" />
                                </Button>
                            </div>
                        )}
                    />
                </div>
            </div>

            {/* Print Area */}
            <div className="print-container bg-bg-surface w-[210mm] min-h-[297mm] mx-auto relative p-[15mm] text-black">
                <div className="text-center w-full mb-6">
                    <h3 className="kh-moul text-[13pt] mb-1">ព្រះរាជាណាចក្រកម្ពុជា</h3>
                    <h3 className="kh-moul text-[13pt] mb-1">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                </div>

                <div className="w-full text-[11pt] leading-relaxed mb-6 kh-moul">
                    <p>{settings?.management_unit_1 || "មន្ទីរអប់រំ យុវជន និងកីឡា..."}</p>
                    <p>{settings?.management_unit_2 || "ការិយាល័យអប់រំ យុវជន និងកីឡា..."}</p>
                    <p>{settings?.school_name || "សាលាបឋមសិក្សា..."}</p>
                </div>

                <h2 className="kh-moul text-center text-[14pt] mb-2 uppercase">បញ្ជីសារពើភ័ណ្ឌថ្នាក់រៀន</h2>
                <p className="text-center font-bold text-[11pt] mb-6">ប្រចាំថ្នាក់ទី {settings?.class_name || "១២ ក"} សិក្សាឆ្នាំ {settings?.academic_year || "២០២៤-២០២៥"}</p>

                <table className="report-table">
                    <thead>
                        <tr>
                            <th className="w-[10%]">ល.រ</th>
                            <th className="w-[45%]">ឈ្មោះសម្ភារៈ</th>
                            <th className="w-[15%]">ចំនួន</th>
                            <th className="w-[30%]">ផ្សេងៗ (ចំណាំ)</th>
                        </tr>
                    </thead>
                    <tbody>
                        {items.map((item, index) => (
                            <tr key={item.id}>
                                <td>{index + 1}</td>
                                <td className="text-left pl-2 font-bold">{item.name}</td>
                                <td className="font-bold">{item.qty}</td>
                                <td className="text-left pl-2">{item.note}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>

                <div className="grid grid-cols-2 gap-8 mt-10">
                    <div className="text-center kh-moul leading-relaxed">
                        <div className="mb-4 invisible">.</div>
                        <p className="text-[11pt] mb-2">បានឃើញ និងឯកភាព</p>
                        <p className="uppercase text-[12pt]">{settings?.manager_role || "នាយកសាលា"}</p>
                        <div className="h-24"></div>
                        <p className="text-[11.5pt]">{settings?.manager_name || ""}</p>
                    </div>
                    <div className="text-center kh-moul leading-relaxed">
                        <p className="text-[11pt] mb-2">ថ្ងៃទី...........ខែ...........ឆ្នាំ...........</p>
                        <p className="text-[12pt]">គ្រូបន្ទុកថ្នាក់</p>
                        <div className="h-24"></div>
                        <p className="text-[11.5pt]">{settings?.homeroom_teacher || "ឈ្មោះគ្រូ"}</p>
                    </div>
                </div>
            </div>

            {dialog}
        </div>
    )
}
