import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { Lock, ShieldAlert, Loader2, Eye, EyeOff, X, CheckCircle2, Check, AlertCircle } from 'lucide-react'
import {
  getPasswordValidationError,
  mapAuthPasswordError,
} from '../../../lib/formValidation'
import { completePasswordRecovery } from '../../../lib/ticketService'
import { PasswordRequirementsChecklist } from '../../../shared/components/PasswordRequirementsChecklist'

function clearUrlTokens() {
  try {
    if (window?.history?.replaceState) {
      window.history.replaceState(null, '', window.location.pathname)
    }
  } catch {
    // silent
  }
}

export function PasswordRecoveryModal({ isOpen, onClose, contextLabel = 'your account' }) {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)

  const passwordsMatch = Boolean(
    newPassword && confirmPassword && newPassword === confirmPassword
  )
  const passwordsMismatch = Boolean(
    newPassword && confirmPassword && newPassword !== confirmPassword
  )

  if (!isOpen) return null

  const validate = () => {
    const nextErrors = []
    const passwordError = getPasswordValidationError(newPassword)
    if (passwordError) nextErrors.push(passwordError)
    if (String(newPassword) !== String(confirmPassword)) nextErrors.push('Passwords do not match.')
    return nextErrors
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const validationErrors = validate()
    if (validationErrors.length) {
      setError(validationErrors[0])
      return
    }

    setLoading(true)
    try {
      await completePasswordRecovery(newPassword)
      setSuccess(true)
      clearUrlTokens()
      setTimeout(() => {
        onClose?.()
      }, 1200)
    } catch (err) {
      setError(
        mapAuthPasswordError(err?.message) ||
          err?.message ||
          'Failed to update password. Please request a new reset link and try again.'
      )
    } finally {
      setLoading(false)
    }
  }

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-60 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-md">
        <motion.div
          className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 text-slate-950 dark:text-white shadow-2xl"
          role="dialog"
          aria-modal="true"
          aria-labelledby="password-recovery-modal-title"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-xs">
                <Lock size={20} />
              </span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-400">
                  PASSWORD RECOVERY
                </span>
                <h2 id="password-recovery-modal-title" className="text-xl sm:text-2xl font-black tracking-tight">
                  Set a New Password
                </h2>
              </div>
            </div>

            <button
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
              type="button"
              onClick={() => {
                clearUrlTokens()
                onClose?.()
              }}
              aria-label="Close password recovery modal"
              disabled={loading}
            >
              <X size={20} />
            </button>
          </div>

          <p className="mt-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            Choose a new password for {contextLabel}. This link may expire, so if you see an error, request a new reset email.
          </p>

          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3.5 text-xs text-rose-700 dark:text-rose-300 shadow-xs"
              >
                <ShieldAlert size={16} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <span className="flex-1 leading-normal">{error}</span>
              </motion.div>
            )}

            {success ? (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 p-4 text-xs shadow-xs"
              >
                <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
                <div className="flex-1">
                  <p className="font-bold text-slate-950 dark:text-white">Password updated</p>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-1">Redirecting you to your workspace…</p>
                </div>
              </motion.div>
            ) : (
              <>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                    New Password
                  </label>
                  <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-all">
                    <Lock size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={newPassword}
                      onChange={(e) => {
                        setNewPassword(e.target.value)
                        setError('')
                      }}
                      placeholder="Upper, lower, number, symbol"
                      autoComplete="new-password"
                      required
                      aria-describedby="recovery-password-requirements"
                      className="w-full bg-transparent pl-10 pr-10 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                      aria-label={showPassword ? 'Hide new password' : 'Show new password'}
                      disabled={loading}
                    >
                      {showPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                      Confirm New Password
                    </label>
                    {passwordsMatch && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400" aria-live="polite">
                        <Check size={12} /> Passwords Match
                      </span>
                    )}
                    {passwordsMismatch && (
                      <span className="flex items-center gap-1 text-[10px] font-bold text-rose-600 dark:text-rose-400" aria-live="polite">
                        <AlertCircle size={12} /> Passwords do not match
                      </span>
                    )}
                  </div>
                  <div className={`relative rounded-xl border bg-slate-50 dark:bg-slate-950 transition-all ${
                    passwordsMatch
                      ? 'border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20'
                      : passwordsMismatch
                        ? 'border-rose-500 focus-within:ring-2 focus-within:ring-rose-500/20'
                        : 'border-slate-200 dark:border-slate-700 focus-within:border-slate-900 dark:focus-within:border-slate-100'
                  }`}>
                    <Lock
                      size={17}
                      className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                        passwordsMatch
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : passwordsMismatch
                            ? 'text-rose-600 dark:text-rose-400'
                            : 'text-slate-400'
                      }`}
                    />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value)
                        setError('')
                      }}
                      placeholder="Re-enter your new password"
                      autoComplete="new-password"
                      required
                      aria-invalid={passwordsMismatch}
                      className="w-full bg-transparent pl-10 pr-10 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none"
                      disabled={loading}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((v) => !v)}
                      className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                      aria-label={showConfirmPassword ? 'Hide confirm new password' : 'Show confirm new password'}
                      disabled={loading}
                    >
                      {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                    </button>
                  </div>
                </div>

                <PasswordRequirementsChecklist
                  password={newPassword}
                  listId="recovery-password-requirements"
                />
              </>
            )}

            {!success && (
              <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-3">
                <button
                  type="button"
                  onClick={() => {
                    clearUrlTokens()
                    onClose?.()
                  }}
                  disabled={loading}
                  className="w-full sm:w-auto flex items-center justify-center rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all whitespace-nowrap shrink-0"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full sm:w-auto flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white active:scale-[0.99] px-5 sm:px-6 py-3 text-xs font-black uppercase tracking-wider text-white dark:text-slate-900 shadow-md disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap shrink-0"
                >
                  {loading ? (
                    <>
                      <Loader2 size={16} className="animate-spin shrink-0" /> Updating…
                    </>
                  ) : (
                    <>
                      Update Password <ArrowRightIcon />
                    </>
                  )}
                </button>
              </div>
            )}
          </form>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}

function ArrowRightIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path d="m13 5 7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

