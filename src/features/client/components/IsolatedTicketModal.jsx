import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  X,
  ArrowLeft,
  Ticket,
  Clock,
  CheckCircle2,
  AlertCircle,
  MessageSquare,
  Paperclip,
  Calendar,
  Building,
  User,
  ExternalLink,
  Sparkles,
  Check,
  Copy,
  RefreshCw,
} from 'lucide-react'
import { TicketChatThread } from '../../../shared/components/TicketChatThread'
import { openAttachment, isImageUrl, getAttachmentLabel, parseAttachments } from '../../../lib/attachmentUtils'
import { approveAndCloseTicket, reopenTicket, getAutoCloseTimeRemaining, setActiveTicketId } from '../../../lib/ticketService'

export function IsolatedTicketModal({ ticket, isOpen, onClose, clientAccount, onTicketUpdated }) {
  const [activeTab, setActiveTab] = useState('chat') // 'chat' | 'overview' | 'timeline'
  const [copied, setCopied] = useState(false)
  const [reopenReason, setReopenReason] = useState('')
  const [isReopenModalOpen, setIsReopenModalOpen] = useState(false)
  const [actionLoading, setActionLoading] = useState(false)
  const hasEnteredRef = useRef(false)

  const ticketId = ticket?.id || ticket?.ticketNumber || ticket?.ticket_number || null

  const handleApproveAndClose = async () => {
    setActionLoading(true)
    try {
      await approveAndCloseTicket(ticket.id || ticket.ticketNumber, clientAccount?.fullName || 'Client')
      if (onTicketUpdated) await onTicketUpdated()
    } finally {
      setActionLoading(false)
    }
  }

  const handleReopenConfirm = async (e) => {
    e.preventDefault()
    setActionLoading(true)
    try {
      await reopenTicket(ticket.id || ticket.ticketNumber, clientAccount?.fullName || 'Client', reopenReason)
      setReopenReason('')
      setIsReopenModalOpen(false)
      if (onTicketUpdated) await onTicketUpdated()
    } finally {
      setActionLoading(false)
    }
  }

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen && ticketId) {
      setActiveTicketId(ticketId)
      return () => setActiveTicketId(null)
    }
  }, [isOpen, ticketId])

  useEffect(() => {
    if (!isOpen) {
      hasEnteredRef.current = false
      return
    }
    const frame = requestAnimationFrame(() => {
      hasEnteredRef.current = true
    })
    return () => cancelAnimationFrame(frame)
  }, [isOpen])

  if (!isOpen || !ticket) return null

  const skipEnterAnimation = hasEnteredRef.current
  const fileAttachments = parseAttachments(ticket?.attachment)
  const autoCloseInfo = getAutoCloseTimeRemaining(ticket)

  const handleCopyTicketId = () => {
    navigator.clipboard.writeText(ticket.ticketNumber || ticket.id)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  // Helper for Status Badge styling
  const getStatusBadge = (status = 'Open') => {
    const norm = status || 'Open'
    switch (norm) {
      case 'Resolved':
      case 'Closed':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800">
            <CheckCircle2 size={13} /> {norm}
          </span>
        )
      case 'In Progress':
      case 'Pending Client':
        return (
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800">
            <Clock size={13} className="animate-spin" /> {norm}
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

  // Helper for Priority Badge
  const getPriorityBadge = (priority) => {
    const prio = priority || 'Medium'
    let colorClass = 'bg-slate-100 text-slate-900 border border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700'
    if (prio === 'High' || prio === 'Urgent') {
      colorClass = 'bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
    }
    return (
      <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${colorClass}`}>
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

  return (
    <AnimatePresence>
      <motion.div
        key={ticketId || 'isolated-modal'}
          initial={skipEnterAnimation ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[60] flex items-center justify-center p-0 sm:p-6 overflow-hidden bg-slate-950/80 backdrop-blur-md"
        >
          {/* Animated Dialog Box */}
          <motion.div
            initial={skipEnterAnimation ? false : { opacity: 0, scale: 0.95, y: 15 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 15 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="relative w-full h-full max-w-full sm:max-w-4xl bg-white dark:bg-slate-900 sm:border border-slate-200 dark:border-slate-800 sm:rounded-3xl sm:shadow-2xl flex flex-col sm:h-auto sm:max-h-[90vh] sm:my-auto text-slate-950 dark:text-white"
          >
          {/* Top Modal Header */}
          <div className="px-3.5 sm:px-7 py-3 sm:py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 backdrop-blur-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 shrink-0">
            {/* Mobile Top Navigation & Status Row */}
            <div className="flex items-center justify-between w-full sm:hidden">
              <button
                onClick={onClose}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-extrabold text-xs border border-slate-200 dark:border-slate-700 shadow-xs shrink-0"
                title="Back to Queue"
              >
                <ArrowLeft size={15} />
                <span>Back to Queue</span>
              </button>

              <div>{getStatusBadge(ticket.status)}</div>
            </div>

            {/* Main Header Content */}
            <div className="flex items-center gap-3 min-w-0">
              <div className="hidden sm:grid size-11 place-items-center rounded-2xl bg-slate-950 dark:bg-slate-100 text-white dark:text-slate-950 shadow-xs shrink-0">
                <Ticket size={22} />
              </div>

              <div className="min-w-0 flex-1 space-y-0.5">
                <div className="flex items-center gap-2 flex-wrap mb-1 sm:mb-0">
                  <span className="font-mono text-xs font-black text-slate-900 dark:text-slate-100 uppercase tracking-wider whitespace-nowrap">
                    {ticket.ticketNumber || ticket.id}
                  </span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={handleCopyTicketId}
                      className="p-1 text-slate-500 dark:text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors rounded"
                      title="Copy Ticket Reference"
                    >
                      {copied ? <Check size={13} className="text-emerald-600 dark:text-emerald-400" /> : <Copy size={13} />}
                    </button>
                    {getPriorityBadge(ticket.priority)}
                  </div>
                </div>

                <h2 className="text-sm sm:text-lg font-black text-slate-950 dark:text-white line-clamp-1 leading-snug">
                  {ticket.subject}
                </h2>
              </div>
            </div>

            {/* Desktop Right Header Actions */}
            <div className="hidden sm:flex items-center gap-2 sm:gap-3 shrink-0">
              <div>{getStatusBadge(ticket.status)}</div>
              <button
                onClick={onClose}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white transition-all"
                title="Close Isolated View (Esc)"
              >
                <X size={18} />
              </button>
            </div>
          </div>

          {/* Isolated Navigation Bar */}
          <div className="px-3 sm:px-7 py-2.5 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
            <div className="w-full sm:w-auto sm:flex-1">
              <div className="grid grid-cols-3 gap-1 bg-slate-100 dark:bg-slate-950 p-1 rounded-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md">
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

          {/* Modal Main Content Container */}
          <div className="flex-1 overflow-y-auto p-3 sm:p-7 pb-20 sm:pb-7 space-y-4">
            {/* Resolution Approval Banner (when ticket status is Resolved) */}
            {ticket.status === 'Resolved' && (
              <div className="p-4 sm:p-5 rounded-2xl border border-emerald-500/30 bg-gradient-to-r from-emerald-500/10 via-emerald-500/5 to-transparent shadow-xs space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5">
                    <span className="p-2 rounded-xl bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                      <CheckCircle2 size={20} />
                    </span>
                    <div>
                      <h3 className="font-black text-sm sm:text-base text-slate-900 dark:text-white">Technical Resolution Completed</h3>
                      <p className="text-xs text-slate-700 dark:text-slate-300 font-medium">Please confirm if your technical inquiry has been resolved to your satisfaction.</p>
                    </div>
                  </div>
                  {autoCloseInfo.formattedCountdown && (
                    <span className="text-[11px] font-black text-emerald-800 dark:text-emerald-300 bg-emerald-500/15 border border-emerald-500/30 px-3 py-1 rounded-full flex items-center gap-1.5 shrink-0">
                      ⏳ Auto-closes in {autoCloseInfo.formattedCountdown}
                    </span>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 pt-1">
                  <button
                    onClick={handleApproveAndClose}
                    disabled={actionLoading}
                    className="flex-1 py-3 sm:py-2.5 px-5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs sm:text-sm shadow-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <CheckCircle2 size={16} />
                    <span>Approve & Close Ticket</span>
                  </button>
                  <button
                    onClick={() => setIsReopenModalOpen(true)}
                    disabled={actionLoading}
                    className="py-3 sm:py-2.5 px-4 rounded-xl bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <RefreshCw size={15} />
                    <span>Reopen Ticket</span>
                  </button>
                </div>
              </div>
            )}

            {/* Closed State Banner */}
            {ticket.status === 'Closed' && (
              <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 text-slate-700 dark:text-slate-300 flex items-center justify-between gap-3 text-xs font-bold">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Ticket Closed & Archived. Thank you for your feedback!</span>
                </div>
                <button
                  onClick={() => setIsReopenModalOpen(true)}
                  className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-800 dark:text-slate-200 hover:bg-slate-100 font-extrabold text-xs transition-all shrink-0 flex items-center gap-1.5"
                >
                  <RefreshCw size={13} />
                  <span>Reopen</span>
                </button>
              </div>
            )}

            {activeTab === 'chat' && (
              <div className="h-full min-h-[440px] flex flex-col">
                <div className="mb-3 p-3 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 text-xs text-slate-700 dark:text-slate-300 flex items-center justify-between">
                  <span className="font-semibold">
                    Direct line with Network & Tech Engineers for ticket{' '}
                    <strong className="text-slate-950 dark:text-white">{ticket.ticketNumber}</strong>
                  </span>
                  <span className="font-mono text-[11px] font-bold text-slate-800 dark:text-slate-200">
                    SLA Response &lt; 15 mins
                  </span>
                </div>
                <div className="flex-1 min-h-[380px]">
                  <TicketChatThread
                    ticketId={ticket.id}
                    senderName={clientAccount?.fullName || ticket.clientName || 'Client'}
                    senderRole="client"
                    placeholder="Ask an engineer or provide additional details..."
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
                    {ticket.description || 'No detailed description provided.'}
                  </p>
                </div>

                {/* Metadata Properties Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase flex items-center gap-1">
                      <Building size={13} /> Department
                    </span>
                    <span className="text-sm font-black text-slate-950 dark:text-white block">{ticket.category || 'General Support'}</span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase flex items-center gap-1">
                      <Calendar size={13} /> Date Submitted
                    </span>
                    <span className="text-sm font-black text-slate-950 dark:text-white block">
                      {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString() : 'N/A'}
                    </span>
                  </div>

                  <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1">
                    <span className="text-[11px] font-bold text-slate-700 dark:text-slate-400 uppercase flex items-center gap-1">
                      <User size={13} /> Assigned Engineer
                    </span>
                    <span className="text-sm font-black text-slate-950 dark:text-white block">
                      {(() => {
                        const rawStaff = ticket.assignedTo || ticket.assigned_to || ticket.assignedStaff || ticket.assigned_staff
                        if (typeof rawStaff === 'string' && rawStaff.trim()) return rawStaff
                        if (typeof rawStaff === 'object' && rawStaff !== null) {
                          return rawStaff.fullName || rawStaff.full_name || rawStaff.name || 'Assigned Staff'
                        }
                        return 'Pending Assignment'
                      })()}
                    </span>
                  </div>
                </div>

                {/* Attachment Media Gallery */}
                <div className="p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-3">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-slate-400 flex items-center gap-1.5">
                    <Paperclip size={14} /> Attached Media & Documents ({fileAttachments.length})
                  </span>

                  {fileAttachments.length === 0 ? (
                    <p className="text-xs text-slate-700 dark:text-slate-400 font-medium">No files or screenshots attached to this inquiry.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 pt-1">
                      {fileAttachments.map((fileUrl, index) => (
                        <div key={fileUrl || index} className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950 p-2.5 overflow-hidden">
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
                                <span>View Document</span>
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

          {/* Bottom Footer Actions */}
          <div className="hidden sm:flex px-5 sm:px-7 py-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/80 items-center justify-between shrink-0">
            <span className="text-xs text-slate-700 dark:text-slate-400 font-medium">
              Press <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 font-mono text-[10px]">Esc</kbd> to close isolated view
            </span>

            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black text-xs hover:bg-slate-800 dark:hover:bg-white transition-all shadow-xs"
            >
              Done Viewing
            </button>
          </div>

          {/* Reopen Reason Prompt Modal */}
          <AnimatePresence>
            {isReopenModalOpen && (
              <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs">
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 text-slate-900 dark:text-white"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <span className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
                        <RefreshCw size={20} />
                      </span>
                      <h3 className="font-black text-base">Reopen Inquiry</h3>
                    </div>
                    <button onClick={() => setIsReopenModalOpen(false)} className="p-1 text-slate-400 hover:text-slate-900 dark:hover:text-white">
                      <X size={18} />
                    </button>
                  </div>

                  <p className="text-xs text-slate-600 dark:text-slate-300 font-medium">
                    Please provide details on why the issue requires further support so our team can assist immediately.
                  </p>

                  <form onSubmit={handleReopenConfirm} className="space-y-4">
                    <textarea
                      value={reopenReason}
                      onChange={(e) => setReopenReason(e.target.value)}
                      placeholder="e.g. The issue reoccurred after rebooting..."
                      rows={3}
                      className="w-full p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-xs font-bold text-slate-950 dark:text-white focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all"
                    />

                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setIsReopenModalOpen(false)}
                        className="px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        disabled={actionLoading}
                        className="px-5 py-2 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black text-xs shadow-sm hover:opacity-90 transition-all disabled:opacity-50"
                      >
                        {actionLoading ? 'Reopening...' : 'Confirm Reopen'}
                      </button>
                    </div>
                  </form>
                </motion.div>
              </div>
            )}
          </AnimatePresence>
          </motion.div>
        </motion.div>
    </AnimatePresence>
  )
}
