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
 * @typedef {Object} PseoConfig
 * @property {string} site                Absolute site URL, e.g. "https://example.com"
 * @property {string} [contentDir]        Where imported pSEO pages live (default: "src/content/pseo")
 * @property {string} [linkPrefix]        URL prefix for imported page links (default: "/learn")
 * @property {string} [uploadPassword]    Plain-text password for the upload panel. Leave empty to disable.
 * @property {string} [uploadPath]        URL path for the upload panel (default: "/pseo-upload")
 * @property {boolean} [contentRoutes]  Register /learn article routes. Default true.
 * @property {number}  [perPage]        Articles per page. Default 15.
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
 * @property {string} [sitemap.changefreqDefault]
 * @property {number} [sitemap.priorityDefault]
 * @property {string} [sitemap.pillarChangefreq]
 * @property {number} [sitemap.pillarPriority]
 */

export const DEFAULTS = {
  contentDir: "src/content/pseo",
  linkPrefix: "/learn",
  uploadPassword: "",
  uploadPath: "/pseo-upload",
  contentRoutes: true,
  perPage: 15,
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
  const merged = {
    ...DEFAULTS,
    ...user,
    outputs: { ...DEFAULTS.outputs, ...(user.outputs ?? {}) },
    robots: { ...DEFAULTS.robots, ...(user.robots ?? {}) },
    llms: { ...DEFAULTS.llms, ...(user.llms ?? {}) },
    sitemap: { ...DEFAULTS.sitemap, ...(user.sitemap ?? {}) },
    contentRoutes: user.contentRoutes ?? DEFAULTS.contentRoutes,
    perPage: user.perPage ?? DEFAULTS.perPage,
  };

  if (!merged.site) {
    throw new Error("[astro-pseo] config.site is required (absolute URL).");
  }

  return merged;
}
