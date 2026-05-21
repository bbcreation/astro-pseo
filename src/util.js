/**
 * Shared helpers. Keep this file small and free of any imports from other
 * `src/*.js` modules so it can be required from anywhere without risking
 * cycles.
 */

import fs from "node:fs";

/**
 * Escape a string for safe insertion into HTML text nodes and attribute
 * values. Single quotes are intentionally not escaped — use {@link escXml}
 * when emitting XML attributes that may use single quotes as delimiters.
 *
 * @param {unknown} s
 * @returns {string}
 */
export function escHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Escape a string for safe insertion into XML text nodes and attribute
 * values. Adds `&apos;` on top of {@link escHtml} so single-quoted XML
 * attributes are also safe.
 *
 * @param {unknown} s
 * @returns {string}
 */
export function escXml(s) {
  return escHtml(s).replace(/'/g, "&apos;");
}

/**
 * Normalise a configured linkPrefix. Returns the prefix without a trailing
 * slash, defaulting to `"/learn"` when the input is falsy. Centralises the
 * default and the strip rule so callers don't drift.
 *
 * @param {string|undefined|null} prefix
 * @returns {string}
 */
export function normalizeLinkPrefix(prefix) {
  return (prefix || "/learn").replace(/\/$/, "");
}

/**
 * Extract the `host` part of an absolute URL. Returns the raw input when
 * parsing fails — callers tolerate either a hostname or the original string.
 *
 * @param {string} url
 * @returns {string}
 */
export function hostFromUrl(url) {
  try {
    return new URL(url).host;
  } catch {
    return url;
  }
}

/**
 * Create a directory recursively. No-op if it already exists.
 *
 * @param {string} dir
 */
export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}
