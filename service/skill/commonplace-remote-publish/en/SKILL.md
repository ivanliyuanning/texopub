---
name: commonplace-remote-publish
description: "Discover, publish and update static websites or list external websites on TexoPub. Manage your own files, creator profile, AI partners and work visibility. Creating content does not authorize publication."
---

# TexoPub: humans and AI, creating together

TexoPub is a community for work created by people and AI. Readers discover and open works; creators ask their AI to publish and update them. Website content and profile editing are handled by AI. Sign-in, contact verification, making a personal profile public and key management are performed by the human.

- Website and guide: https://texopub.com/?lang=en · https://texopub.com/publish/?lang=en
- English Skill: https://texopub.com/for-ai/en/SKILL.md
- Chinese Skill: https://texopub.com/for-ai/SKILL.md
- API contract: https://texopub.com/for-ai/openapi.json
- Public indexes: `/api/v1/catalog`, `/api/v1/materials`, `/api/v1/categories` on https://texopub.com
- Open-source project: https://github.com/ivanliyuanning/texopub

Use the language the user requests for conversation and metadata. The website supports English and Chinese; published content keeps its original language. Account registration currently requires a Mainland China (+86) phone number. A verified backup email can sign in to an existing account; email-only registration and international phone registration are not available.

## Choose an available client

Prefer an already connected TexoPub MCP plugin. Cloud tools cannot read local paths or unpack ZIP files. Use the client's authorized conversation-file mechanism; a local path or `sandbox:` string is not an uploaded file. The current MCP supports authorized ChatGPT attachment domains. Other clients can send HTML/text directly or use the local CLI.

With Python 3, authorized local files and HTTP access, use `python3 scripts/commonplace.py` from the **package root** (one directory above `en/`). Global options such as `--credential` go before the subcommand. No Cloudflare account, Wrangler access or administrator credential is needed.

| Task | MCP tools | CLI subcommand |
| --- | --- | --- |
| Read valid categories and public indexes | `list_categories`; public HTTP | `categories`, `list`, `materials` |
| Verify identity and owned works | `get_my_space`, `list_my_works`, `get_work` | `me`, `my-works`, `show` |
| Read owned files | `list_my_materials` | `my-materials` |
| Read/update creator name, avatar and bio | `get_my_profile`, `update_my_profile` | `profile`, `profile-update` |
| Register/update an AI partner card | `get_my_profile`, `upsert_ai_partner` | `partners`, `partner` |
| Publish/update a static website | `publish_website` | `publish` |
| List/update an existing external website | `submit_website` | `submit` |
| Upload/update an independent file | `upload_asset` | `assets` |
| Publish a larger site | `inspect_files` → `prepare_upload` → `upload_file` → `commit_upload` | `publish` handles staging |
| Change webpage or file listing | `get_work` → `set_work_listing` | `show` → `listing` |
| Change future publishing defaults | `set_publish_preferences` | `preferences` |
| Legacy independent-file listing | `get_work` → `set_asset_visibility` | `show` → `asset-visibility` |
| Archive/permanently delete owned content | `get_work` → `archive_work` / `delete_work` | `show` → `archive` / `delete` |

For browsing, read [Discovery and materials](references/discover.md). Before a write, read [Publishing and updates](references/publish.md) and the current OpenAPI/tool schema for exact arguments.

## Authorization and visibility

Creating a webpage does not grant permission to upload it. Process only specified, authorized content. Do not publish private financial records, work documents, personal videos or unrelated files from a folder. The default content license is unspecified, not automatically open source.

Before publishing/listing a work, read `get_my_space.default_listing` / `me` and ask: “Where should it appear: Unlisted, Profile only, or Public? Your space default is …”. Follow an explicit current choice or applicable standing instruction without asking again. “Use my default” means the actual space default. Silence is not confirmation.

- `unlisted`: appears only in the owner's management collection, not public lists.
- `profile`: appears only on an enabled public personal profile, not Discover or the public material index.
- `public`: appears in Discover and an enabled personal profile; the initial default.

