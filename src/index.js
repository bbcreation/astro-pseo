/**
 * @file astro-pseo — Astro integration entry point.
 *
 * Naming conventions used across the plugin's modules:
 *   handle*  — request handlers; take an Astro APIContext, return a Response.
 *   build*   — pure functions; take config/data, return a string (HTML/XML/text).
 *   collect* — file-system walkers; return arrays of descriptors.
 *   write*   — side-effectful writers; serialise to a file under public/.
 *   import*  — orchestration around a ZIP archive.
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { resolveConfig } from "./config.js";
import { normalizeLinkPrefix } from "./util.js";
export { handleUploadGet, handleUploadPost } from "./upload.js";
export { collectAstroRoutes } from "./runtime.js";

const DEFAULT_LAYOUT_SPECIFIER = "astro-pseo/templates/defaultLayout.astro";
const CACHE_DIR = "node_modules/.astro-pseo";

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
 * If no inline config is passed, the integration auto-loads
 * ./pseo.config.{js,mjs} from the Astro project root.
 *
 * @param {Partial<import('./config.js').PseoConfig>} [inlineConfig]
 */
export default function astroPseo(inlineConfig) {
  return {
    name: "astro-pseo",
    hooks: {
      "astro:config:setup": async ({ config: astroConfig, logger, injectRoute }) => {
        const rootPath = rootPathOf(astroConfig.root);
        const userConfig = inlineConfig ?? (await loadConfigFile(rootPath, logger));
        const config = resolveConfig(userConfig ?? {});

        if (config.uploadPassword) {
          if (astroConfig.output === "static") {
            logger.error(
              "astro-pseo: uploadPassword is set but astro.config has output: 'static'. " +
                "The upload panel cannot work because Astro strips request headers in " +
                "static mode (formData() fails). Set output: 'server' or 'hybrid', or " +
                "unset uploadPassword. Upload route NOT registered.",
            );
          } else {
            registerUpload({ injectRoute, config, logger });
          }
        }

        if (config.contentRoutes !== false) {
          registerContentRoutes({ injectRoute, config, rootPath, logger });
        }
      },
    },
  };
}

