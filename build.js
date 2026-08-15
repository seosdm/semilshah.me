#!/usr/bin/env node
/**
 * build.js — semilshah.me site builder
 *
 * Stamps one canonical nav + footer into every page, sets the active nav state,
 * guarantees a correct canonical tag, and regenerates sitemap.xml from the real
 * file list.
 *
 * Blog posts are NOT built here. WordPress is installed at semilshah.me/insights/
 * and owns the blog completely — it renders its own index and post pages
 * server-side. Nothing about a post is duplicated into this repo, so publishing
 * never requires a rebuild or an upload.
 *
 * ⚠ /insights/ on the SERVER is that WordPress install. This repo must never
 * contain an insights/ directory, because uploading one would collide with it.
 * check.js enforces that.
 *
 * Usage:
 *   node build.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const cfg = JSON.parse(fs.readFileSync(path.join(ROOT, 'site.config.json'), 'utf8'));

const HEADER = fs.readFileSync(path.join(ROOT, '_partials/header.html'), 'utf8').trim();
const FOOTER = fs.readFileSync(path.join(ROOT, '_partials/footer.html'), 'utf8').trim();

const YEAR = new Date().getFullYear();
let changed = 0;

/* ---------------------------------------------------------------- helpers */

const baseFor = rel => '../'.repeat(rel.split('/').length - 1);

const render = (tpl, base) =>
  tpl.replace(/\{\{BASE\}\}/g, base).replace(/\{\{YEAR\}\}/g, YEAR);

function setActive(navHtml, key) {
  if (!key) return navHtml;
  return navHtml.replace(
    new RegExp(`(<a\\b[^>]*data-nav="${key}"[^>]*)(>)`),
    (m, attrs, close) =>
      attrs.replace('opacity-70', 'opacity-100').replace(
        /class="/,
        'aria-current="page" class="is-active '
      ) + close
  );
}

/** Replace a marked block, or the first raw <tag>…</tag>, with fresh content. */
function injectBlock(html, tag, name, content) {
  const marked = new RegExp(
    `<!--\\s*PARTIAL:${name}\\s*-->[\\s\\S]*?<!--\\s*/PARTIAL:${name}\\s*-->`,
    'i'
  );
  const block = `<!-- PARTIAL:${name} -->\n${content}\n<!-- /PARTIAL:${name} -->`;

  if (marked.test(html)) return html.replace(marked, block);

  const raw = new RegExp(
    `(?:<!--[^>]*-->\\s*)?<${tag}\\b[\\s\\S]*?<\\/${tag}>`,
    'i'
  );
  if (raw.test(html)) return html.replace(raw, block);

  // No existing block: insert nav after <body>, footer before </body>.
  return tag === 'nav'
    ? html.replace(/(<body[^>]*>)/i, `$1\n\n${block}\n`)
    : html.replace(/<\/body>/i, `\n${block}\n\n</body>`);
}

function ensureCanonical(html, rel) {
  const url = rel === 'index.html' ? `${cfg.site}/` : `${cfg.site}/${rel}`;
  const tag = `<link rel="canonical" href="${url}"/>`;
  if (/<link\s+rel="canonical"[^>]*>/i.test(html))
    return html.replace(/<link\s+rel="canonical"[^>]*>/i, tag);
  return html.replace(/<\/title>/i, `</title>\n  ${tag}`);
}

function ensureNoindex(html, rel) {
  if (!cfg.noindex.includes(rel)) return html;
  if (/name="robots"/i.test(html)) return html;
  return html.replace(/<\/title>/i, `</title>\n  <meta name="robots" content="noindex,follow"/>`);
}

function listPages(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === '_partials' || e.name === 'node_modules') continue;
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) listPages(abs, out);
    else if (e.name.endsWith('.html')) out.push(path.relative(ROOT, abs).split(path.sep).join('/'));
  }
  return out;
}

/* ------------------------------------------------------- skills -> /build */

const SKILLS = fs.existsSync(path.join(ROOT, 'skills.json'))
  ? JSON.parse(fs.readFileSync(path.join(ROOT, 'skills.json'), 'utf8'))
  : [];
const SKILL_TPL = fs.existsSync(path.join(ROOT, '_partials/skill.html'))
  ? fs.readFileSync(path.join(ROOT, '_partials/skill.html'), 'utf8')
  : null;

const bySlug = Object.fromEntries(SKILLS.map(s => [s.slug, s]));

