# What to Do — Cloudflare production setup (manual refresh only)

Status: implementation lives on `feature/what-to-do-ai`. Do **not** merge until credentials, Cloudflare Access, quotas, and previews have been verified. This is an initial release, not proof that the external integrations are live.

## Version 2 — scenarios, sourced events and movies (2026-10-21)

This release is designed to go directly to the production `master` branch after local tests and Cloudflare Access verification, per the dashboard owner's request.

- Three scenario buttons: **Couple** (2 adults by default, no children), **Family** (2 adults, 2 children), **Visits** (4 adults, 2 children). Users can adjust adults (1–8) and kids (0–10), plus select **Free / Under CAD 100 / Any budget** and **Both / Indoor / Outdoor**.
- Three independent sections: **Ideas**, **Events Today**, **Movies This Month**. Each has its own explicit on-demand Refresh; no searches are initiated simply by opening the tab. The previous choices remain accessible via private KV.
- Ideas: Google Places New + road distances from home (20 km maximum), weather from Open-Meteo, timed Google Calendar appointments but **ignore All day**, school days after 15:30 for groups with children, and return-home windows (Couple ~23:30, Visits ~21:30, Family ~20:00). Mode and category-specific Google queries; the GPT-6 Luna API prioritizes categories without receiving Google Maps content.
- Events Today: GPT-6 Luna uses the OpenAI Responses API hosted **web_search** tool to retrieve dated event pages. Items must have a URL returned by the actual search, an event time not yet passed, and a specific real street address geocoded and independently verified within 20 km of home using Routes API. Unverified events are not shown. Links point to original sources. Ottawa Tourism calendar link is shown if no verifiable results.
- Movies This Month: web search with explicit Canadian theatrical release dates in the current month. **Family and Visits** show only movies identified as **G or PG**, while Couple shows other ratings too. The source link is required, and screenings/showtimes/ticket prices are **never represented as verified**; cinemas need checking. Model-reported classifications should always be verified against official listings before taking children.
- Budget is a **preference, not verified admission eligibility**. 'Free' restricts ordinary Ideas to parks and libraries, but fees for particular sites/events must still be checked. **Under CAD 100** cannot be guaranteed until official 2+2 or selected group admission prices become available; the UI clearly labels admission costs unverified. Don't introduce fabricated prices.
- Learning uses `POST /api/activities/feedback` when users tap **Like / Not interested / Visited** on real venues. KV stores the latest 200 mode+place ID + category + feedback records, never personal names or Google Maps content. The system avoids disliked place IDs, favors likes and demotes visited places in subsequent refreshes. Only category feedback **counts** are sent to GPT-6 Luna.
- KV keys: `family:activities:v2:family`, `:couple`, `:visits` (complete prefix `family:activities:v2:`), `family:activities:feedback:v1` and `family:activities:discovery:v1:events|movies:<mode>`. Saved Google place IDs are resolved afresh via Places and Routes on opening, following Google content restrictions.
- OpenAI web_search calls are **additional billable tool uses**, independent of inexpensive Luna input/output tokens. Places Details / Routes calls also incur billing; budget alarms and API quotas remain important.
- Production and preview `*.pages.dev` hostnames were checked anonymously on October 21 and both redirected to Cloudflare Access authentication. Do not disable that access policy; this protects paid endpoints.
- No new environment variables needed: existing `OPENAI_API_KEY`, `GOOGLE_MAPS_API_KEY`, `HOME_ADDRESS`, `ACTIVITIES_KV`, and read-only Calendar OAuth secrets suffice.

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

## 3. OpenAI API (GPT-6 Luna)

ChatGPT Plus/Pro billing and OpenAI API billing are **separate**. You do not need a different ChatGPT subscription to enable API usage.

