import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { resolveConfig, DEFAULTS } from "./config.js";
import { collectPages } from "./pages.js";
import { collectAstroRoutes } from "./runtime.js";
import {
  buildRobotsTxt,
  buildSitemapXml,
  buildLlmsTxt,
} from "./generators.js";
export { handleUploadGet, handleUploadPost } from "./upload.js";
export { handleLearnIndex, handleLearnShow } from "./learn.js";
export { collectAstroRoutes } from "./runtime.js";

const DEFAULT_LAYOUT_SPECIFIER = "astro-pseo/templates/defaultLayout.astro";

/**
 * Astro integration entry point.
 *
 * Usage in astro.config.mjs:
 *
 *   import astroPseo from "astro-pseo";
 *   import pseoConfig from "./pseo.config.mjs";
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

        const prerender = config.prerender !== false;
        const linkPrefix = (config.linkPrefix || "/learn").replace(/\/$/, "");

        if (prerender && config.perPage !== DEFAULTS.perPage) {
          logger.warn(
            "astro-pseo: perPage is ignored when prerender is true. Switch to prerender: false for paginated SSR, or accept single-page index.",
          );
        }

        const layoutSpecifier = resolveLayoutSpecifier(config, rootPath);

        if (config.outputs.robots !== false) {
          injectOutputRoute(injectRoute, "/robots.txt", "robots", config, prerender);
        }

        if (config.outputs.sitemap !== false) {
          injectOutputRoute(injectRoute, "/sitemap.xml", "sitemap", config, prerender);
        }

        if (config.outputs.llms !== false) {
          injectOutputRoute(injectRoute, "/llms.txt", "llms", config, prerender);
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
          if (prerender) {
            const cacheDir = ensureCacheDir();
            const configModule = emitConfigModule(cacheDir, config);
            const indexFile = emitLearnIndexAstro(cacheDir, layoutSpecifier, configModule);
            const showFile = emitLearnShowAstro(cacheDir, layoutSpecifier, configModule);
            injectRoute({ pattern: linkPrefix, entrypoint: indexFile, prerender: true });
            injectRoute({ pattern: `${linkPrefix}/[slug]`, entrypoint: showFile, prerender: true });
          } else {
            injectRoute({
              pattern: linkPrefix,
              entrypoint: learnIndexEntrypoint(config),
            });
            injectRoute({
              pattern: `${linkPrefix}/[slug]`,
              entrypoint: learnShowEntrypoint(config),
            });
          }
          logger.info(
            `astro-pseo: article routes at ${linkPrefix} and ${linkPrefix}/[slug] (${prerender ? "static" : "SSR"})`,
          );
        }

        logger.info(
          `astro-pseo: serving${config.outputs.robots ? " /robots.txt" : ""}` +
            `${config.outputs.sitemap ? " /sitemap.xml" : ""}` +
            `${config.outputs.llms ? " /llms.txt" : ""}` +
            ` (${prerender ? "static" : "SSR"})`,
        );
      },
    },
  };
}

/**
 * Synchronously render output by name. Exposed so the optional
 * `astro-pseo build` CLI and tests can produce files directly without
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

  const pages = collectPages(root, config.contentDir, config.frontmatter);

  if (kind === "sitemap") {
    const astroRoutes = config.sitemap.includeAstroRoutes
      ? collectAstroRoutes(root)
      : [];
    const additionalPages = [...config.sitemap.additionalPages];
    if (config.contentRoutes !== false) {
      additionalPages.unshift((config.linkPrefix || "/learn").replace(/\/$/, ""));
    }
    return buildSitemapXml(config, pages, astroRoutes, additionalPages);
  }

  if (kind === "llms") {
    return buildLlmsTxt(config, pages);
  }

  throw new Error(`Unknown output kind: ${kind}`);
}

function resolveLayoutSpecifier(config, rootPath) {
  if (config.layout == null) {
    return DEFAULT_LAYOUT_SPECIFIER;
  }
  const abs = path.resolve(rootPath, config.layout);
  if (!fs.existsSync(abs)) {
    throw new Error(
      `[astro-pseo] config.layout points to a file that does not exist: ${abs}`,
    );
  }
  return abs;
}

function ensureCacheDir() {
  const cacheDir = path.resolve(process.cwd(), "node_modules/.astro-pseo");
  if (!fs.existsSync(cacheDir)) {
    fs.mkdirSync(cacheDir, { recursive: true });
  }
  return cacheDir;
}

function injectOutputRoute(injectRoute, pattern, kind, config, prerender) {
  const route = {
    pattern,
    entrypoint: virtualEntrypoint(kind, config, prerender),
  };
  if (prerender) {
    route.prerender = true;
  }
  injectRoute(route);
}

/**
 * Serialize the config object for inlining into a generated route entrypoint.
 * Strips `uploadPassword` unless explicitly opted in, so the secret never
 * lands in static prerender output or in modules read by client-side code.
 *
 * @param {import('./config.js').PseoConfig} config
 * @param {{ includeUploadPassword?: boolean }} [options]
 * @returns {string} JSON literal suitable for embedding in source.
 */
export function serializeConfigForRoute(config, options = {}) {
  if (options.includeUploadPassword) return JSON.stringify(config);
  const { uploadPassword: _omit, ...safe } = config;
  return JSON.stringify(safe);
}

