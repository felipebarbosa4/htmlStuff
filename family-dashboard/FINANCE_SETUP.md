# Finance Dashboard — private setup

**Draft feature: do not merge before configuration and testing.** Existing family calendar, clothes and night schedules must remain unchanged.

## Cloudflare Pages

1. Create a private Cloudflare Workers KV namespace (e.g. `family_finance_private`).
2. Bind it to the Pages project `family-smart-dashboard` under Settings > Bindings > KV, using the exact binding name **`FINANCE_KV`**.
3. Add **Secret** variables under Settings > Variables and Secrets:
   - `FINANCE_PIN`: owner's chosen fixed six-digit viewer PIN (never commit).
   - The same server-side `FINANCE_PIN` gates viewing and administration, per the owner's request. **Anyone with the PIN may edit the expenses if they can reach the dashboard; do not share it with visitors.**
   - `FINANCE_SESSION_SECRET`: 32+ unpredictable characters, e.g. generate locally with `openssl rand -hex 32`.
4. Redeploy after binding and secret changes. Keep Cloudflare Access enforced for the production domain, API paths, and preview domains.

Do not commit personal household values, PINs, bank credentials, statements, bank alerts or the generated import JSON to this public GitHub repo.

## Experience

- The kiosk's Finance menu is manual only, requires a PIN, and is automatically locked after 2 minutes idle or 3 minutes total.
- When a user switches panel, Finance logs out. The 30-minute manual selection timeout still returns to the usual scheduled screen.
- Unlinked PC admin screen: `/family-dashboard/finance-admin/`. It uses the same six-digit PIN.
- All server finance GET/PUT methods require signed HttpOnly Secure cookies; PUT additionally requires admin authentication.
- Records are stored in `FINANCE_KV` and are not published as static site assets.
- Basic PIN/admin failed-attempt lockout uses KV. Because KV is eventually consistent, also configure Cloudflare WAF rate limiting for `/api/finance/login` and `/api/finance/admin-login` if available.

## Notion import

A separate private `family_finance_initial_import.json` file holds 18 expenses from the user's 2026-09-16 Notion **Gastos Fixos** snapshot. No account numbers, bank data, login details or passwords are included.

From PC admin: **Import JSON** → review/correct the historical estimates → **Save changes**. Import itself never writes until Save. Review the status, billing dates, and amounts; past estimates are not validated current bank transactions. The monthlyBudget field is the **monthly reserve**, even for biweekly or quarterly bills.

## Verification before launch

- Unconfigured backend fails closed, without disclosing records.
- Anonymous `GET /api/finance/expenses` denied; PIN auth allows GET only; admin auth allows both GET and PUT.
- Test wrong PIN attempts, logout, absolute session expiry, inactivity lock and unlinked admin page.
- Verify normal schedule switching 06:00, 08:00, 08:50, 22:00 and existing Google Calendar.
- Confirm Cloudflare Access also protects any alternate deployment URL.

## Deferred

RBC / Scotiabank email transaction ingestion is **not implemented yet**. A later phase can ingest validated notifications, deduplicate and reconcile transactions and refunds, without giving the website banking credentials.
