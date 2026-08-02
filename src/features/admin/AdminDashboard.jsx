import { useState, useEffect, useCallback, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard,
  Inbox,
  Users,
  Settings,
  LogOut,
  Search,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Clock,
  UserPlus,
  Shield,
  ChevronRight,
  BarChart3,
  Headphones,
  Loader2,
  Eye,
  EyeOff,
  X,
  Filter,
  Paperclip,
  Sparkles,
  Menu,
  ArrowLeft,
  User,
  Save,
  Mail,
  Maximize2,
  Bell,
  Lock,
} from 'lucide-react'
import { fetchTickets, updateTicketStatus, updateTicketPriority, assignTicketStaff, isUUID, subscribeToAllTickets, subscribeToGlobalReplies, updateStaffProfile, createStaffAccount, changeAuthenticatedUserPassword, requestPasswordResetForEmail, setActiveTicketId, getUnreadNotificationCount, resolveClientUrgencyDisplay } from '../../lib/ticketService'
import { priorities } from '../../config/serviceOptions'
import { supabase, isSupabaseConfigured } from '../../lib/supabaseClient'
import { validateRequiredFields, isValidEmail, getPasswordValidationError, mapAuthPasswordError } from '../../lib/formValidation'
import { PasswordRequirementsChecklist } from '../../shared/components/PasswordRequirementsChecklist'
import { logger } from '../../lib/logger'
import { TicketChatThread } from '../../shared/components/TicketChatThread'
import { FloatingThemeToggle } from '../../shared/components/FloatingThemeToggle'
import { UrgencyBadge } from '../../shared/components/UrgencyBadge'
import { AdminTicketDrawer } from './components/AdminTicketDrawer'
import { NotificationToastContainer } from '../../shared/components/NotificationToastContainer'
import { NotificationActivityDrawer } from '../../shared/components/NotificationActivityDrawer'
import { openAttachment, isImageUrl, getAttachmentLabel, parseAttachments } from '../../lib/attachmentUtils'

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon, sub }) {
  return (
    <motion.div
      whileHover={{ y: -2 }}
      className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-all hover:border-slate-400 dark:hover:border-slate-600"
    >
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400">{label}</p>
          <p className="mt-2 text-3xl sm:text-4xl font-black text-slate-950 dark:text-white tracking-tight">{value}</p>
          {sub && <p className="mt-1 text-xs font-semibold text-slate-700 dark:text-slate-400">{sub}</p>}
        </div>
        <span className="rounded-xl p-3 border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-inner">
          <Icon size={22} />
        </span>
      </div>
    </motion.div>
  )
}

// ─── Priority Badge ───────────────────────────────────────────────────────────
function PriorityBadge({ priority }) {
  const map = {
    Urgent: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    High: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
    Medium: 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    Low: 'bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700',
  }
  return (
    <span className={`rounded-md px-2.5 py-0.5 text-[11px] font-black uppercase border ${map[priority] || map.Low}`}>
      {priority}
    </span>
  )
}

// ─── Status Badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }) {
  const map = {
    New: 'bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700',
    Open: 'bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700',
    'In Progress': 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    'Pending Client': 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
    Resolved: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
    Closed: 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
  }
  return (
    <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-black border ${map[status] || map.New}`}>
      ● {status}
    </span>
  )
}

// ─── Create Staff Modal ───────────────────────────────────────────────────────
function CreateStaffModal({ onClose, onSuccess }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'staff',
  })
  const [fieldErrors, setFieldErrors] = useState({})
  const [showPw, setShowPw] = useState(false)
  const [showConfirmPw, setShowConfirmPw] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const passwordsMatch = Boolean(
    form.password && form.confirmPassword && form.password === form.confirmPassword
  )
  const passwordsMismatch = Boolean(
    form.password && form.confirmPassword && form.password !== form.confirmPassword
  )

  const validate = () => {
    const requiredFields = ['firstName', 'lastName', 'email', 'password', 'confirmPassword']
    const nextErrors = validateRequiredFields(form, requiredFields)
    if (form.email && !isValidEmail(form.email)) {
      nextErrors.email = 'Enter a valid email address.'
    }
    if (form.password) {
      const passwordError = getPasswordValidationError(form.password)
      if (passwordError) nextErrors.password = passwordError
    }
    if (form.password && form.confirmPassword && form.password !== form.confirmPassword) {
      nextErrors.confirmPassword = 'Passwords do not match. Please verify.'
    }
    setFieldErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleCreate = async (e) => {
    e.preventDefault()
    setError('')
    if (!validate()) return

    setLoading(true)
    const fullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()

    try {
      const created = await createStaffAccount({
        firstName: form.firstName,
        lastName: form.lastName,
        fullName,
        email: form.email,
        password: form.password,
        role: form.role,
      })

      onSuccess(`Staff account created for ${created.fullName} (${created.role})`)
      onClose()
    } catch (err) {
      logger.error('Staff creation error:', err)
      const friendlyPasswordError = mapAuthPasswordError(err.message)
      if (friendlyPasswordError) {
        setFieldErrors((current) => ({ ...current, password: friendlyPasswordError }))
      } else {
        setError(err.message || 'Failed to create staff account.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="w-full max-w-md rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-7 shadow-[var(--shadow-deep)]"
      >
        <div className="flex items-center justify-between mb-6 border-b border-[var(--line)] pb-4">
          <div className="flex items-center gap-3">
            <span className="rounded-xl bg-slate-100 dark:bg-slate-800 p-2 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700">
              <UserPlus size={20} />
            </span>
            <div>
              <h3 className="font-extrabold text-[var(--ink)] text-lg">Create Staff Account</h3>
              <p className="text-xs text-[var(--muted)]">Add a new team member to the portal</p>
            </div>
          </div>
          <button onClick={onClose} className="text-[var(--muted)] hover:text-[var(--ink)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleCreate} className="space-y-4">
          {error && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs font-semibold text-rose-600 dark:text-rose-400">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">First Name</label>
              <input
                type="text"
                required
                autoComplete="given-name"
                value={form.firstName}
                onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                placeholder="Juan"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
              />
              {fieldErrors.firstName && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.firstName}</p>
              )}
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">Last Name</label>
              <input
                type="text"
                required
                autoComplete="family-name"
                value={form.lastName}
                onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                placeholder="Dela Cruz"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
              />
              {fieldErrors.lastName && (
                <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.lastName}</p>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">Email Address</label>
            <input
              type="email"
              required
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              placeholder="staff@netops.com"
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
            />
            {fieldErrors.email && (
              <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.email}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">Password</label>
            <div className="relative">
              <input
                type={showPw ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                placeholder="Upper, lower, number, symbol"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 pr-10 text-sm text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
                aria-describedby="staff-password-requirements"
              />
              <button
                type="button"
                onClick={() => setShowPw(!showPw)}
                aria-label={showPw ? 'Hide password' : 'Show password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)]"
              >
                {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.password && (
              <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.password}</p>
            )}
          </div>

            <PasswordRequirementsChecklist
              password={form.password}
              listId="staff-password-requirements"
            />

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold uppercase text-[var(--muted)]">Confirm Password</label>
              {passwordsMatch && (
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Passwords match</span>
              )}
              {passwordsMismatch && (
                <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Passwords do not match</span>
              )}
            </div>
            <div className="relative">
              <input
                type={showConfirmPw ? 'text' : 'password'}
                required
                autoComplete="new-password"
                value={form.confirmPassword}
                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                placeholder="Re-enter password"
                aria-invalid={passwordsMismatch}
                className={`w-full rounded-xl border bg-[var(--bg)] p-3 pr-10 text-sm text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none transition-all ${
                  passwordsMatch
                    ? 'border-emerald-500 focus:border-emerald-500'
                    : passwordsMismatch
                      ? 'border-rose-500 focus:border-rose-500'
                      : 'border-[var(--line)] focus:border-[var(--accent)]'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowConfirmPw(!showConfirmPw)}
                aria-label={showConfirmPw ? 'Hide confirm password' : 'Show confirm password'}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)]"
              >
                {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
            {fieldErrors.confirmPassword && !passwordsMismatch && (
              <p className="mt-1 text-[11px] font-semibold text-rose-600 dark:text-rose-400">{fieldErrors.confirmPassword}</p>
            )}
          </div>

          <div>
            <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">Role</label>
            <select
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
              className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] focus:outline-none focus:border-[var(--accent)] transition-all font-semibold"
            >
              <option value="staff">Staff / Engineer</option>
              <option value="admin">Admin</option>
              <option value="ceo">CEO / Executive</option>
            </select>
          </div>

          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-[var(--line)] bg-[var(--bg)] py-3 text-sm font-bold text-[var(--ink)] hover:bg-[var(--line)]/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white py-3 text-sm font-extrabold text-slate-100 dark:text-slate-900 shadow-md disabled:opacity-50 transition-all"
            >
              {loading ? <Loader2 size={16} className="animate-spin" /> : <UserPlus size={16} />}
              {loading ? 'Creating...' : 'Create Account'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}

