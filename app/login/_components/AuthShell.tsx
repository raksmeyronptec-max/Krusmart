import { type ReactNode } from 'react'
import { ROLE_CONFIGS, type LoginRole } from '@/lib/auth/role-config'
import Image from 'next/image'

interface AuthShellProps {
  role?: LoginRole
  children: ReactNode
}

export default function AuthShell({ role = 'universal', children }: AuthShellProps) {
  const config = ROLE_CONFIGS[role]

  return (
    <main className="min-h-screen flex items-center justify-center p-4 bg-animate">
      <div className="w-full max-w-md md:max-w-4xl mx-auto shadow-2xl transition-all duration-500 my-8 bg-white dark:bg-brand-900 p-6 md:p-8 lg:p-10 border border-white dark:border-divider rounded-2xl md:rounded-3xl card-entrance flex flex-col md:flex-row gap-8 md:gap-12 items-center">
        
        {/* Left Side: Context / Branding */}
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center text-center order-1 mt-4 md:mt-0">
          <div className="mb-4 md:mb-6 relative z-20 flex justify-center items-center">
            {role === 'universal' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img 
                src="/logo.png" 
                alt="KruSmart Logo" 
                className="h-20 md:h-24 lg:h-28 object-contain"
              />
            ) : (
              <div className={`w-20 h-20 md:w-24 md:h-24 lg:w-28 lg:h-28 rounded-3xl shadow-lg flex items-center justify-center bg-brand-50 dark:bg-brand-950 border border-divider ${config.colorClass}`}>
                <config.Icon className="w-10 h-10 md:w-12 md:h-12 lg:w-14 lg:h-14" strokeWidth={1.5} />
              </div>
            )}
          </div>
          
          <h2 className="kh-moul text-xl md:text-2xl lg:text-3xl animate-gradient-text mb-2">
            {config.title}
          </h2>
          <p className="text-text-muted dark:text-text-muted text-sm md:text-base mt-2 mb-2 font-semibold">
            {config.subtitle}
          </p>
          <p className="text-text-muted dark:text-text-muted/80 text-xs md:text-sm mt-1 max-w-xs mx-auto leading-relaxed">
            {config.description}
          </p>
        </div>

        {/* Right Side: Form / Interactive Area */}
        <div className="w-full md:w-1/2 order-2 bg-paper dark:bg-brand-950/50 p-5 md:p-6 lg:p-8 rounded-2xl border border-divider dark:border-divider shadow-inner relative">
          {children}
        </div>
      </div>
    </main>
  )
}
