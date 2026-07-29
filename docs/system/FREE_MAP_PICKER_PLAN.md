# Free Map Picker — Select Location From Map

> **Role**: System Lead / Technical Architect  
> **Strategy**: 100% Free, Zero-API-Key Interactive Map Selection  
> **Depends on**: [FREE_LOCATION_SYSTEM_PLAN.md](./FREE_LOCATION_SYSTEM_PLAN.md) (Nominatim + `AddressAutocomplete` already shipped)  
> **Target Entries**: Client Portal (`index.html`) — ticket create + client settings (ops read views keep Maps deep links)

---

## 1. Executive Summary

Clients should be able to **pick a site on an interactive map** (click / drag a pin), not only type or search. The picker must stay **$0 cost** and **require no API keys**.

### Primary Pillars
1. **Leaflet** (open-source map UI library) — embeddable map, markers, click + drag.
2. **OpenStreetMap raster tiles** — free base map imagery (with required attribution).
3. **Nominatim reverse geocode** — reuse existing `locationService` path: pin → lat/lng → address string.
4. **Wire into `AddressAutocomplete`** — one new action: “Select on map”; keep search, GPS, unit/landmark, free-text, and Google Maps deep links.
5. **No Google Maps JS / Places SDK** — Google remains keyless deep links only (`buildGoogleMapsUrl`). Paid SDKs are an optional future upgrade, not MVP.

---

## 2. Why This Stack (Free Constraints)

| Capability | Free choice | Avoid for MVP |
| :--- | :--- | :--- |
| Interactive map UI | **Leaflet** (`leaflet` npm) | Google Maps JavaScript API |
| Map imagery | **OSM tile servers** (or free OSM-friendly CDN) | Mapbox / Google tiles (keys + billing) |
| Click → address | **Nominatim `/reverse`** (already used by GPS) | Google Geocoding API |
| Navigate in field | Existing **Google Maps search URL** | Embedded Google Maps |

**Attribution (required):** every map surface must show © OpenStreetMap contributors (Leaflet/OSM usage policy).

---

## 3. Architecture & Data Flow

```
+-----------------------------------------------------------------------+
|                     AddressAutocomplete.jsx                           |
|   Search | Use current location | Select on map | Unit | Maps link    |
+-----------------------------------+-----------------------------------+
                                    |
                    "Select on map" opens MapPickerModal
                                    |
                                    v
+-----------------------------------------------------------------------+
|              MapPickerModal.jsx (Leaflet + OSM tiles)                 |
|   - Initial center: existing lat/lng, GPS, or PH default (e.g. Cebu)  |
|   - Click map / drag marker → update lat, lng                         |
|   - Debounced reverse geocode → preview address                       |
|   - Confirm → return { addressString, lat, lng }                      |
+-----------------------------------+-----------------------------------+
                                    |
                                    v
+-----------------------------------------------------------------------+
|                     locationService.js                                |
|   reverseGeocodeNominatim(lat, lng)  ← extract/share from GPS path    |
|   buildGoogleMapsUrl({ address, lat, lng })                           |
+-----------------------------------------------------------------------+
                                    |
                                    v
              Existing form storage (site_address / [Site: ...])
              No Supabase schema change for MVP
```

---

## 4. What Already Exists (Do Not Rebuild)

| Piece | Status |
| :--- | :--- |
| `src/lib/locationService.js` | Search, GPS + reverse, Maps URL, format/parse site strings |
| `src/shared/components/AddressAutocomplete.jsx` | Combobox, GPS, unit field, Maps badge |
| Integrations | `TicketModal.jsx`, `ClientAccountSettings.jsx` |
| Ops / client read views | Site card + “Open in Google Maps” |
| Dev Nominatim proxy | `vite.config.js` → `/api/nominatim` |
| PH search bias | `countrycodes=ph` on forward search |

**Gap:** no interactive map UI; reverse geocode is embedded inside `getCurrentLocation()` and should be exposed as a reusable helper for the pin picker.

---

## 5. Detailed Component Plan

### Module A: Service (`src/lib/locationService.js`) — `backend-engineer`

Add / export:

