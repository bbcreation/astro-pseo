import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";

/**
 * Import a pSEO campaign archive into the Astro project.
 *
 * Replicates `App\Console\Commands\ContentImportCommand` (PHP):
 *   - copies pillar/*.md, supporting/*.md, research/*.md (optional --force)
 *   - copies schema/*.json
 *   - rewrites internal links from /slug to /learn/slug (configurable prefix)
 *   - merges sitemap.xml entries with the project's existing one
 *   - merges llms.txt links into an "## Imported Pages" section
 *   - writes robots.txt only if it doesn't exist
 *
 * @param {Object} opts
 * @param {string} opts.zipPath          Absolute path to campaign ZIP.
 * @param {string} opts.projectRoot      Absolute project root.
 * @param {string} opts.contentDir       Relative to root (default: src/content/pseo).
 * @param {string} opts.siteUrl          Absolute site URL of the destination.
 * @param {string} [opts.linkPrefix]     URL prefix to add to imported page links (default: "/learn").
 * @param {boolean} [opts.force]         Overwrite existing markdown files.
 * @returns {{pillar:number, supporting:number, research:number, skipped:number, schemaFiles:number, sitemapUrls:number}}
 */
export function importCampaign(opts) {
  const {
    zipPath,
    projectRoot,
    contentDir = "src/content/pseo",
    siteUrl,
    linkPrefix = "/learn",
    force = false,
  } = opts;

  if (!fs.existsSync(zipPath)) {
    throw new Error(`ZIP not found: ${zipPath}`);
  }

  if (!siteUrl) {
    throw new Error("siteUrl is required to rewrite absolute links.");
  }

  const zip = new AdmZip(zipPath);
  const entries = zip.getEntries();
  const contentAbs = path.resolve(projectRoot, contentDir);
  const appHost = hostFromUrl(siteUrl);
  const sourceDomain = detectSourceDomain(entries);

  ensureDir(path.join(contentAbs, "pillar"));
  ensureDir(path.join(contentAbs, "supporting"));
  ensureDir(path.join(contentAbs, "research"));
  ensureDir(path.join(contentAbs, "schema"));

  const slugMap = buildSlugMap(entries, contentAbs);

  const stats = { pillar: 0, supporting: 0, research: 0, skipped: 0 };

  for (const entry of entries) {
    const m = /^(pillar|supporting|research)\/([a-z0-9-]+)\.md$/.exec(entry.entryName);

    if (!m) {
      continue;
    }

    const [, type, slug] = m;
    const target = path.join(contentAbs, type, `${slug}.md`);

    if (fs.existsSync(target) && !force) {
      stats.skipped += 1;
      continue;
    }

    let content = entry.getData().toString("utf8");
    content = fixFrontMatter(content);
    content = stripMarkdownLinksFromFrontMatter(content);
    content = removeIncompleteMarkdownTables(content);
    content = rewriteInternalLinks(content, slugMap, linkPrefix);

    fs.writeFileSync(target, content, "utf8");
    stats[type] += 1;
  }

  let schemaFiles = 0;

  for (const entry of entries) {
    const m = /^schema\/([a-z0-9-]+)\.json$/.exec(entry.entryName);

    if (!m) {
      continue;
    }

    const target = path.join(contentAbs, "schema", `${m[1]}.json`);

    if (fs.existsSync(target) && !force) {
      continue;
    }

    fs.writeFileSync(target, entry.getData());
    schemaFiles += 1;
  }

  const sitemapUrls = mergeSitemap({
    entries,
    projectRoot,
    sourceDomain,
    appHost,
    linkPrefix,
  });

  mergeLlmsTxt({ entries, projectRoot, sourceDomain, appHost, linkPrefix });
  mergeRobotsTxt({ entries, projectRoot, appHost });

  return { ...stats, schemaFiles, sitemapUrls };
}

function buildSlugMap(entries, contentAbs) {
  const map = {};

  for (const entry of entries) {
    const m = /^(?:pillar|supporting|research)\/([a-z0-9-]+)\.md$/.exec(entry.entryName);

    if (!m) {
      continue;
    }

    const fileSlug = m[1];
    const content = fixFrontMatter(entry.getData().toString("utf8"));
    const fmSlug = readFrontMatterSlug(content);
    map[fileSlug] = fmSlug || fileSlug;
  }

  for (const type of ["pillar", "supporting", "research"]) {
    const dir = path.join(contentAbs, type);

    if (!fs.existsSync(dir)) {
      continue;
    }

    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".md")) {
        continue;
      }

      const fileSlug = file.replace(/\.md$/, "");

      if (map[fileSlug]) {
        continue;
      }

      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      map[fileSlug] = readFrontMatterSlug(raw) || fileSlug;
    }
  }

  return map;
}

