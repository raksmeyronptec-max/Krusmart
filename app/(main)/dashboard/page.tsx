'use client'

import { useState } from 'react'
import Link from 'next/link'
import { 
    Megaphone, Sparkles, Rocket, Search, ArrowRight,
    UserPlus, Users, LayoutGrid, CalendarCheck, BookMarked, Send, 
    Edit3, Table2, BarChart3, LineChart, Target, CalendarDays, 
    FolderOpen, Award, PieChart, BookOpen, BookUser, FileBadge, 
    BookOpenCheck, Key, Package, Contact2, Bell, Palette, UserCog,
    SearchX
} from 'lucide-react'
import { TopNav } from "@/components/TopNav"

const apps = [
    { name: 'បញ្ចូលព័ត៌មានសិស្ស', icon: UserPlus, url: '/enrollment', color: 'from-blue-500 to-blue-600' },
    { name: 'បញ្ជីឈ្មោះសិស្ស', icon: Users, url: '/student-list', color: 'from-purple-500 to-purple-600' },
    { name: 'ចុះវត្តមានតាមប្លង់តុ', icon: LayoutGrid, url: '/attendance/layout', color: 'from-orange-500 to-orange-600' },
    { name: 'បញ្ជីវត្តមានប្រចាំខែ', icon: CalendarCheck, url: '/attendance/monthly', color: 'from-pink-500 to-pink-600' },
    { name: 'បញ្ចូលពិន្ទុកិច្ចការផ្ទះ', icon: BookMarked, url: '/homework/enter', color: 'from-indigo-500 to-indigo-600' },
    { name: 'បញ្ជូនកិច្ចការផ្ទះទៅអាណាព្យាបាល', icon: Send, url: '/homework/send', color: 'from-fuchsia-500 to-fuchsia-600' },
    { name: 'បញ្ចូលពិន្ទុ', icon: Edit3, url: '/score/enter', color: 'from-green-500 to-emerald-600' },
    { name: 'តារាងពិន្ទុសរុប', icon: Table2, url: '/score/total', color: 'from-teal-500 to-teal-600' },
    { name: 'តារាងចំណាត់ថ្នាក់', icon: BarChart3, url: '/ranking', color: 'from-purple-600 to-purple-800' },
    { name: 'វិភាគទិន្នន័យសរុប', icon: LineChart, url: '/score-analyse', color: 'from-rose-600 to-pink-700'},
    { name: 'វិភាគតាមមុខវិជ្ជា', icon: Target, url: '/score-analysis/subject', color: 'from-blue-600 to-indigo-700' },
    { name: 'វិភាគអាយុ និងកម្ពស់', icon: CalendarDays, url: '/print-student-age', color: 'from-emerald-500 to-teal-600' },
    { name: 'រដ្ឋបាលថ្នាក់រៀន', icon: FolderOpen, url: '/administration', color: 'from-blue-700 to-indigo-800' },
    { name: 'តារាងកិត្តិយស', icon: Award, url: '/honor-roll', color: 'from-rose-500 to-rose-600' },
    { name: 'បញ្ជីបូកសរុបលទ្ធផលប្រចាំឆ្នាំ', icon: PieChart, url: '/yearly-report', color: 'from-cyan-500 to-cyan-600' },
    { name: 'សៀវភៅតាមដាន', icon: BookOpen, url: '/student-tracking', color: 'from-sky-500 to-sky-600' },
    { name: 'សៀវភៅសិក្ខាគារិក', icon: BookUser, url: '/record-book', color: 'from-emerald-600 to-teal-700' },
    { name: 'ទាញយកវិញ្ញាបនបត្រ', icon: FileBadge, url: '/certificate', color: 'from-yellow-500 to-orange-500' },
    { name: 'របាយការណ៍មាតាបិតា', icon: BookOpenCheck, url: '/parent-report', color: 'from-sky-500 to-blue-600' },
    { name: 'លេខកូដសិស្ស (ឪពុកម្តាយ)', icon: Key, url: '/print-student-codes', color: 'from-emerald-500 to-teal-600' },
    { name: 'កាលវិភាគសម្អាតថ្នាក់', icon: Sparkles, url: '/cleaning-schedule', color: 'from-cyan-400 to-blue-500' },
    { name: 'បញ្ជីសារពើភ័ណ្ឌ', icon: Package, url: '/inventory', color: 'from-amber-500 to-amber-600' },
    { name: 'បោះពុម្ពកាតសិស្ស', icon: Contact2, url: '/id-student', color: 'from-indigo-600 to-blue-700' },
    { name: 'ផ្ញើសារទៅអាណាព្យាបាល', icon: Bell, url: '/notifications', color: 'from-red-600 to-blue-700' },
    { name: 'សម្ភារៈតុបតែងថ្នាក់', icon: Palette, url: '/decorations', color: 'from-violet-500 to-fuchsia-600' },
    { name: 'ព័ត៌មានគណនី', icon: UserCog, url: '/profile', color: 'from-slate-500 to-slate-600' }
]