// ─── Staff Management Tab ────────────────────────────────────────────────────
function StaffManagementTab() {
  const [staffList, setStaffList] = useState([])
  const [loading, setLoading] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')

  const loadStaff = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return
    setLoading(true)
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role, created_at')
      .in('role', ['staff', 'admin', 'ceo'])
      .order('created_at', { ascending: false })
    setStaffList(data || [])
    setLoading(false)
  }, [])

  useEffect(() => { loadStaff() }, [loadStaff])

  const roleColor = {
    ceo: 'bg-purple-500/20 text-purple-700 dark:text-purple-300 border-purple-500/40',
    admin: 'bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700',
    staff: 'bg-slate-500/20 text-slate-700 dark:text-slate-300 border-slate-500/40',
  }

  const handleSuccess = (msg) => {
    setSuccessMsg(msg)
    loadStaff()
    setTimeout(() => setSuccessMsg(''), 4000)
  }

  return (
    <div className="flex flex-col h-full space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-black text-[var(--ink)] tracking-tight">Staff Management</h2>
          <p className="text-sm font-medium text-[var(--muted)] mt-1">Manage operations desk engineers, admins, and executives</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white px-4 py-2.5 text-sm font-extrabold text-slate-100 dark:text-slate-900 shadow-md transition-all"
        >
          <UserPlus size={16} />
          New Staff Account
        </button>
      </div>

      {successMsg && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-sm font-semibold text-emerald-700 dark:text-emerald-300 flex items-center gap-2"
        >
          <CheckCircle2 size={16} />
          {successMsg}
        </motion.div>
      )}

      {!isSupabaseConfigured && (
        <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm font-semibold text-amber-700 dark:text-amber-300">
          ⚠️ Supabase is not configured. Live staff roster is unavailable in demo mode.
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={32} className="animate-spin text-slate-900 dark:text-slate-100" />
        </div>
      ) : (
        <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--line)] bg-[var(--bg)]">
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase text-[var(--muted)]">Name</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase text-[var(--muted)]">Email</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase text-[var(--muted)]">Role</th>
                  <th className="px-6 py-3.5 text-left text-xs font-bold uppercase text-[var(--muted)]">Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {staffList.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="text-center py-12 text-[var(--muted)] font-medium">
                      No staff accounts found. Click "New Staff Account" to create one.
                    </td>
                  </tr>
                ) : (
                  staffList.map((s) => (
                    <tr key={s.id} className="hover:bg-[var(--bg)]/50 transition-colors">
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-3">
                          <span className="size-9 rounded-xl bg-[var(--ink)] text-[var(--accent)] flex items-center justify-center text-xs font-extrabold uppercase shadow-sm">
                            {s.full_name?.charAt(0) || '?'}
                          </span>
                          <span className="font-bold text-[var(--ink)]">{s.full_name}</span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-[var(--text)] font-medium">{s.email}</td>
                      <td className="px-6 py-4">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold border uppercase ${roleColor[s.role] || roleColor.staff}`}>
                          {s.role}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-[var(--muted)] text-xs font-medium">
                        {s.created_at ? new Date(s.created_at).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {showCreateModal && (
        <CreateStaffModal
          onClose={() => setShowCreateModal(false)}
          onSuccess={handleSuccess}
        />
      )}
    </div>
  )
}

// ─── Tickets Queue Tab ────────────────────────────────────────────────────────
function TicketsTab({
  currentUser,
  staffList = [],
  statusFilter = 'All',
  setStatusFilter,
  searchQuery = '',
  setSearchQuery,
  selectedTicket = null,
  setSelectedTicket,
  adminDrawerTicket = null,
  setAdminDrawerTicket,
}) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const active = adminDrawerTicket?.id || selectedTicket?.id
    if (active) {
      setActiveTicketId(active)
      return () => setActiveTicketId(null)
    }
  }, [adminDrawerTicket?.id, selectedTicket?.id])

  const loadData = useCallback(async () => {
    const data = await fetchTickets()
    setTickets(data)
    setLoading(false)
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleStatusChange = async (ticketId, newStatus) => {
    await updateTicketStatus(ticketId, newStatus)
    await loadData()
    if (selectedTicket?.id === ticketId) {
      setSelectedTicket((prev) => (prev ? { ...prev, status: newStatus } : null))
    }
    if (adminDrawerTicket?.id === ticketId) {
      setAdminDrawerTicket((prev) => (prev ? { ...prev, status: newStatus } : null))
    }
  }

  const handlePriorityChange = async (ticketId, newPriority) => {
    const overrideTimestamp = new Date().toISOString()
    const previousPriority =
      (selectedTicket?.id === ticketId ? selectedTicket?.priority : null) ||
      (adminDrawerTicket?.id === ticketId ? adminDrawerTicket?.priority : null) ||
      'Medium'
    const staffIdentity = currentUser?.email || currentUser?.fullName || 'Staff'

    if (selectedTicket?.id === ticketId) {
      setSelectedTicket((prev) => (
        prev
          ? {
              ...prev,
              priority: newPriority,
              priorityUpdatedAt: overrideTimestamp,
              priority_updated_at: overrideTimestamp,
            }
          : null
      ))
    }
    if (adminDrawerTicket?.id === ticketId) {
      setAdminDrawerTicket((prev) => (
        prev
          ? {
              ...prev,
              priority: newPriority,
              priorityUpdatedAt: overrideTimestamp,
              priority_updated_at: overrideTimestamp,
            }
          : null
      ))
    }

    try {
      await updateTicketPriority(ticketId, newPriority, staffIdentity)
      const data = await fetchTickets()
      setTickets(data)
      const updated = data.find((t) => t.id === ticketId)
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) => updated || (prev ? { ...prev, priority: newPriority } : null))
      }
      if (adminDrawerTicket?.id === ticketId) {
        setAdminDrawerTicket((prev) => updated || (prev ? { ...prev, priority: newPriority } : null))
      }
    } catch (err) {
      logger.error('Failed to update priority:', err)
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) => (prev ? { ...prev, priority: previousPriority } : null))
      }
      if (adminDrawerTicket?.id === ticketId) {
        setAdminDrawerTicket((prev) => (prev ? { ...prev, priority: previousPriority } : null))
      }
    }
  }

  const handleAssignStaff = async (ticketId, staff) => {
    try {
      await assignTicketStaff(ticketId, staff || null)
      const data = await fetchTickets()
      setTickets(data)
      setLoading(false)
      const updated = data.find((t) => t.id === ticketId)
      if (selectedTicket?.id === ticketId) {
        setSelectedTicket((prev) => updated || prev)
      }
      if (adminDrawerTicket?.id === ticketId) {
        setAdminDrawerTicket((prev) => updated || prev)
      }
    } catch (err) {
      logger.error('Failed to assign staff:', err)
    }
  }

  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const matchesStatus = statusFilter === 'All' || t.status === statusFilter
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        !q ||
        t.ticketNumber?.toLowerCase().includes(q) ||
        t.clientName?.toLowerCase().includes(q) ||
        t.companyName?.toLowerCase().includes(q) ||
        t.subject?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.priority?.toLowerCase().includes(q) ||
        t.status?.toLowerCase().includes(q)
      return matchesStatus && matchesSearch
    })
  }, [tickets, statusFilter, searchQuery])

  const handleTicketClick = (t) => {
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setAdminDrawerTicket(t)
      setSelectedTicket(null)
    } else {
      setSelectedTicket(t)
      setAdminDrawerTicket(null)
    }
  }

  return (
    <div className="flex flex-col h-full gap-5">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[240px]">
          <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[var(--muted)]" />
          <input
            type="text"
            placeholder="Search ticket #, client, company..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-xl border border-[var(--line)] bg-[var(--paper)] pl-10 pr-4 py-2.5 text-sm text-[var(--ink)] placeholder-[var(--muted)] focus:outline-none focus:border-indigo-500 transition-all shadow-sm font-medium"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 max-w-full">
          <Filter size={14} className="text-[var(--muted)] shrink-0 mr-1" />
          {['All', 'New', 'In Progress', 'Pending Client', 'Resolved', 'Closed'].map((st) => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black whitespace-nowrap transition-all ${
                statusFilter === st
                  ? 'bg-slate-900 dark:bg-slate-100 text-slate-100 dark:text-slate-900 shadow-sm'
                  : 'bg-[var(--paper)] text-[var(--muted)] border border-[var(--line)] hover:text-[var(--ink)] hover:border-[var(--line-strong)]'
              }`}
            >
              {st}
            </button>
          ))}
        </div>

        <button
          onClick={loadData}
          className="p-2.5 rounded-xl border border-[var(--line)] bg-[var(--paper)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition-all shadow-sm"
          title="Refresh Queue"
        >
          <RefreshCw size={16} className={loading ? 'animate-spin text-indigo-600 dark:text-indigo-400' : ''} />
        </button>
      </div>

      {/* Split Pane */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 flex-1 min-h-[500px]">
        {/* Ticket List */}
        <div className={`lg:col-span-5 overflow-y-auto space-y-2.5 pr-1 ${selectedTicket ? 'hidden lg:block' : 'block'}`}>
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={28} className="animate-spin text-indigo-600 dark:text-indigo-400" />
            </div>
          ) : filteredTickets.length === 0 ? (
            <div className="py-16 text-center border-2 border-dashed border-[var(--line)] rounded-2xl bg-[var(--paper)] p-6">
              <Inbox className="mx-auto text-[var(--muted)] mb-3 opacity-60" size={36} />
              <p className="text-sm font-bold text-[var(--ink)]">No tickets match your filters.</p>
              <p className="text-xs text-[var(--muted)] mt-1">Try resetting the status filter or search query.</p>
            </div>
          ) : (
            filteredTickets.map((t) => (
              <motion.div
                key={t.id}
                role="button"
                tabIndex={0}
                onClick={() => handleTicketClick(t)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    handleTicketClick(t)
                  }
                }}
                whileHover={{ x: 2 }}
                className={`p-4 rounded-xl border cursor-pointer transition-all shadow-sm ${
                  selectedTicket?.id === t.id
                    ? 'border-indigo-600 bg-indigo-500/10 ring-2 ring-indigo-500/20'
                    : 'border-[var(--line)] bg-[var(--paper)] hover:border-[var(--line-strong)]'
                }`}
              >
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-mono text-xs font-black text-slate-100 bg-slate-900 dark:bg-slate-800 dark:text-slate-100 px-2 py-0.5 rounded border border-slate-900 dark:border-slate-700">{t.ticketNumber}</span>
                  <PriorityBadge priority={t.priority} />
                </div>
                <h4 className="font-extrabold text-sm text-[var(--ink)] line-clamp-1 mb-2 leading-snug">{t.subject}</h4>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-extrabold text-[var(--muted)] truncate">{t.clientName} · {t.companyName || 'Client'}</span>
                  <StatusBadge status={t.status} />
                </div>
              </motion.div>
            ))
          )}
        </div>

        {/* Admin Ticket Workspace Drawer */}
        <AdminTicketDrawer
          ticket={adminDrawerTicket}
          isOpen={Boolean(adminDrawerTicket)}
          onClose={() => {
            setAdminDrawerTicket(null)
            setSelectedTicket(null)
          }}
          currentUser={currentUser}
          onTicketUpdated={loadData}
          staffMembers={staffList}
        />

        {/* Detail Pane */}
        <div className={`lg:col-span-7 rounded-2xl border border-[var(--line)] bg-[var(--paper)] flex flex-col overflow-hidden shadow-sm ${selectedTicket ? 'block' : 'hidden lg:flex'}`}>
          <AnimatePresence mode="wait">
            {selectedTicket ? (
              <motion.div
                key={selectedTicket?.id || 'selected'}
                initial={{ opacity: 0, x: 10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -10 }}
                className="flex flex-col h-full overflow-hidden"
              >
                <div className="p-2 sm:p-3 border-b border-[var(--line)] bg-[var(--paper)] flex items-center justify-between">
                  <button
                    onClick={() => setSelectedTicket(null)}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--bg)] text-[var(--ink)] border border-[var(--line)] text-xs font-extrabold hover:border-slate-400 dark:hover:border-slate-600 transition-all cursor-pointer"
                  >
                    <ArrowLeft size={15} />
                    <span>Back to Queue</span>
                  </button>
                </div>

                {/* Ticket Header */}
                <div className="border-b border-[var(--line)] p-4 flex flex-wrap items-start justify-between gap-3 bg-[var(--bg)]/40">
                  <div className="flex items-start gap-3">
                    <button
                      onClick={() => setSelectedTicket(null)}
                      className="lg:hidden p-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] hover:border-[var(--line-strong)] transition-all shrink-0 cursor-pointer"
                      title="Back to Tickets Queue"
                    >
                      <ArrowLeft size={16} />
                    </button>
                    <div>
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-xs font-black text-slate-100 bg-slate-900 dark:bg-slate-800 dark:text-slate-100 px-2 py-0.5 rounded border border-slate-900 dark:border-slate-700">{selectedTicket?.ticketNumber || selectedTicket?.id}</span>
                        <PriorityBadge priority={selectedTicket?.priority} />
                        <UrgencyBadge
                          urgency={resolveClientUrgencyDisplay(selectedTicket)}
                          className="font-black"
                        />
                      </div>
                      <h3 className="text-base font-black text-[var(--ink)] leading-snug">{selectedTicket?.subject}</h3>
                      <p className="text-xs text-[var(--muted)] mt-0.5 font-medium">
                        Category: <strong className="text-[var(--ink)] font-bold">{selectedTicket?.category || 'General'}</strong>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <button
                      onClick={() => setAdminDrawerTicket(selectedTicket)}
                      className="p-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-[var(--line-strong)] transition-all shadow-sm flex items-center gap-1.5 text-xs font-bold cursor-pointer"
                      title="Open Full Isolated Drawer View"
                    >
                      <Maximize2 size={15} />
                      <span className="hidden xl:inline">Focus Drawer</span>
                    </button>
                    <div>
                      <label htmlFor="detail-status-select" className="block text-[10px] uppercase text-[var(--muted)] font-extrabold mb-1">Update Status</label>
                      <select
                        id="detail-status-select"
                        value={selectedTicket?.status || 'New'}
                        onChange={(e) => selectedTicket?.id && handleStatusChange(selectedTicket.id, e.target.value)}
                        className="bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] rounded-xl px-3 py-1 text-xs font-extrabold focus:outline-none focus:border-[var(--accent)] transition-all shadow-sm cursor-pointer"
                      >
                        <option value="New">New</option>
                        <option value="In Progress">In Progress</option>
                        <option value="Pending Client">Pending Client</option>
                        <option value="Resolved">Resolved</option>
                        <option value="Closed">Closed</option>
                      </select>
                    </div>

                    <div>
                      <label htmlFor="detail-priority-select" className="block text-[10px] uppercase text-[var(--muted)] font-extrabold mb-1">Priority</label>
                      <select
                        id="detail-priority-select"
                        value={selectedTicket?.priority || 'Medium'}
                        onChange={(e) => selectedTicket?.id && handlePriorityChange(selectedTicket.id, e.target.value)}
                        className="bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] rounded-xl px-3 py-1 text-xs font-extrabold focus:outline-none focus:border-[var(--accent)] transition-all shadow-sm cursor-pointer"
                      >
                        {priorities.map((prio) => (
                          <option key={prio} value={prio}>{prio}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label htmlFor="detail-staff-select" className="block text-[10px] uppercase text-[var(--muted)] font-extrabold mb-1">Assigned Staff</label>
                      <select
                        id="detail-staff-select"
                        value={selectedTicket?.assignedToId || ''}
                        onChange={(e) => {
                          if (!selectedTicket?.id) return
                          const staffId = e.target.value
                          if (!staffId) {
                            handleAssignStaff(selectedTicket.id, null)
                            return
                          }
                          const fromList = staffList.find((s) => s.id === staffId)
                          if (fromList) {
                            handleAssignStaff(selectedTicket.id, fromList)
                            return
                          }
                          if (isUUID(currentUser?.id) && currentUser.id === staffId) {
                            handleAssignStaff(selectedTicket.id, {
                              id: currentUser.id,
                              full_name: currentUser?.fullName || 'Tier-2 Engineer',
                              email: currentUser?.email,
                              role: currentUser?.role,
                            })
                            return
                          }
                          handleAssignStaff(selectedTicket.id, { id: staffId })
                        }}
                        className="bg-[var(--paper)] border border-[var(--line)] text-[var(--ink)] rounded-xl px-3 py-1 text-xs font-extrabold focus:outline-none focus:border-[var(--accent)] transition-all shadow-sm cursor-pointer"
                      >
                        <option value="">Unassigned</option>
                        {(staffList.length > 0
                          ? staffList
                          : (isUUID(currentUser?.id)
                              ? [{
                                  id: currentUser.id,
                                  full_name: currentUser?.fullName || 'Tier-2 Engineer',
                                  email: currentUser?.email,
                                  role: currentUser?.role,
                                }]
                              : [{
                                  id: 'currentUser',
                                  full_name: currentUser?.fullName || 'Tier-2 Engineer',
                                }])
                        ).map((s) => {
                          const nameVal = s.full_name || s.fullName || s.name || s.email
                          const optionValue = isUUID(s.id) ? s.id : ''
                          if (!optionValue) return null
                          return (
                            <option key={s.id || s.email || nameVal} value={optionValue}>
                              {nameVal}
                            </option>
                          )
                        })}
                      </select>
                    </div>
                  </div>
                </div>

                {/* Client Summary */}
                <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--bg)]/20">
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                    <div>
                      <span className="text-[var(--muted)] text-[10px] uppercase font-semibold">Client</span>
                      <p className="font-extrabold text-[var(--ink)] truncate">{selectedTicket?.clientName || 'Anonymous'}</p>
                    </div>
                    <div>
                      <span className="text-[var(--muted)] text-[10px] uppercase font-semibold">Company</span>
                      <p className="font-extrabold text-[var(--ink)] truncate">{selectedTicket?.companyName || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-[var(--muted)] text-[10px] uppercase font-semibold">Email</span>
                      <p className="font-extrabold text-indigo-600 dark:text-indigo-400 truncate">{selectedTicket?.email || 'N/A'}</p>
                    </div>
                    <div>
                      <span className="text-[var(--muted)] text-[10px] uppercase font-semibold">Phone</span>
                      <p className="font-extrabold text-[var(--ink)] truncate">{selectedTicket?.phone || '—'}</p>
                    </div>
                  </div>
                </div>

                {/* Description Banner */}
                <div className="px-4 py-3 border-b border-[var(--line)] bg-[var(--bg)]/10">
                  <span className="text-[10px] font-extrabold text-[var(--muted)] uppercase tracking-wider block mb-1">Inquiry Issue</span>
                  <p className="text-xs text-[var(--ink)] font-normal leading-relaxed max-h-24 overflow-y-auto">
                    {selectedTicket?.description || 'No description provided.'}
                  </p>

                  {/* Attachment Badge & Image/File Previews */}
                  {Boolean(selectedTicket?.attachment) && (
                    <div className="mt-2.5 pt-2.5 border-t border-[var(--line)]/50 space-y-2">
                      {(() => {
                        const fileList = parseAttachments(selectedTicket?.attachment)
                        if (fileList.length === 0) return null
                        return (
                          <>
                            <span className="text-[10px] font-extrabold text-[var(--muted)] uppercase block">
                              Attachments ({fileList.length}):
                            </span>
                            <div className="flex flex-wrap gap-2.5">
                              {fileList.map((fileUrl, index) => (
                                <div key={index} className="inline-block">
                                  {isImageUrl(fileUrl) ? (
                                    <div className="rounded-xl border border-[var(--line)] overflow-hidden bg-[var(--bg)] p-1.5 max-w-[200px]">
                                      <button
                                        type="button"
                                        onClick={() => openAttachment(fileUrl, `attachment-image-${index + 1}`)}
                                        className="block w-full text-left group relative cursor-pointer"
                                        title="Click to view full image in new tab"
                                      >
                                        <img
                                          src={fileUrl}
                                          alt={`Attachment ${index + 1}`}
                                          className="w-full h-28 object-contain rounded-lg group-hover:opacity-90 transition-opacity bg-black/5 dark:bg-white/5"
                                        />
                                        <div className="mt-1 flex items-center justify-between text-[10px] font-bold text-slate-700 dark:text-slate-300 px-0.5">
                                          <span className="flex items-center gap-1"><Paperclip size={11} /> Image #{index + 1}</span>
                                          <span>↗</span>
                                        </div>
                                      </button>
                                    </div>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => openAttachment(fileUrl, `attachment-file-${index + 1}`)}
                                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[var(--paper)] text-slate-800 dark:text-slate-200 border border-[var(--line)] text-xs font-bold shadow-sm hover:border-slate-400 dark:hover:border-slate-600 transition-all cursor-pointer"
                                    >
                                      <Paperclip size={14} className="shrink-0" />
                                      <span className="truncate max-w-[220px]">
                                        {getAttachmentLabel(fileUrl)}
                                      </span>
                                      <span className="text-xs">↗</span>
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          </>
                        )
                      })()}
                    </div>
                  )}
                </div>

                {/* 2-Way Live Chat Thread */}
                <div className="flex-1 p-3 overflow-hidden flex flex-col min-h-0">
                  {selectedTicket?.id && (
                    <TicketChatThread
                      ticketId={selectedTicket.id}
                      senderName={currentUser?.fullName || 'Support Engineer'}
                      senderRole={currentUser?.role || 'staff'}
                      onMessageSent={() => handleStatusChange(selectedTicket.id, 'In Progress')}
                      placeholder="Type official update or reply to client..."
                    />
                  )}
                </div>
              </motion.div>
            ) : (
              <motion.div
                key="empty"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex-1 flex flex-col items-center justify-center text-center p-8 gap-3"
              >
                <div className="size-16 rounded-2xl bg-[var(--bg)] border border-[var(--line)] flex items-center justify-center shadow-sm">
                  <Inbox className="text-[var(--muted)]" size={30} />
                </div>
                <h3 className="font-extrabold text-[var(--ink)] text-base">Select a Ticket</h3>
                <p className="text-xs text-[var(--muted)] max-w-xs leading-relaxed">
                  Choose an inquiry from the queue on the left to inspect client details and chat in real-time.
                </p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  )
}


// ─── Overview Tab ─────────────────────────────────────────────────────────────
function OverviewTab({ tickets, onNavigateToTickets, onTicketClick }) {
  const total = tickets.length
  const newCount = tickets.filter((t) => t.status === 'New').length
  const inProgress = tickets.filter((t) => t.status === 'In Progress').length
  const resolved = tickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed').length
  const urgent = tickets.filter((t) => t.priority === 'Urgent').length

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-black text-[var(--ink)] tracking-tight">Operations Command Overview</h2>
        <p className="text-sm font-medium text-[var(--muted)] mt-1">Real-time telemetry and ticket triage status</p>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div onClick={() => onNavigateToTickets && onNavigateToTickets({ status: 'All' })} className="cursor-pointer transition-transform hover:scale-[1.01]">
          <StatCard label="Total Submissions" value={total} icon={BarChart3} color="blue" sub="All inquiries" />
        </div>
        <div onClick={() => onNavigateToTickets && onNavigateToTickets({ status: 'New' })} className="cursor-pointer transition-transform hover:scale-[1.01]">
          <StatCard label="New / Triage" value={newCount} icon={Inbox} color="amber" sub="Awaiting assignment" />
        </div>
        <div onClick={() => onNavigateToTickets && onNavigateToTickets({ status: 'In Progress' })} className="cursor-pointer transition-transform hover:scale-[1.01]">
          <StatCard label="In Progress" value={inProgress} icon={Clock} color="purple" sub="Engineers assigned" />
        </div>
        <div onClick={() => onNavigateToTickets && onNavigateToTickets({ status: 'Resolved' })} className="cursor-pointer transition-transform hover:scale-[1.01]">
          <StatCard label="Resolved" value={resolved} icon={CheckCircle2} color="emerald" sub="Closed tickets" />
        </div>
      </div>

      {/* Urgent Warning Banner */}
      {urgent > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onNavigateToTickets && onNavigateToTickets({ search: 'Urgent' })}
          className="rounded-2xl border border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/15 p-5 flex items-center gap-4 shadow-sm cursor-pointer transition-all group"
        >
          <span className="size-11 rounded-xl bg-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400 shrink-0 border border-rose-500/30">
            <AlertTriangle size={24} />
          </span>
          <div className="flex-1">
            <h4 className="font-extrabold text-rose-900 dark:text-rose-200 text-sm">{urgent} Urgent Ticket{urgent > 1 ? 's' : ''} Require Immediate Attention</h4>
            <p className="text-xs text-rose-700 dark:text-rose-300 mt-0.5 font-medium">Critical issues demanding priority response from the engineering team.</p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              if (onNavigateToTickets) onNavigateToTickets({ search: 'Urgent' })
            }}
            className="text-xs font-black text-rose-700 dark:text-rose-300 flex items-center gap-1.5 group-hover:translate-x-1 transition-transform cursor-pointer px-3.5 py-2 rounded-xl bg-rose-500/15 border border-rose-500/30 hover:bg-rose-500/25"
          >
            <span>View Queue</span>
            <ChevronRight size={15} />
          </button>
        </motion.div>
      )}

      {/* Recent Submissions */}
      <div className="space-y-3">
        <h3 className="text-xs font-extrabold text-[var(--muted)] uppercase tracking-wider">Recent Client Submissions</h3>
        <div className="space-y-2.5">
          {tickets.slice(0, 5).map((t) => (
            <div
              key={t.id}
              onClick={() => onTicketClick && onTicketClick(t)}
              className="flex items-center justify-between p-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] hover:border-slate-400 dark:hover:border-slate-600 transition-all shadow-sm gap-4 cursor-pointer group"
            >
              <div className="flex items-center gap-3.5 min-w-0 flex-1">
                <span className="font-mono text-xs font-black text-slate-900 dark:text-slate-100 min-w-[140px] shrink-0 truncate bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700">
                  {t.ticketNumber}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-[var(--ink)] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">{t.subject}</p>
                  <p className="text-xs text-[var(--muted)] font-medium truncate">{t.clientName} · {t.companyName || 'Client'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <PriorityBadge priority={t.priority} />
                <StatusBadge status={t.status} />
              </div>
            </div>
          ))}
          {tickets.length === 0 && (
            <div className="py-12 text-center border-2 border-dashed border-[var(--line)] rounded-2xl bg-[var(--paper)] text-[var(--muted)] text-sm font-medium">
              No tickets submitted yet. Incoming client tickets will appear here automatically.
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Settings Tab ─────────────────────────────────────────────────────────────
function SettingsTab({ currentUser, onUpdateCurrentUser }) {
  const [firstName, setFirstName] = useState(() => currentUser?.firstName || (currentUser?.fullName ? currentUser.fullName.split(' ')[0] : ''))
  const [lastName, setLastName] = useState(() => currentUser?.lastName || (currentUser?.fullName ? currentUser.fullName.split(' ').slice(1).join(' ') : ''))
  const [companyName, setCompanyName] = useState(() => currentUser?.companyName || '')
  const [phone, setPhone] = useState(() => currentUser?.phone || '')

  const [saving, setSaving] = useState(false)
  const [successMsg, setSuccessMsg] = useState('')
  const [errorMsg, setErrorMsg] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmNewPassword, setConfirmNewPassword] = useState('')
  const [showCurrentPw, setShowCurrentPw] = useState(false)
  const [showNewPw, setShowNewPw] = useState(false)
  const [showConfirmNewPw, setShowConfirmNewPw] = useState(false)
  const [pwdSaving, setPwdSaving] = useState(false)
  const [pwdSuccessMsg, setPwdSuccessMsg] = useState('')
  const [pwdErrorMsg, setPwdErrorMsg] = useState('')
  const [resetEmailSending, setResetEmailSending] = useState(false)
  const [resetEmailSent, setResetEmailSent] = useState(false)

  const newPasswordsMatch = Boolean(
    newPassword && confirmNewPassword && newPassword === confirmNewPassword
  )
  const newPasswordsMismatch = Boolean(
    newPassword && confirmNewPassword && newPassword !== confirmNewPassword
  )

  const handlePasswordChange = async (e) => {
    e.preventDefault()
    setPwdSuccessMsg('')
    setPwdErrorMsg('')

    if (!currentPassword.trim()) {
      setPwdErrorMsg('Please enter your current password.')
      return
    }
    const passwordPolicyError = getPasswordValidationError(newPassword)
    if (passwordPolicyError) {
      setPwdErrorMsg(passwordPolicyError)
      return
    }
    if (newPassword !== confirmNewPassword) {
      setPwdErrorMsg('Passwords do not match. Please verify.')
      return
    }

    setPwdSaving(true)
    try {
      await changeAuthenticatedUserPassword({
        email: currentUser?.email,
        currentPassword,
        newPassword,
      })
      setCurrentPassword('')
      setNewPassword('')
      setConfirmNewPassword('')
      setPwdSuccessMsg('Password updated successfully.')
      setTimeout(() => setPwdSuccessMsg(''), 4000)
    } catch (err) {
      logger.error('Error changing staff password:', err)
      setPwdErrorMsg(
        mapAuthPasswordError(err.message) ||
          err.message ||
          'Failed to update password. Please try again.'
      )
    } finally {
      setPwdSaving(false)
    }
  }

  const handleForgotPasswordEmail = async () => {
    if (!currentUser?.email || !isSupabaseConfigured) return
    setResetEmailSending(true)
    setPwdErrorMsg('')
    setResetEmailSent(false)
    try {
      await requestPasswordResetForEmail(currentUser.email, typeof window !== 'undefined' ? window.location.href : undefined)
      setResetEmailSent(true)
    } catch (err) {
      setPwdErrorMsg(err.message || 'Failed to send password reset email.')
    } finally {
      setResetEmailSending(false)
    }
  }

  const handleProfileSave = async (e) => {
    e.preventDefault()
    setSaving(true)
    setSuccessMsg('')
    setErrorMsg('')

    try {
      const updated = await updateStaffProfile(currentUser.id, {
        firstName,
        lastName,
        fullName: `${firstName} ${lastName}`.trim(),
        companyName,
        phone,
      })

      const updatedUserObj = {
        ...currentUser,
        firstName: updated.firstName,
        lastName: updated.lastName,
        fullName: updated.fullName,
        companyName: updated.companyName,
        phone: updated.phone,
      }

      if (onUpdateCurrentUser) {
        onUpdateCurrentUser(updatedUserObj)
      }

      setSuccessMsg('Profile updated successfully!')
      setTimeout(() => setSuccessMsg(''), 4000)
    } catch (err) {
      logger.error('Error updating staff profile:', err)
      setErrorMsg(err.message || 'Failed to update profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h2 className="text-2xl font-black text-[var(--ink)] tracking-tight">Operations Portal Settings</h2>
        <p className="text-sm font-medium text-[var(--muted)] mt-1">Manage your account profile and view system operational status</p>
      </div>

      {/* Profile Settings Card */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3 border-b border-[var(--line)] pb-4">
          <span className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-slate-100">
            <User size={20} />
          </span>
          <div>
            <h3 className="font-extrabold text-[var(--ink)] text-base">My Staff Profile</h3>
            <p className="text-xs text-[var(--muted)] font-medium">Update your display name, contact information, and department details</p>
          </div>
        </div>

        {successMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-bold text-emerald-600 dark:text-emerald-400"
          >
            <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
            <span>{successMsg}</span>
          </motion.div>
        )}

        {errorMsg && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-bold text-rose-600 dark:text-rose-400"
          >
            <AlertTriangle size={16} className="shrink-0 text-rose-500" />
            <span>{errorMsg}</span>
          </motion.div>
        )}

        <form onSubmit={handleProfileSave} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">First Name</label>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                placeholder="First Name"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] font-medium placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">Last Name</label>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                placeholder="Last Name"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] font-medium placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">Work Email</label>
              <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)]/50 p-3 text-sm text-[var(--muted)] font-medium">
                <Mail size={16} className="shrink-0 text-[var(--muted)]" />
                <span className="truncate">{currentUser?.email}</span>
                <span className="ml-auto text-[10px] font-extrabold uppercase px-2 py-0.5 rounded bg-[var(--ink)] text-[var(--paper)] shrink-0">
                  Verified
                </span>
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">Access Role</label>
              <div className="flex items-center gap-2.5 rounded-xl border border-[var(--line)] bg-[var(--bg)]/50 p-3 text-sm text-[var(--ink)] font-bold">
                <Shield size={16} className="shrink-0 text-slate-900 dark:text-slate-100" />
                <span className="capitalize">{currentUser?.role || 'Staff Member'}</span>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">Company / Department</label>
              <input
                type="text"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="e.g. NetOps Engineering"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] font-medium placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">Phone Number</label>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+63 900 000 0000"
                className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 text-sm text-[var(--ink)] font-medium placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white active:scale-95 px-6 py-3 text-xs font-extrabold text-slate-100 dark:text-slate-900 shadow-md disabled:opacity-50 transition-all"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span>{saving ? 'Saving Profile...' : 'Save Profile Changes'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Security / Change Password */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 shadow-sm space-y-5">
        <div className="flex items-center gap-3 border-b border-[var(--line)] pb-4">
          <span className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-slate-100">
            <Lock size={20} />
          </span>
          <div>
            <h3 className="font-extrabold text-[var(--ink)] text-base">Security</h3>
            <p className="text-xs text-[var(--muted)] font-medium">Update your portal password while signed in</p>
          </div>
        </div>

        {!isSupabaseConfigured ? (
          <p className="text-sm text-[var(--muted)] font-medium">
            Password changes require Supabase Auth. Connect Supabase to enable this feature.
          </p>
        ) : (
          <>
            {pwdSuccessMsg && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs font-bold text-emerald-600 dark:text-emerald-400"
              >
                <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
                <span>{pwdSuccessMsg}</span>
              </motion.div>
            )}

            {pwdErrorMsg && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs font-bold text-rose-600 dark:text-rose-400"
              >
                <AlertTriangle size={16} className="shrink-0 text-rose-500" />
                <span>{pwdErrorMsg}</span>
              </motion.div>
            )}

            {resetEmailSent && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 rounded-xl border border-sky-500/30 bg-sky-500/10 p-3.5 text-xs font-bold text-sky-700 dark:text-sky-300"
              >
                <Mail size={16} className="shrink-0" />
                <span>
                  Check <strong className="font-extrabold">{currentUser?.email}</strong> for a password reset link.
                </span>
              </motion.div>
            )}

            <form onSubmit={handlePasswordChange} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">Current Password</label>
                <div className="relative">
                  <input
                    type={showCurrentPw ? 'text' : 'password'}
                    autoComplete="current-password"
                    value={currentPassword}
                    onChange={(e) => setCurrentPassword(e.target.value)}
                    placeholder="Enter current password"
                    className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 pr-10 text-sm text-[var(--ink)] font-medium placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrentPw(!showCurrentPw)}
                    aria-label={showCurrentPw ? 'Hide current password' : 'Show current password'}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)]"
                  >
                    {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-[var(--muted)] mb-1.5">New Password</label>
                  <div className="relative">
                    <input
                      type={showNewPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Upper, lower, number, symbol"
                      aria-describedby="staff-settings-password-requirements"
                      className="w-full rounded-xl border border-[var(--line)] bg-[var(--bg)] p-3 pr-10 text-sm text-[var(--ink)] font-medium placeholder-[var(--muted)] focus:outline-none focus:border-[var(--accent)] transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      aria-label={showNewPw ? 'Hide new password' : 'Show new password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold uppercase text-[var(--muted)]">Confirm New Password</label>
                    {newPasswordsMatch && (
                      <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">Passwords match</span>
                    )}
                    {newPasswordsMismatch && (
                      <span className="text-[10px] font-bold text-rose-600 dark:text-rose-400">Passwords do not match</span>
                    )}
                  </div>
                  <div className="relative">
                    <input
                      type={showConfirmNewPw ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={confirmNewPassword}
                      onChange={(e) => setConfirmNewPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      aria-invalid={newPasswordsMismatch}
                      className={`w-full rounded-xl border bg-[var(--bg)] p-3 pr-10 text-sm text-[var(--ink)] font-medium placeholder-[var(--muted)] focus:outline-none transition-all ${
                        newPasswordsMatch
                          ? 'border-emerald-500 focus:border-emerald-500'
                          : newPasswordsMismatch
                            ? 'border-rose-500 focus:border-rose-500'
                            : 'border-[var(--line)] focus:border-[var(--accent)]'
                      }`}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmNewPw(!showConfirmNewPw)}
                      aria-label={showConfirmNewPw ? 'Hide confirm password' : 'Show confirm password'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--muted)] hover:text-[var(--ink)]"
                    >
                      {showConfirmNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>
              </div>

              <PasswordRequirementsChecklist
                password={newPassword}
                listId="staff-settings-password-requirements"
              />

              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 pt-2">
                <button
                  type="button"
                  disabled={resetEmailSending || pwdSaving}
                  onClick={handleForgotPasswordEmail}
                  className="text-xs font-bold text-[var(--accent)] hover:underline disabled:opacity-50 text-left"
                >
                  {resetEmailSending ? 'Sending reset email…' : 'Forgot current password? Send reset email'}
                </button>
                <button
                  type="submit"
                  disabled={pwdSaving}
                  className="flex items-center justify-center gap-2 rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white active:scale-95 px-6 py-3 text-xs font-extrabold text-slate-100 dark:text-slate-900 shadow-md disabled:opacity-50 transition-all sm:ml-auto"
                >
                  {pwdSaving ? <Loader2 size={16} className="animate-spin" /> : <Lock size={16} />}
                  <span>{pwdSaving ? 'Updating Password…' : 'Update Password'}</span>
                </button>
              </div>
            </form>
          </>
        )}
      </div>

      {/* SLA & System Config Card */}
      <div className="rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-900 dark:text-slate-100">
            <Sparkles size={20} />
          </span>
          <div>
            <h3 className="font-extrabold text-[var(--ink)] text-base">Operations Desk Info</h3>
            <p className="text-xs text-[var(--muted)] font-medium">System status and live operational parameters</p>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
          <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)]">
            <span className="text-[var(--muted)] font-medium">Database Status</span>
            <p className="font-extrabold text-[var(--ink)] mt-1">
              {isSupabaseConfigured ? '🟢 Supabase PostgreSQL Active' : '🟡 Local Storage / Demo Mode'}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-[var(--bg)] border border-[var(--line)]">
            <span className="text-[var(--muted)] font-medium">Default Ticket Priority SLA</span>
            <p className="font-extrabold text-[var(--ink)] mt-1">Urgent: 1h · High: 4h · Medium: 24h</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// ─── Main Admin Dashboard Component ───────────────────────────────────────────
