import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectAstroRoutes,
  buildArticleHtml,
  buildIndexHtml,
  buildPaginationHtml,
} from "../src/runtime.js";

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astro-pseo-runtime-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function write(rel, body) {
  const abs = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, "utf8");
}

describe("buildArticleHtml", () => {
  it("strips frontmatter and the leading h1, and renders markdown", () => {
    const raw = `---
title: T
---

# Heading

Hello **world**.`;
    const out = buildArticleHtml(raw);
    expect(out).not.toContain("---");
    expect(out).not.toMatch(/<h1[^>]*>Heading/);
    expect(out).toContain("<strong>world</strong>");
  });

  it("removes inline event handlers and javascript: hrefs", () => {
    const raw = `body

<a href="javascript:alert(1)" onclick="bad()">x</a>
`;
    const html = buildArticleHtml(raw);
    expect(html).not.toContain("javascript:");
    expect(html).not.toMatch(/\bonclick\s*=/);
  });
});

describe("buildIndexHtml", () => {
  it("renders sections per type with appropriate grid classes", () => {
    const html = buildIndexHtml(
      [
        { slug: "p", type: "pillar", title: "P", description: "Pd" },
        { slug: "s", type: "supporting", title: "S", description: "" },
      ],
      { linkPrefix: "/docs" },
    );
    expect(html).toContain('href="/docs/p"');
    expect(html).toContain('href="/docs/s"');
    expect(html).toContain("pseo-grid-2");
    expect(html).toContain("pseo-grid-3");
    expect(html).toContain("Pd");
  });

  it("returns an empty-state markup when no pages match", () => {
    const html = buildIndexHtml([], { linkPrefix: "/learn" });
    expect(html).toContain("No articles imported yet.");
  });

  it("appends extra HTML (used for SSR pagination) inside the wrapper", () => {
    const html = buildIndexHtml([], {
      linkPrefix: "/learn",
      append: '<nav class="pseo-pagination">x</nav>',
    });
    expect(html).toMatch(/<nav class="pseo-pagination">x<\/nav><\/div>$/);
  });
});

describe("buildPaginationHtml", () => {
  it("returns empty string when only one page exists", () => {
    expect(buildPaginationHtml({ currentPage: 1, totalPages: 1, linkPrefix: "/learn" })).toBe("");
    expect(buildPaginationHtml({ currentPage: 1, totalPages: 0, linkPrefix: "/learn" })).toBe("");
  });

  it("links to /linkPrefix for page 1 and /linkPrefix/p/N for the rest", () => {
    const html = buildPaginationHtml({ currentPage: 1, totalPages: 5, linkPrefix: "/learn" });
    // 5-page window centred on current; on page 1 that's pages 1..3
    expect(html).toContain('<span class="pseo-current">1</span>');
    expect(html).toContain('<a href="/learn/p/2">2</a>');
    expect(html).toContain('<a href="/learn/p/3">3</a>');
    expect(html).toContain('<a href="/learn/p/2">→</a>');
    expect(html).toContain('<span class="pseo-disabled">←</span>');
  });

  it("on a middle page emits a 5-page window centred on the current page", () => {
    const html = buildPaginationHtml({ currentPage: 5, totalPages: 10, linkPrefix: "/learn" });
    expect(html).toContain('<a href="/learn/p/3">3</a>');
    expect(html).toContain('<a href="/learn/p/4">4</a>');
    expect(html).toContain('<span class="pseo-current">5</span>');
    expect(html).toContain('<a href="/learn/p/6">6</a>');
    expect(html).toContain('<a href="/learn/p/7">7</a>');
    expect(html).toContain('<a href="/learn/p/4">←</a>');
    expect(html).toContain('<a href="/learn/p/6">→</a>');
  });

  it("uses the home link prefix for page 1 in the window (not /learn/p/1)", () => {
    const html = buildPaginationHtml({ currentPage: 2, totalPages: 3, linkPrefix: "/learn" });
    expect(html).toContain('<a href="/learn">1</a>');
    expect(html).not.toContain('/learn/p/1');
  });

  it("respects a non-default linkPrefix", () => {
    const html = buildPaginationHtml({ currentPage: 1, totalPages: 2, linkPrefix: "/baza" });
    expect(html).toContain('<a href="/baza/p/2">2</a>');
  });

  it("disables next on the last page and back on the first", () => {
    const last = buildPaginationHtml({ currentPage: 3, totalPages: 3, linkPrefix: "/learn" });
    expect(last).toContain('<span class="pseo-disabled">→</span>');
    expect(last).not.toContain('disabled">←');

    const first = buildPaginationHtml({ currentPage: 1, totalPages: 3, linkPrefix: "/learn" });
    expect(first).toContain('<span class="pseo-disabled">←</span>');
    expect(first).not.toContain('disabled">→');
  });
});

describe("collectAstroRoutes", () => {
  it("returns [] when src/pages does not exist", () => {
    expect(collectAstroRoutes(tmpRoot)).toEqual([]);
  });

  it("maps file layouts to URLs and skips dynamic segments", () => {
    write("src/pages/index.astro", "---");
    write("src/pages/about.astro", "---");
    write("src/pages/blog/index.astro", "---");
    write("src/pages/blog/post-one.astro", "---");
    write("src/pages/blog/[slug].astro", "---");
    write("src/pages/docs/[...slug].astro", "---");
    write("src/pages/readme.txt", "ignored");

    const routes = collectAstroRoutes(tmpRoot).sort();
    expect(routes).toEqual(["/", "/about", "/blog", "/blog/post-one"]);
  });

  it("respects nested directories with dynamic-segment skip", () => {
    write("src/pages/learn/[slug]/index.astro", "---");
    write("src/pages/learn/index.astro", "---");
    expect(collectAstroRoutes(tmpRoot).sort()).toEqual(["/learn"]);
  });

  it("skips error pages, underscore-prefixed files and directories", () => {
    write("src/pages/index.astro", "---");
    write("src/pages/about.astro", "---");
    write("src/pages/404.astro", "---");
    write("src/pages/500.astro", "---");
    write("src/pages/_partial.astro", "---");
    write("src/pages/_components/widget.astro", "---");
    write("src/pages/[slug].astro", "---");

    const routes = collectAstroRoutes(tmpRoot).sort();
    expect(routes).toEqual(["/", "/about"]);
  });
});