export default function DashboardPage() {
    const [searchTerm, setSearchTerm] = useState('')

    const filteredApps = apps.filter(app => 
        app.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    return (
        <div className="min-h-screen bg-[#f4f7fb] dark:bg-gray-900 pb-24 transition-colors duration-300">
            <TopNav />
            <section className="pt-8 pb-4 text-center px-6 outline-none">
                {/* Marquee Banner */}
                <div className="max-w-2xl mx-auto mb-8 bg-blue-50 dark:bg-gray-800 border border-blue-200 dark:border-gray-700 overflow-hidden relative rounded-md text-[#0054a6] dark:text-[#4facfe] shadow-sm transition-colors flex">
                    <div className="bg-blue-100 dark:bg-gray-800 z-10 px-4 py-2.5 flex items-center h-full border-r border-blue-200 dark:border-gray-700 shadow-[4px_0_10px_rgba(239,246,255,1)] dark:shadow-[4px_0_10px_rgba(31,41,55,1)] transition-colors shrink-0">
                        <Megaphone className="w-5 h-5 animate-pulse text-blue-700 dark:text-[#4facfe]" />
                    </div>
                    <div className="py-2.5 text-sm md:text-base font-semibold flex items-center w-full overflow-hidden whitespace-nowrap">
                        <div className="animate-marquee inline-block min-w-full">
                            <span className="mx-4">✨ សូមស្វាគមន៍មកកាន់ប្រព័ន្ធជំនួយការគ្រូបង្រៀនឌីជីថល (KruSmart)!</span>
                            <span className="mx-4">🚀 ងាយស្រួលគ្រប់គ្រងទិន្នន័យសិស្សយ៉ាងឆាប់រហ័ស និងសុវត្ថិភាព</span>
                            <span className="mx-4">📊 មុខងារបញ្ចូលពិន្ទុ និងវត្តមានត្រូវបានរៀបចំយ៉ាងល្អឥតខ្ចោះ</span>
                        </div>
                    </div>
                </div>

                {/* Title */}
                <div className="flex items-center justify-center gap-3 md:gap-4 mb-3">
                    <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-yellow-500 animate-pulse" />
                    <h1 className="kh-moul text-2xl md:text-3xl bg-clip-text text-transparent bg-gradient-to-r from-[#0054a6] to-[#4facfe] dark:from-[#4facfe] dark:to-blue-300">
                        KruSmart - ប្រព័ន្ធគ្រប់គ្រងការបង្រៀនឌីជីថល
                    </h1>
                    <Rocket className="w-6 h-6 md:w-8 md:h-8 text-blue-500 animate-bounce" />
                </div>
                
                <p className="text-[#0054a6]/80 dark:text-blue-300/80 text-sm md:text-base font-semibold italic mb-6 transition-colors">
                    គ្រប់គ្រងព័ត៌មានសិស្ស និងការបង្រៀនងាយស្រួល
                </p>
                
                {/* Search */}
                <div className="max-w-md mx-auto relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 dark:text-gray-500 w-5 h-5" />
                    <input 
                        type="search" 
                        placeholder="ស្វែងរកមុខងារ..." 
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-white dark:placeholder-gray-400 focus:ring-2 focus:ring-[#0054a6] dark:focus:ring-[#4facfe] outline-none transition shadow-sm text-sm md:text-base"
                    />
                </div>
            </section>

            <main className="max-w-7xl mx-auto px-4 md:px-6 py-4">
                
                {/* Usage Guide Banner */}
                <div className="mb-6 md:mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Link href="/tutorial" className="group relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0054a6] to-[#4facfe] p-1 block shadow-lg hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus:ring-4 focus:ring-blue-300">
                        <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors duration-300"></div>
                        <div className="relative bg-white/10 backdrop-blur-sm px-5 py-4 md:px-8 md:py-6 rounded-xl flex items-center justify-between gap-4 border border-white/20">
                            <div className="flex items-center gap-4">
                                <div className="bg-white/20 p-3 rounded-full text-white shadow-inner shrink-0 group-hover:scale-110 transition-transform duration-300">
                                    <BookOpen className="w-6 h-6 md:w-8 md:h-8" />
                                </div>
                                <div className="text-left text-white">
                                    <h3 className="kh-moul text-base md:text-lg mb-1 drop-shadow-md">ការប្រើប្រាស់</h3>
                                    <p className="text-blue-50 text-xs md:text-sm font-medium opacity-90">ចុចទីនេះដើម្បីអានសៀវភៅណែនាំអំពីរបៀបបញ្ចូលព័ត៌មាន និងគ្រប់គ្រងសិស្ស</p>
                                </div>
                            </div>
                            <div className="bg-white/20 p-2 md:p-3 rounded-full text-white group-hover:translate-x-2 transition-transform duration-300 shadow-sm shrink-0">
                                <ArrowRight className="w-4 h-4 md:w-6 md:h-6" />
                            </div>
                        </div>
                    </Link>
                </div>

                {/* App Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 md:gap-6">
                    {filteredApps.map((app, index) => (
                        <Link 
                            key={app.name} 
                            href={app.url}
                            className="group p-4 md:p-5 flex flex-col items-center text-center focus:outline-none bg-white dark:bg-gray-800 rounded-2xl shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-1 animate-in zoom-in duration-500"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <div className="mb-3">
                                <div className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center bg-gradient-to-tr ${app.color} shadow-md transition-all duration-300 group-hover:ring-4 group-hover:ring-offset-2 group-hover:ring-[#0054a6]/30 dark:group-hover:ring-offset-gray-900`}>
                                    <app.icon className="w-7 h-7 md:w-8 md:h-8 text-white" />
                                </div>
                            </div>
                            <h2 className="text-[12px] md:text-sm font-bold text-slate-800 dark:text-gray-200 leading-tight transition-colors">
                                {app.name}
                            </h2>
                        </Link>
                    ))}
                </div>
                
                {filteredApps.length === 0 && (
                    <div className="text-center py-10 text-gray-500 dark:text-gray-400 font-medium transition-colors animate-in fade-in">
                        <SearchX className="mx-auto w-10 h-10 mb-3 text-gray-400 dark:text-gray-500" />
                        <span>រកមិនឃើញមុខងារដែលអ្នកស្វែងរកទេ</span>
                    </div>
                )}
            </main>
        </div>
    )
}