function renderSteps(steps) {
  return steps.map((s, i) => {
    const last = i === steps.length - 1 ? ' border-b' : '';
    return `      <div class="group border-t${last} border-outline-variant/20 py-8 flex gap-8 hover:bg-white transition-all duration-300 px-6 -mx-6">
        <span class="text-primary font-headline font-black text-xl">0${i + 1}</span>
        <div>
          <h3 class="text-xl font-headline font-bold uppercase tracking-tight group-hover:text-primary transition-colors">${s.title}</h3>
          <p class="text-on-surface-variant font-body mt-2 leading-relaxed">${s.body}</p>
        </div>
      </div>`;
  }).join('\n');
}

function renderStats(stats) {
  return stats.map((s, i) => {
    const bg = i === stats.length - 1 ? ' bg-surface-container-low' : '';
    const col = s.accent ? 'text-primary' : 'text-on-surface';
    return `        <div class="p-6 text-center${bg}">
          <span class="text-4xl font-black font-headline ${col} block leading-none">${s.value}</span>
          <span class="font-label text-[10px] uppercase tracking-widest text-outline mt-2 block">${s.label}</span>
        </div>`;
  }).join('\n');
}

function renderRelated(slugs) {
  return slugs.map(sl => {
    const r = bySlug[sl];
    if (!r) return '';
    return `      <a href="${r.slug}.html" class="group bg-surface p-6 hover:bg-white transition-colors">
        <span class="font-headline font-bold uppercase tracking-tight group-hover:text-primary transition-colors">${r.name}</span>
        <p class="text-on-surface-variant font-body text-sm mt-2">${r.relatedBlurb}</p>
      </a>`;
  }).filter(Boolean).join('\n');
}

function writeSkillPages() {
  if (!SKILL_TPL || !SKILLS.length) return [];
  fs.mkdirSync(path.join(ROOT, 'build'), { recursive: true });
  return SKILLS.map(s => {
    const rel = `build/${s.slug}.html`;
    const base = baseFor(rel);
    const canonical = `${cfg.site}/${rel}`;
    const schema = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'SoftwareSourceCode',
      name: s.slug,
      codeRepository: s.repo,
      url: canonical,
      description: s.description,
      programmingLanguage: 'Markdown',
      license: 'https://opensource.org/licenses/MIT',
      author: {
        '@type': 'Person', name: 'Semil Shah', url: cfg.site,
        jobTitle: 'SEO Consultant & Growth Strategist',
        sameAs: [cfg.social.github, cfg.social.linkedin, cfg.social.x]
      }
    }, null, 2);

    const html = SKILL_TPL
      .replace(/\{\{NAV\}\}/g, setActive(render(HEADER, base), 'build'))
      .replace(/\{\{FOOTER\}\}/g, render(FOOTER, base))
      .replace(/\{\{SCHEMA\}\}/g, schema)
      .replace(/\{\{CANONICAL\}\}/g, canonical)
      .replace(/\{\{NAME_HTML\}\}/g, s.nameHtml)
      .replace(/\{\{NAME\}\}/g, s.name)
      .replace(/\{\{SLUG\}\}/g, s.slug)
      .replace(/\{\{STAGE\}\}/g, s.stage)
      .replace(/\{\{TAGLINE\}\}/g, s.tagline)
      .replace(/\{\{DESCRIPTION\}\}/g, s.description)
      .replace(/\{\{REPO\}\}/g, s.repo)
      .replace(/\{\{PROBLEM\}\}/g, s.problem.map(p => `      <p>${p}</p>`).join('\n'))
      .replace(/\{\{STEPS\}\}/g, renderSteps(s.steps))
      .replace(/\{\{INSTALL\}\}/g, s.install)
      .replace(/\{\{SAMPLE_TITLE\}\}/g, s.sampleTitle)
      .replace(/\{\{SAMPLE_STATS\}\}/g, renderStats(s.sampleStats))
      .replace(/\{\{SAMPLE_VERDICT\}\}/g, s.sampleVerdict)
      .replace(/\{\{CTA_HREF\}\}/g, s.ctaHref)
      .replace(/\{\{CTA_LABEL\}\}/g, s.ctaLabel)
      .replace(/\{\{RELATED\}\}/g, renderRelated(s.related));

    fs.writeFileSync(path.join(ROOT, rel), html);
    console.log(`  + skill ${rel}`);
    return rel;
  });
}

