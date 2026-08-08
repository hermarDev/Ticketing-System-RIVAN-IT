import { useState, useEffect, useCallback, useMemo, useRef } from 'react'
import {
  Ticket,
  Plus,
  Search,
  RefreshCw,
  LogOut,
  Settings,
  Clock,
  CheckCircle2,
  Headphones,
  Paperclip,
  Inbox,
  Maximize2,
  Sparkles,
  BarChart3,
  Menu,
  X,
  Bell,
  MapPin,
} from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'
import { fetchClientTickets, logoutClient, subscribeToAllTickets, subscribeToGlobalReplies, getUnreadNotificationCount, resolveClientUrgencyDisplay } from '../../lib/ticketService'
import { ClientAccountSettings } from '../auth/components/ClientAccountSettings'
import { parseAttachments } from '../../lib/attachmentUtils'
import { TicketModal } from '../inquiries/components/TicketModal'
import { FloatingThemeToggle } from '../../shared/components/FloatingThemeToggle'
import { IsolatedTicketModal } from './components/IsolatedTicketModal'
import { UrgencyBadge } from '../../shared/components/UrgencyBadge'
import { NotificationToastContainer } from '../../shared/components/NotificationToastContainer'
import { NotificationActivityDrawer } from '../../shared/components/NotificationActivityDrawer'

function getDurableTicketId(ticket) {
  if (!ticket) return null
  const id = ticket.id ?? ticket.ticketNumber ?? ticket.ticket_number
  return id != null && id !== '' ? String(id) : null
}

function ticketMatchesId(ticket, id) {
  if (!ticket || id == null || id === '') return false
  const search = String(id)
  return (
    String(ticket.id) === search ||
    String(ticket.ticketNumber) === search ||
    String(ticket.ticket_number) === search
  )
}

