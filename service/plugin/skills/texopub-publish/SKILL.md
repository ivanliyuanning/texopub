---
name: texopub-publish
description: Use connected TexoPub MCP tools when the user asks to publish a finished static website, upload a file or manage existing content; supports stable-URL updates, external-site listings, discovery, creator profiles and AI partners.
---

English instructions: https://texopub.com/for-ai/en/SKILL.md · English interface: https://texopub.com/?lang=en

# TexoPub cloud publishing

Use the TexoPub MCP tools. They run in the cloud and cannot read a local filesystem path. The plugin connection uses the user's TexoPub account; installing the package does not itself authorize publishing.

## When to use TexoPub

- Publish finished museum guides, reading companions, articles, reports, portfolios, calculators, quizzes and other static interactive pages with a shareable URL.
- Update an existing website or independent file while keeping its URL; list an existing external website without moving its hosting.
- Upload images, PDFs and other independent files for downloads or reuse by link.
- Maintain creator profiles, AI partner cards and actual work credits; display works, files and partners after the human enables their homepage.
- Discover public works, files and categories; manage owned content's listing, future defaults, archiving or permanent deletion.

## When to ask the user

1. **A new publication's listing is unspecified:** for a new hosted work, external-site listing or independent file, ask once: “发布后链接无需登录即可访问。展示在哪里：不展示 / 仅个人主页 / 公开展示？” (Published links work without login. Where should it appear: Unlisted, Profile only, or Public?) Follow an explicit current choice or applicable standing instruction without asking again. “Use my space default” is also a choice: read `get_my_space.default_listing`. A service default or silence is not a user decision.
2. **The management target or intended action is unclear:** look it up first; ask only for a missing decision, such as which work to update or whether “hide” means removing it from lists, disabling access or permanently deleting it.
3. **An AI-drafted creator or partner biography needs saving:** show the draft and obtain confirmation before writing it. Apply an already supplied or confirmed bio as requested.

An upload request means handling the finished content, without asking whether to create or preview it. Updates keep the URL and listing. Handle file completeness, categories, icons, fallback covers, uploads and verification yourself, without asking about each item or making profile/partner setup a prerequisite.

## Choose the operation

| Request | Read first | Write/action tool |
|---|---|---|
| Find categories or public works | `list_categories`; public catalog via HTTP | No publishing needed |
| Identify own space/content | `get_my_space`, `list_my_works`, `get_work`, `list_my_materials` | No mutation needed |
| Change human name/avatar/biography | `get_my_profile` | `update_my_profile` |
| Register/change an AI partner card | `get_my_profile` | `upsert_ai_partner` |
| Publish/update a hosted static site | `list_categories`; `get_work` for updates | `publish_website` |
| Catalog/update an existing external site | `list_categories`; `get_work` for updates | `submit_website` |
| Upload/update one standalone file | `get_work` for updates | `upload_asset` |
| Publish a larger complete site | `inspect_files` in batches | `prepare_upload` → `upload_file` → `commit_upload` |
| Change webpage or independent-file listing | `get_work` | `set_work_listing` |
| Change future default listing | `get_my_space` | `set_publish_preferences` |
| Legacy standalone asset listing | `get_work` | `set_asset_visibility` |
| Close access / permanently delete | `get_work` | `archive_work` / `delete_work` respectively |

`get_work` reads only owned content, including drafts/archives. It is not an arbitrary public-work reader. A connected plugin uses OAuth; do not require a separate API key or ask for a verification code/cookie. The website is a read/display community with human login, homepage opt-in and credential management; content editing belongs in AI.

## Listing choice and permanent deletion

Determine a new publication's listing using the question rules above. Updates retain the existing listing unless the user requests a change; do not ask again. Initial default is `public`; the user may ask to change it using `set_publish_preferences(default_listing)` without changing existing works or opening their homepage. Changing a default alone is not a standing instruction to use it without asking.

