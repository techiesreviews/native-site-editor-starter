# Native Site Editor starter

Sample site for Native Site Editor (https://editor.techies.tools, source in `~/Projects/native-site-editor`). The editor renders this site in the browser from plain HTML and CSS with no build step and saves selected files straight to the branch. A push to `main` (which is what the editor's Publish does) runs `.github/workflows/deploy.yml`: it fetches the editor's exporter from `https://editor.techies.tools/native-export.mjs`, runs it to write `dist/`, and `wrangler deploy` uploads that to the test Cloudflare Worker `native-site-editor-starter-test`.

## Contract the editor depends on

- No manifest. There is no `.astro-editor/` directory and no `native.json`: `src/pages/index.html` makes this a native site, and everything else is found by where the files are. Do not add a manifest back.
- Pages by folder: every `.html` file under `src/pages/`, at any depth, is a page. `index.html` is `/`, `<dir>/index.html` is `/<dir>/`, and `<path>.html` is `/<path>/`, so the folders mirror the site's URLs. Names starting with `_` are not pages.
- Page details live in the page: its first lines are a metadata comment, one `key: value` per line, which the export reads for the head and leaves out of the page, and the editor's Page block (Title, Description) and Pages tab edit:

  ```html
  <!--
  title: About
  description: Larkspur is run by a designer and a front-end developer who build small websites by hand.
  -->
  <site-header></site-header>
  <main class="page" id="main">…</main>
  ```

  A page without a `title` gets its first `h1`, without a `description` its first `p`. Keep every page titled and described. Values are one line each and cannot contain `-->`.
- Components by folder: every `src/components/<name>/<name>.html` whose `<name>` is a valid custom-element tag is the component `<name>`. Custom-element tags are lowercase with a dash and are named *part*-*name*, where the part says what the component is: `section-intro`, `card-project`, `site-header`.
- A component's own stylesheet is the sibling `.css` next to its template, found by name and injected only into that component's shadow root, after the shared styles.
- Component styles are scoped, so components use element selectors (`article`, `nav a`) and a short class only to tell same-tag siblings apart (`actions`, `body`); no name-prefixed BEM classes. The shared stylesheets are adopted into each shadow root too, but they are all in cascade layers and component CSS is not, so any component rule beats any shared rule (`site-footer`'s plain `a` over `p a` in `elements.css`). Shared class names such as `page`, `flow`, `lead`, `cards`, `contact`, or `approach` should not be reused inside a component by accident.
- Styles via imports: `src/styles/site.css` is the one shared stylesheet the editor and the export load, and it `@import`s the others in layer order after the `@layer tokens, elements, layout, sections, utilities;` order statement: `tokens.css` (custom properties; it starts with the same order statement, so keep it first), `elements.css`, `layout.css`, `sections.css`, `utilities.css` (the `.text-*` size classes the editor's Text size writes, one per `--text-*` token; add a class there when adding a token). Each of those wraps its rules in its own `@layer` block, so the imports are plain (no `layer(…)`, which would nest the layers). A new shared stylesheet is imported from `site.css`, not left beside it: once `site.css` exists, other files in `src/styles/` are not loaded on their own. Values come from tokens (`--space-*`, `--text-*`, `--radius-*`, colours), in components too.
- Elements have no margins; page text blocks take the `flow` class and components use `gap`. A page rule on an element also reaches it when slotted into a component and cannot be overridden there by `::slotted()`, so element margins would leak into components, and shared rules that size elements are written `h1:not([slot])` (as `elements.css` does for `h1` and `h2`) so a heading a page slots into a component is sized by the component.
- Templates render into shadow DOM; use `<slot>` for page-supplied content. Each editable part of a section is one slot wrapping one whole element, not a slot inside the element: `<slot name="title" data-if><h2>Headline</h2></slot>`, not `<h2><slot name="title">Headline</slot></h2>`. The page then holds a real heading (`<h2 slot="title">…</h2>`), and the component's CSS styles both forms: `h2, ::slotted(h2)`, `.lead, ::slotted(.lead)`, `.actions a, .actions ::slotted(a)`. Put the class on the fallback element (`<p class="lead">`) so it is copied into the page too. Structure that is the same on every page (`<div class="actions">`, `<article>`) stays in the template around the slots. All four `section-` components follow this; `section-hero` is the fullest example.
- Optional parts hide themselves. `data-if` on a `<slot>` makes it optional: a bare `data-if` names the slot itself, and when the page does not fill it the slot is hidden with its fallback, in the preview and the export, so a part the user removes from a page stays gone instead of the template's fallback coming back. Every slot in the `section-` components is optional this way. A template element that holds slots, has no text of its own outside them, and whose slots are all empty or hidden optional slots is hidden too, so an `article` whose title and text are both removed, or an actions row with no buttons, goes. A slot without `data-if` still shows its fallback when the page leaves it empty; `card-project`'s `link` slot has no fallback, so its wrapper shows only when a page passes a link.
- "Add to the page" offers a component only if its template is exactly one `<section>` element with nothing before or after it; `section-` components must keep to that. Cards, the header and the footer are never offered, and nothing can be added inside a section.
- When a section is added, each named slot gets a per-page copy of its fallback, so it is editable on that page alone. A fallback that is one heading, paragraph, blockquote, link or image is copied as that element with the `slot` attribute; other text and inline markup goes in a `<span slot>`; anything else (a list, several blocks) stays shared with the template.
- `data-if="name other"` on a template element shows it only when the page assigned every named slot. A fallback does not count for `data-if`.
- Site links use hash routes: `href="#/"`, `href="#/about/"`. A section within a page is `#/about/#contact` (or `#work` on the same page), pointing at an `id` on that section.
- Site settings are `src/site.json` (below).
- `src/public/_redirects` (Cloudflare's format, copied to the site root) is written by the editor's Change URL (and Move to…, dragging pages, or renaming a page file) with "Keep the old URL working": one `old new 301` line per moved page. Keep hand-written lines to that format; the editor keeps the file free of chains.
- Every page's `<main>` has `id="main"`; `site-header` starts with the "Skip to content" link to it. `site-header` and `site-footer` pad their sides to line up with `--page-width`.
- `src/pages/404.html` is the not-found page, routed as `/404/`. The work pages are `src/pages/work/<slug>.html` at `/work/<slug>/`; new pages under a URL go in the matching folder (`/videos/intro/` is `src/pages/videos/intro.html`).
- Page-level button rows use `.cta` and numbered steps use `ol.steps` (both in `sections.css`).
- No `<script>`, inline `on*` handlers, or `javascript:` URLs; the preview strips them.

## Static export

The exporter is owned by the editor (`shared/native-export.ts` there) and served as `https://editor.techies.tools/native-export.mjs`; this repository has no build script, so changes to the export rules are made in the editor. Full reference: `docs/static-export.md` in the editor repository. The workflow only fetches the exporter, runs it and deploys; it does no post-processing.

- One page per route. The `/404/` route becomes `dist/404.html` (`noindex`, no canonical, not in the sitemap), which Cloudflare serves for unknown paths through `not_found_handling: "404-page"` in `wrangler.jsonc`.
- Components become declarative shadow DOM (`<template shadowrootmode="open">`) that links the hashed `site.[hash].css` (from `src/styles/site.css`, whose `@import`s point at the hashed `tokens`, `elements`, `layout` and `sections` files; the `@layer` order statement keeps the cascade) and then the component's own hashed stylesheet file. There is no inline `<style>`.
- A slot the page fills is exported without its fallback; a slot the page leaves empty keeps it.
- Any leftover `data-key` attributes are stripped from the export. The editor no longer needs them; don't add them.
- Hash links become paths (`#/about/` becomes `/about/`), and the nav link for the current route gets `aria-current="page"`. Images get `width`/`height` from the file and `loading="lazy"` after the first section. `lang` is BCP 47 (`en_GB` becomes `en-GB`).
- With a site `url`: `sitemap.xml` and `robots.txt` (`User-agent`, `Content-Signal` from `contentSignals`, `Allow`, and a `Sitemap` line unless `indexable` is `false`). A `robots.txt` or `sitemap.xml` in `src/public/` replaces the generated one; everything in `src/public/` is copied to the site root.
- `_headers`: `Cache-Control` (HTML `max-age=0`, hashed `/assets/*` immutable), a CSP (`default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `X-Robots-Tag: noindex, nofollow` when `indexable` is `false`. The CSP gets `'unsafe-inline'` for styles only if a page has a `style` attribute or a `<style>` element, so avoid both. HSTS is left to the Cloudflare zone settings.
- Head: `og:title` is the full page title; `og:image:alt` comes from `imageAlt`; `og:image:width`/`height` are added for raster images; an SVG social image logs a warning.
- JSON-LD: WebSite plus the `organization` (`type` or `@type`, `name`, `email`, `telephone`, `address`, `areaServed`, `foundingDate`, `sameAs`, `logo`) on `/`. Per-page JSON-LD exists only as a legacy manifest route's `"jsonLd"`; this site has no manifest and no per-page JSON-LD.
- `src/site.json` holds site-level metadata for the export only: `name`, `url` (canonical base, overridable with `SITE_URL` or `--site-url`), `description`, `themeColor`, `favicon`, `image` (social image, `src/images/social-card.png`, 1200×630), `imageAlt`, `locale`, `indexable` (`false` on this test domain), `contentSignals`, `organization`. The editor ignores the file.
- Each page's `title` and `description` come from its leading comment (above); without them, the first `h1` and `p` are used.

## Relationship to the editor repository

`fixtures/native-starter` in the editor repository is frozen test data for its Playwright suites. This repository is the real starter and may evolve independently.
