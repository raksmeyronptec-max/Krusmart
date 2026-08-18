"use client"

import { useMemo, useState, useEffect } from "react"
import Link from "next/link"
import { MapPin, Loader2, Search } from "lucide-react"
import { createClient } from "@/lib/supabase/client"
import { calculateDistanceInMeters } from "@/lib/utils/distance"
import toast from "react-hot-toast"
import { getErrorMessageOr } from "@/lib/utils/errors"
import { logger } from "@/lib/utils/logger"
import { ClassContextSwitcher } from "./ClassContextSwitcher"
import { AccountMenu } from "./shell/AccountMenu"
import { CommandPalette, useCommandPalette } from "./shell/CommandPalette"
import { sectionsForRoles } from "@/lib/navigation"
import type { RoleName } from "@/lib/types"

/**
 * The application bar.
 *
 * One band, one height (`h-14`), aligned to the sidebar's header so the two
 * read as a single strip rather than two panels that happen to be adjacent.
 * Three zones, and the split between them is the point:
 *
 *   left    identity and *context* — which class you are editing. Never an
 *           action; a teacher should not open a menu to check where they are.
 *   centre  search. ~30 destinations exist; the middle of the bar used to be
 *           empty while finding any of them took two or three steps.
 *   right   exactly one filled action — ចុះវត្តមាន, the thing done on arrival —
 *           then the account menu. The Premium upsell and the theme toggle both
 *           used to sit here at full weight; both now live inside the menu.
 *
 * `sticky` needs no compensating offset: the bar is in normal flow inside the
 * shell's flex column, so the content region begins below it and stays there.
 */
export function TopNav({ roles }: { roles?: RoleName[] }) {
  const [isCheckingIn, setIsCheckingIn] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const [userId, setUserId] = useState<string | null>(null)
  // Memoised so effects can list it as a dependency without re-running.
  const supabase = useMemo(() => createClient(), [])
  const palette = useCommandPalette()
  const sections = useMemo(() => sectionsForRoles(roles), [roles])

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

  const openPalette = () => palette.setOpen(true)

  return (
    // `data-app-chrome` lets the print rule in globals.css remove the whole bar,
    // and `no-print`/`print:hidden` stay for the feature pages whose own @media
    // print blocks already key off them. This bar sits above every printable
    // view, so all three paths matter.
    <header
      data-app-chrome
      className="no-print sticky top-0 z-40 border-b border-divider bg-bg-surface/90 backdrop-blur-lg print:hidden"
    >
      <nav className="flex h-14 items-center gap-2 px-3 md:gap-4 md:px-5" aria-label="របារឧបករណ៍">
        <div className="flex min-w-0 shrink items-center gap-3">
          {/* The sidebar owns the mark from `lg` up; below that this is the only
              place it appears. */}
          <Link
            href="/dashboard"
            className="flex shrink-0 items-center gap-2 rounded-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring lg:hidden"
          >
            <span className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-lg shadow-sm">
              {/* eslint-disable-next-line @next/next/no-img-element -- local asset; next/image adds a request for a 36px logo */}
              <img src="/logo.png" alt="KruSmart" className="h-full w-full object-cover" />
            </span>
          </Link>

          {/* Active class / subject. Renders nothing for a pre-V2 account. */}
          <div className="hidden min-w-0 md:block">
            <ClassContextSwitcher />
          </div>
        </div>

        {/*
          Search takes the space the bar was wasting. A button rather than a
          real input: focusing an input that immediately hands off to a modal
          leaves the caret in a field the user can no longer see. This looks
          like the field it opens, announces the shortcut, and is one control
          instead of two competing for focus.
        */}
        <button
          type="button"
          onClick={openPalette}
          aria-haspopup="dialog"
          aria-keyshortcuts="Meta+K Control+K"
          className="mx-auto hidden h-9 w-full max-w-sm items-center gap-2 rounded-lg border border-divider bg-paper px-3 text-left text-sm text-text-body transition-colors hover:border-brand/60 hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring lg:flex"
        >
          <Search className="h-4 w-4 shrink-0" aria-hidden="true" />
          <span className="kh-truncate flex-1">ស្វែងរកមុខងារ...</span>
          <kbd className="hidden shrink-0 rounded border border-divider bg-bg-surface px-1.5 py-0.5 font-sans text-[11px] font-bold text-text-body xl:inline">
            ⌘K
          </kbd>
        </button>

        <div className="ml-auto flex shrink-0 items-center gap-1.5 md:gap-2.5">
          <button
            type="button"
            onClick={openPalette}
            aria-haspopup="dialog"
            aria-label="ស្វែងរកមុខងារ"
            className="tap-target flex items-center justify-center rounded-lg text-text-body transition-colors hover:bg-paper hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring lg:hidden"
          >
            <Search className="h-5 w-5" aria-hidden="true" />
          </button>

          {/*
            The one filled action in the bar. `success-solid` rather than
            `success`: the status green measures 3.24:1 under white text, which
            fails SC 1.4.3 for the single most-used control in the app.
          */}
          <button
            onClick={handleCheckIn}
            disabled={isCheckingIn}
            aria-label="ចុះវត្តមាន"
            className={`tap-target flex items-center gap-1.5 rounded-lg bg-success-solid px-3 font-bold text-success-on-solid shadow-sm transition md:px-4 ${
              isCheckingIn ? "opacity-70" : "hover:opacity-90"
            } focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring`}
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

          <AccountMenu photoUrl={photoUrl} userId={userId} onSignOut={handleLogout} />
        </div>
      </nav>

      {/* Which class you are editing is context, not an action — a teacher
          should never open a menu to check it. Below `md` the bar has no room
          for it beside the controls, so it gets its own strip. The frame is
          passed *into* the switcher so a pre-V2 account, for which it renders
          nothing, does not get an empty bordered strip under the bar. */}
      <ClassContextSwitcher
        compact
        frameClassName="border-t border-divider px-3 py-1.5 md:hidden"
      />

      <CommandPalette
        open={palette.open}
        onClose={() => palette.setOpen(false)}
        sections={sections}
      />
    </header>
  )
}
