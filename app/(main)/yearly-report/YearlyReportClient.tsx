'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, UserRoundCheck, BookOpen, Award, Folders, 
  CalendarDays, BarChart3, LineChart, Files, PieChart, 
  TrendingUp, AlertCircle, ArrowRight, Settings 
} from 'lucide-react';
import Link from 'next/link';
import { logger } from '@/lib/utils/logger'
import { toKhmerNumber } from '@/lib/utils/khmer-num'
import { STORAGE_KEYS } from '@/lib/constants/storage'
import type { Student } from '@/lib/types'

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
        const stored = localStorage.getItem(STORAGE_KEYS.studentsCache);
        if (stored) {
          const parsed: Student[] = JSON.parse(stored);
          const total = parsed.length || 0;
          const female = parsed.filter(s => s.gender === 'ស្រី' || s.gender === 'F').length;
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

  return (
    <div className="max-w-7xl mx-auto p-4 md:p-8 space-y-8">
      
      {/* Welcome Hero Section */}
      <div className="bg-gradient-to-r from-brand-700 to-brand-800 rounded-xl shadow-lg p-6 sm:p-10 text-white relative overflow-hidden">
        <div className="absolute top-0 right-0 -mt-10 -mr-10 w-40 h-40 bg-white opacity-10 rounded-full blur-2xl"></div>
        <div className="absolute bottom-0 right-20 w-32 h-32 bg-brand-400 opacity-20 rounded-full blur-xl"></div>

        <div className="relative z-10 flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
          <div>
            <h2 className="text-3xl sm:text-4xl kh-moul mb-3">របាយការណ៍ប្រចាំឆ្នាំ</h2>
            <div className="flex flex-wrap items-center gap-4 text-brand-100 text-sm sm:text-base">
              <span className="flex items-center gap-1 font-bold text-white bg-white/20 px-3 py-1 rounded-full">
                ទិន្នន័យបូកសរុបប្រចាំឆ្នាំសិក្សា
              </span>
            </div>
          </div>
          <div className="bg-white/10 backdrop-blur-md border border-white/20 p-4 rounded-xl text-center min-w-[140px]">
            <p className="text-brand-100 text-xs uppercase tracking-wider mb-1">ឆ្នាំសិក្សា</p>
            <p className="text-2xl font-bold">២០២៥-២០២៦</p>
          </div>
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white border border-divider p-5 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-brand-100 text-brand flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-text-muted font-bold">សិស្សសរុប</p>
            <p className="text-2xl font-bold text-text-heading">
              {toKhmerNumber(stats.totalStudents)} <span className="text-sm font-normal text-text-muted">នាក់</span>
            </p>
          </div>
        </div>
        <div className="bg-white border border-divider p-5 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-brand-100 text-brand flex items-center justify-center">
            <UserRoundCheck className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-text-muted font-bold">សិស្សស្រី</p>
            <p className="text-2xl font-bold text-text-heading">
              {toKhmerNumber(stats.femaleStudents)} <span className="text-sm font-normal text-text-muted">នាក់</span>
            </p>
          </div>
        </div>
        <div className="bg-white border border-divider p-5 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-success/10 text-success flex items-center justify-center">
            <BookOpen className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-text-muted font-bold">មុខវិជ្ជាសិក្សា</p>
            <p className="text-2xl font-bold text-text-heading">១៣ <span className="text-sm font-normal text-text-muted">មុខ</span></p>
          </div>
        </div>
        <div className="bg-white border border-divider p-5 rounded-xl flex items-center gap-4 shadow-sm">
          <div className="w-12 h-12 rounded-lg bg-warning/10 text-warning flex items-center justify-center">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm text-text-muted font-bold">ស្ថានភាព</p>
            <p className="text-lg font-bold text-success">ធម្មតា</p>
          </div>
        </div>
      </div>

      {/* Main Menus */}
      <h3 className="text-lg font-bold text-text-heading mb-4 flex items-center gap-2 mt-8">
        <Folders className="w-5 h-5 text-brand" /> ប្រភេទរបាយការណ៍
      </h3>
      
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-6">
        
        <Link href="/score/total" className="bg-white rounded-xl p-6 border border-divider group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-divider">
          <div className="absolute top-0 right-0 w-2 h-full bg-brand"></div>
          <div className="w-12 h-12 rounded-full bg-brand-100 text-brand flex items-center justify-center mb-4 group-hover:bg-brand-hover group-hover:text-white transition-colors">
            <CalendarDays className="w-6 h-6" />
          </div>
          <h4 className="text-lg kh-moul text-text-heading mb-2 group-hover:text-brand">បញ្ជីបូកលទ្ធផលសរុប</h4>
          <p className="text-sm text-text-muted leading-relaxed">តារាងបញ្ចូល និងបង្ហាញពិន្ទុ ការវាយតម្លៃតាមខែ និងឆមាសនីមួយៗ។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-brand">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/ranking" className="bg-white rounded-xl p-6 border border-divider group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-danger/40">
          <div className="absolute top-0 right-0 w-2 h-full bg-danger"></div>
          <div className="w-12 h-12 rounded-full bg-danger/10 text-danger flex items-center justify-center mb-4 group-hover:opacity-90 group-hover:text-white transition-colors">
            <BarChart3 className="w-6 h-6" />
          </div>
          <h4 className="text-lg kh-moul text-text-heading mb-2 group-hover:text-danger">ចំណាត់ថ្នាក់ និងនិទ្ទេស</h4>
          <p className="text-sm text-text-muted leading-relaxed">របាយការណ៍សរុបចំណាត់ថ្នាក់ អវត្តមាន និងនិទ្ទេសប្រចាំខែ-ឆមាស។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-danger">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/score-analyse" className="bg-white rounded-xl p-6 border border-divider group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-success/40">
          <div className="absolute top-0 right-0 w-2 h-full bg-success"></div>
          <div className="w-12 h-12 rounded-full bg-success/10 text-success flex items-center justify-center mb-4 group-hover:bg-success group-hover:text-white transition-colors">
            <LineChart className="w-6 h-6" />
          </div>
          <h4 className="text-lg kh-moul text-text-heading mb-2 group-hover:text-success">មធ្យមភាគប្រចាំឆ្នាំ</h4>
          <p className="text-sm text-text-muted leading-relaxed">តារាងសរុបមធ្យមភាគប្រចាំខែ ឆមាស និងមធ្យមភាគប្រចាំឆ្នាំពេញលេញ។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-success">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/score-analysis/subject" className="bg-white rounded-xl p-6 border border-divider group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-divider">
          <div className="absolute top-0 right-0 w-2 h-full bg-brand-600"></div>
          <div className="w-12 h-12 rounded-full bg-brand-100 text-brand flex items-center justify-center mb-4 group-hover:bg-brand group-hover:text-white transition-colors">
            <Files className="w-6 h-6" />
          </div>
          <h4 className="text-lg kh-moul text-text-heading mb-2 group-hover:text-brand">មុខវិជ្ជាប្រចាំឆ្នាំ</h4>
          <p className="text-sm text-text-muted leading-relaxed">បញ្ជីពិន្ទុ និងលទ្ធផលប្រចាំឆ្នាំបំបែកតាមមុខវិជ្ជា និងចំណេះដឹង លម្អិត។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-brand">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/yearly-report/subject-results" className="bg-white rounded-xl p-6 border border-divider group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-divider">
          <div className="absolute top-0 right-0 w-2 h-full bg-brand-400"></div>
          <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-500 flex items-center justify-center mb-4 group-hover:bg-brand-500 group-hover:text-white transition-colors">
            <PieChart className="w-6 h-6" />
          </div>
          <h4 className="text-lg kh-moul text-text-heading mb-2 group-hover:text-brand-500">លទ្ធផលតាមមុខវិជ្ជា</h4>
          <p className="text-sm text-text-muted leading-relaxed">របាយការណ៍លទ្ធផលសិក្សារបស់សិស្ស តាមមុខវិជ្ជានីមួយៗ ប្រចាំខែ ឆមាស និងប្រចាំឆ្នាំ។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-brand-500">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/yearly-report/promoted" className="bg-white rounded-xl p-6 border border-divider group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-divider">
          <div className="absolute top-0 right-0 w-2 h-full bg-brand-500"></div>
          <div className="w-12 h-12 rounded-full bg-brand-100 text-brand-500 flex items-center justify-center mb-4 group-hover:bg-brand-500 group-hover:text-white transition-colors">
            <TrendingUp className="w-6 h-6" />
          </div>
          <h4 className="text-lg kh-moul text-text-heading mb-2 group-hover:text-brand-500">សិស្សឡើងថ្នាក់</h4>
          <p className="text-sm text-text-muted leading-relaxed">បញ្ជីរាយនាមសិស្សដែលទទួលបានមធ្យមភាគប្រចាំឆ្នាំចាប់ពី ៥.០ ឡើងទៅ។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-brand-500">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

        <Link href="/yearly-report/repeated" className="bg-white rounded-xl p-6 border border-divider group block relative overflow-hidden transition-all hover:-translate-y-1 hover:shadow-lg hover:border-warning/40">
          <div className="absolute top-0 right-0 w-2 h-full bg-warning"></div>
          <div className="w-12 h-12 rounded-full bg-warning/10 text-warning flex items-center justify-center mb-4 group-hover:opacity-90 group-hover:text-white transition-colors">
            <AlertCircle className="w-6 h-6" />
          </div>
          <h4 className="text-lg kh-moul text-text-heading mb-2 group-hover:text-warning">សិស្សត្រួតថ្នាក់</h4>
          <p className="text-sm text-text-muted leading-relaxed">បញ្ជីរាយនាមសិស្សដែលទទួលបានមធ្យមភាគប្រចាំឆ្នាំក្រោម ៥.០ ដែលត្រូវត្រួតថ្នាក់។</p>
          <div className="mt-4 flex items-center text-sm font-bold text-warning">
            ចូលទៅកាន់ <ArrowRight className="w-4 h-4 ml-1" />
          </div>
        </Link>

      </div>

      <div className="mt-10 bg-paper p-6 rounded-xl border border-divider flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-full bg-divider flex items-center justify-center text-text-body">
            <Settings className="w-5 h-5" />
          </div>
          <div>
            <h4 className="font-bold text-text-heading">ការកំណត់ប្រវត្តិរូប និងទិន្នន័យសិស្ស</h4>
            <p className="text-sm text-text-muted">កែប្រែព័ត៌មានគ្រូ សាលា និងបញ្ចូលឈ្មោះសិស្សថ្មី</p>
          </div>
        </div>
        <div className="flex gap-3">
          <Link href="/profile" className="px-4 py-2 bg-white border border-divider text-text-body font-bold rounded-lg shadow-sm hover:bg-paper transition">
            ប្រវត្តិរូប
          </Link>
          <Link href="/student-list" className="px-4 py-2 bg-brand-900 text-white font-bold rounded-lg shadow-sm hover:bg-brand-950 transition">
            បញ្ជីឈ្មោះសិស្ស
          </Link>
        </div>
      </div>
      
    </div>
  );
}
