"use client"

import { usePathname } from "next/navigation"

export default function ParentLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  
  // Login page should not have bottom nav or header margins if we want a full screen login
  const isLoginPage = pathname === "/parent/login"

  return (
    <div className={`min-h-screen bg-[#1c1c1e] text-white font-kantumruy ${!isLoginPage ? 'pb-safe' : ''}`}>
      {children}
    </div>
  )
}
