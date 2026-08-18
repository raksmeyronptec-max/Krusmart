"use client"

import Link from "next/link"
import { useTheme } from "next-themes"
import toast from "react-hot-toast"
import {
  CheckSquare,
  ChevronDown,
  Copy,
  Crown,
  ExternalLink,
  LogOut,
  Monitor,
  Moon,
  Sun,
  User,
  UserCircle,
  Users,
} from "lucide-react"
import { useMenu } from "./useMenu"

const ITEM =
  "flex w-full items-center gap-2.5 px-4 py-2.5 text-left text-sm text-text-body transition-colors hover:bg-paper focus-visible:bg-paper focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"

/** The three states `next-themes` actually has — "system" is not a hidden default. */
const THEMES = [
  { value: "light", label: "ភ្លឺ", icon: Sun },
  { value: "dark", label: "ងងឹត", icon: Moon },
  { value: "system", label: "តាមឧបករណ៍", icon: Monitor },
] as const

/**
 * Account menu — and the home of everything that was competing for a top-level
 * slot in the bar.
 *
 * Three things moved in here. The theme toggle, which had the same visual
 * weight as the account control despite being a once-a-month preference. The
 * Premium upsell, which was a filled navy button sitting beside the filled
 * green check-in action, so a monetisation prompt and the one task a teacher
 * performs every morning read as equals. And sign-out, which was already here
 * but only reachable by hovering — impossible on a phone.
 *
 * The menu opens on click and on Enter/Space/↓, closes on Escape with focus
 * returned, closes on an outside press, and closes when Tab walks out of it.
 */