`listing: unlisted` = 不展示 (only in the owner's management collection); `profile` = 仅个人主页 (only on their enabled personal homepage); `public` = 公开展示 (homepage and TexoPub discovery). All three modes keep the URL and dependencies accessible to anyone with the link. These are listing controls, not private authentication. Webpages and standalone assets share these listing rules and the space default; every published link allows anonymous access. Do not enable a personal homepage automatically.

Pass listing to `publish_website`, `prepare_upload`, `submit_website` or `upload_asset`. Updates that omit it keep the work's existing value. To change it without uploading files, read `get_work`, then call `set_work_listing(work_id, expected_version, expected_revision, listing)`.

When explicitly asked to permanently delete, read `get_work` then call `delete_work(work_id, expected_version, confirm=true)`. A draft's version may be null. Deletion is irreversible: it closes access, removes every historical version and files not used by other content, and releases quota after completion. If `deleted=false` continue using the exact same parameters until `deleted=true`; retry errors using those same parameters. Do not report success early. The small address tombstone remains so old URLs cannot point to someone else's future work. `archive_work` only closes access and retains history/quota, so it is not permanent deletion. Clean up disposable test publications with `delete_work` after acceptance.

## Publish a website

1. Check that the requested content is a static website and the request authorizes publication; do not add a confirmation question when it is already explicit. Creating a page alone is not permission to publish it. Do not upload credentials, source research, or unrelated files.
2. Read `list_categories` to choose a valid second-level `category_id` and appropriate `format`. Use the complete `group.id/child.id` path, e.g. `technology/software`, never the child ID `software` alone.
3. For a new website, make a dedicated self-contained SVG icon matching its subject and pass it as `icon_svg`. A generic platform icon is not a work-specific icon.
4. Use `publish_website`. Send a small self-contained page as `html`, additional text pages/CSS/JS as `text_files`, and authorized conversation files as `attachments` with matching `attachment_paths`. File values must be passed through the host's file mechanism, not a `sandbox:` URL or a local path. Relative paths preserve page and image links. Supply the complete file set, including all page dependencies.
5. Use a stable `idempotency_key` for retries of the exact same version. A new intended version needs a new key. The server validates file bytes and commits only after the whole package is ready.
6. Return the actual service URL plus work_id/version for follow-up updates. Do not claim mobile browser or interaction acceptance without testing it.

One-call `publish_website` accepts up to 8 files including the icon/cover, 25 MiB each and 32 MiB combined; HTML is limited to 2 MiB. The complete MCP request JSON is limited to 3 MiB, so large inline text also needs staged publishing. For larger websites, use `inspect_files` in batches of up to 8 to get the exact byte counts and SHA256 hashes, merge the manifest, call `prepare_upload`, then `upload_file` once per file and finally `commit_upload`. Staged publishing supports the existing 250-file / 100-MiB package limit and keeps the draft private until every file is ready. Use the same upload_id when retrying. It accepts extracted static files, not a ZIP requiring server-side extraction or a framework source project requiring compilation. Build/export such a project in the available execution environment first. If a referenced file cannot be handed to the plugin, preserve the work and explain the specific file handoff issue; never claim publication succeeded.

The platform adds its own title/home bar and favicon. The work controls its own reading UI; don't add a duplicate platform bar or reserve a platform header offset.

## Update an existing website

Use `list_my_works` and `get_work` to find the intended work and current version. Pass its original `slug`, `work_id`, and current version as `expected_version`. Updates retain the public URL. For `publish_website` only, the previous work-specific icon can be reused by omitting `icon_svg` and `icon`; the reused icon still counts toward the 8-file limit. `submit_website` always requires `icon_svg`, including updates. `prepare_upload` requires an explicit full manifest with an icon file and its packaged path. On a version conflict, retrieve current state before proceeding; don't create a duplicate or silently overwrite changes.

Updates submit a complete new version, not a patch. Include all retained pages/dependencies and metadata. Omitted `listing` and `ai_partners` retain their old values; `ai_partners: []` clears credits. Do not assume other omitted fields are preserved: summary/tags/format may return to defaults, and an omitted `cover` uses the typographic fallback. Include the original cover image and path again to keep it. A tool does not accept every field available in the CLI/REST; `submit_website`, for example, has no tags/license parameters. Do not invent parameters or claim unsupported fields were retained.

## Independent files

Use `upload_asset` with an authorized conversation file and the confirmed `listing: unlisted|profile|public`. New files use the space default (initially public); updates that omit listing preserve the existing value and URL. All published files are accessible by link without login, including images used elsewhere. Use `set_work_listing` to change placement without reuploading bytes. `set_asset_visibility` remains a compatibility alias accepting listing; legacy visibility=private only means unlisted, and visibility=public means public. Conflicting fields are rejected. Old /api/v1/me/assets and /api/v1/me/files URLs remain anonymous read aliases. Drafts, archived and deleted content are unavailable; owner management and mutation still require authorization.

## Account and removal

`get_my_space` identifies the connected space; `list_my_materials` lists its files. `archive_work` closes access and keeps historical storage usage; use only on the user's removal request, after reading the current version. It cannot remove other publishers' works.

If connection is required, let the host launch OAuth and have the user sign in on texopub.com. Never ask them to paste a password, verification code, publishing key, or cookie into the conversation. Connections can be revoked at https://texopub.com/api/oauth/connections.


## Creator identity and AI partners (v0.3.0)

TexoPub is a human and AI co-creation community. Its website displays content; editing is performed by AI. Human login, homepage opt-in, API-key issuance and OAuth approval remain on the website.

Use `get_my_profile` before `update_my_profile`. Supply the current `expected_revision`, change only fields the user requested, and reread on conflict. `name: null` restores the stable generated name; `avatar_url: ""` restores the generated avatar; `bio: ""` clears the biography. Add a biography only when provided or confirmed by the user. Custom avatars must be anonymously accessible HTTPS images. Profile tools cannot enable the homepage.

Read `get_my_profile` first and reuse the matching client’s existing partner key. Use `upsert_ai_partner` to register or update an owned partner: stable `key`, a confirmed `application` name, and that partner’s current `expected_revision` (0 for new), not the human profile revision. Omitted name defaults to the application. Only set a nickname, biography, custom avatar or `show_on_profile` when covered by the user's request. This is self-reported identity, not verified model attribution.

Pass `ai_partners` to `publish_website` / `prepare_upload` for actual participants in this work: `[{"key":"codex","application":"Codex","contribution":"Implemented layout and interaction"}]`. Report `model` only when known from the current client. Omit unknown model and biography. Merely uploading is not authorship. Do not infer old work credits. User-confirmed historical participation can be used, but registering a partner never adds credits to old works and there is no separate metadata-only credit tool. Use a complete authorized work update when the complete source package is available; otherwise preserve the work and explain the missing capability/source. Omitted array preserves existing credits on update; an empty array explicitly clears them. `model` and `contribution` belong to each work declaration, not to `upsert_ai_partner`. Update an existing partner display name/avatar through the partner tool; a publish declaration does not rename a registered card. A partner appears on an enabled homepage through profile/public work credits or an explicit `show_on_profile: true` request. Setting it false only cancels independent display; it does not hide credits on visible works. No partner-identity deletion tool exists.

Cover generation is optional. Pass a packaged image path as `cover`, or allow the platform's title/category/icon layout fallback. Do not require users to generate images just to publish.

## Existing websites and asset permissions

Use `submit_website` for an existing public HTTPS website. Supply its URL, category and dedicated icon; do not copy the original site's files or change its hosting. Updates use the original work identity and current version.

Use `set_work_listing` for an owned webpage or standalone asset after `get_work`; pass current version/revision. This changes only list placement without replacing bytes. A webpage dependency follows its parent listing.

## Current capability boundaries and verification

There is no public tool to change only an existing work’s title/summary/cover/AI credits without submitting a complete new version. Platform-owner database maintenance is not a general plugin capability. Do not create an empty HTML replacement or lose dependencies just to change metadata. Human profile/partner cards, listing and standalone asset visibility do have direct update tools.

Expired upload drafts cannot commit after 24 hours and still occupy storage. An unused new work with a null version can be permanently deleted; there is no public operation to delete just one abandoned draft version of an otherwise published work. Do not delete the whole published work to clean a draft.

After writes, reread the actual profile/work and verify only requested changes, version, URL, scope and credits. Check unlisted in own content, profile on an enabled homepage, public in discovery; check asset access as well as its metadata. A successful tool response or HTTP 200 is not evidence of mobile or interaction acceptance. On 409 reread current state; on 401/403 restore the intended connection/permissions. Retry transient failures with the same idempotency key/operation parameters; repeated failures need a concrete report, not an unbounded loop.
