import { isSupabaseConfigured, signOutLocal, supabase } from './supabaseClient'
import { generateClientId, generateTicketId } from './idGenerators'
import { logger } from './logger'
import { dispatchNotification } from './notificationService'
import {
  sanitizeInput,
  isValidEmail,
  getPasswordValidationError,
  mapAuthPasswordError,
} from './formValidation'
import {
  normalizeTicketPriority,
  resolveClientUrgencyDisplay,
  resolveCreateUrgencyAndPriority,
  applyLocalPriorityUpdate,
} from './ticketPriority'

export { sanitizeInput }

export {
  CLIENT_URGENCIES,
  TICKET_PRIORITIES,
  normalizeClientUrgency,
  normalizeTicketPriority,
  mapUrgencyToPriority,
  mapPriorityToUrgency,
  resolveClientUrgencyDisplay,
  resolveCreateUrgencyAndPriority,
} from './ticketPriority'

export {
  setActiveTicketId,
  isTicketActive,
  getNotificationLogs,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  clearNotificationLogs,
  getUnreadNotificationCount,
} from './notificationService'

// Local storage keys for fallback offline mode
const LOCAL_STORAGE_TICKETS = 'netops_tickets_v1'
const LOCAL_STORAGE_ACCOUNTS = 'netops_accounts_v1'
const LOCAL_STORAGE_REPLIES = 'netops_replies_v1'
const LOCAL_STORAGE_SESSION_CLIENT = 'netops_session_client_v1'
const MAX_ATTACHMENT_REFERENCE_BYTES = 50000

const getLocalData = (key, defaultValue = []) => {
  try {
    const data = localStorage.getItem(key)
    return data ? JSON.parse(data) : defaultValue
  } catch (e) {
    logger.error('Error reading localStorage:', e)
    return defaultValue
  }
}

const setLocalData = (key, value) => {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch (e) {
    logger.error('Error saving to localStorage:', e)
  }
}

function hasInlineAttachmentData(attachment) {
  if (typeof attachment !== 'string') return false
  const trimmed = attachment.trim()
  if (!trimmed) return false
  if (trimmed.includes('data:')) return true
  if (!trimmed.startsWith('[')) return false
  try {
    const parsed = JSON.parse(trimmed)
    return Array.isArray(parsed) && parsed.some((value) => typeof value === 'string' && value.startsWith('data:'))
  } catch {
    return false
  }
}

/**
 * Returns true if the string matches the standard UUID format (any version).
 * @param {*} str - Value to test
 * @returns {boolean}
 */
export const isUUID = (str) =>
  typeof str === 'string' &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str)

/**
 * Resolves a staff value to a display name string.
 * @param {string|Object|null} staff - Staff string name or profile object
 * @returns {string}
 */
export const getStaffDisplayName = (staff) => {
  if (!staff) return ''
  if (typeof staff === 'string') return staff.trim()
  return (
    staff.full_name ||
    staff.fullName ||
    staff.name ||
    staff.email ||
    ''
  ).trim()
}

/**
 * Resolves a staff value to a UUID assignment ID, or null if not applicable.
 * @param {string|Object|null} staff - Staff UUID string or profile object with id
 * @returns {string|null}
 */
export const getStaffAssignmentId = (staff) => {
  if (!staff) return null
  if (typeof staff === 'string') return isUUID(staff.trim()) ? staff.trim() : null
  return isUUID(staff.id) ? staff.id : null
}

/**
 * Resolves staff input into an assignment target without hitting the database.
 * Empty / falsy staff means unassign (`id` and `lookupName` both null).
 * A known UUID sets `id`; a display name or email sets `lookupName` for a profiles query.
 *
 * @param {string|Object|null|undefined} staff
 * @returns {{ id: string|null, lookupName: string|null }}
 */
export function resolveStaffAssignmentTarget(staff) {
  if (staff == null || staff === false) {
    return { id: null, lookupName: null }
  }
  if (typeof staff === 'string') {
    const trimmed = staff.trim()
    if (!trimmed) return { id: null, lookupName: null }
    if (isUUID(trimmed)) return { id: trimmed, lookupName: null }
    return { id: null, lookupName: trimmed }
  }
  const id = getStaffAssignmentId(staff)
  if (id) return { id, lookupName: null }
  const name = getStaffDisplayName(staff)
  if (!name) return { id: null, lookupName: null }
  return { id: null, lookupName: name }
}

/** Canonical ticket statuses matching supabase/schema.sql CHECK constraint. */
export const TICKET_STATUSES = Object.freeze([
  'New',
  'In Progress',
  'Pending Client',
  'Resolved',
  'Closed',
])

const TICKET_STATUS_SET = new Set(TICKET_STATUSES)

/** Legacy UI labels mapped to canonical statuses before persistence. */
const LEGACY_STATUS_ALIASES = Object.freeze({
  Open: 'New',
})

/**
 * Normalizes a ticket status for persistence: trims, maps legacy aliases
 * (e.g. "Open" → "New"), and returns null when the value is not allowlisted.
 * Does not treat "In Progress" as Resolved/Closed.
 *
 * @param {*} status - Raw status string
 * @returns {string|null} Canonical status or null if invalid
 */
export function normalizeTicketStatus(status) {
  if (typeof status !== 'string') return null
  const trimmed = status.trim()
  if (!trimmed) return null
  const mapped = LEGACY_STATUS_ALIASES[trimmed] || trimmed
  return TICKET_STATUS_SET.has(mapped) ? mapped : null
}

async function getStaffNameMap(staffIds) {
  const uniqueIds = [...new Set(staffIds.filter(Boolean))]
  if (!uniqueIds.length || !isSupabaseConfigured || !supabase) return new Map()

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', uniqueIds)

  if (error) {
    logger.warn('Supabase staff profile lookup error:', error.message)
    return new Map()
  }

  return new Map(
    (data || []).map((profile) => [
      profile.id,
      profile.full_name || profile.email || profile.id,
    ])
  )
}

/**
 * Looks up a staff/admin/ceo profile id by exact full_name or email (case-insensitive).
 * Returns null when no match is found or Supabase is unavailable.
 * @param {string} nameOrEmail
 * @returns {Promise<string|null>}
 */
async function lookupStaffIdByNameOrEmail(nameOrEmail) {
  const needle = typeof nameOrEmail === 'string' ? nameOrEmail.trim() : ''
  if (!needle || !isSupabaseConfigured || !supabase) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('role', ['staff', 'admin', 'ceo'])

  if (error) {
    logger.warn('Supabase staff name lookup error:', error.message)
    return null
  }

  const needleLower = needle.toLowerCase()
  const match = (data || []).find((profile) => {
    const fullName = (profile.full_name || '').trim().toLowerCase()
    const email = (profile.email || '').trim().toLowerCase()
    return fullName === needleLower || email === needleLower
  })

  return match?.id || null
}

/**
 * Resolves staff input to a UUID for `tickets.assigned_to`, or null to unassign.
 * Never returns a non-UUID string.
 * @param {string|Object|null|undefined} staff
 * @returns {Promise<string|null>}
 * @throws {Error} When a non-empty name/email cannot be matched to a staff profile
 */
async function resolveAssignedToUuid(staff) {
  const target = resolveStaffAssignmentTarget(staff)
  if (target.id) return target.id
  if (!target.lookupName) return null

  const lookedUp = await lookupStaffIdByNameOrEmail(target.lookupName)
  if (!lookedUp) {
    throw new Error(`No staff profile found for "${target.lookupName}"`)
  }
  return lookedUp
}

function formatTicketRow(t, staffNameMap = new Map()) {
  const assignedToId = t.assigned_to || null
  const resolvedName = assignedToId
    ? (staffNameMap.get(assignedToId) || '')
    : ''
  return {
    id: t.id,
    ticketNumber: t.ticket_number,
    clientName: t.client_name,
    companyName: t.company_name,
    email: t.email,
    phone: t.phone,
    category: t.category,
    priority: t.priority,
    clientUrgency: resolveClientUrgencyDisplay(t),
    priorityUpdatedAt: t.priority_updated_at || t.priorityUpdatedAt || null,
    priorityUpdatedBy: t.priority_updated_by || t.priorityUpdatedBy || null,
    subject: t.subject,
    description: t.description,
    attachment: t.attachment || '',
    assignedTo: resolvedName,
    assignedToId: assignedToId && isUUID(String(assignedToId)) ? assignedToId : null,
    status: t.status,
    createdAt: t.created_at,
  }
}

/**
 * Persists the current client session object to local storage, or clears it if null.
 * @param {Object|null} account - Client account object or null to clear
 * @returns {void}
 */
