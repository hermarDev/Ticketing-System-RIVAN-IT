import { describe, it, beforeEach, afterEach, mock } from 'node:test'
import assert from 'node:assert/strict'
import {
  searchAddressNominatim,
  searchAddress,
  reverseGeocodeNominatim,
  getCurrentLocation,
  buildGoogleMapsUrl,
  formatStoredSiteAddress,
  splitStoredSiteAddress,
  parseSiteFromTicketDescription,
  mapNominatimPlace,
  getNominatimBaseUrl,
  DEFAULT_MAP_CENTER,
} from './locationService.js'

const NOMINATIM_PLACE = {
  display_name: 'Makati, Metro Manila, Philippines',
  lat: '14.5567949',
  lon: '121.0211226',
  address: {
    city: 'Makati',
    region: 'Metro Manila',
    country: 'Philippines',
    postcode: '1200',
    road: 'Ayala Avenue',
  },
}

describe('mapNominatimPlace', () => {
  it('maps Nominatim fields and sanitizes display strings', () => {
    const mapped = mapNominatimPlace({
      ...NOMINATIM_PLACE,
      display_name: '<b>Makati</b>, Metro Manila',
    })
    assert.equal(mapped.displayName, 'Makati, Metro Manila')
    assert.equal(mapped.addressString, 'Makati, Metro Manila')
    assert.equal(mapped.lat, 14.5567949)
    assert.equal(mapped.lng, 121.0211226)
    assert.equal(mapped.street, 'Ayala Avenue')
    assert.equal(mapped.city, 'Makati')
    assert.equal(mapped.state, 'Metro Manila')
    assert.equal(mapped.postalCode, '1200')
    assert.equal(mapped.country, 'Philippines')
  })

  it('returns empty defaults for invalid input', () => {
    assert.deepEqual(mapNominatimPlace(null), {
      displayName: '',
      addressString: '',
      lat: null,
      lng: null,
    })
  })
})

describe('searchAddressNominatim', () => {
  let fetchMock

  beforeEach(() => {
    fetchMock = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [NOMINATIM_PLACE],
    }))
    globalThis.fetch = fetchMock
  })

  afterEach(() => {
    mock.restoreAll()
    delete globalThis.fetch
  })

  it('returns [] for empty query without calling fetch', async () => {
    assert.deepEqual(await searchAddressNominatim(''), [])
    assert.deepEqual(await searchAddressNominatim('   '), [])
    assert.deepEqual(await searchAddressNominatim(null), [])
    assert.equal(fetchMock.mock.calls.length, 0)
  })

  it('calls Nominatim search and maps results', async () => {
    const results = await searchAddressNominatim('Makati')
    assert.equal(results.length, 1)
    assert.equal(results[0].city, 'Makati')
    assert.equal(results[0].lat, 14.5567949)

    const calledUrl = String(fetchMock.mock.calls[0].arguments[0])
    assert.match(calledUrl, /\/search\?/)
    assert.match(calledUrl, /q=Makati/)
    assert.match(calledUrl, /format=json/)
    assert.match(calledUrl, /addressdetails=1/)
    assert.match(calledUrl, /countrycodes=ph/)
  })

  it('dedupes suggestions by displayName (case-insensitive)', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [
        NOMINATIM_PLACE,
        { ...NOMINATIM_PLACE, lat: '14.5568', lon: '121.0212' },
        {
          display_name: 'Quezon City, Metro Manila, Philippines',
          lat: '14.6760',
          lon: '121.0437',
          address: { city: 'Quezon City', country: 'Philippines' },
        },
      ],
    }))
    const results = await searchAddressNominatim('Manila')
    assert.equal(results.length, 2)
    assert.equal(results[0].displayName, 'Makati, Metro Manila, Philippines')
    assert.equal(results[1].city, 'Quezon City')
  })

  it('throws a clear error when Nominatim HTTP fails', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }))
    await assert.rejects(
      () => searchAddressNominatim('Manila'),
      (err) => err.code === 'NOMINATIM_HTTP_ERROR',
    )
  })
})

