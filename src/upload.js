import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { importCampaign } from "./importer.js";

const AUTH_COOKIE = "pseo_auth";

function makeToken(password) {
  return crypto.createHmac("sha256", password).update("pseo-upload-v1").digest("hex");
}

function isAuthenticated(context, password) {
  if (!password) return false;
  const token = context.cookies.get(AUTH_COOKIE)?.value ?? "";
  return timingSafeEqual(token, makeToken(password));
}

function timingSafeEqual(a, b) {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function uploadDir(root) {
  return path.join(root, "pseo-uploads");
}

function listFiles(root) {
  const dir = uploadDir(root);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter((f) => f.endsWith(".zip")).sort();
}

/**
 * @param {import('astro').APIContext} context
 * @param {import('./config.js').PseoConfig} config
 */
export async function handleUploadGet(context, config) {
  const password = config.uploadPassword ?? "";
  const authenticated = isAuthenticated(context, password);
  const root = process.cwd();
  const files = authenticated ? listFiles(root) : [];
  const flash = context.url.searchParams.get("msg") ?? "";
  const isError = context.url.searchParams.get("err") === "1";

  return new Response(renderPage({ authenticated, files, flash, isError }), {
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

/**
 * @param {import('astro').APIContext} context
 * @param {import('./config.js').PseoConfig} config
 */
export async function handleUploadPost(context, config) {
  const password = config.uploadPassword ?? "";
  const formData = await context.request.formData();
  const action = String(formData.get("_action") ?? "");
  const basePath = context.url.pathname;

  if (action === "auth") {
    const input = String(formData.get("password") ?? "");

    if (!password) {
      return redirect(basePath, "err=1&msg=Upload+not+configured.+Set+PSEO_UPLOAD_PASSWORD.");
    }

    if (!timingSafeEqual(input, password)) {
      return redirect(basePath, "err=1&msg=Invalid+password.");
    }

    context.cookies.set(AUTH_COOKIE, makeToken(password), {
      httpOnly: true,
      sameSite: "strict",
      path: "/",
      maxAge: 86400 * 7,
    });

    return redirect(basePath, "");
  }

  if (!isAuthenticated(context, password)) {
    return redirect(basePath, "err=1&msg=Not+authenticated.");
  }

  const root = process.cwd();
  const dir = uploadDir(root);
  fs.mkdirSync(dir, { recursive: true });

  if (action === "upload") {
    const file = formData.get("zip_file");

    if (!file || typeof file === "string") {
      return redirect(basePath, "err=1&msg=No+file+selected.");
    }

    const ts = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    const filename = `pseo-${ts}.zip`;
    const buffer = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(path.join(dir, filename), buffer);

    return redirect(basePath, `msg=Uploaded:+${encodeURIComponent(filename)}`);
  }

  if (action === "import") {
    const filename = path.basename(String(formData.get("filename") ?? ""));
    const force = formData.get("force") === "1";
    const zipPath = path.join(dir, filename);

    if (!fs.existsSync(zipPath)) {
      return redirect(basePath, `err=1&msg=File+not+found:+${encodeURIComponent(filename)}`);
    }

    try {
      const stats = importCampaign({
        zipPath,
        projectRoot: root,
        contentDir: config.contentDir,
        siteUrl: config.site,
        linkPrefix: config.linkPrefix ?? "/learn",
        force,
      });

      const summary = `Import complete: ${stats.pillar} pillar, ${stats.supporting} supporting, ${stats.research} research, ${stats.skipped} skipped, ${stats.schemaFiles} schema, ${stats.sitemapUrls} sitemap URLs.`;
      return redirect(basePath, `msg=${encodeURIComponent(summary)}`);
    } catch (err) {
      return redirect(basePath, `err=1&msg=${encodeURIComponent(String(err.message))}`);
    }
  }

  if (action === "delete") {
    const filename = path.basename(String(formData.get("filename") ?? ""));
    const filePath = path.join(dir, filename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    return redirect(basePath, `msg=Deleted:+${encodeURIComponent(filename)}`);
  }

  return redirect(basePath, "err=1&msg=Unknown+action.");
}

function redirect(basePath, query) {
  const location = query ? `${basePath}?${query}` : basePath;
  return new Response(null, { status: 302, headers: { Location: location } });
}

function esc(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderPage({ authenticated, files, flash, isError }) {
  const css = `
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
      background: #080808; color: #ddd; min-height: 100vh;
      display: flex; flex-direction: column; align-items: center; padding: 2.5rem 1rem;
    }
    .wrap { width: 100%; max-width: 500px; }
    header { text-align: center; margin-bottom: 2rem; }
    header h1 { font-size: .9375rem; font-weight: 600; color: #fff; letter-spacing: -.01em; }
    header small { font-size: .75rem; color: #444; display: block; margin-top: .25rem; }
    .card { background: #111; border: 1px solid #1e1e1e; border-radius: 10px; padding: 1.5rem; margin-bottom: .75rem; }
    .section-label { font-size: .6875rem; font-weight: 700; color: #555; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 1rem; }
    .field { margin-bottom: .875rem; }
    label { display: block; font-size: .8125rem; color: #666; margin-bottom: .3125rem; }
    input[type=password], input[type=file] {
      width: 100%; background: #151515; border: 1px solid #2a2a2a; border-radius: 6px;
      padding: .5625rem .8125rem; color: #e0e0e0; font-size: .875rem;
      line-height: 1.5; transition: border-color .15s;
    }
    input[type=password]:focus { outline: none; border-color: #444; }
    input[type=file] { padding: .4375rem .5rem; color: #888; cursor: pointer; }
    input[type=file]::file-selector-button {
      background: #1e1e1e; border: 1px solid #333; border-radius: 4px;
      color: #bbb; font-size: .75rem; padding: .25rem .625rem; margin-right: .625rem; cursor: pointer;
    }
    input[type=checkbox] { width: 14px; height: 14px; accent-color: #555; cursor: pointer; flex-shrink: 0; }
    .check-row { display: flex; align-items: center; gap: .5rem; margin-top: .625rem; }
    .check-row label { margin: 0; font-size: .8125rem; color: #666; cursor: pointer; }
    .btn {
      display: inline-flex; align-items: center; justify-content: center;
      background: #1a1a1a; border: 1px solid #2e2e2e; border-radius: 6px;
      color: #ccc; font-size: .875rem; font-weight: 500;
      padding: .5625rem .875rem; cursor: pointer;
      transition: background .12s, border-color .12s, color .12s;
      white-space: nowrap; line-height: 1;
    }
    .btn:hover { background: #222; border-color: #3a3a3a; color: #fff; }
    .btn-full { display: flex; width: 100%; margin-top: .875rem; }
    .btn-sm { font-size: .75rem; padding: .3125rem .625rem; }
    .btn-del { background: transparent; border-color: #222; color: #444; font-size: .75rem; padding: .3125rem .625rem; }
    .btn-del:hover { border-color: #6b2121; color: #c0392b; background: transparent; }
    .notice { border-radius: 6px; padding: .75rem 1rem; margin-bottom: .75rem; font-size: .8125rem; line-height: 1.6; }
    .notice-ok { background: #0a130a; border: 1px solid #1f3d1f; color: #7fbf7f; }
    .notice-err { background: #130a0a; border: 1px solid #3d1f1f; color: #bf7f7f; }
    .notice pre { font-family: ui-monospace, SFMono-Regular, "Courier New", monospace; font-size: .75rem; white-space: pre-wrap; word-break: break-all; margin-top: .5rem; color: inherit; opacity: .9; }
    .file-row { display: flex; align-items: center; gap: .625rem; padding: .625rem 0; border-top: 1px solid #181818; }
    .file-row:last-child { border-bottom: 1px solid #181818; }
    .file-name { flex: 1; font-family: ui-monospace, SFMono-Regular, monospace; font-size: .75rem; color: #aaa; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .file-btns { display: flex; gap: .375rem; flex-shrink: 0; }
    .empty { font-size: .8125rem; color: #333; padding: .5rem 0; }
    @media (max-width: 480px) {
      body { padding: 1.5rem .75rem; }
      .card { padding: 1.25rem; }
      .file-row { flex-wrap: wrap; }
      .file-btns { width: 100%; }
    }
  `;

  const noticeHtml = flash
    ? `<div class="notice ${isError ? "notice-err" : "notice-ok"}"><pre>${esc(decodeURIComponent(flash.replace(/\+/g, " ")))}</pre></div>`
    : "";

  if (!authenticated) {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>pSEO Import</title>
  <style>${css}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>pSEO Import</h1>
    <small>Campaign content uploader</small>
  </header>
  ${noticeHtml}
  <div class="card">
    <div class="section-label">Access</div>
    <form method="POST">
      <input type="hidden" name="_action" value="auth">
      <div class="field">
        <label for="password">Password</label>
        <input type="password" id="password" name="password" autofocus autocomplete="current-password">
      </div>
      <button type="submit" class="btn btn-full">Unlock</button>
    </form>
  </div>
</div>
</body>
</html>`;
  }

  const fileRows = files.length
    ? files
        .map(
          (f) => `
      <div class="file-row">
        <span class="file-name">${esc(f)}</span>
        <div class="file-btns">
          <form method="POST" style="display:contents">
            <input type="hidden" name="_action" value="import">
            <input type="hidden" name="filename" value="${esc(f)}">
            <button type="submit" class="btn btn-sm">Import</button>
          </form>
          <form method="POST" style="display:contents"
                onsubmit="return confirm('Delete ${esc(f)}?')">
            <input type="hidden" name="_action" value="delete">
            <input type="hidden" name="filename" value="${esc(f)}">
            <button type="submit" class="btn btn-sm btn-del">Delete</button>
          </form>
        </div>
      </div>`,
        )
        .join("")
    : '<p class="empty">No uploaded files yet.</p>';

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>pSEO Import</title>
  <style>${css}</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>pSEO Import</h1>
    <small>Campaign content uploader</small>
  </header>
  ${noticeHtml}
  <div class="card">
    <div class="section-label">Upload Campaign ZIP</div>
    <form method="POST" enctype="multipart/form-data">
      <input type="hidden" name="_action" value="upload">
      <div class="field">
        <label for="zip_file">ZIP file (max 50 MB)</label>
        <input type="file" id="zip_file" name="zip_file" accept=".zip" required>
      </div>
      <div class="check-row">
        <input type="checkbox" id="force" name="force" value="1">
        <label for="force">Overwrite existing files (--force)</label>
      </div>
      <button type="submit" class="btn btn-full">Upload</button>
    </form>
  </div>
  <div class="card">
    <div class="section-label">Uploaded Files</div>
    ${fileRows}
  </div>
</div>
</body>
</html>`;
}
