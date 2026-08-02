# send-email Edge Function

Deno Supabase Edge Function that sends transactional email via the [Resend](https://resend.com) API.

## Required Environment Variables

Set these in the Supabase Dashboard → Edge Functions → Secrets, **not** in source code.

| Variable | Description |
|---|---|
| `RESEND_API_KEY` | API key from your Resend account |
| `EMAIL_FROM_ADDRESS` | Verified sender address (e.g. `support@example.com`) |
| `EMAIL_FROM_NAME` | Display name for the From field (e.g. `NetOps Support`) |

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are automatically injected by the Supabase runtime.

## Request

**POST** with `Authorization: Bearer <supabase-jwt>` header.

```json
{
  "to": "recipient@example.com",
  "subject": "Your ticket has been updated",
  "body": "Plain-text message body",
  "replyTo": "client@example.com"
}
```

`replyTo` is optional. All other fields are required.

`subject` is limited to 200 characters and `body` to 50KB.

## Authorization

Only authenticated users whose `profiles.role` is `staff`, `admin`, or `ceo` may
call this function. Any other caller receives `403`.

## Response

Success (`200`):
```json
{ "success": true }
```

Error (`400` / `401` / `403` / `500` / `502`):
```json
{ "error": "Human-readable description" }
```

## Deployment

```bash
supabase functions deploy send-email
```
