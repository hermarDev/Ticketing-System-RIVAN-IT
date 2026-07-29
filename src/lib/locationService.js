/**
 * Free Location System — foundation service (Phase 1).
 *
 * Default path: OpenStreetMap Nominatim (keyless). Google Places is optional when
 * VITE_GOOGLE_MAPS_API_KEY is set; until implemented, search still uses Nominatim.
 *
 * Nominatim CORS: public API returns Access-Control-Allow-Origin: *. Browsers cannot
 * set User-Agent; Vite proxies /api/nominatim in dev and adds an identifying UA.
 * Production should reverse-proxy the same path (or set VITE_NOMINATIM_BASE) so
 * requests stay same-origin with a proper User-Agent. Direct public Nominatim still
 * works as a fallback via Referer identification.
 */

// Canonical sanitizeInput lives in formValidation.js and is re-exported from
// ticketService.js. Import the pure module here so Node tests do not load Supabase.
import { sanitizeInput } from './formValidation.js'

/** Identifying UA for Nominatim usage policy (applied by Vite/prod proxy). */
export const NOMINATIM_USER_AGENT =
  'NetOpsTicketingSystem/1.0 (https://github.com/netops; location-autocomplete)'

const ADDRESS_MAX = 500
const UNIT_MAX = 120
const SITE_SEP = ' — '
const SEARCH_LIMIT = 5

function getViteEnv() {
  return (typeof import.meta !== 'undefined' && import.meta.env) || {}
}

/**
 * Resolves Nominatim base URL.
 * Dev: Vite proxy at /api/nominatim (see vite.config.js).
 * Prod: public API unless VITE_NOMINATIM_BASE points at a same-origin proxy.
 */
export function getNominatimBaseUrl() {
  const env = getViteEnv()
  if (env.VITE_NOMINATIM_BASE) return String(env.VITE_NOMINATIM_BASE).replace(/\/$/, '')
  if (env.DEV) return '/api/nominatim'
  return 'https://nominatim.openstreetmap.org'
}

function locationError(code, message) {
  const err = new Error(message)
  err.code = code
  return err
}

function pickCity(address = {}) {
  return (
    address.city ||
    address.town ||
    address.village ||
    address.municipality ||
    address.city_district ||
    address.suburb ||
    ''
  )
}

function pickState(address = {}) {
  return address.state || address.province || address.region || address.state_district || ''
}

function pickStreet(address = {}) {
  return (
    address.road ||
    address.pedestrian ||
    address.footway ||
    address.path ||
    address.residential ||
    address.street ||
    ''
  )
}

/**
 * Maps a Nominatim place / reverse result to the shared location shape.
 * @param {object} place
 * @returns {{
 *   displayName: string,
 *   addressString: string,
 *   lat: number | null,
 *   lng: number | null,
 *   street?: string,
 *   city?: string,
 *   state?: string,
 *   postalCode?: string,
 *   country?: string,
 * }}
 */
export function mapNominatimPlace(place) {
  if (!place || typeof place !== 'object') {
    return {
      displayName: '',
      addressString: '',
      lat: null,
      lng: null,
    }
  }

  const address = place.address || {}
  const displayName = sanitizeInput(String(place.display_name || ''), ADDRESS_MAX)
  const lat = place.lat != null && place.lat !== '' ? Number(place.lat) : null
  const lng = place.lon != null && place.lon !== '' ? Number(place.lon) : null
  const street = sanitizeInput(pickStreet(address), 200) || undefined
  const city = sanitizeInput(pickCity(address), 200) || undefined
  const state = sanitizeInput(pickState(address), 200) || undefined
  const postalCode = sanitizeInput(String(address.postcode || ''), 32) || undefined
  const country = sanitizeInput(String(address.country || ''), 200) || undefined

  return {
    displayName,
    addressString: displayName,
    lat: Number.isFinite(lat) ? lat : null,
    lng: Number.isFinite(lng) ? lng : null,
    ...(street ? { street } : {}),
    ...(city ? { city } : {}),
    ...(state ? { state } : {}),
    ...(postalCode ? { postalCode } : {}),
    ...(country ? { country } : {}),
  }
}

function isAbortError(err) {
  return (
    err?.name === 'AbortError' ||
    err?.code === 20 ||
    err?.code === 'ABORT_ERR'
  )
}

/**
 * @param {string} pathWithQuery
 * @param {{ signal?: AbortSignal }} [options]
 */
async function nominatimFetch(pathWithQuery, { signal } = {}) {
  const url = `${getNominatimBaseUrl()}${pathWithQuery}`
  const headers = {
    Accept: 'application/json',
    // Browsers forbid setting User-Agent; harmless on direct calls, useful behind proxies.
    'Accept-Language': 'en',
  }

  const response = await fetch(url, { headers, ...(signal ? { signal } : {}) })
  if (!response.ok) {
    throw locationError(
      'NOMINATIM_HTTP_ERROR',
      `Address lookup failed (${response.status}). Try again or type the address manually.`,
    )
  }
  return response.json()
}

