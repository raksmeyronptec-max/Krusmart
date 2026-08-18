'use client'

import { useState, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle, XCircle, Loader2, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react'
import { loginWithEmail, registerWithEmail, verifySignupOtp, resendOtp } from '../actions'
import { createClient } from '@/lib/supabase/client'
import { type LoginRole } from '@/lib/auth/role-config'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface LoginFormProps {
  role?: LoginRole
  hideRegister?: boolean
}

export default function LoginForm({ role = 'universal', hideRegister = false }: LoginFormProps) {
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
        const result = await loginWithEmail(email, password, role)
        if (result?.error) {
            if (result.error.toLowerCase().includes('email not confirmed')) {
                setMode('verify')
                setSuccessMsg('គណនីរបស់អ្នកមិនទាន់បានផ្ទៀងផ្ទាត់ទេ។ សូមបញ្ចូលលេខកូដដែលបានផ្ញើទៅ Email។')
            } else {
                setError(result.error)
            }
        }
      } else if (mode === 'register') {
        const result = await registerWithEmail(email, password, role)
        if (result?.error) setError(result.error)
        if (result?.success) {
            if (result.verified) {
                router.push('/dashboard')
            } else {
                setSuccessMsg(result.message!)
                setMode('verify')
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
      const result = await verifySignupOtp(email, token, role)
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
    // preserve target role in query params so callback can use it
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/auth/callback?role=${role}`,
      },
    })
  }

  if (mode === 'verify') {
    return (
      <div className="flex flex-col items-center dialog-enter">
        <div className="w-16 h-16 bg-brand-100 dark:bg-brand-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-brand dark:text-brand-400 shadow-inner">
            <ShieldCheck className="w-8 h-8" />
        </div>
        <h3 className="text-xl font-bold text-text-heading dark:text-white mb-2 kh-moul">ផ្ទៀងផ្ទាត់គណនី</h3>
        <p className="text-text-muted dark:text-text-muted text-sm mb-6 text-center">សូមបញ្ចូលលេខកូដ ៨ ខ្ទង់ ដែលប្រព័ន្ធបានផ្ញើទៅ<br/><b>{email}</b></p>
        
        {successMsg && (
            <div role="status" className="text-success text-xs md:text-sm bg-success/10 p-3 rounded-md border border-success/30 mb-4 text-center break-words font-medium">
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
                    className="w-8 h-10 md:w-10 md:h-12 text-center text-lg md:text-xl font-bold border-2 border-divider dark:border-divider rounded-md focus:border-brand focus:ring-2 focus:ring-focus-ring/30 dark:bg-brand-800 dark:text-white outline-none transition-all"
                />
            ))}
        </div>

        {error && (
          <div role="alert" className="flex items-center gap-2 text-danger text-sm bg-danger/10 p-3 rounded-md border border-danger/30 mb-4 break-words font-medium w-full">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{error}</span>
          </div>
        )}

        <button 
            onClick={handleVerifyOtp}
            disabled={isLoading || otp.join('').length !== 8}
            className="btn-pulse w-full bg-brand disabled:opacity-50 hover:bg-brand-800 text-white font-bold py-3 rounded-xl transition shadow-md flex justify-center items-center gap-2"
        >
            {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'បញ្ជាក់លេខកូដ (Verify)'}
        </button>
        
        <div className="flex justify-between w-full mt-5">
            <button onClick={() => {setMode('login'); setSuccessMsg(null);}} className="text-sm text-text-muted hover:text-brand transition font-medium">
                ត្រឡប់ទៅការចូលគណនី
            </button>
            <button onClick={handleResendOtp} disabled={isLoading} className="text-sm text-brand dark:text-brand-400 hover:underline transition font-bold disabled:opacity-50">
                ផ្ញើកូដម្ដងទៀត (Resend)
            </button>
        </div>
      </div>
    )
  }

  return (
    <>
      {!hideRegister && (
        <div className="flex border-b border-divider dark:border-divider mb-6" role="tablist">
            <button 
                onClick={() => {setMode('login'); setError(null); setSuccessMsg(null);}}
                className={`flex-1 py-3 text-sm font-medium transition ${mode === 'login' ? 'border-b-2 border-brand text-brand dark:border-brand-400 dark:text-brand-400' : 'text-text-muted hover:bg-brand-100 dark:hover:bg-paper'}`}
            >
                ចូលគណនី
            </button>
            <button 
                onClick={() => {setMode('register'); setError(null); setSuccessMsg(null);}}
                className={`flex-1 py-3 text-sm font-medium transition ${mode === 'register' ? 'border-b-2 border-brand text-brand dark:border-brand-400 dark:text-brand-400' : 'text-text-muted hover:bg-brand-100 dark:hover:bg-paper'}`}
            >
                បង្កើតថ្មី
            </button>
        </div>
      )}

      {/* The level-first journey: a brand-new teacher picks their education
          level before creating an account, so the onboarding wizard can shape
          itself around it. Shown only in register mode — an existing account
          already carries its level in the database. */}
      {!hideRegister && mode === 'register' && (
        <p className="mb-4 rounded-lg bg-brand-100 px-3 py-2.5 text-xs text-brand-800 dark:bg-brand-900/40 dark:text-brand-300">
          គ្រូថ្មី? ជ្រើសរើសកម្រិតសិក្សារបស់អ្នកជាមុនសិន —{' '}
          <a href="/choose-level" className="font-bold underline">
            ចាប់ផ្តើមទីនេះ
          </a>
        </p>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
          <div>
              <label htmlFor="email" className="block text-sm font-semibold text-text-body dark:text-text-body mb-1">អុីមែល (Email)</label>
              <div className="relative">
                  <input 
                      type="email" 
                      id="email" 
                      required 
                      value={email}
                      onChange={handleEmailChange}
                      placeholder="name@school.edu.kh" 
                      className={`w-full pl-4 pr-10 py-3 border rounded-lg focus:ring-2 outline-none transition bg-white dark:bg-brand-900 dark:text-white shadow-sm ${email.length > 0 ? (isValidEmail ? 'border-success focus:ring-success' : 'border-danger focus:ring-danger') : 'border-divider dark:border-divider focus:ring-focus-ring'}`}
                  />
                  {email.length > 0 && isValidEmail && <CheckCircle className="absolute right-3 top-3.5 w-5 h-5 text-success" />}
                  {email.length > 0 && !isValidEmail && <XCircle className="absolute right-3 top-3.5 w-5 h-5 text-danger" />}
              </div>
          </div>

          <div>
              <label htmlFor="password" className="block text-sm font-semibold text-text-body dark:text-text-body mb-1">ពាក្យសម្ងាត់ (Password)</label>
              <div className="relative">
                  <input 
                      type={showPassword ? 'text' : 'password'} 
                      id="password" 
                      required 
                      value={password}
                      onChange={handlePasswordChange}
                      placeholder="••••••••" 
                      minLength={6}
                      className="w-full pl-4 pr-24 py-3 border border-divider dark:border-divider rounded-lg focus:ring-2 focus:ring-focus-ring outline-none transition bg-white dark:bg-brand-900 dark:text-white shadow-sm"
                  />
                  <button 
                      type="button" 
                      onClick={() => setShowPassword(!showPassword)}
                      aria-label={showPassword ? "លាក់ពាក្យសម្ងាត់" : "បង្ហាញពាក្យសម្ងាត់"}
                      className="absolute inset-y-0 right-0 px-3 flex items-center text-text-muted hover:text-brand dark:hover:text-brand-400 transition z-10 text-sm font-medium"
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
                <label htmlFor="confirm-password" className="block text-sm font-semibold text-text-body dark:text-text-body mb-1">ផ្ទៀងផ្ទាត់ពាក្យសម្ងាត់ (Confirm)</label>
                <div className="relative">
                    <input 
                        type={showConfirmPassword ? 'text' : 'password'} 
                        id="confirm-password" 
                        required 
                        value={confirmPassword}
                        onChange={handleConfirmPasswordChange}
                        placeholder="••••••••" 
                        minLength={6}
                        className="w-full pl-4 pr-24 py-3 border border-divider dark:border-divider rounded-lg focus:ring-2 focus:ring-focus-ring outline-none transition bg-white dark:bg-brand-900 dark:text-white shadow-sm"
                    />
                    <button 
                        type="button" 
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                        aria-label={showConfirmPassword ? "លាក់ពាក្យសម្ងាត់" : "បង្ហាញពាក្យសម្ងាត់"}
                        className="absolute inset-y-0 right-0 px-3 flex items-center text-text-muted hover:text-brand dark:hover:text-brand-400 transition z-10 text-sm font-medium"
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
              <div className="mt-4 flex items-start bg-brand-100 dark:bg-brand-900 p-3 rounded-lg border border-divider dark:border-divider">
                  <div className="flex items-center h-5 mt-0.5">
                      <input id="terms" type="checkbox" required className="w-4 h-4 border border-divider dark:border-divider rounded" />
                  </div>
                  <label htmlFor="terms" className="ml-2 text-xs md:text-sm text-text-body dark:text-text-body cursor-pointer">
                      ខ្ញុំយល់ព្រមតាម <a href="#" className="text-brand dark:text-brand-400 hover:underline font-bold">លក្ខខណ្ឌនៃការប្រើប្រាស់</a>។
                  </label>
              </div>
          )}

          {mode === 'login' && (
              <div className="flex justify-end pt-1">
                  <button type="button" onClick={() => router.push('/login/reset-password')} className="text-sm font-medium text-brand dark:text-brand-400 hover:underline">ភ្លេចលេខសម្ងាត់?</button>
              </div>
          )}

          <button 
              type="submit" 
              disabled={isLoading || !isValidEmail || password.length < 6}
              className="btn-pulse w-full bg-brand hover:bg-brand-800 disabled:opacity-50 text-white font-bold py-3.5 rounded-lg transition shadow-md flex justify-center items-center mt-4"
          >
              <span>{mode === 'login' ? 'ចូលប្រព័ន្ធ (Login)' : 'ចុះឈ្មោះថ្មី'}</span>
              {isLoading && <Loader2 className="animate-spin ml-2 w-5 h-5" />}
          </button>
      </form>

      <div className="flex items-center my-6">
          <div className="flex-grow border-t border-divider dark:border-divider"></div>
          <span className="flex-shrink-0 mx-4 text-text-muted text-xs md:text-sm">ឬ (Or)</span>
          <div className="flex-grow border-t border-divider dark:border-divider"></div>
      </div>

      <button 
          onClick={handleGoogleLogin}
          type="button" 
          className="w-full bg-white dark:bg-brand-900 border border-divider dark:border-divider text-text-body dark:text-text-body font-semibold py-3 rounded-lg hover:bg-paper dark:hover:bg-paper transition shadow-sm flex justify-center items-center gap-2"
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
          <div role="alert" className="flex items-center gap-2 text-danger text-xs md:text-sm bg-danger/10 p-3 rounded-md border border-danger/30 mt-4 break-words font-medium">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{error}</span>
          </div>
      )}
      
      {successMsg && (
          <div role="status" className="text-success text-xs md:text-sm bg-success/10 p-3 rounded-md border border-success/30 mt-4 text-center break-words font-medium">
              {successMsg}
          </div>
      )}
    </>
  )
}