describe('searchAddress', () => {
  afterEach(() => {
    mock.restoreAll()
    delete globalThis.fetch
  })

  it('falls back to Nominatim even when a Google key env may exist', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => [NOMINATIM_PLACE],
    }))
    const results = await searchAddress('Makati')
    assert.equal(results[0].city, 'Makati')
  })
})

describe('DEFAULT_MAP_CENTER', () => {
  it('exposes finite Philippines-centric lat/lng and zoom', () => {
    assert.equal(typeof DEFAULT_MAP_CENTER, 'object')
    assert.ok(Number.isFinite(DEFAULT_MAP_CENTER.lat))
    assert.ok(Number.isFinite(DEFAULT_MAP_CENTER.lng))
    assert.ok(Number.isFinite(DEFAULT_MAP_CENTER.zoom))
    assert.ok(DEFAULT_MAP_CENTER.lat > 4 && DEFAULT_MAP_CENTER.lat < 22)
    assert.ok(DEFAULT_MAP_CENTER.lng > 116 && DEFAULT_MAP_CENTER.lng < 127)
  })
})

describe('reverseGeocodeNominatim', () => {
  afterEach(() => {
    mock.restoreAll()
    delete globalThis.fetch
  })

  it('rejects with INVALID_COORDS for non-finite input without calling fetch', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => NOMINATIM_PLACE,
    }))

    await assert.rejects(
      () => reverseGeocodeNominatim(NaN, 121),
      (err) => err.code === 'INVALID_COORDS',
    )
    await assert.rejects(
      () => reverseGeocodeNominatim(14.55, undefined),
      (err) => err.code === 'INVALID_COORDS',
    )
    await assert.rejects(
      () => reverseGeocodeNominatim('14.55', '121.02'),
      (err) => err.code === 'INVALID_COORDS',
    )
    assert.equal(globalThis.fetch.mock.calls.length, 0)
  })

  it('maps a successful reverse response and preserves pin lat/lng', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => NOMINATIM_PLACE,
    }))

    const result = await reverseGeocodeNominatim(14.55, 121.02)
    assert.equal(result.city, 'Makati')
    assert.equal(result.addressString, 'Makati, Metro Manila, Philippines')
    assert.equal(result.lat, 14.55)
    assert.equal(result.lng, 121.02)

    const calledUrl = String(globalThis.fetch.mock.calls[0].arguments[0])
    assert.match(calledUrl, /\/reverse\?/)
    assert.match(calledUrl, /lat=14\.55/)
    assert.match(calledUrl, /lon=121\.02/)
  })

  it('rejects with REVERSE_GEOCODE_FAILED on HTTP failure', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 503,
      json: async () => ({}),
    }))

    await assert.rejects(
      () => reverseGeocodeNominatim(14.55, 121.02),
      (err) => err.code === 'REVERSE_GEOCODE_FAILED',
    )
  })

  it('rejects with REVERSE_GEOCODE_FAILED on empty or error payload', async () => {
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => ({ error: 'Unable to geocode' }),
    }))

    await assert.rejects(
      () => reverseGeocodeNominatim(14.55, 121.02),
      (err) => err.code === 'REVERSE_GEOCODE_FAILED',
    )

    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => null,
    }))

    await assert.rejects(
      () => reverseGeocodeNominatim(14.55, 121.02),
      (err) => err.code === 'REVERSE_GEOCODE_FAILED',
    )
  })

  it('forwards AbortSignal to fetch and rethrows AbortError', async () => {
    const controller = new AbortController()
    globalThis.fetch = mock.fn(async (_url, init) => {
      assert.equal(init?.signal, controller.signal)
      const abortErr = new Error('The operation was aborted')
      abortErr.name = 'AbortError'
      throw abortErr
    })

    await assert.rejects(
      () => reverseGeocodeNominatim(14.55, 121.02, { signal: controller.signal }),
      (err) => err.name === 'AbortError' && err.code !== 'REVERSE_GEOCODE_FAILED',
    )
    assert.equal(globalThis.fetch.mock.calls.length, 1)
  })

  it('rethrows AbortError when signal is aborted mid-request', async () => {
    const controller = new AbortController()
    globalThis.fetch = mock.fn((_url, init) => {
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const abortErr = new Error('The operation was aborted')
          abortErr.name = 'AbortError'
          reject(abortErr)
        })
      })
    })

    const pending = reverseGeocodeNominatim(14.55, 121.02, { signal: controller.signal })
    controller.abort()

    await assert.rejects(
      () => pending,
      (err) => err.name === 'AbortError',
    )
  })
})

