"use client"

import { useState } from "react"
import { 
  CalendarDays, 
  Calendar, 
  Users, 
  UserCheck, 
  Award, 
  AlertTriangle,
  PieChart as PieChartIcon,
  BarChart3,
  UserSearch
} from "lucide-react"
import { 
  PieChart, 
  Pie, 
  Cell, 
  ResponsiveContainer, 
  Tooltip, 
  Legend 
} from "recharts"
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import Select from '@/components/ui/forms/Select'

export default function AdminDashboardPage() {
  const [year, setYear] = useState("2025-2026")
  const [month, setMonth] = useState("nov")
  const [selectedTeacher, setSelectedTeacher] = useState("")

  // Mock data for initial UI (will be replaced with Supabase data later)
  const pieData = [
    { name: 'សិស្សឆ្នើម', value: 15, color: '#3b82f6' },
    { name: 'សិស្សល្អ', value: 45, color: '#10b981' },
    { name: 'សិស្សមធ្យម', value: 30, color: '#f59e0b' },
    { name: 'សិស្សខ្សោយ', value: 10, color: '#ef4444' },
  ]

  const classData = [
    { id: 1, name: 'ថ្នាក់ទី ១០ក', teacher: 'លោកគ្រូ សុខ', total: 45, attendance: 95, avg: 75.5, status: 'ល្អណាស់' },
    { id: 2, name: 'ថ្នាក់ទី ១១ខ', teacher: 'អ្នកគ្រូ នារី', total: 42, attendance: 88, avg: 68.2, status: 'ល្អ' },
    { id: 3, name: 'ថ្នាក់ទី ១២គ', teacher: 'លោកគ្រូ សៅ', total: 38, attendance: 92, avg: 82.0, status: 'ឆ្នើម' },
  ]

  return (
    <div className="flex flex-col gap-6 animate-[slideUpScale_0.6s_ease_forwards]">
      
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">សួស្តី, លោកនាយក! 👋</h2>
          <p className="text-gray-500 text-sm mt-1 font-bold">នេះជាទិដ្ឋភាពរួមនៃសាលារបស់យើងសម្រាប់ការវិភាគប្រចាំខែ។</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            ariaLabel="ឆ្នាំសិក្សា"
            value={year}
            onChange={setYear}
            options={[
              { value: '2025-2026', label: 'ឆ្នាំ ២០២៥-២០២៦' },
              { value: '2026-2027', label: 'ឆ្នាំ ២០២៦-២០២៧' },
            ]}
            leadingIcon={<CalendarDays className="text-blue-600" />}
          />
          <Select
            ariaLabel="ខែ"
            value={month}
            onChange={setMonth}
            options={[
              { value: 'nov', label: 'ខែ វិច្ឆិកា' },
              { value: 'dec', label: 'ខែ ធ្នូ' },
              { value: 'jan', label: 'ខែ មករា' },
            ]}
            leadingIcon={<Calendar className="text-blue-600" />}
          />
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-blue-500 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200">
          <div className="bg-blue-50 text-blue-600 p-3.5 rounded-xl border border-blue-100">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold mb-0.5">សិស្សសរុប</p>
            <h3 className="text-2xl font-bold text-gray-800">125</h3>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-green-500 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200">
          <div className="bg-green-50 text-green-600 p-3.5 rounded-xl border border-green-100">
            <UserCheck className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold mb-0.5">អត្រាវត្តមានប្រចាំខែ</p>
            <h3 className="text-2xl font-bold text-gray-800">92%</h3>
            <p className="text-xs text-gray-500 mt-1 font-bold">អវត្តមានសរុប <span className="text-red-500">12</span> ដង</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-purple-500 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200">
          <div className="bg-purple-50 text-purple-600 p-3.5 rounded-xl border border-purple-100">
            <Award className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold mb-0.5">អត្រាសិស្សជាប់</p>
            <h3 className="text-2xl font-bold text-gray-800">85%</h3>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-red-500 shadow-sm hover:shadow-md hover:-translate-y-1 transition-all duration-200">
          <div className="bg-red-50 text-red-600 p-3.5 rounded-xl border border-red-100">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold mb-0.5">សិស្សទន់ខ្សោយ</p>
            <h3 className="text-2xl font-bold text-gray-800">10 នាក់</h3>
          </div>
        </div>
      </div>

      {/* Charts & Tables Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 lg:col-span-1 shadow-sm flex flex-col">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center">
            <PieChartIcon className="w-5 h-5 mr-2 text-blue-600" /> ស្ថិតិលទ្ធផលសិក្សាសរុប
          </h3>
          <div className="flex-1 min-h-[250px] w-full relative">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {pieData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 lg:col-span-2 shadow-sm flex flex-col">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600" /> របាយការណ៍សង្ខេបតាមថ្នាក់
          </h3>
          <div className="overflow-x-auto flex-1 border border-gray-100 rounded-lg">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200 text-gray-600 text-sm">
                  <th className="py-3 pl-4 font-semibold">ថ្នាក់</th>
                  <th className="py-3 font-semibold">គ្រូបន្ទុកថ្នាក់</th>
                  <th className="py-3 font-semibold text-center">សិស្សសរុប</th>
                  <th className="py-3 font-semibold text-center">អត្រាវត្តមាន</th>
                  <th className="py-3 font-semibold text-center">មធ្យមភាគពិន្ទុ</th>
                  <th className="py-3 font-semibold text-center">ស្ថានភាព</th>
                </tr>
              </thead>
              <tbody className="text-sm text-gray-700">
                {classData.map((cls) => (
                  <tr key={cls.id} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                    <td className="py-3 pl-4 font-bold">{cls.name}</td>
                    <td className="py-3">{cls.teacher}</td>
                    <td className="py-3 text-center">{cls.total}</td>
                    <td className="py-3 text-center text-green-600 font-bold">{cls.attendance}%</td>
                    <td className="py-3 text-center text-blue-600 font-bold">{cls.avg}</td>
                    <td className="py-3 text-center">
                      <span className="bg-green-100 text-green-700 px-2 py-1 rounded-full text-xs font-bold">
                        {cls.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Individual Teacher Analysis */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 border-t-4 border-t-indigo-500 shadow-sm mt-2">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-gray-100 pb-4 gap-4">
          <div>
            <h2 className="font-bold text-indigo-800 flex items-center gap-2 text-lg">
              <UserSearch className="w-6 h-6" />
              វិភាគគ្រូបង្រៀន និងថ្នាក់រៀនម្នាក់ៗ
            </h2>
            <p className="text-sm text-gray-500 mt-1 font-bold">ជ្រើសរើសឈ្មោះគ្រូ ដើម្បីមើលទិន្នន័យលម្អិតប្រចាំថ្នាក់របស់គាត់។</p>
          </div>
          <div className="w-full md:w-auto flex items-center gap-3">
            <label className="text-sm font-bold text-gray-600 hidden md:block" htmlFor="admin-teacher-picker">ជ្រើសរើសគ្រូ៖</label>
            <SearchableSelect
              id="admin-teacher-picker"
              ariaLabel="ជ្រើសរើសគ្រូបង្រៀន"
              placeholder="-- សូមជ្រើសរើសគ្រូបង្រៀន --"
              value={selectedTeacher}
              onChange={setSelectedTeacher}
              options={[
                { value: '1', label: 'លោកគ្រូ សុខ' },
                { value: '2', label: 'អ្នកគ្រូ នារី' },
              ]}
              wrapperClassName="w-full md:w-72"
            />
          </div>
        </div>
        
        {/* Placeholder for selected teacher data */}
        {!selectedTeacher ? (
          <div className="text-center py-10 text-gray-400 font-bold">
            សូមជ្រើសរើសគ្រូបង្រៀនដើម្បីបង្ហាញទិន្នន័យ
          </div>
        ) : (
          <div className="text-center py-10 text-indigo-600 font-bold">
            កំពុងទាញទិន្នន័យសម្រាប់គ្រូនេះ... (មុខងារនឹងភ្ជាប់ Supabase នាពេលបន្ទាប់)
          </div>
        )}
      </div>
      
    </div>
  )
}
