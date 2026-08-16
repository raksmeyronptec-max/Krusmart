'use client'

import { useState } from 'react'
import { Loader2, Eye, EyeOff, ShieldCheck } from 'lucide-react'
import { updatePassword } from '../actions'

export default function UpdatePasswordPage() {
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    
    if (password !== confirmPassword) {
      setError('ពាក្យសម្ងាត់ទាំងពីរមិនត្រូវគ្នាទេ!')
      return
    }
    
    if (password.length < 6) {
      setError('ពាក្យសម្ងាត់ត្រូវមានយ៉ាងហោចណាស់ ៦ ខ្ទង់!')
      return
    }

    setIsLoading(true)
    setError(null)

    try {
      const result = await updatePassword(password)
      // If result is returned with error, display it. Otherwise it redirects on success.
      if (result?.error) {
        setError(result.error)
      }
    } catch {
      setError("មានបញ្ហាបន្តិចបន្តួច សូមព្យាយាមម្ដងទៀត។")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background dark:bg-brand-950 p-4 font-khmer">
      <div className="w-full max-w-md bg-white dark:bg-brand-900 rounded-3xl shadow-xl shadow-brand/5 dark:shadow-black/20 p-8 border border-divider dark:border-divider">
        
        <div className="text-center mb-8">
            <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mx-auto mb-4 text-success shadow-inner">
                <ShieldCheck className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-text-heading dark:text-white mb-2 kh-moul">កំណត់ពាក្យសម្ងាត់ថ្មី</h1>
            <p className="text-sm font-medium text-text-muted dark:text-text-muted">
                សូមបញ្ចូលពាក្យសម្ងាត់ថ្មីរបស់អ្នកខាងក្រោម
            </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 dialog-enter">
            <div>
                <label htmlFor="password" className="block text-sm font-semibold text-text-body dark:text-text-body mb-1">ពាក្យសម្ងាត់ថ្មី (New Password)</label>
                <div className="relative">
                    <input 
                        type={showPassword ? 'text' : 'password'} 
                        id="password" 
                        required 
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); setError(null); }}
                        placeholder="••••••••" 
                        minLength={6}
                        className="w-full pl-4 pr-24 py-3 border border-divider dark:border-divider rounded-lg focus:ring-2 focus:ring-focus-ring outline-none transition bg-white dark:bg-brand-900 dark:text-white shadow-sm"
                    />
                    <button 
                        type="button" 
                        onClick={() => setShowPassword(!showPassword)}
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

            <div>
                <label htmlFor="confirm-password" className="block text-sm font-semibold text-text-body dark:text-text-body mb-1">ផ្ទៀងផ្ទាត់ពាក្យសម្ងាត់ (Confirm)</label>
                <div className="relative">
                    <input 
                        type={showConfirmPassword ? 'text' : 'password'} 
                        id="confirm-password" 
                        required 
                        value={confirmPassword}
                        onChange={(e) => { setConfirmPassword(e.target.value); setError(null); }}
                        placeholder="••••••••" 
                        minLength={6}
                        className="w-full pl-4 pr-24 py-3 border border-divider dark:border-divider rounded-lg focus:ring-2 focus:ring-focus-ring outline-none transition bg-white dark:bg-brand-900 dark:text-white shadow-sm"
                    />
                    <button 
                        type="button" 
                        onClick={() => setShowConfirmPassword(!showConfirmPassword)}
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

            {error && (
                <div role="alert" className="text-danger text-sm bg-danger/10 p-3 rounded-md border border-danger/30 font-medium">
                    {error}
                </div>
            )}

            <button 
                type="submit" 
                disabled={isLoading || password.length < 6 || confirmPassword.length < 6}
                className="btn-pulse w-full bg-brand hover:bg-brand-800 disabled:opacity-50 text-white font-bold py-3.5 rounded-lg transition shadow-md flex justify-center items-center mt-6"
            >
                {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'ផ្លាស់ប្តូរពាក្យសម្ងាត់'}
            </button>
        </form>
      </div>
    </div>
  )
}
