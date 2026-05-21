# Example fixture

Minimal Astro project used to smoke-test `astro-pseo` end-to-end.

```bash
pnpm install
pnpm build
```

Then inspect `dist/`:

- `dist/index.html`, `dist/about/index.html` — static project pages.
- `dist/learn/index.html` — generated article index.
- `dist/learn/example/index.html`, `dist/learn/foo/index.html` — article pages.
- `dist/sitemap.xml` — contains `/`, `/about`, `/manual-extra`, `/learn/example`, `/learn/foo`.
- `dist/robots.txt`, `dist/llms.txt` — generated.
