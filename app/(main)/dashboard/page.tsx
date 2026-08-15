'use client'

import { useState } from 'react'
import { useUserRole } from '@/lib/rbac/useUserRole'
import Link from 'next/link'
import { Printer, Scissors,
    Megaphone, Sparkles, Rocket, Search, ArrowRight,
    UserPlus, Users, LayoutGrid, CalendarCheck, BookMarked, Send,
    Edit3, Table2, BarChart3, LineChart, Target, CalendarDays,
    FolderOpen, Award, PieChart, BookOpen, BookUser, FileBadge,
    BookOpenCheck, Key, Package, Contact2, Bell, Palette, UserCog,
    SearchX
} from 'lucide-react'

/**
 * Tile categories.
 *
 * The grid used to carry 29 independently-chosen gradients — fuchsia beside
 * rose beside amber — which made the page read as decoration rather than as a
 * tool, and gave a teacher no way to find things by shape. Six categories
 * replace them, so colour now means "what kind of work is this".
 *
 * Only two hues sit outside the brand ramp, and both are semantic rather than
 * decorative: attendance is the success green used for a present mark
 * everywhere else, and achievement is the gold reserved for rankings,
 * certificates and the honour roll.
 */
const CATEGORY_GRADIENTS = {
    students:    'from-brand-800 to-brand-600',
    scores:      'from-brand-700 to-brand-500',
    attendance:  'from-success to-[#0F8A58]',
    admin:       'from-brand-950 to-brand-800',
    tools:       'from-brand-500 to-brand-400',
    achievement: 'from-gold to-[#C4953A]',
} as const

type Category = keyof typeof CATEGORY_GRADIENTS

interface AppTile {
    name: string
    icon: React.ComponentType<{ className?: string }>
    url: string
    category: Category
    /** Hidden from teachers — the target redirects anyone without an admin role. */
    adminOnly?: boolean
}

const apps: AppTile[] = [
    { name: 'បញ្ចូលព័ត៌មានសិស្ស', icon: UserPlus, url: '/enrollment', category: 'students' },
    { name: 'បញ្ជីឈ្មោះសិស្ស', icon: Users, url: '/student-list', category: 'students' },
    { name: 'ចុះវត្តមានតាមប្លង់តុ', icon: LayoutGrid, url: '/attendance/layout', category: 'attendance' },
    { name: 'បញ្ជីវត្តមានប្រចាំខែ', icon: CalendarCheck, url: '/attendance/monthly', category: 'attendance' },
    { name: 'បញ្ចូលពិន្ទុកិច្ចការផ្ទះ', icon: BookMarked, url: '/homework/enter', category: 'scores' },
    { name: 'បញ្ជូនកិច្ចការផ្ទះទៅអាណាព្យាបាល', icon: Send, url: '/homework/send', category: 'scores' },
    { name: 'បញ្ចូលពិន្ទុ', icon: Edit3, url: '/score/enter', category: 'scores' },
    { name: 'តារាងពិន្ទុសរុប', icon: Table2, url: '/score/total', category: 'scores' },
    { name: 'តារាងពិន្ទុ (ទម្រង់ក្រសួង)', icon: Printer, url: '/score/print', category: 'scores' },
    { name: 'តារាងចំណាត់ថ្នាក់', icon: BarChart3, url: '/ranking', category: 'achievement' },
    { name: 'វិភាគទិន្នន័យសរុប', icon: LineChart, url: '/score-analyse', category: 'scores' },
    { name: 'វិភាគតាមមុខវិជ្ជា', icon: Target, url: '/score-analysis/subject', category: 'scores' },
    { name: 'វិភាគអាយុ និងកម្ពស់', icon: CalendarDays, url: '/print-student-age', category: 'students' },
    { name: 'រដ្ឋបាលថ្នាក់រៀន (១៣ សៀវភៅ)', icon: FolderOpen, url: '/class-admin', category: 'admin' },
    { name: 'ផ្ទាំងវិភាគសាលា (នាយក)', icon: LineChart, url: '/administration', category: 'admin', adminOnly: true },
    { name: 'តារាងកិត្តិយស', icon: Award, url: '/honor-roll', category: 'achievement' },
    { name: 'បញ្ជីបូកសរុបលទ្ធផលប្រចាំឆ្នាំ', icon: PieChart, url: '/yearly-report', category: 'scores' },
    { name: 'សៀវភៅតាមដាន', icon: BookOpen, url: '/student-tracking', category: 'admin' },
    { name: 'សៀវភៅសិក្ខាគារិក', icon: BookUser, url: '/record-book', category: 'admin' },
    { name: 'ទាញយកវិញ្ញាបនបត្រ', icon: FileBadge, url: '/certificate', category: 'achievement' },
    { name: 'របាយការណ៍មាតាបិតា', icon: BookOpenCheck, url: '/parent-report', category: 'admin' },
    { name: 'លេខកូដសិស្ស (ឪពុកម្តាយ)', icon: Key, url: '/print-student-codes', category: 'students' },
    { name: 'កាលវិភាគសម្អាតថ្នាក់', icon: Sparkles, url: '/cleaning-schedule', category: 'tools' },
    { name: 'បញ្ជីសារពើភ័ណ្ឌ', icon: Package, url: '/inventory', category: 'tools' },
    { name: 'បោះពុម្ពកាតសិស្ស', icon: Contact2, url: '/id-student', category: 'students' },
    { name: 'ផ្ញើសារទៅអាណាព្យាបាល', icon: Bell, url: '/notifications', category: 'tools' },
    { name: 'សម្ភារៈតុបតែងថ្នាក់', icon: Palette, url: '/decorations', category: 'tools' },
    { name: 'បំបែកសន្លឹក Poster', icon: Scissors, url: '/poster-splitter', category: 'tools' },
    { name: 'ព័ត៌មានគណនី', icon: UserCog, url: '/profile', category: 'tools' },
]

