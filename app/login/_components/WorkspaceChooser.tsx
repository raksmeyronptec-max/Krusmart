'use client'

import { ROLE_CONFIGS, type LoginRole } from '@/lib/auth/role-config'
import Link from 'next/link'
import { ChevronRight } from 'lucide-react'

interface WorkspaceChooserProps {
  availableRoles: LoginRole[]
}

export default function WorkspaceChooser({ availableRoles }: WorkspaceChooserProps) {
  // Always include the teacher fallback if they have no other roles, but we'll let the server decide that.
  // The server passes us precisely the roles they have.

  const getTargetUrl = (role: LoginRole) => {
    switch (role) {
      case 'owner':
      case 'admin':
        return '/admin' // Assuming /admin is the dashboard for admins
      case 'parent':
        return '/parent/dashboard'
      case 'teacher':
      default:
        return '/dashboard'
    }
  }

  return (
    <div className="flex flex-col animate-in fade-in zoom-in duration-300">
      <h3 className="text-xl font-bold text-text-heading dark:text-white mb-2 kh-moul">ជ្រើសរើសទម្រង់</h3>
      <p className="text-text-muted dark:text-text-muted text-sm mb-6">
        គណនីរបស់អ្នកមានសិទ្ធិលើសពីមួយ។ សូមជ្រើសរើសទម្រង់ដែលអ្នកចង់ចូលប្រើ៖
      </p>

      <div className="space-y-3">
        {availableRoles.map(role => {
          const config = ROLE_CONFIGS[role]
          if (!config) return null
          
          return (
            <Link 
              key={role} 
              href={getTargetUrl(role)}
              className="flex items-center p-4 bg-white dark:bg-brand-900 border border-divider dark:border-divider rounded-xl hover:border-brand dark:hover:border-brand-400 hover:shadow-md transition-all group"
            >
              <div className={`w-12 h-12 rounded-full flex items-center justify-center bg-brand-50 dark:bg-brand-950 ${config.colorClass} mr-4`}>
                <config.Icon className="w-6 h-6" />
              </div>
              <div className="flex-1">
                <h4 className="font-bold text-text-heading dark:text-white kh-moul text-sm">{config.title.replace('ចូលគណនី ', '')}</h4>
                <p className="text-xs text-text-muted dark:text-text-muted/80 mt-1">{config.subtitle}</p>
              </div>
              <ChevronRight className="w-5 h-5 text-text-muted group-hover:text-brand dark:group-hover:text-brand-400 transition-colors" />
            </Link>
          )
        })}
      </div>
    </div>
  )
}
