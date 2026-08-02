function getUrgencyToneClass(urgency) {
  const value = urgency || 'Normal'
  if (value === 'Critical' || value === 'High') {
    return 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800'
  }
  if (value === 'Normal') {
    return 'bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800'
  }
  return 'bg-slate-100 text-slate-900 border-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:border-slate-700'
}

export function UrgencyBadge({ urgency, className = '', showSuffix = true }) {
  const value = urgency || 'Normal'
  const label = showSuffix ? `${value} Urgency` : value
  const toneClass = getUrgencyToneClass(value)

  return (
    <span className={`inline-flex rounded-md px-2.5 py-0.5 text-[11px] font-bold border ${toneClass} ${className}`.trim()}>
      {label}
    </span>
  )
}
