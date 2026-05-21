/**
 * Identity helper that gives users TypeScript autocomplete via JSDoc when
 * defining their pseo.config.{ts,js,mjs}. No runtime transformation.
 *
 * @template T
 * @param {T} config
 * @returns {T}
 */
export function definePseoConfig(config) {
  return config;
}

/**
 * @typedef {Object} RobotsRule
 * @property {string} userAgent
 * @property {string[]} [allow]
 * @property {string[]} [disallow]
 * @property {number} [crawlDelay]
 */

/**
 * @typedef {Object} FrontmatterMap
 * @property {string} title           Frontmatter key holding the article title. Default "title".
 * @property {string} description     Frontmatter key holding the meta description. Default "meta_description".
 * @property {string} focusKeyword    Frontmatter key holding the focus keyword (fallback for description). Default "focus_keyword".
 * @property {string} updatedAt       Frontmatter key holding the last-modified date. Default "updated_at".
 * @property {string} slug            Frontmatter key holding the URL slug (falls back to filename). Default "slug".
 */

/**
 * @typedef {Object} PseoConfig
 * @property {string} site                Absolute site URL, e.g. "https://example.com"
 * @property {string} [contentDir]        Where imported pSEO pages live (default: "src/pseo").
 *                                        Kept outside src/content/ to avoid Astro's content-collection auto-detection.
 * @property {string} [linkPrefix]        URL prefix for imported page links (default: "/learn")
 * @property {number} [perPage]           Articles per page on the index (default: 24). Pages 2+ live at `${linkPrefix}/p/<n>`.
 * @property {string} [uploadPassword]    Plain-text password for the upload panel. Leave empty to disable.
 * @property {string} [uploadPath]        URL path for the upload panel (default: "/pseo-upload")
 * @property {boolean} [contentRoutes]    Register /learn article routes. Default true.
 * @property {string} [layout]            Path to a custom Astro layout (relative to project root). Default: built-in adaptive layout.
 * @property {Partial<FrontmatterMap>} [frontmatter]  Mapping of logical fields to frontmatter key names.
 * @property {Object} [outputs]
 * @property {boolean} [outputs.robots]   Default true
 * @property {boolean} [outputs.sitemap]  Default true
 * @property {boolean} [outputs.llms]     Default true
 * @property {Object} [robots]
 * @property {RobotsRule[]} [robots.rules]
 * @property {Object} [llms]
 * @property {string} [llms.name]
 * @property {string} [llms.description]
 * @property {Array<{heading: string, folder: string}>} [llms.sections]
 * @property {Object} [sitemap]
 * @property {boolean} [sitemap.includeAstroRoutes]   Include all routes from src/pages/**. Default true.
 * @property {string[]} [sitemap.additionalPages]     Extra absolute paths to include. Default [].
 * @property {string} [sitemap.changefreqDefault]
 * @property {number} [sitemap.priorityDefault]
 * @property {string} [sitemap.pillarChangefreq]
 * @property {number} [sitemap.pillarPriority]
 */

export const DEFAULT_FIELD_MAP = Object.freeze({
  title: "title",
  description: "meta_description",
  focusKeyword: "focus_keyword",
  updatedAt: "updated_at",
  slug: "slug",
});

export const DEFAULTS = {
  contentDir: "src/pseo",
  linkPrefix: "/learn",
  perPage: 24,
  uploadPassword: "",
  uploadPath: "/pseo-upload",
  contentRoutes: true,
  frontmatter: { ...DEFAULT_FIELD_MAP },
  outputs: { robots: true, sitemap: true, llms: true },
  robots: {
    rules: [{ userAgent: "*", allow: ["/"], disallow: [] }],
  },
  llms: {
    name: "",
    description: "",
    sections: [
      { heading: "Pillar Pages", folder: "pillar" },
      { heading: "Supporting Pages", folder: "supporting" },
      { heading: "Research", folder: "research" },
    ],
  },
  sitemap: {
    includeAstroRoutes: true,
    additionalPages: [],
    changefreqDefault: "monthly",
    priorityDefault: 0.5,
    pillarChangefreq: "weekly",
    pillarPriority: 0.8,
  },
};

/**
 * Deep-merge user config over DEFAULTS. Arrays are replaced wholesale.
 *
 * @param {Partial<PseoConfig>} user
 * @returns {PseoConfig}
 */
export function resolveConfig(user) {
  const u = user ?? {};

  const merged = {
    ...DEFAULTS,
    ...u,
    outputs: { ...DEFAULTS.outputs, ...(u.outputs ?? {}) },
    robots: { ...DEFAULTS.robots, ...(u.robots ?? {}) },
    llms: { ...DEFAULTS.llms, ...(u.llms ?? {}) },
    sitemap: { ...DEFAULTS.sitemap, ...(u.sitemap ?? {}) },
    frontmatter: { ...DEFAULT_FIELD_MAP, ...(u.frontmatter ?? {}) },
    contentRoutes: u.contentRoutes ?? DEFAULTS.contentRoutes,
  };

  if (u.layout != null) {
    merged.layout = u.layout;
  }

  validate(merged);

  return merged;
}

function validate(c) {
  if (!c.site) {
    throw new Error("[astro-pseo] config.site is required (absolute URL).");
  }

  try {
    new URL(c.site);
  } catch {
    throw new Error(
      `[astro-pseo] config.site must be a valid absolute URL, got: ${c.site}`,
    );
  }

  if (c.layout !== undefined && typeof c.layout !== "string") {
    throw new Error("[astro-pseo] config.layout must be a string path or omitted.");
  }

  if (typeof c.frontmatter !== "object" || c.frontmatter === null) {
    throw new Error("[astro-pseo] config.frontmatter must be an object.");
  }

  for (const [key, value] of Object.entries(c.frontmatter)) {
    if (typeof value !== "string" || value.length === 0) {
      throw new Error(
        `[astro-pseo] config.frontmatter.${key} must be a non-empty string (frontmatter field name).`,
      );
    }
  }

  if (!Array.isArray(c.sitemap.additionalPages)) {
    throw new Error("[astro-pseo] config.sitemap.additionalPages must be an array.");
  }

  for (const entry of c.sitemap.additionalPages) {
    if (typeof entry !== "string") {
      throw new Error(
        "[astro-pseo] config.sitemap.additionalPages entries must be strings (paths).",
      );
    }
  }

  if (typeof c.sitemap.includeAstroRoutes !== "boolean") {
    throw new Error("[astro-pseo] config.sitemap.includeAstroRoutes must be a boolean.");
  }

  if (!Number.isInteger(c.perPage) || c.perPage <= 0) {
    throw new Error(
      `[astro-pseo] config.perPage must be a positive integer, got: ${c.perPage}`,
    );
  }
}
