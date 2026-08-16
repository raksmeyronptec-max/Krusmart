"use client"

import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import { User, LogOut, Users, CheckSquare, MapPin, Crown, ChevronDown, Copy, ExternalLink, UserCircle, Loader2 } from "lucide-react"
import { ThemeToggle } from "./ThemeToggle"
import { createClient } from "@/lib/supabase/client"
import { calculateDistanceInMeters } from "@/lib/utils/distance"
import toast from "react-hot-toast"
import { getErrorMessageOr } from '@/lib/utils/errors'
import { logger } from '@/lib/utils/logger'
import { ClassContextSwitcher } from './ClassContextSwitcher'

export function TopNav() {
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
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
    // `data-app-chrome` lets the print rule in globals.css remove the whole bar,
    // and `no-print`/`print:hidden` stay for the feature pages whose own @media
    // print blocks already key off them. This bar sits above every printable
    // view, so all three paths matter.
    <header
      data-app-chrome
      className="no-print print:hidden sticky top-0 z-40 border-b border-divider bg-bg-surface/90 shadow-sm backdrop-blur-lg"
    >
      <nav className="flex items-center justify-between gap-3 px-4 py-2.5 md:px-6" aria-label="របារឧបករណ៍">
        <div className="flex min-w-0 items-center gap-4">
          {/* The sidebar owns the mark from `lg` up; below that this is the only
              place it appears. */}
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-focus-ring lg:hidden"
          >
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- local asset; next/image adds a request for a 36px logo */}
              <img src="/logo.png" alt="KruSmart" className="h-full w-full object-cover" />
            </span>
            <span className="kh-moul animate-gradient-text hidden text-lg sm:block">KruSmart</span>
          </Link>

          {/* Active class / subject. Renders nothing for a pre-V2 account. */}
          <div className="hidden min-w-0 md:block">
            <ClassContextSwitcher />
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-1.5 md:gap-3">
          {/* Check-in is the one action a teacher takes on arrival, so it stays
              reachable at every width — icon-only on a phone, labelled above. */}
          <button
            onClick={handleCheckIn}
            disabled={isCheckingIn}
            aria-label="ចុះវត្តមាន"
            className={`tap-target flex items-center gap-1.5 rounded-full bg-success px-3 py-2 font-bold text-white shadow-sm transition md:px-4 ${
              isCheckingIn ? "opacity-70" : "hover:opacity-90"
            }`}
          >
            {isCheckingIn ? (
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            ) : (
              <MapPin className="h-4 w-4" aria-hidden="true" />
            )}
            <span className="hidden text-sm md:inline">
              {isCheckingIn ? "កំពុងពិនិត្យ..." : "ចុះវត្តមាន"}
            </span>
          </button>

          <button className="tap-target hidden items-center gap-1.5 rounded-lg bg-gradient-to-r from-brand-800 to-brand-600 px-4 py-2 font-bold text-white shadow-sm transition hover:from-brand-700 hover:to-brand-500 xl:flex">
            <Crown className="h-4 w-4" aria-hidden="true" /> <span>Premium</span>
          </button>

          <ThemeToggle />

          {/* Profile menu is now available at every width — it carries sign-out,
              and the mobile hamburger that used to hold it has been replaced by
              the bottom bar. */}
          <div className="group relative">
            <button
              className="tap-target flex items-center gap-2 rounded-full border border-divider bg-brand-100 px-2.5 py-1.5 text-brand-800 transition-colors hover:bg-brand-100/70 focus:outline-none dark:bg-brand-900 dark:text-brand-300 dark:hover:bg-brand-800"
              aria-haspopup="true"
              aria-expanded="false"
              aria-label="ម៉ឺនុយគណនី"
            >
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar; next/image adds no value and breaks PDF capture
                <img src={photoUrl} alt="" className="h-5 w-5 rounded-full border border-divider object-cover" />
              ) : (
                <UserCircle className="h-4 w-4" aria-hidden="true" />
              )}
              <span className="hidden text-xs font-medium sm:inline">គ្រូបង្រៀន</span>
              <ChevronDown className="h-4 w-4 transition-transform duration-200" aria-hidden="true" />
            </button>

            <div className="invisible absolute right-0 left-auto z-50 mt-2 w-56 origin-top-right transform overflow-hidden rounded-xl border border-divider bg-bg-surface opacity-0 shadow-md transition-all group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
              <div className="py-1">
                <Link href="/profile" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-body transition hover:bg-paper">
                  <User className="h-4 w-4" aria-hidden="true" /> ប្រវត្តិរូប
                </Link>
                <button
                  onClick={() => {
                    if (userId) {
                      navigator.clipboard.writeText(userId)
                      toast.success("បានចម្លងកូដថ្នាក់ដោយជោគជ័យ!")
                    }
                  }}
                  className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-body transition hover:bg-paper"
                >
                  <Copy className="h-4 w-4" aria-hidden="true" /> <span className="copy-text">Copy កូដថ្នាក់</span>
                </button>
                <Link href="/print-student-codes" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-body transition hover:bg-paper">
                  <CheckSquare className="h-4 w-4" aria-hidden="true" /> កូដអាណាព្យាបាល
                </Link>
                <Link href="/team" className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-body transition hover:bg-paper">
                  <Users className="h-4 w-4" aria-hidden="true" /> ក្រុមការងារ Krusmart
                </Link>
                <a
                  href="https://www.ptec.edu.kh/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex w-full items-center gap-2 px-4 py-3 text-sm text-text-body transition hover:bg-paper"
                >
                  <ExternalLink className="h-4 w-4" aria-hidden="true" /> គេហទំព័រវិទ្យាស្ថាន
                </a>
              </div>
              <div className="border-t border-divider py-1">
                <button
                  onClick={handleLogout}
                  className="flex w-full items-center gap-2 px-4 py-3 text-sm font-bold text-danger transition hover:bg-danger/5"
                >
                  <LogOut className="h-4 w-4" aria-hidden="true" /> ចាកចេញ
                </button>
              </div>
            </div>
          </div>
        </div>
      </nav>

      {/* Which class you are editing is context, not an action — a teacher
          should never open a menu to check it. */}
      <div className="border-t border-divider px-4 py-2 md:hidden">
        <ClassContextSwitcher compact />
      </div>
    </header>
  )
}
