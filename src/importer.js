import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { collectPages } from "./pages.js";
import { collectAstroRoutes } from "./runtime.js";
import {
  buildSitemapXml,
  buildLlmsTxt,
  buildRobotsTxt,
} from "./generators.js";
import { ensureDir, hostFromUrl, normalizeLinkPrefix } from "./util.js";

/**
 * Import a pSEO campaign archive into the Astro project.
 *
 *   1. Extract pillar/*.md, supporting/*.md, research/*.md from the ZIP and
 *      write them under <projectRoot>/<contentDir>/<type>/. Optional --force.
 *   2. Copy schema/*.json verbatim into <contentDir>/schema/.
 *   3. Rewrite internal markdown links from /slug to /<linkPrefix>/<slug>.
 *   4. Re-emit public/sitemap.xml, public/llms.txt, public/robots.txt by
 *      composing generators.js builders against the filesystem state.
 *      Existing user content in these files is preserved (sitemap user URLs
 *      survive, llms.txt user sections survive, robots.txt is never
 *      overwritten when present).
 *
 * @param {Object} opts
 * @param {string} opts.zipPath        Absolute path to campaign ZIP.
 * @param {string} opts.projectRoot    Absolute project root.
 * @param {import('./config.js').PseoConfig} opts.config  Full resolved config.
 * @param {boolean} [opts.force]       Overwrite existing markdown files.
 * @returns {{pillar:number, supporting:number, research:number, skipped:number, schemaFiles:number, sitemapUrls:number}}
 */
export function importCampaign(opts) {
  const { zipPath, projectRoot, config, force = false } = opts;

  if (!fs.existsSync(zipPath)) {
    throw new Error(`ZIP not found: ${zipPath}`);
  }

  if (!config?.site) {
    throw new Error("config.site is required to rewrite absolute links.");
  }

  let zip;
  try {
    zip = new AdmZip(zipPath);
  } catch (err) {
    throw new Error(`Corrupt or unreadable ZIP: ${err.message}`);
  }
  const entries = zip.getEntries();
  const contentDir = config.contentDir;
  const contentAbs = path.resolve(projectRoot, contentDir);
  const linkPrefix = normalizeLinkPrefix(config.linkPrefix);

  ensureDir(path.join(contentAbs, "pillar"));
  ensureDir(path.join(contentAbs, "supporting"));
  ensureDir(path.join(contentAbs, "research"));
  ensureDir(path.join(contentAbs, "schema"));

  const slugMap = buildSlugMap(entries, contentAbs);
  const stats = { pillar: 0, supporting: 0, research: 0, skipped: 0 };

  for (const entry of entries) {
    const m = /^(pillar|supporting|research)\/([a-z0-9-]+)\.md$/.exec(entry.entryName);
    if (!m) continue;

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
    if (!m) continue;

    const target = path.join(contentAbs, "schema", `${m[1]}.json`);
    if (fs.existsSync(target) && !force) continue;

    fs.writeFileSync(target, entry.getData());
    schemaFiles += 1;
  }

  let sitemapUrls = 0;
  if (config.outputs?.sitemap !== false) {
    sitemapUrls = writeSitemap({ projectRoot, config });
  }
  if (config.outputs?.llms !== false) {
    writeLlms({ projectRoot, config });
  }
  if (config.outputs?.robots !== false) {
    writeRobots({ projectRoot, config });
  }

  return { ...stats, schemaFiles, sitemapUrls };
}

/**
 * Re-emit public/sitemap.xml from current filesystem state.
 * Preserves URLs already in the user's sitemap that the builder would not
 * otherwise rediscover (e.g. hand-curated landing pages whose path is not
 * present as a file under src/pages/**).
 *
 * @param {{projectRoot: string, config: import('./config.js').PseoConfig}} opts
 * @returns {number} Number of URLs added by this run (final URL count minus
 *                   the count that existed before).
 */
export function writeSitemap({ projectRoot, config }) {
  const targetPath = path.join(projectRoot, "public", "sitemap.xml");
  const siteHost = hostFromUrl(config.site);

  const previousLocs = fs.existsSync(targetPath)
    ? extractLocs(fs.readFileSync(targetPath, "utf8"))
    : [];
  const previousPaths = previousLocs
    .map((url) => urlToPath(url, siteHost))
    .filter((p) => p !== null);

  const pages = collectPages(projectRoot, config.contentDir, config.frontmatter);
  const astroRoutes = config.sitemap.includeAstroRoutes
    ? collectAstroRoutes(projectRoot)
    : [];

  const additionalPages = [...previousPaths, ...config.sitemap.additionalPages];
  if (config.contentRoutes !== false) {
    additionalPages.unshift(normalizeLinkPrefix(config.linkPrefix));
  }

  const xml = buildSitemapXml(config, pages, astroRoutes, additionalPages);
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, xml, "utf8");

  const newLocCount = extractLocs(xml).length;
  return Math.max(0, newLocCount - previousLocs.length);
}