export function AccountMenu({
  photoUrl,
  userId,
  onSignOut,
  onOpenPremium,
}: {
  photoUrl: string | null
  userId: string | null
  onSignOut: () => void
  /**
   * Kept as a prop so the upsell can be wired to a real destination later. The
   * button it replaced carried no handler at all, so the default below is the
   * first time this control has done anything: telling the teacher the truth
   * beats a row that swallows the tap in a menu where every other row acts.
   */
  onOpenPremium?: () => void
}) {
  const { open, toggle, close, triggerRef, menuRef } = useMenu<HTMLDivElement>()
  const { theme, setTheme } = useTheme()

  /**
   * Arrow-key roving, which `role="menu"` obliges and Tab alone does not
   * satisfy: a menu is one stop in the tab sequence, and the arrows move
   * *within* it. Home/End jump to the ends.
   */
  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const keys = ["ArrowDown", "ArrowUp", "Home", "End"]
    if (!keys.includes(event.key)) return

    const items = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [],
    )
    if (items.length === 0) return

    event.preventDefault()
    const current = items.indexOf(document.activeElement as HTMLElement)
    const next =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? items.length - 1
          : event.key === "ArrowDown"
            ? (current + 1) % items.length
            : (current - 1 + items.length) % items.length
    items[next]?.focus()
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => toggle(false)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault()
            if (!open) toggle(true)
          }
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="ម៉ឺនុយគណនី"
        className="tap-target flex items-center gap-2 rounded-full border border-divider bg-paper px-2.5 py-1.5 text-text-body transition-colors hover:bg-brand-100 hover:text-brand-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring dark:hover:bg-brand-900 dark:hover:text-brand-300"
      >
        {photoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- user-uploaded avatar; next/image adds no value and breaks PDF capture
          <img
            src={photoUrl}
            alt=""
            className="h-5 w-5 rounded-full border border-divider object-cover"
          />
        ) : (
          <UserCircle className="h-[18px] w-[18px]" aria-hidden="true" />
        )}
        <span className="hidden text-xs font-bold sm:inline">គ្រូបង្រៀន</span>
        <ChevronDown
          className={`h-4 w-4 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>

      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="ម៉ឺនុយគណនី"
          onKeyDown={onMenuKeyDown}
          className="dialog-enter absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-xl border border-divider bg-bg-surface shadow-md"
        >
          {/*
            The upsell, demoted. Same destination, same handler, a quarter of
            the emphasis: an outlined row with a gold accent rather than a
            filled navy button beside the filled green one.
          */}
          <div className="border-b border-divider p-2">
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                close(true)
                if (onOpenPremium) onOpenPremium()
                else toast("មុខងារគណនីពិសេស នឹងមកដល់ឆាប់ៗនេះ", { icon: "👑" })
              }}
              className="flex w-full items-center gap-2.5 rounded-lg border border-gold/40 bg-gold/5 px-3 py-2.5 text-left text-sm font-bold text-text-heading transition-colors hover:bg-gold/10 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring"
            >
              <Crown className="h-4 w-4 shrink-0 text-gold" aria-hidden="true" />
              <span className="kh-truncate">គណនីពិសេស</span>
            </button>
          </div>

          <div className="py-1">
            <Link href="/profile" role="menuitem" onClick={() => close()} className={ITEM}>
              <User className="h-4 w-4 shrink-0" aria-hidden="true" /> ប្រវត្តិរូប
            </Link>
            <button
              type="button"
              role="menuitem"
              onClick={async () => {
                if (!userId) return
                // `navigator.clipboard` is undefined on an insecure origin —
                // and KruSmart is used over plain HTTP on school LANs. Reading
                // the property alone threw there, so the toast never ran and
                // the teacher was told nothing at all.
                try {
                  await navigator.clipboard?.writeText(userId)
                  toast.success("បានចម្លងកូដថ្នាក់ដោយជោគជ័យ!")
                } catch {
                  toast.error("មិនអាចចម្លងកូដបានទេ។ សូមចម្លងដោយដៃពីទំព័រប្រវត្តិរូប។")
                }
                close(true)
              }}
              className={ITEM}
            >
              <Copy className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="copy-text">ចម្លងកូដថ្នាក់</span>
            </button>
            <Link
              href="/print-student-codes"
              role="menuitem"
              onClick={() => close()}
              className={ITEM}
            >
              <CheckSquare className="h-4 w-4 shrink-0" aria-hidden="true" /> កូដអាណាព្យាបាល
            </Link>
            <Link href="/team" role="menuitem" onClick={() => close()} className={ITEM}>
              <Users className="h-4 w-4 shrink-0" aria-hidden="true" /> ក្រុមការងារ KruSmart
            </Link>
            <a
              href="https://www.ptec.edu.kh/"
              target="_blank"
              rel="noopener noreferrer"
              role="menuitem"
              onClick={() => close()}
              className={ITEM}
            >
              <ExternalLink className="h-4 w-4 shrink-0" aria-hidden="true" /> គេហទំព័រវិទ្យាស្ថាន
            </a>
          </div>

          {/*
            Theme, as a three-way group rather than a top-level toggle. Reading
            it needs no hover and no guesswork: the chosen mode is the one with
            `aria-checked`, a filled background *and* a brand-coloured icon, so
            the state is never carried by colour alone.
          */}
          <div
            role="group"
            aria-label="ទម្រង់ពណ៌"
            className="border-t border-divider px-2 py-2"
          >
            <p className="px-2 pb-1.5 text-[11px] font-bold text-text-body">ទម្រង់ពណ៌</p>
            <div className="flex gap-1">
              {THEMES.map((t) => {
                const Icon = t.icon
                const on = theme === t.value
                return (
                  <button
                    key={t.value}
                    type="button"
                    role="menuitemradio"
                    aria-checked={on}
                    onClick={() => setTheme(t.value)}
                    className={`flex flex-1 flex-col items-center gap-1 rounded-lg border px-1 py-2 text-[11px] font-bold transition-colors focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring ${
                      on
                        ? "border-brand bg-brand-100 text-brand-800 dark:bg-brand-900 dark:text-brand-300"
                        : "border-transparent text-text-body hover:bg-paper"
                    }`}
                  >
                    <Icon className="h-4 w-4" aria-hidden="true" />
                    <span className="kh-truncate max-w-full">{t.label}</span>
                  </button>
                )
              })}
            </div>
          </div>

          <div className="border-t border-divider py-1">
            <button
              type="button"
              role="menuitem"
              onClick={onSignOut}
              className={`${ITEM} font-bold text-danger-text hover:bg-danger/5 focus-visible:bg-danger/5`}
            >
              <LogOut className="h-4 w-4 shrink-0" aria-hidden="true" /> ចាកចេញ
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default AccountMenu
