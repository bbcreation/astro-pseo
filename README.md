# astro-pseo

Astro integration that generates `robots.txt`, `sitemap.xml`, and `llms.txt`
from a single config file — and imports pSEO campaign archives into your
Astro content collection.

Standalone. No dependency on the parent pSEO project at runtime.

## Install

```bash
npm install astro-pseo
# or
pnpm add astro-pseo
```

## Minimum .env

```env
PSEO_UPLOAD_PASSWORD=your_password_here
```

## All .env options

| Variable | Default | Description |
|---|---|---|
| `PSEO_UPLOAD_PASSWORD` | `""` | Password for the upload panel. Empty = disabled. |
| `PSEO_CONTENT_ROUTES` | `true` | Set to `false` to disable `/learn` article routes. |
| `PSEO_PER_PAGE` | `15` | Articles per page on the `/learn` index. |

## What it does

1. Injects `/robots.txt`, `/sitemap.xml`, `/llms.txt` as SSR routes.
2. Reads `src/content/pseo/{pillar,supporting,research}/*.md` for sitemap, llms.txt, and article routes.
3. Upload panel at `/pseo-upload` (when password is set) — accepts campaign ZIPs.
4. Article index at `/learn` with pagination; article detail at `/learn/[slug]`.
5. All routes are SSR (`prerender = false`) — compatible with `output: "server"` or `output: "hybrid"`.

## Import

### CLI

```bash
npx astro-pseo import ./campaign-12.zip
# overwrite existing markdown:
npx astro-pseo import ./campaign-12.zip --force
```

### Upload panel

When `uploadPassword` is set, open `/pseo-upload` in your browser, enter the password, upload a ZIP and click **Import**.

### What import does

- Copies `pillar/*.md`, `supporting/*.md`, `research/*.md` into `src/content/pseo/<type>/`.
- Copies `schema/*.json` into `src/content/pseo/schema/`.
- Rewrites internal markdown links from `/slug` to `{linkPrefix}/slug`.
- Merges sitemap entries into `public/sitemap.xml` (deduped by `<loc>`).
- Appends new links to `public/llms.txt` under an `## Imported Pages` heading.
- Writes `public/robots.txt` if it doesn't already exist.

## Advanced config

Create `pseo.config.mjs` at the project root:

```js
import { definePseoConfig } from "astro-pseo/config";

export default definePseoConfig({
  site: "https://example.com",

  uploadPassword: process.env.PSEO_UPLOAD_PASSWORD,
  // uploadPath: "/pseo-upload",  // default

  contentDir: "src/content/pseo",
  linkPrefix: "/learn",

  contentRoutes: true,  // set false to disable /learn routes
  perPage: 15,

  outputs: { robots: true, sitemap: true, llms: true },

  robots: {
    rules: [
      { userAgent: "*", allow: ["/"], disallow: ["/admin/"] },
    ],
  },

  llms: {
    name: "Example Site",
    description: "Resource covering the example niche.",
    sections: [
      { heading: "Pillar Pages", folder: "pillar" },
      { heading: "Supporting Pages", folder: "supporting" },
      { heading: "Research", folder: "research" },
    ],
  },

  sitemap: {
    changefreqDefault: "monthly",
    priorityDefault: 0.5,
    pillarPriority: 0.8,
    pillarChangefreq: "weekly",
  },
});
```

Register in `astro.config.mjs`:

```js
import { defineConfig } from "astro/config";
import astroPseo from "astro-pseo";
import pseoConfig from "./pseo.config.mjs";

export default defineConfig({
  site: "https://example.com",
  output: "server",
  integrations: [astroPseo(pseoConfig)],
});
```

### Configuration reference

| Key | Type | Default | Notes |
|---|---|---|---|
| `site` | `string` | **required** | Absolute URL, e.g. `https://example.com`. |
| `contentDir` | `string` | `"src/content/pseo"` | Where imported pages live. |
| `linkPrefix` | `string` | `"/learn"` | URL prefix for article routes and imported page links. |
| `uploadPassword` | `string` | `""` | Plain-text password for the upload panel. Empty = disabled. |
| `uploadPath` | `string` | `"/pseo-upload"` | URL path for the upload panel. |
| `contentRoutes` | `boolean` | `true` | Register `/learn` and `/learn/[slug]` routes. |
| `perPage` | `number` | `15` | Articles per page on the index. |
| `outputs.robots` | `boolean` | `true` | Inject `/robots.txt` route. |
| `outputs.sitemap` | `boolean` | `true` | Inject `/sitemap.xml` route. |
| `outputs.llms` | `boolean` | `true` | Inject `/llms.txt` route. |
| `robots.rules[]` | `RobotsRule[]` | one allow-all block | Per-user-agent crawl rules. |
| `llms.name` | `string` | host of `site` | Title line in `llms.txt`. |
| `llms.description` | `string` | `""` | Blockquote intro. |
| `llms.sections[]` | `{heading, folder}[]` | pillar/supporting/research | Page groups in `llms.txt`. |
| `sitemap.changefreqDefault` | `string` | `"monthly"` | |
| `sitemap.priorityDefault` | `number` | `0.5` | |
| `sitemap.pillarChangefreq` | `string` | `"weekly"` | |
| `sitemap.pillarPriority` | `number` | `0.8` | |

## License

MIT
