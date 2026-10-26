# Discovery and materials

Use public HTTP indexes for browsing; `get_work` / CLI `show` read **owned** works, including drafts and archived works, not arbitrary public content.

- `https://texopub.com/api/v1/catalog`: public work metadata and returned URLs.
- `https://texopub.com/api/v1/categories`: current two-level categories and stable IDs.
- `https://texopub.com/api/v1/materials`: public material index.
- `https://texopub.com/api/v1/profiles/PUBLISHER_ID`: an enabled public creator profile.

Read the returned index schema and follow actual URLs rather than constructing object-storage paths. Honor pagination when supplied. Category IDs remain the same in both interface languages. A work's title, content, author name, bio and filename remain in the creator's original language.

Search by title, summary, tags and category. Open promising works and distinguish a platform description from independently verified content. Do not imply a listed external website is hosted by TexoPub or that its submitter has verified domain ownership. Do not label historical museum guides as today's complete exhibition list.

Use `list_my_works` / `my-works` and `list_my_materials` / `my-materials` for the owner's collections. The public material index is not a private library. For private files, use an authorized download path and never present it as an anonymous public image URL.

Unlisted/Profile only/Public govern listing placement. They do not restrict work-link access. Independent file access is a separate permission. A public personal profile is opt-in and can be enabled only by the human.
