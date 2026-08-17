# semilshah.me — how this folder works

This folder is **an exact copy of what goes live on the server**. Nothing else belongs here.
Notes, drafts, the GitHub kit and blog working copies live in the sibling folders one level up.

```
semilshah/
├── website/          <- THIS FOLDER. Upload its contents to the server root.
├── blog-content/     <- old markdown working copies of posts (never uploaded)
└── marketer-github-kit/  <- open-source repos + skills (never uploaded)
```

## The one rule

**Never hand-edit a nav or a footer.** They are generated. Edit `_partials/header.html`
or `_partials/footer.html` once, run `node build.js`, and every page updates together.
Hand-editing one page is exactly how the site drifted out of sync before.

## Everyday workflow

```bash
cd website
node build.js      # nav+footer everywhere, skill pages, sitemap, and the theme zip
node check.js      # validate — exits non-zero if anything would ship broken
```

Then upload. If `check.js` prints ERRORS, do not upload.

The build is offline and synchronous — it makes no network calls, so there is no `--no-cms`
flag. Regenerating the 8 `build/*.html` skill pages every run is normal and idempotent.

## Updating the blog theme

The theme lives in `../wordpress/themes/semilshah-insights/`. Its nav and footer are
generated from `_partials/` — never hand-edit those blocks.

1. Edit the theme, and bump `Version:` in its `style.css`.
2. `node build.js` — restamps nav/footer and writes `../wordpress/themes/semilshah-insights.zip`.
3. Upload that zip: `/insights/wp-admin` → Appearance → Themes → Add New → Upload Theme.
4. Purge LiteSpeed cache, then hard-reload.

The theme is **not** part of the FTP upload. It is installed through the WordPress admin.

## Adding a new page

1. Create the `.html` file in this folder (or in `build/`).
2. Add an entry to `site.config.json` under `pages` — the `nav` key controls which nav item
   highlights, and `priority` / `changefreq` control its sitemap entry.
3. If it belongs in the main nav, add the link to `_partials/header.html`.
4. `node build.js && node check.js`.

The page gets the correct nav, footer, canonical, relative paths and sitemap entry automatically.

## Publishing a blog post

Write and publish it in WordPress at **semilshah.me/insights/**. That is all.

WordPress owns the blog completely — it renders its own index at `/insights/` and its own
post pages at `/insights/<slug>/`. No post is copied into this folder, so **publishing needs
no build and no upload**. Do not reintroduce static copies of posts; that design was built,
found to require a rebuild plus an FTP upload on every edit, and rejected.

### ⚠ Never upload anything to /insights/

`public_html/insights/` **is the WordPress install.** This folder must never contain an
`insights/` directory — `check.js` errors if one appears — and any mirroring deploy
(`rsync --delete` and friends) must exclude `/insights/` or it will destroy the blog.

`insights.html` is a separate, on-brand listing page that reads the WordPress REST API at
`/insights/wp-json/wp/v2` (same origin, no CORS) and links to the WordPress permalinks.
`blog-post.html` is a vestigial `noindex` shim that redirects legacy `?slug=` URLs to the
right permalink by asking the API for it.

## What check.js catches

- Broken internal links (relative *and* absolute `https://semilshah.me/...` links)
- Missing or wrong canonical tags
- Duplicate `<title>` tags across pages
- Missing or duplicated meta descriptions
- Missing Open Graph tags
- Pages missing from `sitemap.xml`, or sitemap entries pointing at files that don't exist
- Any page whose nav/footer isn't managed by `build.js`
- Missing social links in the footer
- An `insights/` directory existing here, which would collide with the WordPress install

## Files

| Path | What it is |
|---|---|
| `_partials/header.html` | The single source of truth for the nav |
| `_partials/footer.html` | The single source of truth for the footer |
| `site.config.json` | Page registry, social URLs, contact details, WP REST endpoint |
| `build.js` | The builder |
| `check.js` | The pre-upload validator |

`_partials/`, `site.config.json`, `build.js`, `check.js` and `README.md` are build tooling.
Uploading them is harmless, but you can exclude them from FTP if you prefer a clean server.
