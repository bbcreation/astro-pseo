import { describe, expect, it } from "vitest";
import {
  DEFAULTS,
  DEFAULT_FIELD_MAP,
  definePseoConfig,
  resolveConfig,
} from "../src/config.js";

describe("definePseoConfig", () => {
  it("returns the input unchanged", () => {
    const input = { site: "https://example.com" };
    expect(definePseoConfig(input)).toBe(input);
  });
});

describe("resolveConfig — defaults", () => {
  it("fills in every default key", () => {
    const c = resolveConfig({ site: "https://example.com" });
    expect(c.site).toBe("https://example.com");
    expect(c.contentDir).toBe("src/pseo");
    expect(c.linkPrefix).toBe("/learn");
    expect(c.perPage).toBe(24);
    expect(c.layout).toBeUndefined();
    expect(c.frontmatter).toEqual(DEFAULT_FIELD_MAP);
    expect(c.sitemap.includeAstroRoutes).toBe(true);
    expect(c.sitemap.additionalPages).toEqual([]);
  });

  it("merges nested keys instead of replacing the whole object", () => {
    const c = resolveConfig({
      site: "https://example.com",
      sitemap: { priorityDefault: 0.7 },
      frontmatter: { description: "lede" },
    });
    expect(c.sitemap.priorityDefault).toBe(0.7);
    expect(c.sitemap.changefreqDefault).toBe(DEFAULTS.sitemap.changefreqDefault);
    expect(c.frontmatter.description).toBe("lede");
    expect(c.frontmatter.title).toBe("title");
  });

  it("includes layout only when supplied", () => {
    expect(resolveConfig({ site: "https://x.com" }).layout).toBeUndefined();
    expect(
      resolveConfig({ site: "https://x.com", layout: "./src/Layout.astro" }).layout,
    ).toBe("./src/Layout.astro");
  });
});

describe("resolveConfig — validation", () => {
  it("throws when site is missing", () => {
    expect(() => resolveConfig({})).toThrow(/site is required/);
  });

  it("throws when layout is not a string", () => {
    expect(() =>
      resolveConfig({ site: "https://x.com", layout: 123 }),
    ).toThrow(/layout must be a string/);
  });

  it("throws when a frontmatter value is not a non-empty string", () => {
    expect(() =>
      resolveConfig({
        site: "https://x.com",
        frontmatter: { title: null },
      }),
    ).toThrow(/frontmatter\.title/);
    expect(() =>
      resolveConfig({
        site: "https://x.com",
        frontmatter: { description: "" },
      }),
    ).toThrow(/frontmatter\.description/);
  });

  it("throws when sitemap.additionalPages contains non-strings", () => {
    expect(() =>
      resolveConfig({
        site: "https://x.com",
        sitemap: { additionalPages: ["/foo", 42] },
      }),
    ).toThrow(/additionalPages entries must be strings/);
  });

  it("throws when perPage is not a positive integer", () => {
    expect(() =>
      resolveConfig({ site: "https://x.com", perPage: 0 }),
    ).toThrow(/perPage must be a positive integer/);
    expect(() =>
      resolveConfig({ site: "https://x.com", perPage: -5 }),
    ).toThrow(/perPage/);
    expect(() =>
      resolveConfig({ site: "https://x.com", perPage: 2.5 }),
    ).toThrow(/perPage/);
    expect(() =>
      resolveConfig({ site: "https://x.com", perPage: "12" }),
    ).toThrow(/perPage/);
  });

  it("accepts a custom perPage", () => {
    const c = resolveConfig({ site: "https://x.com", perPage: 12 });
    expect(c.perPage).toBe(12);
  });

  it("throws when sitemap.includeAstroRoutes is not boolean", () => {
    expect(() =>
      resolveConfig({
        site: "https://x.com",
        sitemap: { includeAstroRoutes: "true" },
      }),
    ).toThrow(/includeAstroRoutes/);
  });
});
