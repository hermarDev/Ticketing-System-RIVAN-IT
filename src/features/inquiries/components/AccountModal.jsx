import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import {
  UserPlus,
  X,
  ShieldAlert,
  Eye,
  EyeOff,
  User,
  Building2,
  Mail,
  Phone,
  Lock,
  MapPin,
  Loader2,
  CheckCircle2,
  ArrowRight,
  AlertCircle,
  Check,
} from 'lucide-react'
import { logger } from '../../../lib/logger'
import { validateRequiredFields, isValidEmail, isValidPhPhone } from '../../../lib/formValidation'
import { createAccount, loginWithGoogle } from '../../../lib/ticketService'

/**
 * AccountModal — Designed to seamlessly complement the NetOps landing page.
 * Features 2-pass password verification (Password + Confirm Password),
 * First Name & Last Name split, 2-column responsive grid layout,
 * and NetOps brand colors (Ink #091016, Amber #ffb400/#9b6600, Teal #108474).
 */
export function AccountModal({ isOpen, onClose, onAccountCreated, onSwitchToLogin }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    company: '',
    email: '',
    phone: '',
    siteAddress: '',
    password: '',
    confirmPassword: '',
  })
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState('')
  const [loading, setLoading] = useState(false)
  const [clientId, setClientId] = useState('')

  const handleGoogleSignUp = async () => {
    setServerError('')
    setLoading(true)
    try {
      await loginWithGoogle()
    } catch (err) {
      setServerError(err.message || 'Google sign-up failed. Please try again.')
      setLoading(false)
    }
  }

  const requiredFields = useMemo(
    () => ['firstName', 'lastName', 'company', 'email', 'phone', 'siteAddress', 'password', 'confirmPassword'],
    []
  )

  if (!isOpen) return null

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setServerError('')
    setClientId('')
  }

  const validate = () => {
    const nextErrors = validateRequiredFields(form, requiredFields)
    if (form.email && !isValidEmail(form.email)) {
      nextErrors.email = 'Enter a valid email address.'
    }
    if (form.phone && !isValidPhPhone(form.phone)) {
      nextErrors.phone = 'Must be an 11-digit Philippines mobile number starting with 09 (e.g. 09171234567).'
    }
    if (form.password && form.password.length < 8) {
      nextErrors.password = 'Password must be at least 8 characters.'
    }
    if (form.password && form.confirmPassword && form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match. Please verify.'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    setServerError('')
    if (!validate()) return

    setLoading(true)
    try {
      const created = await createAccount({
        firstName: form.firstName,
        lastName: form.lastName,
        fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
        companyName: form.company,
        email: form.email,
        phone: form.phone,
        siteAddress: form.siteAddress,
        password: form.password,
      })
      setClientId(created.clientId || created.id)
      onAccountCreated({
        ...form,
        fullName: created.fullName || `${form.firstName.trim()} ${form.lastName.trim()}`,
        companyName: form.company,
        clientId: created.clientId || created.id,
        id: created.id,
      })
    } catch (err) {
      logger.error('Account creation error:', err)
      setServerError(err.message || 'Failed to create account. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const passwordsMatch = form.password && form.confirmPassword && form.password === form.confirmPassword

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md overflow-y-auto">
        <motion.div
          className="relative w-full max-w-xl overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-6 sm:p-8 text-slate-950 dark:text-white shadow-2xl my-8"
          role="dialog"
          aria-modal="true"
          aria-labelledby="account-modal-title"
          initial={{ opacity: 0, scale: 0.96, y: 16 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96, y: 16 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* Modal Header */}
          <div className="flex items-start justify-between border-b border-slate-200 dark:border-slate-800 pb-4">
            <div className="flex items-center gap-3">
              <span className="grid size-10 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-xs">
                <UserPlus size={20} />
              </span>
              <div>
                <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-400">
                  NEW CLIENT ACCOUNT
                </span>
                <h2 id="account-modal-title" className="text-xl sm:text-2xl font-black tracking-tight text-slate-950 dark:text-white">
                  Create an Account
                </h2>
              </div>
            </div>
            <button
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
              type="button"
              onClick={onClose}
              aria-label="Close modal"
            >
              <X size={20} />
            </button>
          </div>

          <p className="mt-3 text-xs sm:text-sm text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
            Register your organization to submit network support tickets, track SLA status, and receive real-time engineer support.
          </p>

          {/* Google Sign-Up Button */}
          <div className="mt-5 space-y-3">
            <button
              type="button"
              onClick={handleGoogleSignUp}
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 py-3 text-xs font-bold uppercase text-slate-900 dark:text-slate-100 shadow-xs transition-all disabled:opacity-50"
            >
              <svg className="size-4" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
              </svg>
              Sign up with Google
            </button>

            <div className="relative flex items-center justify-center">
              <div className="w-full border-t border-slate-200 dark:border-slate-800" />
              <span className="absolute bg-white dark:bg-slate-900 px-3 text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400">
                or fill in details manually
              </span>
            </div>
          </div>

          {/* Form Content */}
          <form className="mt-4 space-y-4" onSubmit={handleSubmit} noValidate>

            {/* Server Error Notification */}
            {serverError && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-start gap-2.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 p-3.5 text-xs text-rose-700 dark:text-rose-300 shadow-xs"
              >
                <ShieldAlert size={16} className="shrink-0 mt-0.5 text-rose-600 dark:text-rose-400" />
                <div className="flex-1 leading-normal">
                  <span>{serverError}</span>
                  {serverError.includes('already exists') && onSwitchToLogin && (
                    <button
                      type="button"
                      onClick={onSwitchToLogin}
                      className="mt-1 block font-bold text-slate-900 dark:text-slate-100 underline hover:no-underline"
                    >
                      Log in to your account →
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* 2-Column Grid for First Name & Last Name */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* First Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  First Name
                </label>
                <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-all">
                  <User
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={form.firstName}
                    onChange={(e) => updateField('firstName', e.target.value)}
                    placeholder="Juan"
                    autoComplete="given-name"
                    required
                    className="w-full bg-transparent pl-10 pr-3 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none"
                  />
                </div>
                {errors.firstName && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                    <AlertCircle size={12} /> {errors.firstName}
                  </span>
                )}
              </div>

              {/* Last Name */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Last Name
                </label>
                <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-all">
                  <User
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={form.lastName}
                    onChange={(e) => updateField('lastName', e.target.value)}
                    placeholder="Dela Cruz"
                    autoComplete="family-name"
                    required
                    className="w-full bg-transparent pl-10 pr-3 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none"
                  />
                </div>
                {errors.lastName && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                    <AlertCircle size={12} /> {errors.lastName}
                  </span>
                )}
              </div>
            </div>

            {/* 2-Column Grid for Company & Phone */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Company / Organization */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Company / Organization
                </label>
                <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-all">
                  <Building2
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="text"
                    value={form.company}
                    onChange={(e) => updateField('company', e.target.value)}
                    placeholder="Acme Telecom Corp"
                    autoComplete="organization"
                    required
                    className="w-full bg-transparent pl-10 pr-3 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none"
                  />
                </div>
                {errors.company && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                    <AlertCircle size={12} /> {errors.company}
                  </span>
                )}
              </div>

              {/* Phone */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Contact Number (PH 11-Digit)
                </label>
                <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-all">
                  <Phone
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type="tel"
                    value={form.phone}
                    onChange={(e) => updateField('phone', e.target.value)}
                    placeholder="09171234567"
                    maxLength={11}
                    autoComplete="tel"
                    required
                    className="w-full bg-transparent pl-10 pr-3 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none"
                  />
                </div>
                {errors.phone && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                    <AlertCircle size={12} /> {errors.phone}
                  </span>
                )}
              </div>
            </div>

            {/* Email Address (Full Width) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Email Address
              </label>
              <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-all">
                <Mail
                  size={17}
                  className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                />
                <input
                  type="email"
                  value={form.email}
                  onChange={(e) => updateField('email', e.target.value)}
                  placeholder="juan@acme.com"
                  autoComplete="email"
                  required
                  className="w-full bg-transparent pl-10 pr-3 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none"
                />
              </div>
              {errors.email && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                  <AlertCircle size={12} /> {errors.email}
                </span>
              )}
            </div>

            {/* 2-Pass Password Grid (Password + Confirm Password) */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* Password */}
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                  Password
                </label>
                <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-all">
                  <Lock
                    size={17}
                    className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                  />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={form.password}
                    onChange={(e) => updateField('password', e.target.value)}
                    placeholder="Min. 8 characters"
                    autoComplete="new-password"
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
                {errors.password && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                    <AlertCircle size={12} /> {errors.password}
                  </span>
                )}
              </div>

              {/* Confirm Password */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    Confirm Password
                  </label>
                  {passwordsMatch && (
                    <span className="flex items-center gap-1 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                      <Check size={12} /> Passwords Match
                    </span>
                  )}
                </div>
                <div className={`relative rounded-xl border bg-slate-50 dark:bg-slate-950 transition-all ${
                  passwordsMatch 
                    ? 'border-emerald-500 focus-within:ring-2 focus-within:ring-emerald-500/20' 
                    : 'border-slate-200 dark:border-slate-700 focus-within:border-slate-900 dark:focus-within:border-slate-100'
                }`}>
                  <Lock
                    size={17}
                    className={`absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none ${
                      passwordsMatch ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'
                    }`}
                  />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={form.confirmPassword}
                    onChange={(e) => updateField('confirmPassword', e.target.value)}
                    placeholder="Re-enter password"
                    autoComplete="new-password"
                    required
                    className="w-full bg-transparent pl-10 pr-10 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                    aria-label={showConfirmPassword ? 'Hide confirm password' : 'Show confirm password'}
                  >
                    {showConfirmPassword ? <EyeOff size={17} /> : <Eye size={17} />}
                  </button>
                </div>
                {errors.confirmPassword && (
                  <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                    <AlertCircle size={12} /> {errors.confirmPassword}
                  </span>
                )}
              </div>
            </div>

            {/* Site / Installation Address */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                Site / Installation Address
              </label>
              <div className="relative rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 focus-within:border-slate-900 dark:focus-within:border-slate-100 transition-all">
                <MapPin
                  size={17}
                  className="absolute left-3.5 top-3.5 text-slate-400 pointer-events-none"
                />
                <textarea
                  value={form.siteAddress}
                  onChange={(e) => updateField('siteAddress', e.target.value)}
                  placeholder="Facility, building floor, street, city, province"
                  rows={2}
                  required
                  className="w-full bg-transparent pl-10 pr-3 py-3 text-sm text-slate-950 dark:text-white font-medium placeholder-slate-400 focus:outline-none resize-none"
                />
              </div>
              {errors.siteAddress && (
                <span className="flex items-center gap-1 text-[11px] font-bold text-rose-600 dark:text-rose-400 mt-1">
                  <AlertCircle size={12} /> {errors.siteAddress}
                </span>
              )}
            </div>

            {/* Success Notification Card */}
            {clientId && (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="flex items-center gap-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 p-4 text-emerald-900 dark:text-emerald-300 text-xs shadow-xs"
              >
                <CheckCircle2 size={20} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                <div>
                  <p className="font-bold text-slate-950 dark:text-white">Account successfully created!</p>
                  <p className="text-[11px] text-emerald-800 dark:text-emerald-300 mt-0.5">
                    Your Client ID is:{' '}
                    <strong className="font-mono bg-white dark:bg-slate-900 px-2 py-0.5 rounded border border-emerald-300 dark:border-emerald-700 text-slate-950 dark:text-white">
                      {clientId}
                    </strong>
                  </p>
                </div>
              </motion.div>
            )}

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 pt-3">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 px-4 py-3 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white active:scale-[0.99] px-6 py-3 text-xs font-black uppercase tracking-wider text-white dark:text-slate-900 shadow-md disabled:opacity-50 transition-all cursor-pointer"
              >
                {loading ? (
                  <>
                    <Loader2 size={16} className="animate-spin" /> Creating Account…
                  </>
                ) : (
                  <>
                    Create Account <UserPlus size={16} />
                  </>
                )}
              </button>
            </div>

            {/* Switch to Login */}
            {onSwitchToLogin && (
              <div className="border-t border-slate-200 dark:border-slate-800 pt-4 text-center">
                <p className="text-xs text-slate-700 dark:text-slate-400 font-medium">
                  Already have an account?{' '}
                  <button
                    type="button"
                    onClick={onSwitchToLogin}
                    className="inline-flex items-center gap-1 font-bold text-slate-950 dark:text-white hover:underline transition-colors"
                  >
                    Log in here <ArrowRight size={13} />
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
