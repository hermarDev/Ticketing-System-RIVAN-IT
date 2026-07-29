import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ArrowLeft,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Paperclip,
  Calendar,
  Building,
  User,
  ShieldCheck,
  ExternalLink,
  Sparkles,
  Check,
  Copy,
  ChevronDown,
  MapPin,
} from 'lucide-react'
import { TicketChatThread } from '../../../shared/components/TicketChatThread'
import { openAttachment, isImageUrl, getAttachmentLabel, parseAttachments } from '../../../lib/attachmentUtils'
import { updateTicketStatus, assignTicketStaff, setActiveTicketId } from '../../../lib/ticketService'
import { parseSiteFromTicketDescription, buildGoogleMapsUrl } from '../../../lib/locationService'

export function AdminTicketDrawer({
  ticket,
  isOpen,
  onClose,
  currentUser,
  onTicketUpdated,
  staffMembers = [],
}) {
  const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'overview' | 'timeline'
  const [copied, setCopied] = useState(false)
  const [updatingStatus, setUpdatingStatus] = useState(false)
  const [selectedStatus, setSelectedStatus] = useState(ticket?.status === 'Open' ? 'New' : (ticket?.status || 'New'))
  const [assignedStaff, setAssignedStaff] = useState(ticket?.assignedTo || ticket?.assigned_to || '')
  const [assignedStaffId, setAssignedStaffId] = useState(ticket?.assignedToId || null)
  const [assignError, setAssignError] = useState('')
  const [isStatusMenuOpen, setIsStatusMenuOpen] = useState(false)
  const [isStaffMenuOpen, setIsStaffMenuOpen] = useState(false)
  const ticketId = ticket?.id || ticket?.ticketNumber || ticket?.ticket_number || null

  useEffect(() => {
    if (ticket) {
      const raw = ticket.status || 'New'
      setSelectedStatus(raw === 'Open' ? 'New' : raw)
      setAssignedStaff(ticket.assignedTo || ticket.assigned_to || '')
      setAssignedStaffId(ticket.assignedToId || null)
      setAssignError('')
    }
  }, [ticket])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key !== 'Escape' || !isOpen) return
      if (isStatusMenuOpen) {
        setIsStatusMenuOpen(false)
        return
      }
      if (isStaffMenuOpen) {
        setIsStaffMenuOpen(false)
        return
      }
      onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose, isStatusMenuOpen, isStaffMenuOpen])

  useEffect(() => {
    if (isOpen && ticketId) {
      setActiveTicketId(ticketId)
      return () => setActiveTicketId(null)
    }
  }, [isOpen, ticketId])

  if (!isOpen || !ticket) return null

  const fileAttachments = parseAttachments(ticket?.attachment)
  const parsedDescription = parseSiteFromTicketDescription(ticket?.description || '')
  const siteLocation = parsedDescription.site
  const hasDescriptionTags = Boolean(parsedDescription.site || parsedDescription.product)
  const descriptionBody = hasDescriptionTags
    ? (parsedDescription.body || 'No additional description provided.')
    : (ticket?.description || 'No detailed description provided.')
  const siteMapsUrl = siteLocation
    ? buildGoogleMapsUrl({ address: siteLocation })
    : null

  const handleCopyTicketId = () => {
    navigator.clipboard.writeText(ticket.ticketNumber || ticket.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const handleStatusChange = async (newStatus) => {
    try {
      setUpdatingStatus(true)
      setSelectedStatus(newStatus)
      await updateTicketStatus(ticket.id, newStatus, `Status updated to ${newStatus} by ${currentUser?.fullName || 'Staff'}`)
      if (onTicketUpdated) onTicketUpdated()
    } catch (err) {
      console.error('Failed to update status:', err)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const getStaffLabel = (staff) => {
    if (!staff) return ''
    return staff.full_name || staff.fullName || staff.name || staff.email || ''
  }

  const isStaffSelected = (staff) => {
    if (!staff) return !assignedStaff && !assignedStaffId
    const staffId = staff.id && staff.id !== 'currentUser' ? staff.id : null
    if (assignedStaffId && staffId) return assignedStaffId === staffId
    const label = getStaffLabel(staff)
    return Boolean(assignedStaff) && assignedStaff === label
  }

  const handleAssignStaff = async (staff) => {
    const previousName = assignedStaff
    const previousId = assignedStaffId
    const nextName = staff ? getStaffLabel(staff) : ''
    const nextId = staff?.id && staff.id !== 'currentUser' ? staff.id : null

    try {
      setUpdatingStatus(true)
      setAssignError('')
      setAssignedStaff(nextName)
      setAssignedStaffId(nextId)
      await assignTicketStaff(ticket.id, staff || null)
      if (onTicketUpdated) await onTicketUpdated()
    } catch (err) {
      console.error('Failed to assign staff:', err)
      setAssignedStaff(previousName)
      setAssignedStaffId(previousId)
      setAssignError(err?.message || 'Failed to assign staff. Please try again.')
    } finally {
      setUpdatingStatus(false)
    }
  }

  // Helper for Status Badge
  const getStatusBadge = (status) => {
    const norm = status === 'Open' ? 'New' : (status || 'New')
    switch (norm) {
      case 'Resolved':
      case 'Closed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
            <CheckCircle2 size={13} /> {norm}
          </span>
        )
      case 'In Progress':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800">
            <Clock size={13} className="animate-spin" /> In Progress
          </span>
        )
      case 'Pending Client':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/60 dark:text-sky-300 dark:border-sky-800">
            <Clock size={13} /> Pending Client
          </span>
        )
      case 'New':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200 dark:bg-indigo-950/60 dark:text-indigo-300 dark:border-indigo-800">
            <Sparkles size={13} /> New
          </span>
        )
      default:
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700">
            <AlertCircle size={13} /> {norm}
          </span>
        )
    }
  }

  // Helper for Status Dot
  const getStatusDot = (status) => {
    switch (status) {
      case 'Resolved':
      case 'Closed':
        return 'bg-emerald-500'
      case 'In Progress':
        return 'bg-amber-500'
      case 'Pending Client':
        return 'bg-sky-500'
      case 'New':
      case 'Open':
      default:
        return 'bg-slate-500'
    }
  }

  // Helper for Priority Badge
  const getPriorityBadge = (priority) => {
    const prio = priority || 'Medium'
    let colorClass = 'bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700'
    if (prio === 'High' || prio === 'Urgent') {
      colorClass = 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
    }
    return (
      <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold uppercase border ${colorClass}`}>
        {prio} Priority
      </span>
    )
  }

  // Calculate progress step index (1–4). Current step is active, not completed.
  const getTimelineStep = () => {
    if (ticket?.status === 'Resolved' || ticket?.status === 'Closed') return 4
    if (ticket?.status === 'In Progress' || ticket?.status === 'Pending Client') return 3
    if (ticket?.assignedTo || ticket?.assigned_to) return 2
    return 1
  }

  const currentStep = getTimelineStep()
  const isTerminalStatus = ticket?.status === 'Resolved' || ticket?.status === 'Closed'
  const STATUS_OPTIONS = ['New', 'In Progress', 'Pending Client', 'Resolved', 'Closed']

  return (
    <AnimatePresence>
      <motion.div
        key={ticket.id || 'isolated-modal'}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6 overflow-hidden bg-slate-950/80 backdrop-blur-md"
        >
          {/* Animated Dialog Box */}
          <motion.div
            initial={{ opacity: 0, scale: 0.96, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 15 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full h-full max-w-full sm:max-w-5xl bg-white dark:bg-slate-900 sm:border border-slate-200 dark:border-slate-800 sm:rounded-3xl sm:shadow-2xl flex flex-col sm:h-auto sm:max-h-[92vh] sm:my-auto text-slate-950 dark:text-white"
          >
          {/* Top Admin Header */}
          <div className="px-3 sm:px-7 py-3 sm:py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shrink-0">
            {/* Mobile Top Navigation & Status Row */}
            <div className="flex items-center justify-between w-full sm:hidden">
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-extrabold text-xs border border-slate-200 dark:border-slate-700 shadow-xs shrink-0"
                title="Back to Queue"
              >
                <ArrowLeft size={15} />
                <span>Back to Queue</span>
              </button>
              <div>{getStatusBadge(selectedStatus)}</div>
            </div>

            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              <div className="hidden sm:grid size-11 place-items-center rounded-2xl bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-950 shadow-xs shrink-0">
                <ShieldCheck size={22} />
              </div>

              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1 sm:mb-0">
                  <span className="font-mono text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider">
                    <span className="hidden sm:inline">ADMIN WORKSPACE — </span>{ticket?.ticketNumber || ticket?.id}
                  </span>
                  <button
                    onClick={handleCopyTicketId}
                    className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors rounded"
                    title="Copy Ticket Reference"
                  >
                    {copied ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={13} />}
                  </button>
                  {getPriorityBadge(ticket?.priority)}
                </div>
                <h2 className="text-base sm:text-lg font-black text-slate-950 dark:text-white line-clamp-1 leading-snug">
                  {ticket?.subject}
                </h2>
              </div>
            </div>

            {/* Right Header Status & Close */}
            <div className="hidden sm:flex items-center gap-2 sm:gap-3 shrink-0">
              <div>{getStatusBadge(selectedStatus)}</div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-all"
                title="Close Admin Workspace (Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Quick Operations Bar (Custom Framer Motion Dropdowns) */}
          <div className="px-3 sm:px-7 py-2 sm:py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shrink-0">
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row sm:items-center sm:justify-between w-full relative">
              {(isStatusMenuOpen || isStaffMenuOpen) && (
                <div 
                  className="fixed inset-0 z-40" 
                  onClick={() => {
                    setIsStatusMenuOpen(false)
                    setIsStaffMenuOpen(false)
                  }} 
                />
              )}
              {/* Left Status Dropdown */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 z-50">
                <span className="text-[10px] sm:text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  Status:
                </span>
                <div className="relative">
                  <button
                    onClick={() => {
                      setIsStaffMenuOpen(false)
                      setIsStatusMenuOpen(!isStatusMenuOpen)
                    }}
                    disabled={updatingStatus}
                    className="flex items-center justify-between w-full sm:w-auto min-w-[160px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 sm:py-1.5 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all shadow-inner"
                  >
                    <div className="flex items-center gap-2">
                      <span className={`w-2 h-2 rounded-full ${getStatusDot(selectedStatus)}`} />
                      {selectedStatus}
                    </div>
                    <ChevronDown size={14} className="text-slate-500 ml-2" />
                  </button>
                  
                  <AnimatePresence>
                    {isStatusMenuOpen && (
                      <motion.div
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 mt-1 w-full min-w-[140px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 p-1.5 space-y-1"
                      >
                        {STATUS_OPTIONS.map(st => (
                          <button
                            key={st}
                            onClick={() => {
                              handleStatusChange(st)
                              setIsStatusMenuOpen(false)
                            }}
                            className={`w-full text-left flex items-center justify-between px-2.5 py-2 text-xs font-bold rounded-xl transition-colors ${
                              selectedStatus === st
                                ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className={`w-2 h-2 rounded-full ${getStatusDot(st)}`} />
                              {st}
                            </div>
                            {selectedStatus === st && <Check size={12} className="text-slate-900 dark:text-white" />}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Right Engineer Assignment Selector */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-2 z-50">
                <span className="text-[10px] sm:text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wider">
                  Staff:
                </span>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => {
                      setIsStatusMenuOpen(false)
                      setIsStaffMenuOpen(!isStaffMenuOpen)
                    }}
                    disabled={updatingStatus}
                    aria-haspopup="listbox"
                    aria-expanded={isStaffMenuOpen}
                    className="flex items-center justify-between w-full sm:w-auto min-w-[160px] rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3 py-2 sm:py-1.5 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all shadow-inner"
                  >
                    <div className="flex items-center gap-2 truncate">
                      <User size={14} className="text-slate-500 shrink-0" />
                      <span className="truncate">{assignedStaff || 'Unassigned'}</span>
                    </div>
                    <ChevronDown size={14} className="text-slate-500 shrink-0 ml-2" />
                  </button>
                  
                  <AnimatePresence>
                    {isStaffMenuOpen && (
                      <motion.div
                        role="listbox"
                        initial={{ opacity: 0, y: -5 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute top-full left-0 sm:right-0 sm:left-auto mt-1 w-full sm:w-[220px] bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-xl z-50 p-1.5 space-y-1 max-h-60 overflow-y-auto"
                      >
                        <button
                          type="button"
                          role="option"
                          aria-selected={isStaffSelected(null)}
                          onClick={() => {
                            handleAssignStaff(null)
                            setIsStaffMenuOpen(false)
                          }}
                          className={`w-full text-left flex items-center justify-between px-2.5 py-2 text-xs font-bold rounded-xl transition-colors ${
                            isStaffSelected(null)
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                              : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                          }`}
                        >
                          <span className="truncate">Unassigned</span>
                          {isStaffSelected(null) && <Check size={12} className="text-slate-900 dark:text-white shrink-0" />}
                        </button>
                        
                        {(staffMembers.length > 0 ? staffMembers : [{
                            id: currentUser?.id || 'currentUser',
                            full_name: currentUser?.fullName || 'Tier-2 Engineer',
                            email: currentUser?.email,
                            role: 'You',
                        }]).map((s, idx) => {
                          const val = getStaffLabel(s)
                          const selected = isStaffSelected(s)
                          const roleLabel = s.role === 'You' ? '(You)' : `(${s.role || 'Staff'})`
                          return (
                            <button
                              type="button"
                              role="option"
                              aria-selected={selected}
                              key={s.id || s.email || s.full_name || s.fullName || idx}
                              onClick={() => {
                                handleAssignStaff(s)
                                setIsStaffMenuOpen(false)
                              }}
                              className={`w-full text-left flex items-center justify-between px-2.5 py-2 text-xs font-bold rounded-xl transition-colors ${
                                selected
                                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                              }`}
                            >
                              <div className="flex flex-col truncate pr-2">
                                <span className="truncate">{val} <span className="opacity-70 font-medium">{roleLabel}</span></span>
                              </div>
                              {selected && <Check size={12} className="text-slate-900 dark:text-white shrink-0" />}
                            </button>
                          )
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </div>
            {assignError && (
              <p className="mt-2 text-[11px] font-semibold text-rose-600 dark:text-rose-400" role="alert">
                {assignError}
              </p>
            )}
          </div>

          {/* Navigation Bar */}
          <div className="px-3 sm:px-7 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 shrink-0">
            <div className="w-full">
              <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 w-full">
                <button
                  onClick={() => setActiveTab('chat')}
                  className={`py-1.5 px-1 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === 'chat'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <MessageSquare size={14} />
                  <span className="truncate">Live Chat</span>
                </button>
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`py-1.5 px-1 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === 'overview'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Sparkles size={14} />
                  <span className="truncate">Details</span>
                </button>
                <button
                  onClick={() => setActiveTab('timeline')}
                  className={`py-1.5 px-1 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                    activeTab === 'timeline'
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Clock size={14} />
                  <span className="truncate">Timeline</span>
                </button>
              </div>
            </div>
          </div>

          {/* Main Content Area */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-7 pb-20 sm:pb-7">
            {activeTab === 'chat' && (
              <div className="h-full min-h-[460px] flex flex-col">
                <div className="mb-2 p-2 px-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-600 dark:text-slate-400 flex items-center justify-center text-center">
                  <span className="font-semibold">
                    Realtime Support Channel &bull; Client: <strong className="text-slate-900 dark:text-white">{ticket.clientName || ticket.email || 'Client'}</strong>
                  </span>
                </div>
                <div className="flex-1 min-h-[400px]">
                  <TicketChatThread
                    ticketId={ticket.id}
                    senderName={currentUser?.fullName || 'Operations Staff'}
                    senderRole={currentUser?.role || 'staff'}
                    placeholder="Reply to client inquiry or provide updates..."
                  />
                </div>
              </div>
            )}

            {activeTab === 'overview' && (
              <div className="space-y-6">
                {/* Description Card */}
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 space-y-3">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 block">
                    Inquiry Description
                  </span>
                  <p className="text-sm font-medium leading-relaxed text-slate-950 dark:text-slate-100 whitespace-pre-wrap">
                    {descriptionBody}
                  </p>
                </div>

                {siteLocation && (
                  <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 flex items-center gap-1.5">
                      <MapPin size={14} aria-hidden="true" /> Site Location
                    </span>
                    <p className="text-sm font-bold leading-relaxed text-slate-950 dark:text-white">
                      {siteLocation}
                    </p>
                    <a
                      href={siteMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                      <ExternalLink size={12} aria-hidden="true" />
                      Open in Google Maps
                    </a>
                  </div>
                )}

                {/* Client & Metadata Properties Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase flex items-center gap-1">
                      <User size={13} /> Client Name
                    </span>
                    <span className="text-sm font-black text-slate-950 dark:text-white block">{ticket.clientName || 'Individual'}</span>
                    <span className="text-xs text-slate-700 dark:text-slate-300 font-medium block truncate">{ticket.email}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase flex items-center gap-1">
                      <Building size={13} /> Department / Site
                    </span>
                    <span className="text-sm font-black text-slate-950 dark:text-white block">{ticket.category || 'General Support'}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase flex items-center gap-1">
                      <Calendar size={13} /> Date Created
                    </span>
                    <span className="text-sm font-black text-slate-950 dark:text-white block">
                      {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : 'N/A'}
                    </span>
                  </div>
                </div>

                {/* Attachment Media Gallery */}
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 flex items-center gap-1.5">
                    <Paperclip size={14} /> Attachment Media & Logs ({fileAttachments.length})
                  </span>

                  {fileAttachments.length === 0 ? (
                    <p className="text-xs text-slate-700 dark:text-slate-400 font-medium">No files or logs attached by client.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                      {fileAttachments.map((fileUrl, index) => (
                        <div key={index} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 overflow-hidden">
                          {isImageUrl(fileUrl) ? (
                            <button
                              type="button"
                              onClick={() => openAttachment(fileUrl, `attachment-img-${index + 1}`)}
                              className="w-full text-left group cursor-pointer"
                            >
                              <img
                                src={fileUrl}
                                alt={`Attachment ${index + 1}`}
                                className="w-full h-32 object-cover rounded-lg group-hover:scale-105 transition-transform bg-slate-900/5 dark:bg-white/5"
                              />
                              <div className="mt-2 flex items-center justify-between text-xs font-bold text-slate-800 dark:text-slate-200">
                                <span>Image Attachment #{index + 1}</span>
                                <ExternalLink size={12} />
                              </div>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openAttachment(fileUrl, `attachment-doc-${index + 1}`)}
                              className="w-full h-full p-4 flex flex-col justify-between space-y-3 text-left group hover:bg-white dark:hover:bg-slate-900 transition-colors rounded-lg"
                            >
                              <div className="flex items-center gap-2 text-slate-950 dark:text-white">
                                <Paperclip size={18} className="text-slate-800 dark:text-slate-200 shrink-0" />
                                <span className="font-bold text-xs truncate max-w-[180px]">
                                  {getAttachmentLabel(fileUrl)}
                                </span>
                              </div>
                              <div className="flex items-center justify-between text-[11px] font-bold text-slate-800 dark:text-slate-200">
                                <span>Download File</span>
                                <ExternalLink size={12} />
                              </div>
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'timeline' && (
              <div className="py-6 px-2 space-y-8">
                {/* Visual Stepper: completed (past) | active (current) | upcoming */}
                <div className="max-w-2xl mx-auto space-y-8">
                  {[
                    { step: 1, title: 'Inquiry Submitted', desc: 'Ticket logged into Network Desk system' },
                    { step: 2, title: 'Engineer Assigned', desc: ticket.assignedTo ? `Assigned to ${ticket.assignedTo}` : 'Awaiting tier-2 engineer assignment' },
                    { step: 3, title: 'Investigation & Resolution in Progress', desc: 'Engineer active on diagnostics & chat' },
                    { step: 4, title: 'Resolved & Closed', desc: 'Issue resolved and verified by client' },
                  ].map((item, idx) => {
                    const isCompleted = currentStep > item.step || (item.step === 4 && isTerminalStatus)
                    const isActive = !isCompleted && currentStep === item.step
                    return (
                    <div key={item.step} className="flex items-start gap-4 relative">
                      {idx < 3 && (
                        <div
                          className={`absolute left-5 top-10 bottom-0 w-0.5 ${
                            currentStep > item.step ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-800'
                          }`}
                          style={{ height: 'calc(100% + 12px)' }}
                        />
                      )}
                      <div
                        className={`size-10 rounded-full grid place-items-center font-bold text-xs shrink-0 z-10 ${
                          isCompleted
                            ? 'bg-emerald-600 text-white shadow-md'
                            : isActive
                              ? 'bg-amber-500 text-white shadow-md ring-4 ring-amber-500/25'
                              : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                        }`}
                      >
                        {isCompleted ? <CheckCircle2 size={18} /> : isActive ? <Clock size={18} /> : item.step}
                      </div>

                      <div className="pt-1 space-y-1">
                        <h4 className={`text-sm font-extrabold ${isCompleted || isActive ? 'text-slate-950 dark:text-white' : 'text-slate-700 dark:text-slate-400'}`}>
                          {item.title}
                          {isActive && (
                            <span className="ml-2 text-[10px] font-black uppercase tracking-wider text-amber-700 dark:text-amber-400">
                              Current
                            </span>
                          )}
                        </h4>
                        <p className="text-xs text-slate-700 dark:text-slate-400 font-medium">{item.desc}</p>
                      </div>
                    </div>
                    )
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Modal Footer */}
          <div className="hidden sm:flex px-5 sm:px-7 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 items-center justify-between shrink-0">
            <span className="text-xs text-slate-700 dark:text-slate-400 font-medium">
              Press <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Esc</kbd> to exit Admin Workspace
            </span>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black text-xs hover:bg-slate-800 dark:hover:bg-white transition-all shadow-xs"
            >
              Close Workspace
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
