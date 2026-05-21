import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importCampaign } from "../src/importer.js";
import { resolveConfig } from "../src/config.js";

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astro-pseo-fix-"));
});

afterEach(() => {
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function buildZip(entries) {
  const zip = new AdmZip();
  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content, "utf8"));
  }
  const zipPath = path.join(tmpRoot, "campaign.zip");
  zip.writeZip(zipPath);
  return zipPath;
}

function seedPublic(name, content) {
  const dir = path.join(tmpRoot, "public");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, name), content, "utf8");
}

function readPublic(name) {
  return fs.readFileSync(path.join(tmpRoot, "public", name), "utf8");
}

function readPage(type, slug) {
  return fs.readFileSync(
    path.join(tmpRoot, "src/content/pseo", type, `${slug}.md`),
    "utf8",
  );
}

function makeConfig(overrides = {}) {
  return resolveConfig({
    site: "https://destination.com",
    contentDir: "src/content/pseo",
    linkPrefix: "/learn",
    ...overrides,
  });
}

function runImport(opts) {
  const { config: configOverrides, ...rest } = opts;
  return importCampaign({
    projectRoot: tmpRoot,
    ...rest,
    config: makeConfig(configOverrides ?? {}),
  });
}

const MIN_PAGE = `---
title: "A"
slug: a
meta_description: "A page"
---
body
`;

const PAGE = (title, slug, description = "") => `---
title: "${title}"
slug: ${slug}
${description ? `meta_description: "${description}"\n` : ""}---
body
`;

// ---------------------------------------------------------------------------
// fixFrontMatter — frontmatter parser shape lock
// ---------------------------------------------------------------------------

describe("fixFrontMatter (via importCampaign)", () => {
  it("passes through clean frontmatter unchanged in key order and content", () => {
    const md = `---
title: "Clean"
slug: clean
meta_description: "Already good"
---

# Clean

Body.
`;
    runImport({ zipPath: buildZip({ "pillar/clean.md": md }) });
    const out = readPage("pillar", "clean");
    expect(out).toContain('title: "Clean"');
    expect(out).toContain("slug: clean");
    expect(out).toContain('meta_description: "Already good"');
    expect(out).toContain("# Clean");
    expect(out.startsWith("---\n")).toBe(true);
  });

  it("wraps bare ```yaml block in --- fences when no frontmatter exists", () => {
    const md = "```yaml\ntitle: Wrapped\nslug: wrapped\n```\n\nbody";
    runImport({ zipPath: buildZip({ "pillar/wrapped.md": md }) });
    const out = readPage("pillar", "wrapped");
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("title: Wrapped");
    expect(out).toContain("slug: wrapped");
    expect(out).not.toContain("```yaml");
  });

  it("merges double-fenced frontmatter (--- block + ```yaml block) by key, last wins", () => {
    const md = `---
title: "From front matter"
slug: dual
---
\`\`\`yaml
title: "From yaml block"
meta_description: "Extra"
\`\`\`

# Dual

Body.
`;
    runImport({ zipPath: buildZip({ "pillar/dual.md": md }) });
    const out = readPage("pillar", "dual");
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain('title: "From yaml block"');
    expect(out).toContain("slug: dual");
    expect(out).toContain('meta_description: "Extra"');
    expect(out).not.toContain('title: "From front matter"');
    expect(out).not.toContain("```yaml");
  });

  it("quotes YAML values containing colons to avoid parse errors", () => {
    const md = "```yaml\ntitle: How to: stop fires\nslug: colon-title\n```\n\nbody";
    runImport({ zipPath: buildZip({ "pillar/colon-title.md": md }) });
    const out = readPage("pillar", "colon-title");
    expect(out).toContain(`title: "How to: stop fires"`);
  });

  it("strips markdown links from title/meta_description/focus_keyword in frontmatter", () => {
    const md = `---
title: "[Hello](https://x.com) world"
slug: linked
meta_description: "A [link](https://y.com) inside"
focus_keyword: "no link"
---

body
`;
    runImport({ zipPath: buildZip({ "pillar/linked.md": md }) });
    const out = readPage("pillar", "linked");
    expect(out).toContain('title: "Hello world"');
    expect(out).toContain('meta_description: "A link inside"');
    expect(out).toContain('focus_keyword: "no link"');
  });
});

