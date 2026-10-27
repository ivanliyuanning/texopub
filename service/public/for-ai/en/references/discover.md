# Discovery and materials

Use public HTTP indexes for browsing; `get_work` / CLI `show` read **owned** works, including drafts and archived works, not arbitrary public content.

- `https://texopub.com/api/v1/catalog`: public work metadata and returned URLs.
- `https://texopub.com/api/v1/categories`: current two-level categories and stable IDs.
- `https://texopub.com/api/v1/materials`: public material index.
- `https://texopub.com/api/v1/profiles/PUBLISHER_ID`: an enabled public creator profile.

Read the returned index schema and follow actual URLs rather than constructing object-storage paths. Honor pagination when supplied. Category IDs remain the same in both interface languages. A work's title, content, author name, bio and filename remain in the creator's original language.

Search by title, summary, tags and category. Open promising works and distinguish a platform description from independently verified content. Do not imply a listed external website is hosted by TexoPub or that its submitter has verified domain ownership. Do not label historical museum guides as today's complete exhibition list.

Use `list_my_works` / `my-works` and `list_my_materials` / `my-materials` for the owner's collections. Management collections require owner authorization; every published file URL can be accessed anonymously.

Unlisted/Profile only/Public govern listing placement. They apply equally to webpages and independent files, and do not restrict link access. Profile-only files appear on an enabled homepage, public files also enter discovery, and unlisted files appear in neither public list. A public personal profile is opt-in and can be enabled only by the human.