function readFrontMatterSlug(content) {
  const fm = /^---\s*\n([\s\S]*?)\n---/.exec(content);

  if (!fm) {
    return null;
  }

  const m = /^slug:\s*["']?([^\s"']+)/m.exec(fm[1]);

  return m ? m[1] : null;
}

function rewriteInternalLinks(content, slugMap, linkPrefix) {
  return content.replace(/\]\(\/([\w-]+)\)/g, (_match, slug) => {
    if (slugMap[slug]) {
      return `](${linkPrefix}/${slugMap[slug]})`;
    }
    return `](/${slug})`;
  });
}

function fixFrontMatter(content) {
  const withFm = /^---\n([\s\S]*?)\n---\s*\n\s*```yaml\n([\s\S]*?)\n(?:```|---)/.exec(
    content,
  );

  if (withFm) {
    const existing = quoteYamlValues(withFm[1].trim());
    const block = quoteYamlValues(withFm[2].trim());
    const merged = mergeYamlByKey(`${existing}\n${block}`);
    const rest = content.slice(withFm[0].length);
    return `---\n${merged}\n---\n${rest}`;
  }

  const noFm = /^```yaml\n([\s\S]*?)\n(?:```|---)/.exec(content);

  if (noFm) {
    const block = quoteYamlValues(noFm[1]);
    const rest = content.slice(noFm[0].length);
    return `---\n${block}\n---\n${rest}`;
  }

  return content;
}

function mergeYamlByKey(yaml) {
  const seen = {};
  for (const line of yaml.split("\n")) {
    const m = /^(\w[\w_]*):\s/.exec(line);
    if (m) {
      seen[m[1]] = line;
    }
  }
  return Object.values(seen).join("\n");
}

