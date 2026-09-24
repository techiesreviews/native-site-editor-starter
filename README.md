# Native Site Editor verification starter

Private, isolated repository for real editor save verification. Files render as unpublished browser drafts in Native Site Editor. GitHub commits do not publish a website. No website deployment is configured.

## Repository layout

```
.astro-editor/native.json   Manifest (version 1)
src/pages/                  Route documents
src/components/             Component documents and optional sibling CSS
src/styles/                 Shared stylesheets
```

The manifest declares:

- `version`: `1`.
- `routes`: `/` → `src/pages/index.html` and `/about/` → `src/pages/about.html`.
- `components`: `site-header`, `site-footer`, `project-card`, `card-note`.
- `styles`: shared stylesheets, currently `src/styles/site.css`.

## Shared styles

Every stylesheet listed under the manifest's `styles` key is loaded into each shadow root. Use it for tokens and rules that should apply everywhere.

## Sibling component CSS

A component at `src/components/<name>.html` may have a sibling stylesheet at `src/components/<name>.css`. The convention is:

- Sibling CSS files are **not** listed in `.astro-editor/native.json`.
- The editor resolves them by basename, swapping the `.html` extension for `.css` and looking the path up in the branch tree.
- A sibling stylesheet is loaded on demand and injected only into that component's shadow root.
- It is injected *after* the shared styles, so its rules can override them.

For example, `src/components/project-card.html` is paired with `src/components/project-card.css`; those rules apply to the `project-card` component only.

## Links in the preview

Links inside preview content must use a `#/route/` hash so that navigation works in the preview, for example `href="#/"` and `href="#/about/"`. See `src/components/site-header.html` for the pattern.

## Working in the editor

- Click an element in the canvas to select it; there is no separate "Select element" button.
- Ctrl/⌘+click a link to navigate to its target.
- With a link selected, the **Follow link** button also navigates to its target.
