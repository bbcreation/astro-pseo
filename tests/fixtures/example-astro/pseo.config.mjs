import { definePseoConfig } from "astro-pseo/config";

export default definePseoConfig({
  site: "https://example.com",
  contentDir: "src/content/pseo",
  linkPrefix: "/learn",
  prerender: true,
  sitemap: {
    includeAstroRoutes: true,
    additionalPages: ["/manual-extra"],
  },
  llms: {
    name: "Example Fixture",
    description: "Smoke-test fixture for the astro-pseo plugin.",
  },
});
