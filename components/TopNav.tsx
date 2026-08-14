"use client"

import { useState, useEffect } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, X, Bell, User, LogOut, Home, Users, CheckSquare, BarChart2, Package, MapPin, Download, Crown, ChevronDown, Clock, Copy, ExternalLink, UserCircle, Loader2 } from "lucide-react"
import { ThemeToggle } from "./ThemeToggle"
import { createClient } from "@/lib/supabase/client"
import { calculateDistanceInMeters } from "@/lib/utils/distance"
import toast from "react-hot-toast"

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
  const supabase = createClient()

  useEffect(() => {
    const fetchProfileData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
        const { data } = await supabase.from('settings').select('photo_url').eq('teacher_id', user.id).single()
        if (data?.photo_url) {
          setPhotoUrl(data.photo_url)
        }
      }
    }
    fetchProfileData()
  }, [])

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
        } catch (err: any) {
          toast.error(err.message || "មានបញ្ហាក្នុងការចុះវត្តមាន", { id: toastId })
        } finally {
          setIsCheckingIn(false)
        }
      }, (error) => {
        toast.error("មិនអាចកំណត់ទីតាំងរបស់អ្នកបានទេ។ សូមបើក Location GPS។", { id: toastId })
        setIsCheckingIn(false)
      })

    } catch (error: any) {
      toast.error(error.message || "មានបញ្ហាក្នុងការចុះវត្តមាន", { id: toastId })
      setIsCheckingIn(false)
    }
  }

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <header className="sticky top-0 z-50 bg-white/90 dark:bg-gray-900/90 backdrop-blur-lg border-b border-gray-200 dark:border-gray-800 shadow-sm relative transition-colors duration-300">
      <nav className="max-w-7xl mx-auto px-4 md:px-8 py-3 flex justify-between items-center" aria-label="Main Navigation">
        <div className="flex items-center gap-6">
          <Link href="/dashboard" className="focus:outline-none focus-visible:ring-2 focus-visible:ring-[#0054a6] rounded-md flex items-center gap-2">
            <div className="w-9 h-9 md:w-11 md:h-11 rounded-lg flex items-center justify-center overflow-hidden shadow-sm">
              <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
            </div>
            <span className="kh-moul text-xl animate-gradient-text hidden sm:block">KruSmart</span>
          </Link>

          {/* Desktop Navigation Links (Removed based on user request) */}
        </div>
        
        {/* Right side buttons - Matching legacy code strictly */}
        <div className="hidden lg:flex items-center gap-4 md:gap-6 text-sm font-bold text-[#0054a6] dark:text-blue-300">
            
            <button 
              onClick={handleCheckIn} 
              disabled={isCheckingIn}
              className={`flex items-center gap-1.5 ${isCheckingIn ? 'bg-green-400' : 'bg-green-500 hover:bg-green-600'} text-white px-4 py-2 rounded-full transition font-bold shadow-md shadow-green-500/30`}
            >
                {isCheckingIn ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPin className="w-4 h-4" />}
                <span>{isCheckingIn ? 'កំពុងពិនិត្យ...' : 'ចុះវត្តមាន'}</span>
            </button>

            <div className="relative group">
                <button className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 dark:bg-gray-800 text-blue-800 dark:text-blue-300 rounded-full border border-blue-100 dark:border-gray-700 transition-colors focus:outline-none hover:bg-blue-100 dark:hover:bg-gray-700" aria-haspopup="true" aria-expanded="false">
                    {photoUrl ? (
                        <img src={photoUrl} alt="Profile" className="w-5 h-5 rounded-full object-cover border border-blue-200" />
                    ) : (
                        <UserCircle className="w-4 h-4" aria-hidden="true" />
                    )}
                    <span className="font-medium text-xs">គ្រូបង្រៀន</span>
                    <ChevronDown className="w-4 h-4 transition-transform duration-200" aria-hidden="true" />
                </button>
                
                <div className="absolute right-0 left-auto mt-2 w-56 rounded-xl shadow-lg bg-white dark:bg-gray-800 ring-1 ring-black ring-opacity-5 invisible opacity-0 group-hover:visible group-hover:opacity-100 z-50 border border-gray-100 dark:border-gray-700 overflow-hidden transform origin-top-right transition-all">
                    <div className="py-1">
                        <Link href="/profile" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                            <User className="w-4 h-4" aria-hidden="true" /> ប្រវត្តិរូប
                        </Link>
                        <button 
                            onClick={() => {
                                if (userId) {
                                    navigator.clipboard.writeText(userId);
                                    toast.success('បានចម្លងកូដថ្នាក់ដោយជោគជ័យ!');
                                }
                            }}
                            className="flex w-full items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition"
                        >
                            <Copy className="w-4 h-4" aria-hidden="true" /> <span className="copy-text">Copy កូដថ្នាក់</span>
                        </button>
                        <Link href="/print-student-codes" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                            <CheckSquare className="w-4 h-4" aria-hidden="true" /> កូដអាណាព្យាបាល
                        </Link>
                        <Link href="/team" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                            <Users className="w-4 h-4" aria-hidden="true" /> ក្រុមការងារ Krusmart
                        </Link>
                        <a href="https://www.ptec.edu.kh/" target="_blank" rel="noopener noreferrer" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 transition">
                            <ExternalLink className="w-4 h-4" aria-hidden="true" /> គេហទំព័រវិទ្យាស្ថាន
                        </a>
                    </div>
                    <div className="border-t border-gray-100 dark:border-gray-700 py-1">
                        <button onClick={handleLogout} className="flex w-full items-center gap-2 px-4 py-3 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 font-bold transition">
                            <LogOut className="w-4 h-4" aria-hidden="true" /> ចាកចេញ
                        </button>
                    </div>
                </div>
            </div>

            <button className="flex items-center gap-1.5 bg-gradient-to-r from-purple-500 to-indigo-600 hover:from-purple-600 hover:to-indigo-700 text-white px-4 py-2 rounded-lg transition font-bold shadow-md shadow-purple-500/30">
                <Crown className="w-4 h-4" aria-hidden="true" /> <span>Premium</span>
            </button>

            <ThemeToggle />
        </div>

        {/* Mobile menu trigger */}
        <div className="flex items-center gap-2 lg:hidden">
            <ThemeToggle />
            <button
                onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                className="p-2 text-[#0054a6] dark:text-[#4facfe] bg-blue-50 dark:bg-gray-800 rounded-lg hover:bg-blue-100 dark:hover:bg-gray-700 transition"
            >
                {isMobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
            </button>
        </div>
      </nav>

      {/* Mobile Menu */}
      {isMobileMenuOpen && (
        <div className="lg:hidden flex-col gap-2 mt-1 pt-4 border-t border-gray-100 dark:border-gray-800 text-sm font-bold text-[#0054a6] dark:text-blue-300 bg-white dark:bg-gray-900 absolute left-0 right-0 px-4 pb-6 shadow-xl rounded-b-2xl z-50 transition-all flex">
          
          <button 
            onClick={handleCheckIn}
            disabled={isCheckingIn}
            className={`w-full flex justify-center items-center gap-2 px-4 py-3.5 ${isCheckingIn ? 'bg-green-100 dark:bg-green-900/50' : 'bg-green-50 dark:bg-green-900/30 hover:bg-green-100 dark:hover:bg-green-900/50'} text-green-700 dark:text-green-400 rounded-xl border border-green-200 dark:border-green-800 mb-1 transition font-bold shadow-sm`}
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
                      ? "bg-blue-50 dark:bg-gray-800 text-blue-800 dark:text-blue-300 border border-blue-100 dark:border-gray-700"
                      : "text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-800"
                  }`}
                >
                  <item.icon className="w-5 h-5" /> {item.name}
                </Link>
              )
            })}
          </div>

          <div className="border-t border-gray-200 dark:border-gray-800 my-2"></div>
          
          <button onClick={handleLogout} className="flex items-center gap-3 py-3 px-3 w-full text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-lg transition font-bold">
              <LogOut className="w-5 h-5" aria-hidden="true" /> <span className="text-sm">ចាកចេញ</span>
          </button>
        </div>
      )}
    </header>
  )
}
