import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Bell,
  MessageSquare,
  CheckCircle2,
  X,
  CheckCheck,
  Trash2,
  Ticket,
  ChevronRight,
  Inbox,
  Volume2,
  Radio,
} from 'lucide-react'
import {
  getNotificationLogs,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearNotificationLogs,
  requestNotificationPermission,
  getNotificationPermissionState,
  playNotificationSound,
  dispatchNotification,
} from '../../lib/notificationService'

function formatRelativeTime(isoString) {
  if (!isoString) return 'Just now'
  const date = new Date(isoString)
  const diffMs = Date.now() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)
  const diffDays = Math.floor(diffHours / 24)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHours < 24) return `${diffHours}h ago`
  return `${diffDays}d ago`
}

export function NotificationActivityDrawer({ isOpen, onClose, onSelectTicket }) {
  const [logs, setLogs] = useState([])
  const [filter, setFilter] = useState('all') // 'all' | 'unread' | 'chat' | 'status'
  const [permState, setPermState] = useState(() => getNotificationPermissionState())

  const refreshLogs = () => {
    setLogs(getNotificationLogs())
    setPermState(getNotificationPermissionState())
  }

  const handleEnableDesktopAlerts = async () => {
    const perm = await requestNotificationPermission()
    setPermState(perm)
    playNotificationSound('chat')
    dispatchNotification({
      title: 'Desktop Alerts Enabled',
      message: 'You will now receive native desktop & audio alerts for new client chat messages.',
      type: 'chat',
      allowActive: true,
    })
  }

  const handleTestChime = () => {
    playNotificationSound('chat')
    dispatchNotification({
      title: 'Notification Sound Test',
      message: 'Live chat chime audio is operational!',
      type: 'chat',
      allowActive: true,
    })
  }

  useEffect(() => {
    refreshLogs()

    const handleUpdate = () => refreshLogs()

    window.addEventListener('netops_notification_log_updated', handleUpdate)
    window.addEventListener('netops_notification_received', handleUpdate)

    return () => {
      window.removeEventListener('netops_notification_log_updated', handleUpdate)
      window.removeEventListener('netops_notification_received', handleUpdate)
    }
  }, [])

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  if (!isOpen) return null

  const unreadCount = logs.filter((n) => !n.read).length

  const filteredLogs = logs.filter((item) => {
    if (filter === 'unread') return !item.read
    if (filter === 'chat') return item.type === 'chat'
    if (filter === 'status') return item.type === 'status'
    return true
  })

  const handleItemClick = (item) => {
    markNotificationAsRead(item.id)
    refreshLogs()
    if (item.ticketId && onSelectTicket) {
      onSelectTicket(item.ticketId)
      onClose()
    }
  }

  const handleMarkAllRead = () => {
    markAllNotificationsAsRead()
    refreshLogs()
  }

  const handleClearAll = () => {
    clearNotificationLogs()
    refreshLogs()
  }

  return (
    <AnimatePresence>
      <motion.div
        key="notification-drawer-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[99999] bg-slate-950/60 backdrop-blur-xs flex justify-end"
      >
        <motion.div
          key="notification-drawer-content"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          onClick={(e) => e.stopPropagation()}
          className="w-full max-w-md bg-white dark:bg-slate-900 h-full border-l border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col text-slate-950 dark:text-white"
        >
          {/* Header */}
          <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-950/70 backdrop-blur-sm flex items-center justify-between shrink-0">
            <div className="flex items-center gap-3">
              <div className="size-10 rounded-2xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 grid place-items-center shadow-xs">
                <Bell size={19} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-black text-base leading-tight">Notifications Log</h2>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-black bg-rose-500 text-white shadow-xs">
                      {unreadCount} new
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-400 font-bold mt-0.5">
                  Live chat & ticket activity history
                </p>
              </div>
            </div>

            <button
              onClick={onClose}
              className="p-2 rounded-xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white transition-colors"
              title="Close Drawer (Esc)"
            >
              <X size={18} />
            </button>
          </div>

          {/* Quick Action Toolbar & Filter Tabs */}
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 space-y-2.5 shrink-0">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
                {[
                  { id: 'all', label: 'All' },
                  { id: 'unread', label: `Unread (${unreadCount})` },
                  { id: 'chat', label: 'Chat' },
                  { id: 'status', label: 'Updates' },
                ].map((t) => (
                  <button
                    key={t.id}
                    onClick={() => setFilter(t.id)}
                    className={`px-3 py-1 rounded-lg text-xs font-black transition-all whitespace-nowrap cursor-pointer ${
                      filter === t.id
                        ? 'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 shadow-xs'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 shrink-0">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllRead}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    title="Mark all as read"
                  >
                    <CheckCheck size={16} />
                  </button>
                )}
                {logs.length > 0 && (
                  <button
                    onClick={handleClearAll}
                    className="p-1.5 rounded-lg text-rose-500 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition-colors"
                    title="Clear history"
                  >
                    <Trash2 size={16} />
                  </button>
                )}
              </div>
            </div>

            {/* Desktop Notification & Sound Control Bar */}
            <div className="p-2 rounded-xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200/80 dark:border-indigo-800/80 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <Radio size={15} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
                <span className="font-bold text-slate-800 dark:text-slate-200 truncate">
                  Desktop Alerts: {permState === 'granted' ? 'Enabled ✅' : 'Disabled 🔔'}
                </span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {permState !== 'granted' && (
                  <button
                    onClick={handleEnableDesktopAlerts}
                    className="px-2.5 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-black hover:bg-indigo-700 transition-colors shadow-xs"
                  >
                    Enable
                  </button>
                )}
                <button
                  onClick={handleTestChime}
                  className="p-1 rounded-lg border border-slate-300 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300 transition-colors"
                  title="Test Notification Sound Chime"
                >
                  <Volume2 size={14} />
                </button>
              </div>
            </div>
          </div>

          {/* Activity Log List */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {filteredLogs.length === 0 ? (
              <div className="h-full min-h-[250px] flex flex-col items-center justify-center text-center p-6 text-slate-600 dark:text-slate-400">
                <div className="size-12 rounded-2xl bg-slate-100 dark:bg-slate-800 grid place-items-center mb-3 text-slate-400 dark:text-slate-500">
                  <Inbox size={24} />
                </div>
                <p className="font-black text-sm text-slate-900 dark:text-white">No notifications match filter</p>
                <p className="text-xs mt-1">Chat messages and ticket status changes will appear here.</p>
              </div>
            ) : (
              filteredLogs.map((item) => (
                <motion.div
                  key={item.id}
                  layout
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  onClick={() => handleItemClick(item)}
                  className={`group p-3.5 rounded-2xl border transition-all cursor-pointer relative flex items-start gap-3 ${
                    !item.read
                      ? 'bg-slate-50 dark:bg-slate-800/60 border-slate-300 dark:border-slate-700 shadow-xs'
                      : 'bg-white dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-85 hover:opacity-100'
                  }`}
                >
                  <span
                    className={`p-2 rounded-xl shrink-0 mt-0.5 shadow-xs ${
                      item.type === 'status'
                        ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                        : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border border-indigo-500/30'
                    }`}
                  >
                    {item.type === 'status' ? <CheckCircle2 size={16} /> : <MessageSquare size={16} />}
                  </span>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-900 dark:text-white leading-snug truncate">
                        {item.title}
                      </p>
                      <span className="text-[10px] font-bold text-slate-600 dark:text-slate-400 whitespace-nowrap">
                        {formatRelativeTime(item.timestamp)}
                      </span>
                    </div>

                    <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1 leading-relaxed line-clamp-2">
                      {item.message}
                    </p>

                    {item.ticketId && (
                      <div className="mt-2 flex items-center justify-between pt-1.5 border-t border-slate-200/60 dark:border-slate-800/60 text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                        <span className="flex items-center gap-1">
                          <Ticket size={12} />
                          <span>View Ticket Workspace</span>
                        </span>
                        <ChevronRight size={13} className="group-hover:translate-x-1 transition-transform" />
                      </div>
                    )}
                  </div>

                  {!item.read && (
                    <span className="size-2 rounded-full bg-rose-500 shrink-0 mt-1.5 shadow-xs" title="Unread" />
                  )}
                </motion.div>
              ))
            )}
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  )
}
