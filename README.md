# Native Site Editor starter

A small studio site built from plain HTML and CSS, ready to open in [Native Site Editor](https://editor.techies.tools). Fork or copy this repository, point the editor at it, and replace the copy with your own.

The editor renders the site in the browser with no build step and saves the files you choose straight to a branch on GitHub. Publishing from the editor commits to `main`, and a GitHub Actions workflow then builds a static export and deploys it to a test Cloudflare Worker.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`. It fetches the editor's static exporter from `https://editor.techies.tools/native-export.mjs` and runs it, which writes a standalone site to `dist/` with no JavaScript, then deploys `dist/` with `wrangler deploy` using `wrangler.jsonc`. The workflow needs two repository secrets: `CLOUDFLARE_API_TOKEN` (a token with the Workers Scripts Edit permission) and `CLOUDFLARE_ACCOUNT_ID`. The export rules belong to the editor, so this repository has no build script; run the same export locally with:

```sh
curl -fsSL https://editor.techies.tools/native-export.mjs -o native-export.mjs
node native-export.mjs --out dist
```

The full reference is `docs/static-export.md` in the editor repository. In short, the export:

- Writes one `index.html` per route. The `/404/` route becomes `dist/404.html` instead, with `noindex`, no canonical link and no sitemap entry; Cloudflare serves it for unknown paths through `"not_found_handling": "404-page"` in `wrangler.jsonc`.
- Expands each component into declarative shadow DOM that links the hashed `site.[hash].css` (from `src/styles/site.css`, its `@import`s pointing at the hashed layer files, with the `@layer` order statement at the top keeping the cascade) and then the component's own hashed stylesheet. There is no inline `<style>`.
- Leaves out a slot's fallback when the page fills the slot, and keeps it when the page leaves the slot empty.
- Strips `data-key` attributes. Keep them in the source: the editor preview needs them.
- Sets `lang` in BCP 47 form (`en_GB` becomes `en-GB`).
- Writes `sitemap.xml` and `robots.txt` when the site has a URL. `robots.txt` has `User-agent`, a `Content-Signal` line from `contentSignals`, `Allow`, and a `Sitemap` line unless `indexable` is `false`. To supply your own `robots.txt` or `sitemap.xml`, put it in `src/public/`; everything in `src/public/` is copied to the site root.
- Writes `_headers` with `Cache-Control` (HTML is revalidated, hashed assets are immutable), a Content Security Policy (`default-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'`), `X-Content-Type-Options`, `Referrer-Policy`, `Permissions-Policy`, and `X-Robots-Tag: noindex, nofollow` when `indexable` is `false`. The CSP allows `'unsafe-inline'` styles only if a page has a `style` attribute or a `<style>` element. HSTS is left to the Cloudflare zone settings.
- Fills the head: `og:title` is the full page title, `og:image:alt` comes from `imageAlt`, and `og:image:width`/`height` are added for raster images. An SVG social image logs a warning, because most social sites do not show SVG.
- Adds JSON-LD to `/`: a WebSite plus the `organization` from `site.json` (`type` or `@type`, `name`, `email`, `telephone`, `address`, `areaServed`, `foundingDate`, `sameAs`, `logo`). (Per-page JSON-LD is only available through the editor's legacy manifest, which this site does not have.)

Site-wide metadata lives in `src/site.json`: name, canonical URL, description, theme colour, favicon, social image (`src/images/social-card.png`, 1200×630) and `imageAlt`, locale, `indexable` (`false` here, because the test domain should stay out of search results), `contentSignals`, and `organization`. Each page's title and description live in the page itself, in a comment at the top (see [Pages](#pages)); without them, the page's first `h1` and `p` are used.

## Repository layout

There is no manifest: the editor and the exporter find everything by where it is.

```
src/pages/                  One HTML file per page; folders mirror the URLs (work/ holds /work/…)
src/components/<name>/      One folder per component, template plus its stylesheet
src/styles/site.css         The shared styles: imports the layer files below, in order
src/styles/                 Shared stylesheets, one per cascade layer
src/images/                 Images, referenced as src/images/<file>
src/site.json               Site settings for the export
src/public/                 Copied to the site root as is (_redirects, robots.txt, …)
```

- Pages by folder: every `.html` file under `src/pages/` is a page at the URL its path gives. `index.html` is `/`, `about.html` is `/about/`, `work/fern-and-kettle.html` is `/work/fern-and-kettle/`, and `work/index.html` would be `/work/`. A file or folder whose name starts with `_` is not a page. To add a page, create the file in the folder that matches its URL (the editor's New page does this for you). `src/pages/index.html` is required: it is what makes the repository a native site.
- Components by folder: every `src/components/<name>/<name>.html`, where `<name>` is a custom-element tag (lowercase, with a dash), is the component `<name>`.
- Styles via imports: `src/styles/site.css` is the one shared stylesheet, and it imports the others (see [Shared stylesheets](#shared-stylesheets)).
- `src/public/_redirects` is written by the editor when you change a page's URL with "Keep the old URL working" checked (Change URL, Move to…, dragging a page, or renaming its file): one `old new 301` line per moved page, which Cloudflare follows.

## Pages

A page is an HTML fragment, not a full document. It starts with a comment that gives its details, then uses the components as custom elements and supplies their content through slots:

```html
<!--
title: Fern & Kettle
description: A one-page site for a neighbourhood cafe, with a printable menu.
-->
<site-header data-key="header"></site-header>
<main class="page" id="main" data-key="main">
  <card-project data-key="card-fern">
    <span slot="title">Fern &amp; Kettle</span>
    <span slot="note">Cafe · 2025</span>
    <p slot="body">A one-page site with a printable menu.</p>
    <a slot="link" href="#/work/fern-and-kettle/">Read the Fern &amp; Kettle write-up</a>
  </card-project>
</main>
<site-footer data-key="footer"></site-footer>
```

The comment is the first thing in the file, one `key: value` per line. `title` becomes the page's `<title>` (followed by ` · ` and the site name) and `og:title`, and `description` its meta description; the export leaves the comment out of the page, and the editor never shows it in the preview. The Title and Description fields in the editor write it for you.

Every page's `<main>` has `id="main"`: the first thing in `site-header` is a "Skip to content" link that points there and stays off screen until it has keyboard focus.

Give elements that you expect to edit a `data-key` attribute that is unique among its siblings. The editor uses these keys to update the preview in place while you type instead of re-rendering the page. The static export strips them.

## Components and their stylesheets

A component is named *part*-*name*, where the part says what it is: a `section-` component is a section of a page (`section-intro`, `section-split`), a `card-` component is a card or a piece of one (`card-project`, `card-note`), and `site-` is for the parts every page shares (`site-header`, `site-footer`). Each component lives in its own folder, and the folder, the template, and the tag share that one name:

```
src/components/card-project/card-project.html   Template
src/components/card-project/card-project.css    Styles for this component only
```

Templates render into a shadow root. Use `<slot>` for content the page supplies, with named slots for more than one region. A component can use other components, as `card-project` uses `card-note` for the small tag above each title.

A part of a template that the page leaves empty is not shown. If an element holds one or more slots, has no text of its own, and the page assigned none of those slots, the editor hides it and the static export leaves it out; a wrapper whose children are all hidden that way goes too. A slot with fallback content in the template is never empty, so an element with a fallback is always shown. That is how a part is made optional: leave the fallback out. `card-project` ends with

```html
<p class="actions" data-key="card-actions"><slot name="link"></slot></p>
```

and only a card whose page passes `<a slot="link" href="#/work/fern-and-kettle/">…</a>` shows that paragraph; a card without one ends after its description. Cards in a row are the same height, and the link sits at the bottom of each. An element can also carry `data-if="name other"` to be shown only when the page assigned every slot named there; a fallback does not count for `data-if`.

The editor's "Add to the page" buttons offer only components whose template is exactly one `<section>` element, with nothing before or after it, so every `section-` component keeps to that shape. Cards, the header and the footer are never offered, and nothing can be added inside a section. When a section is added, each named slot whose fallback is text and inline markup (`a`, `strong`, `em` and the like) gets its own copy in the page, so typing in it changes that page only. A slot whose fallback is block content, such as a paragraph, a list or an image, stays with the template, and so does an unnamed slot. That is why `section-feature` has a fixed set of named slots (`title`, then `item-1-title`, `item-1-body` up to `item-3-body`) rather than one slot for a list of items.

The image in a newly added `section-split` is currently shared: its fallback is an `<img>`, which stays with the template, so editing it changes every Split section that has no image of its own. Pass `<img slot="image" …>` from the page, as the home page does, to give one section its own image.

Because the stylesheet only ever reaches its own shadow root, a component styles itself with plain element selectors and needs no name-prefixed classes: `article`, `h3`, `nav a`. Add a short class such as `actions` or `body` only where two elements of the same tag need different rules. Nothing a component defines can reach the page or another component.

The shared stylesheets are adopted into every shadow root as well, so their rules also apply inside a component. They are all in cascade layers and a component stylesheet is not, so a component rule wins over any shared rule whatever its specificity: `elements.css` colours running text links with `p a`, and `site-footer` overrides that with a plain `a`, while a component that says nothing about links still gets the accent colour, as `section-contact` does for the fallback link in its action paragraph. Avoid reusing a shared class name such as `page`, `flow`, `lead`, `cards`, `contact`, or `approach` inside a component unless you mean to build on that rule.

The component stylesheet is found by name, not by configuration: the editor swaps the template's `.html` for `.css` and loads that file if it exists. So:

- The stylesheet is injected only into that component's shadow root, after the shared styles, so it can override them and never leaks into other components.
- A component without a stylesheet is fine.
- The flat layout `src/components/<name>.html` with `src/components/<name>.css` beside it also works. This starter uses folders so that each component owns a directory.

## Shared stylesheets

The shared styles are split by concern into four files. Each file holds one cascade layer with the same name, and `src/styles/site.css` imports them in layer order:

```
src/styles/tokens.css     @layer tokens     Custom properties: colours, type and space scales, radii, widths
src/styles/elements.css   @layer elements   Plain HTML elements: body, headings, links, focus rings
src/styles/layout.css     @layer layout     Page width, space between sections, .flow, .cards
src/styles/sections.css   @layer sections   Sections written directly in a page: .hero, .lead, .cta, .steps, .approach, .contact
```

```css
@layer tokens, elements, layout, sections;
@import url("tokens.css");
@import url("elements.css");
@import url("layout.css");
@import url("sections.css");
```

The `@layer` statement fixes the order before anything is imported (`tokens.css` starts with the same statement, so keep it first). The imports are plain, not `layer(…)`, because each file already wraps its rules in its own `@layer` block. Once `site.css` exists it is the only shared stylesheet loaded, so a new one must be imported from it. A later layer wins over an earlier one whatever the specificity, and a component stylesheet, which is not in a layer, wins over all of them.

To adjust the look, change a token. Components and the other shared files read `var(--accent)`, `var(--space-l)`, `var(--radius-l)`, `var(--text-2xl)` and so on, so one change in `tokens.css` reaches every page and component. Spacing is a scale from `--space-3xs` (4px) to `--space-5xl` (80px), and type runs from `--text-s` (14px, the smallest size used) to `--text-4xl`. The font stack is system fonts only; no webfont is loaded.

Elements have no margins of their own. A section of text gets its spacing from the `flow` class, which puts a step of space between its children, with a little more after a heading:

```html
<section class="approach flow" data-key="approach">
  <h2 data-key="approach-title">How we work</h2>
  <p data-key="approach-1">…</p>
</section>
```

Two more page classes live in `sections.css`. `.cta` is a row of buttons, as under the home hero: the first link is the main action and any after it are outlined. `.steps` is an `<ol>` of numbered steps laid out in a row, as in "How we work". Neither name is used inside a component.

Components space their own content with `gap`. Page rules for an element also reach it when a page slots it into a component, and the component cannot override them there, so margins on plain elements would leak into every component that takes slotted text.

## Links

Links between pages use hash routes so that navigation works inside the editor's preview: `href="#/"` for the home page and `href="#/about/"` for the about page. The route part is the page's URL, which is where its file is. To link to a part of a page, give its section an `id` and add it after the route: `href="#/about/#contact"`, or `href="#work"` for a section on the same page. The export turns these into `/about/#contact` and `#work`; in the preview they do not navigate. External links and `mailto:` links work as usual.

## What the preview does not run

The preview strips `<script>` tags, inline `on*` event handlers, and `javascript:` URLs. Keep the site to HTML and CSS.

## Working in the editor

- Click an element in the preview to select it and open its source. Selecting a component instance opens the template with its stylesheet beside it.
- Ctrl/⌘+click a link to follow it to the target route.
- The page structure sidebar shows the page's elements as a tree. Click a row to select that element in the preview and open the edit bar. Rows fold, and the arrow keys and Enter work in the tree.
- The Title and Description fields above the tree edit the page's `title` and `description` in the comment at the top of the page, and the URL field below them changes its URL (moving the file, updating links to it, and optionally adding a line to `src/public/_redirects`).
- Drag the resize handles between the sidebar, preview, code and side-by-side panes to resize them. Click a handle to hide or show that panel.
- Move a section with Alt+↑/↓, by dragging its row in the sidebar, or by dragging the grip in the edit bar while the whole section is selected.
- Add a section with the plus buttons between sections. They list the components that fit there (see [Components and their stylesheets](#components-and-their-stylesheets)).
- To link text, select it in a paragraph and press Link in the edit bar or Ctrl/⌘+K, then choose one of the site's pages or type an address. Remove link takes it off again.
- Save to GitHub lists each changed file with its added and removed line counts. Click the counts to compare the old and new file side by side. Saving writes the selected files to the current branch as a commit. Nothing is published by saving.
