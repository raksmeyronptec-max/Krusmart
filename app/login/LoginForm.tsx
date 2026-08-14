'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { loginWithEmail, registerWithEmail, verifySignupOtp, resendOtp } from './actions'
import { createClient } from '@/lib/supabase/client'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function LoginForm() {
  const [mode, setMode] = useState<'login' | 'register' | 'verify'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const router = useRouter()

  // OTP State (8 digits)
  const [otp, setOtp] = useState(['', '', '', '', '', '', '', ''])
  const inputRefs = useRef<(HTMLInputElement | null)[]>([])
  
  const supabase = createClient()

  // Derived from `email` — no state, no effect.
  const isValidEmail = EMAIL_PATTERN.test(email)

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(e.target.value)
    setError(null)
  }

  const handlePasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(e.target.value)
    setError(null)
  }

  const handleConfirmPasswordChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setConfirmPassword(e.target.value)
    setError(null)
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidEmail) return
    if (mode === 'register' && password !== confirmPassword) {
      setError('ពាក្យសម្ងាត់ទាំងពីរមិនត្រូវគ្នាទេ!')
      return
    }
    if (password.length < 6) {
      setError('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៦ ខ្ទង់!')
      return
    }

    setIsLoading(true)
    setError(null)
    setSuccessMsg(null)

    try {
      if (mode === 'login') {
        const result = await loginWithEmail(email, password)
        if (result?.error) {
            if (result.error.toLowerCase().includes('email not confirmed')) {
                setMode('verify')
                setSuccessMsg('គណនីរបស់អ្នកមិនទាន់បានផ្ទៀងផ្ទាត់ទេ។ សូមបញ្ចូលលេខកូដដែលបានផ្ញើទៅ Email។')
            } else {
                setError(result.error)
            }
        }
      } else if (mode === 'register') {
        const result = await registerWithEmail(email, password)
        if (result?.error) setError(result.error)
        if (result?.success) {
            if (result.verified) {
                router.push('/dashboard')
            } else {
                setSuccessMsg(result.message!)
                setMode('verify') // Switch to OTP verification
            }
        }
      }
    } catch {
      setError("មានបញ្ហាបន្តិចបន្តួច សូមព្យាយាមម្ដងទៀត។")
    } finally {
      setIsLoading(false)
    }
  }

  const handleOtpChange = (index: number, value: string) => {
    if (!/^[0-9]*$/.test(value)) return

    const newOtp = [...otp]
    newOtp[index] = value
    setOtp(newOtp)

    if (value && index < 7) {
      inputRefs.current[index + 1]?.focus()
    }
  }

  const handleOtpKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus()
    }
  }

  const handleVerifyOtp = async () => {
    const token = otp.join('')
    if (token.length !== 8) {
      setError("សូមបញ្ចូលលេខកូដឲ្យបាន ៨ ខ្ទង់!")
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await verifySignupOtp(email, token)
      if (result?.error) {
        setError(result.error)
      }
    } catch {
      setError("លេខកូដមិនត្រឹមត្រូវទេ។ សូមពិនិត្យម្ដងទៀត!")
    } finally {
      setIsLoading(false)
    }
  }

  const handleResendOtp = async () => {
    setIsLoading(true)
    setError(null)
    setSuccessMsg(null)
    
    try {
      const result = await resendOtp(email)
      if (result?.error) {
          setError(result.error)
      } else {
          setSuccessMsg(result.message!)
      }
    } catch {
      setError("មិនអាចផ្ញើកូដបានទេ។ សូមព្យាយាមម្ដងទៀត។")
    } finally {
      setIsLoading(false)
    }
  }

  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback`,
      },
    })
  }

  return (
    <div className="w-full max-w-md md:max-w-4xl mx-auto shadow-2xl transition-all duration-500 my-8 bg-white dark:bg-gray-800 p-6 md:p-8 lg:p-10 border border-white dark:border-gray-700 rounded-2xl md:rounded-3xl card-entrance">
      <div className="flex flex-col md:flex-row gap-8 md:gap-12 items-center">
        
        {/* Left Side: Logo & Title */}
        <div className="w-full md:w-1/2 flex flex-col items-center justify-center text-center order-1 mt-4 md:mt-0">
          {/* eslint-disable-next-line @next/next/no-img-element -- user-uploaded/remote image on a print or avatar surface; next/image adds no value here and breaks print + PDF capture */}
          <img 
            src="/logo.png" 
            alt="KruSmart Logo" 
            className="h-20 md:h-24 lg:h-28 mx-auto mb-4 md:mb-6 relative z-20 object-contain"
          />
          <h2 className="kh-moul text-xl md:text-2xl lg:text-3xl animate-gradient-text mb-2">
            ចូលគណនីប្រព័ន្ធ
          </h2>
          <p className="text-gray-500 dark:text-gray-400 text-sm md:text-base mt-2 mb-4 md:mb-8">
            ប្រព័ន្ធជំនួយការគ្រូបង្រៀនឌីជីថល KruSmart
          </p>
        </div>

        {/* Right Side: Form */}
        <div className="w-full md:w-1/2 order-2 bg-gray-50 dark:bg-gray-900/50 p-5 md:p-6 lg:p-8 rounded-2xl border border-gray-100 dark:border-gray-700 shadow-inner relative">
          
          {mode === 'verify' ? (
              <div className="flex flex-col items-center animate-in fade-in zoom-in duration-300">
                  <div className="w-16 h-16 bg-blue-50 dark:bg-gray-700/50 rounded-full flex items-center justify-center mx-auto mb-4 text-[#0054a6] dark:text-[#4facfe] shadow-inner">
                      <ShieldCheck className="w-8 h-8" />
                  </div>
                  <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2 kh-moul">ផ្ទៀងផ្ទាត់គណនី</h3>
                  <p className="text-gray-500 dark:text-gray-400 text-sm mb-6 text-center">សូមបញ្ចូលលេខកូដ ៨ ខ្ទង់ ដែលប្រព័ន្ធបានផ្ញើទៅ<br/><b>{email}</b></p>
                  
                  {successMsg && (
                      <div className="text-green-700 text-xs md:text-sm bg-green-50 p-3 rounded-md border border-green-200 mb-4 text-center break-words font-medium">
                          {successMsg}
                      </div>
                  )}

                  <div className="flex justify-center gap-1.5 md:gap-2 mb-6 w-full px-2">
                      {otp.map((digit, index) => (
                          <input
                              key={index}
                              ref={(el) => { inputRefs.current[index] = el }}
                              type="text"
                              maxLength={1}
                              value={digit}
                              onChange={(e) => handleOtpChange(index, e.target.value)}
                              onKeyDown={(e) => handleOtpKeyDown(index, e)}
                              className="w-8 h-10 md:w-10 md:h-12 text-center text-lg md:text-xl font-bold border-2 border-gray-200 dark:border-gray-600 rounded-md focus:border-[#0054a6] focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white outline-none transition-all"
                          />
                      ))}
                  </div>

                  {error && (
                    <div className="text-red-700 text-sm bg-red-50 p-3 rounded-md border border-red-200 mb-4 text-center break-words font-medium w-full">
                      {error}
                    </div>
                  )}

                  <button 
                      onClick={handleVerifyOtp}
                      disabled={isLoading || otp.join('').length !== 8}
                      className="btn-pulse w-full bg-[#0054a6] disabled:bg-blue-300 hover:bg-blue-800 text-white font-bold py-3 rounded-xl transition shadow-md flex justify-center items-center gap-2"
                  >
                      {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'បញ្ជាក់លេខកូដ (Verify)'}
                  </button>
                  
                  <div className="flex justify-between w-full mt-5">
                      <button onClick={() => {setMode('login'); setSuccessMsg(null);}} className="text-sm text-gray-500 hover:text-[#0054a6] transition font-medium">
                          ត្រឡប់ទៅការចូលគណនី
                      </button>
                      <button onClick={handleResendOtp} disabled={isLoading} className="text-sm text-[#0054a6] dark:text-[#4facfe] hover:underline transition font-bold disabled:opacity-50">
                          ផ្ញើកូដម្ដងទៀត (Resend)
                      </button>
                  </div>
              </div>
          ) : (
            <>
              <div className="flex border-b border-gray-200 dark:border-gray-700 mb-6" role="tablist">
                  <button 
                      onClick={() => {setMode('login'); setError(null); setSuccessMsg(null);}}
                      className={`flex-1 py-3 text-sm font-medium transition ${mode === 'login' ? 'border-b-2 border-[#0054a6] text-[#0054a6] dark:border-[#4facfe] dark:text-[#4facfe]' : 'text-gray-500 hover:bg-blue-50 dark:hover:bg-gray-700'}`}
                  >
                      ចូលគណនី
                  </button>
                  <button 
                      onClick={() => {setMode('register'); setError(null); setSuccessMsg(null);}}
                      className={`flex-1 py-3 text-sm font-medium transition ${mode === 'register' ? 'border-b-2 border-[#0054a6] text-[#0054a6] dark:border-[#4facfe] dark:text-[#4facfe]' : 'text-gray-500 hover:bg-blue-50 dark:hover:bg-gray-700'}`}
                  >
                      បង្កើតថ្មី
                  </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                  <div>
                      <label htmlFor="email" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">អុីមែល (Email)</label>
                      <div className="relative">
                          <input 
                              type="email" 
                              id="email" 
                              required 
                              value={email}
                              onChange={handleEmailChange}
                              placeholder="name@school.edu.kh" 
                              className={`w-full pl-4 pr-10 py-3 border rounded-lg focus:ring-2 outline-none transition bg-white dark:bg-gray-800 dark:text-white shadow-sm ${email.length > 0 ? (isValidEmail ? 'border-green-500 focus:ring-green-500' : 'border-red-400 focus:ring-red-400') : 'border-gray-300 dark:border-gray-600 focus:ring-[#0054a6]'}`}
                          />
                          {email.length > 0 && isValidEmail && <CheckCircle className="absolute right-3 top-3.5 w-5 h-5 text-green-500" />}
                          {email.length > 0 && !isValidEmail && <XCircle className="absolute right-3 top-3.5 w-5 h-5 text-red-500" />}
                      </div>
                  </div>

                  <div>
                      <label htmlFor="password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">ពាក្យសម្ងាត់ (Password)</label>
                      <div className="relative">
                          <input 
                              type={showPassword ? 'text' : 'password'} 
                              id="password" 
                              required 
                              value={password}
                              onChange={handlePasswordChange}
                              placeholder="••••••••" 
                              minLength={6}
                              className="w-full pl-4 pr-24 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#0054a6] outline-none transition bg-white dark:bg-gray-800 dark:text-white shadow-sm"
                          />
                          <button 
                              type="button" 
                              onClick={() => setShowPassword(!showPassword)}
                              className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-[#0054a6] dark:hover:text-[#4facfe] transition z-10 text-sm font-medium"
                          >
                              {showPassword ? (
                                <span className="flex items-center gap-1.5"><EyeOff className="w-4 h-4" /> លាក់</span>
                              ) : (
                                <span className="flex items-center gap-1.5"><Eye className="w-4 h-4" /> បង្ហាញ</span>
                              )}
                          </button>
                      </div>
                  </div>

                  {mode === 'register' && (
                      <div>
                        <label htmlFor="confirm-password" className="block text-sm font-semibold text-gray-700 dark:text-gray-300 mb-1">ផ្ទៀងផ្ទាត់ពាក្យសម្ងាត់ (Confirm)</label>
                        <div className="relative">
                            <input 
                                type={showConfirmPassword ? 'text' : 'password'} 
                                id="confirm-password" 
                                required 
                                value={confirmPassword}
                                onChange={handleConfirmPasswordChange}
                                placeholder="••••••••" 
                                minLength={6}
                                className="w-full pl-4 pr-24 py-3 border border-gray-300 dark:border-gray-600 rounded-lg focus:ring-2 focus:ring-[#0054a6] outline-none transition bg-white dark:bg-gray-800 dark:text-white shadow-sm"
                            />
                            <button 
                                type="button" 
                                onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                                className="absolute inset-y-0 right-0 px-3 flex items-center text-gray-500 hover:text-[#0054a6] dark:hover:text-[#4facfe] transition z-10 text-sm font-medium"
                            >
                                {showConfirmPassword ? (
                                  <span className="flex items-center gap-1.5"><EyeOff className="w-4 h-4" /> លាក់</span>
                                ) : (
                                  <span className="flex items-center gap-1.5"><Eye className="w-4 h-4" /> បង្ហាញ</span>
                                )}
                            </button>
                        </div>
                      </div>
                  )}

                  {mode === 'register' && (
                      <div className="mt-4 flex items-start bg-blue-50 dark:bg-gray-800 p-3 rounded-lg border border-blue-100 dark:border-gray-700">
                          <div className="flex items-center h-5 mt-0.5">
                              <input id="terms" type="checkbox" required className="w-4 h-4 border border-gray-300 dark:border-gray-600 rounded" />
                          </div>
                          <label htmlFor="terms" className="ml-2 text-xs md:text-sm text-gray-700 dark:text-gray-300 cursor-pointer">
                              ខ្ញុំយល់ព្រមតាម <a href="#" className="text-[#0054a6] dark:text-[#4facfe] hover:underline font-bold">លក្ខខណ្ឌនៃការប្រើប្រាស់</a>។
                          </label>
                      </div>
                  )}

                  {mode === 'login' && (
                      <div className="flex justify-end pt-1">
                          <button type="button" className="text-sm font-medium text-[#0054a6] dark:text-[#4facfe] hover:underline">ភ្លេចលេខសម្ងាត់?</button>
                      </div>
                  )}

                  <button 
                      type="submit" 
                      disabled={isLoading || !isValidEmail || password.length < 6}
                      className="btn-pulse w-full bg-[#0054a6] hover:bg-blue-800 disabled:bg-blue-300 text-white font-bold py-3.5 rounded-lg transition shadow-md flex justify-center items-center mt-4"
                  >
                      <span>{mode === 'login' ? 'ចូលប្រព័ន្ធ (Login)' : 'ចុះឈ្មោះថ្មី'}</span>
                      {isLoading && <Loader2 className="animate-spin ml-2 w-5 h-5" />}
                  </button>
              </form>

              <div className="flex items-center my-6">
                  <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
                  <span className="flex-shrink-0 mx-4 text-gray-500 text-xs md:text-sm">ឬ (Or)</span>
                  <div className="flex-grow border-t border-gray-300 dark:border-gray-600"></div>
              </div>

              <button 
                  onClick={handleGoogleLogin}
                  type="button" 
                  className="w-full bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 font-semibold py-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition shadow-sm flex justify-center items-center gap-2"
              >
                  <svg className="w-5 h-5" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                  </svg>
                  ចូលគណនីតាម Google
              </button>

              {error && (
                  <div className="text-red-700 text-xs md:text-sm bg-red-50 p-3 rounded-md border border-red-200 mt-4 text-center break-words font-medium">
                      {error}
                  </div>
              )}
              
              {successMsg && (
                  <div className="text-green-700 text-xs md:text-sm bg-green-50 p-3 rounded-md border border-green-200 mt-4 text-center break-words font-medium">
                      {successMsg}
                  </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
