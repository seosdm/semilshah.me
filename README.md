# semilshah.me — how this folder works

This folder is **an exact copy of what goes live on the server**. Nothing else belongs here.
Notes, drafts, the GitHub kit and blog working copies live in the sibling folders one level up.

```
semilshah/
├── website/          <- THIS FOLDER. Upload its contents to the server root.
├── blog-content/     <- markdown working copies of CMS posts (never uploaded)
└── marketer-github-kit/  <- open-source repos + skills (never uploaded)
```

## The one rule

**Never hand-edit a nav or a footer.** They are generated. Edit `_partials/header.html`
or `_partials/footer.html` once, run `node build.js`, and every page updates together.
Hand-editing one page is exactly how the site drifted out of sync before.

## Everyday workflow

```bash
cd website
node build.js      # stamp nav+footer everywhere, pull posts from the CMS, rebuild sitemap
node check.js      # validate — exits non-zero if anything would ship broken
```

Then upload. If `check.js` prints ERRORS, do not upload.

`node build.js --no-cms` skips the WordPress fetch (offline, or when you only touched layout).

## Adding a new page

1. Create the `.html` file in this folder (or in `build/`).
2. Add an entry to `site.config.json` under `pages` — the `nav` key controls which nav item
   highlights, and `priority` / `changefreq` control its sitemap entry.
3. If it belongs in the main nav, add the link to `_partials/header.html`.
4. `node build.js && node check.js`.

The page gets the correct nav, footer, canonical, relative paths and sitemap entry automatically.

## Publishing a blog post

Write it in WordPress at `cms.semilshah.me`. Then:

```bash
node build.js && node check.js
```

`build.js` pulls every published post from the WP REST API and writes a real static page to
`insights/<slug>.html` — its own canonical, title, meta, OG tags and BlogPosting schema —
and adds it to the sitemap. `insights.html` links to those static pages.

`blog-post.html` is the old JS template. It is now `noindex` and redirects any legacy
`?slug=` URL to the matching static page. Keep it until the old URLs stop getting traffic.

## What check.js catches

- Broken internal links (relative *and* absolute `https://semilshah.me/...` links)
- Missing or wrong canonical tags
- Duplicate `<title>` tags across pages
- Missing or duplicated meta descriptions
- Missing Open Graph tags
- Pages missing from `sitemap.xml`, or sitemap entries pointing at files that don't exist
- Any page whose nav/footer isn't managed by `build.js`
- Missing social links in the footer

## Files

| Path | What it is |
|---|---|
| `_partials/header.html` | The single source of truth for the nav |
| `_partials/footer.html` | The single source of truth for the footer |
| `_partials/post.html` | Template for generated blog post pages |
| `site.config.json` | Page registry, social URLs, contact details, CMS endpoint |
| `build.js` | The builder |
| `check.js` | The pre-upload validator |

`_partials/`, `site.config.json`, `build.js`, `check.js` and `README.md` are build tooling.
Uploading them is harmless, but you can exclude them from FTP if you prefer a clean server.
