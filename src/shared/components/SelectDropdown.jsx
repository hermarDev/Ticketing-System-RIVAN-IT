import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Check, ChevronDown } from 'lucide-react'

/**
 * Custom dropdown select rendered via a portal to <body>.
 *
 * Replaces native <select> inside framer-motion-animated modals, where
 * Chromium mispositions the native popup when an ancestor carries a CSS
 * transform (the modal's y/scale animation) — worst in device-emulation mode.
 * A portal + fixed positioning is immune to ancestor transforms, clipping,
 * and stacking-context issues.
 *
 * API mirrors a native <select>:
 *   <SelectDropdown
 *     value={value}
 *     onChange={(next) => setValue(next)}
 *     options={[{ value, label }, ...] | ['a', 'b']}
 *     placeholder="Select…"
 *     ariaLabel="…"            // optional, defaults to placeholder
 *     disabled={false}
 *     className=""             // classes for the trigger button
 *     optionClassName=""       // optional classes for option rows
 *     align="start" | "end"    // horizontal alignment of the popup
 *   />
 */
export function SelectDropdown({
  id,
  value,
  onChange,
  options = [],
  placeholder = 'Select…',
  ariaLabel,
  disabled = false,
  className = '',
  optionClassName = '',
  align = 'start',
}) {
  const [isOpen, setIsOpen] = useState(false)
  const [popupStyle, setPopupStyle] = useState(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)

  const normalized = useMemo(
    () =>
      options.map((opt) =>
        typeof opt === 'string' || typeof opt === 'number'
          ? { value: opt, label: String(opt) }
          : { value: opt.value, label: opt.label ?? String(opt.value) }
      ),
    [options],
  )

  const selected = normalized.find((opt) => String(opt.value) === String(value))

  // Measure the trigger and position the popup below it, viewport-fixed.
  const updatePopupPosition = useCallback(() => {
    const el = triggerRef.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    setPopupStyle({
      top: `${rect.bottom + 4}px`,
      left: align === 'end' ? undefined : `${rect.left}px`,
      right: align === 'end' ? `${window.innerWidth - rect.right}px` : undefined,
      minWidth: `${rect.width}px`,
    })
  }, [align])

  // Reposition on scroll/resize while open (any scrollable ancestor).
  useEffect(() => {
    if (!isOpen) return
    updatePopupPosition()
    window.addEventListener('resize', updatePopupPosition)
    window.addEventListener('scroll', updatePopupPosition, true)
    return () => {
      window.removeEventListener('resize', updatePopupPosition)
      window.removeEventListener('scroll', updatePopupPosition, true)
    }
  }, [isOpen, updatePopupPosition])

  // Close on outside click or Escape.
  useEffect(() => {
    if (!isOpen) return
    const handlePointerDown = (event) => {
      if (
        triggerRef.current?.contains(event.target) ||
        listRef.current?.contains(event.target)
      ) {
        return
      }
      setIsOpen(false)
    }
    const handleKeyDown = (event) => {
      if (event.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('mousedown', handlePointerDown)
    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('mousedown', handlePointerDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen])

  const select = (opt) => {
    onChange(opt.value)
    setIsOpen(false)
  }

  return (
    <>
      <button
        ref={triggerRef}
        id={id}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-label={ariaLabel || placeholder}
        onClick={() => {
          if (disabled) return
          if (isOpen) {
            setIsOpen(false)
          } else {
            updatePopupPosition()
            setIsOpen(true)
          }
        }}
        className={`flex items-center justify-between gap-2 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${className}`}
      >
        <span className={`truncate ${selected ? '' : 'opacity-60'}`}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
          aria-hidden="true"
        />
      </button>

      {isOpen &&
        createPortal(
          <div
            ref={listRef}
            role="listbox"
            aria-label={ariaLabel || placeholder}
            style={popupStyle}
            className="fixed z-[100] mt-0.5 max-h-64 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-xl p-1.5 space-y-1"
          >
            {normalized.map((opt) => {
              const isSelected = String(opt.value) === String(value)
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  key={String(opt.value)}
                  onClick={() => select(opt)}
                  className={`w-full text-left flex items-center justify-between gap-2 px-2.5 py-2 text-xs font-bold rounded-xl transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                      : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-white'
                  } ${optionClassName}`}
                >
                  <span className="truncate">{opt.label}</span>
                  {isSelected && (
                    <Check size={12} className="shrink-0 text-slate-900 dark:text-white" />
                  )}
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
