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
import SearchableSelect from '@/components/ui/forms/SearchableSelect'
import Select from '@/components/ui/forms/Select'
import { toKhmerNumber } from '@/lib/utils/khmer-num'

// --- Mock Data ---
const MOCK_SCHOOL_STATS = {
  totalStudents: 1250,
  attendanceRate: 95.5,
  absentCount: 45,
  passRate: 88.2,
  dropoutRisk: 24,
  passFailData: [
    { name: 'ជាប់ (Pass)', value: 1100, color: '#16A36A' },
    { name: 'ធ្លាក់/ព្រមាន (Fail)', value: 150, color: '#D9485F' }
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
      { grade: 'A', count: 10, fill: '#16A36A' },
      { grade: 'B', count: 15, fill: '#18A5CC' },
      { grade: 'C', count: 12, fill: '#D99614' },
      { grade: 'D', count: 5, fill: '#C4762A' },
      { grade: 'E', count: 2, fill: '#D9485F' },
      { grade: 'F', count: 1, fill: '#A32A38' },
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
      { grade: 'A', count: 2, fill: '#16A36A' },
      { grade: 'B', count: 5, fill: '#18A5CC' },
      { grade: 'C', count: 10, fill: '#D99614' },
      { grade: 'D', count: 12, fill: '#C4762A' },
      { grade: 'E', count: 8, fill: '#D9485F' },
      { grade: 'F', count: 3, fill: '#A32A38' },
    ]
  },
};

