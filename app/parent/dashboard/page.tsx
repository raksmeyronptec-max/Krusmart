"use client"

import { useState } from "react"
import { 
  CalendarCheck, 
  BarChart3, 
  BookOpenCheck, 
  HeartPulse, 
  BookUser, 
  Contact2, 
  User, 
  Users, 
  Settings, 
  LogOut,
  Bell
} from "lucide-react"

export default function ParentDashboardPage() {
  const [activeTab, setActiveTab] = useState("home") // "home" or "settings"

  const trackingFeatures = [
    { id: 'track_attendance', label: 'តាមដានវត្តមាន', icon: CalendarCheck, color: 'text-orange-400', bgColor: 'bg-orange-400/10' },
    { id: 'track_grades', label: 'តាមដានពិន្ទុ', icon: BarChart3, color: 'text-blue-400', bgColor: 'bg-blue-400/10' },
    { id: 'track_homework', label: 'តាមដានកិច្ចការផ្ទះ', icon: BookOpenCheck, color: 'text-purple-400', bgColor: 'bg-purple-400/10' },
    { id: 'track_health', label: 'តាមដានសុខភាព', icon: HeartPulse, color: 'text-rose-400', bgColor: 'bg-rose-400/10' },
    { id: 'track_library', label: 'សៀវភៅ', icon: BookUser, color: 'text-emerald-400', bgColor: 'bg-emerald-400/10' },
    { id: 'track_card', label: 'កាតសិស្ស', icon: Contact2, color: 'text-amber-400', bgColor: 'bg-amber-400/10' }
  ];

  const infoFeatures = [
    { id: 'info_profile', label: 'ប្រវត្តិរូប', icon: User, color: 'text-indigo-400', bgColor: 'bg-indigo-400/10' },
    { id: 'info_family', label: 'គ្រួសារ', icon: Users, color: 'text-pink-400', bgColor: 'bg-pink-400/10' }
  ];

  const renderHomeTab = () => (
    <div className="flex-1 overflow-y-auto pb-24 pt-safe animate-[slideIn_0.4s_ease-out]">
      {/* Header Profile Area */}
      <header className="bg-gradient-to-br from-teal-600 to-emerald-700 px-6 pt-10 pb-12 rounded-b-[2.5rem] shadow-xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-64 h-64 bg-white opacity-5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/3"></div>
        <div className="absolute bottom-0 left-0 w-40 h-40 bg-black opacity-10 rounded-full blur-2xl translate-y-1/3 -translate-x-1/4"></div>
        
        <div className="relative z-10 flex justify-between items-start mb-6">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white p-1 shadow-lg relative cursor-pointer hover:scale-105 transition">
              {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
              <img src="https://ui-avatars.com/api/?name=Student&background=0d8065&color=fff&size=100" alt="Student Profile" className="w-full h-full rounded-[0.85rem] object-cover" />
              <div className="absolute -bottom-1 -right-1 bg-green-500 border-2 border-white w-4 h-4 rounded-full"></div>
            </div>
            <div>
              <h1 className="text-xl font-bold text-white mb-0.5 kh-moul">សិស្សគំរូ</h1>
              <p className="text-emerald-100 text-sm font-medium">ថ្នាក់ទី ១០ក | ID: STU001</p>
            </div>
          </div>
          <button className="relative bg-black/20 hover:bg-black/30 p-2.5 rounded-full text-white transition outline-none">
            <Bell className="w-5 h-5" />
            <span className="absolute top-2 right-2 w-2 h-2 bg-red-500 rounded-full border border-teal-700"></span>
          </button>
        </div>
        
        <div className="relative z-10 bg-white/10 backdrop-blur-md rounded-2xl p-4 border border-white/20 shadow-inner flex items-center justify-between mt-2">
          <div>
            <p className="text-emerald-100 text-xs font-semibold mb-1 uppercase tracking-wide">សាលារៀន</p>
            <p className="text-white font-bold text-sm">សាលាបឋមសិក្សា</p>
          </div>
          <div className="h-8 w-px bg-white/20"></div>
          <div>
            <p className="text-emerald-100 text-xs font-semibold mb-1 uppercase tracking-wide">ឆ្នាំសិក្សា</p>
            <p className="text-white font-bold text-sm">២០២៥-២០២៦</p>
          </div>
        </div>
      </header>

      {/* Main Content Sections */}
      <div className="px-6 -mt-6 relative z-20 space-y-8">
        
        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-6 bg-teal-500 rounded-full"></div>
            <h2 className="text-lg font-bold text-white">មុខងារតាមដាន</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {trackingFeatures.map(feature => (
              <button key={feature.id} className="bg-[#2c2c2e] p-4 rounded-2xl flex flex-col items-center justify-center text-center border border-white/10 shadow-sm gap-3 w-full outline-none hover:-translate-y-1 transition-transform">
                <div className={`${feature.bgColor} p-3.5 rounded-2xl w-14 h-14 flex items-center justify-center`}>
                  <feature.icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <h3 className="text-gray-200 text-[13px] font-semibold leading-tight">{feature.label}</h3>
              </button>
            ))}
          </div>
        </section>

        <section>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-1.5 h-6 bg-indigo-500 rounded-full"></div>
            <h2 className="text-lg font-bold text-white">ព័ត៌មានសិស្ស</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            {infoFeatures.map(feature => (
              <button key={feature.id} className="bg-[#2c2c2e] p-4 rounded-2xl flex flex-col items-center justify-center text-center border border-white/10 shadow-sm gap-3 w-full outline-none hover:-translate-y-1 transition-transform">
                <div className={`${feature.bgColor} p-3.5 rounded-2xl w-14 h-14 flex items-center justify-center`}>
                  <feature.icon className={`w-7 h-7 ${feature.color}`} />
                </div>
                <h3 className="text-gray-200 text-[13px] font-semibold leading-tight">{feature.label}</h3>
              </button>
            ))}
          </div>
        </section>
      </div>
    </div>
  )

  const renderSettingsTab = () => (
    <div className="flex-1 overflow-y-auto pb-24 pt-safe animate-[slideIn_0.4s_ease-out] px-6">
      <header className="pt-8 pb-6">
        <h1 className="text-2xl font-bold text-white kh-moul">ការកំណត់</h1>
      </header>

      <div className="space-y-6">
        <section>
          <h2 className="text-sm font-bold text-gray-400 mb-3 ml-2 uppercase">ចំណូលចិត្ត</h2>
          <div className="bg-[#2c2c2e] rounded-2xl border border-white/10 overflow-hidden shadow-sm">
            <div className="flex items-center justify-between p-4 border-b border-white/5">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-500/20 flex items-center justify-center">
                  <span className="text-blue-400 font-bold">KM</span>
                </div>
                <span className="font-semibold text-gray-200">ភាសា</span>
              </div>
              <span className="text-sm text-gray-400">ខ្មែរ</span>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-sm font-bold text-gray-400 mb-3 ml-2 uppercase">គណនី</h2>
          <div className="bg-[#2c2c2e] rounded-2xl border border-white/10 overflow-hidden shadow-sm">
            <button 
              onClick={() => window.location.href = "/parent/login"}
              className="w-full flex items-center justify-between p-4 hover:bg-white/5 transition outline-none"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-red-500/20 flex items-center justify-center">
                  <LogOut className="w-4 h-4 text-red-400" />
                </div>
                <div className="text-left">
                  <p className="font-semibold text-red-400">ចាកចេញ</p>
                  <p className="text-xs text-gray-500 mt-0.5">ចាកចេញពីគណនីរបស់អ្នក</p>
                </div>
              </div>
            </button>
          </div>
        </section>
      </div>
    </div>
  )

  return (
    <div className="flex flex-col h-screen">
      
      {activeTab === "home" ? renderHomeTab() : renderSettingsTab()}

      {/* Bottom Navigation */}
      <nav className="fixed bottom-0 left-0 right-0 bg-[#2c2c2e]/90 backdrop-blur-xl border-t border-white/10 px-6 py-2 pb-safe z-40 flex justify-around items-center shadow-[0_-10px_40px_rgba(0,0,0,0.3)]">
        <button 
          onClick={() => setActiveTab("home")}
          className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all outline-none ${activeTab === 'home' ? 'text-teal-400' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <div className={`relative ${activeTab === 'home' ? 'transform -translate-y-1' : ''} transition-transform`}>
            <User className="w-6 h-6" />
            {activeTab === 'home' && <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-teal-400 rounded-full"></div>}
          </div>
          <span className={`text-[10px] font-semibold mt-1.5 ${activeTab === 'home' ? 'opacity-100' : 'opacity-0 h-0 mt-0'} transition-all`}>ទំព័រដើម</span>
        </button>
        
        <button 
          onClick={() => setActiveTab("settings")}
          className={`flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all outline-none ${activeTab === 'settings' ? 'text-teal-400' : 'text-gray-500 hover:text-gray-300'}`}
        >
          <div className={`relative ${activeTab === 'settings' ? 'transform -translate-y-1' : ''} transition-transform`}>
            <Settings className="w-6 h-6" />
            {activeTab === 'settings' && <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-1 h-1 bg-teal-400 rounded-full"></div>}
          </div>
          <span className={`text-[10px] font-semibold mt-1.5 ${activeTab === 'settings' ? 'opacity-100' : 'opacity-0 h-0 mt-0'} transition-all`}>ការកំណត់</span>
        </button>
      </nav>
      
    </div>
  )
}
