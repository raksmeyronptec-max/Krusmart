'use client'

import { useState } from 'react'
import { CheckCircle, XCircle, Loader2, ArrowLeft, KeyRound } from 'lucide-react'
import { requestPasswordReset } from '../actions'
import Link from 'next/link'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export default function ResetPasswordPage() {
  const [email, setEmail] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const isValidEmail = EMAIL_PATTERN.test(email)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!isValidEmail) return

    setIsLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const result = await requestPasswordReset(email)
      if (result?.error) {
        setError(result.error)
      } else if (result?.success) {
        setSuccess(true)
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
            <div className="w-16 h-16 bg-brand-50 dark:bg-brand-800/50 rounded-full flex items-center justify-center mx-auto mb-4 text-brand dark:text-brand-400">
                <KeyRound className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold text-text-heading dark:text-white mb-2 kh-moul">ភ្លេចពាក្យសម្ងាត់</h1>
            <p className="text-sm font-medium text-text-muted dark:text-text-muted">
                សូមបញ្ចូលអ៊ីមែលរបស់អ្នកដើម្បីកំណត់ពាក្យសម្ងាត់ថ្មី
            </p>
        </div>

        {success ? (
          <div className="text-center animate-in fade-in zoom-in duration-300">
            <div className="bg-success/10 text-success p-6 rounded-2xl border border-success/30 mb-6">
                <p className="font-medium text-sm">
                    តំណភ្ជាប់សម្រាប់កំណត់ពាក្យសម្ងាត់ថ្មីត្រូវបានបញ្ជូនទៅ<br/><b className="mt-2 inline-block">{email}</b>
                </p>
            </div>
            <Link 
                href="/login"
                className="btn-pulse w-full bg-brand hover:bg-brand-800 text-white font-bold py-3.5 rounded-lg transition shadow-md flex justify-center items-center"
            >
                ត្រឡប់ទៅទំព័រចូលគណនី
            </Link>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in zoom-in duration-300">
            <div>
                <label htmlFor="email" className="block text-sm font-semibold text-text-body dark:text-text-body mb-1">អុីមែល (Email)</label>
                <div className="relative">
                    <input 
                        type="email" 
                        id="email" 
                        required 
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); setError(null); }}
                        placeholder="name@school.edu.kh" 
                        className={`w-full pl-4 pr-10 py-3 border rounded-lg focus:ring-2 outline-none transition bg-white dark:bg-brand-900 dark:text-white shadow-sm ${email.length > 0 ? (isValidEmail ? 'border-success focus:ring-success' : 'border-danger focus:ring-danger') : 'border-divider dark:border-divider focus:ring-focus-ring'}`}
                    />
                    {email.length > 0 && isValidEmail && <CheckCircle className="absolute right-3 top-3.5 w-5 h-5 text-success" />}
                    {email.length > 0 && !isValidEmail && <XCircle className="absolute right-3 top-3.5 w-5 h-5 text-danger" />}
                </div>
            </div>

            {error && (
                <div role="alert" className="text-danger text-sm bg-danger/10 p-3 rounded-md border border-danger/30 font-medium">
                    {error}
                </div>
            )}

            <button 
                type="submit" 
                disabled={isLoading || !isValidEmail}
                className="btn-pulse w-full bg-brand hover:bg-brand-800 disabled:opacity-50 text-white font-bold py-3.5 rounded-lg transition shadow-md flex justify-center items-center mt-6"
            >
                {isLoading ? <Loader2 className="animate-spin w-5 h-5" /> : 'ផ្ញើតំណភ្ជាប់ (Send Link)'}
            </button>
            
            <div className="mt-6 text-center">
                <Link href="/login" className="inline-flex items-center gap-2 text-sm font-medium text-text-muted hover:text-brand transition-colors">
                    <ArrowLeft className="w-4 h-4" /> ត្រឡប់ក្រោយ
                </Link>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
