# Native Site Editor starter

Sample site for Native Site Editor (https://editor.techies.tools, source in `~/Projects/native-site-editor`). The editor renders this site in the browser from plain HTML and CSS with no build step and saves selected files straight to the branch. A push to `main` (which is what the editor's Publish does) runs `.github/workflows/deploy.yml`: it fetches the editor's exporter from `https://editor.techies.tools/native-export.mjs`, runs it to write `dist/`, and `wrangler deploy` uploads that to the test Cloudflare Worker `native-site-editor-starter-test`.

## Contract the editor depends on

- `.astro-editor/native.json` at the root: `"version": 1`, `routes` (optional page metadata keyed by URL: `{ "title", "description", "jsonLd" }`), `components`, `styles`.
- Pages are routed by where their file is: every `.html` file under `src/pages/`, at any depth, is a page. `index.html` is `/`, `<dir>/index.html` is `/<dir>/`, and `<path>.html` is `/<path>/`, so the folders mirror the site's URLs. Names starting with `_` are not pages. A route entry with `"file"` still maps a URL to a file by hand, but this site does not use it.
- Component templates are `src/components/<name>/<name>.html`; shared stylesheets `src/styles/*.css`. Custom-element tags are lowercase with a dash and are named *part*-*name*, where the part says what the component is: `section-intro`, `card-project`, `site-header`.
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
- `src/pages/404.html` is the not-found page, routed as `/404/`. The work pages are `src/pages/work/<slug>.html` at `/work/<slug>/`; new pages under a URL go in the matching folder (`/videos/intro/` is `src/pages/videos/intro.html`).
- Page-level button rows use `.cta` and numbered steps use `ol.steps` (both in `sections.css`).
- No `<script>`, inline `on*` handlers, or `javascript:` URLs; the preview strips them.
- Keep `data-key` attributes on elements that change during editing, unique among siblings. They let the preview patch in place.

## Static export

The exporter is owned by the editor (`shared/native-export.ts` there) and served as `https://editor.techies.tools/native-export.mjs`; this repository has no build script, so changes to the export rules are made in the editor. Full reference: `docs/static-export.md` in the editor repository. The workflow only fetches the exporter, runs it and deploys; it does no post-processing.

- One page per route. The `/404/` route becomes `dist/404.html` (`noindex`, no canonical, not in the sitemap), which Cloudflare serves for unknown paths through `not_found_handling: "404-page"` in `wrangler.jsonc`.
- Components become declarative shadow DOM (`<template shadowrootmode="open">`) that links one hashed `site.[hash].css` (the manifest's `styles` joined in order; the `@layer` order statement in `tokens.css` keeps the cascade) and then the component's own hashed stylesheet file. There is no inline `<style>`.
- A slot the page fills is exported without its fallback; a slot the page leaves empty keeps it.
- `data-key` attributes are stripped from the export. Keep them in the source: the editor preview needs them.
- Hash links become paths (`#/about/` becomes `/about/`), and the nav link for the current route gets `aria-current="page"`. Images get `width`/`height` from the file and `loading="lazy"` after the first section. `lang` is BCP 47 (`en_GB` becomes `en-GB`).
- With a site `url`: `sitemap.xml` and `robots.txt` (`User-agent`, `Content-Signal` from `contentSignals`, `Allow`, and a `Sitemap` line unless `indexable` is `false`). A `robots.txt` or `sitemap.xml` in `src/public/` replaces the generated one; everything in `src/public/` is copied to the site root.
- `_headers`: `Cache-Control` (HTML `max-age=0`, hashed `/assets/*` immutable), a CSP (`default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `X-Robots-Tag: noindex, nofollow` when `indexable` is `false`. The CSP gets `'unsafe-inline'` for styles only if a page has a `style` attribute or a `<style>` element, so avoid both. HSTS is left to the Cloudflare zone settings.
- Head: `og:title` is the full page title; `og:image:alt` comes from `imageAlt`; `og:image:width`/`height` are added for raster images; an SVG social image logs a warning.
- JSON-LD: WebSite plus the `organization` (`type` or `@type`, `name`, `email`, `telephone`, `address`, `areaServed`, `foundingDate`, `sameAs`, `logo`) on `/`. A route in `native.json` may add `"jsonLd"` (an object or an array of objects).
- `.astro-editor/site.json` holds site-level metadata for the export only: `name`, `url` (canonical base, overridable with `SITE_URL` or `--site-url`), `description`, `themeColor`, `favicon`, `image` (social image, `src/images/social-card.png`, 1200×630), `imageAlt`, `locale`, `indexable` (`false` on this test domain), `contentSignals`, `organization`. The editor ignores the file.
- Each route's `title` and `description` live in `native.json`. A page may instead start with a comment of `key: value` lines (`title`, `description`, `image`) that the export reads and strips; the manifest wins. Without either, the first `h1` and `p` are used.

## Relationship to the editor repository

`fixtures/native-starter` in the editor repository is frozen test data for its Playwright suites. This repository is the real starter and may evolve independently.