/**
 * Re-emit public/llms.txt. When no file exists, writes the canonical
 * generator output. When a file exists, preserves user-authored sections
 * and replaces the `## Imported Pages` section with a fresh list of
 * filesystem-discovered pSEO pages (creating the section if absent).
 *
 * @param {{projectRoot: string, config: import('./config.js').PseoConfig}} opts
 */
export function writeLlms({ projectRoot, config }) {
  const targetPath = path.join(projectRoot, "public", "llms.txt");
  const pages = collectPages(projectRoot, config.contentDir, config.frontmatter);

  ensureDir(path.dirname(targetPath));

  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, buildLlmsTxt(config, pages), "utf8");
    return;
  }

  const existing = fs.readFileSync(targetPath, "utf8");
  const section = renderImportedSection(config, pages);
  const updated = replaceOrAppendSection(existing, "## Imported Pages", section);
  fs.writeFileSync(targetPath, updated, "utf8");
}

/**
 * Write public/robots.txt only when none exists. Existing user-authored
 * robots.txt is preserved unchanged.
 *
 * @param {{projectRoot: string, config: import('./config.js').PseoConfig}} opts
 */
export function writeRobots({ projectRoot, config }) {
  const targetPath = path.join(projectRoot, "public", "robots.txt");
  if (fs.existsSync(targetPath)) return;
  ensureDir(path.dirname(targetPath));
  fs.writeFileSync(targetPath, buildRobotsTxt(config), "utf8");
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildSlugMap(entries, contentAbs) {
  const map = {};

  for (const entry of entries) {
    const m = /^(?:pillar|supporting|research)\/([a-z0-9-]+)\.md$/.exec(entry.entryName);
    if (!m) continue;

    const fileSlug = m[1];
    const content = fixFrontMatter(entry.getData().toString("utf8"));
    const fmSlug = readFrontMatterSlug(content);
    map[fileSlug] = fmSlug || fileSlug;
  }

  for (const type of ["pillar", "supporting", "research"]) {
    const dir = path.join(contentAbs, type);
    if (!fs.existsSync(dir)) continue;

    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".md")) continue;

      const fileSlug = file.replace(/\.md$/, "");
      if (map[fileSlug]) continue;

      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      map[fileSlug] = readFrontMatterSlug(raw) || fileSlug;
    }
  }

  return map;
}

function readFrontMatterSlug(content) {
  const fm = /^---\s*\n([\s\S]*?)\n---/.exec(content);
  if (!fm) return null;
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
    if (m) seen[m[1]] = line;
  }
  return Object.values(seen).join("\n");
}

function quoteYamlValues(yaml) {
  return yaml.replace(/^(\w[\w_]*):\s+(.+)$/gm, (full, key, value) => {
    const v = value.trim();
    if (/^".*"$|^'.*'$/.test(v)) return full;
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
  if (!fm) return content;

  const cleaned = fm[1].replace(
    /^(title|meta_description|focus_keyword):\s*(.+)$/gm,
    (_full, key, value) => {
      const stripped = value.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
      return `${key}: ${stripped}`;
    },
  );

  return content.replace(fm[1], cleaned);
}

function extractLocs(xml) {
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}

function urlToPath(absoluteUrl, expectedHost) {
  try {
    const parsed = new URL(absoluteUrl);
    if (parsed.host !== expectedHost) return null;
    return parsed.pathname || "/";
  } catch {
    return null;
  }
}

function renderImportedSection(config, pages) {
  const site = config.site.replace(/\/$/, "");
  const linkPrefix = normalizeLinkPrefix(config.linkPrefix);
  const lines = ["## Imported Pages", ""];
  for (const page of pages) {
    const desc = page.description ? `: ${page.description}` : "";
    lines.push(`- [${page.title}](${site}${linkPrefix}/${page.slug})${desc}`);
  }
  return lines.join("\n");
}

/**
 * Replace the body of an existing `## Heading` section (everything from the
 * heading line up to the next `## ` heading or EOF). Append a new section
 * when the heading is not present. Always trims trailing whitespace before
 * appending so the file ends with a single newline.
 *
 * @param {string} content
 * @param {string} heading   e.g. "## Imported Pages"
 * @param {string} section   Full replacement starting with the heading line.
 */
function replaceOrAppendSection(content, heading, section) {
  const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`(^|\\n)${escaped}\\s*\\n[\\s\\S]*?(?=\\n## |$)`, "");
  if (re.test(content)) {
    return content.replace(re, (_match, prefix) => `${prefix}${section}`).replace(/\s*$/, "\n");
  }
  return `${content.replace(/\s*$/, "")}\n\n${section}\n`;
}
