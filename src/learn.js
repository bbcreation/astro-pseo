import { collectPages, renderArticle, renderIndex } from "./runtime.js";

const ADAPTIVE_CSS = `
<style>
  .pseo-wrap { max-width: 860px; margin: 0 auto; padding: 2.5rem 1.5rem; }
  .pseo-section { margin-bottom: 2.5rem; }
  .pseo-section-label { font-size: .6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; opacity: .4; margin-bottom: 1rem; }
  .pseo-grid { display: grid; gap: .75rem; }
  .pseo-grid-2 { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .pseo-grid-3 { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .pseo-card { display: block; padding: 1.125rem; border: 1px solid color-mix(in srgb, currentColor 8%, transparent); background: color-mix(in srgb, currentColor 3%, transparent); border-radius: .75rem; text-decoration: none; transition: border-color .15s, background .15s; }
  .pseo-card:hover { border-color: color-mix(in srgb, currentColor 20%, transparent); background: color-mix(in srgb, currentColor 6%, transparent); }
  .pseo-card-title { font-size: .9375rem; font-weight: 600; opacity: .9; }
  .pseo-card-desc { font-size: .8125rem; opacity: .5; margin-top: .375rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .pseo-empty { opacity: .4; font-size: .875rem; }
  .pseo-pagination { display: flex; align-items: center; justify-content: center; gap: .375rem; margin-top: 2.5rem; }
  .pseo-pagination a, .pseo-pagination span { display: inline-flex; align-items: center; justify-content: center; width: 2.25rem; height: 2.25rem; border: 1px solid color-mix(in srgb, currentColor 8%, transparent); border-radius: .5rem; font-size: .875rem; text-decoration: none; transition: opacity .15s, border-color .15s; opacity: .6; }
  .pseo-pagination a:hover { opacity: 1; border-color: color-mix(in srgb, currentColor 20%, transparent); }
  .pseo-pagination .pseo-current { opacity: 1; background: color-mix(in srgb, currentColor 8%, transparent); border-color: color-mix(in srgb, currentColor 20%, transparent); font-weight: 600; }
  .pseo-pagination .pseo-disabled { opacity: .25; cursor: default; }
  .pseo-back { display: inline-flex; align-items: center; gap: .375rem; font-size: .875rem; opacity: .5; text-decoration: none; margin-bottom: 2rem; transition: opacity .15s; }
  .pseo-back:hover { opacity: .8; }
  .pseo-h1 { font-size: 2rem; font-weight: 700; line-height: 1.25; margin-bottom: .375rem; }
  .pseo-meta { font-size: .8125rem; opacity: .4; margin-bottom: 2rem; }
  .pseo-prose, .pseo-prose h1,.pseo-prose h2,.pseo-prose h3,.pseo-prose h4,.pseo-prose h5,.pseo-prose h6,
  .pseo-prose p,.pseo-prose li,.pseo-prose th,.pseo-prose td,.pseo-prose blockquote,.pseo-prose strong,.pseo-prose em { color: inherit; }
  .pseo-prose a { color: inherit; text-decoration: underline; text-decoration-color: color-mix(in srgb, currentColor 40%, transparent); text-underline-offset: 3px; }
  .pseo-prose a:hover { text-decoration-color: currentColor; }
  .pseo-prose h2 { font-size: 1.25rem; font-weight: 700; margin: 2rem 0 .5rem; opacity: .95; }
  .pseo-prose h3 { font-size: 1.0625rem; font-weight: 600; margin: 1.5rem 0 .375rem; opacity: .9; }
  .pseo-prose p { margin-bottom: 1rem; opacity: .85; line-height: 1.7; }
  .pseo-prose ul,.pseo-prose ol { padding-left: 1.5rem; margin-bottom: 1rem; }
  .pseo-prose li { margin-bottom: .25rem; opacity: .85; }
  .pseo-prose li::marker { opacity: .5; }
  .pseo-prose code:not(pre > code) { background: color-mix(in srgb, currentColor 8%, transparent); border: 1px solid color-mix(in srgb, currentColor 10%, transparent); border-radius: 4px; padding: .15em .4em; font-size: .875em; }
  .pseo-prose pre { background: color-mix(in srgb, currentColor 6%, transparent); border: 1px solid color-mix(in srgb, currentColor 10%, transparent); border-radius: 8px; padding: 1.25rem; overflow-x: auto; margin-bottom: 1.25rem; }
  .pseo-prose pre code { background: none; border: none; padding: 0; }
  .pseo-prose blockquote { border-left: 3px solid color-mix(in srgb, currentColor 25%, transparent); padding-left: 1rem; opacity: .75; margin-bottom: 1rem; }
  .pseo-prose table { width: 100%; border-collapse: collapse; margin-bottom: 1.25rem; font-size: .875rem; }
  .pseo-prose th,.pseo-prose td { padding: .5rem .75rem; border: 1px solid color-mix(in srgb, currentColor 12%, transparent); text-align: left; }
  .pseo-prose th { font-weight: 600; background: color-mix(in srgb, currentColor 4%, transparent); }
  .pseo-prose hr { border: none; border-top: 1px solid color-mix(in srgb, currentColor 12%, transparent); margin: 2rem 0; }
  .pseo-prose img { max-width: 100%; border-radius: 8px; }
  @media (max-width: 600px) { .pseo-wrap { padding: 1.5rem 1rem; } .pseo-h1 { font-size: 1.625rem; } }
</style>`;