export function saveCurrentClientSession(account) {
  if (account) {
    setLocalData(LOCAL_STORAGE_SESSION_CLIENT, account)
  } else {
    try {
      localStorage.removeItem(LOCAL_STORAGE_SESSION_CLIENT)
    } catch {}
  }
}

/**
 * Retrieves the persisted client session from local storage.
 * @returns {Object|null}
 */
export function getCurrentClientSession() {
  return getLocalData(LOCAL_STORAGE_SESSION_CLIENT, null)
}

const PLACEHOLDER_COMPANY_NAMES = new Set(['Google User', 'Client', 'Company'])

function pickRicherString(existing, incoming) {
  const a = String(existing ?? '').trim()
  const b = String(incoming ?? '').trim()
  return a || b
}

function pickCompanyName(existing, incoming) {
  const a = String(existing ?? '').trim()
  const b = String(incoming ?? '').trim()
  const aPlaceholder = !a || PLACEHOLDER_COMPANY_NAMES.has(a)
  const bPlaceholder = !b || PLACEHOLDER_COMPANY_NAMES.has(b)
  if (!aPlaceholder) return a
  if (!bPlaceholder) return b
  return a || b
}

/**
 * Merges two client profile snapshots, preferring non-empty / non-placeholder values.
 * Used when auth listener and signup handler both update session state.
 * @param {Object|null|undefined} existing
 * @param {Object|null|undefined} incoming
 * @returns {Object|null}
 */
export function mergeClientAccountProfiles(existing, incoming) {
  if (!incoming) return existing || null
  if (!existing) return incoming

  return {
    ...incoming,
    id: existing.id || incoming.id,
    clientId: existing.clientId || incoming.clientId,
    firstName: pickRicherString(existing.firstName, incoming.firstName),
    lastName: pickRicherString(existing.lastName, incoming.lastName),
    fullName: pickRicherString(existing.fullName, incoming.fullName),
    companyName: pickCompanyName(existing.companyName || existing.company, incoming.companyName || incoming.company),
    email: pickRicherString(existing.email, incoming.email),
    phone: pickRicherString(existing.phone, incoming.phone),
    siteAddress: pickRicherString(existing.siteAddress, incoming.siteAddress),
    gmailSendEnabled: incoming.gmailSendEnabled ?? existing.gmailSendEnabled ?? false,
    gmailReplyTo: incoming.gmailReplyTo ?? existing.gmailReplyTo ?? null,
  }
}

/**
 * Creates a new client account via Supabase Auth and inserts a matching `clients` row.
 * Falls back to local storage when Supabase is not configured.
 * @param {Object} accountData - Registration form fields (email, password, firstName, lastName, etc.)
 * @returns {Promise<Object>} Created client profile object
 */
export async function createAccount(accountData) {
  const passwordPolicyError = getPasswordValidationError(accountData.password)
  if (passwordPolicyError) {
    throw new Error(passwordPolicyError)
  }

  if (isSupabaseConfigured && supabase) {
    const generatedClientId = generateClientId()
    const firstName = sanitizeInput(accountData.firstName || '', 100)
    const lastName = sanitizeInput(accountData.lastName || '', 100)
    const fullName = sanitizeInput(accountData.fullName || `${firstName} ${lastName}`, 200).trim()
    const companyName = sanitizeInput(accountData.companyName || accountData.company || '', 200)
    const phone = sanitizeInput(accountData.phone || '', 20)
    const normalizedEmail = accountData.email.toLowerCase().trim()

    // 1. Create auth user with Supabase Auth (metadata for trigger + syncOAuthUser)
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email: normalizedEmail,
      password: accountData.password,
      options: {
        data: {
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          company_name: companyName,
          phone,
        },
      },
    })

    if (authError) {
      if (authError.message?.includes('already registered')) {
        throw new Error('An account with this email already exists. Please log in instead.')
      }
      throw new Error(mapAuthPasswordError(authError.message) || authError.message)
    }

    // 2. Insert client profile row linked to auth user
    const { data, error } = await supabase
      .from('clients')
      .insert([
        {
          client_id: generatedClientId,
          auth_user_id: authData.user?.id || null,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          company_name: companyName,
          email: normalizedEmail,
          phone,
          site_address: sanitizeInput(accountData.siteAddress || '', 500),
        },
      ])
      .select()
      .single()

    if (error) {
      if (authData.user?.id) {
        try {
          await supabase.auth.admin.deleteUser(authData.user.id)
        } catch (cleanupErr) {
          logger.warn('Could not clean up orphaned auth user after client insert failure:', cleanupErr.message)
        }
      }
      if (error.code === '23505') {
        throw new Error('An account with this email already exists. Please log in instead.')
      }
      throw new Error(error.message)
    }

    // 3. Ensure security profile row exists with role = 'client' (update if trigger already created sparse row)
    if (authData.user?.id) {
      await supabase.from('profiles').upsert([
        {
          id: authData.user.id,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          email: normalizedEmail,
          phone,
          company_name: companyName,
          role: 'client',
        },
      ], { onConflict: 'id' })
    }

    return {
      id: data.id,
      clientId: data.client_id,
      firstName: data.first_name || firstName,
      lastName: data.last_name || lastName,
      fullName: data.full_name || fullName,
      companyName: data.company_name || companyName,
      email: data.email,
      phone: data.phone || phone,
      siteAddress: data.site_address,
    }
  }

  // Fallback: local storage (development only)
  const accounts = getLocalData(LOCAL_STORAGE_ACCOUNTS, [])
  const existing = accounts.find(
    (a) => a.email?.toLowerCase() === accountData.email?.toLowerCase().trim()
  )
  if (existing) {
    throw new Error('An account with this email already exists. Please log in instead.')
  }

  const firstName = sanitizeInput(accountData.firstName || '', 100)
  const lastName = sanitizeInput(accountData.lastName || '', 100)
  const fullName = sanitizeInput(accountData.fullName || `${firstName} ${lastName}`, 200).trim()

  const newAccount = {
    id: crypto.randomUUID(),
    clientId: generateClientId(),
    firstName,
    lastName,
    fullName,
    companyName: sanitizeInput(accountData.companyName || accountData.company || '', 200),
    email: accountData.email.toLowerCase().trim(),
    phone: sanitizeInput(accountData.phone || '', 20),
    siteAddress: sanitizeInput(accountData.siteAddress || '', 500),
    createdAt: new Date().toISOString(),
  }
  accounts.push(newAccount)
  setLocalData(LOCAL_STORAGE_ACCOUNTS, accounts)
  return newAccount
}

/**
 * Updates a client account profile by email in Supabase and syncs the profiles table.
 * @param {string} email - Client email used as lookup key
 * @param {Object} updateData - Fields to update (firstName, lastName, companyName, phone, siteAddress)
 * @returns {Promise<Object>} Updated client profile object
 */
export async function updateClientAccount(email, updateData) {
  const normalizedEmail = email?.toLowerCase().trim()
  if (!normalizedEmail) throw new Error('Email is required to update account.')

  const firstName = sanitizeInput(updateData.firstName || '', 100)
  const lastName = sanitizeInput(updateData.lastName || '', 100)
  const fullName = (updateData.fullName || `${firstName} ${lastName}`).trim()
  const companyName = sanitizeInput(updateData.companyName || updateData.company || '', 200)
  const phone = sanitizeInput(updateData.phone || '', 20)
  const siteAddress = sanitizeInput(updateData.siteAddress || '', 500)

  if (isSupabaseConfigured && supabase) {
    const updatePayload = {
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      company_name: companyName,
      phone,
      site_address: siteAddress,
    }

    const { data, error } = await supabase
      .from('clients')
      .update(updatePayload)
      .eq('email', normalizedEmail)
      .select()
      .single()

    if (error) {
      logger.error('Supabase updateClientAccount error:', error)
      throw new Error(error.message)
    }

    // Keep public.profiles in sync
    const { data: sessionData } = await supabase.auth.getSession()
    if (sessionData?.session?.user?.id) {
      const { error: profileSyncError } = await supabase
        .from('profiles')
        .update({
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          company_name: companyName,
          phone,
        })
        .eq('id', sessionData.session.user.id)
      if (profileSyncError) {
        logger.warn('Failed to sync profiles table during account update:', profileSyncError.message)
      }
    }

    return {
      id: data.id,
      clientId: data.client_id,
      firstName: data.first_name || firstName,
      lastName: data.last_name || lastName,
      fullName: data.full_name || fullName,
      companyName: data.company_name || companyName,
      email: data.email,
      phone: data.phone || phone,
      siteAddress: data.site_address || siteAddress,
    }
  }

  // Fallback: local storage
  const accounts = getLocalData(LOCAL_STORAGE_ACCOUNTS, [])
  const updatedAccounts = accounts.map((a) => {
    if (a.email?.toLowerCase() === normalizedEmail) {
      return {
        ...a,
        firstName,
        lastName,
        fullName,
        companyName,
        phone,
        siteAddress,
      }
    }
    return a
  })
  setLocalData(LOCAL_STORAGE_ACCOUNTS, updatedAccounts)

  const updatedAcc = updatedAccounts.find((a) => a.email?.toLowerCase() === normalizedEmail)
  return updatedAcc || { firstName, lastName, fullName, companyName, email: normalizedEmail, phone, siteAddress }
}