/**
 * Write a tiny per-kind virtual module that exports a `GET()` returning a
 * Response. Astro picks it up via `injectRoute`; in static mode the same
 * endpoint runs once at build and its body is emitted as the static file.
 */
function virtualEntrypoint(kind, config, prerender) {
  const cacheDir = ensureCacheDir();
  const filePath = path.join(cacheDir, `${kind}.js`);
  const configLiteral = serializeConfigForRoute(config);
  const prerenderLine = prerender ? "export const prerender = true;\n" : "export const prerender = false;\n";

  const source = `${prerenderLine}import { renderOutput } from "astro-pseo";

const CONFIG = ${configLiteral};
const KIND = ${JSON.stringify(kind)};
const CONTENT_TYPE = KIND === "sitemap" ? "application/xml" : "text/plain";

export async function GET() {
  const body = renderOutput(KIND, process.cwd(), CONFIG);
  return new Response(body, {
    headers: { "Content-Type": CONTENT_TYPE + "; charset=utf-8" },
  });
}
`;

  fs.writeFileSync(filePath, source, "utf8");

  return filePath;
}

function uploadEntrypoint(config) {
  const cacheDir = ensureCacheDir();
  const filePath = path.join(cacheDir, "upload.js");
  const configLiteral = serializeConfigForRoute(config, { includeUploadPassword: true });

  const source = `import { handleUploadGet, handleUploadPost } from "astro-pseo";
export const prerender = false;
const CONFIG = ${configLiteral};
export async function GET(context) { return handleUploadGet(context, CONFIG); }
export async function POST(context) { return handleUploadPost(context, CONFIG); }
`;

  fs.writeFileSync(filePath, source, "utf8");
  return filePath;
}

function learnIndexEntrypoint(config) {
  const cacheDir = ensureCacheDir();
  const filePath = path.join(cacheDir, "learn-index.js");
  const configLiteral = serializeConfigForRoute(config);
  fs.writeFileSync(
    filePath,
    `import { handleLearnIndex } from "astro-pseo";
export const prerender = false;
const CONFIG = ${configLiteral};
export async function GET(context) { return handleLearnIndex(context, CONFIG); }
`,
    "utf8",
  );
  return filePath;
}

function learnShowEntrypoint(config) {
  const cacheDir = ensureCacheDir();
  const filePath = path.join(cacheDir, "learn-show.js");
  const configLiteral = serializeConfigForRoute(config);
  fs.writeFileSync(
    filePath,
    `import { handleLearnShow } from "astro-pseo";
export const prerender = false;
const CONFIG = ${configLiteral};
export async function GET(context) { return handleLearnShow(context, CONFIG, context.params.slug); }
`,
    "utf8",
  );
  return filePath;
}

function emitConfigModule(cacheDir, config) {
  const filePath = path.join(cacheDir, "_config.js");
  fs.writeFileSync(
    filePath,
    `export const CONFIG = ${serializeConfigForRoute(config)};\n`,
    "utf8",
  );
  return filePath;
}

function emitLearnIndexAstro(cacheDir, layoutSpecifier, configModule) {
  const filePath = path.join(cacheDir, "learn-index.astro");
  const layoutImport = importPath(layoutSpecifier, filePath);
  const configImport = importPath(configModule, filePath);

  const source = `---
import Layout from ${JSON.stringify(layoutImport)};
import { collectPages, renderIndex } from "astro-pseo/runtime";
import { CONFIG } from ${JSON.stringify(configImport)};
const pages = collectPages(process.cwd(), CONFIG.contentDir, CONFIG.frontmatter);
const inner = renderIndex(pages, { linkPrefix: CONFIG.linkPrefix });
---
<Layout title="Articles">
  <Fragment set:html={inner} />
</Layout>
`;

  fs.writeFileSync(filePath, source, "utf8");
  return filePath;
}

function emitLearnShowAstro(cacheDir, layoutSpecifier, configModule) {
  const filePath = path.join(cacheDir, "learn-show.astro");
  const layoutImport = importPath(layoutSpecifier, filePath);
  const configImport = importPath(configModule, filePath);

  const source = `---
import Layout from ${JSON.stringify(layoutImport)};
import { collectPages, renderArticle } from "astro-pseo/runtime";
import { CONFIG } from ${JSON.stringify(configImport)};
export async function getStaticPaths() {
  const pages = collectPages(process.cwd(), CONFIG.contentDir, CONFIG.frontmatter);
  return pages.map((p) => ({ params: { slug: p.slug }, props: { page: p } }));
}
const { page } = Astro.props;
const linkPrefix = (CONFIG.linkPrefix || "/learn").replace(/\\/$/, "");
const body = renderArticle(page.raw);
---
<Layout title={page.title} description={page.description}>
  <div class="pseo-wrap">
    <a class="pseo-back" href={linkPrefix}>← Articles</a>
    <h1 class="pseo-h1">{page.title}</h1>
    {page.updatedAt && <div class="pseo-meta">Updated: {page.updatedAt}</div>}
    <div class="pseo-prose" set:html={body} />
  </div>
</Layout>
`;

  fs.writeFileSync(filePath, source, "utf8");
  return filePath;
}

function importPath(specifier, fromFile) {
  if (path.isAbsolute(specifier)) {
    const rel = path.relative(path.dirname(fromFile), specifier);
    return rel.startsWith(".") ? rel : `./${rel}`;
  }
  return specifier;
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