/**
 * Serialize the config for inlining into a generated route entrypoint.
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

// ---------------------------------------------------------------------------
// Setup-hook subroutines
// ---------------------------------------------------------------------------

function registerUpload({ injectRoute, config, logger }) {
  const pattern = config.uploadPath.startsWith("/")
    ? config.uploadPath
    : `/${config.uploadPath}`;
  injectRoute({
    pattern,
    entrypoint: emitUploadEntrypoint(config),
  });
  logger.info(`astro-pseo: upload panel at ${pattern}`);
  logger.warn(
    "astro-pseo: upload panel requires an SSR adapter to work in production. " +
      "Set output: 'server' or 'hybrid' in astro.config, or unset uploadPassword.",
  );
}

function registerContentRoutes({ injectRoute, config, rootPath, logger }) {
  const linkPrefix = normalizeLinkPrefix(config.linkPrefix);
  const layoutSpecifier = resolveLayoutSpecifier(config, rootPath);
  const configModule = emitConfigModule(config);
  const indexFile = emitLearnIndexAstro(layoutSpecifier, configModule);
  const pageFile = emitLearnPageAstro(layoutSpecifier, configModule);
  const showFile = emitLearnShowAstro(layoutSpecifier, configModule);

  injectRoute({ pattern: linkPrefix, entrypoint: indexFile, prerender: true });
  injectRoute({
    pattern: `${linkPrefix}/p/[page]`,
    entrypoint: pageFile,
    prerender: true,
  });
  injectRoute({
    pattern: `${linkPrefix}/[slug]`,
    entrypoint: showFile,
    prerender: true,
  });
  logger.info(
    `astro-pseo: article routes at ${linkPrefix}, ${linkPrefix}/p/[page], ${linkPrefix}/[slug] (perPage: ${config.perPage})`,
  );
}

// ---------------------------------------------------------------------------
// Cache-file emitters — all funnel through writeCacheFile
// ---------------------------------------------------------------------------

function writeCacheFile(name, source) {
  const cacheDir = path.resolve(process.cwd(), CACHE_DIR);
  fs.mkdirSync(cacheDir, { recursive: true });
  const filePath = path.join(cacheDir, name);
  fs.writeFileSync(filePath, source, "utf8");
  return filePath;
}

function emitUploadEntrypoint(config) {
  const configLiteral = serializeConfigForRoute(config, { includeUploadPassword: true });
  return writeCacheFile(
    "upload.js",
    `import { handleUploadGet, handleUploadPost } from "astro-pseo";
export const prerender = false;
const CONFIG = ${configLiteral};
export async function GET(context) { return handleUploadGet(context, CONFIG); }
export async function POST(context) { return handleUploadPost(context, CONFIG); }
`,
  );
}

function emitConfigModule(config) {
  return writeCacheFile(
    "_config.js",
    `export const CONFIG = ${serializeConfigForRoute(config)};\n`,
  );
}

function emitLearnIndexAstro(layoutSpecifier, configModule) {
  const filePath = path.join(path.resolve(process.cwd(), CACHE_DIR), "learn-index.astro");
  const layoutImport = importPath(layoutSpecifier, filePath);
  const configImport = importPath(configModule, filePath);
  return writeCacheFile(
    "learn-index.astro",
    `---
import Layout from ${JSON.stringify(layoutImport)};
import { collectPages, buildIndexHtml, buildPaginationHtml } from "astro-pseo/runtime";
import { ADAPTIVE_CSS } from "astro-pseo/css";
import { CONFIG } from ${JSON.stringify(configImport)};

const all = collectPages(process.cwd(), CONFIG.contentDir, CONFIG.frontmatter);
const slice = all.slice(0, CONFIG.perPage);
const totalPages = Math.max(1, Math.ceil(all.length / CONFIG.perPage));
const inner = buildIndexHtml(slice, { linkPrefix: CONFIG.linkPrefix });
const pagination = buildPaginationHtml({
  currentPage: 1,
  totalPages,
  linkPrefix: CONFIG.linkPrefix,
});
---
<Layout title="Articles">
  <style is:global set:html={ADAPTIVE_CSS} />
  <Fragment set:html={inner} />
  <Fragment set:html={pagination} />
</Layout>
`,
  );
}

function emitLearnPageAstro(layoutSpecifier, configModule) {
  const filePath = path.join(path.resolve(process.cwd(), CACHE_DIR), "learn-page.astro");
  const layoutImport = importPath(layoutSpecifier, filePath);
  const configImport = importPath(configModule, filePath);
  return writeCacheFile(
    "learn-page.astro",
    `---
import Layout from ${JSON.stringify(layoutImport)};
import { collectPages, buildIndexHtml, buildPaginationHtml } from "astro-pseo/runtime";
import { ADAPTIVE_CSS } from "astro-pseo/css";
import { CONFIG } from ${JSON.stringify(configImport)};

export async function getStaticPaths() {
  const { collectPages: cp } = await import("astro-pseo/runtime");
  const all = cp(process.cwd(), CONFIG.contentDir, CONFIG.frontmatter);
  const totalPages = Math.ceil(all.length / CONFIG.perPage);
  const paths = [];
  for (let i = 2; i <= totalPages; i++) {
    paths.push({ params: { page: String(i) }, props: { pageNum: i, totalPages } });
  }
  return paths;
}

const { pageNum, totalPages } = Astro.props;
const all = collectPages(process.cwd(), CONFIG.contentDir, CONFIG.frontmatter);
const slice = all.slice((pageNum - 1) * CONFIG.perPage, pageNum * CONFIG.perPage);
const inner = buildIndexHtml(slice, { linkPrefix: CONFIG.linkPrefix });
const pagination = buildPaginationHtml({
  currentPage: pageNum,
  totalPages,
  linkPrefix: CONFIG.linkPrefix,
});
---
<Layout title={\`Articles — page \${pageNum}\`}>
  <style is:global set:html={ADAPTIVE_CSS} />
  <Fragment set:html={inner} />
  <Fragment set:html={pagination} />
</Layout>
`,
  );
}

function emitLearnShowAstro(layoutSpecifier, configModule) {
  const filePath = path.join(path.resolve(process.cwd(), CACHE_DIR), "learn-show.astro");
  const layoutImport = importPath(layoutSpecifier, filePath);
  const configImport = importPath(configModule, filePath);
  return writeCacheFile(
    "learn-show.astro",
    `---
import Layout from ${JSON.stringify(layoutImport)};
import { collectPages, buildArticleHtml } from "astro-pseo/runtime";
import { ADAPTIVE_CSS } from "astro-pseo/css";
import { CONFIG } from ${JSON.stringify(configImport)};
export async function getStaticPaths() {
  const pages = collectPages(process.cwd(), CONFIG.contentDir, CONFIG.frontmatter);
  return pages.map((p) => ({ params: { slug: p.slug }, props: { page: p } }));
}
const { page } = Astro.props;
const body = buildArticleHtml(page.raw);
---
<Layout title={page.title} description={page.description}>
  <style is:global set:html={ADAPTIVE_CSS} />
  <div class="pseo-wrap">
    <a class="pseo-back" href={CONFIG.linkPrefix}>← Articles</a>
    <h1 class="pseo-h1">{page.title}</h1>
    {page.updatedAt && <div class="pseo-meta">Updated: {page.updatedAt}</div>}
    <div class="pseo-prose" set:html={body} />
  </div>
</Layout>
`,
  );
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

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

function importPath(specifier, fromFile) {
  if (path.isAbsolute(specifier)) {
    const rel = path.relative(path.dirname(fromFile), specifier);
    return rel.startsWith(".") ? rel : `./${rel}`;
  }
  return specifier;
}

/**
 * Astro's `config.root` is a URL object since 4.x but the type also accepts
 * strings for backwards compatibility. Handle both without losing
 * percent-decoding semantics on file URLs.
 */
function rootPathOf(value) {
  if (typeof value === "string") return value;
  return fileURLToPath(value);
}

async function loadConfigFile(root, logger) {
  const candidates = ["pseo.config.ts", "pseo.config.mjs", "pseo.config.js"];

  for (const file of candidates) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) continue;

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
    "astro-pseo: no pseo.config.{js,mjs} found and no inline config passed. " +
      "Using defaults — set { site } at minimum.",
  );

  return { site: "" };
}
