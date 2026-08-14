'use client';

import React, { useState } from 'react';
import { 
  Users, UserCheck, Award, AlertTriangle, PieChart as PieChartIcon, 
  BarChart3, UserSearch, CalendarDays, Calendar, GraduationCap 
} from 'lucide-react';
import { 
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';

// --- Mock Data ---
const MOCK_SCHOOL_STATS = {
  totalStudents: 1250,
  attendanceRate: 95.5,
  absentCount: 45,
  passRate: 88.2,
  dropoutRisk: 24,
  passFailData: [
    { name: 'ជាប់ (Pass)', value: 1100, color: '#22c55e' },
    { name: 'ធ្លាក់/ព្រមាន (Fail)', value: 150, color: '#ef4444' }
  ],
  classes: [
    { id: 'c1', name: 'ថ្នាក់ទី ៦ក', teacher: 'សុខ សាន្ត', total: 45, attendance: 98, avgScore: 8.5, status: 'ល្អប្រសើរ' },
    { id: 'c2', name: 'ថ្នាក់ទី ៥ខ', teacher: 'ចាន់ ធី', total: 40, attendance: 92, avgScore: 6.2, status: 'មធ្យម' },
    { id: 'c3', name: 'ថ្នាក់ទី ៤គ', teacher: 'រដ្ឋា មុនី', total: 42, attendance: 88, avgScore: 4.8, status: 'ព្រមាន' },
  ]
};

const MOCK_TEACHERS = [
  { id: 't1', name: 'សុខ សាន្ត', class: 'ថ្នាក់ទី ៦ក' },
  { id: 't2', name: 'ចាន់ ធី', class: 'ថ្នាក់ទី ៥ខ' },
  { id: 't3', name: 'រដ្ឋា មុនី', class: 'ថ្នាក់ទី ៤គ' },
];

const MOCK_TEACHER_DETAIL = {
  't1': {
    totalStudents: 45, avgScore: 8.5, attendanceRate: 98, passRate: 95, status: 'ល្អប្រសើរ',
    radarData: [
      { subject: 'វត្តមានសិស្ស', A: 98, fullMark: 100 },
      { subject: 'សិស្សប្រឡងជាប់', A: 95, fullMark: 100 },
      { subject: 'មធ្យមភាគថ្នាក់', A: 85, fullMark: 100 },
      { subject: 'សិស្សពូកែ', A: 70, fullMark: 100 },
      { subject: 'ជួយសិស្សខ្សោយ', A: 90, fullMark: 100 },
    ],
    gradeData: [
      { grade: 'A', count: 10, fill: '#22c55e' },
      { grade: 'B', count: 15, fill: '#3b82f6' },
      { grade: 'C', count: 12, fill: '#eab308' },
      { grade: 'D', count: 5, fill: '#f97316' },
      { grade: 'E', count: 2, fill: '#ef4444' },
      { grade: 'F', count: 1, fill: '#991b1b' },
    ]
  },
  't2': {
    totalStudents: 40, avgScore: 6.2, attendanceRate: 92, passRate: 75, status: 'មធ្យម',
    radarData: [
      { subject: 'វត្តមានសិស្ស', A: 92, fullMark: 100 },
      { subject: 'សិស្សប្រឡងជាប់', A: 75, fullMark: 100 },
      { subject: 'មធ្យមភាគថ្នាក់', A: 62, fullMark: 100 },
      { subject: 'សិស្សពូកែ', A: 40, fullMark: 100 },
      { subject: 'ជួយសិស្សខ្សោយ', A: 60, fullMark: 100 },
    ],
    gradeData: [
      { grade: 'A', count: 2, fill: '#22c55e' },
      { grade: 'B', count: 5, fill: '#3b82f6' },
      { grade: 'C', count: 10, fill: '#eab308' },
      { grade: 'D', count: 12, fill: '#f97316' },
      { grade: 'E', count: 8, fill: '#ef4444' },
      { grade: 'F', count: 3, fill: '#991b1b' },
    ]
  },
};

export default function AdministrationClient() {
  const [selectedYear, setSelectedYear] = useState('2025-2026');
  const [selectedMonth, setSelectedMonth] = useState('nov');
  const [selectedTeacher, setSelectedTeacher] = useState('');

  const stats = MOCK_SCHOOL_STATS;
  const teacherDetail = selectedTeacher ? (MOCK_TEACHER_DETAIL as any)[selectedTeacher] : null;

  const toKhNum = (num: number | string) => {
    const khDigits = ['០','១','២','៣','៤','៥','៦','៧','៨','៩'];
    return num.toString().split('').map(d => /[0-9]/.test(d) ? khDigits[parseInt(d)] : d).join('');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-200 shadow-sm">
        <div>
          <h2 className="text-2xl font-moul text-blue-900">សួស្តី, លោកនាយក! 👋</h2>
          <p className="text-gray-500 text-sm mt-1">នេះជាទិដ្ឋភាពរួមនៃសាលារបស់យើងសម្រាប់ការវិភាគប្រចាំខែ។</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <CalendarDays className="w-4 h-4 text-blue-600 mr-2" />
            <select 
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              className="bg-transparent text-sm font-bold text-gray-700 outline-none cursor-pointer"
            >
              <option value="2025-2026">ឆ្នាំ ២០២៥-២០២៦</option>
              <option value="2026-2027">ឆ្នាំ ២០២៦-២០២៧</option>
            </select>
          </div>
          <div className="flex items-center bg-gray-50 border border-gray-200 rounded-lg px-3 py-2">
            <Calendar className="w-4 h-4 text-blue-600 mr-2" />
            <select 
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="bg-transparent text-sm font-bold text-gray-700 outline-none cursor-pointer"
            >
              <option value="nov">ខែ វិច្ឆិកា</option>
              <option value="dec">ខែ ធ្នូ</option>
              <option value="jan">ខែ មករា</option>
            </select>
          </div>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-blue-500 shadow-sm">
          <div className="bg-blue-50 text-blue-600 p-3.5 rounded-xl border border-blue-100">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold mb-0.5">សិស្សសរុប</p>
            <h3 className="text-2xl font-bold text-gray-800">{toKhNum(stats.totalStudents)}</h3>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-green-500 shadow-sm">
          <div className="bg-green-50 text-green-600 p-3.5 rounded-xl border border-green-100">
            <UserCheck className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold mb-0.5">អត្រាវត្តមានប្រចាំខែ</p>
            <h3 className="text-2xl font-bold text-gray-800">{toKhNum(stats.attendanceRate)}%</h3>
            <p className="text-xs text-gray-500 mt-1 font-bold">អវត្តមានសរុប <span className="text-red-500">{toKhNum(stats.absentCount)}</span> ដង</p>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-purple-500 shadow-sm">
          <div className="bg-purple-50 text-purple-600 p-3.5 rounded-xl border border-purple-100">
            <Award className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold mb-0.5">អត្រាសិស្សជាប់</p>
            <h3 className="text-2xl font-bold text-gray-800">{toKhNum(stats.passRate)}%</h3>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-red-500 shadow-sm">
          <div className="bg-red-50 text-red-600 p-3.5 rounded-xl border border-red-100">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold mb-0.5">សិស្សទន់ខ្សោយ/ព្រមាន</p>
            <h3 className="text-2xl font-bold text-gray-800">{toKhNum(stats.dropoutRisk)} នាក់</h3>
          </div>
        </div>
      </div>

      {/* Charts & Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm lg:col-span-1 flex flex-col">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center">
            <PieChartIcon className="w-5 h-5 mr-2 text-blue-600" /> ស្ថិតិលទ្ធផលសិក្សាសរុប
          </h3>
          <div className="flex-1 min-h-[250px]">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={stats.passFailData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {stats.passFailData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm lg:col-span-2 flex flex-col">
          <h3 className="text-base font-bold text-gray-800 mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-blue-600" /> របាយការណ៍សង្ខេបតាមថ្នាក់
          </h3>
          <div className="overflow-x-auto">
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
              <tbody className="text-sm">
                {stats.classes.map((cls) => {
                  let statusColor = 'bg-green-100 text-green-700 border-green-200';
                  if (cls.status === 'ព្រមាន') statusColor = 'bg-red-100 text-red-700 border-red-200';
                  else if (cls.status === 'មធ្យម') statusColor = 'bg-yellow-100 text-yellow-700 border-yellow-200';

                  return (
                    <tr key={cls.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors cursor-pointer" onClick={() => setSelectedTeacher(cls.id)}>
                      <td className="py-3 pl-4 font-bold text-gray-800">{cls.name}</td>
                      <td className="py-3 flex items-center gap-2 text-gray-700">
                        <div className="w-7 h-7 rounded-full bg-blue-100 flex items-center justify-center text-xs font-bold text-blue-700">
                          {cls.teacher.charAt(0)}
                        </div>
                        {cls.teacher}
                      </td>
                      <td className="py-3 text-center font-bold text-gray-700">{toKhNum(cls.total)}</td>
                      <td className={`py-3 text-center font-bold ${cls.attendance < 90 ? 'text-red-500' : 'text-green-600'}`}>
                        {toKhNum(cls.attendance)}%
                      </td>
                      <td className="py-3 text-center text-gray-700 font-bold">{toKhNum(cls.avgScore)}</td>
                      <td className="py-3 text-center">
                        <span className={`px-3 py-1 rounded-full text-xs font-bold border ${statusColor}`}>
                          {cls.status}
                        </span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Teacher Analysis Section */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 shadow-sm border-t-4 border-t-indigo-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-gray-100 pb-4 gap-4">
          <div>
            <h2 className="font-bold text-indigo-800 flex items-center gap-2 text-lg">
              <UserSearch className="w-6 h-6" />
              វិភាគគ្រូបង្រៀន និងថ្នាក់រៀនម្នាក់ៗ
            </h2>
            <p className="text-sm text-gray-500 mt-1 font-medium">ជ្រើសរើសឈ្មោះគ្រូ ដើម្បីមើលទិន្នន័យលម្អិតប្រចាំថ្នាក់របស់គាត់។</p>
          </div>
          <div className="w-full md:w-auto flex items-center gap-3">
            <label className="text-sm font-bold text-gray-600 hidden md:block">ជ្រើសរើសគ្រូ៖</label>
            <select 
              value={selectedTeacher}
              onChange={(e) => setSelectedTeacher(e.target.value)}
              className="w-full md:w-72 p-2.5 border border-indigo-200 rounded-xl outline-none focus:border-indigo-500 font-bold text-sm bg-indigo-50 text-indigo-800 cursor-pointer shadow-sm"
            >
              <option value="">-- សូមជ្រើសរើសគ្រូបង្រៀន --</option>
              {MOCK_TEACHERS.map(t => (
                <option key={t.id} value={t.id}>{t.name} ({t.class})</option>
              ))}
            </select>
          </div>
        </div>

        {!teacherDetail ? (
          <div className="text-center py-10 text-gray-400">
            <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">សូមជ្រើសរើសឈ្មោះគ្រូខាងលើ ដើម្បីមើលទិន្នន័យវិភាគលម្អិត។</p>
          </div>
        ) : (
          <div className="flex flex-col animate-in fade-in zoom-in duration-300">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-blue-50/50 p-4 rounded-xl border border-blue-100 text-center shadow-sm">
                <span className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">ចំនួនសិស្សក្នុងថ្នាក់</span>
                <span className="text-2xl font-black text-blue-700">{toKhNum(teacherDetail.totalStudents)}</span>
              </div>
              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 text-center shadow-sm">
                <span className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">មធ្យមភាគពិន្ទុថ្នាក់</span>
                <span className="text-2xl font-black text-indigo-700">{toKhNum(teacherDetail.avgScore)}</span>
              </div>
              <div className="bg-green-50/50 p-4 rounded-xl border border-green-100 text-center shadow-sm">
                <span className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">អត្រាវត្តមានសិស្ស</span>
                <span className="text-2xl font-black text-green-700">{toKhNum(teacherDetail.attendanceRate)}%</span>
              </div>
              <div className="bg-purple-50/50 p-4 rounded-xl border border-purple-100 text-center shadow-sm">
                <span className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">អត្រាសិស្សប្រឡងជាប់</span>
                <span className="text-2xl font-black text-purple-700">{toKhNum(teacherDetail.passRate)}%</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="border border-gray-100 rounded-xl p-4 shadow-sm bg-white flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs font-bold text-gray-500 uppercase">គុណភាពថ្នាក់រៀន (5-Dimensions)</p>
                  <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${teacherDetail.status === 'ល្អប្រសើរ' ? 'bg-green-100 text-green-700' : teacherDetail.status === 'ព្រមាន' ? 'bg-red-100 text-red-700' : 'bg-yellow-100 text-yellow-700'}`}>
                    {teacherDetail.status}
                  </span>
                </div>
                <div className="relative w-full h-[250px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={teacherDetail.radarData}>
                      <PolarGrid stroke="#e2e8f0" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: '#64748b', fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="សមត្ថភាព" dataKey="A" stroke="#4f46e5" fill="#4f46e5" fillOpacity={0.2} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="border border-gray-100 rounded-xl p-4 shadow-sm bg-white flex flex-col">
                <p className="text-xs font-bold text-gray-500 mb-2 uppercase">បំណែងចែកនិទ្ទេសសិស្សក្នុងថ្នាក់ (Grades)</p>
                <div className="relative w-full h-[250px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={teacherDetail.gradeData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                      <XAxis dataKey="grade" tick={{ fill: '#64748b', fontSize: 12, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: '#64748b', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: '#f1f5f9' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {teacherDetail.gradeData.map((entry: any, index: number) => (
                          <Cell key={`cell-${index}`} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