export function AdminDashboard({ currentUser, onUpdateCurrentUser, onClose }) {
  const [activeTab, setActiveTab] = useState('overview')
  const [tickets, setTickets] = useState([])
  const [staffList, setStaffList] = useState([])
  const [loadingTickets, setLoadingTickets] = useState(true)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [queueStatusFilter, setQueueStatusFilter] = useState('All')
  const [queueSearchQuery, setQueueSearchQuery] = useState('')
  const [queueSelectedTicket, setQueueSelectedTicket] = useState(null)
  const [queueDrawerTicket, setQueueDrawerTicket] = useState(null)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false)

  const refreshUnreadCount = useCallback(() => {
    setUnreadCount(getUnreadNotificationCount())
  }, [])

  useEffect(() => {
    refreshUnreadCount()
    window.addEventListener('netops_notification_log_updated', refreshUnreadCount)
    window.addEventListener('netops_notification_received', refreshUnreadCount)
    return () => {
      window.removeEventListener('netops_notification_log_updated', refreshUnreadCount)
      window.removeEventListener('netops_notification_received', refreshUnreadCount)
    }
  }, [refreshUnreadCount])

  const loadTickets = useCallback(async () => {
    setLoadingTickets(true)
    const data = await fetchTickets()
    setTickets(data)
    setLoadingTickets(false)
  }, [])

  const loadStaffMembers = useCallback(async () => {
    if (!isSupabaseConfigured || !supabase) return
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name, email, role')
      .in('role', ['staff', 'admin', 'ceo'])
    setStaffList(data || [])
  }, [])

  useEffect(() => {
    loadTickets()
    loadStaffMembers()

    const unsubscribeTickets = subscribeToAllTickets(() => {
      loadTickets()
    })

    const unsubscribeReplies = subscribeToGlobalReplies(currentUser?.role || 'staff')

    return () => {
      unsubscribeTickets()
      unsubscribeReplies()
    }
  }, [loadTickets, loadStaffMembers, currentUser?.role])

  const handleSelectTicketGlobal = async (idOrTicket) => {
    if (!idOrTicket) return
    let target = null
    if (typeof idOrTicket === 'object' && idOrTicket !== null) {
      target = idOrTicket
    } else {
      const searchId = String(idOrTicket)
      let currentList = tickets
      target = currentList.find(
        (t) => String(t.id) === searchId ||
               String(t.ticketNumber) === searchId ||
               String(t.ticket_number) === searchId
      )
    }

    if (target) {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        setQueueDrawerTicket(target)
        setQueueSelectedTicket(null)
      } else {
        setQueueSelectedTicket(target)
        setQueueDrawerTicket(null)
      }

      if (queueStatusFilter !== 'All' && target.status !== queueStatusFilter) {
        setQueueStatusFilter('All')
      }

      setActiveTab('tickets')
    }
  }

  const navItems = [
    { id: 'overview', label: 'Overview', icon: LayoutDashboard },
    { id: 'tickets', label: 'Tickets Queue', icon: Inbox, badge: tickets.filter((t) => t.status === 'New' || t.status === 'Open').length },
    { id: 'notifications', label: 'Activity Logs', icon: Bell, badge: unreadCount > 0 ? unreadCount : undefined },
    { id: 'staff', label: 'Staff Roster', icon: Users },
    { id: 'settings', label: 'Settings', icon: Settings },
  ]

  const roleLabel = {
    ceo: 'CEO / Executive',
    admin: 'Administrator',
    staff: 'Support Engineer',
  }

  const renderSidebarContent = () => (
        <>
          {/* Logo */}
          <div className="p-5 border-b border-[var(--line)] bg-[var(--bg)]/30 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="size-10 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
                <Headphones size={20} aria-hidden="true" />
              </span>
              <div>
                <p className="font-black text-[var(--ink)] text-sm leading-tight tracking-tight">NetOps Desk</p>
                <p className="text-[10px] text-slate-700 dark:text-slate-300 font-extrabold">Operations Portal</p>
              </div>
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(false)}
              className="lg:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--ink)]"
            >
              <X size={18} />
            </button>
          </div>

          {/* Nav Links */}
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {navItems.map(({ id, label, icon: Icon, badge }) => (
              <button
                key={id}
                onClick={() => {
                  if (id === 'notifications') {
                    setIsNotificationDrawerOpen(true)
                  } else {
                    setActiveTab(id)
                  }
                  setIsMobileMenuOpen(false)
                }}
                className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl text-sm font-extrabold transition-all cursor-pointer ${
                  activeTab === id
                    ? 'bg-slate-900 dark:bg-slate-100 text-slate-100 dark:text-slate-900 shadow-sm'
                    : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]'
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon size={17} />
                  {label}
                </span>
                {badge > 0 && (
                  <span className="text-[10px] font-black bg-amber-500 text-slate-950 rounded-full px-2 py-0.5 min-w-[20px] text-center shadow-sm">
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          {/* User Card & Logout */}
          <div className="p-4 border-t border-[var(--line)] space-y-3 bg-[var(--bg)]/20">
            {isSupabaseConfigured ? (
              <div className="flex items-center gap-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
                <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
                <span className="text-xs text-emerald-700 dark:text-emerald-300 font-extrabold">Supabase Connected</span>
              </div>
            ) : (
              <div className="flex items-center gap-2 rounded-xl bg-amber-500/10 border border-amber-500/20 px-3 py-2">
                <span className="size-2 rounded-full bg-amber-500" />
                <span className="text-xs text-amber-700 dark:text-amber-300 font-extrabold">Demo Mode</span>
              </div>
            )}

            <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg)] border border-[var(--line)]">
              <span className="size-8 rounded-xl bg-[var(--ink)] text-[var(--accent)] flex items-center justify-center text-xs font-black uppercase shrink-0">
                {currentUser?.fullName?.charAt(0) || '?'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black text-[var(--ink)] truncate">{currentUser?.fullName || 'Staff Member'}</p>
                <p className="text-[10px] text-[var(--muted)] font-bold truncate">{roleLabel[currentUser?.role] || currentUser?.role}</p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-600 py-2.5 text-xs font-extrabold text-[var(--muted)] transition-all cursor-pointer"
            >
              <LogOut size={14} />
              Sign Out
            </button>
          </div>
        </>
      )

  return (
    <div className="flex h-screen bg-[var(--bg)] text-[var(--text)] overflow-hidden transition-colors duration-200">
      {/* Desktop Static Sidebar */}
      <aside className="hidden lg:flex w-64 shrink-0 border-r border-[var(--line)] bg-[var(--paper)] flex-col shadow-sm">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Responsive Drawer Overlay */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <div className="fixed inset-0 z-50 lg:hidden flex">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            />
            <motion.aside
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="relative z-10 w-72 max-w-[85vw] bg-[var(--paper)] border-r border-[var(--line)] flex flex-col h-full shadow-2xl"
            >
              {renderSidebarContent()}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* ── Main Content Area ── */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="shrink-0 h-16 border-b border-[var(--line)] bg-[var(--paper)] flex items-center justify-between px-4 sm:px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] hover:border-[var(--line-strong)] transition-all"
              title="Open Navigation Menu"
            >
              <Menu size={18} />
            </button>
            <h1 className="text-sm font-black text-[var(--ink)] capitalize tracking-tight">
              {navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setIsNotificationDrawerOpen(true)}
              className="relative p-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--ink)] hover:border-slate-400 dark:hover:border-slate-600 transition-colors cursor-pointer"
              title="Notifications & Activity Log"
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-rose-500 text-white font-black text-[9px] flex items-center justify-center shadow-xs animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={loadTickets}
              className="text-[var(--muted)] hover:text-[var(--ink)] p-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:border-slate-400 dark:hover:border-slate-600 transition-colors cursor-pointer"
              title="Refresh Data"
            >
              <RefreshCw size={15} className={loadingTickets ? 'animate-spin text-slate-900 dark:text-slate-100' : ''} />
            </button>

            <div className="hidden sm:flex items-center gap-2 text-xs text-[var(--ink)] bg-[var(--bg)] border border-[var(--line)] rounded-xl px-3 py-1.5 font-bold shadow-sm">
              <Shield size={13} className="text-amber-600 dark:text-amber-400" />
              <span>{roleLabel[currentUser?.role] || 'Staff'}</span>
            </div>
          </div>
        </header>

        {/* Page Tab Area */}
        <div className="flex-1 overflow-y-auto p-3 pb-24 sm:p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {activeTab === 'overview' && (
                <OverviewTab
                  tickets={tickets}
                  onNavigateToTickets={({ status, search }) => {
                    if (status) setQueueStatusFilter(status)
                    if (search !== undefined) setQueueSearchQuery(search)
                    setQueueDrawerTicket(null)
                    setQueueSelectedTicket(null)
                    setActiveTab('tickets')
                  }}
                  onTicketClick={(t) => handleSelectTicketGlobal(t)}
                />
              )}
              {activeTab === 'tickets' && (
                <TicketsTab
                  currentUser={currentUser}
                  staffList={staffList}
                  statusFilter={queueStatusFilter}
                  setStatusFilter={setQueueStatusFilter}
                  searchQuery={queueSearchQuery}
                  setSearchQuery={setQueueSearchQuery}
                  selectedTicket={queueSelectedTicket}
                  setSelectedTicket={setQueueSelectedTicket}
                  adminDrawerTicket={queueDrawerTicket}
                  setAdminDrawerTicket={setQueueDrawerTicket}
                />
              )}
              {activeTab === 'staff' && <StaffManagementTab currentUser={currentUser} />}
              {activeTab === 'settings' && <SettingsTab currentUser={currentUser} onUpdateCurrentUser={onUpdateCurrentUser} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>

      <NotificationToastContainer
        onSelectTicket={(id) => handleSelectTicketGlobal(id)}
      />

      <NotificationActivityDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        onSelectTicket={(id) => handleSelectTicketGlobal(id)}
      />

      {/* Global Bottom-Right Floating Theme Toggle */}
      <FloatingThemeToggle />
    </div>
  )
}
