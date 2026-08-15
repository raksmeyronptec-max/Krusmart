"use client"

import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, User, LogOut, Home, Users, CheckSquare, BarChart2, Package, MapPin, Crown, ChevronDown, Copy, ExternalLink, UserCircle, Loader2 } from "lucide-react"
import { ThemeToggle } from "./ThemeToggle"
import { createClient } from "@/lib/supabase/client"
import { calculateDistanceInMeters } from "@/lib/utils/distance"
import toast from "react-hot-toast"
import { getErrorMessageOr } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'
import { ClassContextSwitcher } from './ClassContextSwitcher'

const navItems = [
  { name: "ផ្ទាំងដើម", path: "/dashboard", icon: Home },
  { name: "បញ្ជីសិស្ស", path: "/student-list", icon: Users },
  { name: "វត្តមាន", path: "/attendance/monthly", icon: CheckSquare },
  { name: "ពិន្ទុ", path: "/score/total", icon: BarChart2 },
  { name: "សម្ភារៈ", path: "/inventory", icon: Package },
]

export function TopNav() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  const pathname = usePathname()
  // Memoised so effects can list it as a dependency without re-running.
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    const fetchProfileData = async () => {
      // Local JWT read rather than a getUser() round-trip — see the note in
      // lib/supabase/middleware.ts about free-tier rate limiting.
      const { data: { session } } = await supabase.auth.getSession()
      const user = session?.user
      if (user) {
        setUserId(user.id)
        const { data, error } = await supabase.from('settings').select('photo_url').eq('teacher_id', user.id).single()
        // PGRST116 = no settings row yet, which is normal for a new teacher.
        // Anything else is worth seeing in dev, but never worth a toast here —
        // a missing avatar is not something the teacher needs to act on.
        if (error && error.code !== 'PGRST116') {
          logger.error('Failed to load profile photo:', error)
        } else if (data?.photo_url) {
          setPhotoUrl(data.photo_url)
        }
      }
    }
    fetchProfileData()
  }, [supabase])

  const handleCheckIn = async () => {
    setIsCheckingIn(true)
    const toastId = toast.loading("កំពុងពិនិត្យទីតាំងនិងចុះវត្តមាន...")

    try {
      // 1. Get user session
      const { data: { session }, error: sessionError } = await supabase.auth.getSession()
      if (sessionError || !session?.user) {
        throw new Error("សូមចូលគណនីជាមុនសិន!")
      }
      const user = session.user

      // 2. Find teacher profile
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('school_id')
        .eq('id', user.id)
        .single()
      
      if (profileError || !profile) {
        throw new Error("រកមិនឃើញគណនីគ្រូរបស់អ្នកនៅក្នុងប្រព័ន្ធគ្រប់គ្រងទេ។")
      }
      
      const schoolId = profile.school_id
      if (!schoolId) {
        throw new Error("គណនីរបស់អ្នកមិនទាន់បានភ្ជាប់ជាមួយសាលាណាមួយទេ។")
      }

      // 3. Get School Location Info
      const { data: school, error: schoolError } = await supabase
        .from('schools')
        .select('location')
        .eq('id', schoolId)
        .single()
      
      if (schoolError || !school || !school.location) {
        throw new Error("នាយកសាលាមិនទាន់បានកំណត់ទីតាំងសាលាទេ។")
      }
      
      const schoolLoc = school.location as { latitude: number, longitude: number, radius: number }

      // 4. Process Geolocation
      if (!navigator.geolocation) {
        throw new Error("ឧបករណ៍របស់អ្នកមិនគាំទ្រ GPS ទេ។")
      }

      navigator.geolocation.getCurrentPosition(async (position) => {
        try {
          const teacherLat = position.coords.latitude
          const teacherLng = position.coords.longitude
          
          const distance = calculateDistanceInMeters(
            schoolLoc.latitude, schoolLoc.longitude, 
            teacherLat, teacherLng
          )

          // 5. Verify Distance Limit
          if (distance <= schoolLoc.radius) {
            const todayStr = new Date().toISOString().split('T')[0]
            
            const { error: insertError } = await supabase
              .from('teacher_attendance')
              .insert({
                teacher_id: user.id,
                date: todayStr,
                time: new Date().toLocaleTimeString('km-KH'),
                status: 'present',
                distance_from_school: Math.round(distance)
              })

            if (insertError) throw new Error("មានបញ្ហាក្នុងការរក្សាទុកទិន្នន័យវត្តមាន។")

            toast.success(`ចុះវត្តមានបានជោគជ័យ! (ចម្ងាយពីសាលា ${Math.round(distance)} ម៉ែត្រ)`, { id: toastId })
          } else {
            throw new Error(`អ្នកនៅក្រៅបរិវេណសាលា (${Math.round(distance)} ម៉ែត្រ / អនុញ្ញាត ${schoolLoc.radius} ម៉ែត្រ)`)
          }
        } catch (err: unknown) {
          toast.error(getErrorMessageOr(err, "មានបញ្ហាក្នុងការចុះវត្តមាន"), { id: toastId })
        } finally {
          setIsCheckingIn(false)
        }
      }, () => {
        toast.error("មិនអាចកំណត់ទីតាំងរបស់អ្នកបានទេ។ សូមបើក Location GPS។", { id: toastId })
        setIsCheckingIn(false)
      })

    } catch (error: unknown) {
      toast.error(getErrorMessageOr(error, "មានបញ្ហាក្នុងការចុះវត្តមាន"), { id: toastId })
      setIsCheckingIn(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    // `no-print` / `print:hidden`: this bar is rendered by the (main) layout, so
    // it sits above every printable view. Without suppression it would appear on
    // each printed certificate, ID card, report and attendance sheet. `no-print`
    // matches the class the feature pages' own @media print blocks already use;
    // `print:hidden` covers pages that define no print CSS of their own.
    <header className="no-print print:hidden sticky top-0 z-50 bg-bg-surface/90 backdrop-blur-lg border-b border-divider shadow-sm relative transition-colors duration-300">
      <nav className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex justify-between items-center" aria-label="Main Navigation">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring rounded-md flex items-center gap-2">
            <div className="w-9 h-9 md:w-11 md:h-11 rounded-lg flex items-center justify-center overflow-hidden shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="kh-moul text-xl animate-gradient-text hidden sm:block">KruSmart</span>
          </Link>

          {/* Active class / subject. Renders nothing for a pre-V2 account. */}
          <div className="hidden md:block">
            <ClassContextSwitcher />
          </div>
        </div>
        
        {/* Right side buttons - Matching legacy code strictly */}
        <div className="hidden lg:flex items-center gap-4 md:gap-6 text-sm font-bold text-brand">
            
            <button 
              onClick={handleCheckIn} 
              disabled={isCheckingIn}
              className={`tap-target flex items-center gap-1.5 bg-success text-white px-4 py-2 rounded-full transition font-bold shadow-sm ${isCheckingIn ? 'opacity-70' : 'hover:opacity-90'}`}
            >
                {isCheckingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                <span>{isCheckingIn ? 'កំពុងពិនិត្យ...' : 'ចុះវត្តមាន'}</span>
            </button>

            <div className="relative group">
                <button className="tap-target flex items-center gap-2 px-3 py-1.5 bg-brand-100 dark:bg-brand-900 text-brand-800 dark:text-brand-300 rounded-full border border-divider transition-colors focus:outline-none hover:bg-brand-100/70 dark:hover:bg-brand-800" aria-haspopup="true" aria-expanded="false">
                    {photoUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture
                        <img src={photoUrl} alt="Profile" className="w-5 h-5 rounded-full object-cover border border-divider" />
                    ) : (
                        <UserCircle className="w-4 h-4" aria-hidden="true" />
                    )}
                    <span className="font-medium text-xs">គ្រូបង្រៀន</span>
                    <ChevronDown className="w-4 h-4 transition-transform duration-200" aria-hidden="true" />
                </button>
                
                <div className="absolute right-0 left-auto mt-2 w-56 rounded-xl shadow-md bg-bg-surface invisible opacity-0 group-hover:visible group-hover:opacity-100 z-50 border border-divider overflow-hidden transform origin-top-right transition-all">
                    <div className="py-1">
                        <Link href="/profile" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-body hover:bg-paper transition">
                            <User className="w-4 h-4" aria-hidden="true" /> ប្រវត្តិរូប
                        </Link>
                        <button 
                            onClick={() => {
                                if (userId) {
                                    navigator.clipboard.writeText(userId);
                                    toast.success('បានចម្លងកូដថ្នាក់ដោយជោគជ័យ!');
                                }
                            }}
                            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-body hover:bg-paper transition"
                        >
                            <Copy className="w-4 h-4" aria-hidden="true" /> <span className="copy-text">Copy កូដថ្នាក់</span>
                        </button>
                        <Link href="/print-student-codes" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-body hover:bg-paper transition">
                            <CheckSquare className="w-4 h-4" aria-hidden="true" /> កូដអាណាព្យាបាល
                        </Link>
                        <Link href="/team" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-body hover:bg-paper transition">
                            <Users className="w-4 h-4" aria-hidden="true" /> ក្រុមការងារ Krusmart
                        </Link>
                        <a href="https://www.ptec.edu.kh/" target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-body hover:bg-paper transition">
                            <ExternalLink className="w-4 h-4" aria-hidden="true" /> គេហទំព័រវិទ្យាស្ថាន
                        </a>
                    </div>
                    <div className="border-t border-divider py-1">
                        <button onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-danger hover:bg-danger/5 font-bold transition">
                            <LogOut className="w-4 h-4" aria-hidden="true" /> ចាកចេញ
                        </button>
                    </div>
                </div>
            </div>

            <button className="tap-target flex items-center gap-1.5 bg-gradient-to-r from-brand-800 to-brand-600 hover:from-brand-700 hover:to-brand-500 text-brand-contrast dark:text-white px-4 py-2 rounded-lg transition font-bold shadow-sm">
                <Crown className="w-4 h-4" aria-hidden="true" /> <span>Premium</span>
            </button>

            <ThemeToggle />
        </div>

        {/* Mobile menu trigger */}
        <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
            <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="tap-target p-2 text-brand bg-brand-100 dark:bg-brand-900 rounded-lg hover:bg-brand-100/70 dark:hover:bg-brand-800 transition"
            >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {/*
        Mobile: the switcher gets its own always-visible row rather than living
        inside the menu sheet. Which class you are editing is context, not an
        action — a teacher should never have to open a menu to check it, and it
        sits within thumb reach at the top of the content area.
      */}
      <div className="border-t border-divider px-4 py-2 md:hidden">
        <ClassContextSwitcher compact />
      </div>

      {isMobileMenuOpen && (
        <div className="lg:hidden flex-col gap-2 mt-1 pt-4 border-t border-divider text-sm font-bold text-brand bg-bg-surface absolute left-0 right-0 px-4 pb-6 shadow-lg rounded-b-xl z-50 transition-all flex">

          <button
            onClick={handleCheckIn}
            disabled={isCheckingIn}
            className={`tap-target w-full flex justify-center items-center gap-2 px-4 py-3.5 bg-success/10 text-success rounded-xl border border-success/20 mb-1 transition font-bold shadow-sm ${isCheckingIn ? 'opacity-70' : 'hover:bg-success/15'}`}
          >
              {isCheckingIn ? <Loader2 className="w-5 h-5 animate-spin" /> : <MapPin className="w-5 h-5" />}
              <span>{isCheckingIn ? 'កំពុងពិនិត្យ...' : 'ចុះវត្តមាន (Check-in)'}</span>
          </button>

          <div className="flex flex-col gap-2 mt-2">
            {navItems.map((item) => {
              const isActive = pathname.startsWith(item.path)
              return (
                <Link
                  key={item.name}
                  href={item.path}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition ${
                    isActive
                      ? "bg-brand-100 dark:bg-brand-900 text-brand-800 dark:text-brand-300 border border-divider"
                      : "text-text-body hover:bg-paper"
                  }`}
                >
                  <item.icon className="w-5 h-5" /> {item.name}
                </Link>
              )
            })}
          </div>

          <div className="border-t border-divider my-2"></div>
          
          <button onClick={handleLogout} className="tap-target flex items-center gap-3 py-3 px-3 w-full text-left text-danger hover:bg-danger/5 rounded-lg transition font-bold">
              <LogOut className="w-5 h-5" aria-hidden="true" /> <span className="text-sm">ចាកចេញ</span>
          </button>
        </div>
      )}
    </header>
  )
}
