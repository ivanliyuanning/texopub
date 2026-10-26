# TexoPub

**Humans and AI, creating together.** Publish AI-made static webpages, keep a stable URL when you update them, and discover work by other creators.

[Website](https://texopub.com/?lang=en) · [Publishing guide](https://texopub.com/publish/?lang=en) · [English Skill](https://texopub.com/for-ai/en/SKILL.md) · [中文说明](README.zh-CN.md)

![TexoPub](templates/brand/logo.svg)

## Use the publishing Skill

Give your AI this URL:

```text
Read https://texopub.com/for-ai/en/SKILL.md and help me publish my completed static website to TexoPub. Confirm my space and listing visibility first.
```

Or download the [Skill package](https://texopub.com/downloads/commonplace-skill.zip), extract it and let your local agent read `SKILL.md`. It includes a Python 3 client. Store the publishing credential outside the website directory and verify the owner with `me` before writing:

```sh
python3 scripts/commonplace.py --credential /private/path/credential.json me
python3 scripts/commonplace.py --credential /private/path/credential.json categories
```

For clients with remote MCP support, connect `https://texopub.com/api/mcp` using OAuth and dynamic client registration, then authorize your own space. [Plugin instructions](https://texopub.com/plugins/texopub/?lang=en). Installing a Skill alone grants no permissions. Custom MCP/plugin availability depends on your client and account; TexoPub is not listed in the public OpenAI plugin directory.

New accounts currently require a Mainland China (+86) phone number. An already linked backup email can sign in to the same account. English UI support does not imply international-phone or email-only registration.

## What it does

- Publish HTML with styles, scripts, images and subpages; update complete versions at the same short URL.
- List an existing website while preserving its original hosting and URL.
- Browse/search categories, creator profiles and genuine AI contribution credits.
- Manage your own profile and AI partner cards through an authorized AI client.
- Store independent files privately by default, with explicit public sharing when requested.
- Change listing visibility, archive or permanently delete owned content and its historical files.
- Switch the platform UI between English and Chinese; preserve original work content and names.

**Work listing and file access are separate.** Unlisted, Profile only and Public control inclusion in lists. All webpage links and dependencies remain accessible. Independent files have actual private/public access control. Public personal profiles are opt-in and can only be enabled by their human owner.

One-step MCP publishing supports 8 files, 25 MiB per file, 32 MiB total and 2 MiB HTML; staged uploads support 250 files and 100 MiB total. Static hosting does not run user backends. Works use a separate-origin sandboxed iframe. [Current API contract](https://texopub.com/for-ai/openapi.json).

## Develop from a fresh checkout

Requires Node.js 22+ and Python 3.10+. Install the pinned Node dependencies and build the public packages and frontend:

```sh
npm ci --prefix .tools
python3 scripts/package_public_skill.py
python3 scripts/package_plugin.py
python3 scripts/build_public.py
python3 -m http.server 8781 --directory build/public/site
```

Open `http://127.0.0.1:8781/?lang=en`. The static shell and publishing guides work locally; live account/API calls require same-origin Worker routes. For full offline interaction tests, use the fixtures in `tests/helpers/community.cjs`; they do not need live credentials or send SMS.

```sh
node --test service/tests/*.test.cjs tests/community-live.test.cjs tests/i18n.test.cjs
python3 -m unittest discover -s tests -v
```

The service tests run real workerd/SQLite/R2 simulations through Miniflare. See [architecture and self-hosting](docs/architecture.md) for the service topology and deployment boundaries. The legacy production build uses the owner's excluded local registry and content snapshots; a fresh checkout uses `build_public.py` instead. Do not deploy the empty development build over a production site with legacy content.

## Source map

| Path | Purpose |
| --- | --- |
| `templates/community/` | Platform frontend, locale preference and reviewed English catalog |
| `templates/en/` | English plugin and privacy pages |
| `service/worker.mjs` | API/content Worker entry point |
| `service/accounts.mjs`, `mcp-oauth.mjs`, `mcp.mjs` | Accounts, OAuth and the MCP interface |
| `service/schema.sql`, `service/migrations/` | D1 schema and incremental migrations |
| `service/skill/commonplace-remote-publish/` | Distributable publishing Skill, English/Chinese docs and client |
| `service/plugin/` | Credential-free plugin manifest and Skill |
| `scripts/`, `tests/`, `service/tests/` | Build/package tools and offline acceptance tests |
| `next/`, `design/` | Historical design previews and brand assets |

Runtime secrets, account data, private works, large original assets, test/deployment evidence and local candidate lists are not part of this repository. Publishing source code does not grant permission to republish works hosted on the service.

## License

Source code is available under the [MIT License](LICENSE). Third-party fonts retain their included SIL Open Font License. Hosted works, their images and linked external content retain their original authors' rights and licenses; the source-code license does not relicense them. TexoPub names and marks identify this project and do not imply endorsement of a third-party deployment.