All three settings control **listing**, not access. Work links and dependencies remain accessible without login. Do not call an unlisted work private. Only the human can enable their public personal profile.

Webpages and independent files share `listing` and the space default. Every published URL works without login. New content uses default_listing (initially public); updates that omit listing retain their current value. Legacy visibility=private maps to unlisted, and visibility=public maps to public; neither restricts access. Conflicting legacy and listing parameters are rejected.

Updates preserve the same identity, slug and work ID, using the current `expected_version`. Omitted listing preserves the previous setting. Changing a default does not alter existing works. Profile and partner changes use their current `expected_revision`; listing and asset-access changes check both current version and revision. On 409, reread and reconcile the user's intent instead of blindly overwriting or creating a duplicate.

## Record real contributions

Read the existing profile/partner list and reuse the key for this client. Register a partner only when needed. `application` is a confirmed client name, `name` is its display name and `bio` is supplied or confirmed. Default names and geometric avatars do not require image generation. A custom avatar must be a public HTTPS image.

Partner cards and work credits are separate: `upsert_ai_partner` manages cards; `ai_partners` on publish/prepare/submit records the actual contributors to that work. Only upload assistance is not authorship. Include `model` only when the actual model is confirmed. Do not infer historical contributors. Omitting `ai_partners` on update keeps existing credits; `[]` clears them. Changing a card is not a backfill of work credits.

A missing cover gets a typographic fallback. An optional cover is a relative file path included in the package. It does not replace the dedicated icon required for each new work.

## Publish, update, verify, clean up

Choose an existing second-level category ID and create a dedicated self-contained SVG, PNG or ICO icon. Upload the complete static result and dependencies with relative paths. Preserve original asset bytes. An update replaces the **complete version**; uploading only changed files can drop the rest of the site.

Listing an external website preserves its original URL and hosting. The person listing it is not automatically a verified domain owner. New hosted works receive a stable URL under `https://content.texopub.com/p/{public_slug}/`. Name conflicts receive a suffix; updates and deletion never release the address. Return the URL supplied by the service, never guess it.

Archiving disables access but retains historical files and quota. When permanent deletion is explicitly requested, read the current version and use `delete_work(..., confirm=true)` or `delete ID --expected-version VERSION --confirm`. Draft works have version null; the CLI accepts `draft`. Deletion removes all versions and exclusively owned storage objects while preserving shared resources. If `deleted=false`, continue with the same arguments until `deleted=true`. Do not delete an entire official work just to remove one abandoned draft version.

After a write, independently reread the work/profile and open the real URL. Check content, icon, category, visibility, cover and credits. Verify an unlisted work in the owner's collection, a profile-only work on an enabled profile, and a public work in Discover as well. For independent files, verify ownership, original bytes and anonymous access and listing placement. HTTP success does not establish mobile-device or interactive acceptance. Permanently remove temporary test content after testing; archiving is insufficient.

## Credentials and limits

An OAuth plugin connection does not require an AI key. Let the client open the TexoPub sign-in/consent page and have the human authorize it. Installing a Skill alone grants no access.

For local clients, the human signs in at https://texopub.com/login/?lang=en and opens AI connections → local Agent keys to create a read or publish credential. Keys are shown once, can be revoked and default to six calendar months; custom expiry is 1–3650 days. Never ask for OTP codes or login cookies. Store credentials outside the published folder with mode 0600, specify `--credential /private/path/credential.json` or `COMMONPLACE_CREDENTIAL`, and run `me` before a write. Read-only keys cannot publish. Legacy invitation credentials do not prove ownership of similarly named accounts.

Static hosting does not execute user backends. Works run in a separate-origin sandboxed iframe, with limitations on localStorage, cookies, service workers and same-origin authentication. Hosting/listing does not include custom-domain binding, automatic external-site monitoring or large-video segmentation. See the operation reference for exact limits and safe retries.
