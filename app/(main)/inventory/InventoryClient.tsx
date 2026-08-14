'use client'

import { useState, useEffect } from 'react'
import { ArrowLeft, Package, PlusCircle, Save, X, List, Printer, Edit, Trash2 } from 'lucide-react'
import Link from 'next/link'
import type { Settings } from '@/lib/types'

interface InventoryItem {
    id: number
    name: string
    qty: number
    note: string
}

export default function InventoryClient({ settings }: { settings: Settings | null }) {
    const [items, setItems] = useState<InventoryItem[]>([])
    const [editId, setEditId] = useState<number | null>(null)
    const [name, setName] = useState('')
    const [qty, setQty] = useState('')
    const [note, setNote] = useState('')

    useEffect(() => {
        const stored = localStorage.getItem('inventoryItems')
        if (stored) {
            try {
                setItems(JSON.parse(stored))
            } catch (e) {}
        }
    }, [])

    const saveItems = (newItems: InventoryItem[]) => {
        setItems(newItems)
        localStorage.setItem('inventoryItems', JSON.stringify(newItems))
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()
        if (!name || !qty) return

        if (editId) {
            saveItems(items.map(item => item.id === editId ? { id: editId, name, qty: parseInt(qty), note } : item))
        } else {
            saveItems([...items, { id: Date.now(), name, qty: parseInt(qty), note }])
        }

        resetForm()
    }

    const editItem = (item: InventoryItem) => {
        setEditId(item.id)
        setName(item.name)
        setQty(item.qty.toString())
        setNote(item.note)
    }

    const deleteItem = (id: number) => {
        if (confirm('តើអ្នកពិតជាចង់លុបសម្ភារៈនេះមែនទេ?')) {
            saveItems(items.filter(item => item.id !== id))
        }
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
        <div className="min-h-screen bg-[#f0f4f8] text-slate-800 font-battambang print:bg-white print:m-0 print:p-0">
            <style jsx global>{`
                .print-container { display: none; }
                @media print {
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
                <div className="flex justify-between items-center mb-6">
                    <Link href="/dashboard" className="inline-flex items-center gap-2 text-[#0054a6] hover:text-blue-800 font-bold transition bg-white/50 px-4 py-2 rounded-xl backdrop-blur-sm shadow-sm w-fit">
                        <ArrowLeft className="w-5 h-5" /> ត្រឡប់ទៅទំព័រដើម
                    </Link>
                </div>

                <div className="bg-white/95 backdrop-blur border border-white/50 rounded-2xl p-6 md:p-8 shadow-lg mb-8">
                    <div className="flex items-center gap-3 mb-6 border-b pb-4">
                        <div className="p-3 bg-blue-100 rounded-full text-[#0054a6]">
                            <Package className="w-6 h-6" />
                        </div>
                        <h1 className="font-moul text-xl md:text-2xl text-[#0054a6]">បញ្ជីសារពើភ័ណ្ឌថ្នាក់រៀន</h1>
                    </div>

                    <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl mb-8">
                        <h3 className="font-bold text-gray-700 mb-4 flex items-center gap-2">
                            {editId ? <Edit className="w-5 h-5 text-yellow-600" /> : <PlusCircle className="w-5 h-5 text-green-600" />}
                            {editId ? 'កែប្រែព័ត៌មានសម្ភារៈ' : 'បញ្ចូលសម្ភារៈថ្មី'}
                        </h3>
                        <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-12 gap-4 items-end">
                            <div className="md:col-span-5">
                                <label className="block text-sm font-bold text-gray-600 mb-1">ឈ្មោះសម្ភារៈ <span className="text-red-500">*</span></label>
                                <input type="text" value={name} onChange={e => setName(e.target.value)} required placeholder="-- ជ្រើសរើស ឬវាយបញ្ចូល --" className="w-full padding-3 rounded-xl border border-gray-200 outline-none bg-white p-2 font-bold focus:border-[#0054a6]" />
                            </div>
                            <div className="md:col-span-2">
                                <label className="block text-sm font-bold text-gray-600 mb-1">ចំនួន <span className="text-red-500">*</span></label>
                                <input type="number" value={qty} onChange={e => setQty(e.target.value)} required min="1" placeholder="ឧ. 20" className="w-full padding-3 rounded-xl border border-gray-200 outline-none bg-white p-2 text-center font-bold focus:border-[#0054a6]" />
                            </div>
                            <div className="md:col-span-3">
                                <label className="block text-sm font-bold text-gray-600 mb-1">ផ្សេងៗ (ចំណាំ)</label>
                                <input type="text" value={note} onChange={e => setNote(e.target.value)} placeholder="ស្ថានភាព (ល្អ, ខូច...)" className="w-full padding-3 rounded-xl border border-gray-200 outline-none bg-white p-2 focus:border-[#0054a6]" />
                            </div>
                            <div className="md:col-span-2 flex gap-2">
                                <button type="submit" className={`w-full text-white font-bold py-2.5 rounded-xl transition shadow flex justify-center items-center gap-2 ${editId ? 'bg-yellow-500 hover:bg-yellow-600' : 'bg-[#0054a6] hover:bg-blue-700'}`}>
                                    <Save className="w-4 h-4" /> យល់ព្រម
                                </button>
                                {editId && (
                                    <button type="button" onClick={resetForm} className="bg-gray-400 hover:bg-gray-500 text-white font-bold py-2.5 px-3 rounded-xl transition shadow">
                                        <X className="w-4 h-4" />
                                    </button>
                                )}
                            </div>
                        </form>
                    </div>

                    <div className="flex justify-between items-center mb-4">
                        <h3 className="font-bold text-gray-700 flex items-center gap-2">
                            <List className="w-5 h-5 text-[#0054a6]" /> បញ្ជីទិន្នន័យសម្ភារៈ ({items.length})
                        </h3>
                        <div className="flex gap-2">
                            <button onClick={printPage} className="bg-red-600 hover:bg-red-700 text-white px-5 py-2.5 rounded-xl font-bold transition shadow-md flex items-center gap-2 text-sm">
                                <Printer className="w-4 h-4" /> បោះពុម្ព PDF
                            </button>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-gray-200">
                        <table className="w-full text-sm text-left">
                            <thead className="bg-gray-100 text-gray-700 font-bold border-b">
                                <tr>
                                    <th className="p-3 text-center w-16">ល.រ</th>
                                    <th className="p-3">ឈ្មោះសម្ភារៈ</th>
                                    <th className="p-3 text-center w-24">ចំនួន</th>
                                    <th className="p-3">ចំណាំ</th>
                                    <th className="p-3 text-center w-32">គ្រប់គ្រង</th>
                                </tr>
                            </thead>
                            <tbody className="bg-white divide-y divide-gray-100">
                                {items.length === 0 ? (
                                    <tr><td colSpan={5} className="p-6 text-center text-gray-400 font-bold">មិនទាន់មានទិន្នន័យសម្ភារៈនៅឡើយទេ</td></tr>
                                ) : (
                                    items.map((item, index) => (
                                        <tr key={item.id} className="hover:bg-gray-50 transition">
                                            <td className="p-3 text-center font-bold text-gray-600 border-r border-gray-100">{index + 1}</td>
                                            <td className="p-3 font-bold text-[#0054a6]">{item.name}</td>
                                            <td className="p-3 text-center font-bold">{item.qty}</td>
                                            <td className="p-3 text-gray-600 text-sm">{item.note || '-'}</td>
                                            <td className="p-3 text-center">
                                                <div className="flex justify-center gap-2">
                                                    <button onClick={() => editItem(item)} className="p-1.5 bg-yellow-100 text-yellow-600 rounded-lg hover:bg-yellow-200 transition" title="កែប្រែ"><Edit className="w-4 h-4" /></button>
                                                    <button onClick={() => deleteItem(item.id)} className="p-1.5 bg-red-100 text-red-600 rounded-lg hover:bg-red-200 transition" title="លុប"><Trash2 className="w-4 h-4" /></button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* Print Area */}
            <div className="print-container bg-white w-[210mm] min-h-[297mm] mx-auto relative p-[15mm] text-black">
                <div className="text-center w-full mb-6">
                    <h3 className="font-moul text-[13pt] mb-1">ព្រះរាជាណាចក្រកម្ពុជា</h3>
                    <h3 className="font-moul text-[13pt] mb-1">ជាតិ សាសនា ព្រះមហាក្សត្រ</h3>
                </div>

                <div className="w-full text-[11pt] leading-relaxed mb-6 font-moul">
                    <p>{settings?.management_unit_1 || "មន្ទីរអប់រំ យុវជន និងកីឡា..."}</p>
                    <p>{settings?.management_unit_2 || "ការិយាល័យអប់រំ យុវជន និងកីឡា..."}</p>
                    <p>{settings?.school_name || "សាលាបឋមសិក្សា..."}</p>
                </div>

                <h2 className="font-moul text-center text-[14pt] mb-2 uppercase">បញ្ជីសារពើភ័ណ្ឌថ្នាក់រៀន</h2>
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
                    <div className="text-center font-moul leading-relaxed">
                        <div className="mb-4 invisible">.</div>
                        <p className="text-[11pt] mb-2">បានឃើញ និងឯកភាព</p>
                        <p className="uppercase text-[12pt]">{settings?.manager_role || "នាយកសាលា"}</p>
                        <div className="h-24"></div>
                        <p className="text-[11.5pt]">{settings?.manager_name || ""}</p>
                    </div>
                    <div className="text-center font-moul leading-relaxed">
                        <p className="text-[11pt] mb-2">ថ្ងៃទី...........ខែ...........ឆ្នាំ...........</p>
                        <p className="text-[12pt]">គ្រូបន្ទុកថ្នាក់</p>
                        <div className="h-24"></div>
                        <p className="text-[11.5pt]">{settings?.homeroom_teacher || "ឈ្មោះគ្រូ"}</p>
                    </div>
                </div>
            </div>

        </div>
    )
}
