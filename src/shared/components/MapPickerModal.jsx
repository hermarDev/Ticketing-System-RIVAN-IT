import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { AlertCircle, Crosshair, Loader2, MapPin, Search, X } from 'lucide-react'
import {
  DEFAULT_MAP_CENTER,
  reverseGeocodeNominatim,
  searchAddressNominatim,
} from '../../lib/locationService'

const REVERSE_DEBOUNCE_MS = 450
const SEARCH_DEBOUNCE_MS = 300
const SEARCH_MIN_CHARS = 2
const MAP_MIN_HEIGHT_PX = 320

function isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    err?.code === 20 ||
    err?.code === 'ABORT_ERR'
  )
}

/**
 * Interactive OSM map picker (Leaflet loaded on open only).
 * Confirm is enabled only after a successful reverse geocode with a non-empty address.
 *
 * @param {{
 *   open: boolean,
 *   onClose: () => void,
 *   onConfirm: (place: {
 *     addressString: string,
 *     displayName?: string,
 *     lat: number,
 *     lng: number,
 *     [key: string]: unknown,
 *   }) => void,
 *   lat?: number | null,
 *   lng?: number | null,
 * }} props
 */
export function MapPickerModal({ open, onClose, onConfirm, lat = null, lng = null }) {
  const titleId = useId()
  const descId = useId()
  const previewId = useId()
  const errorId = useId()
  const searchInputId = useId()
  const listboxId = `${searchInputId}-listbox`
  const searchErrorId = `${searchInputId}-search-error`
  const searchStatusId = `${searchInputId}-status`

  const dialogRef = useRef(null)
  const mapContainerRef = useRef(null)
  const mapRef = useRef(null)
  const markerRef = useRef(null)
  const leafletRef = useRef(null)
  const previousFocusRef = useRef(null)
  const reverseTimerRef = useRef(null)
  const reverseAbortRef = useRef(null)
  const searchTimerRef = useRef(null)
  const searchAbortRef = useRef(null)
  const searchRequestIdRef = useRef(0)
  const lastSelectedQueryRef = useRef('')
  const latestQueryRef = useRef('')
  const dismissedQueryRef = useRef('')
  const inputFocusedRef = useRef(false)
  const searchWrapperRef = useRef(null)
  const setPinAndReverseRef = useRef(null)
  const openRef = useRef(open)
  /** True when Esc should cancel search UI instead of closing the modal. */
  const searchEscapesModalRef = useRef(false)

  const [leafletReady, setLeafletReady] = useState(false)
  const [leafletError, setLeafletError] = useState('')
  const [pin, setPin] = useState({ lat: null, lng: null })
  const [preview, setPreview] = useState(null)
  const [isReversing, setIsReversing] = useState(false)
  const [reverseError, setReverseError] = useState('')
  const [isCentering, setIsCentering] = useState(false)
  const [centerError, setCenterError] = useState('')

  const [searchQuery, setSearchQuery] = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [isSearchOpen, setIsSearchOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState('')
  const [searchEmpty, setSearchEmpty] = useState(false)

  openRef.current = open
  searchEscapesModalRef.current =
    isSearching || (isSearchOpen && suggestions.length > 0)

  const previewAddress = String(preview?.addressString || preview?.displayName || '').trim()
  const canConfirm =
    Boolean(previewAddress) &&
    Number.isFinite(pin.lat) &&
    Number.isFinite(pin.lng) &&
    !isReversing &&
    !reverseError

  const abortInFlightReverse = () => {
    if (reverseAbortRef.current) {
      reverseAbortRef.current.abort()
      reverseAbortRef.current = null
    }
  }

  const clearReverseTimer = () => {
    if (reverseTimerRef.current) {
      clearTimeout(reverseTimerRef.current)
      reverseTimerRef.current = null
    }
  }

  const abortInFlightSearch = () => {
    if (searchAbortRef.current) {
      searchAbortRef.current.abort()
      searchAbortRef.current = null
    }
  }

  const clearSearchTimer = () => {
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
      searchTimerRef.current = null
    }
  }

  const resetSearchState = useCallback(() => {
    clearSearchTimer()
    abortInFlightSearch()
    searchRequestIdRef.current += 1
    lastSelectedQueryRef.current = ''
    latestQueryRef.current = ''
    dismissedQueryRef.current = ''
    inputFocusedRef.current = false
    setSearchQuery('')
    setSuggestions([])
    setIsSearchOpen(false)
    setActiveIndex(-1)
    setIsSearching(false)
    setSearchError('')
    setSearchEmpty(false)
  }, [])

  const dismissSearchPopup = useCallback(() => {
    dismissedQueryRef.current = latestQueryRef.current
    clearSearchTimer()
    abortInFlightSearch()
    searchRequestIdRef.current += 1
    setIsSearching(false)
    setIsSearchOpen(false)
    setActiveIndex(-1)
  }, [])

  const runReverse = useCallback(async (nextLat, nextLng) => {
    if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return

    abortInFlightReverse()
    const controller = new AbortController()
    reverseAbortRef.current = controller

    setIsReversing(true)
    setReverseError('')
    setPreview(null)

    try {
      const place = await reverseGeocodeNominatim(nextLat, nextLng, {
        signal: controller.signal,
      })
      if (controller.signal.aborted || reverseAbortRef.current !== controller) return
      setPreview(place)
      setReverseError('')
    } catch (err) {
      if (isAbortError(err) || controller.signal.aborted) return
      if (reverseAbortRef.current !== controller) return
      setPreview(null)
      setReverseError(
        err?.message ||
          'Could not resolve address for this location. You can still type it manually.',
      )
    } finally {
      if (reverseAbortRef.current === controller) {
        reverseAbortRef.current = null
        setIsReversing(false)
      }
    }
  }, [])

  const scheduleReverse = useCallback(
    (nextLat, nextLng) => {
      clearReverseTimer()
      // Cancel any in-flight reverse so a late response cannot overwrite.
      abortInFlightReverse()
      setIsReversing(true)
      setReverseError('')
      setPreview(null)

      reverseTimerRef.current = setTimeout(() => {
        reverseTimerRef.current = null
        runReverse(nextLat, nextLng)
      }, REVERSE_DEBOUNCE_MS)
    },
    [runReverse],
  )

  const setPinAndReverse = useCallback(
    (nextLat, nextLng, { pan = false } = {}) => {
      if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) return
      setPin({ lat: nextLat, lng: nextLng })
      setCenterError('')

      const L = leafletRef.current
      const map = mapRef.current
      if (L && map) {
        if (!markerRef.current) {
          markerRef.current = L.marker([nextLat, nextLng], { draggable: true }).addTo(map)
          markerRef.current.on('dragend', () => {
            const pos = markerRef.current?.getLatLng()
            if (!pos) return
            setPinAndReverseRef.current?.(pos.lat, pos.lng)
          })
        } else {
          markerRef.current.setLatLng([nextLat, nextLng])
        }
        if (pan) {
          map.setView([nextLat, nextLng], Math.max(map.getZoom(), 15))
        }
      }

      scheduleReverse(nextLat, nextLng)
    },
    [scheduleReverse],
  )

  setPinAndReverseRef.current = setPinAndReverse

  const selectSuggestion = useCallback(
    (item) => {
      if (!item) return
      const label = item.displayName || item.addressString || ''
      const trimmed = label.trim()
      clearSearchTimer()
      abortInFlightSearch()
      searchRequestIdRef.current += 1
      lastSelectedQueryRef.current = trimmed
      dismissedQueryRef.current = ''
      latestQueryRef.current = trimmed
      setSearchQuery(label)
      setSuggestions([])
      setIsSearchOpen(false)
      setActiveIndex(-1)
      setIsSearching(false)
      setSearchError('')
      setSearchEmpty(false)
      if (Number.isFinite(item.lat) && Number.isFinite(item.lng)) {
        setPinAndReverse(item.lat, item.lng, { pan: true })
      }
    },
    [setPinAndReverse],
  )

  // Debounced forward search while the modal is open.
  useEffect(() => {
    if (!open) return undefined

    const query = searchQuery.trim()
    latestQueryRef.current = query

    // Skip re-search for the exact label just selected (survives Strict Mode double-invoke).
    if (query && query === lastSelectedQueryRef.current) {
      return undefined
    }

    if (query.length < SEARCH_MIN_CHARS) {
      clearSearchTimer()
      abortInFlightSearch()
      searchRequestIdRef.current += 1
      setSuggestions([])
      setIsSearchOpen(false)
      setActiveIndex(-1)
      setIsSearching(false)
      setSearchError('')
      setSearchEmpty(false)
      dismissedQueryRef.current = ''
      return undefined
    }

    // Invalidate any in-flight result and hide stale suggestions immediately.
    clearSearchTimer()
    abortInFlightSearch()
    searchRequestIdRef.current += 1
    setSuggestions([])
    setIsSearchOpen(false)
    setActiveIndex(-1)
    setSearchEmpty(false)
    setSearchError('')
    setIsSearching(false)

    const scheduledQuery = query
    searchTimerRef.current = setTimeout(async () => {
      searchTimerRef.current = null
      if (latestQueryRef.current !== scheduledQuery) return

      abortInFlightSearch()
      const controller = new AbortController()
      searchAbortRef.current = controller
      const reqId = ++searchRequestIdRef.current
      const requestQuery = scheduledQuery

      setIsSearching(true)
      setSearchError('')
      setSearchEmpty(false)
      setSuggestions([])
      setIsSearchOpen(false)
      setActiveIndex(-1)

      try {
        const results = await searchAddressNominatim(requestQuery, {
          signal: controller.signal,
        })
        if (reqId !== searchRequestIdRef.current) return
        if (controller.signal.aborted) return
        if (latestQueryRef.current !== requestQuery) return

        const next = Array.isArray(results) ? results : []
        setSuggestions(next)
        setSearchEmpty(next.length === 0)
        setActiveIndex(-1)

        const userDismissed = dismissedQueryRef.current === requestQuery
        if (next.length > 0 && inputFocusedRef.current && !userDismissed) {
          setIsSearchOpen(true)
        } else {
          setIsSearchOpen(false)
        }
      } catch (err) {
        if (isAbortError(err) || controller.signal.aborted) return
        if (reqId !== searchRequestIdRef.current) return
        if (latestQueryRef.current !== requestQuery) return
        setSuggestions([])
        setIsSearchOpen(false)
        setActiveIndex(-1)
        setSearchEmpty(false)
        setSearchError(
          err?.message || 'Address search failed. You can still pick a point on the map.',
        )
      } finally {
        if (reqId === searchRequestIdRef.current) {
          if (searchAbortRef.current === controller) searchAbortRef.current = null
          setIsSearching(false)
        }
      }
    }, SEARCH_DEBOUNCE_MS)

    return () => {
      clearSearchTimer()
      abortInFlightSearch()
      searchRequestIdRef.current += 1
    }
  }, [open, searchQuery])

  // Load Leaflet + init map when modal opens (lat/lng snapped at open time only).
  useEffect(() => {
    if (!open) return undefined

    let cancelled = false
    let sizeTimer = null

    const startWithPin = Number.isFinite(lat) && Number.isFinite(lng)
    const initial = startWithPin
      ? { lat, lng, zoom: 16 }
      : {
          lat: DEFAULT_MAP_CENTER.lat,
          lng: DEFAULT_MAP_CENTER.lng,
          zoom: DEFAULT_MAP_CENTER.zoom,
        }

    const boot = async () => {
      setLeafletError('')
      setLeafletReady(false)
      setPreview(null)
      setReverseError('')
      setCenterError('')
      setIsReversing(false)
      setIsCentering(false)
      setPin(startWithPin ? { lat: initial.lat, lng: initial.lng } : { lat: null, lng: null })
      resetSearchState()

      try {
        const leafletMod = await import('leaflet')
        await import('leaflet/dist/leaflet.css')
        if (cancelled) return

        const L = leafletMod.default || leafletMod
        leafletRef.current = L

        // Vite asset URLs for default marker icons (Leaflet's relative paths break with bundlers).
        const [iconRetina, icon, shadow] = await Promise.all([
          import('leaflet/dist/images/marker-icon-2x.png'),
          import('leaflet/dist/images/marker-icon.png'),
          import('leaflet/dist/images/marker-shadow.png'),
        ])
        if (cancelled) return

        delete L.Icon.Default.prototype._getIconUrl
        L.Icon.Default.mergeOptions({
          iconRetinaUrl: iconRetina.default,
          iconUrl: icon.default,
          shadowUrl: shadow.default,
        })

        // Wait a frame so the container has layout size.
        await new Promise((resolve) => requestAnimationFrame(() => resolve()))
        if (cancelled || !mapContainerRef.current) return

        if (mapRef.current) {
          mapRef.current.remove()
          mapRef.current = null
          markerRef.current = null
        }

        const map = L.map(mapContainerRef.current, {
          center: [initial.lat, initial.lng],
          zoom: initial.zoom,
          scrollWheelZoom: true,
        })

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          maxZoom: 19,
          attribution:
            '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors',
        }).addTo(map)

        map.on('click', (event) => {
          const { lat: clickLat, lng: clickLng } = event.latlng
          setPinAndReverseRef.current?.(clickLat, clickLng)
        })

        mapRef.current = map
        setLeafletReady(true)

        // Invalidate size after paint (modal animation / flex layout).
        requestAnimationFrame(() => {
          if (!cancelled && mapRef.current) mapRef.current.invalidateSize()
        })
        sizeTimer = setTimeout(() => {
          if (!cancelled && mapRef.current) mapRef.current.invalidateSize()
        }, 280)

        if (startWithPin) {
          setPinAndReverseRef.current?.(initial.lat, initial.lng)
        }
      } catch (err) {
        if (cancelled) return
        setLeafletError(
          err?.message ||
            'Map failed to load. Close this dialog and type the address, or use search / GPS.',
        )
      }
    }

    boot()

    return () => {
      cancelled = true
      if (sizeTimer) clearTimeout(sizeTimer)
      clearReverseTimer()
      abortInFlightReverse()
      clearSearchTimer()
      abortInFlightSearch()
      if (mapRef.current) {
        mapRef.current.remove()
        mapRef.current = null
      }
      markerRef.current = null
      leafletRef.current = null
      setLeafletReady(false)
    }
    // Intentional: re-boot only when the modal opens; lat/lng are snapped from that render.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only lat/lng snap
  }, [open])

  // Focus management: trap Tab, Esc closes listbox first then modal, restore focus on close.
  useEffect(() => {
    if (!open) return undefined

    previousFocusRef.current = document.activeElement
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'

    const focusDialog = () => {
      const root = dialogRef.current
      if (!root) return
      const preferred =
        root.querySelector('[data-autofocus]') ||
        root.querySelector(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        )
      preferred?.focus?.()
    }

    const frame = requestAnimationFrame(focusDialog)

    const getFocusable = () => {
      const root = dialogRef.current
      if (!root) return []
      return Array.from(
        root.querySelectorAll(
          'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute('disabled') && el.getAttribute('aria-hidden') !== 'true')
    }

    const onKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        event.stopPropagation()
        if (searchEscapesModalRef.current) {
          dismissSearchPopup()
          return
        }
        onClose?.()
        return
      }
      if (event.key !== 'Tab') return

      const focusable = getFocusable()
      if (focusable.length === 0) {
        event.preventDefault()
        dialogRef.current?.focus?.()
        return
      }

      const first = focusable[0]
      const last = focusable[focusable.length - 1]
      const active = document.activeElement

      if (event.shiftKey) {
        if (active === first || !dialogRef.current?.contains(active)) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || !dialogRef.current?.contains(active)) {
        event.preventDefault()
        first.focus()
      }
    }

    document.addEventListener('keydown', onKeyDown, true)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKeyDown, true)
      document.body.style.overflow = previousOverflow
      const prev = previousFocusRef.current
      if (prev && typeof prev.focus === 'function') {
        try {
          prev.focus()
        } catch {
          // ignore
        }
      }
    }
  }, [open, onClose, dismissSearchPopup])

  // Abort in-flight work when the modal closes (parent may keep the instance mounted).
  useEffect(() => {
    if (open) return undefined
    clearReverseTimer()
    abortInFlightReverse()
    clearSearchTimer()
    abortInFlightSearch()
    searchRequestIdRef.current += 1
    lastSelectedQueryRef.current = ''
    latestQueryRef.current = ''
    dismissedQueryRef.current = ''
    inputFocusedRef.current = false
    setIsReversing(false)
    setIsCentering(false)
    setIsSearching(false)
    setSuggestions([])
    setIsSearchOpen(false)
    setActiveIndex(-1)
    setSearchError('')
    setSearchEmpty(false)
    setSearchQuery('')
    return undefined
  }, [open])

  const handleCenterOnMe = () => {
    if (isCentering || !leafletReady) return
    setCenterError('')
    setIsCentering(true)
    setIsSearchOpen(false)
    setActiveIndex(-1)

    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setIsCentering(false)
      setCenterError('Geolocation is not supported in this browser.')
      return
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        if (!openRef.current) return
        setIsCentering(false)
        const nextLat = position?.coords?.latitude
        const nextLng = position?.coords?.longitude
        if (!Number.isFinite(nextLat) || !Number.isFinite(nextLng)) {
          setCenterError('Current location is unavailable. Try again or pick a point on the map.')
          return
        }
        setPinAndReverse(nextLat, nextLng, { pan: true })
      },
      (geoError) => {
        if (!openRef.current) return
        setIsCentering(false)
        const code = geoError?.code
        if (code === 1) {
          setCenterError(
            'Location permission denied. Allow location access or pick a point on the map.',
          )
          return
        }
        if (code === 3) {
          setCenterError('Location request timed out. Try again or pick a point on the map.')
          return
        }
        setCenterError('Current location is unavailable. Try again or pick a point on the map.')
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 },
    )
  }

  const handleConfirm = () => {
    if (!canConfirm || !preview) return
    onConfirm?.({
      ...preview,
      addressString: preview.addressString || preview.displayName || '',
      lat: pin.lat,
      lng: pin.lng,
    })
  }

  const handleBackdropClick = (event) => {
    if (event.target === event.currentTarget) onClose?.()
  }

  const handleSearchChange = (event) => {
    dismissedQueryRef.current = ''
    setSearchError('')
    setSearchEmpty(false)
    setSearchQuery(event.target.value)
  }

  const handleSearchKeyDown = (event) => {
    if (event.key === 'Escape') {
      if (isSearching || isSearchOpen) {
        event.preventDefault()
        event.stopPropagation()
        dismissSearchPopup()
      }
      return
    }

    if (!isSearchOpen || suggestions.length === 0) return

    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((current) => (current + 1) % suggestions.length)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((current) =>
        current <= 0 ? suggestions.length - 1 : current - 1,
      )
      return
    }
    if (event.key === 'Enter') {
      event.preventDefault()
      if (activeIndex >= 0 && suggestions[activeIndex]) {
        selectSuggestion(suggestions[activeIndex])
      } else {
        dismissSearchPopup()
      }
    }
  }

  const handleSearchFocus = () => {
    inputFocusedRef.current = true
    if (
      suggestions.length > 0 &&
      dismissedQueryRef.current !== latestQueryRef.current
    ) {
      setIsSearchOpen(true)
    }
  }

  const handleSearchWrapperBlur = (event) => {
    const next = event.relatedTarget
    if (searchWrapperRef.current?.contains(next)) return
    inputFocusedRef.current = false
    setIsSearchOpen(false)
    setActiveIndex(-1)
  }

  const listVisible = isSearchOpen && suggestions.length > 0
  const activeOptionId =
    activeIndex >= 0 && suggestions[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined
  const searchDescribedBy = [
    searchError ? searchErrorId : null,
    !searchError && (isSearching || searchEmpty) ? searchStatusId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined

  return (
    <AnimatePresence>
      {open ? (
        <div
          className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-slate-950/75 p-0 sm:p-4 backdrop-blur-md"
          onMouseDown={handleBackdropClick}
        >
          <motion.div
            key="map-picker-modal"
            ref={dialogRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={descId}
            tabIndex={-1}
            className="relative flex w-full max-w-2xl max-h-[94dvh] flex-col overflow-hidden rounded-t-2xl sm:rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-950 dark:text-white shadow-2xl outline-none"
            initial={{ opacity: 0, y: 24, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-5 py-3.5 shrink-0">
              <div className="flex items-center gap-3 min-w-0">
                <span className="grid size-10 place-items-center rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200 dark:border-slate-700 shadow-xs shrink-0">
                  <MapPin size={20} aria-hidden="true" />
                </span>
                <div className="min-w-0">
                  <span className="text-[11px] font-bold uppercase tracking-widest text-slate-700 dark:text-slate-400">
                    Site location
                  </span>
                  <h2
                    id={titleId}
                    className="text-lg sm:text-xl font-black tracking-tight truncate"
                  >
                    Select on map
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onClose?.()}
                className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors shrink-0"
                aria-label="Close map picker"
              >
                <X size={20} aria-hidden="true" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 sm:px-5 py-3.5 space-y-3">
              <p
                id={descId}
                className="text-[11px] sm:text-xs font-medium text-slate-600 dark:text-slate-400 leading-relaxed"
              >
                Search for a place, or click the map / drag the pin. Use GPS if the map is hard to
                use.
              </p>

              <div
                ref={searchWrapperRef}
                className="relative z-20"
                onBlur={handleSearchWrapperBlur}
              >
                <label
                  htmlFor={searchInputId}
                  className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1"
                >
                  Search address or place
                </label>
                <div className="relative">
                  <Search
                    size={15}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                    aria-hidden="true"
                  />
                  <input
                    id={searchInputId}
                    type="text"
                    role="combobox"
                    aria-expanded={listVisible}
                    aria-controls={listVisible ? listboxId : undefined}
                    aria-haspopup="listbox"
                    aria-autocomplete="list"
                    aria-activedescendant={activeOptionId}
                    aria-describedby={searchDescribedBy}
                    value={searchQuery}
                    onChange={handleSearchChange}
                    onKeyDown={handleSearchKeyDown}
                    onFocus={handleSearchFocus}
                    placeholder="e.g. Makati, Quezon City Hall…"
                    autoComplete="off"
                    maxLength={500}
                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 pl-9 pr-9 py-2.5 text-xs font-bold text-slate-950 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all shadow-xs"
                  />
                  {isSearching && (
                    <Loader2
                      size={14}
                      className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-slate-400"
                      aria-hidden="true"
                    />
                  )}
                </div>

                {listVisible && (
                  <ul
                    id={listboxId}
                    role="listbox"
                    aria-label="Place suggestions"
                    className="absolute z-30 mt-1.5 w-full max-h-44 sm:max-h-56 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1"
                  >
                    {suggestions.map((item, index) => {
                      const optionId = `${listboxId}-option-${index}`
                      const isActive = index === activeIndex
                      return (
                        <li
                          key={`${item.displayName}-${item.lat}-${item.lng}-${index}`}
                          id={optionId}
                          role="option"
                          aria-selected={isActive}
                          className={`px-3.5 py-2.5 text-xs font-medium cursor-pointer transition-colors ${
                            isActive
                              ? 'bg-slate-100 dark:bg-slate-800 text-slate-950 dark:text-white'
                              : 'text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/80'
                          }`}
                          onMouseEnter={() => setActiveIndex(index)}
                          onMouseDown={(event) => {
                            event.preventDefault()
                            selectSuggestion(item)
                          }}
                        >
                          {item.displayName || item.addressString}
                        </li>
                      )
                    })}
                  </ul>
                )}

                {(isSearching || searchEmpty) && !searchError && (
                  <p
                    id={searchStatusId}
                    className="mt-1.5 text-[11px] font-medium text-slate-500 dark:text-slate-400"
                    aria-live="polite"
                  >
                    {isSearching
                      ? 'Searching…'
                      : 'No places found. Try another query or pick on the map.'}
                  </p>
                )}

                {searchError && (
                  <p
                    id={searchErrorId}
                    role="alert"
                    className="mt-1.5 flex items-start gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300"
                  >
                    <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{searchError}</span>
                  </p>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  data-autofocus
                  onClick={handleCenterOnMe}
                  disabled={!leafletReady || isCentering || Boolean(leafletError)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isCentering ? (
                    <Loader2 size={13} className="animate-spin shrink-0" aria-hidden="true" />
                  ) : (
                    <Crosshair size={13} className="shrink-0" aria-hidden="true" />
                  )}
                  {isCentering ? 'Centering…' : 'Center on me'}
                </button>
              </div>

              {centerError && (
                <p
                  role="alert"
                  className="flex items-start gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300"
                >
                  <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                  <span>{centerError}</span>
                </p>
              )}

              <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-950">
                {!leafletReady && !leafletError && (
                  <div
                    className="absolute inset-0 z-10 flex items-center justify-center gap-2 bg-white/80 dark:bg-slate-950/80 text-xs font-bold text-slate-700 dark:text-slate-300"
                    aria-live="polite"
                  >
                    <Loader2 size={16} className="animate-spin" aria-hidden="true" />
                    Loading map…
                  </div>
                )}
                {leafletError && (
                  <div
                    className="absolute inset-0 z-10 flex items-start gap-2 p-4 bg-white dark:bg-slate-900 text-[11px] font-bold text-rose-700 dark:text-rose-300"
                    role="alert"
                  >
                    <AlertCircle size={14} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{leafletError}</span>
                  </div>
                )}
                <div
                  ref={mapContainerRef}
                  className="w-full z-0"
                  style={{ minHeight: MAP_MIN_HEIGHT_PX, height: 'min(42vh, 360px)' }}
                  aria-label="Interactive map for picking a site location"
                />
              </div>

              <div
                id={previewId}
                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 px-3.5 py-3"
                aria-live="polite"
              >
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1">
                  Address preview
                </p>
                {isReversing && (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-slate-700 dark:text-slate-300">
                    <Loader2 size={13} className="animate-spin shrink-0" aria-hidden="true" />
                    Looking up address…
                  </p>
                )}
                {!isReversing && preview && previewAddress && (
                  <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-relaxed">
                    {previewAddress}
                  </p>
                )}
                {!isReversing && !previewAddress && !reverseError && (
                  <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
                    {Number.isFinite(pin.lat)
                      ? 'Resolving…'
                      : 'Search or click the map to drop a pin.'}
                  </p>
                )}
                {reverseError && (
                  <p
                    id={errorId}
                    role="alert"
                    className="flex items-start gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300"
                  >
                    <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
                    <span>{reverseError}</span>
                  </p>
                )}
                {Number.isFinite(pin.lat) && Number.isFinite(pin.lng) && (
                  <p className="mt-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-500 tabular-nums">
                    {pin.lat.toFixed(5)}, {pin.lng.toFixed(5)}
                  </p>
                )}
              </div>
            </div>

            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 border-t border-slate-200 dark:border-slate-800 px-4 sm:px-5 py-3.5 shrink-0 bg-white dark:bg-slate-900">
              <button
                type="button"
                onClick={() => onClose?.()}
                className="inline-flex items-center justify-center px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 text-xs font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                disabled={!canConfirm}
                aria-describedby={
                  [previewAddress ? previewId : null, reverseError ? errorId : null]
                    .filter(Boolean)
                    .join(' ') || undefined
                }
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-slate-900 dark:border-slate-100 bg-slate-900 dark:bg-slate-100 text-xs font-bold text-white dark:text-slate-950 hover:bg-slate-800 dark:hover:bg-white disabled:opacity-45 disabled:cursor-not-allowed transition-colors"
              >
                <MapPin size={14} className="shrink-0" aria-hidden="true" />
                Use this location
              </button>
            </div>
          </motion.div>
        </div>
      ) : null}
    </AnimatePresence>
  )
}