// ---------------------------------------------------------------------------
// sitemap — composes buildSitemapXml from filesystem state
// ---------------------------------------------------------------------------

describe("sitemap (via importCampaign)", () => {
  it("emits public/sitemap.xml covering imported pages when none exists", () => {
    runImport({ zipPath: buildZip({ "pillar/foo.md": PAGE("Foo", "foo") }) });
    const out = readPublic("sitemap.xml");
    expect(out).toContain("<urlset");
    expect(out).toContain("</urlset>");
    expect(out).toContain("<loc>https://destination.com/learn/foo</loc>");
    expect(out).toContain("<loc>https://destination.com/</loc>");
  });

  it("emits URLs at the configured site host and linkPrefix regardless of ZIP contents", () => {
    runImport({
      zipPath: buildZip({
        "pillar/foo.md": PAGE("Foo", "foo"),
        "pillar/bar.md": PAGE("Bar", "bar"),
        // The ZIP may also carry sitemap.xml/llms.txt/robots.txt from the
        // source domain; these are no longer consulted — filesystem state is
        // the source of truth.
        "sitemap.xml": `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"><url><loc>https://source.test/foo</loc></url></urlset>`,
      }),
      config: { linkPrefix: "/baza" },
    });
    const out = readPublic("sitemap.xml");
    expect(out).toContain("<loc>https://destination.com/baza/foo</loc>");
    expect(out).toContain("<loc>https://destination.com/baza/bar</loc>");
    expect(out).not.toContain("source.test");
  });

  it("preserves user-managed URLs from an existing public/sitemap.xml", () => {
    seedPublic(
      "sitemap.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://destination.com/special-landing</loc></url>
  <url><loc>https://destination.com/early-promo</loc></url>
</urlset>`,
    );
    runImport({ zipPath: buildZip({ "pillar/new.md": PAGE("New", "new") }) });
    const out = readPublic("sitemap.xml");
    expect(out).toContain("<loc>https://destination.com/special-landing</loc>");
    expect(out).toContain("<loc>https://destination.com/early-promo</loc>");
    expect(out).toContain("<loc>https://destination.com/learn/new</loc>");
  });

  it("does not duplicate URLs that the builder would also emit on its own", () => {
    seedPublic(
      "sitemap.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://destination.com/learn/dup</loc></url>
  <url><loc>https://destination.com/</loc></url>
</urlset>`,
    );
    runImport({ zipPath: buildZip({ "pillar/dup.md": PAGE("Dup", "dup") }) });
    const out = readPublic("sitemap.xml");
    expect(out.match(/<loc>https:\/\/destination\.com\/learn\/dup<\/loc>/g)).toHaveLength(1);
    expect(out.match(/<loc>https:\/\/destination\.com\/<\/loc>/g)).toHaveLength(1);
  });

  it("drops URLs that point at a different host (external entries are not preserved)", () => {
    seedPublic(
      "sitemap.xml",
      `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://destination.com/keep</loc></url>
  <url><loc>https://other.test/strip</loc></url>
</urlset>`,
    );
    runImport({ zipPath: buildZip({ "pillar/x.md": MIN_PAGE }) });
    const out = readPublic("sitemap.xml");
    expect(out).toContain("/keep");
    expect(out).not.toContain("other.test");
  });
});

// ---------------------------------------------------------------------------
// llms — preserves user sections, manages "## Imported Pages"
// ---------------------------------------------------------------------------

