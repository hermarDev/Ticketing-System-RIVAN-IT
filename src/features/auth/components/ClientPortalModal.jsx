import { useState, useEffect, useCallback } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { User, X, Ticket, RefreshCw, LogOut, ArrowLeft, MessageSquare, ChevronRight, Settings } from 'lucide-react'
import { fetchClientTickets, logoutClient, resolveClientUrgencyDisplay } from '../../../lib/ticketService'
import { TicketChatThread } from '../../../shared/components/TicketChatThread'
import { ClientAccountSettings } from './ClientAccountSettings'

export function ClientPortalModal({
  isOpen,
  onClose,
  clientAccount,
  onOpenNewTicket,
  onLogout,
  onUpdateAccount,
}) {
  const [clientTickets, setClientTickets] = useState([])
  const [loading, setLoading] = useState(false)
  const [selectedTicket, setSelectedTicket] = useState(null)
  const [activeTab, setActiveTab] = useState('tickets') // 'tickets' | 'settings'

  const loadClientTickets = useCallback(async () => {
    if (!clientAccount) return
    setLoading(true)
    const tickets = await fetchClientTickets(clientAccount.email)
    setClientTickets(tickets)
    setLoading(false)
  }, [clientAccount])

  useEffect(() => {
    if (isOpen && clientAccount) {
      loadClientTickets()
    }
  }, [isOpen, clientAccount, loadClientTickets])

  if (!isOpen) return null

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 12 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 12 }}
          className="relative w-full max-w-3xl rounded-2xl border border-[var(--line)] bg-[var(--paper)] p-6 text-[var(--text)] shadow-[var(--shadow-deep)] max-h-[90vh] flex flex-col transition-colors duration-200"
        >
          {/* Top Bar */}
          <div className="flex items-center justify-between border-b border-[var(--line)] pb-4">
            <div className="flex items-center gap-3">
              {selectedTicket ? (
                <button
                  onClick={() => setSelectedTicket(null)}
                  className="p-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] hover:border-[var(--line-strong)] transition-all"
                  title="Back to Tickets"
                >
                  <ArrowLeft size={16} />
                </button>
              ) : activeTab === 'settings' ? (
                <button
                  onClick={() => setActiveTab('tickets')}
                  className="p-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--ink)] hover:border-[var(--line-strong)] transition-all"
                  title="Back to Tickets"
                >
                  <ArrowLeft size={16} />
                </button>
              ) : (
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--ink)] text-[var(--accent)] border border-[var(--line)] shadow-sm">
                  <User size={20} />
                </span>
              )}
              <div>
                <h3 className="font-extrabold text-lg text-[var(--ink)]">
                  {selectedTicket
                    ? `Inquiry ${selectedTicket.ticketNumber}`
                    : activeTab === 'settings'
                    ? 'My Account Settings'
                    : 'Client Portal'}
                </h3>
                <p className="text-xs text-[var(--muted)] font-medium">
                  {clientAccount
                    ? `Logged in as ${clientAccount.fullName} (${clientAccount.company || clientAccount.companyName || 'Client'})`
                    : 'Client Account Desk'}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {!selectedTicket && (
                <button
                  onClick={() => setActiveTab((prev) => (prev === 'settings' ? 'tickets' : 'settings'))}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--line)] text-xs font-extrabold transition-all ${
                    activeTab === 'settings'
                      ? 'bg-[var(--ink)] text-[var(--paper)] shadow-[var(--shadow-hard)]'
                      : 'bg-[var(--bg)] text-[var(--ink)] hover:border-[var(--line-strong)]'
                  }`}
                  title="My Account Settings"
                >
                  <Settings size={14} /> My Account
                </button>
              )}

              {onLogout && (
                <button
                  onClick={async () => {
                    await logoutClient()
                    onClose()
                    onLogout()
                  }}
                  className="flex items-center gap-1.5 rounded-xl border border-[var(--line)] bg-[var(--bg)] px-3 py-1.5 text-xs font-bold text-[var(--muted)] hover:text-rose-600 hover:border-rose-500/30 transition-all"
                  title="Log out"
                >
                  <LogOut size={14} /> Log Out
                </button>
              )}
              <button
                onClick={onClose}
                className="rounded-xl p-2 text-[var(--muted)] hover:bg-[var(--bg)] hover:text-[var(--ink)] transition-colors"
              >
                <X size={20} />
              </button>
            </div>
          </div>

          {/* Main Body Area */}
          <div className="py-4 flex-1 overflow-y-auto space-y-4 min-h-0">
            {activeTab === 'settings' ? (
              /* My Account Settings View */
              <ClientAccountSettings
                clientAccount={clientAccount}
                onAccountUpdated={(updated) => {
                  if (onUpdateAccount) onUpdateAccount(updated)
                }}
                onBack={() => setActiveTab('tickets')}
              />
            ) : selectedTicket ? (
              /* Single Ticket View + 2-Way Live Chat */
              <div className="flex flex-col h-full space-y-4">
                <div className="p-4 rounded-xl border border-[var(--line)] bg-[var(--bg)] space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-black text-[var(--teal-dark)] dark:text-[var(--teal)]">
                      {selectedTicket.ticketNumber}
                    </span>
                    <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold border bg-[var(--teal)]/20 text-[var(--teal-dark)] dark:text-[var(--teal)] border-[var(--teal)]/40">
                      ● {selectedTicket.status}
                    </span>
                  </div>
                  <h4 className="font-black text-base text-[var(--ink)]">{selectedTicket.subject}</h4>
                  <p className="text-xs text-[var(--muted)] font-medium leading-relaxed">{selectedTicket.description}</p>
                  <div className="flex flex-wrap gap-4 text-[11px] font-bold text-[var(--muted)] pt-2 border-t border-[var(--line)]">
                    <span>Category: <strong className="text-[var(--ink)]">{selectedTicket.category}</strong></span>
                    <span>Reported Urgency: <strong className="text-[var(--ink)]">{resolveClientUrgencyDisplay(selectedTicket)}</strong></span>
                    <span>Created: <strong className="text-[var(--ink)]">{new Date(selectedTicket.createdAt).toLocaleDateString()}</strong></span>
                  </div>
                </div>

                {/* Chat Thread */}
                <div className="flex-1 flex flex-col min-h-0 h-full">
                  <TicketChatThread
                    ticketId={selectedTicket.id}
                    senderName={clientAccount?.fullName || 'Client'}
                    senderRole="client"
                    placeholder="Type your message to support engineers..."
                  />
                </div>
              </div>
            ) : (
              /* Ticket List */
              <>
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-extrabold text-[var(--ink)] flex items-center gap-2">
                    <Ticket size={16} className="text-[var(--teal-dark)] dark:text-[var(--teal)]" /> My Inquiry Tickets ({clientTickets.length})
                  </h4>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={loadClientTickets}
                      className="p-2 rounded-xl border border-[var(--line)] bg-[var(--bg)] text-[var(--muted)] hover:text-[var(--ink)] transition-all"
                      title="Refresh Tickets"
                    >
                      <RefreshCw size={14} className={loading ? 'animate-spin text-[var(--accent-dark)]' : ''} />
                    </button>
                    <button
                      onClick={() => {
                        onClose()
                        onOpenNewTicket()
                      }}
                      className="px-3 py-2 bg-[var(--ink)] hover:bg-[#182b35] text-[var(--paper)] font-extrabold text-xs rounded-xl shadow-[var(--shadow-hard)] transition-all"
                    >
                      + New Ticket
                    </button>
                  </div>
                </div>

                {clientTickets.length === 0 ? (
                  <div className="p-8 text-center border-2 border-dashed border-[var(--line)] rounded-2xl bg-[var(--bg)]/30">
                    <p className="text-sm font-bold text-[var(--ink)]">You haven't submitted any tickets yet.</p>
                    <button
                      onClick={() => {
                        onClose()
                        onOpenNewTicket()
                      }}
                      className="mt-3 px-4 py-2 bg-[var(--ink)] text-[var(--paper)] text-xs font-extrabold rounded-xl shadow-[var(--shadow-hard)]"
                    >
                      Create Your First Inquiry Ticket
                    </button>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {clientTickets.map((t) => (
                      <div
                        key={t.id}
                        onClick={() => setSelectedTicket(t)}
                        className="p-4 rounded-xl border border-[var(--line)] bg-[var(--paper)] hover:border-[var(--line-strong)] hover:shadow-sm cursor-pointer transition-all space-y-2 group"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-mono text-xs font-black text-[var(--teal-dark)] dark:text-[var(--teal)]">
                            {t.ticketNumber}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold border bg-[var(--teal)]/20 text-[var(--teal-dark)] dark:text-[var(--teal)] border-[var(--teal)]/40">
                            ● {t.status}
                          </span>
                        </div>

                        <h5 className="font-bold text-sm text-[var(--ink)] group-hover:text-[var(--teal-dark)] dark:group-hover:text-[var(--teal)] transition-colors">
                          {t.subject}
                        </h5>
                        <p className="text-xs text-[var(--muted)] line-clamp-2 font-medium">{t.description}</p>
                        <div className="flex items-center justify-between text-[11px] text-[var(--muted)] font-medium pt-2 border-t border-[var(--line)]">
                          <span>Category: {t.category}</span>
                          <span className="flex items-center gap-1 font-bold text-[var(--ink)]">
                            Open Chat <MessageSquare size={13} className="text-[var(--teal-dark)] dark:text-[var(--teal)]" /> <ChevronRight size={13} />
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
