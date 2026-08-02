import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const RESEND_API_URL = 'https://api.resend.com/emails'

// Simple email regex — guards against header injection without exposing internals
const EMAIL_REGEX = /^[^\s@<>,"';]+@[^\s@<>,"';]+\.[^\s@<>,"';]+$/

// Only these profile roles may send email from the org's verified sender
const STAFF_ROLES = ['staff', 'admin', 'ceo']

const MAX_SUBJECT_LENGTH = 200
const MAX_BODY_LENGTH = 50 * 1024 // ~50KB

function isValidEmail(address: string): boolean {
  return EMAIL_REGEX.test(address)
}

Deno.serve(async (req: Request): Promise<Response> => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Authentication ──────────────────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : ''

  if (!token) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? ''
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? ''

  if (!supabaseUrl || !supabaseAnonKey) {
    return new Response(JSON.stringify({ error: 'Server misconfiguration' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
  })

  const { data: { user }, error: userError } = await supabase.auth.getUser()
  if (userError || !user) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Authorization ──────────────────────────────────────────────────────────
  // Only staff/admin/ceo may send mail from the org's verified sender. The
  // profiles SELECT policy allows a user to read their own row (see
  // supabase/schema.sql), so the caller's role is read directly from `profiles`
  // using their own JWT.
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .maybeSingle()

  if (profileError) {
    return new Response(JSON.stringify({ error: 'Failed to verify permissions' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!profile || !STAFF_ROLES.includes(profile.role)) {
    return new Response(JSON.stringify({ error: 'Forbidden' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  // ── Parse & validate body ───────────────────────────────────────────────────
  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const { to, subject, body: emailBody, replyTo } = body as {
    to?: unknown
    subject?: unknown
    body?: unknown
    replyTo?: unknown
  }

  if (typeof to !== 'string' || !isValidEmail(to)) {
    return new Response(JSON.stringify({ error: 'Invalid or missing "to" email address' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (typeof subject !== 'string' || !subject.trim()) {
    return new Response(JSON.stringify({ error: '"subject" must be a non-empty string' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (subject.length > MAX_SUBJECT_LENGTH) {
    return new Response(JSON.stringify({ error: `"subject" must be at most ${MAX_SUBJECT_LENGTH} characters` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (typeof emailBody !== 'string' || !emailBody.trim()) {
    return new Response(JSON.stringify({ error: '"body" must be a non-empty string' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (emailBody.length > MAX_BODY_LENGTH) {
    return new Response(JSON.stringify({ error: `"body" must be at most ${MAX_BODY_LENGTH} characters` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (replyTo !== undefined && replyTo !== null) {
    if (typeof replyTo !== 'string' || !isValidEmail(replyTo)) {
      return new Response(JSON.stringify({ error: 'Invalid "replyTo" email address' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      })
    }
  }

  // ── Send via Resend ─────────────────────────────────────────────────────────
  const resendApiKey = Deno.env.get('RESEND_API_KEY') ?? ''
  const fromAddress = Deno.env.get('EMAIL_FROM_ADDRESS') ?? ''
  const fromName = Deno.env.get('EMAIL_FROM_NAME') ?? ''

  if (!resendApiKey || !fromAddress) {
    return new Response(JSON.stringify({ error: 'Email service is not configured' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  const fromField = fromName ? `${fromName} <${fromAddress}>` : fromAddress

  const payload: Record<string, unknown> = {
    from: fromField,
    to: [to],
    subject: subject.trim(),
    text: emailBody.trim(),
  }

  if (typeof replyTo === 'string' && replyTo) {
    payload['reply_to'] = replyTo
  }

  let resendRes: Response
  try {
    resendRes = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    })
  } catch {
    return new Response(JSON.stringify({ error: 'Failed to reach email service' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  if (!resendRes.ok) {
    // Do not forward raw Resend error details — they may expose internal info
    return new Response(JSON.stringify({ error: 'Email delivery failed' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    })
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
})
