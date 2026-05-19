import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveConfig } from "./config.js";
import { collectPages } from "./pages.js";
import {
  buildRobotsTxt,
  buildSitemapXml,
  buildLlmsTxt,
} from "./generators.js";
export { handleUploadGet, handleUploadPost } from "./upload.js";
export { handleLearnIndex, handleLearnShow } from "./learn.js";

/**
 * Astro integration entry point.
 *
 * Usage in astro.config.mjs:
 *
 *   import astroPseo from "astro-pseo";
 *   import pseoConfig from "./pseo.config.ts";
 *
 *   export default defineConfig({
 *     integrations: [astroPseo(pseoConfig)],
 *   });
 *
 * If no inline config is passed, the integration will auto-load
 * ./pseo.config.{ts,js,mjs} from the Astro project root.
 *
 * @param {Partial<import('./config.js').PseoConfig>} [inlineConfig]
 */
export default function astroPseo(inlineConfig) {
  return {
    name: "astro-pseo",
    hooks: {
      "astro:config:setup": async ({ config: astroConfig, logger, injectRoute }) => {
        const rootPath = fileURLToPath(astroConfig.root);
        const userConfig = inlineConfig ?? (await loadConfigFile(rootPath, logger));
        const config = resolveConfig(userConfig ?? {});

        if (config.outputs.robots !== false) {
          injectRoute({
            pattern: "/robots.txt",
            entrypoint: virtualEntrypoint("robots", config),
          });
        }

        if (config.outputs.sitemap !== false) {
          injectRoute({
            pattern: "/sitemap.xml",
            entrypoint: virtualEntrypoint("sitemap", config),
          });
        }

        if (config.outputs.llms !== false) {
          injectRoute({
            pattern: "/llms.txt",
            entrypoint: virtualEntrypoint("llms", config),
          });
        }

        if (config.uploadPassword) {
          const uploadPattern = config.uploadPath.startsWith("/")
            ? config.uploadPath
            : `/${config.uploadPath}`;
          injectRoute({
            pattern: uploadPattern,
            entrypoint: uploadEntrypoint(config),
          });
          logger.info(`astro-pseo: upload panel at ${uploadPattern}`);
        }

        if (config.contentRoutes !== false) {
          const linkPrefix = (config.linkPrefix || "/learn").replace(/\/$/, "");
          injectRoute({
            pattern: linkPrefix,
            entrypoint: learnIndexEntrypoint(config),
          });
          injectRoute({
            pattern: `${linkPrefix}/[slug]`,
            entrypoint: learnShowEntrypoint(config),
          });
          logger.info(`astro-pseo: article routes at ${linkPrefix} and ${linkPrefix}/[slug]`);
        }

        logger.info(
          `astro-pseo: serving${config.outputs.robots ? " /robots.txt" : ""}` +
            `${config.outputs.sitemap ? " /sitemap.xml" : ""}` +
            `${config.outputs.llms ? " /llms.txt" : ""}`,
        );
      },
    },
  };
}

/**
 * Synchronously render output by name. Exposed so the optional
 * `astro-pseo build` CLI (and tests) can produce files directly without
 * routing through Astro.
 *
 * @param {"robots"|"sitemap"|"llms"} kind
 * @param {string} root
 * @param {import('./config.js').PseoConfig} config
 * @returns {string}
 */
export function renderOutput(kind, root, config) {
  if (kind === "robots") {
    return buildRobotsTxt(config);
  }

  const pages = collectPages(root, config.contentDir);

  if (kind === "sitemap") {
    return buildSitemapXml(config, pages);
  }

  if (kind === "llms") {
    return buildLlmsTxt(config, pages);
  }

  throw new Error(`Unknown output kind: ${kind}`);
}

/**
 * Write a tiny per-kind virtual module next to the user's Astro config that
 * exports a Response. We materialise it on disk because Astro's injectRoute
 * needs a real importable file path. The file is deterministic and idempotent.
 */
function virtualEntrypoint(kind, config) {
  const cacheDir = path.resolve(process.cwd(), "node_modules/.astro-pseo");

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const filePath = path.join(cacheDir, `${kind}.js`);
  const configLiteral = JSON.stringify(config);

  const source = `
import { renderOutput } from "astro-pseo";

const CONFIG = ${configLiteral};
const KIND = ${JSON.stringify(kind)};
const CONTENT_TYPE = KIND === "sitemap" ? "application/xml" : "text/plain";

export async function GET() {
  const body = renderOutput(KIND, process.cwd(), CONFIG);
  return new Response(body, {
    headers: { "Content-Type": CONTENT_TYPE + "; charset=utf-8" },
  });
}
`.trimStart();

  fs.writeFileSync(filePath, source, "utf8");

  return filePath;
}

function uploadEntrypoint(config) {
  const cacheDir = path.resolve(process.cwd(), "node_modules/.astro-pseo");

  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }

  const filePath = path.join(cacheDir, "upload.js");
  const configLiteral = JSON.stringify(config);

  const source = `
import { handleUploadGet, handleUploadPost } from "astro-pseo";
export const prerender = false;
const CONFIG = ${configLiteral};
export async function GET(context) { return handleUploadGet(context, CONFIG); }
export async function POST(context) { return handleUploadPost(context, CONFIG); }
`.trimStart();

  fs.writeFileSync(filePath, source, "utf8");
  return filePath;
}

function learnIndexEntrypoint(config) {
  const cacheDir = path.resolve(process.cwd(), "node_modules/.astro-pseo");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, "learn-index.js");
  const configLiteral = JSON.stringify(config);
  fs.writeFileSync(filePath, `
import { handleLearnIndex } from "astro-pseo";
export const prerender = false;
const CONFIG = ${configLiteral};
export async function GET(context) { return handleLearnIndex(context, CONFIG); }
`.trimStart(), "utf8");
  return filePath;
}

function learnShowEntrypoint(config) {
  const cacheDir = path.resolve(process.cwd(), "node_modules/.astro-pseo");
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, "learn-show.js");
  const configLiteral = JSON.stringify(config);
  fs.writeFileSync(filePath, `
import { handleLearnShow } from "astro-pseo";
export const prerender = false;
const CONFIG = ${configLiteral};
export async function GET(context) { return handleLearnShow(context, CONFIG, context.params.slug); }
`.trimStart(), "utf8");
  return filePath;
}

async function loadConfigFile(root, logger) {
  const candidates = ["pseo.config.ts", "pseo.config.mjs", "pseo.config.js"];

  for (const file of candidates) {
    const abs = path.join(root, file);

    if (!fs.existsSync(abs)) {
      continue;
    }

    if (file.endsWith(".ts")) {
      logger.warn(
        `astro-pseo: found ${file} but cannot import TypeScript directly. ` +
          "Pass the config inline: astroPseo(pseoConfig), or rename to .mjs/.js.",
      );
      return null;
    }

    const mod = await import(pathToFileURL(abs).href);
    return mod.default ?? mod;
  }

  logger.warn(
    "astro-pseo: no pseo.config.{js,mjs,ts} found and no inline config passed. " +
      "Using defaults — set { site } at minimum.",
  );

  return { site: "" };
}

function fileURLToPath(u) {
  if (typeof u === "string") {
    return u;
  }
  return new URL(u).pathname;
}