1. **`reverseGeocodeNominatim(lat, lng)`**  
   - Shared by GPS and map picker.  
   - Returns same shape as `mapNominatimPlace` / `getCurrentLocation` (addressString, lat, lng, structured fields).  
   - Clear errors: invalid coords, HTTP failure, empty result.  
   - Refactor `getCurrentLocation()` to call this helper (no behavior change).

2. **Optional helpers (nice-to-have same PR)**  
   - `DEFAULT_MAP_CENTER` — Philippines-centric default (e.g. Metro Manila or Cebu) when no coords/GPS.  
   - Debounce guidance: UI owns ~400–500ms debounce on reverse calls while dragging.

3. **Tests** (`locationService.test.js`)  
   - Mock `fetch` for reverse success / failure / invalid input.  
   - Assert GPS still works via the shared helper.

**Out of scope for service:** Leaflet, React, tile URLs.

### Module B: Map Picker UI — `frontend-senior`

1. **Dependency**  
   - Add `leaflet` (+ `@types/leaflet` only if the repo adopts TS; currently JS — skip types or use community types optionally).  
   - Import Leaflet CSS once in the picker module (or dynamically with the component).

2. **`src/shared/components/MapPickerModal.jsx`** (new)  
   - Modal / drawer: map canvas, address preview, Confirm / Cancel.  
   - Leaflet map with OSM tile layer + attribution.  
   - Marker: set on click; draggable.  
   - On lat/lng change: debounced `reverseGeocodeNominatim` → show preview; never block Confirm if reverse fails (allow “use pin coords + manual address” fallback — prefer confirming only when address resolved, but keep free-text path if reverse fails with inline warning).  
   - Initial view priority:  
     1. Props `lat`/`lng` if present  
     2. Optional one-shot browser geolocation (explicit “Center on me” button — do not auto-prompt on open unless product wants it; prefer button)  
     3. `DEFAULT_MAP_CENTER` (PH)  
   - Accessibility: focus trap, Esc closes, labelled Confirm/Cancel, map instructions for keyboard users (“Use search or GPS if map is hard to use”).  
   - Dark mode: match existing slate modal patterns; Leaflet container min-height ~280–360px; responsive full-width on mobile.  
   - **Dynamic import** Leaflet (and CSS) when the modal opens to avoid bloating initial `main`/`ops` bundles.

3. **`AddressAutocomplete.jsx`**  
   - New button: **“Select on map”** (alongside “Use my current location”).  
   - Opens `MapPickerModal`; on confirm, set address + coords (same path as selecting a suggestion / GPS).  
   - Keep free-text always editable.

### Module C: Integrations — `frontend-senior`

No new form props required if coords stay in `AddressAutocomplete` local state for Maps badge only (same as today).  
Confirm still stores composed address via existing `formatStoredSiteAddress`.

| Surface | Work |
| :--- | :--- |
| `TicketModal.jsx` | None beyond autocomplete (inherits button) |
| `ClientAccountSettings.jsx` | None beyond autocomplete |
| `AccountModal.jsx` | **Follow-up** — still plain textarea; upgrade to `AddressAutocomplete` later for parity |
| Ops / client drawers | No change for MVP (still text + Maps link). Optional later: mini static preview |

### Module D: Audit — `audit-qa`

- Attribution present  
- No API keys / secrets  
- Rate-limit / reverse debounce  
- a11y of modal + map fallback  
- Bundle size check (Leaflet not in critical path until open)  
- `npm test` / `lint` / `build`

---

## 6. Implementation Phase Order

| Phase | Description | Key Deliverables | Owner |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Expose reverse geocode + tests | `reverseGeocodeNominatim`, refactor GPS, tests | `backend-engineer` |
| **Phase 2** | Add Leaflet dep + MapPickerModal | `package.json`, `MapPickerModal.jsx`, dynamic import | `frontend-senior` |
| **Phase 3** | Wire into AddressAutocomplete | “Select on map” button + confirm → fill fields | `frontend-senior` |
| **Phase 4** | Polish (mobile, dark mode, errors) | Attribution, loading/error states, PH default center | `frontend-senior` |
| **Phase 5** | Audit & validation | `npm test`, `npm run lint`, `npm run build` | `audit-qa` |

**Recommended order:** Phase 1 → Phase 2–4 (frontend) → Phase 5.

---

