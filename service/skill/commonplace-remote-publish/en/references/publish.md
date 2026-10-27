# Publishing and updates

Read [the Skill](../SKILL.md) for authorization and visibility rules. The live tool schema and [OpenAPI contract](https://texopub.com/for-ai/openapi.json) provide exact parameter definitions; do not invent arguments.

## Identity and preparation

For MCP, call `get_my_space`, then `get_work` for the owned target. For the packaged CLI, run these commands **from the package root**, not the `en/` directory:

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json me
python3 scripts/commonplace.py --credential /private/path/credential.json my-works
python3 scripts/commonplace.py --credential /private/path/credential.json show WORK_ID
python3 scripts/commonplace.py --credential /private/path/credential.json categories
```

Distinguish a hosted static website, an external-site listing and an independent file. Confirm the exact authorized content, owner, current version and visibility. `show` only reads owned works. Public discovery uses HTTP indexes.

Export framework projects first. The CLI accepts one HTML file, a dedicated static folder with index.html, or a ZIP. MCP accepts expanded static files, HTML/text and authorized conversation attachments; it cannot compile a project, unzip local archives or read a local path. Check relative references, root paths and dynamically constructed dependencies. Include every file needed by every page.

Choose an existing full second-level category ID such as `humanities/museums`. `format` is one of `guide`, `article`, `report`, `tutorial`, `tool`, `visualization`, `portfolio`. Supply a dedicated SVG/PNG/ICO icon for each new work. A cover is optional, uses a package-relative path and must be in the manifest. Do not compress originals lossily to bypass a limit.

## CLI examples

The public listing example below applies only after the user has selected Public; substitute their actual confirmed choice. Global credential options precede the subcommand.

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json publish /path/to/site --slug my-guide --title 'My guide' --summary 'A useful illustrated guide' --category humanities/museums --icon /path/to/icon.svg --format guide --listing public
python3 scripts/commonplace.py --credential /private/path/credential.json publish /path/to/site --slug my-guide --update --title 'My guide' --category humanities/museums --format guide
python3 scripts/commonplace.py --credential /private/path/credential.json assets /path/to/file.pdf --slug reference-file --title 'Reference file' --listing unlisted
```

The first update must target the same owned work, preserving its slug and URL. Read `publish --help` and `submit --help` for optional cover, author, tags, license, contributor and expected-version arguments. Use `submit` to list an existing website without moving its hosting. Independent files share webpage listing controls: pass the confirmed --listing unlisted|profile|public. All published links are accessible without login. New content uses the space default; omitted listing on update preserves its current value. --public is a legacy alias for --listing public.

## MCP publishing

For a small work, use `publish_website` with slug, title, category_id, format, confirmed listing, HTML and a dedicated icon. Supply text files and authorized attachment `fileParams` according to the current client schema. Do not send a `sandbox:` string or local path as a remote attachment URL. File parameter order must match the files it references.

The one-step limit is **8 files, 25 MiB per file, 32 MiB total, 3 MiB request and 2 MiB HTML**. For more files, use staged uploads: inspect in batches → prepare the complete manifest → upload each missing file → commit. Staging supports **250 files and 100 MiB total**. Use the actual current schema of `inspect_files`, `prepare_upload`, `upload_file`, `commit_upload`, not an assumed one-step schema. Respect each response's session/file IDs, digests, missing-file list and expiry. Every file must match its declared bytes and SHA-256 before the complete version becomes visible.

For updates, supply the actual `work_id` and latest `expected_version`. Preserve the complete file set, not just the changed HTML. Reuse an existing icon when the client's schema supports it; otherwise include the original icon bytes/path. Use a stable idempotency key for a retry of the same exact operation and a new key for a changed operation/version. A conflict requires a reread and reconciliation, never blind retry or a new duplicate work.

## Metadata preservation

Omitted optional metadata on update is preserved according to the API contract. In particular, omitted listing and ai_partners keep prior values; an explicit empty ai_partners array clears credits. Required publication identity/category fields still follow the chosen tool schema. Read the current metadata before preparing an update, and verify the result instead of assuming all clients preserve every optional field identically.

Read `get_my_profile` before editing creator details or AI partner cards. Use `update_my_profile` with the profile's current expected_revision. Use `upsert_ai_partner` with the existing key and that partner's expected_revision; a partner card is not a work credit. Record actual contributors through `ai_partners` when publishing/preparing/listing. Use confirmed application/model details only. Never infer old work contributors from a newly created partner card.

## Visibility and preferences

`set_work_listing` changes one work's list placement after reading its current version/revision. `set_publish_preferences` changes future defaults only. `set_work_listing` also handles standalone assets. `set_asset_visibility` is a legacy listing alias: visibility=private means unlisted, without authentication on reads. Prefer listing; use the current version/revision and reject conflicting arguments. User-owned public-profile authorization is not included in these tools.

For CLI equivalents, read the current `listing`, `preferences` and `asset-visibility` help and use the target's real current guards. On 409, reread and confirm the intended change still applies. The initial space default is public; an update with no listing keeps the previous value.

## Archiving and permanent deletion

Archiving closes access while retaining files, versions and quota. Permanent deletion is irreversible and removes the entire work and its history. Read the owned work and expected version first. MCP: `delete_work` with work_id, expected_version and confirm=true. CLI:

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json delete WORK_ID --expected-version VERSION --confirm
```

Use `draft` for the CLI version argument when the draft has no published version. If deleted=false, repeat the **same** guarded deletion until deleted=true; do not assume the initial receipt means all storage is gone. Shared objects are protected. Verify the owned list, public indexes, old URLs and quota after cleanup. Do not delete an official work to remove a single abandoned draft version. Temporary acceptance works must be permanently removed after testing.

## Errors and acceptance

Retry transient network/service failures with the same session and idempotency key. For 401/403, verify the correct account, connection and scope. For 409, reread the latest target. For size/schema errors, correct the package without losing or degrading original assets. Keep the actual receipt and explain a concrete persistent blocker.

Independently reread metadata and open the returned URL. Check content, links, icon, category, cover, contributions, listing and original bytes. Verify anonymous GET/HEAD/Range, correct profile/discovery inclusion and original file bytes. Legacy /api/v1/me/assets and /api/v1/me/files links remain anonymous read aliases; management, drafts, archives and deletions retain their lifecycle restrictions. A successful HTTP response is not interactive or mobile-device validation.

There is no ordinary-user metadata-only endpoint for changing a published work's title/summary/cover/credits without a new complete version, no AI-partner deletion tool and no single-abandoned-version cleanup tool. Use a complete update when its full source is available; never construct an empty package. Owner-only maintenance is not a public capability.
