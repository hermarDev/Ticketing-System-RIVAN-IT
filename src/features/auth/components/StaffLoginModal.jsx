import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Lock, LogIn, X, ShieldAlert, Eye, EyeOff, CheckCircle2, ArrowLeft, Mail } from 'lucide-react'
import { supabase, isSupabaseConfigured, signOutLocal } from '../../../lib/supabaseClient'
import { requestPasswordResetForEmail } from '../../../lib/ticketService'
import { logger } from '../../../lib/logger'

export function StaffLoginModal({ isOpen, onClose, onLoginSuccess }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [resetEmailSent, setResetEmailSent] = useState(false)

  if (!isOpen) return null

  const handleStaffLogin = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)

    if (!email.trim()) {
      setError('Please enter your staff email address.')
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
      setError('Supabase is not configured. Please add your credentials to the .env file.')
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

      // Query user profile to verify staff/admin/ceo role
      const { data: profile } = await supabase
        .from('profiles')
        .select('role, full_name')
        .eq('id', authData.user.id)
        .maybeSingle()

      const userRole = profile?.role

      if (!userRole || !['staff', 'admin', 'ceo'].includes(userRole)) {
        await signOutLocal()
        setError('Access Denied: Account does not have Staff/CEO privileges.')
        setLoading(false)
        return
      }

      setLoading(false)
      onLoginSuccess({
        id: authData.user.id,
        email: authData.user.email,
        role: userRole,
        fullName: profile?.full_name || 'Staff Engineer',
      })
      onClose()
    } catch (err) {
      logger.error('Staff login error:', err)
      setError('Login failed. Please check your credentials.')
      setLoading(false)
    }
  }

  const handleModalClose = () => {
    setIsForgotPassword(false)
    setResetEmailSent(false)
    setError('')
    onClose()
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          className="relative w-full max-w-md rounded-2xl border border-white/10 bg-zinc-900 p-6 text-white shadow-2xl"
        >
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <span className="grid size-9 place-items-center rounded-lg bg-purple-500/20 text-purple-400 border border-purple-500/30">
                <Lock size={18} />
              </span>
              <div>
                <h3 className="font-bold text-lg text-white">
                  {isForgotPassword ? 'Reset Staff Password' : 'Staff & CEO Sign In'}
                </h3>
                <p className="text-xs text-zinc-400">Internal Operations Portal</p>
              </div>
            </div>
            <button
              onClick={handleModalClose}
              className="rounded-lg p-1.5 text-zinc-400 hover:bg-white/10 hover:text-white"
            >
              <X size={20} />
            </button>
          </div>

          <form onSubmit={handleStaffLogin} className="mt-5 space-y-4">
            {error && (
              <div className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-950/40 p-3 text-xs text-red-300">
                <ShieldAlert size={16} className="shrink-0 text-red-400" />
                <span>{error}</span>
              </div>
            )}

            {resetEmailSent && (
              <div className="flex items-start gap-2.5 rounded-xl border border-emerald-500/30 bg-emerald-950/40 p-3.5 text-xs text-emerald-300">
                <CheckCircle2 size={18} className="shrink-0 text-emerald-400 mt-0.5" />
                <div>
                  <p className="font-bold text-white">Password reset link sent!</p>
                  <p className="text-[11px] text-emerald-300/90 mt-0.5">
                    Check <strong className="font-semibold">{email}</strong> for instructions to reset your staff password.
                  </p>
                </div>
              </div>
            )}

            {!resetEmailSent && (
              <>
                <div>
                  <label className="block text-xs font-semibold uppercase text-zinc-400 mb-1">
                    Staff / CEO Email Address
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value)
                      setError('')
                    }}
                    placeholder="staff@netops.com"
                    autoComplete="email"
                    className="w-full rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                  />
                </div>

                {!isForgotPassword && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="block text-xs font-semibold uppercase text-zinc-400">
                        Password
                      </label>
                      <button
                        type="button"
                        onClick={() => {
                          setIsForgotPassword(true)
                          setError('')
                        }}
                        className="text-xs font-medium text-purple-400 hover:text-purple-300 transition-colors"
                      >
                        Forgot password?
                      </button>
                    </div>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        required
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          setError('')
                        }}
                        placeholder="••••••••••••"
                        autoComplete="current-password"
                        className="w-full rounded-xl border border-white/10 bg-white/5 p-3 pr-10 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-purple-500"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {!isSupabaseConfigured && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-950/20 p-3 text-[11px] text-amber-300">
                ⚠️ Supabase is not configured. Staff login requires valid Supabase credentials in your <code className="font-mono">.env</code> file.
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-2">
              {isForgotPassword ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false)
                    setResetEmailSent(false)
                    setError('')
                  }}
                  className="flex items-center gap-1.5 px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white"
                >
                  <ArrowLeft size={14} /> Back to Sign In
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="px-4 py-2 text-xs font-medium text-zinc-400 hover:text-white"
                >
                  Cancel
                </button>
              )}

              {!resetEmailSent && (
                <button
                  type="submit"
                  disabled={loading}
                  className="flex items-center gap-2 rounded-xl bg-purple-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-purple-500 shadow-lg disabled:opacity-50"
                >
                  {loading
                    ? 'Processing...'
                    : isForgotPassword
                    ? 'Send Reset Link'
                    : 'Sign In'}{' '}
                  {isForgotPassword ? <Mail size={16} /> : <LogIn size={16} />}
                </button>
              )}
            </div>
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
