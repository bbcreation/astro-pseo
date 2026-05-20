import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  DEFAULT_FIELD_MAP,
  collectPages,
  parseFrontMatter,
} from "../src/pages.js";

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astro-pseo-pages-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function writeMd(rel, body) {
  const abs = path.join(tmpRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, body, "utf8");
}

describe("parseFrontMatter", () => {
  it("returns {} when no frontmatter header is present", () => {
    expect(parseFrontMatter("just body")).toEqual({});
  });

  it("reads scalar string values with quoting variants", () => {
    const fm = parseFrontMatter(`---
title: "Hello"
focus: 'world'
plain: just-text
---
body`);
    expect(fm).toMatchObject({ title: "Hello", focus: "world", plain: "just-text" });
  });

  it("parses inline arrays as string lists", () => {
    const fm = parseFrontMatter(`---
tags: [seo, "static sites", landing]
empty: []
---
body`);
    expect(fm.tags).toEqual(["seo", "static sites", "landing"]);
    expect(fm.empty).toEqual([]);
  });
});

describe("collectPages", () => {
  it("returns [] when the content directory does not exist", () => {
    expect(collectPages(tmpRoot, "src/content/pseo")).toEqual([]);
  });

  it("walks all three known folders and skips others", () => {
    writeMd(
      "content/pillar/a.md",
      `---
title: A
meta_description: "About A"
updated_at: 2026-01-02
---
body A`,
    );
    writeMd(
      "content/supporting/b.md",
      `---
title: B
---
body B`,
    );
    writeMd(
      "content/research/c.md",
      `---
title: C
---
body C`,
    );
    writeMd("content/other/x.md", "should be ignored");

    const pages = collectPages(tmpRoot, "content");
    const types = pages.map((p) => p.type).sort();
    expect(types).toEqual(["pillar", "research", "supporting"]);
    const a = pages.find((p) => p.slug === "a");
    expect(a).toMatchObject({ title: "A", description: "About A", updatedAt: "2026-01-02" });
  });

  it("falls back to focusKeyword when description field is empty", () => {
    writeMd(
      "content/pillar/a.md",
      `---
title: A
focus_keyword: "fallback desc"
---
body`,
    );
    const [page] = collectPages(tmpRoot, "content");
    expect(page.description).toBe("fallback desc");
  });

  it("honours a custom fieldMap (e.g. description: lede)", () => {
    writeMd(
      "content/pillar/a.md",
      `---
title: A
lede: "landing description"
lastmod: 2026-05-01
---
body`,
    );
    const [page] = collectPages(tmpRoot, "content", {
      description: "lede",
      updatedAt: "lastmod",
    });
    expect(page.description).toBe("landing description");
    expect(page.updatedAt).toBe("2026-05-01");
  });

  it("uses the slug frontmatter when present, filename otherwise", () => {
    writeMd(
      "content/pillar/file-name.md",
      `---
slug: custom-slug
title: A
---
body`,
    );
    writeMd("content/pillar/no-slug.md", "no frontmatter");
    const pages = collectPages(tmpRoot, "content").sort((a, b) =>
      a.slug.localeCompare(b.slug),
    );
    expect(pages.map((p) => p.slug)).toEqual(["custom-slug", "no-slug"]);
  });

  it("exposes DEFAULT_FIELD_MAP for downstream consumers", () => {
    expect(DEFAULT_FIELD_MAP.title).toBe("title");
    expect(DEFAULT_FIELD_MAP.description).toBe("meta_description");
  });
});
