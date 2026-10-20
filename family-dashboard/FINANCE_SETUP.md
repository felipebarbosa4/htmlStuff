# Finance Dashboard — private setup

**Staged for production, not yet live.** Automated tests pass and private seed data is already stored in the new KV namespace. Do not merge before the production KV binding and PIN secret are configured and verified. Existing family calendar, clothes and night schedules must remain unchanged.

## Cloudflare Pages

1. [DONE 2026-10-20] Create the private Cloudflare Workers KV namespace `family_finance_private` (ID `7af58bf9134141c6b126427f3f44d773`).
2. [PENDING] Bind it to the Pages project `family-smart-dashboard` under Settings > Bindings > KV, using the exact binding name **`FINANCE_KV`** (Production environment).
3. Add **Secret** variables under Settings > Variables and Secrets:
   - [PENDING] `FINANCE_PIN`: owner's fixed six-digit PIN (never commit). Owner selected the same PIN for viewing and administration. **Anyone knowing the PIN can edit expenses if they have Cloudflare Access to the site; do not share it with visitors.**
   - [DONE] `FINANCE_SESSION_SECRET`: 64-character cryptographically random secret generated in the Omarchy terminal and uploaded encrypted using Wrangler. Value was not printed or committed.
4. [PENDING] Redeploy after binding and secret changes. Keep Cloudflare Access enforced for the production domain, API paths, and preview domains. Test authentication before marking this feature live.

Do not commit personal household values, PINs, bank credentials, statements, bank alerts or the generated import JSON to this public GitHub repo.

## Experience

- The kiosk's Finance menu is manual only, requires a PIN, and is automatically locked after 2 minutes idle or 3 minutes total.
- When a user switches panel, Finance logs out. The 30-minute manual selection timeout still returns to the usual scheduled screen.
- Unlinked PC admin screen: `/family-dashboard/finance-admin/`. It uses the same six-digit PIN.
- All server finance GET/PUT methods require signed HttpOnly Secure cookies; PUT additionally requires admin authentication.
- Records are stored in `FINANCE_KV` and are not published as static site assets.
- Basic PIN/admin failed-attempt lockout uses KV. Because KV is eventually consistent, also configure Cloudflare WAF rate limiting for `/api/finance/login` and `/api/finance/admin-login` if available.

## Notion import

[DONE 2026-10-20] Eighteen estimated expenses from the private Notion **Gastos Fixos** snapshot dated 2026-09-16 have already been written directly into `family_finance_private` under key `finance:items:v1` using Wrangler. A subsequent remote read verified all 18 rows, unique IDs, a CAD 5,087.05 aggregate monthly reserve, and status `review` on every row. The temporary private JSON copies were deleted from the Omarchy working directory after verification. No personal expenses or payment details are in Git.

Once deployed, the PC admin page will load those 18 records automatically. There is **no need to import them again** unless deliberately replacing or updating them. Review their status, billing dates and monthly amounts: these are historical estimates, not validated current bank transactions. For biweekly or quarterly bills, `monthlyBudget` represents the monthly reserve.

## Verification before launch

- Unconfigured backend fails closed, without disclosing records.
- Anonymous `GET /api/finance/expenses` denied; PIN auth allows GET only; admin auth allows both GET and PUT.
- Test wrong PIN attempts, logout, absolute session expiry, inactivity lock and unlinked admin page.
- Verify normal schedule switching 06:00, 08:00, 08:50, 22:00 and existing Google Calendar.
- Confirm Cloudflare Access also protects any alternate deployment URL.

## Deferred

RBC / Scotiabank email transaction ingestion is **not implemented yet**. A later phase can ingest validated notifications, deduplicate and reconcile transactions and refunds, without giving the website banking credentials.