describe("llms (via importCampaign)", () => {
  it("emits public/llms.txt with canonical builder output when none exists", () => {
    runImport({
      zipPath: buildZip({
        "pillar/foo.md": PAGE("Foo", "foo", "Foo description"),
      }),
      config: {
        llms: { name: "MySite", description: "About my site" },
      },
    });
    const out = readPublic("llms.txt");
    expect(out).toContain("# MySite");
    expect(out).toContain("> About my site");
    expect(out).toContain("[Foo](https://destination.com/learn/foo): Foo description");
  });

  it("replaces an existing ## Imported Pages section with a fresh one and leaves other sections alone", () => {
    seedPublic(
      "llms.txt",
      `# My Site

> Custom description.

## Articles

- [Existing](https://destination.com/manual)

## Imported Pages

- [Stale](https://destination.com/learn/stale): outdated
`,
    );
    runImport({
      zipPath: buildZip({
        "pillar/new-one.md": PAGE("New One", "new-one", "first new"),
        "supporting/new-two.md": PAGE("New Two", "new-two"),
      }),
    });
    const out = readPublic("llms.txt");
    expect(out).toContain("[Existing](https://destination.com/manual)");
    expect(out).toContain("[New One](https://destination.com/learn/new-one): first new");
    expect(out).toContain("[New Two](https://destination.com/learn/new-two)");
    expect(out).not.toContain("[Stale]");
    expect(out.match(/## Imported Pages/g)?.length).toBe(1);
  });

  it("appends ## Imported Pages section when the existing file lacks one", () => {
    seedPublic(
      "llms.txt",
      `# My Site

> Custom description.

## Articles

- [Existing](https://destination.com/manual)
`,
    );
    runImport({
      zipPath: buildZip({ "pillar/first.md": PAGE("First", "first") }),
    });
    const out = readPublic("llms.txt");
    expect(out).toContain("## Imported Pages");
    expect(out).toContain("[First](https://destination.com/learn/first)");
    expect(out).toContain("[Existing](https://destination.com/manual)");
  });
});

// ---------------------------------------------------------------------------
// robots — config-driven, never overwrites user file
// ---------------------------------------------------------------------------

describe("robots (via importCampaign)", () => {
  it("preserves existing public/robots.txt without modification (user's file wins)", () => {
    const userRobots = `User-agent: *
Allow: /
Disallow: /private/

Sitemap: https://destination.com/sitemap.xml
`;
    seedPublic("robots.txt", userRobots);

    runImport({ zipPath: buildZip({ "pillar/x.md": MIN_PAGE }) });
    const out = readPublic("robots.txt");
    expect(out).toBe(userRobots);
  });

  it("writes config-derived robots.txt when none exists", () => {
    runImport({
      zipPath: buildZip({ "pillar/x.md": MIN_PAGE }),
      config: {
        robots: {
          rules: [
            { userAgent: "*", allow: ["/"], disallow: ["/api/", "/admin"] },
          ],
        },
      },
    });
    const out = readPublic("robots.txt");
    expect(out).toContain("User-agent: *");
    expect(out).toContain("Disallow: /api/");
    expect(out).toContain("Disallow: /admin");
    expect(out).toContain("Sitemap: https://destination.com/sitemap.xml");
  });

  it("emits a minimal default robots.txt when config sets no custom rules", () => {
    runImport({ zipPath: buildZip({ "pillar/x.md": MIN_PAGE }) });
    const out = readPublic("robots.txt");
    expect(out).toContain("User-agent: *");
    expect(out).toContain("Allow: /");
    expect(out).toContain("Sitemap: https://destination.com/sitemap.xml");
  });
});

// ---------------------------------------------------------------------------
// outputs flags — gate the writes
// ---------------------------------------------------------------------------

describe("outputs.{robots,sitemap,llms} flags", () => {
  it("skips sitemap write when outputs.sitemap === false", () => {
    runImport({
      zipPath: buildZip({ "pillar/x.md": MIN_PAGE }),
      config: { outputs: { sitemap: false } },
    });
    expect(fs.existsSync(path.join(tmpRoot, "public", "sitemap.xml"))).toBe(false);
  });

  it("skips llms write when outputs.llms === false", () => {
    runImport({
      zipPath: buildZip({ "pillar/x.md": MIN_PAGE }),
      config: { outputs: { llms: false } },
    });
    expect(fs.existsSync(path.join(tmpRoot, "public", "llms.txt"))).toBe(false);
  });

  it("skips robots write when outputs.robots === false", () => {
    runImport({
      zipPath: buildZip({ "pillar/x.md": MIN_PAGE }),
      config: { outputs: { robots: false } },
    });
    expect(fs.existsSync(path.join(tmpRoot, "public", "robots.txt"))).toBe(false);
  });
});
