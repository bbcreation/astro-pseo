import { describe, expect, it } from "vitest";
import { serializeConfigForRoute } from "../src/index.js";

describe("serializeConfigForRoute", () => {
  it("strips uploadPassword from serialized config by default", () => {
    const json = serializeConfigForRoute({
      site: "https://example.com",
      uploadPassword: "s3cret",
    });
    expect(json).not.toContain("s3cret");
    expect(json).not.toContain("uploadPassword");
    expect(JSON.parse(json)).toEqual({ site: "https://example.com" });
  });

  it("keeps uploadPassword when explicitly requested for upload route", () => {
    const json = serializeConfigForRoute(
      { site: "https://example.com", uploadPassword: "s3cret" },
      { includeUploadPassword: true },
    );
    expect(JSON.parse(json).uploadPassword).toBe("s3cret");
  });

  it("passes through configs without uploadPassword unchanged", () => {
    const config = { site: "https://example.com", perPage: 20 };
    const json = serializeConfigForRoute(config);
    expect(JSON.parse(json)).toEqual(config);
  });
});

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import astroPseo from "../src/index.js";

function runSetup(config, cwd) {
  const routes = [];
  const logger = { info() {}, warn() {}, error() {} };
  // generated entrypoints land in <cwd>/node_modules/.astro-pseo — fine for tests
  return astroPseo(config)
    .hooks["astro:config:setup"]({
      config: { root: pathToFileURL(cwd + "/"), output: "static" },
      logger,
      injectRoute: (r) => routes.push(r),
    })
    .then(() => routes);
}

describe("articleComponent", () => {
  it("renders the user component in the generated article route", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pseo-article-"));
    fs.mkdirSync(path.join(cwd, "src"), { recursive: true });
    fs.writeFileSync(path.join(cwd, "src", "Article.astro"), "<slot />");
    const routes = await runSetup(
      { site: "https://example.com", articleComponent: "./src/Article.astro" },
      cwd,
    );
    const show = routes.find((r) => r.pattern.endsWith("/[slug]"));
    const src = fs.readFileSync(show.entrypoint, "utf8");
    expect(src).toContain("import Article from");
    expect(src).toContain("<Article page={light(page)} body={body}");
    expect(src).not.toContain('class="pseo-back"');
  });

  it("keeps the built-in markup when not configured", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pseo-article-"));
    const routes = await runSetup({ site: "https://example.com" }, cwd);
    const show = routes.find((r) => r.pattern.endsWith("/[slug]"));
    const src = fs.readFileSync(show.entrypoint, "utf8");
    expect(src).toContain('class="pseo-back"');
    expect(src).not.toContain("import Article from");
  });

  it("throws when the component file is missing", async () => {
    const cwd = fs.mkdtempSync(path.join(os.tmpdir(), "pseo-article-"));
    await expect(
      runSetup({ site: "https://example.com", articleComponent: "./nope.astro" }, cwd),
    ).rejects.toThrow(/articleComponent points to a file that does not exist/);
  });
});
