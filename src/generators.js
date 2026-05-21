import { escXml, hostFromUrl, normalizeLinkPrefix } from "./util.js";

/**
 * Build robots.txt content from config rules. The Sitemap directive is
 * appended automatically when sitemap output is enabled.
 *
 * @param {import('./config.js').PseoConfig} config
 * @returns {string}
 */
export function buildRobotsTxt(config) {
  const lines = [];
  const rules = config.robots.rules ?? [];

  for (const block of rules) {
    lines.push(`User-agent: ${block.userAgent || "*"}`);

    for (const path of block.allow ?? []) {
      lines.push(`Allow: ${path}`);
    }

    for (const path of block.disallow ?? []) {
      lines.push(`Disallow: ${path}`);
    }

    if (typeof block.crawlDelay === "number" && block.crawlDelay > 0) {
      lines.push(`Crawl-delay: ${block.crawlDelay}`);
    }

    lines.push("");
  }

  if (config.outputs.sitemap !== false) {
    lines.push(`Sitemap: ${trimTrailingSlash(config.site)}/sitemap.xml`);
  }

  return lines.join("\n") + "\n";
}

/**
 * Build sitemap.xml content combining the home page, pSEO articles, optional
 * static Astro routes from `src/pages/**`, and user-supplied additional paths.
 * Entries are deduplicated by `<loc>` — first occurrence wins so explicit
 * pSEO entries override generic Astro-route entries when slugs collide.
 *
 * @param {import('./config.js').PseoConfig} config
 * @param {Array<{slug: string, type: string, updatedAt: string|null}>} pages
 * @param {string[]} [astroRoutes]      Paths from `collectAstroRoutes`. Defaults to none.
 * @param {string[]} [additionalPages]  Extra absolute paths. Defaults to none.
 * @returns {string}
 */
export function buildSitemapXml(
  config,
  pages,
  astroRoutes = [],
  additionalPages = [],
) {
  const site = trimTrailingSlash(config.site);
  const today = new Date().toISOString().slice(0, 10);
  const linkPrefix = normalizeLinkPrefix(config.linkPrefix);

  const seen = new Set();
  const entries = [];

  pushEntry(entries, seen, `${site}/`, today, config.sitemap.changefreqDefault, 1.0);

  for (const page of pages) {
    const isPillar = page.type === "pillar";
    const changefreq = isPillar
      ? config.sitemap.pillarChangefreq
      : config.sitemap.changefreqDefault;
    const priority = isPillar
      ? config.sitemap.pillarPriority
      : config.sitemap.priorityDefault;
    const lastmod = (page.updatedAt || "").slice(0, 10) || today;

    pushEntry(
      entries,
      seen,
      `${site}${linkPrefix}/${page.slug}`,
      lastmod,
      changefreq,
      priority,
    );
  }

  for (const route of astroRoutes) {
    pushEntry(
      entries,
      seen,
      `${site}${ensureLeadingSlash(route)}`,
      today,
      config.sitemap.changefreqDefault,
      config.sitemap.priorityDefault,
    );
  }

  for (const extra of additionalPages) {
    pushEntry(
      entries,
      seen,
      `${site}${ensureLeadingSlash(extra)}`,
      today,
      config.sitemap.changefreqDefault,
      config.sitemap.priorityDefault,
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...entries,
    "</urlset>",
  ].join("\n") + "\n";
}

/**
 * Build llms.txt content per llmstxt.org spec.
 *
 * @param {import('./config.js').PseoConfig} config
 * @param {Array<{slug: string, type: string, title: string, description: string}>} pages
 * @returns {string}
 */
export function buildLlmsTxt(config, pages) {
  const site = trimTrailingSlash(config.site);
  const linkPrefix = normalizeLinkPrefix(config.linkPrefix);
  const lines = [];

  lines.push(`# ${config.llms.name || hostFromUrl(config.site)}`);
  lines.push("");

  if (config.llms.description) {
    lines.push(`> ${config.llms.description}`);
    lines.push("");
  }

  for (const section of config.llms.sections ?? []) {
    const matches = pages.filter((p) => p.type === section.folder);

    if (matches.length === 0) {
      continue;
    }

    lines.push(`## ${section.heading}`);
    lines.push("");

    for (const page of matches) {
      const desc = page.description ? `: ${page.description}` : "";
      lines.push(`- [${page.title}](${site}${linkPrefix}/${page.slug})${desc}`);
    }

    lines.push("");
  }

  lines.push("## Optional");
  lines.push("");
  lines.push(`- [Sitemap](${site}/sitemap.xml): XML sitemap of all pages`);

  return lines.join("\n") + "\n";
}

function pushEntry(entries, seen, loc, lastmod, changefreq, priority) {
  if (seen.has(loc)) return;
  seen.add(loc);
  entries.push(urlEntry(loc, lastmod, changefreq, priority));
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return [
    "  <url>",
    `    <loc>${escXml(loc)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${Number(priority).toFixed(1)}</priority>`,
    "  </url>",
  ].join("\n");
}

function trimTrailingSlash(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function ensureLeadingSlash(p) {
  return p.startsWith("/") ? p : `/${p}`;
}
