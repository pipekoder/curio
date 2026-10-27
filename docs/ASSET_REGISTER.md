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

## What the owner needs to provide

For the first six stronger image slots, supply two Home, two Fashion and two
Travel assets. For expansion to 24, supply an approved set spanning the eight
lifestyles listed in `shared/catalog.ts`. Please provide for each asset:

- The actual local image file, preferably optimized WebP/AVIF/JPEG, its dimensions,
  meaningful alt text, and permission for any responsive crops/treatments.
- Content classification: real brand campaign, synthetic concept, or editorial
  support. An editorial image must not be presented as paid brand advertising.
- For real campaigns: verified advertiser name, campaign title/reference,
  official source, verification evidence and any approved logo treatment.
- Rights holder, exact license/permission evidence, allowed display/modification
  scope, credit wording, and any expiration/territory restrictions. A public
  Google result or brand website is **not** reuse permission.
- For synthetic imagery: how it was produced, provider/model (if any), rights
  evidence, modification history, and confirmation it is not an endorsed real
  campaign. Any future runtime inference must remain Meta-only.
- Discoverable object/detail labels and their evidence. Leave product identity
  null unless explicitly verified; no guessed product names, materials or prices.
- Optional official brand homepage, separately reviewed before being added to
  the approval registry. No checkout, product purchase or tracking URLs.

Record a non-sensitive evidence summary under `docs/` and reference it from the
catalog; do not publish confidential contracts. Keep pending/unverified images
out of the reader and model catalog until review. Do not delete real brand marks
or imply endorsement to make an image fit a template. No new blanket license is
asserted for third-party assets by this register.

## Adding or replacing approved assets

1. Place the reviewed, optimized file in `public/catalog/` with a simple lowercase
   filename. No remote hotlinking, arbitrary URL fetching, R2 or D1 is used.
2. Update a record in `shared/catalog.ts`, including its exact versioned image ID,
   local path, full provenance, rights evidence, campaign and verified metadata.
   Set `cleared` only after actual permission review; otherwise use `pending`.
3. Real brand records require advertiser-verification evidence. Any brand link
   additionally requires a matching entry in the independent `approvedBrandLinks`
   registry. The model cannot create or approve links, identities or rights.
4. Run the checks in `docs/PR3_REVIEW.md`, including static-file and visual tests.
   Review the actual license scope manually; schema validation cannot establish
   that a document grants legal permission.

A future 24-item catalog can add records through `CatalogRepository` without
changing the reader or generator interface. Expand the slot-count integration
assertion together with an approved catalog change. A future storage adapter
must retain stable ad/asset IDs and these source checks; it is not configured now.
