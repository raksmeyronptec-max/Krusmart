'use client'

import { useState } from 'react'
import { useUserRole } from '@/lib/rbac/useUserRole'
import Link from 'next/link'
import { Printer, Scissors,
    Sparkles, Search,
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


/**
 * Every feature, searchable.
 *
 * This used to *be* the dashboard: 29 equal-weight tiles that a teacher had to
 * scan to find anything. Navigation now lives in the sidebar and the mobile
 * bar, so the grid is no longer the way around the app — but it is still the
 * fastest way to jump straight to a named tool, so it stays here below the
 * summary rather than being deleted.
 */
export function FeatureGrid() {
    const [searchTerm, setSearchTerm] = useState('')
    const { isAdmin } = useUserRole()

    const filteredApps = apps.filter(app =>
        app.name.toLowerCase().includes(searchTerm.toLowerCase()) &&
        (!app.adminOnly || isAdmin)
    )

    return (
        <section aria-labelledby="all-features" className="print:hidden">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <h2 id="all-features" className="text-sm font-bold text-text-heading">មុខងារទាំងអស់</h2>
                <div className="relative w-full sm:w-72">
                    <Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-text-muted" aria-hidden="true" />
                    <input
                        type="search"
                        placeholder="ស្វែងរកមុខងារ..."
                        aria-label="ស្វែងរកមុខងារ"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="min-h-11 w-full rounded-xl border border-divider bg-bg-surface pr-3 pl-9 text-sm text-text-heading transition outline-none placeholder:text-text-muted focus:border-brand focus:ring-2 focus:ring-focus-ring/30"
                    />
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6">
                {filteredApps.map((app) => (
                    <Link
                        key={app.name}
                        href={app.url}
                        className="group flex flex-col items-center gap-2 rounded-xl border border-divider bg-bg-surface p-3 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus-ring"
                    >
                        <span className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-tr ${CATEGORY_GRADIENTS[app.category]} shadow-sm`}>
                            <app.icon className="h-5 w-5 text-white" />
                        </span>
                        <span className="text-[11px] leading-tight font-bold text-text-heading">{app.name}</span>
                    </Link>
                ))}
            </div>

            {filteredApps.length === 0 && (
                <p className="py-8 text-center text-sm font-medium text-text-muted">
                    <SearchX className="mx-auto mb-2 h-8 w-8" aria-hidden="true" />
                    រកមិនឃើញមុខងារដែលអ្នកស្វែងរកទេ
                </p>
            )}
        </section>
    )
}