/**
 * Authenticates a client with email and password via Supabase Auth.
 * @param {string} email - Client email address
 * @param {string} password - Client password
 * @returns {Promise<Object>} Client profile object on success
 */
export async function loginClient(email, password) {
  const normalizedEmail = email.toLowerCase().trim()

  if (isSupabaseConfigured && supabase) {
    // Authenticate with Supabase Auth
    const { error: authError } = await supabase.auth.signInWithPassword({
      email: normalizedEmail,
      password,
    })

    if (authError) {
      throw new Error('Invalid email or password. Please try again.')
    }

    // Fetch client profile
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .eq('email', normalizedEmail)
      .single()

    if (error || !data) {
      await signOutLocal()
      throw new Error('No client profile found. Please create an account first.')
    }

    const firstName = data.first_name || (data.full_name ? data.full_name.split(' ')[0] : '')
    const lastName = data.last_name || (data.full_name ? data.full_name.split(' ').slice(1).join(' ') : '')

    return {
      id: data.id,
      clientId: data.client_id,
      firstName,
      lastName,
      fullName: data.full_name || `${firstName} ${lastName}`.trim(),
      companyName: data.company_name,
      email: data.email,
      phone: data.phone,
      siteAddress: data.site_address,
    }
  }

  // DEV-ONLY FALLBACK: No password verification — local storage has no auth.
  // This path is only reachable when Supabase is not configured.
  console.warn('[DEV-ONLY] loginClient: local-storage fallback — no password verification is performed. Do NOT use in production.')
  const accounts = getLocalData(LOCAL_STORAGE_ACCOUNTS, [])
  const found = accounts.find((a) => a.email?.toLowerCase() === normalizedEmail)
  if (!found) {
    throw new Error('No account found with that email. Please create an account first.')
  }
  return found
}

/**
 * Signs out the current client from Supabase Auth and clears the local session.
 * Uses local scope so an ops-portal session in the same browser profile is preserved.
 * @returns {Promise<void>}
 */
export async function logoutClient() {
  if (isSupabaseConfigured && supabase) {
    try {
      await signOutLocal()
    } catch (err) {
      logger.error('Supabase signOut error:', err)
    }
  }
  try {
    localStorage.removeItem(LOCAL_STORAGE_SESSION_CLIENT)
  } catch (e) {
    logger.error('Error removing client session from localStorage:', e)
  }
}

/**
 * Initiates Google OAuth sign-in via Supabase Auth with redirect to origin.
 * @returns {Promise<Object>} OAuth redirect data from Supabase
 */
export async function loginWithGoogle() {
  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
      },
    })
    if (error) {
      throw new Error(error.message)
    }
    return data
  }
  throw new Error('Supabase is not configured. Please set your credentials in .env file.')
}

/**
 * Sends a password recovery email via Supabase Auth.
 * Uses Supabase Auth's built-in recovery flow; no app-table changes required.
 * @param {string} email
 * @param {string} [redirectTo] - URL Supabase should redirect to after link click
 * @returns {Promise<void>}
 */
export async function requestPasswordResetForEmail(email, redirectTo) {
  const normalizedEmail = email?.toLowerCase().trim()
  if (!normalizedEmail) throw new Error('Please enter a valid email address.')
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please set your credentials in .env file.')
  }

  const redirectUrl = redirectTo || (typeof window !== 'undefined' ? window.location.href : undefined)
  const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo: redirectUrl })
  if (error) throw new Error(error.message || 'Failed to send password reset email.')
}

/**
 * Completes password recovery for the current user session embedded in the URL.
 * @param {string} newPassword
 * @returns {Promise<void>}
 */
export async function completePasswordRecovery(newPassword) {
  const password = String(newPassword || '')
  const passwordPolicyError = getPasswordValidationError(password)
  if (passwordPolicyError) {
    throw new Error(passwordPolicyError)
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please set your credentials in .env file.')
  }

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError || !sessionData?.session) {
    throw new Error('Invalid or expired recovery link. Please request a new reset email.')
  }

  const { error: updateError } = await supabase.auth.updateUser({ password })
  if (updateError) {
    throw new Error(mapAuthPasswordError(updateError.message) || updateError.message || 'Failed to update password.')
  }
}

/**
 * Changes password for the currently logged-in user after verifying the current password.
 * @param {{ email: string, currentPassword: string, newPassword: string }} params
 * @returns {Promise<void>}
 */
export async function changeAuthenticatedUserPassword({ email, currentPassword, newPassword }) {
  const normalizedEmail = String(email || '').toLowerCase().trim()
  const current = String(currentPassword || '')
  const next = String(newPassword || '')

  if (!normalizedEmail) throw new Error('Please sign in again to change your password.')
  if (!current) throw new Error('Please enter your current password.')
  const passwordPolicyError = getPasswordValidationError(next)
  if (passwordPolicyError) {
    throw new Error(passwordPolicyError)
  }
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please set your credentials in .env file.')
  }

  const { error: signInError } = await supabase.auth.signInWithPassword({
    email: normalizedEmail,
    password: current,
  })

  if (signInError) {
    throw new Error('Current password is incorrect. Please try again.')
  }

  const { error: updateError } = await supabase.auth.updateUser({ password: next })
  if (updateError) {
    throw new Error(mapAuthPasswordError(updateError.message) || updateError.message || 'Failed to update password.')
  }
}

/**
 * Synchronizes an OAuth auth user with the `clients` table, auto-creating a row on first login.
 * @param {Object} authUser - Supabase Auth user object from the OAuth session
 * @returns {Promise<Object|null>} Client profile object, or null for staff/admin users
 */
export async function syncOAuthUser(authUser) {
  if (!authUser || !isSupabaseConfigured || !supabase) return null

  const email = authUser.email?.toLowerCase().trim()
  if (!email) return null

  const authProvider = authUser.app_metadata?.provider || 'email'
  const isGoogleOAuth =
    authProvider === 'google' ||
    (Array.isArray(authUser.app_metadata?.providers) &&
      authUser.app_metadata.providers.includes('google'))

  try {
    // 0. Check if this auth user has a profile in profiles table
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('id, role')
      .eq('id', authUser.id)
      .maybeSingle()

    if (userProfile && ['staff', 'admin', 'ceo'].includes(userProfile.role)) {
      // User is a Staff/Admin/CEO member, NOT a client
      return null
    }

    const fullName = authUser.user_metadata?.full_name || authUser.user_metadata?.name || email.split('@')[0]
    const nameParts = fullName.split(' ')
    const firstName = authUser.user_metadata?.first_name || nameParts[0] || 'Client'
    const lastName = authUser.user_metadata?.last_name || nameParts.slice(1).join(' ') || ''

    if (!userProfile) {
      await supabase.from('profiles').upsert([
        {
          id: authUser.id,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          email: email,
          role: 'client',
        },
      ], { onConflict: 'id' })
    }

    const mapClientRow = (row, fallbacks = {}) => {
      const rowFirst = row.first_name || fallbacks.firstName || (row.full_name ? row.full_name.split(' ')[0] : '')
      const rowLast =
        row.last_name ||
        fallbacks.lastName ||
        (row.full_name ? row.full_name.split(' ').slice(1).join(' ') : '')
      return {
        id: row.id,
        clientId: row.client_id,
        firstName: rowFirst,
        lastName: rowLast,
        fullName: row.full_name || `${rowFirst} ${rowLast}`.trim(),
        companyName: row.company_name || fallbacks.companyName || 'Client',
        email: row.email,
        phone: row.phone || '',
        siteAddress: row.site_address || '',
        gmailSendEnabled: row.gmail_send_enabled ?? false,
        gmailReplyTo: row.gmail_reply_to ?? null,
      }
    }

    const fetchClientByEmail = async () => {
      const { data } = await supabase
        .from('clients')
        .select('id, client_id, auth_user_id, first_name, last_name, full_name, company_name, email, phone, site_address, gmail_send_enabled, gmail_reply_to')
        .eq('email', email)
        .maybeSingle()
      return data
    }

    // 1. Try to fetch existing client row by email
    let existingClient = await fetchClientByEmail()

    if (existingClient) {
      if (!existingClient.auth_user_id && authUser.id) {
        await supabase
          .from('clients')
          .update({ auth_user_id: authUser.id })
          .eq('id', existingClient.id)
      }
      return mapClientRow(existingClient)
    }

    // Email/password signup: createAccount may still be inserting — brief retry before sparse auto-create
    if (!isGoogleOAuth) {
      await new Promise((resolve) => setTimeout(resolve, 400))
      existingClient = await fetchClientByEmail()
      if (existingClient) {
        if (!existingClient.auth_user_id && authUser.id) {
          await supabase
            .from('clients')
            .update({ auth_user_id: authUser.id })
            .eq('id', existingClient.id)
        }
        return mapClientRow(existingClient)
      }
      return null
    }

    // 2. Auto-create client profile row for first-time Google OAuth user
    const generatedClientId = generateClientId()

    const { data: newClient, error } = await supabase
      .from('clients')
      .upsert([
        {
          client_id: generatedClientId,
          auth_user_id: authUser.id,
          first_name: firstName,
          last_name: lastName,
          full_name: fullName,
          company_name: 'Google User',
          email: email,
          phone: '',
          site_address: '',
        },
      ], { onConflict: 'email', ignoreDuplicates: true })
      .select()
      .single()

    if (error) {
      // Conflict from concurrent insert — re-fetch the existing row
      const existingRow = await fetchClientByEmail()
      if (existingRow) {
        return mapClientRow(existingRow, {
          firstName,
          lastName,
          companyName: 'Google User',
        })
      }
      logger.warn('Error auto-creating OAuth client profile:', error.message)
      return null
    }

    return mapClientRow(newClient, {
      firstName,
      lastName,
      companyName: newClient.company_name,
    })
  } catch (err) {
    logger.error('Exception in syncOAuthUser:', err)
    return null
  }
}



