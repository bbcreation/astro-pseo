/**
 * Adaptive CSS shared between the built-in layout and the emitted /learn
 * templates. Colours inherit from the surrounding page via `color-mix(
 * currentColor, …)` so the plugin looks at home in any theme without
 * configuration. Imported by:
 *   - src/templates/defaultLayout.astro (when no custom layout is set)
 *   - the emitted .astro index/show templates (so users with a custom
 *     layout still get styled cards/prose/pagination without copy-paste).
 */
export const ADAPTIVE_CSS = `
  .pseo-wrap { max-width: 860px; margin: 0 auto; padding: 6rem 1.5rem 6rem; }
  .pseo-section { margin-bottom: 1.5rem; }
  .pseo-section-label { font-size: .6875rem; font-weight: 700; text-transform: uppercase; letter-spacing: .1em; opacity: .4; margin-bottom: 1rem; }
  .pseo-grid { display: grid; gap: .75rem; }
  .pseo-grid-2 { grid-template-columns: repeat(auto-fill, minmax(280px, 1fr)); }
  .pseo-grid-3 { grid-template-columns: repeat(auto-fill, minmax(220px, 1fr)); }
  .pseo-card { display: block; padding: 1.125rem; border: 1px solid color-mix(in srgb, currentColor 8%, transparent); background: color-mix(in srgb, currentColor 3%, transparent); border-radius: .75rem; text-decoration: none; transition: border-color .15s, background .15s; }
  .pseo-card:hover { border-color: color-mix(in srgb, currentColor 20%, transparent); background: color-mix(in srgb, currentColor 6%, transparent); }
  .pseo-card-title { font-size: .9375rem; font-weight: 600; opacity: .9; }
  .pseo-card-desc { font-size: .8125rem; opacity: .5; margin-top: .375rem; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
  .pseo-empty { opacity: .4; font-size: .875rem; }
  .pseo-back { display: inline-flex; align-items: center; gap: .375rem; font-size: .875rem; opacity: .5; text-decoration: none; margin-bottom: 2rem; transition: opacity .15s; }
  .pseo-back:hover { opacity: .8; }
  .pseo-h1 { font-size: 2rem; font-weight: 700; line-height: 1.25; margin-bottom: .375rem; }
  .pseo-meta { font-size: .8125rem; opacity: .4; margin-bottom: 2rem; }
  .pseo-pagination { display: flex; align-items: center; justify-content: center; gap: .5rem; margin-top: 1rem; margin-bottom: 2rem; flex-wrap: wrap; }
  .pseo-pagination a, .pseo-pagination span { display: inline-flex; align-items: center; justify-content: center; min-width: 2.25rem; height: 2.25rem; padding: 0 .625rem; border: 1px solid color-mix(in srgb, currentColor 10%, transparent); border-radius: .5rem; font-size: .875rem; text-decoration: none; opacity: .65; transition: opacity .15s, border-color .15s; }
  .pseo-pagination a:hover { opacity: 1; border-color: color-mix(in srgb, currentColor 25%, transparent); }
  .pseo-pagination .pseo-current { opacity: 1; background: color-mix(in srgb, currentColor 8%, transparent); border-color: color-mix(in srgb, currentColor 20%, transparent); font-weight: 600; }
  .pseo-pagination .pseo-disabled { opacity: .25; cursor: default; }
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
  @media (max-width: 600px) { .pseo-wrap { padding: 5rem 1rem 4rem; } .pseo-h1 { font-size: 1.625rem; } }
`;
