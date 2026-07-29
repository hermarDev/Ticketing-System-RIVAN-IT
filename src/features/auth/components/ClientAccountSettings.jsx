import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { User, Building2, Mail, Phone, MapPin, Loader2, CheckCircle2, ShieldAlert, KeyRound, Save } from 'lucide-react'
import { updateClientAccount } from '../../../lib/ticketService'
import { isValidPhPhone } from '../../../lib/formValidation'

export function ClientAccountSettings({ clientAccount, onAccountUpdated, onBack }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    companyName: '',
    email: '',
    phone: '',
    siteAddress: '',
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  useEffect(() => {
    if (clientAccount) {
      setForm({
        firstName: clientAccount.firstName || (clientAccount.fullName ? clientAccount.fullName.split(' ')[0] : ''),
        lastName: clientAccount.lastName || (clientAccount.fullName ? clientAccount.fullName.split(' ').slice(1).join(' ') : ''),
        companyName: clientAccount.companyName || clientAccount.company || '',
        email: clientAccount.email || '',
        phone: clientAccount.phone || '',
        siteAddress: clientAccount.siteAddress || '',
      })
    }
  }, [clientAccount])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setSuccessMsg('')

    if (form.phone && !isValidPhPhone(form.phone)) {
      setError('Contact number must be an 11-digit PH mobile number starting with 09 (e.g. 09171234567).')
      return
    }

    setLoading(true)
    try {
      const updated = await updateClientAccount(clientAccount.email, {
        firstName: form.firstName,
        lastName: form.lastName,
        fullName: `${form.firstName.trim()} ${form.lastName.trim()}`,
        companyName: form.companyName,
        phone: form.phone,
        siteAddress: form.siteAddress,
      })

      setSuccessMsg('Your account profile has been updated successfully!')
      if (onAccountUpdated) {
        onAccountUpdated(updated)
      }
    } catch (err) {
      setError(err.message || 'Failed to update profile settings.')
    } finally {
      setLoading(false)
    }
  }

  const isGoogleUser = form.companyName === 'Google User' || !clientAccount?.phone

  return (
    <div className="space-y-5">
      {/* Header Info Banner */}
      <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[10px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-400">
            ACCOUNT PROFILE CREDENTIALS
          </span>
          <h4 className="text-base font-extrabold text-slate-950 dark:text-white">Client Account Settings</h4>
          <p className="text-xs text-slate-700 dark:text-slate-400 font-medium">
            Update your contact details, company information, and installation address
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <span className="font-mono text-xs font-black bg-white dark:bg-slate-900 text-slate-950 dark:text-white px-2.5 py-1 rounded-lg border border-slate-200 dark:border-slate-800 shadow-xs">
            {clientAccount?.clientId || clientAccount?.id || 'CLIENT'}
          </span>
          <span className="text-[10px] font-bold text-slate-700 dark:text-slate-400 flex items-center gap-1">
            <KeyRound size={11} /> {isGoogleUser ? 'Google OAuth Session' : 'Verified Client Profile'}
          </span>
        </div>
      </div>

      {isGoogleUser && (
        <div className="p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 text-xs font-semibold text-amber-800 dark:text-amber-300">
          💡 <strong>Tip for Google Users:</strong> Please update your Company Name, Contact Number, and Site Address below so our engineers can assist you smoothly when opening tickets!
        </div>
      )}

      {/* Notifications */}
      {successMsg && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/60 text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-2"
        >
          <CheckCircle2 size={16} />
          {successMsg}
        </motion.div>
      )}

      {error && (
        <motion.div
          initial={{ opacity: 0, y: -6 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-3.5 rounded-xl border border-rose-200 dark:border-rose-800 bg-rose-50 dark:bg-rose-950/60 text-xs font-bold text-rose-700 dark:text-rose-300 flex items-center gap-2"
        >
          <ShieldAlert size={16} />
          {error}
        </motion.div>
      )}

      {/* Profile Form */}
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* First & Last Name */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1.5">First Name</label>
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                required
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-3 py-2.5 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1.5">Last Name</label>
            <div className="relative">
              <User size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                required
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-3 py-2.5 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all shadow-xs"
              />
            </div>
          </div>
        </div>

        {/* Company & Phone */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1.5">Company / Organization</label>
            <div className="relative">
              <Building2 size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="text"
                required
                value={form.companyName}
                onChange={(e) => setForm({ ...form, companyName: e.target.value })}
                placeholder="e.g. Acme Telecom"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-3 py-2.5 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all shadow-xs"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1.5">Contact Number (PH Mobile)</label>
            <div className="relative">
              <Phone size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              <input
                type="tel"
                maxLength={11}
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                placeholder="09171234567"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-3 py-2.5 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all shadow-xs"
              />
            </div>
          </div>
        </div>

        {/* Email Address (Disabled) */}
        <div>
          <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1.5">Email Address</label>
          <div className="relative">
            <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input
              type="email"
              disabled
              value={form.email}
              className="w-full rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-950 pl-10 pr-3 py-2.5 text-xs font-bold text-slate-500 dark:text-slate-400 cursor-not-allowed"
            />
          </div>
        </div>

        {/* Site / Installation Address */}
        <div>
          <label className="block text-xs font-bold uppercase text-slate-700 dark:text-slate-300 mb-1.5">Site / Installation Address</label>
          <div className="relative">
            <MapPin size={16} className="absolute left-3.5 top-3.5 text-slate-400 pointer-events-none" />
            <textarea
              rows={2}
              value={form.siteAddress}
              onChange={(e) => setForm({ ...form, siteAddress: e.target.value })}
              placeholder="Facility address, building floor, street, city, province"
              className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 pl-10 pr-3 py-2.5 text-xs font-medium text-slate-950 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all resize-none shadow-xs"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2.5 sm:gap-3 pt-3">
          {onBack && (
            <button
              type="button"
              onClick={onBack}
              className="w-full sm:w-auto flex items-center justify-center px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all whitespace-nowrap shrink-0"
            >
              Back
            </button>
          )}
          <button
            type="submit"
            disabled={loading}
            className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-extrabold text-xs shadow-md disabled:opacity-50 transition-all cursor-pointer whitespace-nowrap shrink-0"
          >
            {loading ? <Loader2 size={16} className="animate-spin shrink-0" /> : <Save size={16} className="shrink-0" />}
            {loading ? 'Saving...' : 'Save Profile Changes'}
          </button>
        </div>
      </form>
    </div>
  )
}