function renderHead(title, description = "") {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escHtml(title)}</title>
  ${description ? `<meta name="description" content="${escHtml(description)}">` : ""}
  ${ADAPTIVE_CSS}
</head>
<body>`;
}

function escHtml(s) {
  return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function handleLearnIndex(context, config) {
  const root = process.cwd();
  const all = collectPages(root, config.contentDir, config.frontmatter);
  const perPage = config.perPage || 15;
  const currentPage = Math.max(1, parseInt(context.url.searchParams.get("page") || "1", 10));
  const total = all.length;
  const totalPages = Math.ceil(total / perPage);
  if (totalPages > 0 && currentPage > totalPages) {
    return new Response(null, { status: 302, headers: { Location: context.url.pathname } });
  }
  const paged = all.slice((currentPage - 1) * perPage, currentPage * perPage);
  const linkPrefix = (config.linkPrefix || "/learn").replace(/\/$/, "");

  const pagination = totalPages > 1 ? renderPagination(context.url.pathname, currentPage, totalPages) : "";
  const inner = renderIndex(paged, { linkPrefix, append: pagination });

  const html = `${renderHead("Articles")}
${inner}
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

export function handleLearnShow(context, config, slug) {
  const root = process.cwd();
  if (!/^[a-z0-9][a-z0-9_-]*$/.test(slug)) {
    return new Response("Not found", { status: 404 });
  }
  const all = collectPages(root, config.contentDir, config.frontmatter);
  const page = all.find((p) => p.slug === slug);
  const linkPrefix = (config.linkPrefix || "/learn").replace(/\/$/, "");

  if (!page) {
    return new Response("Not found", { status: 404 });
  }

  const html = `${renderHead(page.title, page.description)}
<div class="pseo-wrap">
  <a class="pseo-back" href="${linkPrefix}">
    <svg width="16" height="16" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" d="M10.5 19.5 3 12m0 0 7.5-7.5M3 12h18"/></svg>
    Articles
  </a>
  <h1 class="pseo-h1">${escHtml(page.title)}</h1>
  ${page.updatedAt ? `<div class="pseo-meta">Updated: ${escHtml(page.updatedAt)}</div>` : ""}
  <div class="pseo-prose">${renderArticle(page.raw)}</div>
</div>
</body></html>`;

  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function renderPagination(pathname, current, total) {
  const from = Math.max(1, current - 2);
  const to = Math.min(total, current + 2);
  let btns = "";

  btns += current > 1
    ? `<a href="${pathname}?page=${current - 1}">←</a>`
    : `<span class="pseo-disabled">←</span>`;

  for (let i = from; i <= to; i++) {
    btns += i === current
      ? `<span class="pseo-current">${i}</span>`
      : `<a href="${pathname}?page=${i}">${i}</a>`;
  }

  btns += current < total
    ? `<a href="${pathname}?page=${current + 1}">→</a>`
    : `<span class="pseo-disabled">→</span>`;

  return `<nav class="pseo-pagination" aria-label="Pagination">${btns}</nav>`;
}
