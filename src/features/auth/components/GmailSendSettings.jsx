import { useState, useEffect, useId } from 'react'
import { motion } from 'framer-motion'
import { Mail, Loader2, CheckCircle2, ShieldAlert, Save } from 'lucide-react'
import { getClientGmailSettings, updateGmailSettings } from '../../../lib/ticketService'
import { isValidEmail } from '../../../lib/formValidation'

/**
 * Gmail Pass-Through Settings section.
 * Rendered only for Google OAuth users (`isGoogleUser === true`).
 *
 * Props:
 *   isGoogleUser  {boolean}  Whether the current session is a Google OAuth user
 *   userEmail     {string}   The user's account email address (pre-fills the reply-to field)
 *   userId        {string}   Supabase user id used to load / save settings
 */
export function GmailSendSettings({ isGoogleUser, userEmail, userId }) {
  const toggleId = useId()
  const inputId = useId()
  const errorId = useId()

  const [gmailReplyTo, setGmailReplyTo] = useState('')
  const [gmailSendEnabled, setGmailSendEnabled] = useState(false)
  const [loadingPrefs, setLoadingPrefs] = useState(false)
  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [error, setError] = useState('')

  // Pre-fill from userEmail when it becomes available
  useEffect(() => {
    if (userEmail && !gmailReplyTo) {
      setGmailReplyTo(userEmail)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userEmail])

  // Load saved settings on mount
  useEffect(() => {
    if (!isGoogleUser || !userId) return

    let cancelled = false
    setLoadingPrefs(true)

    const load = async () => {
      try {
        const prefs = await getClientGmailSettings(userId)
        if (prefs && !cancelled) {
          setGmailSendEnabled(prefs.gmailSendEnabled ?? false)
          setGmailReplyTo(prefs.gmailReplyTo || userEmail || '')
        }
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load Gmail preferences.')
      } finally {
        if (!cancelled) setLoadingPrefs(false)
      }
    }

    load()
    return () => { cancelled = true }
  }, [isGoogleUser, userId, userEmail])

  if (!isGoogleUser) return null

  const validate = () => {
    if (gmailSendEnabled) {
      if (!gmailReplyTo.trim()) {
        setError('Gmail reply-to address is required when the toggle is on.')
        return false
      }
      if (!isValidEmail(gmailReplyTo.trim())) {
        setError('Please enter a valid email address.')
        return false
      }
    }
    return true
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (!validate()) return

    setSaving(true)
    try {
      await updateGmailSettings(userId, { gmailSendEnabled, gmailReplyTo: gmailReplyTo.trim() })
      setSuccessMsg('Gmail preferences saved successfully!')
    } catch (err) {
      setError(err.message || 'Failed to save Gmail preferences.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section aria-labelledby="gmail-settings-heading" className="space-y-4 pt-2">
      {/* Section divider */}
      <div className="border-t border-slate-200 dark:border-slate-800" />

      {/* Heading */}
      <div className="flex items-center gap-2">
        {/* Inline Gmail colour-dot indicator */}
        <span
          className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-white border border-slate-200 dark:border-slate-700 shadow-xs shrink-0"
          aria-hidden="true"
        >
          <svg width="12" height="12" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M44 8H4a4 4 0 0 0-4 4v24a4 4 0 0 0 4 4h40a4 4 0 0 0 4-4V12a4 4 0 0 0-4-4Z" fill="#fff"/>
            <path d="M44 8 24 26 4 8" stroke="#EA4335" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M4 8l20 18L44 8" fill="#EA4335"/>
            <path d="M0 12v24l14-12L0 12Z" fill="#34A853"/>
            <path d="M48 12v24L34 24l14-12Z" fill="#FBBC05"/>
            <path d="M4 36l14-12 6 5.1 6-5.1 14 12H4Z" fill="#4285F4"/>
          </svg>
        </span>
        <h5
          id="gmail-settings-heading"
          className="text-xs font-extrabold uppercase tracking-widest text-slate-700 dark:text-slate-300"
        >
          Gmail Email Preferences
        </h5>
      </div>

      {loadingPrefs ? (
        <div className="flex items-center gap-2 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400">
          <Loader2 size={14} className="animate-spin shrink-0" />
          Loading Gmail preferences…
        </div>
      ) : (
        <form onSubmit={handleSave} noValidate className="space-y-4">
          {/* Reply-To address input */}
          <div>
            <label
              htmlFor={inputId}
              className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1.5"
            >
              Gmail Reply-To Address
            </label>
            <div className="relative">
              <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                id={inputId}
                type="email"
                autoComplete="email"
                value={gmailReplyTo}
                onChange={(e) => {
                  setGmailReplyTo(e.target.value)
                  setError('')
                  setSuccessMsg('')
                }}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={!!error}
                placeholder="you@gmail.com"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-3 py-2.5 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all shadow-xs"
              />
            </div>
          </div>

          {/* Enable toggle */}
          <div className="flex items-start gap-3">
            <button
              id={toggleId}
              type="button"
              role="switch"
              aria-checked={gmailSendEnabled}
              onClick={() => {
                setGmailSendEnabled((v) => !v)
                setError('')
                setSuccessMsg('')
              }}
              className={[
                'relative inline-flex shrink-0 h-5 w-9 rounded-full border-2 transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 dark:focus-visible:outline-slate-100',
                gmailSendEnabled
                  ? 'bg-slate-900 dark:bg-slate-100 border-slate-900 dark:border-slate-100'
                  : 'bg-slate-300 dark:bg-slate-600 border-slate-300 dark:border-slate-600',
              ].join(' ')}
            >
              <span
                aria-hidden="true"
                className={[
                  'pointer-events-none inline-block h-3.5 w-3.5 rounded-full bg-white dark:bg-slate-900 shadow-sm ring-0 mt-px transition-transform',
                  gmailSendEnabled ? 'translate-x-4' : 'translate-x-0',
                ].join(' ')}
              />
            </button>
            <label
              htmlFor={toggleId}
              className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-snug cursor-pointer select-none"
            >
              Use my Gmail as Reply-To address for ticket notifications
            </label>
          </div>

          {/* Feedback messages */}
          {successMsg && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              role="status"
              className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
            >
              <CheckCircle2 size={16} />
              {successMsg}
            </motion.div>
          )}

          {error && (
            <motion.div
              id={errorId}
              role="alert"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2"
            >
              <ShieldAlert size={16} />
              {error}
            </motion.div>
          )}

          {/* Save button */}
          <div className="flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-extrabold text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap shrink-0"
            >
              {saving ? <Loader2 size={16} className="animate-spin shrink-0" /> : <Save size={16} className="shrink-0" />}
              {saving ? 'Saving…' : 'Save Gmail Preferences'}
            </button>
          </div>
        </form>
      )}
    </section>
  )
}