/**
 * Deduplicate suggestions by displayName (case-insensitive), falling back to lat+lng.
 * @param {ReturnType<typeof mapNominatimPlace>[]} items
 * @returns {ReturnType<typeof mapNominatimPlace>[]}
 */
function dedupeSuggestions(items) {
  if (!Array.isArray(items) || items.length === 0) return []
  const seen = new Set()
  const out = []
  for (const item of items) {
    const nameKey = String(item.displayName || '').trim().toLowerCase()
    const coordKey =
      Number.isFinite(item.lat) && Number.isFinite(item.lng)
        ? `${item.lat},${item.lng}`
        : ''
    const key = nameKey || coordKey
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(item)
  }
  return out
}

/**
 * Nominatim forward search. Empty / whitespace query → [].
 * Defaults to Philippines (`countrycodes=ph`) for NetOps site addresses.
 * @param {string} query
 * @param {{ signal?: AbortSignal }} [options] Pass `signal` to cancel in-flight search.
 * @returns {Promise<ReturnType<typeof mapNominatimPlace>[]>}
 */
export async function searchAddressNominatim(query, options = {}) {
  const trimmed = typeof query === 'string' ? query.trim() : ''
  if (!trimmed) return []

  const q = encodeURIComponent(sanitizeInput(trimmed, ADDRESS_MAX))
  // PH-default bias: countrycodes=ph keeps results local for site/install addresses.
  const data = await nominatimFetch(
    `/search?q=${q}&format=json&addressdetails=1&limit=${SEARCH_LIMIT}&countrycodes=ph`,
    { signal: options?.signal },
  )

  if (!Array.isArray(data)) return []
  return dedupeSuggestions(data.map(mapNominatimPlace).filter((item) => item.displayName))
}

/**
 * Address search entry point. When VITE_GOOGLE_MAPS_API_KEY is set, a future Google
 * Places path can run here; today it still falls back to Nominatim (key never required).
 * @param {string} query
 */
export async function searchAddress(query) {
  const key = getViteEnv().VITE_GOOGLE_MAPS_API_KEY
  if (key) {
    // Stub: Google Places Autocomplete (New) would go here using the key.
    // Keep Nominatim until Places is wired so the key remains optional.
  }
  return searchAddressNominatim(query)
}

function readGeolocationPosition(options) {
  return new Promise((resolve, reject) => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      reject(
        locationError(
          'GEOLOCATION_UNSUPPORTED',
          'Geolocation is not supported in this browser.',
        ),
      )
      return
    }

    navigator.geolocation.getCurrentPosition(resolve, (geoError) => {
      const code = geoError?.code
      if (code === 1) {
        reject(
          locationError(
            'GEOLOCATION_DENIED',
            'Location permission denied. Allow location access or type the address manually.',
          ),
        )
        return
      }
      if (code === 2) {
        reject(
          locationError(
            'GEOLOCATION_UNAVAILABLE',
            'Current location is unavailable. Try again or type the address manually.',
          ),
        )
        return
      }
      if (code === 3) {
        reject(
          locationError(
            'GEOLOCATION_TIMEOUT',
            'Location request timed out. Try again or type the address manually.',
          ),
        )
        return
      }
      reject(
        locationError(
          'GEOLOCATION_UNAVAILABLE',
          'Unable to read current location. Type the address manually.',
        ),
      )
    }, options)
  })
}

/**
 * Philippines country-view default for map picker when no pin / GPS coords exist.
 * Approximate geographic center of the PH archipelago (Leaflet lat/lng/zoom).
 */
export const DEFAULT_MAP_CENTER = { lat: 12.8797, lng: 121.774, zoom: 6 }

/**
 * Nominatim reverse geocode for a pin or GPS coordinate.
 * Preserves the caller's lat/lng on the returned shape (pin wins over Nominatim coords).
 * Pass `{ signal }` from an AbortController so abandoned pins cancel the in-flight request.
 * Abort rejects with the native AbortError (`err.name === 'AbortError'`); UI should ignore it.
 * @param {number} lat
 * @param {number} lng
 * @param {{ signal?: AbortSignal }} [options]
 * @returns {Promise<ReturnType<typeof mapNominatimPlace>>}
 */