// Idempotency cache to prevent duplicate ticket submissions within 10 seconds
const recentTicketSubmissions = new Map()

function pruneRecentTicketSubmissions() {
  if (recentTicketSubmissions.size <= 50) return
  const now = Date.now()
  for (const [k, v] of recentTicketSubmissions.entries()) {
    if (now - v.timestamp > 10000) recentTicketSubmissions.delete(k)
  }
}

/**
 * Submits a new support ticket to Supabase with idempotency guard; falls back to local storage.
 * Client urgency is validated; ops priority is always auto-triaged (client priority ignored).
 * Does not set priority_updated_at / priority_updated_by on create.
 *
 * @param {Object} ticketData - Ticket form fields (email, subject, description, category, clientUrgency, etc.)
 * @returns {Promise<Object>} Created ticket object
 */
export async function createTicket(ticketData) {
  const email = ticketData.email?.toLowerCase().trim()
  const subject = ticketData.subject?.trim()
  const cacheKey = `${email}:${subject}`
  const now = Date.now()

  // Idempotency check: block identical ticket created within 10 seconds
  const cached = recentTicketSubmissions.get(cacheKey)
  if (cached && now - cached.timestamp < 10000) {
    logger.warn('Duplicate ticket submission blocked by idempotency guard:', cacheKey)
    return cached.ticket
  }

  const { clientUrgency, priority } = resolveCreateUrgencyAndPriority(ticketData)
  const ticketNumber = generateTicketId()
  const attachmentValue = typeof ticketData.attachment === 'string' ? ticketData.attachment.trim() : ''

  if (isSupabaseConfigured && supabase) {
    if (hasInlineAttachmentData(attachmentValue)) {
      throw new Error('Attachment upload failed. Please re-upload files and try again.')
    }
    if (attachmentValue.length > MAX_ATTACHMENT_REFERENCE_BYTES) {
      throw new Error('Attachment payload is too large. Please remove large files and try again.')
    }
  }

  if (isSupabaseConfigured && supabase) {
    // Get current auth session user ID if available
    const { data: sessionData } = await supabase.auth.getSession()
    const authUserId = sessionData?.session?.user?.id

    const payload = {
      ticket_number: ticketNumber,
      client_name: sanitizeInput(ticketData.clientName, 200),
      company_name: sanitizeInput(ticketData.companyName, 200),
      email: ticketData.email?.toLowerCase().trim(),
      phone: sanitizeInput(ticketData.phone, 20) || '',
      category: sanitizeInput(ticketData.category, 100),
      client_urgency: clientUrgency,
      priority,
      subject: sanitizeInput(ticketData.subject, 300),
      description: sanitizeInput(ticketData.description, 5000),
      attachment: attachmentValue,
      status: 'New',
    }

    if (isUUID(authUserId)) {
      payload.client_id = authUserId
    } else if (isUUID(ticketData.clientId)) {
      payload.client_id = ticketData.clientId
    }

    let { data, error } = await supabase.from('tickets').insert([payload]).select().single()

    // If RLS blocks SELECT on returning row for anonymous users, perform insert-only
    if (error && (error.code === '42501' || error.message?.includes('permission denied'))) {
      logger.warn('SELECT policy blocked returning row, attempting insert-only payload...')
      const { error: insertOnlyErr } = await supabase.from('tickets').insert([payload])
      if (!insertOnlyErr) {
        data = {
          id: crypto.randomUUID(),
          ticket_number: payload.ticket_number,
          client_name: payload.client_name,
          company_name: payload.company_name,
          email: payload.email,
          phone: payload.phone,
          category: payload.category,
          client_urgency: payload.client_urgency,
          priority: payload.priority,
          subject: payload.subject,
          description: payload.description,
          attachment: payload.attachment,
          status: payload.status,
          created_at: new Date().toISOString(),
        }
        error = null
      } else {
        error = insertOnlyErr
      }
    }

    if (error) {
      logger.error('Supabase createTicket error:', error)
      throw new Error(error.message || 'Failed to submit ticket to database.')
    }

    if (data) {
      const createdTicket = {
        id: data.id,
        ticketNumber: data.ticket_number,
        clientName: data.client_name,
        companyName: data.company_name,
        email: data.email,
        phone: data.phone,
        category: data.category,
        clientUrgency: data.client_urgency || clientUrgency,
        priority: data.priority,
        subject: data.subject,
        description: data.description,
        attachment: data.attachment || ticketData.attachment || '',
        status: data.status,
        createdAt: data.created_at,
      }
      recentTicketSubmissions.set(cacheKey, { timestamp: now, ticket: createdTicket })
      pruneRecentTicketSubmissions()

      // Dispatch custom event for real-time reactive updates
      if (typeof window !== 'undefined') {
        window.dispatchEvent(new CustomEvent('netops_ticket_updated', { detail: createdTicket }))
      }
      return createdTicket
    }
  }

  // Fallback local storage
  const tickets = getLocalData(LOCAL_STORAGE_TICKETS, [])
  const newTicket = {
    id: crypto.randomUUID(),
    ticketNumber,
    clientName: ticketData.clientName,
    companyName: ticketData.companyName,
    email: ticketData.email,
    phone: ticketData.phone || '',
    category: ticketData.category,
    clientUrgency,
    client_urgency: clientUrgency,
    priority,
    subject: ticketData.subject,
    description: ticketData.description,
    attachment: ticketData.attachment || '',
    status: 'New',
    createdAt: new Date().toISOString(),
  }
  tickets.unshift(newTicket)
  setLocalData(LOCAL_STORAGE_TICKETS, tickets)
  recentTicketSubmissions.set(cacheKey, { timestamp: now, ticket: newTicket })
  pruneRecentTicketSubmissions()
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('netops_ticket_updated', { detail: newTicket }))
  }
  return newTicket
}

/**
 * Fetches all tickets from Supabase ordered by creation date, with local storage fallback.
 * @param {Object} [options={}] - Pagination options
 * @param {number} [options.limit=100] - Maximum number of tickets to return
 * @param {number} [options.offset=0] - Number of tickets to skip
 * @returns {Promise<Array>} Array of formatted ticket objects
 */