export function ClientDashboardPage({ clientAccount, isGoogleUser, onLogout, onUpdateAccount }) {
  const [tickets, setTickets] = useState([])
  const [loading, setLoading] = useState(true)
  // Durable open-state ID — never cleared by remote updates, only by explicit close
  const [isolatedTicketId, setIsolatedTicketId] = useState(null)
  const [isolatedTicketSnapshot, setIsolatedTicketSnapshot] = useState(null)
  const [searchQuery, setSearchQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('All') // 'All' | 'Active' | 'Resolved'
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'tickets' | 'settings'
  const [isTicketModalOpen, setIsTicketModalOpen] = useState(false)
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
  const [unreadCount, setUnreadCount] = useState(0)
  const [isNotificationDrawerOpen, setIsNotificationDrawerOpen] = useState(false)
  const [siteNudgeDismissed, setSiteNudgeDismissed] = useState(false)
  const refreshTimerRef = useRef(null)

  const needsSiteAddress = !(clientAccount?.siteAddress || '').trim()
  const showSiteAddressNudge = needsSiteAddress && !siteNudgeDismissed && activeTab !== 'settings'

  useEffect(() => {
    setSiteNudgeDismissed(false)
  }, [clientAccount?.email])

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

  const loadTickets = useCallback(async (showLoader = false) => {
    if (!clientAccount?.email) return
    if (showLoader) setLoading(true)
    try {
      const data = await fetchClientTickets(clientAccount.email)
      setTickets(data)
      // Merge fresh row into snapshot in place; never clear open ID
      setIsolatedTicketSnapshot((prev) => {
        if (!prev) return prev
        const fresh = data.find(
          (t) =>
            ticketMatchesId(t, prev.id) ||
            ticketMatchesId(t, prev.ticketNumber) ||
            ticketMatchesId(t, prev.ticket_number)
        )
        return fresh ? { ...prev, ...fresh } : prev
      })
    } catch (err) {
      console.error('Error fetching client tickets:', err)
    } finally {
      setLoading(false)
    }
  }, [clientAccount?.email])

  // Coalesce realtime + BroadcastChannel / custom-event refreshes into one refetch
  const requestTicketsRefresh = useCallback(() => {
    if (refreshTimerRef.current) return
    refreshTimerRef.current = setTimeout(() => {
      refreshTimerRef.current = null
      loadTickets(false)
    }, 120)
  }, [loadTickets])

  const openIsolatedTicket = useCallback((ticket) => {
    if (!ticket) return
    const durableId = getDurableTicketId(ticket)
    if (!durableId) return
    setIsolatedTicketId(durableId)
    setIsolatedTicketSnapshot(ticket)
  }, [])

  const closeIsolatedTicket = useCallback(() => {
    setIsolatedTicketId(null)
    setIsolatedTicketSnapshot(null)
  }, [])

  // Resolve displayed ticket from list + durable ID; fall back to snapshot chrome
  const isolatedTicket = useMemo(() => {
    if (!isolatedTicketId) return null
    const fresh = tickets.find((t) => ticketMatchesId(t, isolatedTicketId))
    if (fresh && isolatedTicketSnapshot) return { ...isolatedTicketSnapshot, ...fresh }
    if (fresh) return fresh
    return isolatedTicketSnapshot
  }, [tickets, isolatedTicketId, isolatedTicketSnapshot])

  useEffect(() => {
    loadTickets(true)

    const unsubscribeTickets = subscribeToAllTickets(() => {
      requestTicketsRefresh()
    })

    const unsubscribeReplies = subscribeToGlobalReplies(
      'client',
      clientAccount?.fullName || clientAccount?.name
    )

    const mergeOpenTicketFromPayload = (payload) => {
      if (!payload?.ticketId) return
      if (payload.priority) {
        setTickets((prev) =>
          prev.map((ticket) =>
            ticketMatchesId(ticket, payload.ticketId)
              ? { ...ticket, priority: payload.priority }
              : ticket
          )
        )
      }
      setIsolatedTicketSnapshot((prev) => {
        if (!prev) return prev
        if (
          !ticketMatchesId(prev, payload.ticketId) &&
          String(prev.ticketNumber) !== String(payload.ticketId) &&
          String(prev.ticket_number) !== String(payload.ticketId)
        ) {
          return prev
        }
        return {
          ...prev,
          ...(payload.priority ? { priority: payload.priority } : {}),
          ...(payload.status ? { status: payload.status } : {}),
          ...(payload.assignedTo !== undefined
            ? { assignedTo: payload.assignedTo, assigned_to: payload.assignedTo }
            : {}),
          ...(payload.assigned_to !== undefined
            ? { assignedTo: payload.assigned_to, assigned_to: payload.assigned_to }
            : {}),
        }
      })
    }

    const handleRealtimeUpdate = (payload) => {
      mergeOpenTicketFromPayload(payload)
      requestTicketsRefresh()
    }

    const handleCustomEvent = (e) => {
      if (e.detail) handleRealtimeUpdate(e.detail)
    }

    window.addEventListener('netops_ticket_updated', handleCustomEvent)

    let bc = null
    try {
      if ('BroadcastChannel' in window) {
        bc = new BroadcastChannel('netops_live_chat')
        bc.onmessage = (event) => {
          if (event.data && event.data.type === 'TICKET_UPDATED') {
            handleRealtimeUpdate(event.data)
          }
        }
      }
    } catch {
      // silent
    }

    return () => {
      unsubscribeTickets()
      unsubscribeReplies()
      window.removeEventListener('netops_ticket_updated', handleCustomEvent)
      if (bc) bc.close()
      if (refreshTimerRef.current) {
        clearTimeout(refreshTimerRef.current)
        refreshTimerRef.current = null
      }
    }
  }, [loadTickets, requestTicketsRefresh, clientAccount?.fullName, clientAccount?.name])

  const handleTicketCreated = (newTicket) => {
    if (!newTicket) return
    setTickets((prev) => [newTicket, ...prev.filter((t) => t.id !== newTicket.id)])
    openIsolatedTicket(newTicket)
    setIsTicketModalOpen(false)
    loadTickets(false)
  }

  // Filtered tickets logic
  const filteredTickets = useMemo(() => {
    return tickets.filter((t) => {
      const q = searchQuery.toLowerCase()
      const matchesSearch =
        t.ticketNumber?.toLowerCase().includes(q) ||
        t.subject?.toLowerCase().includes(q) ||
        t.description?.toLowerCase().includes(q) ||
        t.category?.toLowerCase().includes(q)

      const isResolved = t.status === 'Resolved' || t.status === 'Closed'
      const matchesStatus =
        statusFilter === 'All'
          ? true
          : statusFilter === 'Active'
          ? !isResolved
          : isResolved

      return matchesSearch && matchesStatus
    })
  }, [tickets, searchQuery, statusFilter])

  const handleSelectTicketGlobal = async (idOrTicket) => {
    if (!idOrTicket) return
    let target = null
    if (typeof idOrTicket === 'object' && idOrTicket !== null) {
      target = idOrTicket
    } else {
      const searchId = String(idOrTicket)
      let currentList = tickets
      target = currentList.find((t) => ticketMatchesId(t, searchId))
      if (!target) {
        currentList = await fetchClientTickets(clientAccount?.email)
        setTickets(currentList)
        target = currentList.find((t) => ticketMatchesId(t, searchId))
      }
    }

    if (target) {
      openIsolatedTicket(target)
    }
  }

  // Metrics computation
  const stats = useMemo(() => {
    const total = tickets.length
    const active = tickets.filter((t) => t.status !== 'Resolved' && t.status !== 'Closed').length
    const resolved = tickets.filter((t) => t.status === 'Resolved' || t.status === 'Closed').length
    return { total, active, resolved }
  }, [tickets])

  const handleLogout = async () => {
    await logoutClient()
    if (onLogout) onLogout()
  }

  // Helper for Status Badge styling
  const getStatusBadgeClass = (status) => {
    switch (status) {
      case 'Resolved':
      case 'Closed':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800'
      case 'In Progress':
      case 'Pending Client':
        return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
      default:
        return 'bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700'
    }
  }

  // Client-POV status labels: converts internal status names to user-friendly first-person text
  const getClientStatusLabel = (status) => {
    switch (status) {
      case 'Pending Client': return 'Awaiting Your Response'
      default: return status
    }
  }

  const navItems = [
    { id: 'overview', label: 'Overview & Metrics', icon: BarChart3 },
    { id: 'tickets', label: 'Tickets Queue', icon: Inbox, badge: stats.total },
    { id: 'notifications', label: 'Activity Logs', icon: Bell, badge: unreadCount > 0 ? unreadCount : undefined },
    { id: 'settings', label: 'My Account', icon: Settings },
  ]

  const renderSidebarContent = () => (
    <>
      <div className="p-5 border-b border-[var(--line)] bg-[var(--bg)]/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 border border-slate-200 dark:border-slate-700 flex items-center justify-center shadow-sm">
            <Headphones size={20} aria-hidden="true" />
          </span>
          <div>
            <p className="font-black text-[var(--ink)] text-sm leading-tight tracking-tight">NetOps Desk</p>
            <p className="text-[10px] text-slate-700 dark:text-slate-300 font-extrabold uppercase">Your Support Workspace</p>
          </div>
        </div>
        <button
          onClick={() => setIsMobileMenuOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-[var(--muted)] hover:text-[var(--ink)]"
        >
          <X size={18} />
        </button>
      </div>

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
                ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-sm'
                : 'text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)]'
            }`}
          >
            <span className="flex items-center gap-3">
              <Icon size={17} />
              {label}
            </span>
            {badge !== undefined && badge > 0 && (
              <span className="text-[10px] font-black bg-amber-500 text-slate-950 rounded-full px-2 py-0.5 min-w-[20px] text-center shadow-sm">
                {badge}
              </span>
            )}
          </button>
        ))}
      </nav>

      <div className="p-4 border-t border-[var(--line)] space-y-3 bg-[var(--bg)]/20">
        <div className="flex items-center gap-3 p-2.5 rounded-xl bg-[var(--bg)] border border-[var(--line)]">
          <span className="size-8 rounded-xl bg-[var(--ink)] text-[var(--accent)] flex items-center justify-center text-xs font-black uppercase shrink-0">
            {clientAccount?.fullName?.charAt(0) || 'C'}
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-xs font-black text-[var(--ink)] truncate">{clientAccount?.fullName || 'My Account'}</p>
            <p className="text-[10px] text-[var(--muted)] font-bold truncate">
              {clientAccount?.clientId || 'Account'} · {clientAccount?.companyName || 'Company'}
            </p>
          </div>
        </div>

        <button
          onClick={handleLogout}
          className="w-full flex items-center justify-center gap-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] hover:bg-rose-500/10 hover:border-rose-500/30 hover:text-rose-600 py-2.5 text-xs font-extrabold text-[var(--muted)] transition-all cursor-pointer"
        >
          <LogOut size={14} />
          Log Out
        </button>
      </div>
    </>
  )

  return (
    <div className="flex h-screen bg-[var(--bg)] text-[var(--text)] overflow-hidden font-sans transition-colors duration-200">
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

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col overflow-hidden">
        {/* Top Header */}
        <header className="shrink-0 h-16 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-between px-4 sm:px-6 shadow-sm">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 hover:border-slate-300 dark:hover:border-slate-700 transition-all"
            >
              <Menu size={18} />
            </button>
            <h1 className="text-sm font-black text-slate-900 dark:text-white capitalize tracking-tight">
              {navItems.find((n) => n.id === activeTab)?.label || 'Dashboard'}
            </h1>
          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            <button
              onClick={() => setIsNotificationDrawerOpen(true)}
              className="relative p-2 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-all shadow-xs cursor-pointer"
              title="Notifications & Activity Log"
            >
              <Bell size={18} />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 size-4 rounded-full bg-rose-500 text-white font-black text-[9px] flex items-center justify-center shadow-xs animate-pulse">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </button>

            <button
              onClick={() => setIsTicketModalOpen(true)}
              className="px-4 py-2 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-extrabold text-xs rounded-xl shadow-xs flex items-center gap-1.5 transition-all whitespace-nowrap cursor-pointer"
            >
              <Plus size={16} className="shrink-0" />
              <span>New Ticket</span>
            </button>
          </div>
        </header>

        {/* Page Tab Area */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 pb-24">
          <div className="h-full max-w-7xl mx-auto space-y-4">
            <AnimatePresence>
              {showSiteAddressNudge && (
                <motion.div
                  initial={{ opacity: 0, y: -8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  className="flex flex-wrap items-start justify-between gap-3 rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/60 p-4 text-amber-900 dark:text-amber-200 shadow-xs"
                  role="status"
                >
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <span className="grid size-9 place-items-center rounded-xl bg-amber-100 dark:bg-amber-900/50 border border-amber-200 dark:border-amber-800 shrink-0">
                      <MapPin size={16} aria-hidden="true" />
                    </span>
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm font-black tracking-tight">Add your site / installation address</p>
                      <p className="text-xs font-medium leading-relaxed text-amber-800 dark:text-amber-300">
                        Tickets need a site location for dispatch. Save it once in My Account and we will prefill it on new requests.
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={() => setActiveTab('settings')}
                      className="rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-white dark:text-slate-900 transition-all cursor-pointer"
                    >
                      Add Address
                    </button>
                    <button
                      type="button"
                      onClick={() => setSiteNudgeDismissed(true)}
                      className="rounded-lg p-2 text-amber-700 dark:text-amber-300 hover:bg-amber-100 dark:hover:bg-amber-900/40 transition-colors cursor-pointer"
                      aria-label="Dismiss site address reminder"
                    >
                      <X size={16} />
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.15 }}
              className="h-full"
            >
              {activeTab === 'settings' ? (
                <div className="p-6 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs">
                  <ClientAccountSettings
                    clientAccount={clientAccount}
                    isGoogleUser={isGoogleUser}
                    onAccountUpdated={(updated) => {
                      if (onUpdateAccount) onUpdateAccount(updated)
                    }}
                    onBack={() => setActiveTab('tickets')}
                  />
                </div>
              ) : activeTab === 'overview' ? (
                <div className="space-y-6">
                  <div className="p-6 sm:p-7 rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs flex flex-wrap items-center justify-between gap-6">
                    <div className="space-y-2 max-w-2xl">
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full border border-slate-200 dark:border-slate-700 flex items-center gap-1.5">
                          <Sparkles size={13} className="text-slate-900 dark:text-slate-100" /> YOUR SUPPORT HUB
                        </span>
                      </div>
                      <h2 className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">
                        Welcome back, {clientAccount?.fullName || 'there'}! 👋
                      </h2>
                      <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                        Track all your technical inquiries, launch live chat workspaces with your support engineers, and manage your account details cleanly.
                      </p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <button
                        onClick={() => setIsTicketModalOpen(true)}
                        className="px-5 py-3 bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:hover:bg-white text-white dark:text-slate-900 font-black text-xs sm:text-sm rounded-2xl shadow-sm flex items-center gap-2 transition-all cursor-pointer"
                      >
                        <Plus size={18} />
                        <span>New Ticket</span>
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 hover:border-slate-400 dark:hover:border-slate-600 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Total Inquiries
                        </span>
                        <span className="p-2 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                          <Ticket size={18} />
                        </span>
                      </div>
                      <div className="text-3xl sm:text-4xl font-black text-slate-950 dark:text-white tracking-tight">{stats.total}</div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-400 font-semibold">Your submitted inquiries</p>
                    </div>

                    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 hover:border-slate-400 dark:hover:border-slate-600 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Active / Open
                        </span>
                        <span className="p-2 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                          <Clock size={18} />
                        </span>
                      </div>
                      <div className="text-3xl sm:text-4xl font-black text-slate-950 dark:text-white tracking-tight flex items-center gap-2">
                        {stats.active}
                        {stats.active > 0 && <span className="size-2.5 rounded-full bg-amber-500 animate-pulse" />}
                      </div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-400 font-semibold">Your active requests</p>
                    </div>

                    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 hover:border-slate-400 dark:hover:border-slate-600 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Resolved
                        </span>
                        <span className="p-2 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                          <CheckCircle2 size={18} />
                        </span>
                      </div>
                      <div className="text-3xl sm:text-4xl font-black text-slate-950 dark:text-white tracking-tight">{stats.resolved}</div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-400 font-semibold">Your completed tickets</p>
                    </div>

                    <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2.5 hover:border-slate-400 dark:hover:border-slate-600 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Support SLA
                        </span>
                        <span className="p-2 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                          <Headphones size={18} />
                        </span>
                      </div>
                      <div className="text-3xl sm:text-4xl font-black text-slate-950 dark:text-white tracking-tight">&lt; 15m</div>
                      <p className="text-[11px] text-slate-700 dark:text-slate-400 font-semibold">Target response time</p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-6">
                  {/* Top Metric Stat Cards Grid */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2 hover:border-slate-400 dark:hover:border-slate-600 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Total Inquiries
                        </span>
                        <span className="p-1.5 sm:p-2 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                          <Ticket size={16} />
                        </span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">{stats.total}</div>
                      <p className="text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-400 font-semibold">Submitted inquiries</p>
                    </div>

                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2 hover:border-slate-400 dark:hover:border-slate-600 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Active / Open
                        </span>
                        <span className="p-1.5 sm:p-2 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                          <Clock size={16} />
                        </span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight flex items-center gap-2">
                        {stats.active}
                        {stats.active > 0 && <span className="size-2 rounded-full bg-amber-500 animate-pulse" />}
                      </div>
                      <p className="text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-400 font-semibold">Currently in progress</p>
                    </div>

                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2 hover:border-slate-400 dark:hover:border-slate-600 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Resolved
                        </span>
                        <span className="p-1.5 sm:p-2 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                          <CheckCircle2 size={16} />
                        </span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">{stats.resolved}</div>
                      <p className="text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-400 font-semibold">Successfully completed</p>
                    </div>

                    <div className="p-4 sm:p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-2 hover:border-slate-400 dark:hover:border-slate-600 transition-all">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                          Support SLA
                        </span>
                        <span className="p-1.5 sm:p-2 rounded-xl bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
                          <Headphones size={16} />
                        </span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-slate-950 dark:text-white tracking-tight">&lt; 15m</div>
                      <p className="text-[10px] sm:text-[11px] text-slate-700 dark:text-slate-400 font-semibold">Target response time</p>
                    </div>
                  </div>

                  <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-3">
                    <div className="relative">
                      <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500 dark:text-slate-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search ticket #, subject, department, or description..."
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 pl-10 pr-3 py-2.5 text-xs sm:text-sm font-bold text-slate-950 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all"
                      />
                    </div>

                    <div className="flex items-center justify-between border-t border-slate-200 dark:border-slate-800 pt-3 gap-2 overflow-x-auto pb-1 -mx-4 px-4 sm:mx-0 sm:px-0 scrollbar-hide">
                      <div className="flex items-center gap-1.5 shrink-0">
                        {[
                          { label: 'All', count: stats.total },
                          { label: 'Active', count: stats.active },
                          { label: 'Resolved', count: stats.resolved },
                        ].map((tab) => (
                          <button
                            key={tab.label}
                            onClick={() => setStatusFilter(tab.label)}
                            className={`px-3.5 py-1.5 rounded-xl text-xs font-black transition-all flex items-center gap-1.5 whitespace-nowrap ${
                              statusFilter === tab.label
                                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shadow-xs'
                                : 'text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800'
                            }`}
                          >
                            <span>{tab.label}</span>
                            <span className="px-1.5 py-0.2 rounded-md bg-slate-200/50 dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-[10px] font-extrabold">
                              {tab.count}
                            </span>
                          </button>
                        ))}
                      </div>

                      <button
                        onClick={() => loadTickets(true)}
                        className="p-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-all shrink-0 flex items-center gap-1.5 text-xs font-bold shadow-xs ml-auto"
                        title="Refresh tickets list"
                      >
                        <RefreshCw size={13} className={loading ? 'animate-spin text-slate-900 dark:text-slate-100' : ''} />
                        <span className="hidden sm:inline">Sync</span>
                      </button>
                    </div>
                  </div>

                  <div className="space-y-4">
                    {loading ? (
                      <div className="p-12 text-center border border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 text-xs sm:text-sm text-slate-700 dark:text-slate-300 font-bold">
                        Loading your inquiries...
                      </div>
                    ) : filteredTickets.length === 0 ? (
                      <div className="p-12 text-center border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-3xl bg-white dark:bg-slate-900 space-y-3">
                        <Inbox size={40} className="mx-auto text-slate-400 dark:text-slate-500" />
                        <h3 className="font-black text-base text-slate-950 dark:text-white">No inquiries found</h3>
                        <p className="text-xs sm:text-sm text-slate-700 dark:text-slate-400 max-w-sm mx-auto font-medium">
                          Submit a new ticket or adjust search/filter terms to view your inquiries.
                        </p>
                        <button
                          onClick={() => setIsTicketModalOpen(true)}
                          className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black text-xs shadow-xs hover:opacity-90 transition-all"
                        >
                          + Submit Ticket
                        </button>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                        {filteredTickets.map((t) => {
                          const attachments = parseAttachments(t.attachment)
                          const reportedUrgency = resolveClientUrgencyDisplay(t)
                          return (
                            <div
                              key={t.id}
                              role="button"
                              tabIndex={0}
                              onClick={() => openIsolatedTicket(t)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  openIsolatedTicket(t)
                                }
                              }}
                              className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-400 dark:hover:border-slate-600 shadow-xs hover:shadow-md transition-all cursor-pointer flex flex-col justify-between space-y-4 group text-left"
                            >
                              <div className="space-y-3">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <span className="font-mono text-xs font-bold text-slate-900 dark:text-slate-100 bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-md border border-slate-200 dark:border-slate-700">
                                    {t.ticketNumber}
                                  </span>
                                  <div className="flex items-center gap-1.5">
                                    <UrgencyBadge
                                      urgency={reportedUrgency}
                                      className="rounded-full text-[10px] font-black"
                                      showSuffix={false}
                                    />
                                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black border ${getStatusBadgeClass(t.status)}`}>
                                      ● {getClientStatusLabel(t.status)}
                                    </span>
                                  </div>
                                </div>

                                <h4 className="font-black text-base text-slate-950 dark:text-slate-50 group-hover:text-slate-700 dark:group-hover:text-slate-300 transition-colors leading-snug">
                                  {t.subject}
                                </h4>

                                <p className="text-xs text-slate-700 dark:text-slate-300 line-clamp-2 font-normal leading-relaxed">
                                  {t.description}
                                </p>
                              </div>

                              <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-[11px] font-medium text-slate-700 dark:text-slate-400 gap-2">
                                <span className="truncate max-w-[130px] bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 px-2 py-0.5 rounded text-[10px] font-bold border border-slate-200 dark:border-slate-700">
                                  {t.category || 'General Support'}
                                </span>

                                {attachments.length > 0 && (
                                  <span className="inline-flex items-center gap-1 text-slate-700 dark:text-slate-400 font-bold">
                                    <Paperclip size={12} /> {attachments.length}
                                  </span>
                                )}

                                <span className="inline-flex items-center gap-1 text-slate-950 dark:text-white font-black group-hover:translate-x-0.5 transition-transform ml-auto">
                                  Open Workspace <Maximize2 size={12} />
                                </span>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
          </div>
        </div>
      </main>

      <TicketModal
        account={clientAccount}
        isOpen={isTicketModalOpen}
        onClose={() => {
          setIsTicketModalOpen(false)
          loadTickets(false)
        }}
        onTicketCreated={handleTicketCreated}
      />

      <IsolatedTicketModal
        ticket={isolatedTicket}
        isOpen={Boolean(isolatedTicketId)}
        onClose={closeIsolatedTicket}
        clientAccount={clientAccount}
        onTicketUpdated={loadTickets}
      />

      <NotificationToastContainer
        onSelectTicket={(id) => handleSelectTicketGlobal(id)}
      />

      <NotificationActivityDrawer
        isOpen={isNotificationDrawerOpen}
        onClose={() => setIsNotificationDrawerOpen(false)}
        onSelectTicket={(id) => handleSelectTicketGlobal(id)}
      />

      <FloatingThemeToggle />
    </div>
  )
}
