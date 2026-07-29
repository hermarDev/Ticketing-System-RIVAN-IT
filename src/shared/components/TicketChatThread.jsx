import { useState, useEffect, useRef, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { 
  Send, Loader2, MessageSquare, Headphones, User, ShieldCheck, Paperclip, X, UploadCloud, 
  Download, FileText, FileSpreadsheet, FileArchive, FileCode, File 
} from 'lucide-react'
import { fetchTicketReplies, addTicketReply, subscribeToTicketReplies } from '../../lib/ticketService'
import { dispatchNotification, setActiveTicketId } from '../../lib/notificationService'
import { isSupabaseConfigured, supabase } from '../../lib/supabaseClient'

const ALLOWED_EXTENSIONS = [
  'png', 'jpg', 'jpeg', 'gif', 'webp', 'svg',
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
  'txt', 'csv', 'zip', 'rar', '7z', 'log', 'json'
]

const MAX_FILE_SIZE_BYTES = 15 * 1024 * 1024

export function TicketChatThread({
  ticketId,
  senderName,
  senderRole = 'client',
  onMessageSent,
  placeholder = 'Type your message or attach a file...'
}) {
  const [messages, setMessages] = useState([])
  const [loading, setLoading] = useState(true)
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [typingUser, setTypingUser] = useState(null)
  const [counterpartyPresence, setCounterpartyPresence] = useState(null)
  
  const [attachment, setAttachment] = useState(null)
  const [isDraggingOver, setIsDraggingOver] = useState(false)
  const [lightboxImage, setLightboxImage] = useState(null)
  const fileInputRef = useRef(null)

  const messagesEndRef = useRef(null)
  const typingTimerRef = useRef(null)
  const typingExpireRef = useRef(null)

  useEffect(() => {
    if (ticketId) {
      setActiveTicketId(ticketId)
      return () => setActiveTicketId(null)
    }
  }, [ticketId])

  const scrollToBottom = (behavior = 'smooth') => {
    messagesEndRef.current?.scrollIntoView({ behavior })
  }

  const isImageFile = (name = '', type = '') => {
    if (type && type.startsWith('image/')) return true
    const ext = name.split('.').pop().toLowerCase()
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)
  }

  const formatFileSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const getFileExtBadge = (name = '') => {
    const ext = name.split('.').pop().toUpperCase()
    return ext || 'FILE'
  }

  const getDocumentIcon = (name = '', type = '') => {
    const ext = name.split('.').pop().toLowerCase()
    if (ext === 'pdf') return FileText
    if (['doc', 'docx', 'txt', 'log'].includes(ext)) return FileText
    if (['xls', 'xlsx', 'csv'].includes(ext)) return FileSpreadsheet
    if (['zip', 'rar', '7z'].includes(ext)) return FileArchive
    if (['json', 'js', 'html', 'css'].includes(ext)) return FileCode
    return File
  }

  const compressImage = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (event) => {
        const img = new Image()
        img.onload = () => {
          const canvas = document.createElement('canvas')
          let width = img.width
          let height = img.height
          const maxDim = 1200
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width)
              width = maxDim
            } else {
              width = Math.round((width * maxDim) / height)
              height = maxDim
            }
          }
          canvas.width = width
          canvas.height = height
          const ctx = canvas.getContext('2d')
          ctx.drawImage(img, 0, 0, width, height)
          resolve(canvas.toDataURL('image/jpeg', 0.85))
        }
        img.onerror = () => resolve(event.target.result)
        img.src = event.target.result
      }
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
  }

  const readDocumentAsDataUrl = async (file) => {
    return new Promise((resolve) => {
      const reader = new FileReader()
      reader.onload = (e) => resolve(e.target.result)
      reader.onerror = () => resolve('')
      reader.readAsDataURL(file)
    })
  }

  const uploadChatAttachment = async (file) => {
    if (isSupabaseConfigured && supabase) {
      try {
        const fileExt = file.name.split('.').pop()
        const fileName = `chat_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`
        const { data, error } = await supabase.storage
          .from('attachments')
          .upload(fileName, file, { cacheControl: '3600', upsert: true })

        if (!error && data) {
          const { data: publicUrlData } = supabase.storage
            .from('attachments')
            .getPublicUrl(fileName)

          if (publicUrlData?.publicUrl) return publicUrlData.publicUrl
        }
      } catch (err) {
        console.warn('Supabase storage upload failed:', err)
      }
    }

    return isImageFile(file.name, file.type) ? await compressImage(file) : await readDocumentAsDataUrl(file)
  }

  const processFileAttachment = async (file) => {
    if (!file) return
    const ext = file.name.split('.').pop().toLowerCase()
    if (!ALLOWED_EXTENSIONS.includes(ext) && !file.type.startsWith('image/')) {
      dispatchNotification({
        title: 'Unsupported File Format',
        message: `File .${ext} is not supported.`,
        type: 'error',
      })
      return
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      dispatchNotification({
        title: 'File Size Exceeded',
        message: `File "${file.name}" exceeds 15MB limit.`,
        type: 'error',
      })
      return
    }

    const isImg = isImageFile(file.name, file.type)
    setAttachment({ file, url: '', name: file.name, size: file.size, type: file.type, isImage: isImg, isUploading: true })
    try {
      const uploadedUrl = await uploadChatAttachment(file)
      setAttachment({ file, url: uploadedUrl, name: file.name, size: file.size, type: file.type, isImage: isImg, isUploading: false })
    } catch (err) {
      console.error('File processing error:', err)
      setAttachment(null)
    }
  }

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0]
    if (file) processFileAttachment(file)
    e.target.value = ''
  }

  const handlePaste = (e) => {
    const items = e.clipboardData?.items
    if (!items) return
    for (const item of items) {
      if (item.kind === 'file') {
        const file = item.getAsFile()
        if (file) {
          e.preventDefault()
          processFileAttachment(file)
          break
        }
      }
    }
  }

  const handleDragOver = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(true)
  }

  const handleDragLeave = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDraggingOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFileAttachment(e.dataTransfer.files[0])
    }
  }

  const emitPresence = useCallback((isPresent = true) => {
    if (!ticketId) return
    const payload = { type: 'PRESENCE_HEARTBEAT', ticketId, senderName, senderRole, isPresent, timestamp: Date.now() }
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('netops_live_chat')
        bc.postMessage(payload)
        bc.close()
      }
    } catch {}
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('netops_presence_heartbeat', { detail: payload }))
  }, [ticketId, senderName, senderRole])

  const emitTyping = (isTyping) => {
    if (!ticketId) return
    const payload = { type: 'TYPING', ticketId, senderName, senderRole, isTyping }
    try {
      if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
        const bc = new BroadcastChannel('netops_live_chat')
        bc.postMessage(payload)
        bc.close()
      }
    } catch {}
    if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('netops_user_typing', { detail: payload }))
  }

  const handleInputChange = (val) => {
    setText(val)
    if (val.trim().length > 0) {
      emitTyping(true)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      typingTimerRef.current = setTimeout(() => emitTyping(false), 2500)
    } else {
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      emitTyping(false)
    }
  }

  useEffect(() => {
    let unsubscribe = () => {}
    let pollInterval = null

    const handlePresenceEvent = (payload) => {
      if (!payload || payload.ticketId !== ticketId || payload.senderRole === senderRole) return
      if (payload.isPresent) {
        setCounterpartyPresence({ senderName: payload.senderName, senderRole: payload.senderRole, lastSeen: payload.timestamp || Date.now() })
      } else {
        setCounterpartyPresence(null)
      }
    }

    const handleTypingEvent = (payload) => {
      if (!payload || payload.ticketId !== ticketId || payload.senderRole === senderRole) return
      if (payload.isTyping) {
        setTypingUser({ senderName: payload.senderName, senderRole: payload.senderRole })
        if (typingExpireRef.current) clearTimeout(typingExpireRef.current)
        typingExpireRef.current = setTimeout(() => setTypingUser(null), 3000)
      } else {
        if (typingExpireRef.current) clearTimeout(typingExpireRef.current)
        setTypingUser(null)
      }
    }

    async function loadFreshMessages(showLoading = false) {
      if (!ticketId) return
      if (showLoading) setLoading(true)
      const data = await fetchTicketReplies(ticketId)
      setMessages((prev) => (JSON.stringify(prev) === JSON.stringify(data) ? prev : data))
      if (showLoading) {
        setLoading(false)
        setTimeout(() => scrollToBottom('auto'), 50)
      }
    }

    const notifyIncoming = (incomingMsg) => {
      if (incomingMsg.senderRole !== senderRole) {
        dispatchNotification({ title: `New message from ${incomingMsg.senderName || 'Support'}`, message: incomingMsg.message, type: 'chat', ticketId })
      }
    }

    async function init() {
      if (!ticketId) return
      await loadFreshMessages(true)
      emitPresence(true)
      const heartbeatInterval = setInterval(() => emitPresence(true), 3500)
      const presenceCheckInterval = setInterval(() => {
        setCounterpartyPresence((prev) => (!prev || !prev.lastSeen || Date.now() - prev.lastSeen > 8000 ? null : prev))
      }, 4000)

      let chatChannel = null
      try {
        if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
          chatChannel = new BroadcastChannel('netops_live_chat')
          chatChannel.onmessage = (event) => {
            if (event.data?.type === 'NEW_REPLY' && event.data?.message?.ticketId === ticketId) {
              const incoming = event.data.message
              setMessages((prev) => {
                if (prev.some((m) => m.id === incoming.id)) return prev
                return [...prev.filter((m) => !m.isPending), incoming]
              })
              setTypingUser(null)
              notifyIncoming(incoming)
              setTimeout(() => scrollToBottom('smooth'), 50)
            } else if (event.data?.type === 'TYPING') handleTypingEvent(event.data)
            else if (event.data?.type === 'PRESENCE_HEARTBEAT') handlePresenceEvent(event.data)
          }
        }
      } catch (err) { console.warn('BroadcastChannel error:', err) }

      unsubscribe = subscribeToTicketReplies(ticketId, (newMsg) => {
        setMessages((prev) => {
          if (prev.some((m) => m.id === newMsg.id)) return prev
          return [...prev.filter((m) => !m.isPending), newMsg]
        })
        setTypingUser(null)
        notifyIncoming(newMsg)
        setTimeout(() => scrollToBottom('smooth'), 50)
      })

      const handleLocalReply = (e) => {
        if (e.detail?.ticketId === ticketId) {
          setMessages((prev) => {
            if (prev.some((m) => m.id === e.detail.id)) return prev
            return [...prev.filter((m) => !m.isPending), e.detail]
          })
          setTypingUser(null)
          notifyIncoming(e.detail)
          setTimeout(() => scrollToBottom('smooth'), 50)
        }
      }
      window.addEventListener('netops_reply_added', handleLocalReply)
      window.addEventListener('netops_user_typing', (e) => e.detail && handleTypingEvent(e.detail))
      window.addEventListener('netops_presence_heartbeat', (e) => e.detail && handlePresenceEvent(e.detail))

      pollInterval = setInterval(() => loadFreshMessages(false), 3000)

      return () => {
        clearInterval(heartbeatInterval)
        clearInterval(presenceCheckInterval)
        window.removeEventListener('netops_reply_added', handleLocalReply)
        emitPresence(false)
        if (chatChannel) chatChannel.close()
      }
    }

    const cleanup = init()
    return () => {
      unsubscribe()
      if (pollInterval) clearInterval(pollInterval)
      if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
      if (typingExpireRef.current) clearTimeout(typingExpireRef.current)
      emitPresence(false)
      cleanup.then((fn) => fn && fn())
    }
  }, [ticketId, senderRole, emitPresence])

  const handleSend = async (e) => {
    if (e) e.preventDefault()
    if ((!text.trim() && !attachment?.url) || sending || !ticketId || attachment?.isUploading) return
    if (typingTimerRef.current) clearTimeout(typingTimerRef.current)
    emitTyping(false)

    setSending(true)
    const msgText = text.trim()
    const attachPayload = attachment ? JSON.stringify({ url: attachment.url, name: attachment.name, size: attachment.size, isImage: attachment.isImage }) : null
    const tempId = `temp-${Date.now()}`
    const tempMsg = { id: tempId, ticketId, senderName, senderRole, message: msgText, attachmentUrl: attachPayload || attachment?.url || null, createdAt: new Date().toISOString(), isPending: true }

    setMessages((prev) => [...prev, tempMsg])
    setText('')
    setAttachment(null)
    setTimeout(() => scrollToBottom('smooth'), 0)

    try {
      const newMsg = await addTicketReply(ticketId, senderName, senderRole, msgText, attachPayload || attachment?.url)
      setMessages((prev) => prev.map((m) => (m.id === tempId ? newMsg : m)))
      try {
        const chatChannel = new BroadcastChannel('netops_live_chat')
        chatChannel.postMessage({ type: 'NEW_REPLY', message: newMsg })
        chatChannel.close()
      } catch {}
      window.dispatchEvent(new CustomEvent('netops_reply_added', { detail: newMsg }))
      if (onMessageSent) onMessageSent(newMsg)
    } catch (err) {
      console.error('Failed to send reply:', err)
      setMessages((prev) => prev.filter((m) => m.id !== tempId))
    } finally {
      setSending(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  const formatTime = (isoString) => {
    if (!isoString) return ''
    try { return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) } catch { return '' }
  }

  const roleBadges = {
    client: { label: 'Client', icon: User, style: 'bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700' },
    staff: { label: 'Support Engineer', icon: Headphones, style: 'bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700' },
    admin: { label: 'Administrator', icon: ShieldCheck, style: 'bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700' },
  }

  const isCounterpartyOnline = Boolean(
    counterpartyPresence &&
    counterpartyPresence.lastSeen &&
    Date.now() - counterpartyPresence.lastSeen < 8000
  )

  const counterpartyLabel = senderRole === 'client' ? 'Support Engineer' : 'Client'

  const downloadFileToPC = async (fileUrl, fileName = 'attachment') => {
    if (!fileUrl) return
    try {
      if (fileUrl.startsWith('data:')) {
        const link = document.createElement('a')
        link.href = fileUrl
        link.download = fileName || 'download'
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        return
      }

      const response = await fetch(fileUrl, { mode: 'cors' })
      const blob = await response.blob()
      const blobUrl = window.URL.createObjectURL(blob)

      const link = document.createElement('a')
      link.href = blobUrl
      link.download = fileName || fileUrl.split('/').pop() || 'download'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)

      setTimeout(() => {
        window.URL.revokeObjectURL(blobUrl)
      }, 200)
    } catch (err) {
      console.warn('CORS download fallback:', err)
      const link = document.createElement('a')
      link.href = fileUrl
      link.download = fileName || 'download'
      link.target = '_blank'
      link.rel = 'noreferrer'
      document.body.appendChild(link)
      link.click()
      document.body.removeChild(link)
    }
  }

  const parseAttachmentMeta = (m) => {
    const raw = m.attachmentUrl || m.attachment_url
    if (!raw) return null
    if (typeof raw === 'string' && raw.startsWith('{')) {
      try { return JSON.parse(raw) } catch {}
    }
    const isImg = isImageFile(raw)
    return { url: raw, name: raw.split('/').pop() || (isImg ? 'Photo Attachment' : 'Document Attachment'), isImage: isImg }
  }

  return (
    <div onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop} className="relative flex flex-col h-full rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-xs">
      <input type="file" ref={fileInputRef} accept="image/*,.pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,.csv,.zip,.rar,.7z,.log,.json" onChange={handleFileSelect} className="hidden" />

      <AnimatePresence>
        {isDraggingOver && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="absolute inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex flex-col items-center justify-center p-6 text-white border-2 border-dashed border-indigo-500 rounded-2xl">
            <UploadCloud size={48} className="text-indigo-400 mb-3 animate-bounce" />
            <h3 className="font-black text-xl">Drop File to Attach</h3>
            <p className="text-xs text-slate-300 font-medium mt-1">Supports Images, PDF, Word, Excel, Zip & Text files</p>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 bg-slate-50/40 dark:bg-slate-950/40 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-950 dark:text-white uppercase tracking-wider">
          <MessageSquare size={15} />
          <span>Live Inquiry Discussion</span>
        </div>
        <div className="flex items-center gap-2">
          <div className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-extrabold border transition-all ${isCounterpartyOnline ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700'}`}>
            <span className={`size-2 rounded-full ${isCounterpartyOnline ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
            <span>{isCounterpartyOnline ? `${counterpartyPresence.senderName || counterpartyLabel} is in chat` : `${counterpartyLabel} is offline`}</span>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading ? (
          <div className="flex justify-center py-12"><Loader2 size={24} className="animate-spin text-slate-900 dark:text-slate-100" /></div>
        ) : messages.map((m) => {
          const isCurrentSender = m.senderRole === senderRole
          const badge = roleBadges[m.senderRole] || roleBadges.client
          const BadgeIcon = badge.icon
          const attachMeta = parseAttachmentMeta(m)

          return (
            <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className={`flex flex-col ${isCurrentSender ? 'items-end' : 'items-start'}`}>
              <div className="flex items-center gap-2 mb-1 px-1">
                <span className="text-[11px] font-bold text-slate-950 dark:text-white">{m.senderName}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-black uppercase border ${badge.style}`}>
                  <BadgeIcon size={10} className="inline mr-1" /> {badge.label}
                </span>
                <span className="text-[10px] text-slate-500 font-medium">{formatTime(m.createdAt || m.created_at)}</span>
              </div>
              <div className={`max-w-[85%] rounded-2xl p-3.5 text-xs ${isCurrentSender ? 'bg-slate-900 text-white rounded-tr-none' : 'bg-slate-100 text-slate-900 rounded-tl-none'}`}>
                {m.message && <div className="whitespace-pre-wrap leading-relaxed">{m.message}</div>}
                {attachMeta && attachMeta.url && (
                  <div className="mt-2.5 pt-2 border-t border-slate-700/30">
                    {attachMeta.isImage ? (
                      <div className="group relative rounded-xl overflow-hidden border border-slate-300/60 dark:border-slate-700/60 bg-black/5 max-w-xs">
                        <img src={attachMeta.url} alt="Attachment" className="w-full h-auto max-h-56 object-contain rounded-lg cursor-pointer" onClick={() => setLightboxImage(attachMeta.url)} />
                        <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation()
                              downloadFileToPC(attachMeta.url, attachMeta.name)
                            }}
                            className="p-1.5 rounded-lg bg-slate-950/80 hover:bg-slate-950 text-white text-[10px] font-bold flex items-center gap-1 shadow-md transition-colors"
                            title="Download photo to PC"
                          >
                            <Download size={13} />
                            <span>Save PC</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3 p-3 rounded-xl border border-slate-300 dark:border-slate-700 bg-black/10 dark:bg-white/10 max-w-sm">
                        <div className="size-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0">
                          {(() => { const DocIcon = getDocumentIcon(attachMeta.name); return <DocIcon size={20} /> })()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <span className="font-bold text-xs truncate block">{attachMeta.name}</span>
                          <div className="flex items-center gap-2 text-[10px] opacity-75 font-semibold mt-0.5">
                            <span className="uppercase px-1.5 py-0.5 bg-black/20 dark:bg-white/20 rounded font-mono text-[9px]">
                              {getFileExtBadge(attachMeta.name)}
                            </span>
                            {attachMeta.size && <span>{formatFileSize(attachMeta.size)}</span>}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation()
                            downloadFileToPC(attachMeta.url, attachMeta.name)
                          }}
                          className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-[11px] flex items-center gap-1.5 shadow-sm transition-all shrink-0 cursor-pointer"
                          title="Download document to PC"
                        >
                          <Download size={13} />
                          <span>Save PC</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          )
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Real-time Messenger Typing Indicator */}
      <AnimatePresence>
        {typingUser && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            transition={{ duration: 0.18, ease: 'easeOut' }}
            className="px-4 py-2 border-t border-slate-200/60 dark:border-slate-800/60 bg-slate-50/80 dark:bg-slate-950/80 flex items-center gap-2 shrink-0"
          >
            <div className="flex items-center gap-2.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-full px-3.5 py-1.5 shadow-xs">
              <span className="text-[11px] font-bold text-slate-800 dark:text-slate-200">
                {typingUser.senderName || (typingUser.senderRole === 'client' ? 'Client' : 'Support Engineer')} is typing
              </span>
              <div className="flex items-center gap-1">
                <motion.span animate={{ y: [0, -3.5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0 }} className="size-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                <motion.span animate={{ y: [0, -3.5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.15 }} className="size-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
                <motion.span animate={{ y: [0, -3.5, 0] }} transition={{ repeat: Infinity, duration: 0.6, delay: 0.3 }} className="size-1.5 rounded-full bg-indigo-600 dark:bg-indigo-400" />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {attachment && (
          <motion.div className="px-3 py-2 bg-slate-50 dark:bg-slate-950 border-t border-slate-200 flex items-center gap-3">
            <div className="size-12 rounded-xl bg-black/5 flex items-center justify-center">
              {attachment.isImage ? <img src={attachment.url} className="w-full h-full object-cover rounded-xl" /> : <File size={22} />}
            </div>
            <div className="flex-1">
              <span className="text-xs font-bold block truncate">{attachment.name}</span>
              <span className="text-[10px]">{formatFileSize(attachment.size)} • {attachment.isUploading ? 'Uploading...' : 'Ready'}</span>
            </div>
            <button onClick={() => setAttachment(null)}><X size={15} /></button>
          </motion.div>
        )}
      </AnimatePresence>

      <form onSubmit={handleSend} className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-950/50 flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="p-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:border-slate-400 transition-all shadow-xs shrink-0 cursor-pointer"
          title="Attach photo or document (PDF, Word, Excel, Zip)"
        >
          <Paperclip size={18} />
        </button>

        <textarea
          rows={2}
          value={text}
          onChange={(e) => handleInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          placeholder={placeholder}
          className="flex-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-3 text-xs font-bold text-slate-950 dark:text-white placeholder-slate-500 dark:placeholder-slate-400 focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 resize-none transition-all shadow-xs"
        />

        <button
          type="submit"
          disabled={(!text.trim() && !attachment?.url) || sending || attachment?.isUploading}
          className="px-4 py-3 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-extrabold text-xs flex items-center justify-center gap-1.5 shadow-xs hover:bg-slate-800 dark:hover:bg-white disabled:opacity-50 transition-all shrink-0 cursor-pointer"
        >
          {sending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
          <span className="hidden sm:inline">Send</span>
        </button>
      </form>

      {/* Lightbox Photo Preview Modal with PC Download Button */}
      <AnimatePresence>
        {lightboxImage && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setLightboxImage(null)}
            className="fixed inset-0 z-[100] bg-slate-950/90 backdrop-blur-md flex items-center justify-center p-4 sm:p-8 cursor-pointer"
          >
            <div className="relative max-w-5xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
              <img
                src={lightboxImage}
                alt="Full preview"
                className="max-w-full max-h-[80vh] object-contain rounded-2xl shadow-2xl border border-slate-700"
              />

              <div className="mt-4 flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => downloadFileToPC(lightboxImage, 'photo_attachment.jpg')}
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-xs flex items-center gap-2 shadow-lg transition-colors cursor-pointer"
                >
                  <Download size={14} /> Download to PC
                </button>
                <button
                  type="button"
                  onClick={() => setLightboxImage(null)}
                  className="px-4 py-2 rounded-xl bg-slate-800 text-white font-bold text-xs flex items-center gap-2 border border-slate-700 hover:bg-slate-700 transition-colors cursor-pointer"
                >
                  <X size={14} /> Close
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