export async function fetchTickets({ limit = 100, offset = 0 } = {}) {
  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1)

      if (error) {
        logger.warn('Supabase fetchTickets error:', error.message)
      } else if (data) {
        const staffNameMap = await getStaffNameMap(data.map((t) => t.assigned_to))
        const formatted = data.map((t) => formatTicketRow(t, staffNameMap))
        // Sync fresh database data with local storage so deleted DB records do not linger
        setLocalData(LOCAL_STORAGE_TICKETS, formatted)
        return formatted
      }
    } catch (err) {
      logger.error('Supabase fetchTickets exception:', err)
    }
  }

  return getLocalData(LOCAL_STORAGE_TICKETS, [])
}

/**
 * Fetches tickets belonging to a specific client filtered by email.
 * @param {string} clientEmail - Client email address to filter by
 * @returns {Promise<Array>} Array of formatted ticket objects for the client
 */
export async function fetchClientTickets(clientEmail) {
  if (!clientEmail) return []

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('tickets')
        .select('*')
        .eq('email', clientEmail.toLowerCase().trim())
        .order('created_at', { ascending: false })

      if (error) {
        logger.warn('Supabase fetchClientTickets error:', error.message)
      } else if (data) {
        const staffNameMap = await getStaffNameMap(data.map((t) => t.assigned_to))
        return data.map((t) => formatTicketRow(t, staffNameMap))
      }
    } catch (err) {
      logger.error('Supabase fetchClientTickets exception:', err)
    }
  }

  // Fallback: filter local storage
  const allTickets = getLocalData(LOCAL_STORAGE_TICKETS, [])
  return allTickets.filter(
    (t) => t.email?.toLowerCase() === clientEmail?.toLowerCase().trim()
  )
}

/**
 * Updates the status of a ticket by ID or ticket number in Supabase and local storage.
 * Validates/normalizes status first. When Supabase is configured it is the source of
 * truth: local storage and broadcasts update only after a successful DB write.
 *
 * @param {string} ticketId - Ticket UUID or ticket number (e.g. "NET-001")
 * @param {string} newStatus - New status value (e.g. "In Progress", "Resolved", "Closed")
 * @returns {Promise<Array>} Updated local tickets array
 * @throws {Error} When status is invalid or a configured Supabase update fails
 */
export async function updateTicketStatus(ticketId, newStatus) {
  const status = normalizeTicketStatus(newStatus)
  if (!status) {
    const message = `Invalid ticket status: ${typeof newStatus === 'string' ? newStatus : String(newStatus)}`
    logger.error(message)
    throw new Error(message)
  }

  if (isSupabaseConfigured && supabase) {
    try {
      const isNetNumber = typeof ticketId === 'string' && ticketId.startsWith('NET-')
      const targetColumn = isNetNumber ? 'ticket_number' : 'id'
      const updatedAt = new Date().toISOString()

      const { error } = await supabase
        .from('tickets')
        .update({ status, updated_at: updatedAt })
        .eq(targetColumn, ticketId)

      if (error) {
        logger.warn('Supabase status update fallback attempt:', error.message)
        const { error: retryError } = await supabase
          .from('tickets')
          .update({ status, updated_at: updatedAt })
          .eq(isNetNumber ? 'id' : 'ticket_number', ticketId)
        if (retryError) {
          throw new Error(`Failed to update ticket status: ${retryError.message}`)
        }
      }
    } catch (err) {
      logger.error('Supabase updateTicketStatus exception:', err)
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  const tickets = getLocalData(LOCAL_STORAGE_TICKETS, [])
  const updated = tickets.map((t) => {
    const isMatch = String(t.id) === String(ticketId) || String(t.ticketNumber) === String(ticketId) || String(t.ticket_number) === String(ticketId)
    if (isMatch) {
      return { ...t, status, updatedAt: new Date().toISOString() }
    }
    return t
  })
  setLocalData(LOCAL_STORAGE_TICKETS, updated)

  if (typeof window !== 'undefined') {
    const payload = { type: 'TICKET_UPDATED', ticketId, status }
    window.dispatchEvent(new CustomEvent('netops_ticket_updated', { detail: payload }))
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('netops_live_chat')
        bc.postMessage(payload)
        bc.close()
      }
    } catch {
      // silent
    }
  }

  return updated
}

/**
 * Updates operational priority of a ticket by ID or ticket number (staff triage).
 * Sets priority_updated_at / priority_updated_by. When Supabase is configured it is
 * the source of truth: local storage and broadcasts update only after a successful DB write.
 *
 * @param {string} ticketId - Ticket UUID or ticket number (e.g. "NET-001")
 * @param {string} newPriority - Ops priority: Low | Medium | High | Urgent
 * @param {string|null|undefined} staffIdentity - Staff email/name string for priority_updated_by
 * @returns {Promise<Array>} Updated local tickets array
 * @throws {Error} When priority is invalid or a configured Supabase update fails
 */
export async function updateTicketPriority(ticketId, newPriority, staffIdentity) {
  const priority = normalizeTicketPriority(newPriority)
  if (!priority) {
    const message = `Invalid ticket priority: ${typeof newPriority === 'string' ? newPriority : String(newPriority)}`
    logger.error(message)
    throw new Error(message)
  }

  const updatedAt = new Date().toISOString()
  const priorityUpdatedBy =
    typeof staffIdentity === 'string' && staffIdentity.trim()
      ? staffIdentity.trim()
      : staffIdentity == null || staffIdentity === ''
        ? null
        : String(staffIdentity)

  if (isSupabaseConfigured && supabase) {
    try {
      const isNetNumber = typeof ticketId === 'string' && ticketId.startsWith('NET-')
      const targetColumn = isNetNumber ? 'ticket_number' : 'id'
      const updatePayload = {
        priority,
        priority_updated_at: updatedAt,
        priority_updated_by: priorityUpdatedBy,
        updated_at: updatedAt,
      }

      const { error } = await supabase
        .from('tickets')
        .update(updatePayload)
        .eq(targetColumn, ticketId)

      if (error) {
        logger.warn('Supabase priority update fallback attempt:', error.message)
        const { error: retryError } = await supabase
          .from('tickets')
          .update(updatePayload)
          .eq(isNetNumber ? 'id' : 'ticket_number', ticketId)
        if (retryError) {
          throw new Error(`Failed to update ticket priority: ${retryError.message}`)
        }
      }
    } catch (err) {
      logger.error('Supabase updateTicketPriority exception:', err)
      throw err instanceof Error ? err : new Error(String(err))
    }
  }

  const tickets = getLocalData(LOCAL_STORAGE_TICKETS, [])
  const updated = applyLocalPriorityUpdate(
    tickets,
    ticketId,
    priority,
    priorityUpdatedBy,
    updatedAt,
  )
  setLocalData(LOCAL_STORAGE_TICKETS, updated)

  if (typeof window !== 'undefined') {
    const payload = { type: 'PRIORITY_UPDATED', ticketId, priority }
    window.dispatchEvent(new CustomEvent('netops_ticket_updated', { detail: payload }))
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('netops_live_chat')
        bc.postMessage(payload)
        bc.close()
      }
    } catch {
      // silent
    }
  }

  return updated
}

/**
 * Assigns a staff member to a ticket in Supabase and local storage.
 * When Supabase is configured, `assigned_to` is always a profile UUID or null
 * (never a display-name string). Local storage / events still use display names.
 *
 * @param {string} ticketId - Ticket UUID or ticket number
 * @param {string|Object|null|undefined} staffName - Staff UUID, display name, profile object, or empty to unassign
 * @returns {Promise<Array>} Updated local tickets array
 * @throws {Error} When a configured Supabase update fails or staff name cannot be resolved
 */