/** Regenerate the skill-card list on build.html from skills.json. */
function writeStackCards() {
  const p = path.join(ROOT, 'build.html');
  if (!fs.existsSync(p) || !SKILLS.length) return;
  const cards = SKILLS.map((s, i) => {
    const last = i === SKILLS.length - 1 ? ' border-b' : '';
    return `      <a href="build/${s.slug}.html" class="group border-t${last} border-outline-variant/20 py-12 flex flex-col md:flex-row justify-between items-start md:items-center hover:bg-white transition-all duration-300 px-6 -mx-6">
        <div class="flex items-start gap-8">
          <span class="text-primary font-headline font-black text-xl">${String(i + 1).padStart(2, '0')}</span>
          <div>
            <h3 class="text-4xl font-headline font-bold uppercase group-hover:text-primary transition-colors">${s.name}</h3>
            <p class="text-on-surface-variant font-body max-w-md mt-4">${s.cardBlurb}</p>
          </div>
        </div>
        <span class="material-symbols-outlined text-4xl mt-6 md:mt-0 opacity-0 group-hover:opacity-100 transition-opacity">north_east</span>
      </a>`;
  }).join('\n');

  let html = fs.readFileSync(p, 'utf8');
  const re = /(<!--\s*PARTIAL:STACK\s*-->)[\s\S]*?(<!--\s*\/PARTIAL:STACK\s*-->)/;
  if (!re.test(html)) { console.warn('  ! build.html has no PARTIAL:STACK markers — cards not regenerated'); return; }
  html = html.replace(re, `$1\n${cards}\n      $2`);
  fs.writeFileSync(p, html);
  console.log(`  = build.html stack (${SKILLS.length} cards -> interior pages)`);
}

/* -------------------------------------------------------------- sitemap */

function writeSitemap(pages) {
  const today = new Date().toISOString().slice(0, 10);
  const urls = pages
    .filter(rel => !cfg.noindex.includes(rel) && !cfg.pages[rel]?.skipSitemap)
    .sort((a, b) => (a === 'index.html' ? -1 : b === 'index.html' ? 1 : a.localeCompare(b)))
    .map(rel => {
      const meta = cfg.pages[rel]
        ?? ((cfg.skillDir && rel.startsWith(`${cfg.skillDir}/`)) ? { priority: '0.7', changefreq: 'monthly' }
        : {});
      const loc = rel === 'index.html' ? `${cfg.site}/` : `${cfg.site}/${rel}`;
      const lastmod = fs.statSync(path.join(ROOT, rel)).mtime.toISOString().slice(0, 10);
      return [
        '  <url>',
        `    <loc>${loc}</loc>`,
        `    <lastmod>${lastmod || today}</lastmod>`,
        `    <changefreq>${meta.changefreq ?? 'monthly'}</changefreq>`,
        `    <priority>${meta.priority ?? '0.6'}</priority>`,
        '  </url>'
      ].join('\n');
    });

  fs.writeFileSync(
    path.join(ROOT, 'sitemap.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.join('\n')}\n</urlset>\n`
  );
  console.log(`  = sitemap.xml (${urls.length} urls)`);
}

/* ------------------------------------------------------------------ main */

(() => {
  console.log('Building semilshah.me\n');

  if (SKILLS.length) {
    console.log(`Generating ${SKILLS.length} skill page(s) from skills.json:`);
    writeSkillPages();
    writeStackCards();
    console.log('');
  }

  const pages = listPages();
  console.log(`Stamping nav + footer into ${pages.length} pages:`);

  for (const rel of pages) {
    const abs = path.join(ROOT, rel);
    const before = fs.readFileSync(abs, 'utf8');
    const base = baseFor(rel);
    const nav = setActive(render(HEADER, base), cfg.pages[rel]?.nav);

    let html = before;
    html = injectBlock(html, 'nav', 'NAV', nav);
    html = injectBlock(html, 'footer', 'FOOTER', render(FOOTER, base));
    html = ensureCanonical(html, rel);
    html = ensureNoindex(html, rel);

    if (html !== before) { fs.writeFileSync(abs, html); changed++; console.log(`  ~ ${rel}`); }
    else console.log(`    ${rel} (no change)`);
  }

  console.log('');
  writeSitemap(pages);
  console.log(`\nDone. ${changed} file(s) updated.`);
})();
