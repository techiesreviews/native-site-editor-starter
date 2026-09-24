# Native Site Editor starter

Sample site for Native Site Editor (https://editor.techies.tools, source in `~/Projects/native-site-editor`). The editor renders this site in the browser from plain HTML and CSS with no build step and saves selected files straight to the branch. A push to `main` (which is what the editor's Publish does) runs `.github/workflows/deploy.yml`: `node scripts/build.mjs` exports `dist/` and `wrangler deploy` uploads it to the test Cloudflare Worker `native-site-editor-starter-test`.

## Contract the editor depends on

- `.astro-editor/native.json` at the root: `"version": 1`, `routes` (must include `"/"`), `components`, `styles`.
- Route files match `src/pages/*.html`; component templates `src/components/<name>/<name>.html`; shared stylesheets `src/styles/*.css`. Custom-element tags are lowercase with a dash.
- A component's own stylesheet is the sibling `.css` next to its template. It is not listed in the manifest and is injected only into that component's shadow root, after the shared styles.
- Templates render into shadow DOM; use `<slot>` for page-supplied content.
- Site links use hash routes: `href="#/"`, `href="#/about/"`.
- No `<script>`, inline `on*` handlers, or `javascript:` URLs; the preview strips them.
- Keep `data-key` attributes on elements that change during editing, unique among siblings. They let the preview patch in place.

## Static export

`scripts/build.mjs` has no dependencies. It expands each custom element into declarative shadow DOM (`<template shadowrootmode="open">`) that links the shared stylesheets and inlines the component's own stylesheet, so the output matches the preview's cascade without any JavaScript. Hash links become paths (`#/about/` becomes `/about/`), and the nav link for the current route gets `aria-current="page"`. Shared stylesheets and `src/images/` are written to `dist/assets/` with content-hashed names and immutable cache headers via `dist/_headers`; HTML is `max-age=0`. Images get `width`/`height` from the file and `loading="lazy"` after the first section. Keep the script in step with the contract above when it changes.

- `.astro-editor/site.json` holds site-level metadata for the export only: `name`, `url` (canonical base, overridable with `SITE_URL`), `description`, `themeColor`, `favicon`, `image` (Open Graph), `locale`. The editor ignores it.
- A page may start with a comment of `key: value` lines (`title`, `description`, `image`) that the export reads for the head and strips from the output. Without it, the first `h1` and `p` are used.

## Relationship to the editor repository

`fixtures/native-starter` in the editor repository is frozen test data for its Playwright suites. This repository is the real starter and may evolve independently.
