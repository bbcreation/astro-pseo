import { definePseoConfig } from "astro-pseo/config";

export default definePseoConfig({
  site: "https://example.com",

  // Upload panel — set PSEO_UPLOAD_PASSWORD in .env to enable
  uploadPassword: process.env.PSEO_UPLOAD_PASSWORD,
  // uploadPath: "/pseo-upload",

  contentDir: "src/content/pseo",
  linkPrefix: "/learn",

  outputs: { robots: true, sitemap: true, llms: true },

  robots: {
    rules: [{ userAgent: "*", allow: ["/"], disallow: ["/admin/"] }],
  },

  llms: {
    name: "Example Site",
    description: "Resource covering the example niche.",
    sections: [
      { heading: "Pillar Pages", folder: "pillar" },
      { heading: "Supporting Pages", folder: "supporting" },
      { heading: "Research", folder: "research" },
    ],
  },

  sitemap: {
    changefreqDefault: "monthly",
    priorityDefault: 0.5,
    pillarPriority: 0.8,
    pillarChangefreq: "weekly",
  },
});
