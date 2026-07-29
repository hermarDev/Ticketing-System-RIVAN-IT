/**
 * Opens an attachment URL in a new browser tab, converting data: URLs to Blob URLs first.
 * @param {string} attachmentUrl - HTTP(S) URL or base64 data: URL of the attachment
 * @param {string} [defaultName='attachment'] - Filename used when triggering a fallback download
 * @returns {void}
 */
export function openAttachment(attachmentUrl, defaultName = 'attachment') {
  if (!attachmentUrl || typeof attachmentUrl !== 'string') return

  if (attachmentUrl.startsWith('data:')) {
    try {
      const parts = attachmentUrl.split(',')
      if (parts.length < 2) return

      const mimeMatch = parts[0].match(/:(.*?);/)
      const mime = mimeMatch ? mimeMatch[1] : 'application/octet-stream'
      const bstr = atob(parts[1])
      let n = bstr.length
      const u8arr = new Uint8Array(n)
      while (n--) {
        u8arr[n] = bstr.charCodeAt(n)
      }
      const blob = new Blob([u8arr], { type: mime })
      const blobUrl = URL.createObjectURL(blob)

      const win = window.open(blobUrl, '_blank')
      if (!win) {
        // If popup blocker blocked new tab, trigger direct download
        const link = document.createElement('a')
        link.href = blobUrl
        link.download = defaultName
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
      }
      return
    } catch (err) {
      console.error('Failed to convert data URL to blob:', err)
    }
  }

  window.open(attachmentUrl, '_blank', 'noopener,noreferrer')
}

/**
 * Normalizes an attachment field (string, JSON array string, or array) into a flat array of URLs.
 * @param {string|Array|null} attachment - Raw attachment value from a ticket record
 * @returns {Array<string>} Array of attachment URL strings
 */
export function parseAttachments(attachment) {
  if (!attachment) return []
  if (Array.isArray(attachment)) return attachment.filter(Boolean)
  if (typeof attachment === 'string') {
    const trimmed = attachment.trim()
    if (!trimmed) return []
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed.filter(Boolean)
      } catch {
        // Fallthrough if parse fails
      }
    }
    return [trimmed]
  }
  return []
}

/**
 * Returns true if the URL points to an image (by extension or data: MIME type).
 * @param {string} url - URL or data: string to test
 * @returns {boolean}
 */
export function isImageUrl(url) {
  if (!url || typeof url !== 'string') return false
  if (url.startsWith('data:image/')) return true
  const lower = url.toLowerCase()
  return (
    lower.includes('.png') ||
    lower.includes('.jpg') ||
    lower.includes('.jpeg') ||
    lower.includes('.gif') ||
    lower.includes('.webp') ||
    lower.includes('.svg')
  )
}

/**
 * Returns a human-readable label for an attachment URL.
 * @param {string} url - Attachment URL or data: string
 * @returns {string} Display label for the attachment
 */
export function getAttachmentLabel(url) {
  if (!url || typeof url !== 'string') return 'Attachment File'
  if (url.startsWith('http://') || url.startsWith('https://')) {
    const filename = url.split('/').pop()?.split('?')[0]
    return filename && filename.length < 30 ? filename : 'View Attached File'
  }
  if (url.startsWith('data:application/pdf')) return 'PDF Document'
  if (url.startsWith('data:image/')) return 'Image Attachment'
  if (url.startsWith('data:')) return 'Document Attachment'
  return url.length > 30 ? 'Attached File' : url
}
