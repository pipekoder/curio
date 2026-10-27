# Advertising library asset register

## Current six slots

No brand photography, licensed campaigns, real logos or purchased media was
provided for PR #3. These six files are **original geometric SVG placeholders**
authored for this repository, not scraped photographs, Meta-generated images,
real product representations or licensed brand campaigns. “Synthetic concept”
means a fictional advertising study here; no image-generation API was used.
Existing fictional fixture names are retained, not introduced as real brands.

| Stable ad ID | Local image (1200 × 900) | Category | Discoverable authored detail |
| --- | --- | --- | --- |
| `home-lamp` | `/catalog/home-lamp.svg` | Home | Paper shade |
| `home-chair` | `/catalog/home-chair.svg` | Home | Rounded silhouette |
| `fashion-coat` | `/catalog/fashion-coat.svg` | Fashion | Draped shape |
| `fashion-bag` | `/catalog/fashion-bag.svg` | Fashion | Folded panel |
| `travel-cabin` | `/catalog/travel-cabin.svg` | Travel | Lakeside composition |
| `travel-walk` | `/catalog/travel-walk.svg` | Travel | Winding path |

All have `licensing.status=placeholder_only`, no real advertiser, no source
website, no shopping/brand link, and no asserted third-party reuse permission.
Asset IDs use `asset-{ad-id}-v1`; replacing an image requires a new versioned
asset ID and a modification-history entry. Reader frames contain the complete source image without cropping or stripping marks.
The images contain no overlaid text,
logos, external resources, scripts, embedded photographs or automatic mark
removal. Their provenance and fictional status are visible outside each image.
The annotations describe authored geometry; **they are not SAM detections or
verified product identities**.

## URL-first hybrid records

The six files above are retained unchanged as demo assets and fallbacks. No
external URL has been approved or activated yet. The published catalog supports
approved external URLs first, alongside licensed local assets and these original
illustrations. Pending discoveries live only in `worker/pending-catalog.ts`;
that module is not imported by the frontend, public catalog or model prompt and
has no API route. Repository files are not a confidential document vault: keep
sensitive contracts elsewhere and record only non-sensitive review references.

Each record carries:

| Field | Meaning |
| --- | --- |
| `image.externalUrl` | Exact original remote image URL; HTTPS only, no credentials, private/local IP hosts or active protocols |
| `image.path` | Bundled primary asset for local demos or separately licensed local content; null for a URL-first record |
| `image.fallbackPath` | Optional fallback chosen only from the six existing original SVG illustrations |
| `image.id` | Stable versioned asset ID, separate from ad/campaign ID |
| `provenance.sourceUrl` | Discovery/source reference; not itself a permission grant |
| `provenance.originalSourcePage` | Original attribution/source page; required for external images and linked outside the image |
| `provenance.attribution` | Required human-supplied credit wording |
| `licensing` | Rights holder, reviewed status and evidence reference |
| `permissions.display` | Separate embedding/display status and evidence |
| `permissions.aiAnalysis` | Permission to access image bytes for future AI analysis; pending means not granted |
| `permissions.edits` | Separate adaptation/modification permission; pending means not granted |
| `sourceType`, `advertiser`, `campaign` | Verified brand, synthetic concept or editorial-support classification and human-reviewed identity |

Permission statuses are `pending`, `approved`, `rejected` or `blocked`; an
approved grant requires evidence. Display permission does **not** imply AI-analysis
or edit permission. No image-byte analysis, download, rehosting or editing is
implemented in this PR, even for records that might later receive those grants.
Local placeholders explicitly have evidenced display permission for the demo;
AI analysis and edits remain ungranted in their permission records.

External publication additionally requires an independent exact-URL entry in
`shared/url-policy.ts`'s `approvedExternalAssets` registry. Its asset ID, complete
image URL, original source-page URL and display-evidence reference must all match.
There are no wildcard host grants, inferred approvals, user URL-ingestion routes
or automatic domain approvals. The registry is currently empty. Merely setting
`licensing.status=cleared` cannot publish or load an external image.

