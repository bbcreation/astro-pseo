import { defineConfig } from "astro/config";
import astroPseo from "astro-pseo";
import pseoConfig from "./pseo.config.mjs";

export default defineConfig({
  site: pseoConfig.site,
  output: "static",
  integrations: [astroPseo(pseoConfig)],
});
