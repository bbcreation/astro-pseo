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
 * Build sitemap.xml content from a list of pages plus the site root.
 *
 * @param {import('./config.js').PseoConfig} config
 * @param {Array<{slug: string, type: string, updatedAt: string|null}>} pages
 * @param {string[]} [extraPaths] Extra absolute paths (relative to site root)
 * @returns {string}
 */
export function buildSitemapXml(config, pages, extraPaths = []) {
  const site = trimTrailingSlash(config.site);
  const today = new Date().toISOString().slice(0, 10);

  const entries = [];

  entries.push(
    urlEntry(`${site}/`, today, config.sitemap.changefreqDefault, 1.0),
  );

  for (const extra of extraPaths) {
    entries.push(
      urlEntry(
        `${site}${ensureLeadingSlash(extra)}`,
        today,
        config.sitemap.changefreqDefault,
        config.sitemap.priorityDefault,
      ),
    );
  }

  for (const page of pages) {
    const isPillar = page.type === "pillar";
    const changefreq = isPillar
      ? config.sitemap.pillarChangefreq
      : config.sitemap.changefreqDefault;
    const priority = isPillar
      ? config.sitemap.pillarPriority
      : config.sitemap.priorityDefault;
    const lastmod = (page.updatedAt || "").slice(0, 10) || today;

    entries.push(urlEntry(`${site}/${page.slug}`, lastmod, changefreq, priority));
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
      lines.push(`- [${page.title}](${site}/${page.slug})${desc}`);
    }

    lines.push("");
  }

  lines.push("## Optional");
  lines.push("");
  lines.push(`- [Sitemap](${site}/sitemap.xml): XML sitemap of all pages`);

  return lines.join("\n") + "\n";
}

function urlEntry(loc, lastmod, changefreq, priority) {
  return [
    "  <url>",
    `    <loc>${escapeXml(loc)}</loc>`,
    `    <lastmod>${lastmod}</lastmod>`,
    `    <changefreq>${changefreq}</changefreq>`,
    `    <priority>${Number(priority).toFixed(1)}</priority>`,
    "  </url>",
  ].join("\n");
}

function escapeXml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function trimTrailingSlash(url) {
  return url.endsWith("/") ? url.slice(0, -1) : url;
}

function ensureLeadingSlash(p) {
  return p.startsWith("/") ? p : `/${p}`;
}

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