1. Sign in at [OpenAI API Platform](https://platform.openai.com/).
2. Add a payment method / purchase API credit from [API billing](https://platform.openai.com/settings/organization/billing/overview) and set a conservative spending alert or project budget.
3. Under [API keys](https://platform.openai.com/api-keys), select a project and create a **secret API key**. Copy it only to the Cloudflare encrypted secret `OPENAI_API_KEY`. Never place it in GitHub, tablet JS, the UI, or chat.
4. This implementation calls `https://api.openai.com/v1/responses` with model `gpt-6-luna`, `reasoning.effort: none`, `store:false`, using fixed prompts to return category preferences and packing suggestions.
5. `OPENAI_API_KEY` is the only AI provider secret required. `MODEL_API_KEY` (Meta) is **not used**.
6. No browser/web search is invoked through the OpenAI API. Official location, hours and route details continue to come from Google; weather from Open-Meteo; busy slots from the existing Google Calendar integration.

Token prices on October 21, 2026 (USD per 1 million tokens, Standard): `gpt-6-luna` $0.10 input / $0.50 output. Source: https://developers.openai.com/api/docs/models/gpt-6-luna. Usage and quotas vary; Google Maps may cost more than the model.

## 4. Cloudflare Pages bindings

Project name in the existing Finance setup documentation: `family-smart-dashboard`. Confirm the actual production Pages project before changing settings.

1. Cloudflare > Workers & Pages > KV > create a **new namespace** (suggested name: `family_activities_private`). Do not reuse `FINANCE_KV`.
2. Open your Pages project > Settings > Bindings > Add > KV namespace.
3. Set **Variable name** exactly `ACTIVITIES_KV`; select the newly created namespace.
4. Settings > Variables and Secrets > Add; mark the following as **secrets**:
   - `HOME_ADDRESS`: full precise home address with city, province, Canada; enter privately in Cloudflare. **Never commit the address.**
   - `GOOGLE_MAPS_API_KEY`: server-side Google Maps key.
   - `OPENAI_API_KEY`: required OpenAI API key (GPT-6 Luna).
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

No real credentials are used by the automated integration test. Its Google/OpenAI/Calendar/KV calls are mocked.

Once a protected Preview deployment is available:
1. Sign in through Cloudflare Access.
2. Open `/family-dashboard/` on the tablet; choose **✨ What to Do**.
3. Before the first refresh, you should see a placeholder with a manual Refresh Ideas button, **not automatically generated suggestions**.
4. Click Refresh Ideas once. Confirm 4 cards on the first page, 4 on the second (when 8 destinations qualify), actual photos where available, valid routes, and that all displayed driving distances are <=20 km from home.
5. Click a card. Verify links (Directions, Website, Google listing), packing advice, price **status**, and today's hours.
6. Reopen a scenario's Ideas: it must display the **previous saved selection**, without invoking OpenAI or Places **Text Search** again. The server resolves live Google Place Details and Routes on each tab open, and live photo metadata for visible cards. This costs additional Google Maps requests but avoids caching Google place content.
7. Try Refresh again within 90 seconds: should be throttled; the old list should remain visible.
8. Temporarily disable a noncritical key in Preview and confirm the saved list is retained on failure.
9. Check Google API quotas and Cloudflare logs for errors. Never log credentials, exact home address or private calendar titles.
10. On a school weekday, confirm no suggested departure before 3:30 PM. On a weekend, ensure daytime slots can be used.
11. Verify the existing Clothes, Calendar, Night and Finance views still work. Check automatic mode, manual expiry and finance lock separately.

Do **not** merge simply because the automated mock test passes. Only merge after actual preview checks succeed.

## Behavior and limitations

- **Only user-initiated Refresh actions invoke OpenAI**. Ideas searches venues; Events and Movies additionally use billable OpenAI web search with explicit source links. Opening a tab reads cached selections (and can rehydrate Google venue data and photos) without generating new recommendations.
- Eight activities are targeted; fewer may be returned if fewer places qualify. Ranking blends AI input, road distance, opening hours, forecast and ratings.
- Ideas searches **venues**. The Events section researches same-day events on demand with source citations and Google-verified road distances; a dedicated contracted ticketing/showtimes feed is **not** integrated.
- **Real family admission prices are not fetched** in this release. Each card says `Check admission price`, and the details link to the venue website when available. Google's price-level indicator is not a reliable family admission price.
- The saved **selection** remains until Refresh or expires after **28 days**. On every opening, names, addresses, opening hours and road distances are refreshed from Google; if the saved date is no longer today or tomorrow, the time displays **Refresh Ideas for a current time**.
- Driving distance is calculated from home via Routes API. The Directions link opens Google Maps, which may use the phone/tablet's current location as origin.
- If the Calendar integration fails or is incomplete, the generation fails closed rather than recommending a conflicting appointment.
- Google Calendar entries marked **All day** are ignored for What to Do availability; only timed events reserve slots. A truly occupied timetable with start/end times still blocks conflicting outings.
- **Public repo contains no home address or API keys.** The address goes only to Google's Geocoding API, weather receives home coordinates, and OpenAI receives only general family details, free time ranges and weather summaries (NO Google Places content, road details, residential address, or private event titles). The AI chooses preferred categories; first-party code combines those priorities with fresh Google Places information.
- For Google Maps Platform data licensing, **KV stores ONLY place IDs, activity categories, AI-authored notes and timestamps** (maximum 28-day TTL). Never store Google place names, addresses, ratings, business hours, Routes results or photo resource URLs in KV. Details and route distances are re-fetched when opening the tab; photo resources are looked up while rendering. Show visible **Google Maps** attribution and photo creator/source links. Recheck current Google Maps Platform Terms and attribution requirements before release. Confirm the dashboard's privacy policy and terms appropriately disclose Google Maps Platform usage.

## Troubleshooting

| Symptom | Check |
|---|---|
| Activities storage is not configured | Cloudflare `ACTIVITIES_KV` binding, redeploy |
| Setup incomplete | `HOME_ADDRESS`, `GOOGLE_MAPS_API_KEY` secrets, deployment |
| Calendar unavailable | Existing Google OAuth refresh token, all accessible calendars |
| No verified places | Places API (New), Geocoding API, Routes API enabled and billed, API key restrictions, 20 km threshold |
| OpenAI generation fails | Verify OpenAI Platform API billing, `OPENAI_API_KEY`, project/model access, rate limits |
| 403 on Refresh | Dashboard origin/Cloudflare Access; use protected page, not direct cross-site POST |
| No photos | Place has no photo, Places Photo API failure, attribution / quota / key |
| 429 | Wait before clicking Refresh again; WAF and KV throttle |
| Too few cards | Weather, opening hours, Calendar commitments, limited Google candidate count |

Official references:
- OpenAI Responses: https://developers.openai.com/api/docs/guides/text
- OpenAI Luna model: https://developers.openai.com/api/docs/models/gpt-6-luna
- Google Places Text Search: https://developers.google.com/maps/documentation/places/web-service/text-search
- Google Place Photos: https://developers.google.com/maps/documentation/places/web-service/place-photos
- Google Routes: https://developers.google.com/maps/documentation/routes
- Cloudflare Pages Functions KV: https://developers.cloudflare.com/pages/functions/bindings/
