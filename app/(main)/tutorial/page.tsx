'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { 
    ArrowLeft, Menu, X, Search, 
    UserPlus, Users, LayoutGrid, CalendarCheck, BookMarked, Send, 
    Edit3, Table2, BarChart3, LineChart, Target, CalendarDays, 
    FolderOpen, Award, PieChart, BookOpen, BookUser, FileBadge, 
    Sparkles, Package, Contact2, Bell, UserCog, Key, BookOpenCheck
} from 'lucide-react'
import { ThemeToggle } from '@/components/ThemeToggle'

const menuItems = [
    { id: 'enrollment', name: 'បញ្ចូលព័ត៌មានសិស្ស', icon: UserPlus, url: 'enrollment/Intro_enrollment.html', color: 'from-blue-500 to-blue-600' },
    { id: 'student-list', name: 'បញ្ជីឈ្មោះសិស្ស', icon: Users, url: 'student-list/Intro_student-list.html', color: 'from-purple-500 to-purple-600' },
    { id: 'table-layout', name: 'ចុះវត្តមានតាមប្លង់តុ', icon: LayoutGrid, url: 'table-layout/Intro_table-layout.html', color: 'from-orange-500 to-orange-600' },
    { id: 'monthly-attendance', name: 'បញ្ជីវត្តមានប្រចាំខែ', icon: CalendarCheck, url: 'attendance/Intro_attendance.html', color: 'from-pink-500 to-pink-600' },
    { id: 'homework-score', name: 'បញ្ចូលពិន្ទុកិច្ចការផ្ទះ', icon: BookMarked, url: 'homework/Intro_homework.html', color: 'from-indigo-500 to-indigo-600' },
    { id: 'send-homework', name: "បញ្ជូនកិច្ចការផ្ទះទៅអាណាព្យាបាល", icon: Send, url: "homework/Intro_send-homework.html", color: "from-fuchsia-500 to-fuchsia-600"},
    { id: 'enter-score', name: 'បញ្ចូលពិន្ទុ', icon: Edit3, url: 'score/enter_monthly_score/enter_mothly_score.html', color: 'from-green-500 to-emerald-600' },
    { id: 'subject-scores', name: 'តារាងពិន្ទុសរុប', icon: Table2, url: 'score/subject-scores/Intro_subject_score.html', color: 'from-teal-500 to-teal-600' },
    { id: 'ranking', name: 'តារាងចំណាត់ថ្នាក់', icon: BarChart3, url: 'ranking/ranking/ranking_print.html', color: 'from-purple-600 to-purple-800' },
    { id: 'total-analysis', name: 'វិភាគទិន្នន័យសរុប', icon: LineChart, url: 'score_analyse/total_analyse.html', color: 'from-rose-600 to-pink-700'},
    { id: 'subject-analysis', name: 'វិភាគតាមមុខវិជ្ជា', icon: Target, url: 'score_analyse/analyse_by_subject.html', color: 'from-blue-600 to-indigo-700' },
    { id: 'admin', name: 'រដ្ឋបាលថ្នាក់រៀន', icon: FolderOpen, url: 'adr/Main_adr.html', color: 'from-blue-700 to-indigo-800' },
    { id: 'parent-report', name: 'របាយការណ៍មាតាបិតា', icon: BookOpenCheck, url: 'parent-report.html', color: 'from-sky-500 to-blue-600' },
    { id: 'student-codes', name: 'លេខកូដសិស្ស (ឪពុកម្តាយ)', icon: Key, url: 'student-codes.html', color: 'from-emerald-500 to-teal-600' },
    { id: 'honor-roll', name: 'តារាងកិត្តិយស', icon: Award, url: 'ranking/honor-roll/Intro_honor-roll.html', color: 'from-rose-500 to-rose-600' },
    { id: 'annual-summary', name: 'បញ្ជីបូកសរុបលទ្ធផលប្រចាំឆ្នាំ', icon: PieChart, url: 'years_score/new_dashboard.html', color: 'from-cyan-500 to-cyan-600' },
    { id: 'tracking-book', name: 'សៀវភៅតាមដាន', icon: BookOpen, url: 'student_tracking/student_tracking/Intro_student_tracking.html', color: 'from-sky-500 to-sky-600' },
    { id: 'record-book', name: 'សៀវភៅសិក្ខាគារិក', icon: BookUser, url: 'student_tracking/book_record/Intro_record_book.html', color: 'from-emerald-600 to-teal-700' },
    { id: 'certificate', name: 'ទាញយកវិញ្ញាបនបត្រ', icon: FileBadge, url: 'certificate/Intro_certificate.html', color: 'from-yellow-500 to-orange-500' },
    { id: 'cleaning', name: 'កាលវិភាគសម្អាតថ្នាក់', icon: Sparkles, url: 'cleaning_schedule/Intro_cleaning_schedule.html', color: 'from-cyan-400 to-blue-500' },
    { id: 'inventory', name: 'បញ្ជីសារពើភ័ណ្ឌ', icon: Package, url: 'inventory/inventory.html', color: 'from-amber-500 to-amber-600' },
    { id: 'id-card', name: 'បោះពុម្ពកាតសិស្ស', icon: Contact2, url: 'id_student/Intro_id_student.html', color: 'from-indigo-600 to-blue-700' },
    { id: 'age-analysis', name: 'វិភាគអាយុ និងកម្ពស់', icon: CalendarDays, url: 'student_age_list/Intro_student_age_list.html', color: 'from-emerald-500 to-teal-600' },
    { id: 'notifications', name: 'ផ្ញើសារទៅអាណាព្យាបាល', icon: Bell, url: 'teacher-notifications/teacher-notifications.html', color: 'from-red-600 to-blue-700' },
    { id: 'profile', name: 'ព័ត៌មានគណនី', icon: UserCog, url: 'profile/profile.html', color: 'from-slate-500 to-slate-600' }
]

