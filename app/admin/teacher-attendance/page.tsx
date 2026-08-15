"use client"

import { useState } from "react"
import { 
  Calendar, 
  UserCheck, 
  Search, 
  FileSpreadsheet, 
  MapPin, 
  Save, 
  CheckCircle2, 
  XCircle 
} from "lucide-react"
import Select from '@/components/ui/forms/Select'

export default function TeacherAttendancePage() {
  const [filterType, setFilterType] = useState("daily")
  const [dateStr, setDateStr] = useState(new Date().toISOString().split('T')[0])

  // Mock Data
  const attendanceData = [
    { id: 1, name: "លោកគ្រូ សុខ", date: "2026-05-30", time: "06:45 ព្រឹក", status: "មានវត្តមាន", distance: "50m" },
    { id: 2, name: "អ្នកគ្រូ នារី", date: "2026-05-30", time: "07:10 ព្រឹក", status: "យឺត", distance: "120m" },
    { id: 3, name: "លោកគ្រូ សៅ", date: "2026-05-30", time: "-", status: "អវត្តមាន", distance: "-" },
  ]

  const currentDate = new Date().toLocaleDateString('km-KH', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  })

  return (
    <div className="flex flex-col gap-6 animate-[slideUpScale_0.6s_ease_forwards]">
      
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-text-heading">ការគ្រប់គ្រងវត្តមានគ្រូបង្រៀន</h2>
          <p className="text-text-muted text-sm mt-1 font-bold">ពិនិត្យមើលរបាយការណ៍វត្តមាន និងកំណត់ទីតាំងភូមិសាស្ត្រសាលារបស់អ្នក។</p>
        </div>
        <div className="flex items-center gap-4">
          <div className="px-4 py-2 bg-paper border border-divider rounded-lg flex items-center gap-2 text-sm text-text-body font-bold shadow-sm">
            <Calendar className="w-4 h-4 text-brand" />
            <span>{currentDate}</span>
          </div>
        </div>
      </header>

      {/* Attendance Table Section */}
      <div className="bg-white border border-divider rounded-xl p-5 shadow-sm flex flex-col flex-1">
        
        {/* Filters */}
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="text-base font-bold text-text-heading flex items-center mr-2">
              <UserCheck className="w-5 h-5 mr-2 text-success" /> របាយការណ៍វត្តមាន
            </h3>
            
            <Select
              ariaLabel="ប្រភេទតម្រង"
              value={filterType}
              onChange={setFilterType}
              options={[
                { value: 'daily', label: 'ប្រចាំថ្ងៃ' },
                { value: 'monthly', label: 'ប្រចាំខែ' },
                { value: 'yearly', label: 'ប្រចាំឆ្នាំ' },
              ]}
            />

            <input 
              type={filterType === 'daily' ? 'date' : filterType === 'monthly' ? 'month' : 'text'}
              value={dateStr}
              onChange={(e) => setDateStr(e.target.value)}
              className="border border-divider rounded-lg px-3 py-2 text-sm font-bold text-text-body focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />

            <button className="bg-brand-100 hover:bg-brand-100 text-brand px-4 py-2 rounded-lg flex items-center gap-2 transition font-bold text-sm">
              <Search className="w-4 h-4" /> ស្វែងរក
            </button>
          </div>
          
          <button className="bg-success hover:opacity-90 text-white px-4 py-2 rounded-lg flex items-center gap-2 transition shadow-sm font-bold text-sm">
            <FileSpreadsheet className="w-4 h-4" /> ទាញយក Excel
          </button>
        </div>

        {/* Table */}
        <div className="overflow-x-auto flex-1 border border-divider rounded-lg">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="bg-paper border-b border-divider text-text-body text-sm">
                <th className="py-3 pl-4 font-semibold">ឈ្មោះគ្រូ</th>
                <th className="py-3 font-semibold">កាលបរិច្ឆេទ</th>
                <th className="py-3 font-semibold">ម៉ោង Check-in</th>
                <th className="py-3 font-semibold text-center">ស្ថានភាព</th>
                <th className="py-3 font-semibold text-center">ចម្ងាយពីសាលា</th>
              </tr>
            </thead>
            <tbody className="text-sm text-text-body">
              {attendanceData.map((record) => (
                <tr key={record.id} className="border-b border-divider hover:bg-paper transition-colors">
                  <td className="py-3 pl-4 font-bold">{record.name}</td>
                  <td className="py-3">{record.date}</td>
                  <td className="py-3 font-bold text-text-body">{record.time}</td>
                  <td className="py-3 text-center">
                    {record.status === 'មានវត្តមាន' ? (
                      <span className="inline-flex items-center gap-1 bg-success/10 text-success px-2 py-1 rounded-full text-xs font-bold">
                        <CheckCircle2 className="w-3 h-3" /> {record.status}
                      </span>
                    ) : record.status === 'អវត្តមាន' ? (
                      <span className="inline-flex items-center gap-1 bg-danger/10 text-danger px-2 py-1 rounded-full text-xs font-bold">
                        <XCircle className="w-3 h-3" /> {record.status}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 bg-warning/10 text-warning px-2 py-1 rounded-full text-xs font-bold">
                        {record.status}
                      </span>
                    )}
                  </td>
                  <td className="py-3 text-center text-brand font-bold">{record.distance}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Geofencing Settings Section */}
      <div className="bg-white border border-divider rounded-xl p-5 border-t-4 border-t-blue-500 shadow-sm mt-2">
        <h3 className="text-lg font-bold text-text-heading flex items-center mb-4">
          <MapPin className="w-6 h-6 mr-2 text-brand" />
          កំណត់ទីតាំងភូមិសាស្ត្រសាលា (Geofencing)
        </h3>
        <p className="text-sm text-text-body font-bold mb-4">
          កំណត់ទីតាំងសាលា និងកាំជុំវិញសាលា (Radius) ដែលអនុញ្ញាតឱ្យគ្រូអាចចុះវត្តមានបាន។
        </p>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-1 flex flex-col gap-4">
            <div>
              <label className="block text-sm font-bold text-text-body mb-1">រយៈទទឹង (Latitude)</label>
              <input type="text" className="w-full border border-divider rounded-lg px-3 py-2 text-sm font-bold bg-paper focus:ring-2 focus:ring-focus-ring focus:outline-none" placeholder="ឧ. 11.5564" />
            </div>
            <div>
              <label className="block text-sm font-bold text-text-body mb-1">រយៈបណ្តោយ (Longitude)</label>
              <input type="text" className="w-full border border-divider rounded-lg px-3 py-2 text-sm font-bold bg-paper focus:ring-2 focus:ring-focus-ring focus:outline-none" placeholder="ឧ. 104.9282" />
            </div>
            <div>
              <label className="block text-sm font-bold text-text-body mb-1">កាំអនុញ្ញាត (ម៉ែត្រ)</label>
              <input type="number" className="w-full border border-divider rounded-lg px-3 py-2 text-sm font-bold focus:ring-2 focus:ring-focus-ring focus:outline-none" placeholder="ឧ. 100" defaultValue="100" />
            </div>
            <button className="bg-brand hover:bg-brand-hover text-white w-full py-2.5 rounded-lg flex items-center justify-center gap-2 font-bold transition shadow-md mt-2">
              <Save className="w-5 h-5" /> រក្សាទុកទីតាំង
            </button>
          </div>

          <div className="lg:col-span-2">
            <div className="w-full h-[300px] bg-paper rounded-xl border border-divider flex items-center justify-center">
              <div className="text-center">
                <MapPin className="w-8 h-8 text-text-muted mx-auto mb-2" />
                <p className="text-text-muted font-bold">ផែនទីនឹងបង្ហាញនៅទីនេះ (ត្រូវការបញ្ចូល Leaflet)</p>
              </div>
            </div>
          </div>
        </div>
      </div>

    </div>
  )
}