## 7. UX Spec (MVP)

1. User focuses site address field → can still search / type.  
2. Clicks **Select on map** → modal opens with OSM map.  
3. Clicks map (or drags pin) → pin moves; address preview updates after short debounce.  
4. Optionally clicks **Center on me** (GPS) to jump map (permission on click only).  
5. Clicks **Use this location** → modal closes; address input + coords update; Maps badge works.  
6. If reverse geocode fails → inline warning; user may cancel and type manually, or confirm coords-only only if product allows (MVP recommendation: **require successful reverse OR allow confirm with “Address unavailable — edit after closing”** and leave address empty for user to type). Prefer: show warning, keep Confirm disabled until reverse succeeds **or** user checks “Use pin anyway and type address myself”.

**Suggested default (simplest):** Confirm enabled only when reverse succeeds; Cancel always available; free-text remains outside modal.

---

## 8. Security, Performance & Policy Safeguards

- **No API keys** in source or required `.env` for MVP.  
- **Debounce reverse** while dragging (400–500ms); cancel in-flight requests.  
- **Sanitize** address strings via existing `sanitizeInput`.  
- **OSM / Nominatim usage**: identify via existing proxy User-Agent in dev; production should use `VITE_NOMINATIM_BASE` same-origin proxy (already documented in `.env.example`).  
- **Tile usage**: use standard OSM tile URL with attribution; do not hammer tiles (Leaflet default caching is fine for low traffic). For higher production traffic, document switching tile CDN later (still preferably free/OSM-friendly).  
- **Privacy**: map open does not imply GPS; GPS only on explicit “Center on me”.  
- **Zero-block**: map failure must not prevent typing an address in the combobox.

---

## 9. Explicit Non-Goals (MVP)

- Persisting lat/lng columns in Supabase (address string only, same as today).  
- Google Maps JavaScript / Places / Geocoding APIs.  
- Drawing polygons / multi-site maps.  
- Offline tile packs.  
- Upgrading `AccountModal` registration address (tracked as follow-up).  
- Full-screen field-tech live tracking.

---

## 10. Acceptance Criteria

1. From ticket create and client settings, user can open **Select on map**, place a pin, confirm, and see the address filled.  
2. Confirmed pin updates the Maps deep link (coords preferred when available in-session).  
3. Search, GPS, unit/landmark, and manual typing still work.  
4. Map shows OpenStreetMap attribution.  
5. No paid API keys required; Leaflet loads on demand (modal open), not necessarily on first page paint.  
6. Reverse geocode failures show inline error; user can dismiss and type manually.  
7. `npm test`, `npm run lint`, and `npm run build` pass.  
8. Works on desktop and mobile viewport widths used by existing modals.

---

## 11. Open Questions / Decisions

| Item | Recommendation |
| :--- | :--- |
| Default map center | Philippines (e.g. 12.8797, 121.7740 country view, or Metro Manila 14.5995, 120.9842) |
| Confirm without reverse? | Disable Confirm until reverse OK (simplest) |
| Persist lat/lng in DB? | Out of MVP; follow-up if ops need precise pins after reload |
| Tile provider | OSM default tiles for MVP; revisit if traffic grows |
| AccountModal map? | After it uses `AddressAutocomplete` |

---

## 12. Specialist Launch Order

1. **`backend-engineer`** — Phase 1 (`reverseGeocodeNominatim` + tests).  
2. **`frontend-senior`** — Phases 2–4 (Leaflet modal + autocomplete button).  
3. **`audit-qa`** — Phase 5 against this doc’s acceptance criteria.

---

## 13. File Checklist (Expected Touch List)

| File | Action |
| :--- | :--- |
| `src/lib/locationService.js` | Add `reverseGeocodeNominatim`; refactor GPS |
| `src/lib/locationService.test.js` | Cover reverse helper |
| `package.json` / lockfile | Add `leaflet` |
| `src/shared/components/MapPickerModal.jsx` | **Create** |
| `src/shared/components/AddressAutocomplete.jsx` | Add “Select on map” + wire modal |
| `.env.example` | No new required keys (optional note only) |
| `docs/system/FREE_MAP_PICKER_PLAN.md` | This plan |

No SQL / RLS changes for MVP.
