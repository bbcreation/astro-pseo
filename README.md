# astro-pseo

Astro integration for programmatic SEO. Renders article pages, imports
campaign archives, and keeps `public/sitemap.xml`, `llms.txt`, and `robots.txt`
in sync with imported content — all from one config file. Static-prerender
only, so it ships on any static host (Cloudflare Pages, Netlify, GitHub Pages,
S3…).

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

Drop markdown files into
`src/pseo/{pillar,supporting,research}/*.md` and run `astro build`:

- `/learn` — paginated article index (24 per page by default)
- `/learn/p/2`, `/learn/p/3`, … — additional pages
- `/learn/<slug>` — article pages

The default content directory sits outside `src/content/` to avoid Astro's
content-collection auto-detection (which would error on the mixed markdown +
schema JSON files the importer writes). Override with `contentDir` if you
need a different location.

Run `astro-pseo import campaign.zip` (or upload via the panel) and the
importer also writes:

- `public/sitemap.xml` — covers the home, imported pages, your `src/pages/**`
  routes, and any URLs already in the file
- `public/llms.txt` — preserves your existing sections; manages
  `## Imported Pages` automatically
- `public/robots.txt` — written only when the file does not yet exist

## Custom layout

Point `config.layout` at any Astro layout component (path relative to the
project root). The component must include `<slot />` and accept `title` and
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

Omit `layout` and a tiny built-in adaptive layout is used; its colors inherit
from the surrounding page via `color-mix(currentColor, …)`.

**Styling is automatic, even with a custom layout.** The emitted
`/learn` templates inject the plugin's adaptive CSS via `<style is:global>`,
so cards, pagination, and prose look right whether you use the bundled
layout or your own. If you want explicit control, import the CSS string
yourself and skip the auto-inject by writing fully bespoke pages:

```js
import { ADAPTIVE_CSS } from "astro-pseo/css";
```

## Frontmatter mapping

Default keys: `title`, `meta_description`, `focus_keyword`, `updated_at`,
`slug`. Override only the ones you need:

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

Values must be non-empty strings. The importer still writes the default field
names into freshly imported markdown — if you remap them, either keep the
defaults at write-time, or run a small post-import rename script.

## How the importer writes public files

The importer is the only writer for `public/sitemap.xml`, `llms.txt`, and
`robots.txt`. It composes pure builders against the current filesystem state:

| File | Behaviour |
|---|---|
| `public/sitemap.xml` | Rebuilt every import. URLs at `config.site` host already in the file survive as `additionalPages`. URLs at other hosts are dropped. Hand-edited `<lastmod>` / `<priority>` are reset to config defaults. |
| `public/llms.txt`    | When absent, written from scratch. When present, every section the user authored is left intact; the `## Imported Pages` section is replaced (or appended) with a fresh list of filesystem pages. |
| `public/robots.txt`  | Written from `config.robots` only when no file exists. Existing user-authored `robots.txt` is never modified. |

Disable individual outputs:

```js
outputs: { robots: false, sitemap: false, llms: false },
```

Tune sitemap output:

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

# refresh public/{sitemap,llms,robots} from filesystem only (no ZIP):
npx astro-pseo refresh
npx astro-pseo refresh sitemap
```

### Upload panel

When `uploadPassword` is set (typically via `PSEO_UPLOAD_PASSWORD` env), the
upload panel is live at `/pseo-upload`. The upload route accepts POST so it
needs SSR — configure an Astro adapter and set `output: "server"` or
`"hybrid"`. The rest of the site can stay static.

### What import does

1. Extracts `pillar/*.md`, `supporting/*.md`, `research/*.md` into
   `src/content/pseo/<type>/`.
2. Extracts `schema/*.json` into `src/content/pseo/schema/`.
3. Rewrites internal markdown links from `/slug` to `${linkPrefix}/slug`.
4. Rebuilds `public/sitemap.xml`, `public/llms.txt`, `public/robots.txt`
   under the rules above.

## Configuration reference

| Key | Type | Default | Notes |
|---|---|---|---|
| `site` | `string` | **required** | Absolute URL, e.g. `https://example.com`. Validated as a parseable URL. |
| `contentDir` | `string` | `"src/pseo"` | Root for `pillar/supporting/research`. Outside `src/content/` by default. |
| `linkPrefix` | `string` | `"/learn"` | URL prefix for article routes and imported links. |
| `perPage` | `number` | `24` | Articles per page on the index. Pages 2+ live at `${linkPrefix}/p/<n>`. |
| `layout` | `string \| undefined` | built-in | Path (relative to root) of your Layout.astro. |
| `frontmatter` | `Partial<FrontmatterMap>` | pSEO defaults | Logical-field → frontmatter-key map. |
| `uploadPassword` | `string` | `""` | Empty = upload panel disabled. |
| `uploadPath` | `string` | `"/pseo-upload"` | URL path for the upload panel. |
| `contentRoutes` | `boolean` | `true` | Register `/learn` and `/learn/[slug]` routes. |
| `outputs.robots` | `boolean` | `true` | Gate the importer's write to `public/robots.txt`. |
| `outputs.sitemap` | `boolean` | `true` | Gate the importer's write to `public/sitemap.xml`. |
| `outputs.llms` | `boolean` | `true` | Gate the importer's write to `public/llms.txt`. |
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

**The upload panel returns 404 in production, or POST fails with "Invalid
request payload".** Set `output: "server"` or `"hybrid"` in `astro.config.mjs`
and install an Astro adapter. The article routes stay static either way;
only the upload endpoint needs SSR. The plugin refuses to register the
upload route when `output: "static"` is detected and logs an error at
startup.

**`/learn` is empty after `astro build`.** Check that markdown files live
under `src/content/pseo/{pillar,supporting,research}/`. The plugin walks
only those three folders.

**`config.layout` throws on build with "file does not exist".** The path is
resolved relative to the Astro project root (the same folder as
`astro.config.mjs`). Check the path.

**Custom frontmatter field shows as empty in the layout.** Map the field via
`config.frontmatter`. For example, content that uses `lede:` instead of
`meta_description:` needs `frontmatter: { description: "lede" }`.

**TypeScript config file isn't picked up.** Astro can't import `.ts` configs
at startup. Pass the config inline:
`integrations: [astroPseo(pseoConfig)]` from `astro.config.mjs`, or rename to
`pseo.config.mjs`.

## License

MIT
