import fs from "node:fs";
import path from "node:path";
import { DEFAULT_FIELD_MAP } from "./config.js";

export { DEFAULT_FIELD_MAP };

const FOLDERS = ["pillar", "supporting", "research"];

/**
 * Walk the configured contentDir and return a flat list of page descriptors.
 * Recognised folders: pillar, supporting, research. Filenames map to slugs
 * when no `slug` frontmatter key is present.
 *
 * Frontmatter is parsed without a YAML dependency: top-level scalar
 * `key: value` and inline-array `key: [a, b, c]` entries are recognised.
 * Other syntaxes (nested objects, block scalars) are ignored.
 *
 * @param {string} root                          Astro project root (absolute)
 * @param {string} contentDir                    Relative to root, e.g. "src/content/pseo"
 * @param {Partial<typeof DEFAULT_FIELD_MAP>} [fieldMap]  Logical-field → frontmatter-key mapping.
 * @returns {Array<{slug: string, type: string, title: string, description: string, updatedAt: string|null, tags: string[], raw: string}>}
 */
export function collectPages(root, contentDir, fieldMap) {
  const map = { ...DEFAULT_FIELD_MAP, ...(fieldMap ?? {}) };
  const absRoot = path.resolve(root, contentDir);

  if (!fs.existsSync(absRoot)) {
    return [];
  }

  const out = [];

  for (const folder of FOLDERS) {
    const dir = path.join(absRoot, folder);

    if (!fs.existsSync(dir)) {
      continue;
    }

    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".md")) {
        continue;
      }

      const filenameSlug = file.replace(/\.md$/, "");
      const raw = fs.readFileSync(path.join(dir, file), "utf8");
      const fm = parseFrontMatter(raw);

      out.push({
        slug: stringField(fm, map.slug) || filenameSlug,
        type: folder,
        title: stringField(fm, map.title) || filenameSlug,
        description:
          stringField(fm, map.description) ||
          stringField(fm, map.focusKeyword) ||
          "",
        updatedAt: stringField(fm, map.updatedAt) || null,
        tags: arrayField(fm, "tags"),
        raw,
      });
    }
  }

  return out;
}

function stringField(fm, key) {
  const v = fm[key];
  return typeof v === "string" ? v : "";
}

function arrayField(fm, key) {
  const v = fm[key];
  return Array.isArray(v) ? v : [];
}

/**
 * Minimal scalar + inline-array frontmatter parser.
 *
 *   title: "Hello"          → { title: "Hello" }
 *   tags: [a, "b c", d]     → { tags: ["a", "b c", "d"] }
 *
 * @param {string} content
 * @returns {Record<string, string | string[]>}
 */
export function parseFrontMatter(content) {
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

    const key = m[1];
    const rawValue = m[2].trim();

    const arrayMatch = /^\[(.*)\]$/.exec(rawValue);

    if (arrayMatch) {
      result[key] = parseInlineArray(arrayMatch[1]);
      continue;
    }

    result[key] = unquote(rawValue);
  }

  return result;
}

function unquote(value) {
  if (/^".*"$/.test(value)) {
    return value.slice(1, -1).replace(/\\"/g, '"');
  }
  if (/^'.*'$/.test(value)) {
    return value.slice(1, -1);
  }
  return value;
}

function parseInlineArray(inner) {
  if (!inner.trim()) {
    return [];
  }
  return inner
    .split(",")
    .map((item) => unquote(item.trim()))
    .filter((item) => item.length > 0);
}
