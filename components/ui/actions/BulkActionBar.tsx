import React from 'react'
import { Trash2, Download, Printer, MessageSquare, X } from 'lucide-react'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

interface BulkActionBarProps {
  selectedCount: number
  onClear: () => void
  onDelete: () => void
  onExport: () => void
  onPrintID: () => void
  onSendSMS: () => void
}

export function BulkActionBar({
  selectedCount,
  onClear,
  onDelete,
  onExport,
  onPrintID,
  onSendSMS
}: BulkActionBarProps) {
  if (selectedCount === 0) return null

  return (
    <div className="fixed bottom-0 left-0 right-0 z-40 mx-auto max-w-5xl p-4 animate-in slide-in-from-bottom-4">
      <div className="flex items-center justify-between rounded-xl border border-divider bg-gray-900 px-4 py-3 text-white shadow-2xl backdrop-blur-md dark:bg-white dark:text-gray-900 flex-wrap gap-4">
        
        <div className="flex items-center gap-4 font-kh-moul text-sm font-bold">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white">
            {toKhmerNumber(selectedCount)}
          </span>
          <span>បានជ្រើសរើស</span>
          
          <button 
            onClick={onClear}
            className="ml-2 rounded p-1 text-gray-400 transition-colors hover:bg-gray-800 hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-900"
            aria-label="មិនជ្រើសរើសទាំងអស់"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <button 
            onClick={onPrintID}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-gray-800 dark:hover:bg-gray-100"
          >
            <Printer className="h-4 w-4" />
            បោះពុម្ពប័ណ្ណ
          </button>
          
          <button 
            onClick={onSendSMS}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-gray-800 dark:hover:bg-gray-100"
          >
            <MessageSquare className="h-4 w-4" />
            ផ្ញើសារ
          </button>
          
          <button 
            onClick={onExport}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-medium transition-colors hover:bg-gray-800 dark:hover:bg-gray-100"
          >
            <Download className="h-4 w-4" />
            ទាញយក
          </button>

          <div className="mx-1 h-5 w-px bg-gray-700 dark:bg-gray-300" />
          
          <button 
            onClick={onDelete}
            className="flex items-center gap-2 whitespace-nowrap rounded-lg px-3 py-1.5 text-[13px] font-bold text-red-400 transition-colors hover:bg-red-500/10 dark:text-red-600 dark:hover:bg-red-50"
          >
            <Trash2 className="h-4 w-4" />
            លុប
          </button>
        </div>
      </div>
    </div>
  )
}
