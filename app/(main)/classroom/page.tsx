import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ArrowUpRight, BookOpen, LayoutGrid, UserPlus, Users } from 'lucide-react'

import { createClient } from '@/lib/supabase/server'
import { PageContainer, PageHeader } from '@/components/shell/PageContainer'
import { classIdFromSearchParams, resolveServerScope } from '@/lib/utils/serverScope'
import { getCurrentAcademicYear } from '@/lib/constants/academic'

export const metadata = { title: 'ថ្នាក់ និងសិស្ស' }

/**
 * ថ្នាក់ និងសិស្ស — the front door to class, student and subject management.
 *
 * THE HUB GROUPS, IT DOES NOT RELOCATE. Three of the four cards open screens
 * that already exist at URLs that do not move: `/student-list`, `/enrollment`
 * and `/score/subjects`. Renaming those under `/classroom/` would touch the
 * dashboard, every in-page back link, the RBAC redirect targets and `proxy.ts`
 * — real breakage for no user-visible gain, and exactly what `lib/navigation.ts`
 * says about the grouping layer. Only ថ្នាក់របស់ខ្ញុំ is new.
 *
 * `/score/subjects` in particular is *linked*, never reimplemented: it is the
 * single subject-configuration screen in the product, which is why
 * `/score/template` is already a redirect to it. A second one here is how the
 * two would start disagreeing about a class's curriculum.
 *
 * Like `/print-center`, this page is a discovery layer: it resolves the class
 * for context and to carry `?class=` outward, and reads no marks, no roster and
 * no template. It is fast regardless of how large the class is.
 *
 * Lives under `app/(main)/` rather than `app/` so it inherits the shell — the
 * sidebar, the breadcrumb, the parent redirect and the onboarding redirect all
 * come from that layout, and `proxy.ts` already covers every route under it.
 * The URL is `/classroom` either way; `(main)` is a route group.
 */

interface HubCard {
  label: string
  description: string
  href: string
  icon: typeof Users
  /** Carries the resolved class forward, for the screens that scope by it. */
  scoped: boolean
  /** The one card that opens something new; the others open what already works. */
  isNew?: boolean
}

const CARDS: HubCard[] = [
  {
    label: 'ថ្នាក់របស់ខ្ញុំ',
    description: 'បង្កើត ប្តូរឈ្មោះ ជ្រើសជាថ្នាក់សកម្ម និងទុកក្នុងបណ្ណសារ',
    href: '/classroom/classes',
    icon: LayoutGrid,
    scoped: true,
    isNew: true,
  },
  {
    label: 'សិស្សក្នុងថ្នាក់',
    description: 'បញ្ជីឈ្មោះសិស្ស ព័ត៌មានលម្អិត និងការកែប្រែ',
    href: '/student-list',
    icon: Users,
    scoped: true,
  },
  {
    label: 'បញ្ចូលសិស្សថ្មី',
    description: 'ចុះឈ្មោះសិស្សថ្មីចូលក្នុងថ្នាក់',
    href: '/enrollment',
    icon: UserPlus,
    scoped: false,
  },
  {
    label: 'មុខវិជ្ជា',
    description: 'កំណត់មុខវិជ្ជាដែលថ្នាក់នេះរៀន',
    href: '/score/subjects',
    icon: BookOpen,
    scoped: true,
  },
]

export default async function ClassroomHubPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>
}) {
  const supabase = await createClient()

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const requestedClassId = await classIdFromSearchParams(searchParams)
  const scope = await resolveServerScope(user.id, requestedClassId)

  // Context only — the class's name for the header line. A legacy account with
  // no assignment resolves to no class and simply shows the year, rather than
  // being blocked out of a page that is mostly links.
  let className = ''
  if (scope.mode === 'v2') {
    const { data } = await supabase
      .from('classes')
      .select('name')
      .eq('id', scope.classId)
      .maybeSingle()
    className = data?.name ?? ''
  }

  const classId = scope.mode === 'v2' ? scope.classId : null
  const withClass = (href: string, scoped: boolean) =>
    scoped && classId
      ? `${href}${href.includes('?') ? '&' : '?'}class=${encodeURIComponent(classId)}`
      : href

  const contextLine = [
    className ? `ថ្នាក់ ${className}` : null,
    `ឆ្នាំសិក្សា ${getCurrentAcademicYear()}`,
  ].filter(Boolean).join(' · ')

  return (
    <PageContainer>
      <PageHeader
        title="ថ្នាក់ និងសិស្ស"
        description="គ្រប់គ្រងថ្នាក់ បញ្ជីសិស្ស និងមុខវិជ្ជា"
      />

      <p className="mb-4 text-sm font-bold text-text-body">{contextLine}</p>

      {/*
        A list of links, not a grid of click-handled boxes: each card *is* an
        anchor, so it opens in a new tab on a middle click, shows its target in
        the status bar, and reaches the keyboard without any of it being
        rebuilt by hand.
      */}
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {CARDS.map((card) => (
          <li key={card.href}>
            <Link
              href={withClass(card.href, card.scoped)}
              className="group flex h-full flex-col rounded-xl border border-divider bg-bg-surface p-4 shadow-sm transition hover:border-brand-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              <div className="mb-1.5 flex items-center gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-brand-100 text-brand dark:bg-brand-900/40">
                  <card.icon className="h-[18px] w-[18px]" aria-hidden="true" />
                </span>
                <h2 className="text-sm font-bold text-text-heading">{card.label}</h2>
                {card.isNew && (
                  <span className="ml-auto rounded-md bg-brand-100 px-1.5 py-0.5 text-[10px] font-bold text-brand dark:bg-brand-900/40">
                    ថ្មី
                  </span>
                )}
              </div>

              <p className="mb-3 flex-1 text-xs text-text-muted">{card.description}</p>

              <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-text-body transition group-hover:text-brand">
                បើក
                <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </PageContainer>
  )
}