export async function reverseGeocodeNominatim(lat, lng, options = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw locationError(
      'INVALID_COORDS',
      'Invalid coordinates. Pick a location on the map or enter an address manually.',
    )
  }

  let data
  try {
    data = await nominatimFetch(
      `/reverse?lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lng)}&format=json&addressdetails=1`,
      { signal: options?.signal },
    )
  } catch (err) {
    // Rethrow cancellations so callers can ignore abandoned pin lookups.
    if (isAbortError(err) || options?.signal?.aborted) throw err
    if (err?.code === 'NOMINATIM_HTTP_ERROR') {
      throw locationError(
        'REVERSE_GEOCODE_FAILED',
        'Could not resolve address for this location. You can still type it manually.',
      )
    }
    throw locationError(
      'REVERSE_GEOCODE_FAILED',
      'Could not resolve address for this location. You can still type it manually.',
    )
  }

  if (!data || data.error) {
    throw locationError(
      'REVERSE_GEOCODE_FAILED',
      'Could not resolve address for this location. You can still type it manually.',
    )
  }

  const mapped = mapNominatimPlace(data)
  return {
    ...mapped,
    lat,
    lng,
  }
}

/**
 * Browser geolocation + Nominatim reverse geocode.
 * @returns {Promise<ReturnType<typeof mapNominatimPlace>>}
 */
export async function getCurrentLocation() {
  const position = await readGeolocationPosition({
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 60000,
  })

  const lat = position?.coords?.latitude
  const lng = position?.coords?.longitude
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw locationError(
      'GEOLOCATION_UNAVAILABLE',
      'Current location is unavailable. Try again or type the address manually.',
    )
  }

  return reverseGeocodeNominatim(lat, lng)
}

/**
 * Keyless Google Maps search/deep link for field navigation.
 * Prefers lat,lng when both are finite numbers.
 * @param {{ address?: string, lat?: number | null, lng?: number | null }} params
 * @returns {string}
 */
export function buildGoogleMapsUrl({ address, lat, lng } = {}) {
  const hasCoords = Number.isFinite(lat) && Number.isFinite(lng)
  const query = hasCoords
    ? `${lat},${lng}`
    : sanitizeInput(String(address || ''), ADDRESS_MAX)

  if (!query) return 'https://www.google.com/maps'
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`
}

/**
 * Strip characters that break `[Site: ...]` / `[Product: ...]` markers.
 * @param {string} value
 */
function stripSiteTagBreakers(value) {
  return String(value || '').replace(/[[\]]/g, '')
}

/**
 * Single string for site_address / ticket `[Site: ...]` embedding.
 * Total length is capped at ADDRESS_MAX (500) so profile sanitize does not
 * silently drop the unit/landmark suffix.
 * @param {{ addressString?: string, unitLandmark?: string }} params
 * @returns {string}
 */
export function formatStoredSiteAddress({ addressString, unitLandmark } = {}) {
  const unit = sanitizeInput(stripSiteTagBreakers(unitLandmark || ''), UNIT_MAX)
  if (!unit) {
    return sanitizeInput(stripSiteTagBreakers(addressString || ''), ADDRESS_MAX)
  }

  const addressBudget = Math.max(0, ADDRESS_MAX - SITE_SEP.length - unit.length)
  const address = sanitizeInput(stripSiteTagBreakers(addressString || ''), addressBudget)
  if (address && unit) return `${address}${SITE_SEP}${unit}`
  return address || unit
}

/**
 * Splits a stored `"address — unit"` site string for form editing.
 * Uses the last em-dash separator so addresses containing " — " keep the unit.
 * @param {string} stored
 * @returns {{ address: string, unitLandmark: string }}
 */
export function splitStoredSiteAddress(stored) {
  const text = typeof stored === 'string' ? stored.trim() : ''
  if (!text) return { address: '', unitLandmark: '' }
  const idx = text.lastIndexOf(SITE_SEP)
  if (idx === -1) return { address: text, unitLandmark: '' }
  return {
    address: text.slice(0, idx).trim(),
    unitLandmark: text.slice(idx + SITE_SEP.length).trim(),
  }
}

/**
 * Extracts `[Site: ...]` and optional `[Product: ...]` tags from ticket descriptions.
 * @param {string} description
 * @returns {{ site: string | null, product: string | null, body: string }}
 */
export function parseSiteFromTicketDescription(description) {
  const text = typeof description === 'string' ? description : ''
  const siteMatch = text.match(/\[Site:\s*([^\]]*)\]/i)
  const productMatch = text.match(/\[Product:\s*([^\]]*)\]/i)

  const site = siteMatch
    ? sanitizeInput(siteMatch[1].trim(), ADDRESS_MAX) || null
    : null
  const product = productMatch
    ? sanitizeInput(productMatch[1].trim(), 200) || null
    : null

  const body = text
    .replace(/\[Product:\s*[^\]]*\]/gi, '')
    .replace(/\[Site:\s*[^\]]*\]/gi, '')
    .replace(/^\s*\n+/, '')
    .trim()

  return { site, product, body }
}
