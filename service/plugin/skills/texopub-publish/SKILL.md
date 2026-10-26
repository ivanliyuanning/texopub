---
name: texopub-publish
description: Publish or update a static HTML website or upload an independent file to the user's TexoPub space using connected cloud MCP tools. Use when the user requests TexoPub publishing, an update, or personal asset storage, creator profiles, AI partners, external-site cataloging, asset permissions, listing changes, default preferences, or permanent deletion.
---

# TexoPub cloud publishing

Use the TexoPub MCP tools. They run in the cloud and cannot read a local filesystem path. The plugin connection uses the user's TexoPub account; installing the package does not itself authorize publishing.

## Listing choice and permanent deletion

Before each website publication ask: “展示在哪里？不展示 / 仅个人主页 / 公开展示（默认）”. Read `get_my_space.default_listing` for the default suggestion. If the user already chose in the request or gave an applicable standing instruction, follow it without asking again. A suggested default is not an answer; when a reply is needed, wait for it. Initial default is `public`; the user may ask to change it using `set_publish_preferences(default_listing)` without changing existing works or opening their homepage. Changing a default alone does not suppress the publication question.

`listing: unlisted` = 不展示 (only in the owner's management collection); `profile` = 仅个人主页 (only on their enabled personal homepage); `public` = 公开展示 (homepage and TexoPub discovery). All three modes keep the URL and dependencies accessible to anyone with the link. These are listing controls, not private authentication. Standalone assets retain their separate private/public access rules. Do not enable a personal homepage automatically.

Pass listing to `publish_website` or `prepare_upload`. Updates that omit it keep the work's existing value. To change it without uploading files, read `get_work`, then call `set_work_listing(work_id, expected_version, expected_revision, listing)`.

When explicitly asked to permanently delete, read `get_work` then call `delete_work(work_id, expected_version, confirm=true)`. A draft's version may be null. Deletion is irreversible: it closes access, removes every historical version and files not used by other content, and releases quota after completion. If `deleted=false` continue using the exact same parameters until `deleted=true`; retry errors using those same parameters. Do not report success early. The small address tombstone remains so old URLs cannot point to someone else's future work. `archive_work` only closes access and retains history/quota, so it is not permanent deletion. Clean up disposable test publications with `delete_work` after acceptance.

## Publish a website

1. Confirm the requested content is a static website and that the user requested publication. Creating a page alone is not permission to publish it. Do not upload credentials, source research, or unrelated files.
2. Read `list_categories` to choose a valid second-level `category_id` and appropriate `format`. Use the complete `group.id/child.id` path, e.g. `technology/software`, never the child ID `software` alone.
3. For a new website, make a dedicated self-contained SVG icon matching its subject and pass it as `icon_svg`. A generic platform icon is not a work-specific icon.
4. Use `publish_website`. Send a small self-contained page as `html`, additional text pages/CSS/JS as `text_files`, and authorized conversation files as `attachments` with matching `attachment_paths`. File values must be passed through the host's file mechanism, not a `sandbox:` URL or a local path. Relative paths preserve page and image links. Supply the complete file set, including all page dependencies.
5. Use a stable `idempotency_key` for retries of the exact same version. A new intended version needs a new key. The server validates file bytes and commits only after the whole package is ready.
6. Return the actual service URL plus work_id/version for follow-up updates. Do not claim mobile browser or interaction acceptance without testing it.

One-call `publish_website` accepts up to 8 files, 25 MiB each and 32 MiB combined; HTML is limited to 2 MiB. For larger websites, use `inspect_files` in batches of up to 8 to get the exact byte counts and SHA256 hashes, merge the manifest, call `prepare_upload`, then `upload_file` once per file and finally `commit_upload`. Staged publishing supports the existing 250-file / 100-MiB package limit and keeps the draft private until every file is ready. Use the same upload_id when retrying. It accepts extracted static files, not a ZIP requiring server-side extraction or a framework source project requiring compilation. Build/export such a project in the available execution environment first. If a referenced file cannot be handed to the plugin, preserve the work and explain the specific file handoff issue; never claim publication succeeded.

The platform adds its own title/home bar and favicon. The work controls its own reading UI; don't add a duplicate platform bar or reserve a platform header offset.

## Update an existing website

Use `list_my_works` and `get_work` to find the intended work and current version. Pass its original `slug`, `work_id`, and current version as `expected_version`. Updates retain the public URL. The previous work-specific icon can be reused by omitting `icon_svg` and `icon`. On a version conflict, retrieve current state before proceeding; don't create a duplicate or silently overwrite changes.

## Independent files

Use `upload_asset` with an authorized conversation file. Omit `visibility` for private storage. Set `visibility: public` only when the user authorizes public access; a private asset URL requires owner authentication and is not an anonymous image or download URL. Images needed by a public webpage should be included in that webpage's file package.

## Account and removal

`get_my_space` identifies the connected space; `list_my_materials` lists its files. `archive_work` closes access and keeps historical storage usage; use only on the user's removal request, after reading the current version. It cannot remove other publishers' works.

If connection is required, let the host launch OAuth and have the user sign in on texopub.com. Never ask them to paste a password, verification code, publishing key, or cookie into the conversation. Connections can be revoked at https://texopub.com/api/oauth/connections.


## Creator identity and AI partners (v0.3.0)

TexoPub is a human and AI co-creation community. Its website displays content; editing is performed by AI. Human login, homepage opt-in, API-key issuance and OAuth approval remain on the website.

Use `get_my_profile` before `update_my_profile`. Supply the current `expected_revision`, change only fields the user requested, and reread on conflict. `name: null` restores the stable generated name; `avatar_url: ""` restores the generated avatar; `bio: ""` clears the biography. Add a biography only when provided or confirmed by the user. Custom avatars must be public HTTPS images, never private authenticated file URLs. Profile tools cannot enable the homepage.

Use `upsert_ai_partner` to register or update an owned partner: stable `key`, a confirmed `application` name, and current `expected_revision` (0 for new). Omitted name defaults to the application. Only set a nickname, biography, custom avatar or `show_on_profile` when covered by the user's request. This is self-reported identity, not verified model attribution.

Pass `ai_partners` to `publish_website` / `prepare_upload` for actual participants in this work: `[{"key":"codex","application":"Codex","contribution":"Implemented layout and interaction"}]`. Report `model` only when known from the current client. Omit unknown model and biography. Merely uploading is not authorship. Do not infer or backfill old work credits. Omitted array preserves existing credits on update; an empty array explicitly clears them. A partner appears on an enabled homepage through its visible work or an explicit profile-display request.

Cover generation is optional. Pass a packaged image path as `cover`, or allow the platform's title/category/icon layout fallback. Do not require users to generate images just to publish.

## Existing websites and asset permissions

Use `submit_website` for an existing public HTTPS website. Supply its URL, category and dedicated icon; do not copy the original site's files or change its hosting. Updates use the original work identity and current version.

Use `set_asset_visibility` only for an owned standalone asset, after `get_work`; pass current version/revision. Public access requires the user's explicit request. This changes permissions without replacing bytes. It does not apply to a webpage's dependencies.
