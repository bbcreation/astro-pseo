import fs from "node:fs";
import path from "node:path";
import { marked } from "marked";

export {
  collectPages,
  parseFrontMatter,
  DEFAULT_FIELD_MAP,
} from "./pages.js";

const SECTION_LABELS = {
  pillar: "Guides",
  supporting: "Articles",
  research: "Research",
};

/**
 * Render the markdown body of a pSEO page to HTML.
 * Strips the leading h1 (the layout shows its own title) and removes
 * checkbox prefixes from list items.
 *
 * @param {string} raw  Full markdown source including frontmatter.
 * @returns {string}    Article body HTML.
 */
export function renderArticle(raw) {
  const body = raw.replace(/^---\s*\n[\s\S]*?\n---\s*\n/, "");
  let html = marked.parse(body);
  html = sanitizeHtml(html);
  html = html.replace(/<h1[^>]*>[\s\S]*?<\/h1>\s*/gi, "");
  html = html.replace(/(<li[^>]*>)\s*\[[ xX]\]\s*/gi, "$1");
  return html;
}

/**
 * Render the inner HTML of the article index — sections + grid of cards
 * wrapped in `<div class="pseo-wrap">`. Caller drops it into a Layout via
 * `set:html`; no <!doctype>/<html>/<head>/<body> emitted here.
 *
 * `options.append` lets the SSR handler add pagination markup inside the
 * wrapper without post-processing the returned string.
 *
 * @param {Array<{slug:string,type:string,title:string,description:string}>} pages
 * @param {{linkPrefix?: string, sectionLabels?: Record<string,string>, append?: string}} [options]
 * @returns {string} HTML fragment.
 */
export function renderIndex(pages, options = {}) {
  const linkPrefix = (options.linkPrefix || "/learn").replace(/\/$/, "");
  const labels = { ...SECTION_LABELS, ...(options.sectionLabels ?? {}) };

  let sectionsHtml = "";

  for (const type of ["pillar", "supporting", "research"]) {
    const items = pages.filter((p) => p.type === type);
    if (!items.length) continue;
    const cols = type === "pillar" ? "pseo-grid-2" : "pseo-grid-3";
    const cards = items
      .map(
        (p) => `
      <a href="${linkPrefix}/${escHtml(p.slug)}" class="pseo-card">
        <div class="pseo-card-title">${escHtml(p.title)}</div>
        ${p.description ? `<div class="pseo-card-desc">${escHtml(p.description)}</div>` : ""}
      </a>`,
      )
      .join("");
    sectionsHtml += `
    <div class="pseo-section">
      <div class="pseo-section-label">${escHtml(labels[type] ?? type)}</div>
      <div class="pseo-grid ${cols}">${cards}</div>
    </div>`;
  }

  if (!sectionsHtml) {
    sectionsHtml = `<p class="pseo-empty">No articles imported yet.</p>`;
  }

  return `<div class="pseo-wrap">${sectionsHtml}${options.append ?? ""}</div>`;
}

/**
 * Walk `src/pages/**` and return the user-defined static routes that the
 * sitemap should include. Skips dynamic `[param].astro` segments because the
 * plugin cannot know their parameters at sitemap generation time.
 *
 * @param {string} root  Project root (absolute).
 * @returns {string[]}   URL paths beginning with "/".
 */
export function collectAstroRoutes(root) {
  const pagesDir = path.join(root, "src", "pages");
  if (!fs.existsSync(pagesDir)) return [];
  const out = [];
  walk(pagesDir, "", out);
  return out;
}

function walk(dir, urlPrefix, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith("_")) continue;
    if (entry.isDirectory()) {
      if (/\[.*\]/.test(entry.name)) continue;
      walk(path.join(dir, entry.name), `${urlPrefix}/${entry.name}`, out);
      continue;
    }
    if (!/\.(astro|md|mdx)$/.test(entry.name)) continue;
    if (/\[.*\]/.test(entry.name)) continue;
    const base = entry.name.replace(/\.(astro|md|mdx)$/, "");
    if (base === "404" || base === "500") continue;
    const url = base === "index" ? (urlPrefix || "/") : `${urlPrefix}/${base}`;
    out.push(url);
  }
}

function sanitizeHtml(html) {
  return html
    .replace(/\bon\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]*)/gi, "")
    .replace(/href\s*=\s*["']?\s*javascript\s*:/gi, 'href="about:')
    .replace(/src\s*=\s*["']?\s*data\s*:/gi, 'src="about:');
}

function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
