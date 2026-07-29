import { AlertCircle } from 'lucide-react'

export function Field({ label, error, wide, children }) {
  return (
    <label className={wide ? 'form-field wide' : 'form-field'}>
      <span>{label}</span>
      {children}
      {error && (
        <small>
          <AlertCircle size={14} aria-hidden="true" /> {error}
        </small>
      )}
    </label>
  )
}
