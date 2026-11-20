# Vendvision marketing website

This Python static site deploys through GitHub and Cloudflare Pages. The marketing website is separate from the VendBI management portal.

## Cloudflare Pages project

Connect the new repository under Workers & Pages → Create application → Pages → Import an existing Git repository. Select the Vendvision repository and use these settings.

| Setting | Value |
| --- | --- |
| Production branch | `main` |
| Framework preset | None |
| Root directory | Repository root |
| Build command | `python3 cloudflare-build.py` |
| Build output directory | `dist` |
| Build environment variable | `PYTHON_VERSION=3.12` |

Pages deploys the generated `_worker.js` with the static assets in advanced mode. The Worker preserves the established `.html` URLs, redirects legacy article links and noindexes the Pages preview hosts. The Cloudflare Git integration only needs access to this repository. No secrets are required for the initial website.

## Cloudflare account and domain

A separate Cloudflare account can host the Pages project and its `pages.dev` preview before cutover. For `www.vendvision.co`, register the custom hostname in Pages and set the CNAME in the account that controls the DNS zone. Follow the hostname's validation instructions.

Cloudflare Pages requires the apex DNS zone and the Pages project in the same Cloudflare account to attach `vendvision.co` directly. If the DNS zone stays in its current account, configure the apex HTTPS redirect to `www.vendvision.co` there. To move DNS administration as well, copy all DNS records and relevant zone settings, verify mail and DNSSEC arrangements and plan the registrar nameserver change separately. [Cloudflare custom domains](https://developers.cloudflare.com/pages/configuration/custom-domains/)

## Review, cutover and rollback

1. Open the new `pages.dev` deployment. Confirm the website, especially the commercial forms and ten Insights guides. Check the preview `X-Robots-Tag` and crawler block.
2. Export or record the current DNS records for `www` and the apex. Keep Fly.io and its configuration in place for rollback. Do not change mail, verification, unrelated records or the VendBI domain.
3. At cutover, add `www.vendvision.co` as a Pages custom domain and follow Cloudflare's DNS instructions to replace the old `www` binding. Wait for the custom domain and TLS certificate to become active. For an apex hosted in the Pages account, add it only when ready to switch. The Worker redirects that host to HTTPS www. For separate DNS and Pages accounts, keep the apex redirect in the DNS zone account.
4. Confirm both hostnames, HTTPS, public canonicals, the production sitemap, the two legacy article redirects, a real 404, contact handoffs and GA4. Submit `https://www.vendvision.co/sitemap.xml` in Search Console after verifying the live site.
5. To roll back to Fly, detach the Pages custom domains as needed and restore the saved web records. For later deployments, use Pages deployment rollback when the earlier Pages release is the intended target.

The `pages.dev` host stays noindexed, including branch previews. GA4 initialises only on the canonical production origin. Contact routes use WhatsApp and email drafts.

The local preview is `python3 site.py preview --port 8770`.

## Deployment refresh

The `main` branch is the Cloudflare Pages production source. A new push should trigger a Pages rebuild when the Git integration is enabled; confirm deployment success in the Cloudflare dashboard.

Deployment note: refresh Cloudflare Pages from `main` with the current machine catalogue and branded catalogue headers. Machine-photo logo replacements remain pending asset edits.

## Meta Conversions API (server-only CRM integration)

The advanced-mode Cloudflare Worker exposes `POST /api/meta-capi` on `www.vendvision.co`.
It is disabled by default until these **Production** encrypted secrets are present
under Cloudflare Pages → Settings → Variables and Secrets:

- `META_CAPI_ACCESS_TOKEN` — generated within the Vendvision Meta dataset's Conversions API setup.
- `META_CAPI_CRM_SECRET` — a separate strong random bearer token shared only with the trusted CRM/automation backend.
- `META_CAPI_TEST_EVENT_CODE` — optional **temporary** Meta Events Manager test code. Remove after validation.

No Meta credentials are stored in GitHub, visitor-visible JavaScript, or GTM.
The endpoint does not accept browser-side unauthenticated calls; configure the two secrets
before enabling a trusted CRM sender. It only accepts explicit
`marketing_consent: true`, a verified `Lead` or `Purchase` event with
a stable unique `event_id`, Unix-second `event_time`, and a usable email or
phone. Plaintext identity values are hashed in the Worker before transmission.
For Purchase, require a confirmed transaction value and `currency: "MYR"`.
This endpoint is intended for **verified CRM lifecycle conversions**
with action source `system_generated`, not unverified website clicks.

**Example payload shape (illustrative, not actual customer data):**

```json
{
  "marketing_consent": true,
  "event_name": "Lead",
  "event_id": "crm-qualified-01234567",
  "event_time": 1795219200,
  "email": "test@example.com"
}
```

Use the `Authorization: Bearer <META_CAPI_CRM_SECRET>` request header only
from an authenticated backend. Never embed the CRM secret in website code,
browser scripts, client-side GTM, or a public form.

Browser Pixel `PageView` and `Contact` remain separate. Do not send a
server copy of the same browser event without passing the *same* event ID
and name to both platforms. Do not turn on CRM CAPI reporting until a
reliable lead system, deduplication rules, and consent handling are tested.
