'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, UserRoundCheck, BookOpen, Award, Folders, 
  CalendarDays, BarChart3, LineChart, Files, PieChart, 
  TrendingUp, AlertCircle, ArrowRight, Settings 
} from 'lucide-react';
import Link from 'next/link';
import { logger } from '@/lib/utils/logger'

export default function YearlyReportClient() {
  const [stats, setStats] = useState({
    totalStudents: 0,
    femaleStudents: 0
  });

  useEffect(() => {
    // In a real app, fetch from Supabase here
    // For now, simulate loading from localStorage if any, or mock data
    const fetchStats = async () => {
      try {
        const stored = localStorage.getItem('krusmart_students_cache');
        if (stored) {
          const parsed = JSON.parse(stored);
          const total = parsed.length || 0;
          const female = parsed.filter((s: any) => s.gender === 'ស្រី' || s.gender === 'F').length;
          setStats({ totalStudents: total, femaleStudents: female });
        } else {
          setStats({ totalStudents: 45, femaleStudents: 22 });
        }
      } catch (e) {
        logger.error(e);
      }
    };
    fetchStats();
  }, []);

  const toKhNum = (num: number) => {
    const khDigits = ['០','១','២','៣','៤','៥','៦','៧','៨','៩'];
    return num.toString().split('').map(d => khDigits[parseInt(d)] || d).join('');
  };

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
      
      {/* Welcome Hero Section */}
      <div className="bg-gradient-to-r from-blue-700 to-indigo-800 rounded-2xl shadow-lg p-6 sm:p-10 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 right-20 w-32 h-32 bg-blue-400 opacity-20 rounded-full blur-xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className="text-3xl sm:text-4xl font-moul mb-3">របាយការណ៍ប្រចាំឆ្នាំ</h2>
            <div className="flex flex-wrap items-center gap-4 text-blue-100 text-sm sm:text-base">
              <span className="flex items-center gap-1 font-bold text-white bg-white/20 px-3 py-1 rounded-full">
                ទិន្នន័យបូកសរុបប្រចាំឆ្នាំសិក្សា
              </span>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl text-center min-w-[140px]">
            <p className="text-blue-100 text-xs uppercase tracking-wider mb-1">ឆ្នាំសិក្សា</p>
            <p className="text-2xl font-bold">២០២៥-២០២៦</p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-gray-200 p-5 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold">សិស្សសរុប</p>
            <p className="text-2xl font-bold text-gray-800">
              {toKhNum(stats.totalStudents)} <span className="text-sm font-normal text-gray-500">នាក់</span>
            </p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 p-5 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-pink-50 text-pink-600 flex items-center justify-center">
            <UserRoundCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold">សិស្សស្រី</p>
            <p className="text-2xl font-bold text-gray-800">
              {toKhNum(stats.femaleStudents)} <span className="text-sm font-normal text-gray-500">នាក់</span>
            </p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 p-5 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold">មុខវិជ្ជាសិក្សា</p>
            <p className="text-2xl font-bold text-gray-800">១៣ <span className="text-sm font-normal text-gray-500">មុខ</span></p>
          </div>
        </div>
        <div className="bg-white border border-gray-200 p-5 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-gray-500 font-bold">ស្ថានភាព</p>
            <p className="text-lg font-bold text-emerald-600">ធម្មតា</p>
          </div>
        </div>
      </div>

      {/* Main Menus */}
      <h3 className="text-lg font-bold text-gray-800 mb-4 flex items-center gap-2 mt-8">
        <Folders className="w-5 h-5 text-blue-600" /> ប្រភេទរបាយការណ៍
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        
        <Link href="/score/total" className="bg-white rounded-xl p-6 border border-gray-200 group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-blue-300">
          <div className="absolute top-0 right-0 w-2 h-full bg-blue-500"></div>
          <div className="w-12 h-12 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center mb-4 group-hover:bg-blue-600 group-hover:text-white transition-colors">
            <CalendarDays className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-moul text-gray-800 mb-2 group-hover:text-blue-700">បញ្ជីបូកលទ្ធផលសរុប</h4>
          <p className="text-sm text-gray-500 leading-relaxed">តារាងបញ្ចូល និងបង្ហាញពិន្ទុ ការវាយតម្លៃតាមខែ និងឆមាសនីមួយៗ។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-blue-600">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/ranking" className="bg-white rounded-xl p-6 border border-gray-200 group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-rose-300">
          <div className="absolute top-0 right-0 w-2 h-full bg-rose-500"></div>
          <div className="w-12 h-12 rounded-full bg-rose-50 text-rose-600 flex items-center justify-center mb-4 group-hover:bg-rose-600 group-hover:text-white transition-colors">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-moul text-gray-800 mb-2 group-hover:text-rose-700">ចំណាត់ថ្នាក់ និងនិទ្ទេស</h4>
          <p className="text-sm text-gray-500 leading-relaxed">របាយការណ៍សរុបចំណាត់ថ្នាក់ អវត្តមាន និងនិទ្ទេសប្រចាំខែ-ឆមាស។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-rose-600">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/score-analyse" className="bg-white rounded-xl p-6 border border-gray-200 group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-emerald-300">
          <div className="absolute top-0 right-0 w-2 h-full bg-emerald-500"></div>
          <div className="w-12 h-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center mb-4 group-hover:bg-emerald-600 group-hover:text-white transition-colors">
            <LineChart className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-moul text-gray-800 mb-2 group-hover:text-emerald-700">មធ្យមភាគប្រចាំឆ្នាំ</h4>
          <p className="text-sm text-gray-500 leading-relaxed">តារាងសរុបមធ្យមភាគប្រចាំខែ ឆមាស និងមធ្យមភាគប្រចាំឆ្នាំពេញលេញ។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-emerald-600">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/score-analysis/subject" className="bg-white rounded-xl p-6 border border-gray-200 group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-purple-300">
          <div className="absolute top-0 right-0 w-2 h-full bg-purple-500"></div>
          <div className="w-12 h-12 rounded-full bg-purple-50 text-purple-600 flex items-center justify-center mb-4 group-hover:bg-purple-600 group-hover:text-white transition-colors">
            <Files className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-moul text-gray-800 mb-2 group-hover:text-purple-700">មុខវិជ្ជាប្រចាំឆ្នាំ</h4>
          <p className="text-sm text-gray-500 leading-relaxed">បញ្ជីពិន្ទុ និងលទ្ធផលប្រចាំឆ្នាំបំបែកតាមមុខវិជ្ជា និងចំណេះដឹង លម្អិត។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-purple-600">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/yearly-report/subject-results" className="bg-white rounded-xl p-6 border border-gray-200 group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-cyan-300">
          <div className="absolute top-0 right-0 w-2 h-full bg-cyan-500"></div>
          <div className="w-12 h-12 rounded-full bg-cyan-50 text-cyan-600 flex items-center justify-center mb-4 group-hover:bg-cyan-600 group-hover:text-white transition-colors">
            <PieChart className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-moul text-gray-800 mb-2 group-hover:text-cyan-700">លទ្ធផលតាមមុខវិជ្ជា</h4>
          <p className="text-sm text-gray-500 leading-relaxed">របាយការណ៍លទ្ធផលសិក្សារបស់សិស្ស តាមមុខវិជ្ជានីមួយៗ ប្រចាំខែ ឆមាស និងប្រចាំឆ្នាំ។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-cyan-600">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/yearly-report/promoted" className="bg-white rounded-xl p-6 border border-gray-200 group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-teal-300">
          <div className="absolute top-0 right-0 w-2 h-full bg-teal-500"></div>
          <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 flex items-center justify-center mb-4 group-hover:bg-teal-600 group-hover:text-white transition-colors">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-moul text-gray-800 mb-2 group-hover:text-teal-700">សិស្សឡើងថ្នាក់</h4>
          <p className="text-sm text-gray-500 leading-relaxed">បញ្ជីរាយនាមសិស្សដែលទទួលបានមធ្យមភាគប្រចាំឆ្នាំចាប់ពី ៥.០ ឡើងទៅ។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-teal-600">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/yearly-report/repeated" className="bg-white rounded-xl p-6 border border-gray-200 group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-orange-300">
          <div className="absolute top-0 right-0 w-2 h-full bg-orange-500"></div>
          <div className="w-12 h-12 rounded-full bg-orange-50 text-orange-600 flex items-center justify-center mb-4 group-hover:bg-orange-600 group-hover:text-white transition-colors">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h4 className="text-lg font-moul text-gray-800 mb-2 group-hover:text-orange-700">សិស្សត្រួតថ្នាក់</h4>
          <p className="text-sm text-gray-500 leading-relaxed">បញ្ជីរាយនាមសិស្សដែលទទួលបានមធ្យមភាគប្រចាំឆ្នាំក្រោម ៥.០ ដែលត្រូវត្រួតថ្នាក់។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-orange-600">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

      </div>

      <div className="mt-10 bg-gray-50 p-6 rounded-xl border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-600">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-gray-800">ការកំណត់ប្រវត្តិរូប និងទិន្នន័យសិស្ស</h4>
            <p className="text-sm text-gray-500">កែប្រែព័ត៌មានគ្រូ សាលា និងបញ្ចូលឈ្មោះសិស្សថ្មី</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href="/profile" className="px-4 py-2 bg-white border border-gray-300 text-gray-700 font-bold rounded-lg shadow-sm hover:bg-gray-50 transition">
            ប្រវត្តិរូប
          </Link>
          <Link href="/student-list" className="px-4 py-2 bg-gray-800 text-white font-bold rounded-lg shadow-sm hover:bg-gray-900 transition">
            បញ្ជីឈ្មោះសិស្ស
          </Link>
        </div>
      </div>
      
    </div>
  );
}
