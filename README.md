# Native Site Editor verification starter

Private, isolated repository for real editor save verification. Files render as unpublished browser drafts in Native Site Editor. GitHub commits do not publish a website. No website deployment is configured.

## Repository layout

```
.astro-editor/native.json   Manifest (version 1)
src/pages/                  Route documents
src/components/<name>/      One folder per component
src/styles/                 Shared stylesheets
```

The manifest declares:

- `version`: `1`.
- `routes`: `/` → `src/pages/index.html` and `/about/` → `src/pages/about.html`.
- `components`: `site-header`, `site-footer`, `project-card`, `card-note`, each pointing at `src/components/<name>/<name>.html`.
- `styles`: shared stylesheets, currently `src/styles/site.css`.

## Shared styles

Every stylesheet listed under the manifest's `styles` key is loaded into each shadow root. Use it for tokens and rules that should apply everywhere.

## One folder per component

Each component lives in its own folder under `src/components/`, and the folder, the HTML file, and the custom-element tag all share the same name:

```
src/components/project-card/project-card.html   Template (listed in the manifest)
src/components/project-card/project-card.css    Styles for this component only
```

Every component in this starter follows that layout: `site-header`, `site-footer`, `project-card`, and `card-note`. The folder is also where any other files belonging to that component go, so everything for one component stays in one place.

The component's stylesheet is found by name, not by configuration:

- Component CSS files are **not** listed in `.astro-editor/native.json`.
- The editor takes the component's HTML path from the manifest and swaps the `.html` extension for `.css`, then looks that path up in the branch tree. In a component folder that resolves to the sibling file next to the template.
- The stylesheet is loaded on demand and injected only into that component's shadow root, so `project-card.css` rules never reach `<site-header>`.
- It is injected *after* the shared styles, so its rules can override them.
- A component without a `.css` file is fine; the editor simply finds nothing and moves on.

Because the lookup is a plain extension swap, the older flat layout (`src/components/<name>.html` beside `src/components/<name>.css`) still works. This starter uses folders so that each component owns a directory.

## Links in the preview

Links inside preview content must use a `#/route/` hash so that navigation works in the preview, for example `href="#/"` and `href="#/about/"`. See `src/components/site-header/site-header.html` for the pattern.

## Working in the editor

- Click an element in the canvas to select it; there is no separate "Select element" button.
- Ctrl/⌘+click a link to navigate to its target.
- With a link selected, the **Follow link** button also navigates to its target.
