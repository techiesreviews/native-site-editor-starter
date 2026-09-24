# Native Site Editor starter

A small studio site built from plain HTML and CSS, ready to open in [Native Site Editor](https://editor.techies.tools). Fork or copy this repository, point the editor at it, and replace the copy with your own.

The editor renders the site in the browser with no build step and saves the files you choose straight to a branch on GitHub. Publishing from the editor commits to `main`, and a GitHub Actions workflow then builds a static export and deploys it to a test Cloudflare Worker.

## Deployment

`.github/workflows/deploy.yml` runs on every push to `main`. It fetches the editor's static exporter from `https://editor.techies.tools/native-export.mjs` and runs it, which writes a standalone site to `dist/` (one `index.html` per route, components expanded into declarative shadow DOM, no JavaScript, hashed stylesheet and image files under `dist/assets/`), then deploys `dist/` with `wrangler deploy` using `wrangler.jsonc`. The workflow needs two repository secrets: `CLOUDFLARE_API_TOKEN` (a token with the Workers Scripts Edit permission) and `CLOUDFLARE_ACCOUNT_ID`. The export rules belong to the editor, so this repository has no build script; run the same export locally with:

```sh
curl -fsSL https://editor.techies.tools/native-export.mjs -o native-export.mjs
node native-export.mjs --out dist
```

Site-wide metadata for the export (name, canonical URL, description, theme colour, favicon, social image) lives in `.astro-editor/site.json`. Each route's title and description live in the manifest (see below). A page may instead start with a comment of `title:` and `description:` lines; without either, the page's first `h1` and `p` are used.

## Repository layout

```
.astro-editor/native.json   Manifest the editor reads first
src/pages/                  One HTML file per route
src/components/<name>/      One folder per component, template plus its stylesheet
src/styles/                 Stylesheets shared by every page and component
src/images/                 Images, referenced as src/images/<file>
```

## The manifest

`.astro-editor/native.json` tells the editor which files make up the site:

```json
{
  "version": 1,
  "routes": {
    "/": {
      "file": "src/pages/index.html",
      "title": "Larkspur Studio",
      "description": "A two-person design studio for small, useful websites."
    },
    "/about/": "src/pages/about.html"
  },
  "components": {
    "site-header": "src/components/site-header/site-header.html",
    "site-footer": "src/components/site-footer/site-footer.html",
    "project-card": "src/components/project-card/project-card.html",
    "card-note": "src/components/card-note/card-note.html"
  },
  "styles": ["src/styles/site.css"]
}
```

- `version` is always `1`.
- `routes` maps a URL path to a page file under `src/pages/`, either as the path alone or as an object with `file` plus an optional `title` and `description` that the static export puts in the page head. The `/` route is required. To add a page, create the file and add a route here.
- `components` maps a custom-element tag to its template under `src/components/`. Tags must be lowercase and contain a dash.
- `styles` lists shared stylesheets under `src/styles/`. They are loaded into the page and into every component.

## Pages

A page is an HTML fragment, not a full document. It uses the components declared in the manifest as custom elements and supplies their content through slots:

```html
<site-header data-key="header"></site-header>
<main class="page" data-key="main">
  <project-card data-key="card-fern">
    <span slot="title">Fern &amp; Kettle</span>
    <span slot="note">Cafe · 2025</span>
    <p slot="body">A one-page site with a printable menu.</p>
  </project-card>
</main>
<site-footer data-key="footer"></site-footer>
```

Give elements that you expect to edit a `data-key` attribute that is unique among its siblings. The editor uses these keys to update the preview in place while you type instead of re-rendering the page.

## Components and their stylesheets

Each component lives in its own folder, and the folder, the template, and the tag share one name:

```
src/components/project-card/project-card.html   Template, listed in the manifest
src/components/project-card/project-card.css    Styles for this component only
```

Templates render into a shadow root. Use `<slot>` for content the page supplies, with named slots for more than one region. A component can use other components, as `project-card` uses `card-note` for the small tag above each title.

The component stylesheet is found by name, not by configuration. The editor takes the template path from the manifest, swaps `.html` for `.css`, and loads that file if it exists. So:

- Component stylesheets are not listed in the manifest.
- The stylesheet is injected only into that component's shadow root, after the shared styles, so it can override them and never leaks into other components.
- A component without a stylesheet is fine.
- The flat layout `src/components/<name>.html` with `src/components/<name>.css` beside it also works. This starter uses folders so that each component owns a directory.

Keep design tokens such as colours and fonts as custom properties in `src/styles/site.css`. Components read them with `var(--accent)` and similar, so a token change reaches everything.

## Links

Links between pages use hash routes so that navigation works inside the editor's preview: `href="#/"` for the home page and `href="#/about/"` for the about page. The route part matches a key in the manifest's `routes` map. External links and `mailto:` links work as usual.

## What the preview does not run

The preview strips `<script>` tags, inline `on*` event handlers, and `javascript:` URLs. Keep the site to HTML and CSS.

## Working in the editor

- Click an element in the preview to select it and open its source. Selecting a component instance opens the template with its stylesheet beside it.
- Ctrl/⌘+click a link to follow it to the target route.
- Saving writes the selected files to the current branch as a commit. Nothing is published by saving.
