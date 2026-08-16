import { redirect } from 'next/navigation'
import { resolveAllAvailableRoles } from '@/lib/rbac/actor'
import WorkspaceChooser from '../_components/WorkspaceChooser'
import { LogOut } from 'lucide-react'
import Link from 'next/link'

export const metadata = {
  title: 'Choose Workspace | KruSmart',
}

export default async function ChooseWorkspacePage() {
  const roles = await resolveAllAvailableRoles()

  if (roles.length === 0) {
    redirect('/login')
  }

  if (roles.length === 1) {
    // If they only have one role, route them there directly
    const role = roles[0]
    if (role === 'parent') redirect('/parent/dashboard')
    if (role === 'owner' || role === 'admin') redirect('/admin')
    redirect('/dashboard')
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background dark:bg-brand-950 p-4 font-khmer">
      <div className="w-full max-w-md">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-black text-brand dark:text-brand-400 font-sans tracking-tight mb-1">
            Kru<span className="text-text-heading dark:text-white">Smart</span>
          </h1>
          <p className="text-sm font-medium text-text-muted dark:text-text-muted">
            ប្រព័ន្ធគ្រប់គ្រងសាលារៀនវៃឆ្លាត
          </p>
        </div>

        <div className="bg-white dark:bg-brand-900 rounded-3xl shadow-xl shadow-brand/5 dark:shadow-black/20 p-8 border border-divider dark:border-divider">
          <WorkspaceChooser availableRoles={roles} />
          
          <div className="mt-8 pt-6 border-t border-divider dark:border-divider text-center">
            <form action="/auth/signout" method="post">
              <button className="text-sm text-text-muted hover:text-red-500 transition-colors flex items-center justify-center w-full gap-2 font-medium">
                <LogOut className="w-4 h-4" />
                ចាកចេញពីគណនី
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  )
}