describe('getCurrentLocation', () => {
  let previousNavigatorDescriptor

  function setNavigator(value) {
    previousNavigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'navigator')
    Object.defineProperty(globalThis, 'navigator', {
      configurable: true,
      enumerable: true,
      writable: true,
      value,
    })
  }

  function restoreNavigator() {
    if (previousNavigatorDescriptor) {
      Object.defineProperty(globalThis, 'navigator', previousNavigatorDescriptor)
      previousNavigatorDescriptor = undefined
    } else {
      delete globalThis.navigator
    }
  }

  afterEach(() => {
    mock.restoreAll()
    delete globalThis.fetch
    restoreNavigator()
  })

  it('rejects with GEOLOCATION_UNSUPPORTED when geolocation is missing', async () => {
    setNavigator({})
    await assert.rejects(
      () => getCurrentLocation(),
      (err) => err.code === 'GEOLOCATION_UNSUPPORTED',
    )
  })

  it('rejects with GEOLOCATION_DENIED on permission error', async () => {
    setNavigator({
      geolocation: {
        getCurrentPosition(_success, error) {
          error({ code: 1 })
        },
      },
    })
    await assert.rejects(
      () => getCurrentLocation(),
      (err) => err.code === 'GEOLOCATION_DENIED' && /denied/i.test(err.message),
    )
  })

  it('rejects with GEOLOCATION_UNAVAILABLE on position error', async () => {
    setNavigator({
      geolocation: {
        getCurrentPosition(_success, error) {
          error({ code: 2 })
        },
      },
    })
    await assert.rejects(
      () => getCurrentLocation(),
      (err) => err.code === 'GEOLOCATION_UNAVAILABLE',
    )
  })

  it('rejects with GEOLOCATION_TIMEOUT on timeout', async () => {
    setNavigator({
      geolocation: {
        getCurrentPosition(_success, error) {
          error({ code: 3 })
        },
      },
    })
    await assert.rejects(
      () => getCurrentLocation(),
      (err) => err.code === 'GEOLOCATION_TIMEOUT' && /timed out/i.test(err.message),
    )
  })

  it('reverse geocodes a successful position via mocked fetch', async () => {
    setNavigator({
      geolocation: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 14.55, longitude: 121.02 } })
        },
      },
    })
    globalThis.fetch = mock.fn(async () => ({
      ok: true,
      status: 200,
      json: async () => NOMINATIM_PLACE,
    }))

    const result = await getCurrentLocation()
    assert.equal(result.city, 'Makati')
    assert.equal(result.lat, 14.55)
    assert.equal(result.lng, 121.02)

    const calledUrl = String(globalThis.fetch.mock.calls[0].arguments[0])
    assert.match(calledUrl, /\/reverse\?/)
    assert.match(calledUrl, /lat=14\.55/)
    assert.match(calledUrl, /lon=121\.02/)
  })

  it('rejects with REVERSE_GEOCODE_FAILED when reverse lookup fails', async () => {
    setNavigator({
      geolocation: {
        getCurrentPosition(success) {
          success({ coords: { latitude: 14.55, longitude: 121.02 } })
        },
      },
    })
    globalThis.fetch = mock.fn(async () => ({
      ok: false,
      status: 500,
      json: async () => ({}),
    }))

    await assert.rejects(
      () => getCurrentLocation(),
      (err) => err.code === 'REVERSE_GEOCODE_FAILED',
    )
  })
})

