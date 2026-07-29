import { useCallback, useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { Lock, LogIn, ShieldAlert, ArrowLeft, Headphones, Eye, EyeOff, Loader2, Mail, CheckCircle2 } from 'lucide-react'
import { AdminDashboard } from './AdminDashboard'
import { PasswordRecoveryModal } from '../auth/components/PasswordRecoveryModal'
import { supabase, isSupabaseConfigured, signOutLocal } from '../../lib/supabaseClient'
import { requestPasswordResetForEmail } from '../../lib/ticketService'
import { logger } from '../../lib/logger'

export function AdminPortalPage({ onReturnToClientPortal }) {
  const [currentUser, setCurrentUser] = useState(null)
  const [isCheckingSession, setIsCheckingSession] = useState(true)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [resetEmailSent, setResetEmailSent] = useState(false)
  const [isPasswordRecoveryOpen, setIsPasswordRecoveryOpen] = useState(false)

  const buildStaffUser = useCallback(async (authUser) => {
    if (!authUser) return null

    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role, full_name, first_name, last_name, phone, company_name')
      .eq('id', authUser.id)
      .maybeSingle()

    if (profileError) {
      logger.warn('Staff profile lookup failed:', profileError.message)
      return null
    }

    const userRole = profile?.role
    if (!['staff', 'admin', 'ceo'].includes(userRole)) return null

    return {
      id: authUser.id,
      email: authUser.email,
      role: userRole,
      fullName: profile?.full_name || 'Staff Member',
      firstName: profile?.first_name || (profile?.full_name ? profile.full_name.split(' ')[0] : ''),
      lastName: profile?.last_name || (profile?.full_name ? profile.full_name.split(' ').slice(1).join(' ') : ''),
      phone: profile?.phone || '',
      companyName: profile?.company_name || '',
    }
  }, [])

  useEffect(() => {
    let isMounted = true

    // Check URL for recovery tokens on load
    if (window.location.hash.includes('type=recovery') || window.location.search.includes('type=recovery')) {
      setIsPasswordRecoveryOpen(true)
    }

    const verifyExistingSession = async () => {
      if (!isSupabaseConfigured || !supabase) {
        setIsCheckingSession(false)
        return
      }

      try {
        const { data, error: sessionError } = await supabase.auth.getSession()
        if (sessionError) {
          logger.warn('Staff session lookup failed:', sessionError.message)
        }

        const verifiedUser = await buildStaffUser(data?.session?.user)
        if (!isMounted) return

        if (data?.session?.user && !verifiedUser) {
          // Local scope only — do not revoke a concurrent client-portal session.
          await signOutLocal()
          setError('Access Denied: This account does not have Staff, Admin, or CEO privileges.')
        }

        setCurrentUser(verifiedUser)
      } catch (err) {
        logger.error('Staff session verification failed:', err)
        if (isMounted) {
          setError('Unable to verify staff session. Please sign in again.')
          setCurrentUser(null)
        }
      } finally {
        if (isMounted) setIsCheckingSession(false)
      }
    }

    verifyExistingSession()

    const { data: authListener } = supabase?.auth.onAuthStateChange(async (event, session) => {
      if (!isMounted) return
      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecoveryOpen(true)
        return
      }
      if (event === 'INITIAL_SESSION') return
      if (!session?.user) {
        setCurrentUser(null)
        return
      }

      const verifiedUser = await buildStaffUser(session.user)
      if (!isMounted) return

      if (verifiedUser) {
        setCurrentUser(verifiedUser)
        setError('')
      } else {
        // Local scope only — do not revoke a concurrent client-portal session.
        await signOutLocal()
        setCurrentUser(null)
        setError('Access Denied: This account does not have Staff, Admin, or CEO privileges.')
      }
    }) || { data: null }

    return () => {
      isMounted = false
      authListener?.subscription?.unsubscribe()
    }
  }, [buildStaffUser])

  const handleStaffLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!email.trim()) {
      setError('Please enter your work email address.')
      setLoading(false)
      return
    }

    if (isForgotPassword) {
      try {
        await requestPasswordResetForEmail(email, window.location.href)
        setResetEmailSent(true)
      } catch (err) {
        setError(err.message || 'Failed to send password reset email. Please try again.')
      } finally {
        setLoading(false)
      }
      return
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('Supabase is not configured. Please add your VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to your .env file.')
      setLoading(false)
      return
    }

    try {
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (authError) {
        setError(authError.message || 'Invalid email or password.')
        setLoading(false)
        return
      }

      const verifiedUser = await buildStaffUser(authData.user)

      if (!verifiedUser) {
        await signOutLocal()
        setError('Access Denied: This account does not have Staff, Admin, or CEO privileges.')
        setLoading(false)
        return
      }

      setCurrentUser(verifiedUser)
    } catch (err) {
      logger.error('Staff login error:', err)
      setError('Login failed. Please check your credentials and try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleLogout = async () => {
    await signOutLocal()
    setCurrentUser(null)
    setEmail('')
    setPassword('')
  }

  if (isCheckingSession) {
    return (
      <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex items-center justify-center p-4">
        <div className="flex items-center gap-3 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-5 py-4 text-sm font-bold shadow-lg">
          <Loader2 size={18} className="animate-spin" />
          <span>Verifying staff session...</span>
        </div>
      </div>
    )
  }

  // If logged in → show full dashboard
  if (currentUser) {
    return (
      <AdminDashboard
        currentUser={currentUser}
        onUpdateCurrentUser={(updated) => setCurrentUser(updated)}
        onClose={handleLogout}
      />
    )
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors duration-200">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-4 py-3 sm:px-6 sm:py-4 shadow-xs gap-2">
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <span className="grid size-9 sm:size-10 shrink-0 place-items-center rounded-xl bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-950 border border-slate-800 dark:border-slate-700 shadow-xs">
            <Headphones size={18} />
          </span>
          <div className="min-w-0">
            <h1 className="font-extrabold text-xs sm:text-base text-slate-950 dark:text-white leading-tight truncate">NetOps Operations Desk</h1>
            <p className="text-[10px] sm:text-[11px] font-bold text-slate-700 dark:text-slate-300 truncate">Staff &amp; CEO Command Center</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={onReturnToClientPortal}
            className="flex items-center gap-1.5 sm:gap-2 rounded-xl border border-slate-800 dark:border-slate-700 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-white px-3 py-2 text-[11px] sm:text-xs font-bold text-white dark:text-slate-900 shadow-xs transition-all whitespace-nowrap shrink-0"
          >
            <ArrowLeft size={14} className="shrink-0" />
            <span>Return to Client Site</span>
          </button>
        </div>
      </header>

      {/* Center Login Card */}
      <main className="flex-1 flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.35, ease: 'easeOut' }}
          className="w-full max-w-sm"
        >
          {/* Card */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-8 shadow-lg transition-colors duration-200">
            {/* Icon & Title */}
            <div className="text-center mb-7">
              <span className="inline-grid size-14 place-items-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-inner mb-4">
                <Lock size={24} className="text-slate-900 dark:text-slate-100" />
              </span>
              <h2 className="text-2xl font-black text-slate-950 dark:text-white tracking-tight">
                {isForgotPassword ? 'Reset Staff Password' : 'Staff Portal Login'}
              </h2>
              <p className="text-xs text-slate-700 dark:text-slate-300 mt-1.5 leading-relaxed font-medium">
                {isForgotPassword
                  ? "Enter your work email address and we'll send you a password reset link."
                  : 'Secure access for network engineers, administrators, and executives.'}
              </p>
            </div>

            <form onSubmit={handleStaffLogin} className="space-y-4">
              {/* Error */}
              {error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  className="flex items-start gap-2 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3 text-xs font-semibold text-rose-700 dark:text-rose-300"
                >
                  <ShieldAlert size={15} className="shrink-0 text-rose-600 dark:text-rose-400 mt-0.5" />
                  <span>{error}</span>
                </motion.div>
              )}

              {/* Reset Email Sent Confirmation */}
              {resetEmailSent && (
                <motion.div
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 p-4 text-xs shadow-xs"
                >
                  <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold text-slate-950 dark:text-white">Reset link sent!</p>
                    <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-1 leading-relaxed">
                      Check <strong className="font-bold">{email}</strong> for instructions to reset your staff password.
                    </p>
                  </div>
                </motion.div>
              )}

              {!resetEmailSent && (
                <>
                  {/* Email */}
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                      Work Email
                    </label>
                    <input
                      id="staff-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setError('')
                      }}
                      placeholder="you@netops.com"
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 text-sm font-bold text-slate-950 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all"
                    />
                  </div>

                  {/* Password */}
                  {!isForgotPassword && (
                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Password
                        </label>
                        <button
                          type="button"
                          onClick={() => {
                            setIsForgotPassword(true)
                            setError('')
                          }}
                          className="text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <div className="relative">
                        <input
                          id="staff-password"
                          type={showPassword ? 'text' : 'password'}
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => {
                            setPassword(e.target.value)
                            setError('')
                          }}
                          placeholder="••••••••••••"
                          className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 p-3 pr-10 text-sm font-bold text-slate-950 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                          aria-label={showPassword ? 'Hide password' : 'Show password'}
                        >
                          {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Submit */}
              {!resetEmailSent && (
                <button
                  id="staff-login-btn"
                  type="submit"
                  disabled={loading}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white active:scale-95 py-3 text-sm font-black text-white dark:text-slate-900 shadow-md disabled:opacity-50 transition-all mt-2"
                >
                  {loading ? (
                    <><Loader2 size={16} className="animate-spin" /> {isForgotPassword ? 'Sending…' : 'Authenticating…'}</>
                  ) : isForgotPassword ? (
                    <><Mail size={16} /> Send Password Reset Link</>
                  ) : (
                    <><LogIn size={16} /> Sign In to Operations Desk</>
                  )}
                </button>
              )}

              {isForgotPassword && (
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false)
                    setResetEmailSent(false)
                    setError('')
                  }}
                  className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 py-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                >
                  <ArrowLeft size={14} /> Back to Sign In
                </button>
              )}
            </form>
          </div>

          {/* Hint */}
          {!isSupabaseConfigured && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mt-4 text-center text-xs font-bold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 shadow-xs"
            >
              Supabase is not configured. Staff access is disabled until production credentials are available.
            </motion.p>
          )}
        </motion.div>
      </main>

      <PasswordRecoveryModal
        isOpen={isPasswordRecoveryOpen}
        onClose={() => setIsPasswordRecoveryOpen(false)}
        contextLabel="your staff account"
      />

      <footer className="text-center text-xs font-semibold text-slate-700 dark:text-slate-400 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 py-4">
        NetOps Staff &amp; CEO Portal — Restricted Access Only
      </footer>
    </div>
  )
}