The browser requests an approved URL directly with `referrerPolicy=no-referrer`;
CORS access is not requested because Curio neither reads pixels nor uses canvas.
Curio does not proxy the URL through its Worker, add authorization headers,
bypass host restrictions or retry through another host. Normal browser cookie
rules still apply at the external host; no page referrer is sent. A blocked, expired, unsupported or
10-second stalled visible image uses the explicitly labeled fictional fallback;
if that fails too, a readable unavailable-image placeholder remains. Attribution
and the approved source-page link stay in the editorial layer. No cropping,
logo/text removal, color filtering or generative alteration is performed.

## What the owner needs to provide

For the opening set, supply **six approved image URLs**: two Home, two Fashion,
and two Travel. Keep the six illustrations until their replacements have actually
been approved. For expansion to 24, cover the eight lifestyles in the catalog.
For each proposed visual, provide:

- The exact embeddable image URL and original source-page URL, dimensions and alt
  text. A discovery URL is useful context but is not permission. Prefer stable
  public URLs without personal access tokens or credentials.
- Evidence reasonably establishing Curio's embedding/display permission, exact
  credit wording, rights holder, allowed audience/use and any expiry/territory
  limits. Google Images, brand websites, Pinterest Save support and press banks
  are discovery tools, **not blanket approval** to hotlink, copy or analyze media.
- The distinct AI-analysis and edits permissions (or explicit pending/rejected
  status). A later SAM demo must use a small separately rights-cleared subset.
- Real brand/campaign verification when applicable; or clear synthetic-concept
  provenance/model information; or editorial-support classification. No invented
  advertiser identities, campaigns, exact product identities or endorsements.
- Any reviewed discoverable details and a separately approved official brand
  homepage, if desired. Purchase/checkout links remain outside scope.

If a host blocks embedding, requires a paywall/login or returns an expired URL,
do not evade it. Obtain permission and a supported URL, or retain the fallback.
Local image files may still be supplied where copying/display permission is
separately documented; they are an optional hybrid path, not a requirement to
manually download every discovered image. No third-party copies are stored by
the server merely to generate a session magazine.

## Review and promotion workflow

1. Record an unapproved candidate and its discovery/review notes in the internal
   pending registry, without importing it from `src/` or `shared/`. It must not be
   exposed in the library, API responses or prompts. Do not commit confidential
   contracts, private tokens or source credentials.
2. After human review, add non-sensitive evidence under `docs/`, complete the
   catalog metadata and explicit permission statuses, and add the exact URL,
   source-page and display-evidence approval under the new asset ID.
3. Promote only the approved record into `shared/reviewed-catalog.ts` under the
   corresponding demo-slot key; use `additionalReviewedRecords` for the next 18.
   The real advertisement retains its own ID and replaces that slot in the
   library, while the original SVG stays on disk and can be its fallback. For URL-first
   records, set `image.path=null` and retain a suitable original SVG fallback.
   For approved local copies, use `public/catalog/` and the local primary path.
4. Validate source/identity/rights evidence and run every check in
   `docs/PR3_REVIEW.md`. Do not programmatically remove real marks or change image
   bytes to fit a template. A source URL can change or expire; review revocations
   and move rejected/blocked candidates back out of the published catalog and
   remove their URL approval together.
5. Brand-homepage links have their own `approvedBrandLinks` registry. Image approval
   is not permission to invent merchant links, and the model approves neither.

The catalog supports 24 records through `CatalogRepository`; do not create 18
fake sourced ads to fill slots. A future adapter must retain stable ad/asset IDs
and these checks. No R2, D1, database migration or Cloudflare change is needed.

## Session privacy is separate from rights

Personalized editions and preferences stay in browser component memory for the
session; there is no share route, issue persistence, preference database or image
copying service. Existing durable storage holds only abuse-budget counters, not
magazine/preferences. Consented live generation still sends curated text
preferences/metadata to Meta, through the existing protected endpoint. Catalog media/source URL fields and image bytes are not attached to model
requests; only reviewed text metadata, asset IDs and consented text preferences
are sent. A future
SAM integration must explicitly enforce the analysis permission first.

Approved external display sends a normal image request from the reader's browser
to its host; that host can receive the reader's IP. Private/session-only reading
is a product/privacy choice, **not a copyright exemption**. Display permission is
still mandatory. No real external visual has been sourced, licensed or tested
against its actual host yet; all cross-origin tests use intercepted example-domain
responses and existing original SVG test bytes.