function quoteYamlValues(yaml) {
  return yaml.replace(/^(\w[\w_]*):\s+(.+)$/gm, (full, key, value) => {
    const v = value.trim();
    if (/^".*"$|^'.*'$/.test(v)) {
      return full;
    }
    if (v.includes(":")) {
      const escaped = v.replace(/"/g, '\\"');
      return `${key}: "${escaped}"`;
    }
    return full;
  });
}

function removeIncompleteMarkdownTables(content) {
  return content.replace(/(?:^\|[^\n]+\n)+/gm, (block) => {
    const lines = block.replace(/\n+$/, "").split("\n");
    if (lines.length >= 3 && /^\|[\s:|-]+\|$/.test(lines[1].trim())) {
      return block;
    }
    return "";
  });
}

function stripMarkdownLinksFromFrontMatter(content) {
  const fm = /^---\n([\s\S]*?)\n---/.exec(content);

  if (!fm) {
    return content;
  }

  const cleaned = fm[1].replace(
    /^(title|meta_description|focus_keyword):\s*(.+)$/gm,
    (_full, key, value) => {
      const stripped = value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      return `${key}: ${stripped}`;
    },
  );

  return content.replace(fm[1], cleaned);
}

function detectSourceDomain(entries) {
  const sitemap = entries.find((e) => e.entryName === "sitemap.xml");
  if (!sitemap) {
    return null;
  }
  const m = /<loc>https?:\/\/([^/<]+)/.exec(sitemap.getData().toString("utf8"));
  return m ? m[1] : null;
}

function mergeSitemap({ entries, projectRoot, sourceDomain, appHost, linkPrefix }) {
  const pkgEntry = entries.find((e) => e.entryName === "sitemap.xml");
  if (!pkgEntry) {
    return 0;
  }

  const pkgXml = pkgEntry.getData().toString("utf8");
  const targetPath = path.join(projectRoot, "public", "sitemap.xml");
  ensureDir(path.dirname(targetPath));

  let existing = fs.existsSync(targetPath)
    ? fs.readFileSync(targetPath, "utf8")
    : bootstrapSitemap(appHost);

  const existingLocs = extractLocs(existing);
  const newEntries = [];

  const urlMatches = pkgXml.matchAll(/<url>\s*([\s\S]*?)\s*<\/url>/g);

  for (const match of urlMatches) {
    const rewritten = rewriteSitemapEntry(match[1], sourceDomain, appHost, linkPrefix);
    const locMatch = /<loc>([^<]+)<\/loc>/.exec(rewritten);
    if (!locMatch) {
      continue;
    }
    const loc = locMatch[1].trim();
    if (existingLocs.includes(loc)) {
      continue;
    }
    existingLocs.push(loc);
    newEntries.push(
      `    <url>\n        ${rewritten.trim().replace(/\n/g, "\n        ")}\n    </url>`,
    );
  }

  if (newEntries.length === 0) {
    if (!fs.existsSync(targetPath)) {
      fs.writeFileSync(targetPath, existing, "utf8");
    }
    return 0;
  }

  const merged = insertBeforeUrlsetClose(existing, `\n${newEntries.join("\n")}\n`);
  fs.writeFileSync(targetPath, merged, "utf8");
  return newEntries.length;
}

function rewriteSitemapEntry(inner, sourceDomain, appHost, linkPrefix) {
  return inner.replace(/<loc>([^<]+)<\/loc>/g, (_full, raw) => {
    const url = raw.trim();
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return `<loc>${url}</loc>`;
    }

    let pathPart = parsed.pathname || "/";

    if (
      sourceDomain &&
      parsed.host === sourceDomain &&
      !pathPart.startsWith(`${linkPrefix}/`)
    ) {
      pathPart = `${linkPrefix}${pathPart === "/" ? "" : pathPart}`;
    }

    return `<loc>${parsed.protocol}//${appHost}${pathPart}</loc>`;
  });
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

function insertBeforeUrlsetClose(xml, entries) {
  if (xml.includes("</urlset>")) {
    return xml.replace("</urlset>", `${entries.trimEnd()}\n</urlset>`);
  }
  return `${xml.trimEnd()}\n${entries}\n</urlset>`;
}

function bootstrapSitemap(appHost) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
    <url>
        <loc>https://${appHost}/</loc>
        <changefreq>weekly</changefreq>
        <priority>1.0</priority>
    </url>
</urlset>`;
}

function mergeLlmsTxt({ entries, projectRoot, sourceDomain, appHost, linkPrefix }) {
  const pkgEntry = entries.find((e) => e.entryName === "llms.txt");
  if (!pkgEntry) {
    return;
  }

  const targetPath = path.join(projectRoot, "public", "llms.txt");
  ensureDir(path.dirname(targetPath));

  const rewritten = rewriteLlmsLinks(
    pkgEntry.getData().toString("utf8"),
    sourceDomain,
    appHost,
    linkPrefix,
  );

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, rewritten, "utf8");
    return;
  }

  const existing = fs.readFileSync(targetPath, "utf8");
  const existingUrls = [...existing.matchAll(/\[[^\]]+\]\(([^)]+)\)/g)].map(
    (m) => m[1],
  );
  const newLinks = [
    ...rewritten.matchAll(/^- \[[^\]]+\]\([^)]+\)(?::[^\n]*)?$/gm),
  ].map((m) => m[0]);

  const toAppend = newLinks.filter((link) => {
    const m = /\(([^)]+)\)/.exec(link);
    return m ? !existingUrls.includes(m[1]) : true;
  });

  if (toAppend.length === 0) {
    return;
  }

  let appended;
  if (existing.includes("## Imported Pages")) {
    appended = `${existing.trimEnd()}\n${toAppend.join("\n")}\n`;
  } else {
    appended = `${existing.trimEnd()}\n\n## Imported Pages\n\n${toAppend.join("\n")}\n`;
  }

  fs.writeFileSync(targetPath, appended, "utf8");
}

function rewriteLlmsLinks(content, sourceDomain, appHost, linkPrefix) {
  if (!sourceDomain) {
    return content;
  }

  return content.replace(/\((https?:\/\/[^)]+)\)/g, (full, url) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch {
      return full;
    }

    if (parsed.host !== sourceDomain) {
      return full;
    }

    let pathPart = parsed.pathname || "/";

    if (
      pathPart !== "/" &&
      pathPart !== "/sitemap.xml" &&
      !pathPart.startsWith(`${linkPrefix}/`)
    ) {
      pathPart = `${linkPrefix}${pathPart}`;
    }

    return `(https://${appHost}${pathPart})`;
  });
}

function mergeRobotsTxt({ entries, projectRoot, appHost }) {
  const targetPath = path.join(projectRoot, "public", "robots.txt");
  ensureDir(path.dirname(targetPath));

  if (fs.existsSync(targetPath)) {
    return;
  }

  const pkgEntry = entries.find((e) => e.entryName === "robots.txt");
  const sitemapLine = `Sitemap: https://${appHost}/sitemap.xml`;

  const content = pkgEntry
    ? pkgEntry
        .getData()
        .toString("utf8")
        .replace(/^Sitemap:\s*\S+/m, sitemapLine)
    : `User-agent: *\nAllow: /\n\n${sitemapLine}\n`;

  fs.writeFileSync(targetPath, content, "utf8");
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}