export async function assignTicketStaff(ticketId, staffName) {
  let assignedToId = getStaffAssignmentId(staffName)
  let displayName = getStaffDisplayName(staffName)

  if (isSupabaseConfigured && supabase) {
    try {
      assignedToId = await resolveAssignedToUuid(staffName)

      if (assignedToId) {
        if (!displayName || isUUID(displayName)) {
          const nameMap = await getStaffNameMap([assignedToId])
          displayName = nameMap.get(assignedToId) || displayName || ''
        }
      } else {
        displayName = ''
      }

      const isNetNumber = typeof ticketId === 'string' && ticketId.startsWith('NET-')
      const targetColumn = isNetNumber ? 'ticket_number' : 'id'
      const updatePayload = {
        assigned_to: assignedToId,
        updated_at: new Date().toISOString(),
      }

      const { error } = await supabase
        .from('tickets')
        .update(updatePayload)
        .eq(targetColumn, ticketId)

      if (error) {
        logger.warn('Supabase assignTicketStaff fallback attempt:', error.message)
        const { error: retryError } = await supabase
          .from('tickets')
          .update(updatePayload)
          .eq(isNetNumber ? 'id' : 'ticket_number', ticketId)
        if (retryError) {
          throw new Error(`Failed to assign ticket staff: ${retryError.message}`)
        }
      }
    } catch (err) {
      logger.error('Supabase assignTicketStaff exception:', err)
      throw err instanceof Error ? err : new Error(String(err))
    }
  } else if (!staffName || (typeof staffName === 'string' && !staffName.trim())) {
    assignedToId = null
    displayName = ''
  }

  const tickets = getLocalData(LOCAL_STORAGE_TICKETS, [])
  const updated = tickets.map((t) => {
    const isMatch = String(t.id) === String(ticketId) || String(t.ticketNumber) === String(ticketId) || String(t.ticket_number) === String(ticketId)
    if (isMatch) {
      return {
        ...t,
        assignedTo: displayName,
        assigned_to: displayName,
        assignedStaff: displayName,
        assignedToId: assignedToId || null,
        updatedAt: new Date().toISOString(),
      }
    }
    return t
  })
  setLocalData(LOCAL_STORAGE_TICKETS, updated)

  if (typeof window !== 'undefined') {
    const payload = {
      type: 'TICKET_UPDATED',
      ticketId,
      assignedTo: displayName,
      assigned_to: displayName,
      assignedStaff: displayName,
      assignedToId: assignedToId || null,
    }
    window.dispatchEvent(new CustomEvent('netops_ticket_updated', { detail: payload }))
    try {
      if ('BroadcastChannel' in window) {
        const bc = new BroadcastChannel('netops_live_chat')
        bc.postMessage(payload)
        bc.close()
      }
    } catch {
      // silent
    }
  }

  return updated
}

/**
 * Marks a ticket as Closed and adds a client approval reply.
 * @param {string} ticketId - Ticket UUID or ticket number
 * @param {string} [clientName='You'] - Display name of the approving client
 * @returns {Promise<void>}
 */
export async function approveAndCloseTicket(ticketId, clientName = 'You') {
  await updateTicketStatus(ticketId, 'Closed')
  await addTicketReply(ticketId, clientName, 'client', '✅ You approved resolution and closed this ticket.')
}

/**
 * Sets a ticket back to "In Progress" and adds a reopen reply with optional reason.
 * @param {string} ticketId - Ticket UUID or ticket number
 * @param {string} [clientName='You'] - Display name of the client reopening the ticket
 * @param {string} [reason=''] - Optional reason for reopening
 * @returns {Promise<void>}
 */
export async function reopenTicket(ticketId, clientName = 'You', reason = '') {
  await updateTicketStatus(ticketId, 'In Progress')
  const msg = `↺ You reopened this ticket: ${reason || 'Further troubleshooting required.'}`
  await addTicketReply(ticketId, clientName, 'client', msg)
}

/**
 * Computes the 48-hour auto-close countdown for a resolved ticket.
 * @param {Object} ticket - Ticket object with status and updatedAt/createdAt fields
 * @returns {{ hoursLeft: number, minutesLeft: number, isExpired: boolean, formattedCountdown: string }}
 */
export function getAutoCloseTimeRemaining(ticket) {
  if (!ticket || ticket.status !== 'Resolved') {
    return { hoursLeft: 0, minutesLeft: 0, isExpired: false, formattedCountdown: '' }
  }

  const resolvedTime = new Date(ticket.updatedAt || ticket.createdAt || Date.now()).getTime()
  const autoCloseDeadline = resolvedTime + 48 * 60 * 60 * 1000 // 48 hours in ms
  const msRemaining = autoCloseDeadline - Date.now()

  if (msRemaining <= 0) {
    return { hoursLeft: 0, minutesLeft: 0, isExpired: true, formattedCountdown: '0h 0m (Auto-closing)' }
  }

  const hoursLeft = Math.floor(msRemaining / (1000 * 60 * 60))
  const minutesLeft = Math.floor((msRemaining % (1000 * 60 * 60)) / (1000 * 60))

  return {
    hoursLeft,
    minutesLeft,
    isExpired: false,
    formattedCountdown: `${hoursLeft}h ${minutesLeft}m`,
  }
}

/**
 * Deletes a ticket by UUID from Supabase and removes it from local storage.
 * @param {string} ticketId - Ticket UUID to delete
 * @returns {Promise<Array>} Updated local tickets array after deletion
 */
export async function deleteTicket(ticketId) {
  if (!ticketId) return []

  if (isSupabaseConfigured && supabase) {
    try {
      const { error } = await supabase
        .from('tickets')
        .delete()
        .eq('id', ticketId)

      if (error) {
        logger.warn('Supabase deleteTicket error:', error.message)
      }
    } catch (err) {
      logger.error('Supabase deleteTicket exception:', err)
    }
  }

  const tickets = getLocalData(LOCAL_STORAGE_TICKETS, [])
  const updated = tickets.filter((t) => t.id !== ticketId)
  setLocalData(LOCAL_STORAGE_TICKETS, updated)
  return updated
}

/**
 * Removes all NetOps local storage cache keys for tickets, accounts, and replies.
 * @returns {void}
 */
export function clearLocalCache() {
  try {
    localStorage.removeItem(LOCAL_STORAGE_TICKETS)
    localStorage.removeItem(LOCAL_STORAGE_ACCOUNTS)
    localStorage.removeItem(LOCAL_STORAGE_REPLIES)
    logger.info('Local storage cache cleared successfully.')
  } catch (e) {
    logger.error('Error clearing local cache:', e)
  }
}


/**
 * Inserts a reply message for a ticket in Supabase and dispatches a live event.
 * @param {string} ticketId - Ticket UUID the reply belongs to
 * @param {string} senderName - Display name of the message sender
 * @param {string} senderRole - Role of the sender ('client', 'staff', 'admin')
 * @param {string} message - Reply message text
 * @param {string|null} [attachmentUrl=null] - Optional attachment URL to include
 * @returns {Promise<Object>} Created reply object
 */
export async function addTicketReply(ticketId, senderName, senderRole, message, attachmentUrl = null) {
  const sanitizedMessage = sanitizeInput(message || '', 5000)

  if (isSupabaseConfigured && supabase) {
    try {
      const insertData = {
        ticket_id: ticketId,
        sender_name: senderName,
        sender_role: senderRole,
        message: sanitizedMessage,
      }
      if (attachmentUrl) {
        insertData.attachment_url = attachmentUrl
      }

      let { data, error } = await supabase
        .from('ticket_replies')
        .insert([insertData])
        .select()
        .single()

      // Fallback if attachment_url column does not exist in Supabase table schema
      if (error && attachmentUrl && error.message?.includes('attachment_url')) {
        logger.warn('attachment_url column missing in ticket_replies, embedding image in message payload')
        const safeUrl = /^https?:\/\//i.test(attachmentUrl) ? attachmentUrl.replace(/[()]/g, '') : ''
        const fallbackMsg = safeUrl
          ? (sanitizedMessage ? `${sanitizedMessage}\n\n![Attachment](${safeUrl})` : `![Attachment](${safeUrl})`)
          : sanitizedMessage

        const retryRes = await supabase
          .from('ticket_replies')
          .insert([
            {
              ticket_id: ticketId,
              sender_name: senderName,
              sender_role: senderRole,
              message: fallbackMsg,
            },
          ])
          .select()
          .single()

        data = retryRes.data
        error = retryRes.error
      }

      if (error) {
        logger.error('Supabase addTicketReply error:', error)
        throw new Error(error.message || 'Failed to send reply.')
      }

      if (data) {
        const createdReply = {
          id: data.id,
          ticketId: data.ticket_id,
          senderName: data.sender_name,
          senderRole: data.sender_role,
          message: data.message,
          attachmentUrl: data.attachment_url || attachmentUrl,
          createdAt: data.created_at,
        }
        if (typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('netops_reply_added', { detail: createdReply }))
        }
        return createdReply
      }
    } catch (err) {
      logger.error('Supabase reply exception:', err)
      throw err
    }
  }

  const replies = getLocalData(LOCAL_STORAGE_REPLIES, [])
  const newReply = {
    id: crypto.randomUUID(),
    ticketId,
    senderName,
    senderRole,
    message: sanitizedMessage,
    attachmentUrl,
    createdAt: new Date().toISOString(),
  }
  replies.push(newReply)
  setLocalData(LOCAL_STORAGE_REPLIES, replies)

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('netops_reply_added', { detail: newReply }))
  }

  return newReply
}

/**
 * Fetches all chat replies for a specific ticket ordered by creation time.
 * @param {string} ticketId - Ticket UUID to fetch replies for
 * @returns {Promise<Array>} Array of formatted reply objects
 */
