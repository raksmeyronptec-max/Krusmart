"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { 
  GraduationCap, 
  LayoutDashboard, 
  Users, 
  MapPin, 
  BookOpenCheck, 
  FileBarChart, 
  BellRing, 
  LogOut,
  Menu,
  X
} from "lucide-react"
import { createClient } from "@/lib/supabase/client"

const adminNavItems = [
  { name: "ផ្ទាំងទិន្នន័យរួម", path: "/admin/dashboard", icon: LayoutDashboard },
  { name: "គ្រប់គ្រងគ្រូបង្រៀន", path: "/admin/teachers", icon: Users },
  { name: "វត្តមានគ្រូ", path: "/admin/teacher-attendance", icon: MapPin },
  { name: "គ្រប់គ្រងថ្នាក់រៀន", path: "/admin/classes", icon: BookOpenCheck },
  { name: "ប្រវត្តិចុះឈ្មោះ", path: "/admin/enrollments", icon: GraduationCap },
  { name: "មុខវិជ្ជា", path: "/admin/subjects", icon: BookOpenCheck },
  { name: "និទ្ទេស និងវាយតម្លៃ", path: "/admin/grading", icon: FileBarChart },
  { name: "ឆ្នាំសិក្សា", path: "/admin/academic-years", icon: FileBarChart },
  { name: "កំណត់ហេតុសវនកម្ម", path: "/admin/audit-logs", icon: BellRing },
  { name: "ការកំណត់សាលា", path: "/admin/settings", icon: GraduationCap },
]

export default function AdminShell({
  children,
}: {
  children: React.ReactNode
}) {
  const pathname = usePathname()
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false)
  const supabase = createClient()

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = "/login"
  }

  return (
    <div className="flex h-screen overflow-hidden w-full bg-slate-50 text-[#1e293b] font-kantumruy">
      
      {/* Mobile Sidebar Overlay */}
      {isMobileSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setIsMobileSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed md:relative z-50 w-[260px] h-full flex-col bg-white border border-[#e2e8f0] shadow-sm 
        md:m-4 md:rounded-2xl transition-transform duration-300 ease-in-out flex
        ${isMobileSidebarOpen ? "translate-x-0" : "-translate-x-full md:translate-x-0"}
      `}>
        <div className="p-6 flex items-center gap-3 border-b border-gray-100">
          <div className="bg-blue-600 p-2 rounded-lg text-white">
            <GraduationCap className="w-6 h-6" />
          </div>
          <div>
            <h1 className="kh-moul text-lg text-blue-900 leading-tight">PTEC Admin</h1>
            <p className="text-xs text-gray-500 mt-0.5 font-bold">ប្រព័ន្ធគ្រប់គ្រងសាលា</p>
          </div>
          <button 
            className="md:hidden ml-auto text-gray-500 hover:text-gray-700"
            onClick={() => setIsMobileSidebarOpen(false)}
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        <nav className="flex-1 p-4 overflow-y-auto">
          {adminNavItems.map((item) => {
            const isActive = pathname === item.path || pathname.startsWith(item.path + "/")
            return (
              <Link
                key={item.name}
                href={item.path}
                onClick={() => setIsMobileSidebarOpen(false)}
                className={`
                  flex items-center px-4 py-3 mb-2 rounded-xl transition-all duration-200 font-bold
                  ${isActive 
                    ? "bg-[#f1f5f9] text-[#1e3a8a]" 
                    : "text-[#64748b] hover:bg-[#f1f5f9] hover:text-[#1e3a8a]"
                  }
                `}
              >
                <item.icon className="w-5 h-5 mr-3" />
                {item.name}
              </Link>
            )
          })}
        </nav>

        <div className="p-4 border-t border-gray-100">
          <button 
            onClick={handleLogout}
            className="flex items-center w-full p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors text-sm font-bold"
          >
            <LogOut className="w-5 h-5 mr-3" /> ចាកចេញ
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col h-screen overflow-hidden z-10 p-4 md:pl-0">
        <div className="md:hidden flex items-center justify-between mb-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
          <div className="flex items-center gap-2">
            <div className="bg-blue-600 p-1.5 rounded-md text-white">
              <GraduationCap className="w-5 h-5" />
            </div>
            <span className="kh-moul text-blue-900">PTEC Admin</span>
          </div>
          <button onClick={() => setIsMobileSidebarOpen(true)} className="text-gray-600">
            <Menu className="w-6 h-6" />
          </button>
        </div>

        <div className="bg-white border border-[#e2e8f0] shadow-sm rounded-2xl flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-6 relative">
          {children}
        </div>
      </main>
    </div>
  )
}
