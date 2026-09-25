# Native Site Editor starter

Sample site for Native Site Editor (https://editor.techies.tools, source in `~/Projects/native-site-editor`). The editor renders this site in the browser from plain HTML and CSS with no build step and saves selected files straight to the branch. A push to `main` (which is what the editor's Publish does) runs `.github/workflows/deploy.yml`: it fetches the editor's exporter from `https://editor.techies.tools/native-export.mjs`, runs it to write `dist/`, and `wrangler deploy` uploads that to the test Cloudflare Worker `native-site-editor-starter-test`.

## Contract the editor depends on

- `.astro-editor/native.json` at the root: `"version": 1`, `routes` (must include `"/"`; a route is a page path or `{ "file", "title", "description" }`), `components`, `styles`.
- Route files match `src/pages/*.html`; component templates `src/components/<name>/<name>.html`; shared stylesheets `src/styles/*.css`. Custom-element tags are lowercase with a dash and are named *part*-*name*, where the part says what the component is: `section-intro`, `card-project`, `site-header`.
- A component's own stylesheet is the sibling `.css` next to its template. It is not listed in the manifest and is injected only into that component's shadow root, after the shared styles.
- Component styles are scoped, so components use element selectors (`article`, `nav a`) and a short class only to tell same-tag siblings apart (`actions`, `body`); no name-prefixed BEM classes. The shared stylesheets are adopted into each shadow root too, but they are all in cascade layers and component CSS is not, so any component rule beats any shared rule (`site-footer`'s plain `a` over `p a` in `elements.css`). Shared class names such as `page`, `flow`, `lead`, `cards`, `contact`, or `approach` should not be reused inside a component by accident.
- Shared styles are one file per cascade layer, listed in `native.json` `styles` in layer order: `tokens.css` (custom properties; starts with the `@layer tokens, elements, layout, sections;` order statement, so it stays first), `elements.css`, `layout.css`, `sections.css`. No `@import`: the editor applies each file with `replaceSync`, which ignores it. Values come from tokens (`--space-*`, `--text-*`, `--radius-*`, colours), in components too.
- Elements have no margins; page text blocks take the `flow` class and components use `gap`. A page rule on an element also reaches it when slotted into a component and cannot be overridden there by `::slotted()`, so element margins would leak into components.
- Templates render into shadow DOM; use `<slot>` for page-supplied content.
- Optional parts hide themselves. A template element that holds one or more `<slot>`s, has no text of its own, and whose slots the page left empty is hidden in the preview and left out of the static export, and so is a wrapper whose children are all such elements. A slot with fallback content in the template counts as content, so that element is always shown; leave the fallback out to make the part optional, as `card-project` does with its `link` slot.
- "Add to the page" offers a component only if its template is exactly one `<section>` element with nothing before or after it; `section-` components must keep to that. Cards, the header and the footer are never offered, and nothing can be added inside a section.
- When a section is added, each named slot whose fallback is text and inline markup gets a per-page copy of that fallback, so it is editable on that page alone. Block fallbacks (a paragraph, a list, an image) and unnamed slots stay shared with the template, so content a new section needs to be editable goes in named slots with text fallbacks, as in `section-feature`'s `item-1-title` … `item-3-body`. `section-split`'s image fallback is currently shared; the fix belongs in the editor.
- `data-if="name other"` on a template element shows it only when the page assigned every named slot. A fallback does not count for `data-if`.
- Site links use hash routes: `href="#/"`, `href="#/about/"`. A section within a page is `#/about/#contact` (or `#work` on the same page), pointing at an `id` on that section.
- Every page's `<main>` has `id="main"`; `site-header` starts with the "Skip to content" link to it. `site-header` and `site-footer` pad their sides to line up with `--page-width`.
- `src/pages/404.html` is the not-found page, routed as `/404/`. The work pages are `src/pages/work-<slug>.html` at `/work/<slug>/`.
- Page-level button rows use `.cta` and numbered steps use `ol.steps` (both in `sections.css`).
- No `<script>`, inline `on*` handlers, or `javascript:` URLs; the preview strips them.
- Keep `data-key` attributes on elements that change during editing, unique among siblings. They let the preview patch in place.

## Static export

The exporter is owned by the editor (`shared/native-export.ts` there) and served as `https://editor.techies.tools/native-export.mjs`; this repository has no build script, so changes to the export rules are made in the editor. It expands each custom element into declarative shadow DOM (`<template shadowrootmode="open">`) that links the shared stylesheets and inlines the component's own stylesheet, so the output matches the preview's cascade without any JavaScript. Hash links become paths (`#/about/` becomes `/about/`), and the nav link for the current route gets `aria-current="page"`. Shared stylesheets and `src/images/` are written to `dist/assets/` with content-hashed names and immutable cache headers via `dist/_headers`; HTML is `max-age=0`. Images get `width`/`height` from the file and `loading="lazy"` after the first section.

- `.astro-editor/site.json` holds site-level metadata for the export only: `name`, `url` (canonical base, overridable with `SITE_URL` or `--site-url`), `description`, `themeColor`, `favicon`, `image` (Open Graph, `src/images/social-card.png`, 1200×630), `locale`. It also carries `imageAlt`, `indexable` (`false` on this test domain), `contentSignals` and `organization` (schema.org JSON-LD), which the published exporter does not read yet. The editor ignores the file.
- Until the exporter handles them, `deploy.yml` copies `dist/404/index.html` to `dist/404.html` (Cloudflare's `404-page` handling) and appends `X-Robots-Tag: noindex` to `dist/_headers`. Remove that step once the exporter writes both.
- Each route's `title` and `description` live in `native.json`. A page may instead start with a comment of `key: value` lines (`title`, `description`, `image`) that the export reads and strips; the manifest wins. Without either, the first `h1` and `p` are used.

## Relationship to the editor repository

`fixtures/native-starter` in the editor repository is frozen test data for its Playwright suites. This repository is the real starter and may evolve independently.
