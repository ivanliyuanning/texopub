# Architecture and self-hosting

TexoPub has a static platform frontend on Cloudflare Pages and a Worker bundle deployed in API and content roles. D1 stores ownership, versions, file manifests, profiles, credentials digests and OAuth records. R2 stores original file bytes. The platform's `/api/*` route reaches the API Worker at the same origin; published content uses a separate content origin and sandboxed viewer.

## Development and deployment boundaries

`python3 scripts/build_public.py` builds the frontend from source without private registries or original hosted works. `templates/community/locales/en.json` holds reviewed English static UI phrases. `scripts/localize.py` compiles English modules and fails when a Chinese interface string lacks a translation. It operates on static source, never on runtime creator content. Category labels use stable category IDs. English HTML documentation lives in `templates/en/`; the bilingual publishing Skill lives under `service/skill/`.

The locale is selected by an explicit `?lang=en|zh`, then the validated `texopub_lang` cookie, then the browser language (Chinese for zh, English otherwise). The same preference is used on OAuth consent pages. It carries no authentication and does not alter permissions. Cookies disabled still allow an explicit query-language choice; persistence requires cookies. Browser-native validation messages follow the browser's language.

## Self-hosting outline

1. Create your own Cloudflare account resources: Pages project, D1 database, R2 bucket, API Worker and content Worker. Set up your own domains and routes. The existing `cloudflare.json` describes the maintained production instance; its IDs are not reusable credentials.
2. Initialize a fresh D1 database with `service/schema.sql`. For existing databases, apply only missing migrations in order after backing up. Never apply a fresh schema blindly over a live database.
3. Bundle `service/worker.mjs` using esbuild, ESM output and `.html=text`. Set the API role's `ROLE=api`, `APP_ORIGIN`, `API_ORIGIN`, `CONTENT_ORIGIN`, `DB` and `FILES` bindings. Set the content role's `ROLE=content`, content origin, DB and FILES. See `service/accounts.mjs`, `providers.mjs` and `mcp-oauth.mjs` for exact optional provider/budget settings. Configure production secrets only through Worker secret bindings.
4. Configure your own SMS/email provider or keep sign-in unavailable until configured. Use your own least-privilege provider credentials; never commit access keys, auth peppers, tokens or account cookies. Existing production provider limits and quotas do not transfer to forks.
5. Point the platform's `/api/*` and OAuth discovery paths at its API Worker, and the content domain at the content Worker. Update public URLs in manifests, Skill docs, configuration and MCP resource/issuer settings for your deployment; verify redirects and allowed client callback contracts.
6. Build/packages first; run the offline suites. Deploy only after adapting the origins, providers and OAuth client policy. Verify anonymous access, owned content isolation, conflict guards and revocation in your own environment. Preserve current production bindings and rollback artifacts when upgrading an existing installation.

No deployment command runs automatically from GitHub. CI only packages, builds and tests. The local `library build` flow also includes historical owner-approved legacy content; a public checkout does not include those originals. Do not use it as a data backup or replace an existing production site with an empty source-only build.

## Open-source scope

The repository includes platform/service/Skill/CLI source, schema/migrations, tests, reviewed documentation and historical UI designs. It excludes credentials, user account data, original hosted content, local candidate lists, large media, browser/session state and deployment evidence. Some historical documents mention local paths or non-secret resource IDs; these are context, not access credentials or a portable deployment recipe.

Work listing is not access control. Independent file privacy, OAuth permissions, content ownership/version checks and the human-controlled public-profile switch remain separate boundaries in both languages.
