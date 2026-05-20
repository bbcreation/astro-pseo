# astro-pseo

Astro integration that serves `robots.txt`, `sitemap.xml`, and `llms.txt`,
renders pSEO article pages, and imports campaign archives — all from a single
config file. Zero project coupling. Defaults to **static prerender** so it
ships on any static host (Cloudflare Pages, Netlify, GitHub Pages, S3…).

> Laravel parity. Mirrors [`bbcreation/laravel-pseo`](https://github.com/bbcreation/laravel-pseo):
> three fixed folders (`pillar`, `supporting`, `research`), one `linkPrefix`
> for all of them, one importer.

## Install

```bash
pnpm add astro-pseo
# or
npm install astro-pseo
```

## Quickstart

```js
// astro.config.mjs
import { defineConfig } from "astro/config";
import astroPseo from "astro-pseo";
import pseoConfig from "./pseo.config.mjs";

export default defineConfig({
  site: "https://example.com",
  output: "static",
  integrations: [astroPseo(pseoConfig)],
});
```

```js
// pseo.config.mjs
import { definePseoConfig } from "astro-pseo/config";

export default definePseoConfig({
  site: "https://example.com",
  linkPrefix: "/learn",
});
```

That's the floor. Drop markdown files into
`src/content/pseo/{pillar,supporting,research}/*.md` and run `astro build`:

- `/learn` — article index
- `/learn/<slug>` — article pages
- `/sitemap.xml`, `/robots.txt`, `/llms.txt`

## Migration from v1.x

| Change | What to do |
|---|---|
| `prerender` now defaults to `true` (was SSR-only). | If you still need SSR — `prerender: false` and keep your Astro adapter. |
| `@astrojs/sitemap` overlaps with `astro-pseo`'s sitemap. | Pick one. To use `@astrojs/sitemap`: `outputs: { sitemap: false }`. |
| Static index does not paginate. | Single `/learn` page renders every article. If you have > 500 articles, switch to `prerender: false`. |
| `frontmatter` field mapping is new. | Defaults match v1 (`meta_description`, `focus_keyword`, `updated_at`). Custom field names: see [Frontmatter mapping](#frontmatter-mapping). |
| `layout` option is new. | Default uses the built-in adaptive layout. Point at your own to match site chrome: see [Custom layout](#custom-layout). |
| `buildSitemapXml` programmatic signature changed. | Now `(config, pages, astroRoutes, additionalPages)`. Direct callers must update. |

## Custom layout

Point `config.layout` at any Astro layout component (path relative to the
project root). The component must include `<slot />` and accept `title` /
`description` props.

```js
// pseo.config.mjs
export default definePseoConfig({
  site: "https://example.com",
  layout: "./src/layouts/Layout.astro",
});
```

```astro
---
// src/layouts/Layout.astro
const { title, description } = Astro.props;
---
<!DOCTYPE html>
<html lang="en">
  <head>
    <title>{title}</title>
    {description && <meta name="description" content={description} />}
    <link rel="stylesheet" href="/styles/site.css" />
  </head>
  <body>
    <site-header />
    <main><slot /></main>
    <site-footer />
  </body>
</html>
```

Omit `layout` and `astro-pseo/templates/defaultLayout.astro` is used — a tiny
adaptive layout whose colors inherit from the surrounding page via
`color-mix(currentColor, …)`.

## Frontmatter mapping

The defaults match the Laravel pSEO importer (`title`, `meta_description`,
`focus_keyword`, `updated_at`, `slug`). If your content uses different field
names, override the keys you need:

```js
// pseo.config.mjs
export default definePseoConfig({
  site: "https://example.com",
  frontmatter: {
    description: "lede",       // instead of meta_description
    updatedAt: "lastmod",      // instead of updated_at
  },
});
```

Only the keys you provide are overridden; everything else falls back to the
defaults. Values must be non-empty strings.

## Sitemap

Defaults to a single `/sitemap.xml` covering:

- The home page (`/`)
- The article index (`${linkPrefix}`, e.g. `/learn`)
- Every static route in `src/pages/**` (`src/pages/about.astro` → `/about`).
  Dynamic segments (`[slug].astro`) are skipped because the plugin can't enumerate them.
- Every pSEO page (`${linkPrefix}/<slug>`)
- Every entry in `config.sitemap.additionalPages`

URLs are deduplicated. Tune via:

```js
sitemap: {
  includeAstroRoutes: true,     // walk src/pages/** (default: true)
  additionalPages: ["/contact"],
  changefreqDefault: "monthly",
  priorityDefault: 0.5,
  pillarChangefreq: "weekly",
  pillarPriority: 0.8,
},
```

## Import

### CLI

```bash
npx astro-pseo import ./campaign.zip
# overwrite existing markdown:
npx astro-pseo import ./campaign.zip --force
```

### Upload panel

When `uploadPassword` is set (typically via `PSEO_UPLOAD_PASSWORD` env), the
upload panel is live at `/pseo-upload`. Note: the upload panel is **always
SSR** (it accepts POST), so it requires an Astro adapter even when the rest of
the site is static.

### What import does

- Copies `pillar/*.md`, `supporting/*.md`, `research/*.md` into
  `src/content/pseo/<type>/`.
- Copies `schema/*.json`.
- Rewrites internal markdown links from `/slug` to `${linkPrefix}/slug`.
- Merges `sitemap.xml` and `llms.txt` entries (deduped).
- Writes `public/robots.txt` if absent.

## Configuration reference

| Key | Type | Default | Notes |
|---|---|---|---|
| `site` | `string` | **required** | Absolute URL, e.g. `https://example.com`. |
| `contentDir` | `string` | `"src/content/pseo"` | Root for `pillar/supporting/research`. |
| `linkPrefix` | `string` | `"/learn"` | URL prefix for article routes and imported links. |
| `prerender` | `boolean` | `true` | `false` keeps v1 SSR endpoints. |
| `layout` | `string \| undefined` | built-in | Path (relative to root) of your Layout.astro. |
| `frontmatter` | `Partial<FrontmatterMap>` | Laravel field names | Logical-field → frontmatter-key map. |
| `uploadPassword` | `string` | `""` | Empty = upload panel disabled. |
| `uploadPath` | `string` | `"/pseo-upload"` | URL path for the upload panel. |
| `contentRoutes` | `boolean` | `true` | Register `/learn` and `/learn/[slug]` routes. |
| `perPage` | `number` | `15` | SSR only. Ignored when `prerender: true`. |
| `outputs.robots` | `boolean` | `true` | Inject `/robots.txt`. |
| `outputs.sitemap` | `boolean` | `true` | Inject `/sitemap.xml`. |
| `outputs.llms` | `boolean` | `true` | Inject `/llms.txt`. |
| `sitemap.includeAstroRoutes` | `boolean` | `true` | Walk `src/pages/**` and include in sitemap. |
| `sitemap.additionalPages` | `string[]` | `[]` | Extra absolute paths to include. |
| `sitemap.changefreqDefault` | `string` | `"monthly"` | |
| `sitemap.priorityDefault` | `number` | `0.5` | |
| `sitemap.pillarChangefreq` | `string` | `"weekly"` | |
| `sitemap.pillarPriority` | `number` | `0.8` | |
| `robots.rules[]` | `RobotsRule[]` | one allow-all block | Per-user-agent crawl rules. |
| `llms.name` | `string` | host of `site` | Title line in `llms.txt`. |
| `llms.description` | `string` | `""` | Blockquote intro. |
| `llms.sections[]` | `{heading, folder}[]` | pillar/supporting/research | Page groups in `llms.txt`. |

## Troubleshooting

**The upload panel shows a 404 in production.** The upload route is SSR-only.
Either run the project with an Astro adapter (`output: "server"` or hybrid) or
leave `uploadPassword` unset and import via the CLI.

**Sitemap shows both `astro-pseo` and `@astrojs/sitemap` entries / fights with
itself.** Pick one. To use `@astrojs/sitemap`, set
`outputs: { sitemap: false }` in `pseo.config.mjs`.

**`/learn` is empty after `astro build`.** Check that markdown files live
under `src/content/pseo/{pillar,supporting,research}/`. The plugin walks only
those three folders.

**`config.layout` throws on build with "file does not exist".** The path is
resolved relative to the Astro project root (the same folder as
`astro.config.mjs`). Check the path.

**Static index has no pagination, but I want page 2.** Static mode renders
every article on a single page; `perPage` is ignored. Switch to
`prerender: false` for SSR with `?page=N`, or wait for v2.1 (planned: static
`/learn/page/[n]` routes).

**Custom frontmatter field shows as empty in the layout.** Map the field via
`config.frontmatter`. For example, content that uses `lede:` instead of
`meta_description:` needs `frontmatter: { description: "lede" }`.

**TypeScript config file isn't picked up.** Astro can't import `.ts` configs
at startup. Pass the config inline:
`integrations: [astroPseo(pseoConfig)]` from `astro.config.mjs`, or rename to
`pseo.config.mjs`.

## License

MIT
