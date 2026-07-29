import { useEffect, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { ClipboardCheck, MailCheck, Paperclip, X, Loader2, AlertCircle } from 'lucide-react'
import { priorities, requestTypes } from '../../../config/serviceOptions'
import { Field } from '../../../shared/components/Field'
import { validateRequiredFields, isValidEmail } from '../../../lib/formValidation'
import { createTicket } from '../../../lib/ticketService'
import { supabase, isSupabaseConfigured } from '../../../lib/supabaseClient'
import { logger } from '../../../lib/logger'

export function TicketModal({ account, isOpen, onClose, onTicketCreated }) {
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    company: '',
    department: requestTypes[0],
    subject: '',
    priority: priorities[1],
    productModel: '',
    siteLocation: '',
    description: '',
    attachment: '',
    attachmentName: '',
  })
  const [attachmentsList, setAttachmentsList] = useState([])
  const [errors, setErrors] = useState({})
  const [ticketId, setTicketId] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isUploading, setIsUploading] = useState(false)

  const requiredFields = useMemo(
    () => ['firstName', 'lastName', 'email', 'company', 'subject', 'productModel', 'siteLocation', 'description'],
    [],
  )

  useEffect(() => {
    if (isOpen) {
      setTicketId('')
      setIsSubmitting(false)
      setIsUploading(false)
      setAttachmentsList([])
    }
    if (!account) return

    const clientFirstName = account.firstName || (account.fullName ? account.fullName.split(' ')[0] : '')
    const clientLastName = account.lastName || (account.fullName ? account.fullName.split(' ').slice(1).join(' ') : '')

    setForm((current) => ({
      ...current,
      firstName: clientFirstName || current.firstName,
      lastName: clientLastName || current.lastName,
      email: account.email || current.email,
      company: account.company || account.companyName || current.company,
      siteLocation: account.siteAddress || current.siteLocation,
    }))
  }, [account, isOpen])

  const updateField = (field, value) => {
    setForm((current) => ({ ...current, [field]: value }))
    setErrors((current) => ({ ...current, [field]: '' }))
    setTicketId('')
  }

  const handleFileChange = async (event) => {
    const files = Array.from(event.target.files || [])
    if (files.length === 0) return

    setIsUploading(true)
    const newItems = []

    for (const file of files) {
      let uploadedUrl = ''

      if (isSupabaseConfigured && supabase) {
        try {
          const fileExt = file.name.split('.').pop()
          const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`

          const { data, error } = await supabase.storage
            .from('attachments')
            .upload(fileName, file, { cacheControl: '3600', upsert: true })

          if (!error && data) {
            const { data: publicUrlData } = supabase.storage
              .from('attachments')
              .getPublicUrl(fileName)

            if (publicUrlData?.publicUrl) {
              uploadedUrl = publicUrlData.publicUrl
            }
          }
        } catch (err) {
          logger.warn('Supabase storage upload returned error:', err)
        }
      }

      if (!uploadedUrl) {
        uploadedUrl = await new Promise((resolve) => {
          const reader = new FileReader()
          reader.onload = (e) => resolve(e.target.result)
          reader.onerror = () => resolve(file.name)
          reader.readAsDataURL(file)
        })
      }

      newItems.push({
        id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        name: file.name,
        url: uploadedUrl,
      })
    }

    setAttachmentsList((prev) => {
      const updated = [...prev, ...newItems]
      const urls = updated.map((item) => item.url)
      updateField('attachment', JSON.stringify(urls))
      return updated
    })

    setIsUploading(false)
    event.target.value = ''
  }

  const removeAttachment = (idToRemove) => {
    setAttachmentsList((prev) => {
      const updated = prev.filter((item) => item.id !== idToRemove)
      const urls = updated.map((item) => item.url)
      updateField('attachment', urls.length > 0 ? JSON.stringify(urls) : '')
      return updated
    })
  }

  const validate = () => {
    const nextErrors = validateRequiredFields(form, requiredFields)
    if (form.email && !isValidEmail(form.email)) {
      nextErrors.email = 'Enter a valid email address.'
    }
    setErrors(nextErrors)
    return Object.keys(nextErrors).length === 0
  }

  const handleSubmit = async (event) => {
    event.preventDefault()
    // Anti-duplicate protection: prevent submit if already submitting or if ticket was already created
    if (isSubmitting || ticketId) return
    if (!validate()) return

    setIsSubmitting(true)
    setErrors((prev) => ({ ...prev, submit: '' }))
    try {
      const attachmentPayload =
        attachmentsList.length > 0
          ? JSON.stringify(attachmentsList.map((item) => item.url))
          : form.attachment || ''

      const clientFullName = `${form.firstName.trim()} ${form.lastName.trim()}`.trim()

      const created = await createTicket({
        clientId: account?.id || account?.clientId || '',
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        clientName: clientFullName,
        fullName: clientFullName,
        companyName: form.company,
        email: form.email,
        phone: account?.phone || '',
        category: form.department,
        priority: form.priority,
        subject: form.subject,
        description: `[Product: ${form.productModel}] [Site: ${form.siteLocation}]\n\n${form.description}`,
        attachment: attachmentPayload,
      })
      setTicketId(created.ticketNumber || created.id)
      if (onTicketCreated) {
        onTicketCreated(created)
      }
    } catch (err) {
      logger.error('Ticket creation error:', err)
      setErrors((prev) => ({ ...prev, submit: err.message || 'Ticket creation failed. Please try again.' }))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          className="modal-backdrop"
          role="presentation"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <motion.div
            className="ticket-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ticket-modal-title"
            initial={{ opacity: 0, y: 34, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 24, scale: 0.98 }}
            transition={{ duration: 0.24 }}
          >
            <div className="modal-head">
              <div>
                <p className="micro-label">Account-tracked inquiry</p>
                <h2 id="ticket-modal-title">Create a ticket</h2>
              </div>
              <button className="icon-button" type="button" onClick={onClose} aria-label="Close ticket form">
                <X size={22} />
              </button>
            </div>

            <form className="ticket-form" onSubmit={handleSubmit} noValidate>
              {account && (
                <p className="account-note">
                  Client account <strong>{account.clientId || account.id}</strong> is attached to this ticket.
                </p>
              )}
              <Field label="First Name" error={errors.firstName}>
                <input
                  value={form.firstName}
                  onChange={(event) => updateField('firstName', event.target.value)}
                  autoComplete="given-name"
                  placeholder="First Name"
                  required
                />
              </Field>
              <Field label="Last Name" error={errors.lastName}>
                <input
                  value={form.lastName}
                  onChange={(event) => updateField('lastName', event.target.value)}
                  autoComplete="family-name"
                  placeholder="Last Name"
                  required
                />
              </Field>
              <Field label="Email" error={errors.email}>
                <input
                  type="email"
                  value={form.email}
                  onChange={(event) => updateField('email', event.target.value)}
                  autoComplete="email"
                  required
                />
              </Field>
              <Field label="Company / Organization" error={errors.company}>
                <input
                  value={form.company}
                  onChange={(event) => updateField('company', event.target.value)}
                  autoComplete="organization"
                  required
                />
              </Field>
              <Field label="Request Type">
                <select value={form.department} onChange={(event) => updateField('department', event.target.value)}>
                  {requestTypes.map((requestType) => (
                    <option key={requestType}>{requestType}</option>
                  ))}
                </select>
              </Field>
              <Field label="Priority">
                <select value={form.priority} onChange={(event) => updateField('priority', event.target.value)}>
                  {priorities.map((priority) => (
                    <option key={priority}>{priority}</option>
                  ))}
                </select>
              </Field>
              <Field label="Subject" error={errors.subject} wide>
                <input value={form.subject} onChange={(event) => updateField('subject', event.target.value)} required />
              </Field>
              <Field label="Product / Device Model" error={errors.productModel}>
                <input
                  value={form.productModel}
                  onChange={(event) => updateField('productModel', event.target.value)}
                  placeholder="Cisco Catalyst, FortiGate, AP, CCTV, etc."
                  required
                />
              </Field>
              <Field label="Site / Branch Location" error={errors.siteLocation}>
                <input
                  value={form.siteLocation}
                  onChange={(event) => updateField('siteLocation', event.target.value)}
                  required
                />
              </Field>
              <Field label="Description" error={errors.description} wide>
                <textarea
                  value={form.description}
                  onChange={(event) => updateField('description', event.target.value)}
                  rows="5"
                  required
                />
              </Field>
              <div className="space-y-2">
                <label className="file-field">
                  <Paperclip size={18} aria-hidden="true" />
                  <span>
                    {isUploading
                      ? 'Uploading files...'
                      : attachmentsList.length > 0
                      ? `Attach More Files (${attachmentsList.length} attached)`
                      : 'Add attachments (Images, PDFs, Docs)'}
                  </span>
                  <input
                    type="file"
                    multiple
                    accept="image/*,.pdf,.doc,.docx,.txt"
                    onChange={handleFileChange}
                    disabled={isUploading}
                  />
                </label>

                {/* Attached Files List */}
                {attachmentsList.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {attachmentsList.map((item) => (
                      <div
                        key={item.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[var(--paper)] text-[var(--teal-dark)] dark:text-[var(--teal)] border border-[var(--line)] text-xs font-bold shadow-xs"
                      >
                        <Paperclip size={13} className="shrink-0" />
                        <span className="truncate max-w-[160px]">{item.name}</span>
                        <button
                          type="button"
                          onClick={() => removeAttachment(item.id)}
                          className="hover:text-red-500 transition-colors p-0.5 rounded-md hover:bg-red-500/10"
                          title="Remove file"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <AnimatePresence>
                {errors.submit && (
                  <motion.p
                    className="flex items-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-3.5 text-xs font-bold text-red-600 dark:text-red-400"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    role="alert"
                  >
                    <AlertCircle size={18} className="shrink-0 text-red-500" />
                    <span>{errors.submit}</span>
                  </motion.p>
                )}
                {ticketId && (
                  <motion.p
                    className="success-message"
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 8 }}
                    role="status"
                    aria-live="polite"
                  >
                    <MailCheck size={18} aria-hidden="true" />
                    Ticket created: <strong>{ticketId}</strong>
                  </motion.p>
                )}
              </AnimatePresence>

              <div className="modal-actions">
                <button className="secondary-action" type="button" onClick={onClose}>
                  Cancel
                </button>
                <button
                  className="primary-action disabled:opacity-50 disabled:cursor-not-allowed"
                  type="submit"
                  disabled={isSubmitting || !!ticketId}
                >
                  {isSubmitting ? (
                    <>
                      Submitting... <Loader2 size={18} className="animate-spin" />
                    </>
                  ) : ticketId ? (
                    <>
                      Submitted <MailCheck size={18} />
                    </>
                  ) : (
                    <>
                      Submit Ticket <ClipboardCheck size={18} aria-hidden="true" />
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
