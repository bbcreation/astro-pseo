#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import { importCampaign } from "../src/importer.js";
import { renderOutput } from "../src/index.js";
import { resolveConfig } from "../src/config.js";

const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  printHelp();
  process.exit(0);
}

try {
  if (command === "import") {
    await runImport(args.slice(1));
  } else if (command === "build") {
    await runBuild(args.slice(1));
  } else {
    console.error(`Unknown command: ${command}`);
    printHelp();
    process.exit(1);
  }
} catch (err) {
  console.error(`astro-pseo: ${err.message}`);
  process.exit(1);
}

async function runImport(rest) {
  const zipPath = rest.find((a) => !a.startsWith("--"));
  const force = rest.includes("--force");

  if (!zipPath) {
    throw new Error("Usage: astro-pseo import <zip-path> [--force]");
  }

  const projectRoot = process.cwd();
  const config = await loadUserConfig(projectRoot);

  const result = importCampaign({
    zipPath: path.resolve(projectRoot, zipPath),
    projectRoot,
    contentDir: config.contentDir,
    siteUrl: config.site,
    force,
  });

  console.log(
    `Imported: ${result.pillar} pillar, ${result.supporting} supporting, ${result.research} research`,
  );
  console.log(`Skipped (already exists): ${result.skipped}`);
  console.log(`Schema files: ${result.schemaFiles}`);
  console.log(`New sitemap URLs: ${result.sitemapUrls}`);
}

async function runBuild(rest) {
  const projectRoot = process.cwd();
  const config = await loadUserConfig(projectRoot);
  const outDir = path.join(projectRoot, "public");

  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const targets = rest.length > 0 ? rest : ["robots", "sitemap", "llms"];
  const filenames = { robots: "robots.txt", sitemap: "sitemap.xml", llms: "llms.txt" };

  for (const kind of targets) {
    if (!filenames[kind]) {
      throw new Error(`Unknown output kind: ${kind}`);
    }
    const body = renderOutput(kind, projectRoot, config);
    fs.writeFileSync(path.join(outDir, filenames[kind]), body, "utf8");
    console.log(`Wrote public/${filenames[kind]}`);
  }
}

async function loadUserConfig(root) {
  const candidates = ["pseo.config.mjs", "pseo.config.js"];

  for (const file of candidates) {
    const abs = path.join(root, file);

    if (!fs.existsSync(abs)) {
      continue;
    }

    const mod = await import(pathToFileURL(abs).href);
    return resolveConfig(mod.default ?? mod);
  }

  throw new Error(
    "Config not found. Create pseo.config.mjs (or .js) at the project root. " +
      "TypeScript configs must be imported inline via astro.config.mjs.",
  );
}

function printHelp() {
  console.log(`astro-pseo — pSEO integration for Astro

Usage:
  astro-pseo import <zip-path> [--force]   Import a pSEO campaign archive.
  astro-pseo build [robots|sitemap|llms]   Write outputs to public/ (default: all).

Reads pseo.config.mjs / pseo.config.js from the current working directory.`);
}
