import Link from 'next/link'
import { redirect } from 'next/navigation'
import { CheckCircle2, UserPlus, FileSpreadsheet, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { Button } from '@/components/ui/actions/Button'

export const metadata = { title: 'បន្ថែមសិស្ស | KruSmart' }

/**
 * Step 5 — the class exists; put students in it (§11).
 *
 * The three actions are weighted exactly as §11 specifies, and the third one is
 * a real exit: "The teacher should be able to enter the class even if there are
 * currently zero students." An empty class is a finished setup, not an
 * abandoned one — the dashboard has its own empty states for that.
 */
export default async function StudentsPage({
  searchParams,
}: {
  searchParams: Promise<{ class?: string }>
}) {
  const { class: classId } = await searchParams

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  // Resolve the class from the teacher's own assignments, so a forged `?class=`
  // cannot name someone else's class on this screen.
  const { data: assignment } = await supabase
    .from('teacher_assignments')
    .select('class_id, classes(name), academic_years(name)')
    .eq('teacher_id', user.id)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (!assignment) redirect('/onboarding/class')

  const rel = assignment.classes as { name?: string } | { name?: string }[] | null
  const className = (Array.isArray(rel) ? rel[0] : rel)?.name ?? ''
  const target = classId ?? (assignment.class_id as string)
  const withClass = (path: string) => `${path}${path.includes('?') ? '&' : '?'}class=${target}`

  return (
    <div className="flex flex-col items-center gap-6 text-center">
      <span className="flex h-14 w-14 items-center justify-center rounded-full bg-success/10 text-success">
        <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
      </span>

      <div className="flex flex-col gap-1.5">
        <h1 className="kh-moul text-lg text-text-heading sm:text-xl">
          ថ្នាក់ត្រូវបានបង្កើតដោយជោគជ័យ
        </h1>
        <p className="kh-moul text-2xl text-brand">{className}</p>
      </div>

      <p className="max-w-sm text-sm text-text-body">
        ឥឡូវនេះអ្នកអាចបន្ថែមសិស្សចូលក្នុងថ្នាក់ ឬចាប់ផ្តើមប្រើប្រាស់ភ្លាមៗ។
      </p>

      <div className="flex w-full max-w-sm flex-col gap-3">
        <Link href={withClass('/enrollment')} className="w-full">
          <Button
            size="lg"
            className="w-full"
            icon={<UserPlus className="h-4 w-4" aria-hidden="true" />}
          >
            បន្ថែមសិស្ស
          </Button>
        </Link>

        <Link href={withClass('/enrollment?import=1')} className="w-full">
          <Button
            size="lg"
            variant="secondary"
            className="w-full"
            icon={<FileSpreadsheet className="h-4 w-4" aria-hidden="true" />}
          >
            នាំចូលសិស្សពី Excel
          </Button>
        </Link>

        <Link
          href={withClass('/dashboard')}
          className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-bold text-text-muted transition-colors hover:text-text-heading focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          រំលងសិន
          <ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Link>
      </div>
    </div>
  )
}