export async function fetchTicketReplies(ticketId) {
  if (!ticketId) return []

  if (isSupabaseConfigured && supabase) {
    try {
      const { data, error } = await supabase
        .from('ticket_replies')
        .select('*')
        .eq('ticket_id', ticketId)
        .order('created_at', { ascending: true })

      if (!error && data) {
        return data.map((r) => ({
          id: r.id,
          ticketId: r.ticket_id,
          senderName: r.sender_name,
          senderRole: r.sender_role,
          message: r.message,
          attachmentUrl: r.attachment_url || null,
          createdAt: r.created_at,
        }))
      }
    } catch (err) {
      logger.error('Supabase fetchTicketReplies error:', err)
    }
  }

  const allReplies = getLocalData(LOCAL_STORAGE_REPLIES, [])
  return allReplies.filter((r) => r.ticketId === ticketId)
}

/**
 * Subscribes to real-time presence + typing for a ticket via Supabase Realtime.
 *
 * Works across devices/browsers (unlike BroadcastChannel, which is
 * same-browser-only). Presence is tracked with Realtime `track()` and typing
 * is sent as channel broadcasts — both delivered to every subscriber of the
 * per-ticket channel. Multiple callers may subscribe to the same ticket; they
 * share one underlying channel.
 *
 * HMR-safe: the handler set and init flag live ON the channel object (the
 * supabase client dedupes channels by topic and keeps them across module
 * reloads), so a Vite hot reload of this file cannot reset them and cause a
 * second `.on()` on an already-joined channel.
 *
 * @param {string} ticketId - Ticket UUID
 * @param {{ senderName: string, senderRole: string }} self - The current user's identity
 * @param {Object} handlers
 * @param {Function} [handlers.onPresence] - (counterparties: Array) fired on presence sync; empty array = counterparty offline
 * @param {Function} [handlers.onTyping] - (payload: {senderName, senderRole, isTyping}) fired on typing broadcast
 * @returns {{ unsubscribe: Function, sendTyping: Function, updatePresence: Function }}
 */
const PRESENCE_INIT_FLAG = '__netopsPresenceInit'
const PRESENCE_HANDLERS_FLAG = '__netopsPresenceHandlers'

export function subscribeToTicketPresence(ticketId, self, handlers = {}) {
  const noop = { unsubscribe: () => {}, sendTyping: () => {}, updatePresence: () => {} }
  if (!ticketId || !self) return noop
  if (!(isSupabaseConfigured && supabase)) return noop

  // Deduped by topic: returns the existing channel if this ticket already has
  // one (including one created by a previous module instance after HMR).
  const channel = supabase.channel(`ticket_presence_${ticketId}`, { config: { private: true } })
  const isCounterparty = (role) =>
    role && self.senderRole && (self.senderRole === 'client') !== (role === 'client')

  // Handler fan-out set attached to the channel object so it survives HMR.
  if (!channel[PRESENCE_HANDLERS_FLAG]) {
    channel[PRESENCE_HANDLERS_FLAG] = new Set()
  }
  const handlerSet = channel[PRESENCE_HANDLERS_FLAG]

  const handler = { onPresence: handlers.onPresence, onTyping: handlers.onTyping }
  handlerSet.add(handler)

  // Only the first subscriber registers callbacks — and only if the channel is
  // not already joined/joining (`.on()` throws after subscribe()).
  if (!channel[PRESENCE_INIT_FLAG] && channel.state !== 'joined' && channel.state !== 'joining') {
    channel[PRESENCE_INIT_FLAG] = true
    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState()
        const counterparties = Object.values(state)
          .flat()
          .filter((p) => p && p.ticketId === ticketId && isCounterparty(p.senderRole))
        handlerSet.forEach((h) => h.onPresence && h.onPresence(counterparties))
      })
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        if (!payload || payload.ticketId !== ticketId || !isCounterparty(payload.senderRole)) return
        handlerSet.forEach((h) => h.onTyping && h.onTyping(payload))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          try {
            await channel.track({ ticketId, senderName: self.senderName, senderRole: self.senderRole, onlineAt: Date.now() })
          } catch (err) {
            logger.warn('Presence track failed:', err)
          }
        }
      })
  }

  // Refresh presence now if the channel is already live (subsequent subscriber
  // or HMR re-mount of an existing channel).
  if (channel.state === 'joined') {
    try {
      channel.track({ ticketId, senderName: self.senderName, senderRole: self.senderRole, onlineAt: Date.now() })
    } catch {}
  }

  const isJoined = () => channel.state === 'joined'

  const sendTyping = (isTyping) => {
    // Only push over the WebSocket when joined. channel.send() before join
    // silently falls back to REST with a deprecation warning per call.
    if (!isJoined()) return
    try {
      channel.send({
        type: 'broadcast',
        event: 'typing',
        payload: { ticketId, senderName: self.senderName, senderRole: self.senderRole, isTyping },
      })
    } catch {}
  }

  const updatePresence = () => {
    try {
      channel.track({ ticketId, senderName: self.senderName, senderRole: self.senderRole, onlineAt: Date.now() })
    } catch {}
  }

  return {
    unsubscribe: () => {
      handlerSet.delete(handler)
      // Last subscriber leaving: clear our presence so the counterparty sees
      // us offline. The channel itself stays alive for the page session.
      if (handlerSet.size === 0 && isJoined()) {
        try {
          channel.untrack()
        } catch {}
      }
    },
    sendTyping,
    updatePresence,
  }
}

/**
 * Subscribes to real-time reply inserts for a ticket via Supabase Realtime or custom events.
 * @param {string} ticketId - Ticket UUID to listen for replies on
 * @param {Function} callback - Invoked with each new reply object
 * @returns {Function} Unsubscribe function
 */