export default function DashboardPage() {
    const [searchTerm, setSearchTerm] = useState('')

    // The principal's analytics page redirects a plain teacher, so offering the
    // tile would be a dead end.
    const { isAdmin } = useUserRole()

    const filteredApps = apps.filter(app =>
        app.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (!app.adminOnly || isAdmin)
    )

    return (
        <div className="min-h-screen bg-bg-app pb-24 transition-colors duration-300">
            <section className="pt-8 pb-4 text-center px-6 outline-none">
                {/* Marquee Banner */}
                <div className="max-w-2xl mx-auto mb-8 bg-brand-100 dark:bg-brand-900 border border-divider overflow-hidden relative rounded-md text-brand shadow-sm transition-colors flex">
                    <div className="bg-brand-100 dark:bg-brand-900 z-10 px-4 py-2.5 flex items-center h-full border-r border-divider transition-colors shrink-0">
                        <Megaphone className="w-5 h-5 animate-pulse text-brand" />
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
                    <Sparkles className="w-6 h-6 md:w-8 md:h-8 text-gold animate-pulse" />
                    <h1 className="kh-moul text-2xl md:text-3xl bg-clip-text text-transparent bg-gradient-to-r from-brand-800 to-brand-500 dark:from-brand-400 dark:to-brand-300">
                        KruSmart - ប្រព័ន្ធគ្រប់គ្រងការបង្រៀនឌីជីថល
                    </h1>
                    <Rocket className="w-6 h-6 md:w-8 md:h-8 text-brand-500 animate-bounce" />
                </div>

                <p className="text-text-body text-sm md:text-base font-semibold italic mb-6 transition-colors">
                    គ្រប់គ្រងព័ត៌មានសិស្ស និងការបង្រៀនងាយស្រួល
                </p>

                {/* Search */}
                <div className="max-w-md mx-auto relative">
                    <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-text-muted w-5 h-5" />
                    <input
                        type="search"
                        placeholder="ស្វែងរកមុខងារ..."
                        aria-label="ស្វែងរកមុខងារ"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-11 pr-4 py-3 rounded-xl border border-divider bg-bg-surface text-text-heading placeholder:text-text-muted focus:ring-2 focus:ring-focus-ring/40 focus:border-brand outline-none transition shadow-sm text-sm md:text-base"
                    />
                </div>
            </section>

            <main className="max-w-7xl mx-auto px-4 md:px-6 py-4">

                {/* Usage Guide Banner */}
                <div className="mb-6 md:mb-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Link href="/tutorial" className="group relative overflow-hidden rounded-xl bg-gradient-to-r from-brand-800 to-brand-500 p-1 block shadow-md hover:shadow-lg transition-all duration-300 transform hover:-translate-y-1 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus-ring">
                        <div className="absolute inset-0 bg-white/10 group-hover:bg-transparent transition-colors duration-300"></div>
                        <div className="relative bg-white/10 backdrop-blur-sm px-5 py-4 md:px-8 md:py-6 rounded-lg flex items-center justify-between gap-4 border border-white/20">
                            <div className="flex items-center gap-4">
                                <div className="bg-white/20 p-3 rounded-full text-white shadow-inner shrink-0 group-hover:scale-110 transition-transform duration-300">
                                    <BookOpen className="w-6 h-6 md:w-8 md:h-8" />
                                </div>
                                <div className="text-left text-white">
                                    <h2 className="kh-moul text-base md:text-lg mb-1 drop-shadow-md">ការប្រើប្រាស់</h2>
                                    <p className="text-white/90 text-xs md:text-sm font-medium">ចុចទីនេះដើម្បីអានសៀវភៅណែនាំអំពីរបៀបបញ្ចូលព័ត៌មាន និងគ្រប់គ្រងសិស្ស</p>
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
                            className="group p-4 md:p-5 flex flex-col items-center text-center bg-bg-surface border border-divider rounded-xl shadow-sm hover:shadow-md transition-all duration-300 transform hover:-translate-y-1 animate-in zoom-in duration-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus-ring"
                            style={{ animationDelay: `${index * 50}ms` }}
                        >
                            <div className="mb-3">
                                <div className={`w-14 h-14 md:w-16 md:h-16 rounded-xl flex items-center justify-center bg-gradient-to-tr ${CATEGORY_GRADIENTS[app.category]} shadow-sm transition-all duration-300 group-hover:ring-4 group-hover:ring-offset-2 group-hover:ring-focus-ring/30 group-hover:ring-offset-bg-surface`}>
                                    <app.icon className="w-7 h-7 md:w-8 md:h-8 text-white" />
                                </div>
                            </div>
                            <h2 className="text-[12px] md:text-sm font-bold text-text-heading leading-tight transition-colors">
                                {app.name}
                            </h2>
                        </Link>
                    ))}
                </div>

                {filteredApps.length === 0 && (
                    <div className="text-center py-10 text-text-muted font-medium transition-colors animate-in fade-in">
                        <SearchX className="mx-auto w-10 h-10 mb-3 text-text-muted" />
                        <span>រកមិនឃើញមុខងារដែលអ្នកស្វែងរកទេ</span>
                    </div>
                )}
            </main>
        </div>
    )
}
