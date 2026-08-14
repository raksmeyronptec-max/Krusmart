"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { QrCode, LogIn, Loader2 } from "lucide-react"

export default function ParentLoginPage() {
  const [classCode, setClassCode] = useState("")
  const [studentId, setStudentId] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const router = useRouter()

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    // Dummy authentication for now (wait 1 second then redirect)
    setTimeout(() => {
      setIsLoading(false)
      router.push("/parent/dashboard")
    }, 1000)
  }

  return (
    <div className="relative min-h-screen flex flex-col justify-center px-4 overflow-hidden bg-cover bg-center" style={{ backgroundImage: "url('https://images.unsplash.com/photo-1577896851231-70ef18881754?q=80&w=1080&auto=format&fit=crop')" }}>
      {/* Dark overlay */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-0"></div>
      
      <div className="w-full max-w-sm mx-auto relative z-10 animate-[slideUpScale_0.6s_ease_forwards]">
        
        {/* Header Section */}
        <div className="text-center mb-10">
          <div className="w-20 h-20 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-3xl mx-auto flex items-center justify-center shadow-xl shadow-emerald-900/50 mb-5 border border-emerald-300/30">
            <span className="text-4xl text-white font-bold kh-moul mt-2">K</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-2 tracking-tight kh-moul">KruSmart</h1>
          <p className="text-emerald-300 text-sm font-medium">សម្រាប់អាណាព្យាបាលសិស្ស</p>
        </div>

        {/* Login Card */}
        <form onSubmit={handleLogin} className="bg-[#2c2c2e]/80 backdrop-blur-xl rounded-[2rem] border border-white/10 shadow-2xl p-6 sm:p-8">
          <div className="space-y-5">
            <div>
              <label className="block text-gray-300 text-sm font-bold mb-2">លេខកូដថ្នាក់រៀន</label>
              <input 
                type="text"
                value={classCode}
                onChange={(e) => setClassCode(e.target.value)}
                required
                className="w-full bg-black/30 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition font-bold"
                placeholder="ឧទាហរណ៍៖ KS9lut..."
              />
              <p className="text-xs text-gray-500 mt-2 ml-1">សួរគ្រូរបស់អ្នកសម្រាប់លេខកូដនេះ</p>
            </div>

            <div>
              <label className="block text-gray-300 text-sm font-bold mb-2">អត្តលេខសិស្ស</label>
              <input 
                type="text"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                required
                className="w-full bg-black/30 border border-white/10 rounded-2xl px-5 py-4 text-white placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 transition font-bold"
                placeholder="ឧទាហរណ៍៖ STU001"
              />
              <p className="text-xs text-gray-500 mt-2 ml-1">អត្តលេខសម្គាល់កូនរបស់អ្នក</p>
            </div>
            
            <button 
              type="submit"
              disabled={isLoading}
              className="w-full bg-emerald-500 hover:bg-emerald-600 active:scale-95 text-white font-bold rounded-2xl px-4 py-4 transition flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/30"
            >
              {isLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <LogIn className="w-5 h-5" />
              )}
              {isLoading ? 'កំពុងចូល...' : 'ចូលប្រើប្រាស់'}
            </button>
          </div>

          <div className="mt-8 pt-6 border-t border-white/10">
            <button 
              type="button"
              className="w-full bg-white/5 hover:bg-white/10 text-white border border-white/10 font-bold rounded-2xl px-4 py-3.5 transition flex items-center justify-center gap-2"
            >
              <QrCode className="w-5 h-5 text-emerald-400" /> ស្កេន QR
            </button>
            <p className="text-center text-xs text-gray-500 mt-4">
              ស្កេន QR Code ពីសាលាដើម្បីចូលដោយស្វ័យប្រវត្តិ។
            </p>
          </div>
        </form>

      </div>
    </div>
  )
}
