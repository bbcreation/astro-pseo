import fs from "node:fs";
import path from "node:path";

/**
 * Walk the configured contentDir and return a flat list of page descriptors.
 * Recognised folders: pillar, supporting, research. Filenames map to slugs.
 *
 * Front matter is parsed naively (no YAML lib dep): only top-level scalar
 * key: value pairs are read. This matches what pSEO writes.
 *
 * @param {string} root            Astro project root (absolute)
 * @param {string} contentDir      Relative to root, e.g. "src/content/pseo"
 * @returns {Array<{slug: string, type: string, title: string, description: string, updatedAt: string|null, raw: string}>}
 */
export function collectPages(root, contentDir) {
  const absRoot = path.resolve(root, contentDir);

  if (!fs.existsSync(absRoot)) {
    return [];
  }

  const folders = ["pillar", "supporting", "research"];
  const out = [];

  for (const folder of folders) {
    const dir = path.join(absRoot, folder);

    if (!fs.existsSync(dir)) {
      continue;
    }

    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".md")) {
        continue;
      }

      const slug = file.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const fm = parseFrontMatter(raw);

      out.push({
        slug: fm.slug || slug,
        type: folder,
        title: fm.title || slug,
        description: fm.meta_description || fm.focus_keyword || "",
        updatedAt: fm.updated_at || fm.created_at || null,
        raw,
      });
    }
  }

  return out;
}

/**
 * Minimal "scalar key: value" front matter parser. Handles quoted values.
 *
 * @param {string} content
 * @returns {Record<string, string>}
 */
function parseFrontMatter(content) {
  const match = /^---\s*\n([\s\S]*?)\n---/.exec(content);

  if (!match) {
    return {};
  }

  const result = {};

  for (const line of match[1].split(/\r?\n/)) {
    const m = /^(\w[\w_]*):\s*(.*)$/.exec(line);

    if (!m) {
      continue;
    }

    let value = m[2].trim();

    if (/^".*"$/.test(value)) {
      value = value.slice(1, -1).replace(/\\"/g, '"');
    } else if (/^'.*'$/.test(value)) {
      value = value.slice(1, -1);
    }

    result[m[1]] = value;
  }

  return result;
}