export default function AdministrationClient() {
  const [selectedYear, setSelectedYear] = useState('2025-2026');
  const [selectedMonth, setSelectedMonth] = useState('nov');
  const [selectedTeacher, setSelectedTeacher] = useState('');

  const stats = MOCK_SCHOOL_STATS;
  const teacherDetail = selectedTeacher ? MOCK_TEACHER_DETAIL[selectedTeacher as keyof typeof MOCK_TEACHER_DETAIL] : null;

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-xl border border-divider shadow-sm">
        <div>
          <h2 className="text-2xl kh-moul text-brand-800">សួស្តី, លោកនាយក! 👋</h2>
          <p className="text-text-muted text-sm mt-1">នេះជាទិដ្ឋភាពរួមនៃសាលារបស់យើងសម្រាប់ការវិភាគប្រចាំខែ។</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Select
            ariaLabel="ឆ្នាំសិក្សា"
            value={selectedYear}
            onChange={setSelectedYear}
            options={[
              { value: '2025-2026', label: 'ឆ្នាំ ២០២៥-២០២៦' },
              { value: '2026-2027', label: 'ឆ្នាំ ២០២៦-២០២៧' },
            ]}
            leadingIcon={<CalendarDays className="text-brand" />}
          />
          <Select
            ariaLabel="ខែ"
            value={selectedMonth}
            onChange={setSelectedMonth}
            options={[
              { value: 'nov', label: 'ខែ វិច្ឆិកា' },
              { value: 'dec', label: 'ខែ ធ្នូ' },
              { value: 'jan', label: 'ខែ មករា' },
            ]}
            leadingIcon={<Calendar className="text-brand" />}
          />
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 md:gap-6">
        <div className="bg-white border border-divider rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-blue-500 shadow-sm">
          <div className="bg-brand-100 text-brand p-3.5 rounded-xl border border-divider">
            <Users className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-text-muted font-bold mb-0.5">សិស្សសរុប</p>
            <h3 className="text-2xl font-bold text-text-heading">{toKhmerNumber(stats.totalStudents)}</h3>
          </div>
        </div>

        <div className="bg-white border border-divider rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-green-500 shadow-sm">
          <div className="bg-success/10 text-success p-3.5 rounded-xl border border-success/30">
            <UserCheck className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-text-muted font-bold mb-0.5">អត្រាវត្តមានប្រចាំខែ</p>
            <h3 className="text-2xl font-bold text-text-heading">{toKhmerNumber(stats.attendanceRate)}%</h3>
            <p className="text-xs text-text-muted mt-1 font-bold">អវត្តមានសរុប <span className="text-danger">{toKhmerNumber(stats.absentCount)}</span> ដង</p>
          </div>
        </div>

        <div className="bg-white border border-divider rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-purple-500 shadow-sm">
          <div className="bg-brand-100 text-brand p-3.5 rounded-xl border border-divider">
            <Award className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-text-muted font-bold mb-0.5">អត្រាសិស្សជាប់</p>
            <h3 className="text-2xl font-bold text-text-heading">{toKhmerNumber(stats.passRate)}%</h3>
          </div>
        </div>

        <div className="bg-white border border-divider rounded-xl p-5 flex items-center gap-4 border-l-4 border-l-red-500 shadow-sm">
          <div className="bg-danger/10 text-danger p-3.5 rounded-xl border border-danger/30">
            <AlertTriangle className="w-7 h-7" />
          </div>
          <div>
            <p className="text-sm text-text-muted font-bold mb-0.5">សិស្សទន់ខ្សោយ/ព្រមាន</p>
            <h3 className="text-2xl font-bold text-text-heading">{toKhmerNumber(stats.dropoutRisk)} នាក់</h3>
          </div>
        </div>
      </div>

      {/* Charts & Tables */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-white border border-divider rounded-xl p-5 shadow-sm lg:col-span-1 flex flex-col">
          <h3 className="text-base font-bold text-text-heading mb-4 flex items-center">
            <PieChartIcon className="w-5 h-5 mr-2 text-brand" /> ស្ថិតិលទ្ធផលសិក្សាសរុប
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

        <div className="bg-white border border-divider rounded-xl p-5 shadow-sm lg:col-span-2 flex flex-col">
          <h3 className="text-base font-bold text-text-heading mb-4 flex items-center">
            <BarChart3 className="w-5 h-5 mr-2 text-brand" /> របាយការណ៍សង្ខេបតាមថ្នាក់
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[600px]">
              <thead>
                <tr className="bg-paper border-b border-divider text-text-body text-sm">
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
                  let statusColor = 'bg-success/10 text-success border-success/30';
                  if (cls.status === 'ព្រមាន') statusColor = 'bg-danger/10 text-danger border-danger/30';
                  else if (cls.status === 'មធ្យម') statusColor = 'bg-warning/10 text-warning border-warning/30';

                  return (
                    <tr key={cls.id} className="border-b border-divider hover:bg-paper transition-colors cursor-pointer" onClick={() => setSelectedTeacher(cls.id)}>
                      <td className="py-3 pl-4 font-bold text-text-heading">{cls.name}</td>
                      <td className="py-3 flex items-center gap-2 text-text-body">
                        <div className="w-7 h-7 rounded-full bg-brand-100 flex items-center justify-center text-xs font-bold text-brand">
                          {cls.teacher.charAt(0)}
                        </div>
                        {cls.teacher}
                      </td>
                      <td className="py-3 text-center font-bold text-text-body">{toKhmerNumber(cls.total)}</td>
                      <td className={`py-3 text-center font-bold ${cls.attendance < 90 ? 'text-danger' : 'text-success'}`}>
                        {toKhmerNumber(cls.attendance)}%
                      </td>
                      <td className="py-3 text-center text-text-body font-bold">{toKhmerNumber(cls.avgScore)}</td>
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
      <div className="bg-white border border-divider rounded-xl p-5 shadow-sm border-t-4 border-t-indigo-500">
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6 border-b border-divider pb-4 gap-4">
          <div>
            <h2 className="font-bold text-brand-800 flex items-center gap-2 text-lg">
              <UserSearch className="w-6 h-6" />
              វិភាគគ្រូបង្រៀន និងថ្នាក់រៀនម្នាក់ៗ
            </h2>
            <p className="text-sm text-text-muted mt-1 font-medium">ជ្រើសរើសឈ្មោះគ្រូ ដើម្បីមើលទិន្នន័យលម្អិតប្រចាំថ្នាក់របស់គាត់។</p>
          </div>
          <div className="w-full md:w-auto flex items-center gap-3">
            <label className="text-sm font-bold text-text-body hidden md:block" htmlFor="administration-teacher">ជ្រើសរើសគ្រូ៖</label>
            <SearchableSelect
              id="administration-teacher"
              ariaLabel="ជ្រើសរើសគ្រូបង្រៀន"
              placeholder="-- សូមជ្រើសរើសគ្រូបង្រៀន --"
              value={selectedTeacher}
              onChange={setSelectedTeacher}
              options={MOCK_TEACHERS.map(t => ({ value: t.id, label: `${t.name} (${t.class})` }))}
              wrapperClassName="w-full md:w-72"
            />
          </div>
        </div>

        {!teacherDetail ? (
          <div className="text-center py-10 text-text-muted">
            <GraduationCap className="w-12 h-12 mx-auto mb-3 opacity-50" />
            <p className="font-bold">សូមជ្រើសរើសឈ្មោះគ្រូខាងលើ ដើម្បីមើលទិន្នន័យវិភាគលម្អិត។</p>
          </div>
        ) : (
          <div className="flex flex-col animate-in fade-in zoom-in duration-300">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <div className="bg-brand-100/50 p-4 rounded-xl border border-divider text-center shadow-sm">
                <span className="text-[10px] text-text-muted font-bold uppercase mb-1 block">ចំនួនសិស្សក្នុងថ្នាក់</span>
                <span className="text-2xl font-black text-brand">{toKhmerNumber(teacherDetail.totalStudents)}</span>
              </div>
              <div className="bg-brand-100/50 p-4 rounded-xl border border-divider text-center shadow-sm">
                <span className="text-[10px] text-text-muted font-bold uppercase mb-1 block">មធ្យមភាគពិន្ទុថ្នាក់</span>
                <span className="text-2xl font-black text-brand">{toKhmerNumber(teacherDetail.avgScore)}</span>
              </div>
              <div className="bg-success/10 p-4 rounded-xl border border-success/30 text-center shadow-sm">
                <span className="text-[10px] text-text-muted font-bold uppercase mb-1 block">អត្រាវត្តមានសិស្ស</span>
                <span className="text-2xl font-black text-success">{toKhmerNumber(teacherDetail.attendanceRate)}%</span>
              </div>
              <div className="bg-brand-100/50 p-4 rounded-xl border border-divider text-center shadow-sm">
                <span className="text-[10px] text-text-muted font-bold uppercase mb-1 block">អត្រាសិស្សប្រឡងជាប់</span>
                <span className="text-2xl font-black text-brand">{toKhmerNumber(teacherDetail.passRate)}%</span>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="border border-divider rounded-xl p-4 shadow-sm bg-white flex flex-col">
                <div className="flex justify-between items-center mb-2">
                  <p className="text-xs font-bold text-text-muted uppercase">គុណភាពថ្នាក់រៀន (5-Dimensions)</p>
                  <span className={`px-2 py-1 text-[10px] font-bold rounded-full ${teacherDetail.status === 'ល្អប្រសើរ' ? 'bg-success/10 text-success' : teacherDetail.status === 'ព្រមាន' ? 'bg-danger/10 text-danger' : 'bg-warning/10 text-warning'}`}>
                    {teacherDetail.status}
                  </span>
                </div>
                <div className="relative w-full h-[250px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart cx="50%" cy="50%" outerRadius="70%" data={teacherDetail.radarData}>
                      <PolarGrid stroke="var(--divider)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--text-muted)', fontSize: 11 }} />
                      <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                      <Radar name="សមត្ថភាព" dataKey="A" stroke="#1D3E73" fill="#1D3E73" fillOpacity={0.2} />
                      <Tooltip />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="border border-divider rounded-xl p-4 shadow-sm bg-white flex flex-col">
                <p className="text-xs font-bold text-text-muted mb-2 uppercase">បំណែងចែកនិទ្ទេសសិស្សក្នុងថ្នាក់ (Grades)</p>
                <div className="relative w-full h-[250px] flex-1">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={teacherDetail.gradeData} margin={{ top: 20, right: 20, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--divider)" />
                      <XAxis dataKey="grade" tick={{ fill: 'var(--text-muted)', fontSize: 12, fontWeight: 'bold' }} axisLine={false} tickLine={false} />
                      <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                      <Tooltip cursor={{ fill: 'var(--surface-muted)' }} />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {teacherDetail.gradeData.map((entry, index) => (
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
