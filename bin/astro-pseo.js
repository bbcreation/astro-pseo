#!/usr/bin/env node
import path from "node:path";
import fs from "node:fs";
import { pathToFileURL } from "node:url";
import {
  importCampaign,
  writeSitemap,
  writeLlms,
  writeRobots,
} from "../src/importer.js";
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
  } else if (command === "refresh") {
    await runRefresh(args.slice(1));
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
    config,
    force,
  });

  console.log(
    `Imported: ${result.pillar} pillar, ${result.supporting} supporting, ${result.research} research`,
  );
  console.log(`Skipped (already exists): ${result.skipped}`);
  console.log(`Schema files: ${result.schemaFiles}`);
  console.log(`New sitemap URLs: ${result.sitemapUrls}`);
}

async function runRefresh(rest) {
  const projectRoot = process.cwd();
  const config = await loadUserConfig(projectRoot);
  const targets = rest.length > 0 ? rest : ["sitemap", "llms", "robots"];

  for (const kind of targets) {
    if (kind === "sitemap") {
      writeSitemap({ projectRoot, config });
      console.log("Wrote public/sitemap.xml");
    } else if (kind === "llms") {
      writeLlms({ projectRoot, config });
      console.log("Wrote public/llms.txt");
    } else if (kind === "robots") {
      writeRobots({ projectRoot, config });
      console.log("Wrote public/robots.txt (or kept existing)");
    } else {
      throw new Error(`Unknown refresh target: ${kind}`);
    }
  }
}

async function loadUserConfig(root) {
  const candidates = ["pseo.config.mjs", "pseo.config.js"];

  for (const file of candidates) {
    const abs = path.join(root, file);
    if (!fs.existsSync(abs)) continue;
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
  astro-pseo import <zip-path> [--force]    Import a pSEO campaign archive.
  astro-pseo refresh [sitemap|llms|robots]  Re-emit public/ outputs from
                                            current filesystem state. Default:
                                            all three.

Reads pseo.config.mjs / pseo.config.js from the current working directory.`);
}