describe('buildGoogleMapsUrl', () => {
  it('prefers lat,lng when both present', () => {
    assert.equal(
      buildGoogleMapsUrl({ address: 'Makati', lat: 14.55, lng: 121.02 }),
      'https://www.google.com/maps/search/?api=1&query=14.55%2C121.02',
    )
  })

  it('encodes address when coords are missing', () => {
    assert.equal(
      buildGoogleMapsUrl({ address: 'Makati City' }),
      'https://www.google.com/maps/search/?api=1&query=Makati%20City',
    )
  })

  it('returns maps root when nothing usable is provided', () => {
    assert.equal(buildGoogleMapsUrl({}), 'https://www.google.com/maps')
  })
})

describe('formatStoredSiteAddress', () => {
  it('joins address and unit/landmark', () => {
    assert.equal(
      formatStoredSiteAddress({
        addressString: 'Makati, Metro Manila',
        unitLandmark: 'Bldg 3, Floor 4',
      }),
      'Makati, Metro Manila — Bldg 3, Floor 4',
    )
  })

  it('returns whichever part is present', () => {
    assert.equal(
      formatStoredSiteAddress({ addressString: 'Manila' }),
      'Manila',
    )
    assert.equal(
      formatStoredSiteAddress({ unitLandmark: 'Server Room' }),
      'Server Room',
    )
    assert.equal(formatStoredSiteAddress({}), '')
  })

  it('strips HTML from both parts', () => {
    assert.equal(
      formatStoredSiteAddress({
        addressString: '<b>Makati</b>',
        unitLandmark: '<script>x</script>Floor 2',
      }),
      'Makati — Floor 2',
    )
  })

  it('caps composed length at 500 and keeps the unit suffix', () => {
    const longAddress = 'A'.repeat(480)
    const unit = 'Bldg 3, Floor 4, Rack A12'
    const composed = formatStoredSiteAddress({
      addressString: longAddress,
      unitLandmark: unit,
    })
    assert.ok(composed.length <= 500)
    assert.ok(composed.endsWith(` — ${unit}`))
  })

  it('strips site-tag breakers from stored values', () => {
    assert.equal(
      formatStoredSiteAddress({
        addressString: 'Makati [HQ]',
        unitLandmark: 'Floor 2]',
      }),
      'Makati HQ — Floor 2',
    )
  })
})

describe('splitStoredSiteAddress', () => {
  it('splits address and unit on the last em-dash separator', () => {
    assert.deepEqual(
      splitStoredSiteAddress('Makati HQ — Floor 2'),
      { address: 'Makati HQ', unitLandmark: 'Floor 2' },
    )
  })

  it('returns address-only when no separator is present', () => {
    assert.deepEqual(
      splitStoredSiteAddress('Manila'),
      { address: 'Manila', unitLandmark: '' },
    )
    assert.deepEqual(
      splitStoredSiteAddress(''),
      { address: '', unitLandmark: '' },
    )
  })
})

describe('parseSiteFromTicketDescription', () => {
  it('extracts Site and Product tags and remaining body', () => {
    const description =
      '[Product: Switch X] [Site: Makati HQ — Floor 2]\n\nNeed onsite visit.'
    const parsed = parseSiteFromTicketDescription(description)
    assert.equal(parsed.product, 'Switch X')
    assert.equal(parsed.site, 'Makati HQ — Floor 2')
    assert.equal(parsed.body, 'Need onsite visit.')
  })

  it('returns nulls when tags are absent', () => {
    const parsed = parseSiteFromTicketDescription('Just a plain description')
    assert.equal(parsed.site, null)
    assert.equal(parsed.product, null)
    assert.equal(parsed.body, 'Just a plain description')
  })

  it('handles non-string input', () => {
    assert.deepEqual(parseSiteFromTicketDescription(null), {
      site: null,
      product: null,
      body: '',
    })
  })
})

describe('getNominatimBaseUrl', () => {
  it('returns a string base (public Nominatim or proxy path)', () => {
    const base = getNominatimBaseUrl()
    assert.equal(typeof base, 'string')
    assert.ok(base.length > 0)
  })
})
