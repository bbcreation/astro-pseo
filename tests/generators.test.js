import { describe, expect, it } from "vitest";
import { resolveConfig } from "../src/config.js";
import {
  buildLlmsTxt,
  buildRobotsTxt,
  buildSitemapXml,
} from "../src/generators.js";

function makeConfig(overrides = {}) {
  return resolveConfig({
    site: "https://example.com",
    ...overrides,
  });
}

describe("buildRobotsTxt", () => {
  it("emits user-agent rules and appends a Sitemap directive", () => {
    const out = buildRobotsTxt(
      makeConfig({
        robots: {
          rules: [
            { userAgent: "*", allow: ["/"], disallow: ["/admin/"], crawlDelay: 5 },
          ],
        },
      }),
    );
    expect(out).toContain("User-agent: *");
    expect(out).toContain("Allow: /");
    expect(out).toContain("Disallow: /admin/");
    expect(out).toContain("Crawl-delay: 5");
    expect(out).toContain("Sitemap: https://example.com/sitemap.xml");
  });

  it("omits the Sitemap directive when sitemap output is disabled", () => {
    const out = buildRobotsTxt(
      makeConfig({ outputs: { sitemap: false } }),
    );
    expect(out).not.toContain("Sitemap:");
  });
});

describe("buildSitemapXml", () => {
  const pages = [
    { slug: "foo", type: "pillar", updatedAt: "2026-04-01" },
    { slug: "bar", type: "supporting", updatedAt: null },
  ];

  it("includes home, pSEO pages, astro routes and additionalPages", () => {
    const xml = buildSitemapXml(
      makeConfig(),
      pages,
      ["/", "/about"],
      ["/contact"],
    );
    expect(xml).toContain("<loc>https://example.com/</loc>");
    expect(xml).toContain("<loc>https://example.com/about</loc>");
    expect(xml).toContain("<loc>https://example.com/contact</loc>");
    expect(xml).toContain("<loc>https://example.com/learn/foo</loc>");
    expect(xml).toContain("<loc>https://example.com/learn/bar</loc>");
  });

  it("uses linkPrefix from config when prefixing pSEO slugs", () => {
    const xml = buildSitemapXml(
      makeConfig({ linkPrefix: "/docs" }),
      pages,
    );
    expect(xml).toContain("<loc>https://example.com/docs/foo</loc>");
    expect(xml).not.toContain("<loc>https://example.com/learn/foo</loc>");
  });

  it("deduplicates URLs across sources", () => {
    const xml = buildSitemapXml(
      makeConfig(),
      pages,
      ["/learn/foo", "/about"],
      ["/about"],
    );
    const fooHits = xml.match(/<loc>https:\/\/example\.com\/learn\/foo<\/loc>/g);
    const aboutHits = xml.match(/<loc>https:\/\/example\.com\/about<\/loc>/g);
    expect(fooHits).toHaveLength(1);
    expect(aboutHits).toHaveLength(1);
  });

  it("applies pillar priority/changefreq distinct from defaults", () => {
    const xml = buildSitemapXml(makeConfig(), pages);
    const block = xml.split("<url>").find((b) => b.includes("/learn/foo</loc>")) ?? "";
    expect(block).toContain("<priority>0.8</priority>");
    expect(block).toContain("<changefreq>weekly</changefreq>");
  });

  it("falls back to today's date when a page has no updatedAt", () => {
    const xml = buildSitemapXml(
      makeConfig(),
      [{ slug: "bar", type: "supporting", updatedAt: null }],
    );
    const today = new Date().toISOString().slice(0, 10);
    expect(xml).toContain(`<lastmod>${today}</lastmod>`);
  });
});

describe("buildLlmsTxt", () => {
  it("groups pages into sections and skips empty sections", () => {
    const pages = [
      { slug: "foo", type: "pillar", title: "Foo", description: "About Foo" },
      { slug: "bar", type: "supporting", title: "Bar", description: "" },
    ];
    const out = buildLlmsTxt(
      makeConfig({ llms: { name: "Example" } }),
      pages,
    );
    expect(out.startsWith("# Example\n")).toBe(true);
    expect(out).toContain("## Pillar Pages");
    expect(out).toContain("- [Foo](https://example.com/learn/foo): About Foo");
    expect(out).toContain("## Supporting Pages");
    expect(out).toContain("- [Bar](https://example.com/learn/bar)\n");
    expect(out).not.toContain("## Research");
  });

  it("falls back to host of site when llms.name is empty", () => {
    const out = buildLlmsTxt(makeConfig(), []);
    expect(out.startsWith("# example.com\n")).toBe(true);
  });
});
