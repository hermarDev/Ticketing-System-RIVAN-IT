import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { LogIn, Mail, Lock, X, ShieldAlert, Loader2, Eye, EyeOff, KeyRound, ArrowRight, CheckCircle2, ArrowLeft } from 'lucide-react'
import { loginClient, loginWithGoogle, requestPasswordResetForEmail } from '../../../lib/ticketService'

export function ClientLoginModal({ isOpen, onClose, onLoginSuccess, onSwitchToRegister }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [isForgotPassword, setIsForgotPassword] = useState(false)
  const [resetEmailSent, setResetEmailSent] = useState(false)

  if (!isOpen) return null

  const handleGoogleLogin = async () => {
    setError('')
    setLoading(true)
    try {
      await loginWithGoogle()
    } catch (err) {
      setError(err.message || 'Google sign-in failed. Please try again.')
      setLoading(false)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!email.trim()) {
      setError('Please enter your registered email address.')
      return
    }

    if (isForgotPassword) {
      setLoading(true)
      try {
        await requestPasswordResetForEmail(email, window.location.href)
        setResetEmailSent(true)
      } catch (err) {
        setError(err.message || 'Failed to send password reset email. Please verify your email address.')
      } finally {
        setLoading(false)
      }
      return
    }

    if (!password) {
      setError('Please enter your password.')
      return
    }

    setLoading(true)
    try {
      const account = await loginClient(email, password)
      onLoginSuccess(account)
      setEmail('')
      setPassword('')
    } catch (err) {
      setError(err.message || 'Login failed. Please verify your credentials.')
    } finally {
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
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md">
        <motion.div
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 text-slate-950 dark:text-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="client-login-modal-title"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Modal Header */}
          <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-xs">
                {isForgotPassword ? <Lock size={20} /> : <KeyRound size={20} />}
              </span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-400">
                  {isForgotPassword ? 'ACCOUNT RECOVERY' : 'RETURNING CLIENT'}
                </span>
                <h2 id="client-login-modal-title" className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                  {isForgotPassword ? 'Reset Password' : 'Client Login'}
                </h2>
              </div>
            </div>
            <button
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
              type="button"
              onClick={handleModalClose}
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>

          <p className="mt-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            {isForgotPassword
              ? "Enter your registered email address and we'll send you a link to reset your password."
              : 'Sign in with the email address and password associated with your NetOps client account.'}
          </p>

          {/* Google Sign-In Button (only during standard login) */}
          {!isForgotPassword && (
            <div className="mt-5 space-y-3">
              <button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loading}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 py-3 text-xs font-bold uppercase text-slate-900 dark:text-slate-100 shadow-xs transition-all disabled:opacity-50"
              >
                <svg className="size-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                </svg>
                Sign in with Google
              </button>

              <div className="relative flex items-center justify-center">
                <div className="w-full border-t border-slate-200 dark:border-slate-800" />
                <span className="absolute bg-white dark:bg-slate-900 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                  or sign in with email
                </span>
              </div>
            </div>
          )}

          {/* Form Content */}
          <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>
            {/* Error Notification */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3.5 text-xs text-rose-700 dark:text-rose-300 shadow-xs"
              >
                <ShieldAlert size={16} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <div className="flex-1 leading-normal">
                  <span>{error}</span>
                  {error.includes('create an account') && onSwitchToRegister && (
                    <button
                      type="button"
                      onClick={onSwitchToRegister}
                      className="mt-1 block font-bold text-slate-900 dark:text-slate-100 underline hover:no-underline"
                    >
                      Create an account now →
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* Success Notification for Password Reset Email */}
            {resetEmailSent && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 p-4 text-xs shadow-xs"
              >
                <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-slate-950 dark:text-white">Reset email sent!</p>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-1 leading-relaxed">
                    Check <strong className="font-bold">{email}</strong> for instructions to reset your password.
                  </p>
                </div>
              </motion.div>
            )}

            {!resetEmailSent && (
              <>
                {/* Email Field */}
                <div>
                  <label
                    htmlFor="client-login-email"
                    className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5"
                  >
                    Email Address
                  </label>
                  <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-all">
                    <Mail
                      size={17}
                      className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    />
                    <input
                      id="client-login-email"
                      type="email"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value)
                        setError('')
                      }}
                      placeholder="your@company.com"
                      autoComplete="email"
                      required
                      className="w-full bg-transparent pl-10 pr-4 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none"
                    />
                  </div>
                </div>

                {/* Password Field (hidden during forgot password mode) */}
                {!isForgotPassword && (
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label
                        htmlFor="client-login-password"
                        className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300"
                      >
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
                    <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-all">
                      <Lock
                        size={17}
                        className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                      />
                      <input
                        id="client-login-password"
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value)
                          setError('')
                        }}
                        placeholder="••••••••••••"
                        autoComplete="current-password"
                        required
                        className="w-full bg-transparent pl-10 pr-10 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                        aria-label={showPassword ? 'Hide password' : 'Show password'}
                      >
                        {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                      </button>
                    </div>
                  </div>
                )}
              </>
            )}

            {/* Actions */}
            <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-3">
              {isForgotPassword ? (
                <button
                  type="button"
                  onClick={() => {
                    setIsForgotPassword(false)
                    setResetEmailSent(false)
                    setError('')
                  }}
                  className="w-full sm:w-auto flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all whitespace-nowrap shrink-0"
                >
                  <ArrowLeft size={14} className="shrink-0" /> Back to Sign In
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleModalClose}
                  className="w-full sm:w-auto flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
              )}

              {!resetEmailSent && (
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white active:scale-[0.99] px-5 sm:px-6 py-3 text-xs font-black uppercase tracking-wider text-white dark:text-slate-900 shadow-md disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin shrink-0" /> {isForgotPassword ? 'Sending…' : 'Signing In…'}
                    </>
                  ) : isForgotPassword ? (
                    <>
                      Send Reset Link <Mail size={16} className="shrink-0" />
                    </>
                  ) : (
                    <>
                      Log In <LogIn size={16} className="shrink-0" />
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Switch to Register */}
            {!isForgotPassword && onSwitchToRegister && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 text-center">
                <p className="text-xs text-slate-700 dark:text-slate-400 font-medium">
                  New here?{' '}
                  <button
                    type="button"
                    onClick={onSwitchToRegister}
                    className="inline-flex items-center gap-1 font-bold text-slate-950 dark:text-white hover:underline transition-colors"
                  >
                    Create an account <ArrowRight size={13} />
                  </button>
                </p>
              </div>
            )}
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

