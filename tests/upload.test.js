import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import crypto from "node:crypto";
import AdmZip from "adm-zip";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { handleUploadGet, handleUploadPost } from "../src/upload.js";

const PASSWORD = "letmein";
const CONFIG = {
  site: "https://destination.com",
  contentDir: "src/content/pseo",
  linkPrefix: "/learn",
  uploadPassword: PASSWORD,
  uploadPath: "/pseo-upload",
};

let tmpRoot;
let originalCwd;

beforeEach(() => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), "astro-pseo-upload-"));
  originalCwd = process.cwd;
  process.cwd = () => tmpRoot;
});

afterEach(() => {
  process.cwd = originalCwd;
  fs.rmSync(tmpRoot, { recursive: true, force: true });
});

function makeToken(password) {
  return crypto
    .createHmac("sha256", password)
    .update("pseo-upload-v1")
    .digest("hex");
}

function cookieJar(initial = {}) {
  const store = { ...initial };
  return {
    get(name) {
      return name in store ? { value: store[name] } : undefined;
    },
    set(name, value) {
      store[name] = value;
    },
    _store: store,
  };
}

function context({ method = "GET", body = null, contentType, cookies = {}, query = "" } = {}) {
  const url = new URL(`http://localhost/pseo-upload${query}`);
  const headers = new Headers(contentType ? { "Content-Type": contentType } : {});
  return {
    request: new Request(url, { method, body, headers }),
    url,
    cookies: cookieJar(cookies),
  };
}

function formCtx(fields, cookies = {}) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    fd.append(k, v);
  }
  return context({ method: "POST", body: fd, cookies });
}

const AUTHED = { pseo_auth: makeToken(PASSWORD) };

// ---------------------------------------------------------------------------
// GET
// ---------------------------------------------------------------------------

describe("handleUploadGet", () => {
  it("returns the login form when not authenticated", async () => {
    const res = await handleUploadGet(context(), CONFIG);
    const html = await res.text();
    expect(res.headers.get("Content-Type")).toMatch(/text\/html/);
    expect(html).toContain('name="password"');
    expect(html).not.toContain("Upload Campaign ZIP");
  });

  it("returns the file list when authenticated", async () => {
    fs.mkdirSync(path.join(tmpRoot, "pseo-uploads"), { recursive: true });
    fs.writeFileSync(path.join(tmpRoot, "pseo-uploads", "first.zip"), "x");
    const res = await handleUploadGet(context({ cookies: AUTHED }), CONFIG);
    const html = await res.text();
    expect(html).toContain("Upload Campaign ZIP");
    expect(html).toContain("first.zip");
  });
});

// ---------------------------------------------------------------------------
// POST — auth
// ---------------------------------------------------------------------------

describe("handleUploadPost — auth", () => {
  it("sets the auth cookie on correct password", async () => {
    const ctx = formCtx({ _action: "auth", password: PASSWORD });
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.status).toBe(302);
    expect(ctx.cookies._store.pseo_auth).toBe(makeToken(PASSWORD));
  });

  it("redirects with err on wrong password", async () => {
    const ctx = formCtx({ _action: "auth", password: "wrong" });
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("err=1");
    expect(res.headers.get("Location")).toContain("Invalid+password");
  });

  it("rejects auth when uploadPassword is not configured", async () => {
    const ctx = formCtx({ _action: "auth", password: "anything" });
    const res = await handleUploadPost(ctx, { ...CONFIG, uploadPassword: "" });
    expect(res.headers.get("Location")).toContain("not+configured");
  });
});

// ---------------------------------------------------------------------------
// POST — protected actions without auth
// ---------------------------------------------------------------------------

describe("handleUploadPost — auth guard", () => {
  it("redirects unauthenticated requests for upload action", async () => {
    const ctx = formCtx({ _action: "upload" });
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.headers.get("Location")).toContain("Not+authenticated");
  });

  it("redirects unauthenticated requests for delete action", async () => {
    const ctx = formCtx({ _action: "delete", filename: "x.zip" });
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.headers.get("Location")).toContain("Not+authenticated");
  });
});

// ---------------------------------------------------------------------------
// POST — upload action
// ---------------------------------------------------------------------------

describe("handleUploadPost — upload action", () => {
  it("rejects when no file is provided", async () => {
    const ctx = formCtx({ _action: "upload" }, AUTHED);
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.headers.get("Location")).toContain("No+file+selected");
  });

  it("rejects oversized uploads (>50 MB)", async () => {
    // Allocate just over the 50 MB threshold — a real Blob so FormData accepts it.
    const big = new Uint8Array(51 * 1024 * 1024);
    const fd = new FormData();
    fd.append("_action", "upload");
    fd.append("zip_file", new Blob([big]), "huge.zip");
    const ctx = context({ method: "POST", body: fd, cookies: AUTHED });
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.headers.get("Location")).toContain("too+large");
    // size guard must short-circuit before any disk write
    const dir = path.join(tmpRoot, "pseo-uploads");
    expect(fs.existsSync(dir) ? fs.readdirSync(dir) : []).toEqual([]);
  });

  it("writes a valid upload to pseo-uploads/", async () => {
    const zip = new AdmZip();
    zip.addFile("pillar/x.md", Buffer.from("---\ntitle: A\n---\nbody"));
    const buf = zip.toBuffer();
    const fd = new FormData();
    fd.append("_action", "upload");
    fd.append("zip_file", new Blob([buf]), "campaign.zip");
    const ctx = context({ method: "POST", body: fd, cookies: AUTHED });
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.headers.get("Location")).toContain("Uploaded");
    const files = fs.readdirSync(path.join(tmpRoot, "pseo-uploads"));
    expect(files.some((f) => f.startsWith("pseo-") && f.endsWith(".zip"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// POST — delete action
// ---------------------------------------------------------------------------

describe("handleUploadPost — delete action", () => {
  it("unlinks an existing file", async () => {
    const dir = path.join(tmpRoot, "pseo-uploads");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "old.zip"), "x");
    const ctx = formCtx(
      { _action: "delete", filename: "old.zip" },
      AUTHED,
    );
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.headers.get("Location")).toContain("Deleted");
    expect(fs.existsSync(path.join(dir, "old.zip"))).toBe(false);
  });

  it("silently no-ops when the file does not exist", async () => {
    const ctx = formCtx(
      { _action: "delete", filename: "ghost.zip" },
      AUTHED,
    );
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.status).toBe(302);
  });
});

// ---------------------------------------------------------------------------
// POST — error paths
// ---------------------------------------------------------------------------

describe("handleUploadPost — error paths", () => {
  it("returns 302 when POST has no form-data Content-Type", async () => {
    const url = new URL("http://localhost/pseo-upload");
    const ctx = {
      request: new Request(url, {
        method: "POST",
        body: "raw bytes",
        headers: { "Content-Type": "application/json" },
      }),
      url,
      cookies: cookieJar(),
    };
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.status).toBe(302);
    expect(res.headers.get("Location")).toContain("Invalid+request+payload");
  });

  it("redirects with err on unknown _action", async () => {
    const ctx = formCtx({ _action: "frobnicate" }, AUTHED);
    const res = await handleUploadPost(ctx, CONFIG);
    expect(res.headers.get("Location")).toContain("Unknown+action");
  });
});
