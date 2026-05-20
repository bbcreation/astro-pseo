# Changelog

## 2.0.0 — 2026-05-20

### Added

- **Static prerender mode** (default). Plugin emits real `.astro` routes via
  `injectRoute({ ..., prerender: true })` so pSEO pages are rendered at build
  time. Compatible with `output: "static"` and static-only hosts.
- **Custom layout pickup** via `config.layout` (path to user's `Layout.astro`).
  The layout receives `title`, `description` props and renders the article body
  via `<slot />`. Falls back to the built-in adaptive layout when omitted.
- **Frontmatter field mapping** via `config.frontmatter`. Projects that don't
  use the Laravel pSEO field names can map logical fields (e.g.
  `description: "lede"`, `updatedAt: "lastmod"`).
- **Sitemap covers the whole site** via `config.sitemap.includeAstroRoutes`
  (default true). The plugin walks `src/pages/**` and merges those routes with
  pSEO pages and `config.sitemap.additionalPages`. Entries are deduped by URL.
- **Vitest suite** under `tests/` covering config, pages, generators, runtime,
  importer, and `renderOutput`. New `tests/fixtures/example-astro/` smoke
  fixture builds end-to-end via `astro build`.

### Breaking

- `config.prerender` default is now `true` (was `false` in v1.x). Projects that
  rely on the v1 SSR endpoints must set `prerender: false` and keep an Astro
  SSR adapter. Static landings should leave the default and drop the adapter.
- `@astrojs/sitemap` is no longer additive — its output overlaps with
  `astro-pseo`'s `/sitemap.xml`. Pick one or set `config.outputs.sitemap: false`.
- `config.perPage` is ignored when `prerender: true` — the static index renders
  every article on a single page. Use `prerender: false` for paginated SSR.
- `buildSitemapXml` signature changed: it now accepts
  `(config, pages, astroRoutes, additionalPages)`. Direct callers must update.