export function subscribeToTicketReplies(ticketId, callback) {
  if (!ticketId) return () => {}

  if (isSupabaseConfigured && supabase) {
    const channelName = `ticket_chat_${ticketId}_${crypto.randomUUID()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_replies',
          filter: `ticket_id=eq.${ticketId}`,
        },
        (payload) => {
          if (payload.new) {
            callback({
              id: payload.new.id,
              ticketId: payload.new.ticket_id,
              senderName: payload.new.sender_name,
              senderRole: payload.new.sender_role,
              message: payload.new.message,
              createdAt: payload.new.created_at,
            })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  // Fallback custom event listener for local offline mode
  const handleLocalReply = (e) => {
    if (e.detail && e.detail.ticketId === ticketId) {
      callback(e.detail)
    }
  }
  window.addEventListener('netops_reply_added', handleLocalReply)
  return () => window.removeEventListener('netops_reply_added', handleLocalReply)
}

/**
 * Subscribes to all ticket changes (create, update, delete) across the system via Supabase Realtime.
 * @param {Function} callback - Invoked with each Supabase Realtime payload or custom event
 * @returns {Function} Unsubscribe function
 */
export function subscribeToAllTickets(callback) {
  if (isSupabaseConfigured && supabase) {
    const channelName = `all_tickets_${crypto.randomUUID()}`
    const channel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'tickets',
        },
        (payload) => {
          if (callback) callback(payload)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  // Fallback custom event for local offline mode
  const handleLocalTicket = () => {
    if (callback) callback()
  }
  window.addEventListener('netops_ticket_updated', handleLocalTicket)
  return () => window.removeEventListener('netops_ticket_updated', handleLocalTicket)
}

/**
 * Creates a staff, admin, or CEO account via Supabase Auth and creates the
 * `profiles` row via the admin-only SECURITY DEFINER RPC (a client-side upsert
 * of a staff/admin/ceo row is impossible under the canonical profiles RLS).
 * @param {Object} accountData - firstName, lastName, fullName, email, password, role
 * @returns {Promise<Object>} Created staff profile summary
 */
const STAFF_ROLE_ALLOWLIST = ['staff', 'admin', 'ceo']

export async function createStaffAccount(accountData) {
  if (!isSupabaseConfigured || !supabase) {
    throw new Error('Supabase is not configured. Please set up your .env credentials.')
  }

  const passwordPolicyError = getPasswordValidationError(accountData.password)
  if (passwordPolicyError) {
    throw new Error(passwordPolicyError)
  }

  const normalizedEmail = String(accountData.email || '').toLowerCase().trim()
  const firstName = sanitizeInput(accountData.firstName || '', 100)
  const lastName = sanitizeInput(accountData.lastName || '', 100)
  const fullName = sanitizeInput(accountData.fullName || `${firstName} ${lastName}`, 200).trim()
  const role = accountData.role || 'staff'

  if (!STAFF_ROLE_ALLOWLIST.includes(role)) {
    throw new Error(`Invalid role "${role}". Must be one of: ${STAFF_ROLE_ALLOWLIST.join(', ')}.`)
  }

  const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
    email: normalizedEmail,
    password: accountData.password,
    options: {
      data: {
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        role,
      },
    },
  })

  if (signUpError) {
    if (signUpError.message?.includes('already registered')) {
      throw new Error('An account with this email already exists.')
    }
    throw new Error(mapAuthPasswordError(signUpError.message) || signUpError.message)
  }

  if (!signUpData.user?.id) {
    throw new Error('Failed to create staff account.')
  }

  // The canonical RLS schema only allows a user to insert their own profile
  // with role='client' and to update their own profile, so a client-side upsert
  // of a staff/admin/ceo row always fails (leaving an orphan auth user). Use the
  // admin-only SECURITY DEFINER function instead, which validates the caller is
  // admin/ceo and enforces the role allowlist server-side.
  const { error: profileError } = await supabase.rpc('admin_create_staff_profile', {
    p_user_id: signUpData.user.id,
    p_first_name: firstName,
    p_last_name: lastName,
    p_full_name: fullName,
    p_email: normalizedEmail,
    p_role: role,
  })

  if (profileError) {
    throw new Error(profileError.message)
  }

  return {
    id: signUpData.user.id,
    firstName,
    lastName,
    fullName,
    email: normalizedEmail,
    role,
  }
}

/**
 * Updates a staff or admin profile row in the Supabase `profiles` table.
 * @param {string} userId - Auth user UUID of the staff member
 * @param {Object} updateData - Profile fields to update (firstName, lastName, companyName, phone)
 * @returns {Promise<Object>} Updated staff profile object
 */
export async function updateStaffProfile(userId, updateData) {
  if (!userId) throw new Error('User ID is required.')

  const firstName = sanitizeInput(updateData.firstName || '', 100)
  const lastName = sanitizeInput(updateData.lastName || '', 100)
  const fullName = (updateData.fullName || `${firstName} ${lastName}`).trim()
  const companyName = sanitizeInput(updateData.companyName || '', 200)
  const phone = sanitizeInput(updateData.phone || '', 20)

  if (isSupabaseConfigured && supabase) {
    const { data, error } = await supabase
      .from('profiles')
      .update({
        first_name: firstName,
        last_name: lastName,
        full_name: fullName,
        company_name: companyName,
        phone,
      })
      .eq('id', userId)
      .select()
      .single()

    if (error) {
      logger.error('Supabase updateStaffProfile error:', error)
      throw new Error(error.message)
    }

    return {
      id: data.id,
      firstName: data.first_name || firstName,
      lastName: data.last_name || lastName,
      fullName: data.full_name || fullName,
      companyName: data.company_name || companyName,
      email: data.email,
      phone: data.phone || phone,
      role: data.role,
    }
  }

  return {
    id: userId,
    firstName,
    lastName,
    fullName,
    companyName,
    phone,
  }
}

// Local storage key prefix for Gmail settings fallback
const LOCAL_STORAGE_GMAIL_SETTINGS_PREFIX = 'gmailSettings_'

/**
 * Persists Gmail send-as / Reply-To preferences for a client account.
 *
 * @param {string} userId - Auth user UUID (used only as fallback storage key)
 * @param {{ gmailSendEnabled: boolean, gmailReplyTo?: string|null }} settings
 * @returns {Promise<{ success: true }>}
 * @throws {Error} When gmailReplyTo is provided but not a valid email address
 */
export async function updateGmailSettings(userId, { gmailSendEnabled, gmailReplyTo }) {
  const enabled = Boolean(gmailSendEnabled)
  const replyTo = typeof gmailReplyTo === 'string' && gmailReplyTo.trim() ? gmailReplyTo.trim() : null

  if (replyTo !== null && !isValidEmail(replyTo)) {
    throw new Error('gmailReplyTo must be a valid email address.')
  }

  if (isSupabaseConfigured && supabase) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) throw new Error('No authenticated user session.')
    const { error } = await supabase
      .from('clients')
      .update({
        gmail_send_enabled: enabled,
        gmail_reply_to: replyTo,
      })
      .eq('auth_user_id', user.id)

    if (error) {
      logger.error('Supabase updateGmailSettings error:', error)
      throw new Error(error.message || 'Failed to update Gmail settings.')
    }

    return { success: true }
  }

  // Fallback: local storage
  setLocalData(`${LOCAL_STORAGE_GMAIL_SETTINGS_PREFIX}${userId}`, { gmailSendEnabled: enabled, gmailReplyTo: replyTo })
  return { success: true }
}

/**
 * Retrieves Gmail send-as / Reply-To preferences for a client account.
 *
 * @param {string} userId - Auth user UUID (used only as fallback storage key)
 * @returns {Promise<{ gmailSendEnabled: boolean, gmailReplyTo: string|null }>}
 */
export async function getClientGmailSettings(userId) {
  if (isSupabaseConfigured && supabase) {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user?.id) throw new Error('No authenticated user session.')
    const { data, error } = await supabase
      .from('clients')
      .select('gmail_send_enabled, gmail_reply_to')
      .eq('auth_user_id', user.id)
      .maybeSingle()

    if (error) {
      logger.warn('Supabase getClientGmailSettings error:', error.message)
    }

    return {
      gmailSendEnabled: data?.gmail_send_enabled ?? false,
      gmailReplyTo: data?.gmail_reply_to ?? null,
    }
  }

  // Fallback: local storage
  const stored = getLocalData(`${LOCAL_STORAGE_GMAIL_SETTINGS_PREFIX}${userId}`, null)
  return {
    gmailSendEnabled: stored?.gmailSendEnabled ?? false,
    gmailReplyTo: stored?.gmailReplyTo ?? null,
  }
}

/**
 * Subscribes globally to all incoming ticket replies and dispatches toast notifications for counterparty messages.
 * @param {string} [currentUserRole='client'] - Role of the current user ('client', 'staff', 'admin')
 * @returns {Function} Unsubscribe function that cleans up all listeners and channels
 */
export function subscribeToGlobalReplies(currentUserRole = 'client') {
  const isClient = currentUserRole === 'client'

  const handleIncomingReply = (reply) => {
    if (!reply || !reply.message) return
    const senderRole = reply.senderRole || reply.sender_role
    // Only notify if message was sent by counterparty
    if ((isClient && senderRole !== 'client') || (!isClient && senderRole === 'client')) {
      dispatchNotification({
        title: isClient
          ? `New message from ${reply.senderName || 'Support Engineer'}`
          : `New message from ${reply.senderName || 'Client'}`,
        message: reply.message,
        type: 'chat',
        ticketId: reply.ticketId || reply.ticket_id,
      })
    }
  }

  // 1. Listen to BroadcastChannel across browser tabs/windows
  let broadcastChannel = null
  try {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      broadcastChannel = new BroadcastChannel('netops_live_chat')
      broadcastChannel.onmessage = (event) => {
        if (event.data?.type === 'NEW_REPLY' && event.data?.message) {
          handleIncomingReply(event.data.message)
        }
      }
    }
  } catch (err) {
    // silent
  }

  // 2. Listen to Supabase Realtime postgres changes on `ticket_replies` table
  // Server-side filter matches counterparty logic; handleIncomingReply remains a safety net.
  let supabaseChannel = null
  if (isSupabaseConfigured && supabase) {
    const channelName = `global_chat_replies_${crypto.randomUUID()}`
    const replyFilter = isClient
      ? 'sender_role=neq.client'
      : 'sender_role=eq.client'
    supabaseChannel = supabase
      .channel(channelName)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'ticket_replies',
          filter: replyFilter,
        },
        (payload) => {
          if (payload.new) {
            handleIncomingReply({
              id: payload.new.id,
              ticketId: payload.new.ticket_id,
              senderName: payload.new.sender_name,
              senderRole: payload.new.sender_role,
              message: payload.new.message,
              createdAt: payload.new.created_at,
            })
          }
        }
      )
      .subscribe()
  }

  // 3. Listen to local event bus for in-window updates
  const handleLocalReply = (e) => {
    if (e.detail) handleIncomingReply(e.detail)
  }
  if (typeof window !== 'undefined') {
    window.addEventListener('netops_reply_added', handleLocalReply)
  }

  return () => {
    if (broadcastChannel) broadcastChannel.close()
    if (supabaseChannel && supabase) supabase.removeChannel(supabaseChannel)
    if (typeof window !== 'undefined') {
      window.removeEventListener('netops_reply_added', handleLocalReply)
    }
  }
}

