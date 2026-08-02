import { Component, lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from 'react'
import { Loader2, Map, MapPin, Navigation, ExternalLink, AlertCircle, X } from 'lucide-react'
import {
  searchAddress,
  getCurrentLocation,
  buildGoogleMapsUrl,
} from '../../lib/locationService'

const DEBOUNCE_MS = 300

/** Leaflet map picker — loaded only when the user opens “Select on map”. */
const MapPickerModal = lazy(() =>
  import('./MapPickerModal.jsx').then((mod) => ({ default: mod.MapPickerModal })),
)

/**
 * Local boundary so a failed map chunk / render cannot wipe the parent form
 * via the app-level ErrorBoundary.
 */
class MapPickerErrorBoundary extends Component {
  static getDerivedStateFromError() {
    return { hasError: true }
  }

  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  componentDidCatch() {
    this.props.onError?.()
  }

  render() {
    if (this.state.hasError) return null
    return this.props.children
  }
}

/**
 * Accessible address combobox with Nominatim search, GPS fill, map picker,
 * unit/landmark, and a keyless Google Maps badge. Manual free-text always remains allowed.
 */
export function AddressAutocomplete({
  value = '',
  onChange,
  unitLandmark = '',
  onUnitLandmarkChange,
  error,
  required = false,
  id,
  disabled = false,
  placeholder = 'Search or type street, city, or landmark…',
  showUnitField = true,
  showMapBadge = true,
}) {
  const reactId = useId()
  const inputId = id || `address-autocomplete-${reactId}`
  const listboxId = `${inputId}-listbox`
  const unitId = `${inputId}-unit`
  const errorId = `${inputId}-error`
  const geoErrorId = `${inputId}-geo-error`
  const searchErrorId = `${inputId}-search-error`
  const mapErrorId = `${inputId}-map-error`

  const [suggestions, setSuggestions] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [isSearching, setIsSearching] = useState(false)
  const [isGeoLoading, setIsGeoLoading] = useState(false)
  const [geoError, setGeoError] = useState('')
  const [searchError, setSearchError] = useState('')
  const [mapError, setMapError] = useState('')
  const [mapOpen, setMapOpen] = useState(false)
  const [coords, setCoords] = useState({ lat: null, lng: null })

  const containerRef = useRef(null)
  const debounceRef = useRef(null)
  const abortRef = useRef(null)
  const requestIdRef = useRef(0)
  const skipSearchRef = useRef(false)
  const inputFocusedRef = useRef(false)
  const dismissedQueryRef = useRef('')
  const latestQueryRef = useRef('')

  const emitAddress = useCallback(
    (next, nextCoords = null) => {
      if (typeof onChange === 'function') onChange(next)
      if (nextCoords && Number.isFinite(nextCoords.lat) && Number.isFinite(nextCoords.lng)) {
        setCoords({ lat: nextCoords.lat, lng: nextCoords.lng })
      } else if (nextCoords === null) {
        setCoords({ lat: null, lng: null })
      }
    },
    [onChange],
  )

  useEffect(() => {
    if (skipSearchRef.current) {
      skipSearchRef.current = false
      return undefined
    }

    const query = typeof value === 'string' ? value.trim() : ''
    latestQueryRef.current = query

    if (!query || query.length < 3) {
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
      setSuggestions([])
      setIsOpen(false)
      setIsSearching(false)
      setSearchError('')
      dismissedQueryRef.current = ''
      return undefined
    }

    if (debounceRef.current) clearTimeout(debounceRef.current)

    debounceRef.current = setTimeout(async () => {
      if (abortRef.current) abortRef.current.abort()
      const controller = new AbortController()
      abortRef.current = controller

      const reqId = ++requestIdRef.current
      const requestQuery = query
      setIsSearching(true)
      setSearchError('')
      try {
        const results = await searchAddress(query, { signal: controller.signal })
        if (reqId !== requestIdRef.current) return
        if (latestQueryRef.current !== requestQuery) return

        const next = Array.isArray(results) ? results : []
        setSuggestions(next)

        const userDismissed = dismissedQueryRef.current === requestQuery
        // Never reopen after Escape for this query, or while input is unfocused.
        if (next.length > 0 && inputFocusedRef.current && !userDismissed) {
          setIsOpen(true)
        }
        setActiveIndex(-1)
      } catch (err) {
        if (err?.name === 'AbortError') return
        if (reqId !== requestIdRef.current) return
        // Keep typed value; only clear suggestions and show a non-blocking alert.
        setSuggestions([])
        setIsOpen(false)
        setActiveIndex(-1)
        setSearchError(
          err?.message || 'Address search failed. You can still type the address manually.',
        )
      } finally {
        if (reqId === requestIdRef.current) setIsSearching(false)
      }
    }, DEBOUNCE_MS)

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
      if (abortRef.current) {
        abortRef.current.abort()
        abortRef.current = null
      }
    }
  }, [value])

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!containerRef.current?.contains(event.target)) {
        setIsOpen(false)
        setActiveIndex(-1)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return () => document.removeEventListener('mousedown', handlePointerDown)
  }, [])

  const handleMapClose = useCallback(() => {
    setMapOpen(false)
  }, [])

  const handleMapChunkError = useCallback(() => {
    setMapOpen(false)
    setMapError(
      'Map picker failed to load. You can still type the address or use GPS.',
    )
  }, [])

  // Esc dismisses the Suspense “Loading map…” overlay before the modal mounts.
  useEffect(() => {
    if (!mapOpen) return undefined
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      event.stopPropagation()
      setMapOpen(false)
    }
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [mapOpen])

  const selectSuggestion = (item) => {
    if (!item) return
    skipSearchRef.current = true
    dismissedQueryRef.current = ''
    setSuggestions([])
    setIsOpen(false)
    setActiveIndex(-1)
    setGeoError('')
    setSearchError('')
    emitAddress(item.addressString || item.displayName || '', {
      lat: item.lat,
      lng: item.lng,
    })
  }

  const handleInputChange = (event) => {
    setGeoError('')
    setSearchError('')
    setMapError('')
    dismissedQueryRef.current = ''
    setCoords({ lat: null, lng: null })
    emitAddress(event.target.value, undefined)
  }

  const handleUseCurrentLocation = async () => {
    if (disabled || isGeoLoading) return
    setGeoError('')
    setSearchError('')
    setMapError('')
    setIsGeoLoading(true)
    try {
      const place = await getCurrentLocation()
      skipSearchRef.current = true
      dismissedQueryRef.current = ''
      setSuggestions([])
      setIsOpen(false)
      setActiveIndex(-1)
      emitAddress(place.addressString || place.displayName || '', {
        lat: place.lat,
        lng: place.lng,
      })
    } catch (err) {
      setGeoError(
        err?.message || 'Unable to read current location. Type the address manually.',
      )
    } finally {
      setIsGeoLoading(false)
    }
  }

  const handleOpenMapPicker = () => {
    if (disabled) return
    setMapError('')
    setGeoError('')
    setSearchError('')
    setSuggestions([])
    setIsOpen(false)
    setActiveIndex(-1)
    setMapOpen(true)
  }

  const handleMapConfirm = (place) => {
    if (!place) return
    skipSearchRef.current = true
    dismissedQueryRef.current = ''
    setSuggestions([])
    setIsOpen(false)
    setActiveIndex(-1)
    setMapError('')
    setGeoError('')
    setSearchError('')
    emitAddress(place.addressString || place.displayName || '', {
      lat: place.lat,
      lng: place.lng,
    })
    setMapOpen(false)
  }

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      dismissedQueryRef.current = latestQueryRef.current
      setIsOpen(false)
      setActiveIndex(-1)
      return
    }

    if (!isOpen || suggestions.length === 0) {
      return
    }

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
      // Prevent parent form submit while the suggestion list is open.
      event.preventDefault()
      if (activeIndex >= 0) {
        selectSuggestion(suggestions[activeIndex])
      } else {
        // Keep free-text value; just close the list.
        dismissedQueryRef.current = latestQueryRef.current
        setIsOpen(false)
        setActiveIndex(-1)
      }
    }
  }

  const mapsUrl = buildGoogleMapsUrl({
    address: value,
    lat: coords.lat,
    lng: coords.lng,
  })
  const showMapsLink = showMapBadge && Boolean(String(value || '').trim())
  const activeOptionId =
    activeIndex >= 0 && suggestions[activeIndex]
      ? `${listboxId}-option-${activeIndex}`
      : undefined

  const describedBy = [
    error ? errorId : null,
    geoError ? geoErrorId : null,
    searchError ? searchErrorId : null,
    mapError ? mapErrorId : null,
  ]
    .filter(Boolean)
    .join(' ') || undefined

  const inputClassName =
    'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2.5 text-xs font-bold text-slate-950 dark:text-white placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:border-slate-900 dark:focus:border-slate-100 transition-all shadow-xs disabled:opacity-50 disabled:cursor-not-allowed'

  return (
    <div ref={containerRef} className="space-y-2.5 w-full">
      <div className="relative">
        <div className="relative">
          <MapPin
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
            aria-hidden="true"
          />
          <input
            id={inputId}
            type="text"
            role="combobox"
            aria-expanded={isOpen && suggestions.length > 0}
            aria-controls={listboxId}
            aria-autocomplete="list"
            aria-activedescendant={activeOptionId}
            aria-invalid={Boolean(error) || undefined}
            aria-describedby={describedBy}
            aria-required={required || undefined}
            disabled={disabled}
            required={required}
            maxLength={500}
            value={value}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onFocus={() => {
              inputFocusedRef.current = true
              if (suggestions.length > 0 && dismissedQueryRef.current !== latestQueryRef.current) {
                setIsOpen(true)
              }
            }}
            onBlur={() => {
              inputFocusedRef.current = false
            }}
            placeholder={placeholder}
            autoComplete="off"
            className={`${inputClassName} pl-10 pr-10`}
          />
          {isSearching && (
            <Loader2
              size={14}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 animate-spin text-slate-400"
              aria-hidden="true"
            />
          )}
        </div>

        {isOpen && suggestions.length > 0 && (
          <ul
            id={listboxId}
            role="listbox"
            aria-label="Address suggestions"
            className="absolute z-30 mt-1.5 w-full max-h-56 overflow-auto rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg py-1"
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
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={handleUseCurrentLocation}
          disabled={disabled || isGeoLoading}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isGeoLoading ? (
            <Loader2 size={13} className="animate-spin shrink-0" aria-hidden="true" />
          ) : (
            <Navigation size={13} className="shrink-0" aria-hidden="true" />
          )}
          {isGeoLoading ? 'Locating…' : 'Use my current location'}
        </button>

        <button
          type="button"
          onClick={handleOpenMapPicker}
          disabled={disabled}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <Map size={13} className="shrink-0" aria-hidden="true" />
          Select on map
        </button>

        {showMapsLink && (
          <a
            href={mapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
          >
            <ExternalLink size={12} className="shrink-0" aria-hidden="true" />
            Open in Google Maps
          </a>
        )}
      </div>

      {searchError && (
        <p
          id={searchErrorId}
          role="alert"
          className="flex items-start gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300"
        >
          <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{searchError}</span>
        </p>
      )}

      {geoError && (
        <p
          id={geoErrorId}
          role="alert"
          className="flex items-start gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300"
        >
          <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{geoError}</span>
        </p>
      )}

      {mapError && (
        <p
          id={mapErrorId}
          role="alert"
          className="flex items-start gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300"
        >
          <AlertCircle size={13} className="shrink-0 mt-0.5" aria-hidden="true" />
          <span>{mapError}</span>
        </p>
      )}

      {mapOpen && (
        <MapPickerErrorBoundary onError={handleMapChunkError}>
          <Suspense
            fallback={
              <div
                className="fixed inset-0 z-[80] flex items-center justify-center bg-slate-950/75 p-4 backdrop-blur-md"
                role="dialog"
                aria-modal="true"
                aria-labelledby={`${inputId}-map-loading-title`}
                onMouseDown={(event) => {
                  if (event.target === event.currentTarget) setMapOpen(false)
                }}
              >
                <div
                  className="relative inline-flex flex-col items-center gap-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-5 py-4 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-xl"
                  onMouseDown={(event) => event.stopPropagation()}
                >
                  <button
                    type="button"
                    onClick={() => setMapOpen(false)}
                    className="absolute top-2 right-2 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white transition-colors"
                    aria-label="Cancel loading map"
                  >
                    <X size={16} aria-hidden="true" />
                  </button>
                  <div className="inline-flex items-center gap-2 pt-1">
                    <Loader2 size={16} className="animate-spin shrink-0" aria-hidden="true" />
                    <span id={`${inputId}-map-loading-title`}>Loading map…</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setMapOpen(false)}
                    className="inline-flex items-center justify-center px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-[11px] font-bold text-slate-800 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            }
          >
            <MapPickerModal
              open={mapOpen}
              onClose={handleMapClose}
              onConfirm={handleMapConfirm}
              lat={coords.lat}
              lng={coords.lng}
            />
          </Suspense>
        </MapPickerErrorBoundary>
      )}

      {showUnitField && (
        <div>
          <label
            htmlFor={unitId}
            className="block text-[10px] font-bold uppercase tracking-wider text-slate-600 dark:text-slate-400 mb-1"
          >
            Unit / Floor / Rack / Landmark
          </label>
          <input
            id={unitId}
            type="text"
            disabled={disabled}
            value={unitLandmark}
            maxLength={120}
            onChange={(event) => {
              if (typeof onUnitLandmarkChange === 'function') {
                onUnitLandmarkChange(event.target.value)
              }
            }}
            placeholder="e.g. Bldg 3, Floor 4, Rack A12"
            className={inputClassName}
          />
        </div>
      )}

      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1.5 text-[11px] font-bold text-rose-700 dark:text-rose-300"
        >
          <AlertCircle size={13} className="shrink-0" aria-hidden="true" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
