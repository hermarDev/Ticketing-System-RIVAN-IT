# 📍 Free Location System Architecture & Implementation Plan

> **Role**: System Lead / Technical Architect  
> **Strategy**: 100% Free, Zero-API-Key Location & Mapping Solution  
> **Target Entries**: Client Portal (`index.html`) & Operations Portal (`ops.html`)

---

## 1. Executive Summary

To eliminate manual address typing errors, streamline client onboarding, and provide field engineers with accurate site locations without incurring API costs or requiring credit cards, NetOps is implementing a **100% Free Hybrid Location System**.

### Primary Pillars
1. **OpenStreetMap / Nominatim Search Engine**: Real-time address autocomplete and geocoding at **$0 cost** with **zero API keys** required.
2. **Browser Native Geolocation (`navigator.geolocation`)**: Instant "Use Current Location" detection with 1-click user permission.
3. **Structured Address Parsing**: Automatic extraction of street, city, state/province, postal code, and country.
4. **Unit / Floor / Landmark Details**: Dedicated secondary field for IT infrastructure specifics (e.g., *"Building 3, 4th Floor, Server Room 402"*).
5. **Zero-Cost Google Maps Navigation Links**: One-click deep links (`https://www.google.com/maps/search/?api=1&query=...`) opening native Google Maps apps/web for field technicians without consuming API quotas.
6. **Future-Proof Google Upgrade Path**: If a `VITE_GOOGLE_MAPS_API_KEY` is added to `.env`, the system automatically upgrades to Google Places without code refactoring.

---

## 2. Architecture & Data Flow

```
+-----------------------------------------------------------------------+
|                            USER INTERFACE                             |
|    AddressAutocomplete.jsx (Search Input + "Use Current Location")   |
+-----------------------------------+-----------------------------------+
                                    |
          +-------------------------+-------------------------+
          |                                                   |
          v                                                   v
+-----------------------------+                 +-----------------------------+
|    Browser Geolocation      |                 |   OpenStreetMap Nominatim   |
|   navigator.geolocation     |                 |    Free Search API          |
|    (100% Free GPS)          |                 |    (100% Free Autocomplete)  |
+--------------+--------------+                 +--------------+--------------+
               |                                               |
               +----------------------+------------------------+
                                      |
                                      v
                    +------------------------------------+
                    |   Structured Location Object       |
                    |   - addressString                  |
                    |   - unitLandmark                   |
                    |   - lat / lng (optional)           |
                    |   - googleMapsUrl (Free Deep Link) |
                    +-----------------+------------------+
                                      |
                                      v
                    +------------------------------------+
                    |   Form State & Ticket Storage      |
                    |   (Supabase / Ticket Service)      |
                    +------------------------------------+
```

---

## 3. Detailed Component Plan

### Module 1: Foundation Service (`src/lib/locationService.js`)
- **`searchAddressNominatim(query)`**: Debounced (300ms) query to OpenStreetMap Nominatim search API. Returns formatted suggestions array.
- **`getCurrentLocation()`**: Prompts browser geolocation, performs reverse geocoding via Nominatim, and returns address + lat/lng.
- **`buildGoogleMapsUrl(address, lat, lng)`**: Constructs a free, keyless Google Maps search/pin link for field staff navigation.

### Module 2: UI Component (`src/shared/components/AddressAutocomplete.jsx`)
- **Interactive Search**: Accessible input with real-time dropdown menu showing address suggestions.
- **GPS Button**: "Use My Current Location" button with loading spinner and error toast fallback.
- **Secondary Field**: "Unit / Floor / Rack / Landmark" input tailored for IT ticket dispatches.
- **Map Badge**: Visual confirmation badge with clickable "View on Google Maps" preview.

### Module 3: System Integrations
1. **New Ticket Modal (`src/features/inquiries/components/TicketModal.jsx`)**: Upgrade site installation address input to use `AddressAutocomplete`.
2. **Client Settings (`src/features/auth/components/ClientAccountSettings.jsx`)**: Upgrade client default address field to use `AddressAutocomplete`.
3. **Ops Ticket Drawer (`src/features/admin/components/AdminTicketDrawer.jsx`)**: Display site address card with a direct Google Maps navigation button for technicians.
4. **Client Dashboard Ticket Modal (`src/features/client/components/IsolatedTicketModal.jsx`)**: Render site location card with map link.

---

## 4. Implementation Phase Order

| Phase | Description | Key Deliverables | Specialist Owner |
| :--- | :--- | :--- | :--- |
| **Phase 1** | Foundation Service & Tests | `src/lib/locationService.js`, `src/lib/locationService.test.js` | `backend-engineer` |
| **Phase 2** | Reusable UI Component | `src/shared/components/AddressAutocomplete.jsx` | `frontend-senior` |
| **Phase 3** | Ticket Modal & Profile Integration | `TicketModal.jsx`, `ClientAccountSettings.jsx` | `frontend-senior` |
| **Phase 4** | Ops Drawer & Client View Integration | `AdminTicketDrawer.jsx`, `IsolatedTicketModal.jsx` | `frontend-senior` |
| **Phase 5** | Audit, Tests & Build Validation | `npm test`, `npm run lint`, `npm run build` | `audit-qa` |

---

## 5. Security, Performance & UX Safeguards
- **Debounced Requests**: 300ms input debounce prevents rate-limiting on OpenStreetMap servers.
- **Input Sanitization**: All address string inputs are sanitized using existing `sanitizeInput` from `src/lib/formValidation.js`.
- **Privacy Consent**: Geolocation only triggers when the user explicitly clicks "Use Current Location".
- **Zero-Block Fallback**: If network is offline or Nominatim is unreachable, users can still type custom text manually without getting blocked.
