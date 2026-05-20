import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  collectAstroRoutes,
  renderArticle,
  renderIndex,
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

describe("renderArticle", () => {
  it("strips frontmatter and the leading h1, and renders markdown", () => {
    const raw = `---
title: T
---

# Heading

Hello **world**.`;
    const out = renderArticle(raw);
    expect(out).not.toContain("---");
    expect(out).not.toMatch(/<h1[^>]*>Heading/);
    expect(out).toContain("<strong>world</strong>");
  });

  it("removes inline event handlers and javascript: hrefs", () => {
    const raw = `body

<a href="javascript:alert(1)" onclick="bad()">x</a>
`;
    const html = renderArticle(raw);
    expect(html).not.toContain("javascript:");
    expect(html).not.toMatch(/\bonclick\s*=/);
  });
});

describe("renderIndex", () => {
  it("renders sections per type with appropriate grid classes", () => {
    const html = renderIndex(
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
    const html = renderIndex([], { linkPrefix: "/learn" });
    expect(html).toContain("No articles imported yet.");
  });

  it("appends extra HTML (used for SSR pagination) inside the wrapper", () => {
    const html = renderIndex([], {
      linkPrefix: "/learn",
      append: '<nav class="pseo-pagination">x</nav>',
    });
    expect(html).toMatch(/<nav class="pseo-pagination">x<\/nav><\/div>$/);
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
});
