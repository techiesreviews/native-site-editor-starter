# Native Site Editor starter

Sample site for Native Site Editor (https://editor.techies.tools, source in `~/Projects/native-site-editor`). The editor renders this site in the browser from plain HTML and CSS with no build step and saves selected files straight to the branch. A push to `main` (which is what the editor's Publish does) runs `.github/workflows/deploy.yml`: it fetches the editor's exporter from `https://editor.techies.tools/native-export.mjs`, runs it to write `dist/`, and `wrangler deploy` uploads that to the test Cloudflare Worker `native-site-editor-starter-test`.

## Contract the editor depends on

- `.astro-editor/native.json` at the root: `"version": 1`, `routes` (must include `"/"`; a route is a page path or `{ "file", "title", "description" }`), `components`, `styles`.
- Route files match `src/pages/*.html`; component templates `src/components/<name>/<name>.html`; shared stylesheets `src/styles/*.css`. Custom-element tags are lowercase with a dash.
- A component's own stylesheet is the sibling `.css` next to its template. It is not listed in the manifest and is injected only into that component's shadow root, after the shared styles.
- Templates render into shadow DOM; use `<slot>` for page-supplied content.
- Site links use hash routes: `href="#/"`, `href="#/about/"`.
- No `<script>`, inline `on*` handlers, or `javascript:` URLs; the preview strips them.
- Keep `data-key` attributes on elements that change during editing, unique among siblings. They let the preview patch in place.

## Static export

The exporter is owned by the editor (`shared/native-export.ts` there) and served as `https://editor.techies.tools/native-export.mjs`; this repository has no build script, so changes to the export rules are made in the editor. It expands each custom element into declarative shadow DOM (`<template shadowrootmode="open">`) that links the shared stylesheets and inlines the component's own stylesheet, so the output matches the preview's cascade without any JavaScript. Hash links become paths (`#/about/` becomes `/about/`), and the nav link for the current route gets `aria-current="page"`. Shared stylesheets and `src/images/` are written to `dist/assets/` with content-hashed names and immutable cache headers via `dist/_headers`; HTML is `max-age=0`. Images get `width`/`height` from the file and `loading="lazy"` after the first section.

- `.astro-editor/site.json` holds site-level metadata for the export only: `name`, `url` (canonical base, overridable with `SITE_URL` or `--site-url`), `description`, `themeColor`, `favicon`, `image` (Open Graph), `locale`. The editor ignores it.
- Each route's `title` and `description` live in `native.json`. A page may instead start with a comment of `key: value` lines (`title`, `description`, `image`) that the export reads and strips; the manifest wins. Without either, the first `h1` and `p` are used.

## Relationship to the editor repository

`fixtures/native-starter` in the editor repository is frozen test data for its Playwright suites. This repository is the real starter and may evolve independently.
