# Family Finance — continuous Notion synchronization

## Architecture

- Notion connection token: encrypted Cloudflare Pages secret `NOTION_API_TOKEN` on production project `family-smart-dashboard`.
- Worker: `family-finance-notion-sync`, scheduled at `*/30 * * * *` (every 30 minutes, UTC).
- Private KV: `family_finance_private` under existing Pages/Worker binding `FINANCE_KV`.
- Only the Worker has an RSA-OAEP private key stored as Cloudflare Worker secret `FINANCE_SYNC_KEY`. Public key in `functions/_notion_sync.js` is non-secret.
- On the next PIN-authorized Finance load, Pages encrypts the Notion bearer token and stores it at `finance:notion:token-encrypted:v1`. No token is sent to the user's browser.
- Worker decrypts and calls the official Notion API (`Notion-Version: 2025-09-03`) to paginate all records from Expenses, Incomes, Transfers, Accounts, and Categories. After all reads complete, the Worker atomically replaces `finance:notion:snapshot:v1` and writes a `finance:notion:sync-status:v1` status.
- A temporary Notion error never replaces the last good snapshot. The private dashboard reports the last successful sync.
- A user can also open Finance > Movimentos/Extratos > "Sincronizar agora". This uses same-origin POST and the signed PIN-authenticated cookie; no token is exposed.
- Historic statement balances (and older reconciliation reminders) are carried over from the previous snapshot. They are *not* calculated as live account balances, nor automatically derived from bank data.
- Fixed monthly expense estimates remain in separate `finance:items:v1`; they are not overwritten by ledger transactions.

## First-time activation

1. Pages production secret `NOTION_API_TOKEN` is configured. Ensure Notion integration has read access to every required source database (not only the parent page).
2. Worker `family-finance-notion-sync` is deployed with KV binding, Cron Trigger and its private key secret.
3. Visit the **production dashboard**, sign into Finance with the six-digit PIN, and open Movimentos. The authenticated API request provisions the encrypted Worker credential (in a background request).
4. Press "Sincronizar agora" once. Confirm the date/time in the footer and compare record counts to Notion.
5. Once provisioned, the Worker runs independently of the tablet at every :00 and :30 UTC. Cloudflare scheduler may not execute exactly on the minute.

## Verification

- `node --test tests/finance*.test.mjs`
- `npx wrangler secret list -c workers/finance-sync/wrangler.jsonc` (never print values).
- `npx wrangler pages secret list --project-name family-smart-dashboard` (never print values).
- `npx wrangler pages deployment list --project-name family-smart-dashboard`
- Only while authorized, inspect `/api/finance/notion` response `source=notion-api`, `fetchedAt` and `syncStatus.ok=true`. Do not log full financial items.
- To audit runtime errors, inspect `finance:notion:sync-status:v1` in KV and the scheduled Worker's logs.

## Security and limits

- Never commit actual household data, a token, statement PDF, PIN or RSA private key.
- The project is protected by Cloudflare Access *and* the Finance PIN; ensure any custom domains and preview hosts remain covered by Access.
- The Worker does not expose a public HTTP endpoint (`workers_dev:false` and HTTP handler returns 404).
- Notion API data model is read-only and subject to Notion rate limits; full refresh reads all pages.
- Changing the integration token requires setting the new Pages secret and opening Finance once to reprovision ciphertext. Changing the Worker private key requires updating the paired public key and reprovisioning.
- Cloudflare KV is eventually consistent; a brief delay after a successful Worker run can occur.
