import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, CheckCircle2, X } from 'lucide-react'
import { playNotificationSound } from '../../lib/notificationService'

export function NotificationToastContainer({ onSelectTicket }) {
  const [toasts, setToasts] = useState([])
  const seenIdsRef = useRef(new Set())

  useEffect(() => {
    const addToast = (notif) => {
      if (!notif || !notif.id) return
      // Dedup by notification ID
      if (seenIdsRef.current.has(notif.id)) return
      seenIdsRef.current.add(notif.id)
      // Prune old IDs after 30 seconds
      setTimeout(() => seenIdsRef.current.delete(notif.id), 30000)

      setToasts((prev) => {
        if (prev.some((t) => t.id === notif.id)) return prev
        if (prev.some((t) => t.title === notif.title && t.message === notif.message)) return prev
        return [notif, ...prev.slice(0, 3)]
      })

      // Auto dismiss after 6 seconds
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== notif.id))
      }, 6000)
    }

    // Listen for local notifications dispatched in this tab
    const handleLocalNotification = (e) => {
      addToast(e.detail)
    }
    window.addEventListener('netops_notification_received', handleLocalNotification)

    // Listen for cross-tab notification relay via BroadcastChannel
    let notifChannel = null
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        notifChannel = new BroadcastChannel('netops_notifications')
        notifChannel.onmessage = (event) => {
          if (event.data?.type === 'CROSS_TAB_NOTIFICATION' && event.data?.payload) {
            const notif = event.data.payload
            // Play sound for cross-tab notifications too
            playNotificationSound(notif.type === 'status' ? 'status' : 'chat')
            addToast(notif)
          }
        }
      }
    } catch {
      // BroadcastChannel unsupported
    }

    return () => {
      window.removeEventListener('netops_notification_received', handleLocalNotification)
      if (notifChannel) {
        try { notifChannel.close() } catch {}
      }
    }
  }, [])

  const removeToast = (id) => {
    setToasts((prev) => prev.filter((t) => t.id !== id))
  }

  if (toasts.length === 0) return null

  return (
    <div className="fixed top-5 right-5 z-[99999] flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
      <AnimatePresence mode="popLayout">
        {toasts.map((t, idx) => (
          <motion.div
            key={t.id || `toast-${idx}-${t.title || ''}`}
            initial={{ opacity: 0, x: 60, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 30, scale: 0.9 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onClick={() => {
              if (t.ticketId && onSelectTicket) onSelectTicket(t.ticketId)
              removeToast(t.id)
            }}
            className="pointer-events-auto w-full p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 text-slate-950 dark:text-white shadow-2xl backdrop-blur-md cursor-pointer group hover:border-slate-400 dark:hover:border-slate-600 transition-all flex items-start gap-3"
          >
            <span className="p-2 rounded-xl bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900 shrink-0 mt-0.5 shadow-xs">
              {t.type === 'status' ? <CheckCircle2 size={16} /> : <MessageSquare size={16} />}
            </span>

            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-950 dark:text-white leading-tight truncate">
                  {t.title}
                </p>
                <span className="text-[10px] font-bold text-slate-400">Just now</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 font-medium mt-1 leading-snug line-clamp-2">
                {t.message}
              </p>
            </div>

            <button
              onClick={(e) => {
                e.stopPropagation()
                removeToast(t.id)
              }}
              className="p-1 rounded-lg text-slate-400 hover:text-slate-950 dark:hover:text-white transition-colors shrink-0"
              title="Dismiss notification"
            >
              <X size={14} />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>
  )
}
