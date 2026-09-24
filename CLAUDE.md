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

`scripts/build.mjs` has no dependencies. It expands each custom element into declarative shadow DOM (`<template shadowrootmode="open">`) with the shared stylesheets followed by the component's own stylesheet, so the output matches the preview's cascade without any JavaScript. Hash links become paths (`#/about/` becomes `/about/`), `src/` asset paths become root-absolute, and `src/images/` is copied through. Keep the script in step with the contract above when it changes.

## Relationship to the editor repository

`fixtures/native-starter` in the editor repository is frozen test data for its Playwright suites. This repository is the real starter and may evolve independently.
