import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { importCampaign } from "../src/importer.js";

let tmpRoot;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astro-pseo-import-"));
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

const PILLAR_MD = `---
title: "Pillar One"
slug: pillar-one
meta_description: "Pillar desc"
---

# Pillar One

Body content with a [self link](/pillar-one) and an [external](https://other.test/x).
`;

const SUPPORTING_MD = `---
title: "Supporting"
slug: supporting-one
meta_description: "Supporting desc"
---

Supporting body.
`;

describe("importCampaign", () => {
  it("imports markdown into pillar/supporting/research and rewrites internal links", () => {
    const zipPath = buildZip({
      "pillar/pillar-one.md": PILLAR_MD,
      "supporting/supporting-one.md": SUPPORTING_MD,
    });
    const stats = importCampaign({
      zipPath,
      projectRoot: tmpRoot,
      contentDir: "src/content/pseo",
      siteUrl: "https://destination.com",
      linkPrefix: "/learn",
    });
    expect(stats.pillar).toBe(1);
    expect(stats.supporting).toBe(1);
    expect(stats.skipped).toBe(0);

    const pillarPath = path.join(tmpRoot, "src/content/pseo/pillar/pillar-one.md");
    const body = fs.readFileSync(pillarPath, "utf8");
    expect(body).toContain("](/learn/pillar-one)");
  });

  it("skips existing files when force is false and overwrites when true", () => {
    const zipPath = buildZip({
      "pillar/pillar-one.md": PILLAR_MD,
    });
    const targetDir = path.join(tmpRoot, "src/content/pseo/pillar");
    fs.mkdirSync(targetDir, { recursive: true });
    fs.writeFileSync(path.join(targetDir, "pillar-one.md"), "existing", "utf8");

    const skip = importCampaign({
      zipPath,
      projectRoot: tmpRoot,
      siteUrl: "https://destination.com",
    });
    expect(skip.pillar).toBe(0);
    expect(skip.skipped).toBe(1);
    expect(fs.readFileSync(path.join(targetDir, "pillar-one.md"), "utf8")).toBe("existing");

    const force = importCampaign({
      zipPath,
      projectRoot: tmpRoot,
      siteUrl: "https://destination.com",
      force: true,
    });
    expect(force.pillar).toBe(1);
    expect(fs.readFileSync(path.join(targetDir, "pillar-one.md"), "utf8")).not.toBe(
      "existing",
    );
  });

  it("merges sitemap entries deduped by <loc>", () => {
    const sourceSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://source.test/pillar-one</loc></url>
  <url><loc>https://source.test/supporting-one</loc></url>
</urlset>`;
    const existingSitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://destination.com/learn/pillar-one</loc></url>
</urlset>`;

    const publicDir = path.join(tmpRoot, "public");
    fs.mkdirSync(publicDir, { recursive: true });
    fs.writeFileSync(path.join(publicDir, "sitemap.xml"), existingSitemap, "utf8");

    const zipPath = buildZip({
      "pillar/pillar-one.md": PILLAR_MD,
      "supporting/supporting-one.md": SUPPORTING_MD,
      "sitemap.xml": sourceSitemap,
    });

    const stats = importCampaign({
      zipPath,
      projectRoot: tmpRoot,
      siteUrl: "https://destination.com",
    });

    const merged = fs.readFileSync(path.join(publicDir, "sitemap.xml"), "utf8");
    const pillarHits = merged.match(
      /<loc>https:\/\/destination\.com\/learn\/pillar-one<\/loc>/g,
    );
    expect(pillarHits).toHaveLength(1);
    expect(merged).toContain(
      "<loc>https://destination.com/learn/supporting-one</loc>",
    );
    expect(stats.sitemapUrls).toBe(1);
  });

  it("fixes YAML frontmatter when content begins with a ```yaml fence", () => {
    const malformed = "```yaml\ntitle: Mismatched\nslug: weird\n```\n\nbody";
    const zipPath = buildZip({ "pillar/weird.md": malformed });
    importCampaign({
      zipPath,
      projectRoot: tmpRoot,
      siteUrl: "https://destination.com",
    });
    const out = fs.readFileSync(
      path.join(tmpRoot, "src/content/pseo/pillar/weird.md"),
      "utf8",
    );
    expect(out.startsWith("---\n")).toBe(true);
    expect(out).toContain("title: Mismatched");
  });

  it("throws when siteUrl is missing", () => {
    const zipPath = buildZip({ "pillar/a.md": PILLAR_MD });
    expect(() =>
      importCampaign({ zipPath, projectRoot: tmpRoot }),
    ).toThrow(/siteUrl is required/);
  });

  it("throws when the ZIP file does not exist", () => {
    expect(() =>
      importCampaign({
        zipPath: path.join(tmpRoot, "missing.zip"),
        projectRoot: tmpRoot,
        siteUrl: "https://destination.com",
      }),
    ).toThrow(/ZIP not found/);
  });
});
