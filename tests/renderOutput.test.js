import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";
import { renderOutput } from "../src/index.js";

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astro-pseo-output-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function write(rel, body) {
  const abs = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, "utf8");
}

describe("renderOutput — sitemap composition", () => {
  it("includes the linkPrefix index, astro routes, pseo pages, and additional pages", () => {
    write("src/pages/index.astro", "---");
    write("src/pages/about.astro", "---");
    write("src/pages/blog/[slug].astro", "---");
    write(
      "src/content/pseo/pillar/foo.md",
      `---
title: Foo
meta_description: Foo
updated_at: 2026-04-01
---
body`,
    );

    const config = resolveConfig({
      site: "https://example.com",
      sitemap: { additionalPages: ["/extra"] },
    });
    const xml = renderOutput("sitemap", tmpRoot, config);

    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/learn</loc>");
    expect(xml).toContain("<loc>https://example.com/about</loc>");
    expect(xml).toContain("<loc>https://example.com/learn/foo</loc>");
    expect(xml).toContain("<loc>https://example.com/extra</loc>");
    expect(xml).not.toMatch(/<loc>[^<]*\[slug\][^<]*<\/loc>/);
  });

  it("omits the learn index when contentRoutes is false", () => {
    const config = resolveConfig({
      site: "https://example.com",
      contentRoutes: false,
    });
    const xml = renderOutput("sitemap", tmpRoot, config);
    expect(xml).not.toContain("<loc>https://example.com/learn</loc>");
  });

  it("skips astro routes when includeAstroRoutes is false", () => {
    write("src/pages/about.astro", "---");
    const config = resolveConfig({
      site: "https://example.com",
      sitemap: { includeAstroRoutes: false },
    });
    const xml = renderOutput("sitemap", tmpRoot, config);
    expect(xml).not.toContain("<loc>https://example.com/about</loc>");
  });

  it("renders robots and llms outputs as text", () => {
    const config = resolveConfig({ site: "https://example.com" });
    expect(renderOutput("robots", tmpRoot, config)).toMatch(/^User-agent: \*/);
    expect(renderOutput("llms", tmpRoot, config).startsWith("# example.com")).toBe(true);
  });

  it("throws on unknown output kind", () => {
    const config = resolveConfig({ site: "https://example.com" });
    expect(() => renderOutput("oops", tmpRoot, config)).toThrow(/Unknown output kind/);
  });
});