export default function TutorialPage() {
    const router = useRouter()
    const [isMenuOpen, setIsMenuOpen] = useState(false)
    const [searchTerm, setSearchTerm] = useState('')
    const [activeItem, setActiveItem] = useState(menuItems[0])
    const [isLoading, setIsLoading] = useState(true)
    const menuRef = useRef<HTMLDivElement>(null)

    const filteredItems = menuItems.filter(item => 
        item.name.toLowerCase().includes(searchTerm.toLowerCase())
    )

    useEffect(() => {
        const lastPageId = localStorage.getItem('ptec_last_tutorial_page')
        if (lastPageId) {
            const found = menuItems.find(i => i.id === lastPageId)
            if (found) setActiveItem(found)
        }
    }, [])

    useEffect(() => {
        function handleClickOutside(event: MouseEvent) {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setIsMenuOpen(false)
            }
        }
        document.addEventListener("mousedown", handleClickOutside)
        return () => document.removeEventListener("mousedown", handleClickOutside)
    }, [])

    const handleSelect = (item: typeof menuItems[0]) => {
        setActiveItem(item)
        setIsMenuOpen(false)
        setIsLoading(true)
        localStorage.setItem('ptec_last_tutorial_page', item.id)
    }

    return (
        <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-gray-900 transition-colors duration-300 relative">
            <header className="flex-none bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-800 shadow-sm relative z-50 w-full transition-colors duration-300">
                <div className="max-w-7xl mx-auto px-3 md:px-6 lg:px-8 py-2 md:py-3 flex justify-between items-center relative">
                    
                    <div className="flex items-center gap-2 md:gap-3">
                        <Link href="/dashboard" className="flex items-center justify-center w-9 h-9 md:w-11 md:h-11 bg-blue-50 dark:bg-gray-800 text-[#0054a6] dark:text-[#4facfe] hover:bg-blue-100 dark:hover:bg-gray-700 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-[#0054a6]">
                            <ArrowLeft className="w-5 h-5 md:w-6 md:h-6" />
                        </Link>
                        <h1 className="kh-moul text-[#0054a6] dark:text-[#4facfe] text-base md:text-xl lg:text-2xl flex items-center gap-2 truncate max-w-[180px] sm:max-w-xs md:max-w-full transition-colors">
                            សៀវភៅណែនាំ
                        </h1>
                    </div>
                    
                    <div className="flex items-center gap-2 md:gap-4" ref={menuRef}>
                        <ThemeToggle />

                        <button 
                            onClick={() => setIsMenuOpen(!isMenuOpen)}
                            className="p-2 md:px-4 md:py-2 text-[#0054a6] dark:text-[#4facfe] bg-blue-50 dark:bg-gray-800 rounded-lg md:rounded-xl hover:bg-blue-100 dark:hover:bg-gray-700 transition-colors duration-200 flex items-center gap-2"
                        >
                            <Menu className="w-5 h-5 md:w-6 md:h-6" />
                            <span className="hidden md:inline-block font-bold text-sm">បញ្ជីម៉ឺនុយ</span>
                        </button>

                        {/* Dropdown Menu */}
                        <div 
                            className={`absolute right-3 md:right-6 lg:right-8 top-[110%] w-[calc(100%-1.5rem)] sm:w-80 md:w-96 bg-white dark:bg-gray-900 border border-gray-100 dark:border-gray-800 shadow-2xl rounded-xl overflow-hidden origin-top-right transition-all duration-300 ${isMenuOpen ? 'opacity-100 scale-100 visible' : 'opacity-0 scale-95 invisible'}`}
                        >
                            <div className="bg-gray-50 dark:bg-gray-800 px-4 py-3 border-b border-gray-100 dark:border-gray-700 flex flex-col gap-3 sticky top-0 z-10 transition-colors">
                                <div className="flex justify-between items-center font-bold text-gray-700 dark:text-gray-200">
                                    <span className="text-sm md:text-base">ជ្រើសរើសទំព័រ</span>
                                    <button onClick={() => setIsMenuOpen(false)} className="text-gray-400 hover:text-red-500 transition-colors p-1 bg-white dark:bg-gray-800 rounded-md shadow-sm border border-gray-200 dark:border-gray-600">
                                        <X className="w-4 h-4 md:w-5 md:h-5" />
                                    </button>
                                </div>
                                <div className="relative w-full">
                                    <Search className="absolute left-3 top-2.5 w-4 h-4 text-gray-400" />
                                    <input 
                                        type="text" 
                                        placeholder="ស្វែងរកទំព័រ..." 
                                        value={searchTerm}
                                        onChange={(e) => setSearchTerm(e.target.value)}
                                        className="w-full pl-9 pr-3 py-2 bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#0054a6] text-gray-800 dark:text-gray-200 placeholder-gray-400"
                                    />
                                </div>
                            </div>

                            <nav className="flex flex-col p-2 gap-1 max-h-[60vh] overflow-y-auto">
                                {filteredItems.map(item => {
                                    const isActive = activeItem.id === item.id
                                    return (
                                        <button 
                                            key={item.id}
                                            onClick={() => handleSelect(item)}
                                            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm font-bold w-full transition-all ${
                                                isActive 
                                                    ? 'bg-blue-50 dark:bg-gray-800 border-blue-100 dark:border-gray-700 text-[#0054a6] dark:text-[#4facfe] shadow-sm' 
                                                    : 'border-transparent hover:bg-gray-50 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                                            }`}
                                        >
                                            <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${item.color} flex items-center justify-center text-white shrink-0 shadow-sm`}>
                                                <item.icon className="w-4 h-4" />
                                            </div>
                                            <span className="truncate">{item.name}</span>
                                        </button>
                                    )
                                })}
                                {filteredItems.length === 0 && (
                                    <div className="p-6 text-center text-gray-500 text-sm">
                                        រកមិនឃើញទំព័រនេះទេ...
                                    </div>
                                )}
                            </nav>
                        </div>
                    </div>
                </div>
            </header>

            <main className="flex-1 w-full max-w-7xl mx-auto p-3 md:p-4 lg:p-6 flex flex-col relative z-0">
                <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-sm w-full flex-1 rounded-xl overflow-hidden relative flex flex-col">
                    {/* We removed the full-screen loading spinner to make the page feel instantly responsive */}
                    {isLoading && (
                        <div className="absolute top-0 left-0 w-full h-1 bg-gray-100 z-50">
                            <div className="h-full bg-[#0054a6] animate-pulse"></div>
                        </div>
                    )}
                    
                    <iframe 
                        src={`/introduction/${activeItem.url}`} 
                        className="w-full flex-1 h-full border-0 relative z-20"
                        onLoad={() => setIsLoading(false)}
                    />
                </div>
            </main>
        </div>
    )
}
