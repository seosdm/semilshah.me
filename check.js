#!/usr/bin/env node
/**
 * check.js — pre-upload validator for semilshah.me
 *
 * Run this before every FTP upload. Exits 1 if anything would ship broken.
 *   node check.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

const errors = [];
const warns = [];
const err = (f, m) => errors.push(`${f}: ${m}`);
const warn = (f, m) => warns.push(`${f}: ${m}`);

function listPages(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === '_partials' || e.name === 'node_modules') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) listPages(abs, out);
    else if (e.name.endsWith('.html')) out.push(path.relative(ROOT, abs).split(path.sep).join('/'));
  }
  return out;
}

/* --- the WordPress install must not be shadowed by repo files ---------------
 * WordPress lives at semilshah.me/insights/ on the server. Deploying an
 * insights/ directory from this repo would overwrite it, and a mirroring
 * deploy with --delete would destroy it outright. Fail loudly before that
 * can reach an upload.
 */
if (fs.existsSync(path.join(ROOT, 'insights'))) {
  err('insights/', 'this directory must not exist — semilshah.me/insights/ is the WordPress install, and uploading over it would break the blog');
}

const pages = listPages();
const titles = new Map();
const descs = new Map();

const sitemapPath = path.join(ROOT, 'sitemap.xml');
const sitemap = fs.existsSync(sitemapPath) ? fs.readFileSync(sitemapPath, 'utf8') : '';
if (!sitemap) err('sitemap.xml', 'missing — run `node build.js`');

for (const rel of pages) {
  const html = fs.readFileSync(path.join(ROOT, rel), 'utf8');
  const dir = path.dirname(rel);
  const indexable = !cfg.noindex.includes(rel) && !cfg.pages[rel]?.skipSitemap;

  /* --- config coverage ------------------------------------------------ */
  const isSkill = cfg.skillDir && rel.startsWith(`${cfg.skillDir}/`);
  if (!cfg.pages[rel] && !isSkill) err(rel, 'not listed in site.config.json — it will get no active nav state and default sitemap priority');

  /* --- partials -------------------------------------------------------- */
  if (!/<!--\s*PARTIAL:NAV\s*-->/.test(html)) err(rel, 'nav is not managed by build.js (missing PARTIAL:NAV markers)');
  if (!/<!--\s*PARTIAL:FOOTER\s*-->/.test(html)) err(rel, 'footer is not managed by build.js (missing PARTIAL:FOOTER markers)');

  /* --- title ----------------------------------------------------------- */
  const t = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim();
  if (!t) err(rel, 'no <title>');
  else {
    if (titles.has(t)) err(rel, `duplicate <title> — identical to ${titles.get(t)}`);
    else titles.set(t, rel);
    if (t.length > 65) warn(rel, `title is ${t.length} chars, may truncate in SERPs`);
  }

  /* --- description ----------------------------------------------------- */
  const dTags = html.match(/<meta\s+name="description"[^>]*>/gi) ?? [];
  if (dTags.length === 0) err(rel, 'no meta description');
  if (dTags.length > 1) err(rel, `${dTags.length} meta description tags — must be exactly 1`);
  const d = dTags[0]?.match(/content="([^"]*)"/i)?.[1];
  if (d) {
    if (descs.has(d)) warn(rel, `duplicate meta description — identical to ${descs.get(d)}`);
    else descs.set(d, rel);
    if (d.length > 160) warn(rel, `meta description is ${d.length} chars`);
  }

  /* --- canonical ------------------------------------------------------- */
  const can = html.match(/<link\s+rel="canonical"[^>]*href="([^"]*)"/i)?.[1];
  const expect = rel === 'index.html' ? `${cfg.site}/` : `${cfg.site}/${rel}`;
  if (!can) err(rel, 'no canonical tag');
  else if (can !== expect) err(rel, `canonical is "${can}" but should be "${expect}"`);

  /* --- open graph ------------------------------------------------------ */
  for (const p of ['og:title', 'og:description', 'og:url', 'og:type', 'og:image']) {
    if (!new RegExp(`property="${p}"`, 'i').test(html)) err(rel, `missing ${p}`);
  }

  /* --- structured data -------------------------------------------------- */
  if (!/application\/ld\+json/.test(html)) warn(rel, 'no JSON-LD structured data');

  /* --- footer social ---------------------------------------------------- */
  const footer = html.match(/<footer[\s\S]*?<\/footer>/i)?.[0] ?? '';
  for (const [name, url] of Object.entries(cfg.social)) {
    if (!footer.includes(url)) err(rel, `footer is missing the ${name} link`);
  }

  /* --- internal links resolve ------------------------------------------- */
  const hrefs = [...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]);
  for (const raw of hrefs) {
    if (raw.includes('${')) continue;                     // JS template literal
    let h = raw;

    // An absolute link back to our own domain is still an internal link. Keep the
    // leading slash so it lands in the root-relative branch below.
    if (h.startsWith(cfg.site + '/')) h = h.slice(cfg.site.length);
    else if (h === cfg.site) continue;
    else if (/^(https?:|mailto:|tel:|#|data:)/i.test(h)) continue;

    const target = h.split(/[?#]/)[0];
    if (!target) continue;

    // Paths served by something other than this repo — the WordPress install at
    // /insights/. They will never exist on disk and must not be reported broken.
    if ((cfg.serverPaths ?? []).some(p => target === p || target.startsWith(p))) continue;

    // Root-relative links resolve from the site root; everything else from the
    // directory the page sits in.
    const abs = target.startsWith('/')
      ? path.join(ROOT, target.replace(/^\/+/, '') || 'index.html')
      : path.resolve(ROOT, dir, target);

    if (!fs.existsSync(abs)) err(rel, `broken internal link -> ${raw}`);
  }

  /* --- sitemap membership ----------------------------------------------- */
  if (indexable && !sitemap.includes(`<loc>${expect}</loc>`)) {
    err(rel, 'indexable but missing from sitemap.xml');
  }
  if (!indexable && sitemap.includes(`<loc>${expect}</loc>`)) {
    err(rel, 'noindex/excluded but present in sitemap.xml');
  }
}

/* --- sitemap points only at real files ----------------------------------- */
for (const loc of [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1])) {
  const rel = loc.replace(`${cfg.site}/`, '') || 'index.html';
  if (!fs.existsSync(path.join(ROOT, rel))) err('sitemap.xml', `lists ${loc} but that file does not exist`);
}

/* --- report -------------------------------------------------------------- */
console.log(`Checked ${pages.length} pages.\n`);
if (warns.length) {
  console.log(`WARNINGS (${warns.length}):`);
  warns.forEach(w => console.log(`  ~ ${w}`));
  console.log('');
}
if (errors.length) {
  console.log(`ERRORS (${errors.length}) — do not upload:`);
  errors.forEach(e => console.log(`  x ${e}`));
  process.exit(1);
}
console.log('PASS — safe to upload.');
