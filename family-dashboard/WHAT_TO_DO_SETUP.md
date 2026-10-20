# What to Do — Cloudflare production setup (manual refresh only)

Status: implementation lives on `feature/what-to-do-ai`. Do **not** merge until credentials, Cloudflare Access, quotas, and previews have been verified. This is an initial release, not proof that the external integrations are live.

## 1. Security prerequisites (first!)

1. In Cloudflare Zero Trust > Access > Applications, ensure the **production** Pages hostname and **every preview hostname** serving the dashboard are behind Cloudflare Access. Cover `/family-dashboard/*`, `/api/activities`, `/api/activities/*` and `/api/calendar`; protecting the full hostname is simplest.
2. Test an unauthenticated/private-browser request to `/api/activities/generate`. It must stop at Access. A direct POST from an unauthorized visitor must not invoke paid APIs.
3. Configure a Cloudflare WAF rate limit for `POST /api/activities/generate`. The source contains an additional 90-second best-effort KV throttle, which is **not** a substitute for Access/WAF and is not atomic.
4. Do not store the private residence in GitHub source, issues, logs, or a public screenshot.

## 2. Google Maps Platform

In [Google Cloud Console](https://console.cloud.google.com/), select a billing-enabled project and enable:

- **Places API (New)**, for Google Text Search and fresh place photos.
- **Routes API**, for route matrix driving distances and estimated times from home.
- **Geocoding API**, to geocode the private HOME_ADDRESS string.

Under APIs & Services > Credentials, create a **server-side API key**. Restrict **API access** to those three APIs. Set quotas and a billing budget/alerts before enabling use. Workers egress does not generally offer a fixed dedicated outbound IP by default, so don't blindly set an IP-based application restriction that breaks server calls. Keep the key secret in Cloudflare, never in JS/HTML or GitHub.

Live Google photo requests are performed separately when viewing cards. The app resolves current photo metadata and displays provider/photographer credits; it does not persist photo resource names. Some venues have no photo.

## 3. Meta Muse Spark

1. Visit [Meta Model API](https://dev.meta.ai/).
2. Check that your account can use paid API requests and enable billing if necessary.
3. Create an API key for Model API. Use **standard**, not Contributor, if you do not want the Contributor data-sharing tradeoff.
4. Cloudflare secret: `MODEL_API_KEY` = your Model API key.
5. Model used: `muse-spark-1.3`, endpoint `https://api.meta.ai/v1/responses`, `store:false`.

**OpenAI fallback (optional but recommended):** create an API key at [OpenAI Platform](https://platform.openai.com/) and store `OPENAI_API_KEY` as a Cloudflare secret. The fallback model is `gpt-5-mini` via `/v1/responses`. API usage is billed separately from the ChatGPT subscription. If Meta alone is configured and fails, the previous saved list remains available and no unverified AI result is invented.

## 4. Cloudflare Pages bindings

Project name in the existing Finance setup documentation: `family-smart-dashboard`. Confirm the actual production Pages project before changing settings.

1. Cloudflare > Workers & Pages > KV > create a **new namespace** (suggested name: `family_activities_private`). Do not reuse `FINANCE_KV`.
2. Open your Pages project > Settings > Bindings > Add > KV namespace.
3. Set **Variable name** exactly `ACTIVITIES_KV`; select the newly created namespace.
4. Settings > Variables and Secrets > Add; mark the following as **secrets**:
   - `HOME_ADDRESS`: full precise home address with city, province, Canada; enter privately in Cloudflare. **Never commit the address.**
   - `GOOGLE_MAPS_API_KEY`: server-side Google Maps key.
   - `MODEL_API_KEY`: Meta Model API key (primary).
   - `OPENAI_API_KEY`: optional OpenAI key (fallback).
5. The existing Google Calendar secrets must still be configured and valid: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `GOOGLE_REFRESH_TOKEN`. This feature uses the existing read-only calendar function.
6. Configure bindings and secrets separately for **Preview** and **Production** if testing previews. Protect both with Cloudflare Access. Redeploy after saving bindings/secrets.

## 5. GitHub / staging validation

Branch: `feature/what-to-do-ai`. Test locally if desired:

```bash
git fetch origin feature/what-to-do-ai
git switch feature/what-to-do-ai
node --test tests/activities.test.mjs
node --check family-dashboard/activities.js
node --check functions/api/activities/generate.js
```

No real credentials are used by the automated integration test. Its Google/Meta/Calendar/KV calls are mocked.

Once a protected Preview deployment is available:
1. Sign in through Cloudflare Access.
2. Open `/family-dashboard/` on the tablet; choose **✨ What to Do**.
3. Before the first refresh, you should see a placeholder with a manual Refresh Ideas button, **not automatically generated suggestions**.
4. Click Refresh Ideas once. Confirm 4 cards on the first page, 4 on the second (when 8 destinations qualify), actual photos where available, valid routes, and that all displayed driving distances are <=20 km from home.
5. Click a card. Verify links (Directions, Website, Google listing), packing advice, price **status**, and today's hours.
6. Reopen What to Do: it must display the **previous saved list**, with no new Muse or Places search invocation. Photos are resolved separately when visible.
7. Try Refresh again within 90 seconds: should be throttled; the old list should remain visible.
8. Temporarily disable a noncritical key in Preview and confirm the saved list is retained on failure.
9. Check Google API quotas and Cloudflare logs for errors. Never log credentials, exact home address or private calendar titles.
10. On a school weekday, confirm no suggested departure before 3:30 PM. On a weekend, ensure daytime slots can be used.
11. Verify the existing Clothes, Calendar, Night and Finance views still work. Check automatic mode, manual expiry and finance lock separately.

Do **not** merge simply because the automated mock test passes. Only merge after actual preview checks succeed.

## Behavior and limitations

- **Only Refresh Ideas calls AI and searches for new venues.** Opening the tab reads a saved list. Images may request fresh provider metadata when cards are shown.
- Eight activities are targeted; fewer may be returned if fewer places qualify. Ranking blends AI input, road distance, opening hours, forecast and ratings.
- The search presently focuses on **venues** (parks, indoor playgrounds, museums, pools, libraries, animal attractions); it does not yet integrate an official time-specific festival/event ticketing feed.
- **Real family admission prices are not fetched** in this release. Each card says `Check admission price`, and the details link to the venue website when available. Google's price-level indicator is not a reliable family admission price.
- Google's present opening hours can change after you generate the list. The list is retained until Refresh or the KV entry expires; by design the cache expires after **28 days**, so you must manually generate new ideas at that point.
- Driving distance is calculated from home via Routes API. The Directions link opens Google Maps, which may use the phone/tablet's current location as origin.
- If the Calendar integration fails or is incomplete, the generation fails closed rather than recommending a conflicting appointment.
- A Google Calendar all-day event is treated as occupying the whole day. This conservative default can hide otherwise viable options.
- **Public repo contains no home address or API keys.** The address goes to Google's Geocoding API, weather gets home coordinates, and Meta/OpenAI receive only public venue candidates, time slots and weather summaries (not the residential address or private event names).
- For data licensing, Google place details are stored with a maximum 28-day KV TTL; live photo resource IDs and URLs are not persisted in KV. Recheck Google's current Maps Platform Terms and attribution requirements before release.

## Troubleshooting

| Symptom | Check |
|---|---|
| Activities storage is not configured | Cloudflare `ACTIVITIES_KV` binding, redeploy |
| Setup incomplete | `HOME_ADDRESS`, `GOOGLE_MAPS_API_KEY` secrets, deployment |
| Calendar unavailable | Existing Google OAuth refresh token, all accessible calendars |
| No verified places | Places API (New), Geocoding API, Routes API enabled and billed, API key restrictions, 20 km threshold |
| Neither model returns usable recommendations | Meta Model API access/billing, `MODEL_API_KEY`, fallback `OPENAI_API_KEY`, model quota |
| 403 on Refresh | Dashboard origin/Cloudflare Access; use protected page, not direct cross-site POST |
| No photos | Place has no photo, Places Photo API failure, attribution / quota / key |
| 429 | Wait before clicking Refresh again; WAF and KV throttle |
| Too few cards | Weather, opening hours, Calendar commitments, limited Google candidate count |

Official references:
- Meta: https://dev.meta.ai/docs/overview
- Meta Responses: https://dev.meta.ai/docs/protocols/responses
- Google Places Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- Google Place Photos: https://developers.google.com/maps/documentation/places/web-service/place-photos
- Google Routes: https://developers.google.com/maps/documentation/routes
- Cloudflare Pages Functions KV: https://developers.cloudflare.com/pages/functions/bindings/
