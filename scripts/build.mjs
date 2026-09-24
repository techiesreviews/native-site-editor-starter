// Static export for the starter. Reads .astro-editor/native.json and writes a
// standalone site to dist/ with no JavaScript: each custom element is expanded
// into declarative shadow DOM (<template shadowrootmode="open">) carrying the
// shared stylesheets and the component's own stylesheet, matching the order
// the editor's preview runtime uses. Hash routes become real paths.
// Run with: node scripts/build.mjs
import { readFileSync, writeFileSync, mkdirSync, rmSync, cpSync, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const outDir = join(root, "dist");
const read = (path) => readFileSync(join(root, path), "utf8");

const manifest = JSON.parse(read(".astro-editor/native.json"));
if (manifest.version !== 1) throw new Error("Unsupported manifest version");
if (!manifest.routes["/"]) throw new Error('Manifest must include the "/" route');

const sharedCss = (manifest.styles || []).map((path) => read(path));
const components = {};
for (const [tag, path] of Object.entries(manifest.components || {})) {
  const cssPath = path.replace(/\.html$/, ".css");
  components[tag] = {
    html: read(path),
    css: existsSync(join(root, cssPath)) ? read(cssPath) : "",
  };
}

const styleBlock = (tag) =>
  sharedCss.map((css) => `<style>${css}</style>`).join("") +
  (components[tag].css ? `<style>${components[tag].css}</style>` : "");

const OPEN = /<([a-z][a-z0-9]*-[a-z0-9-]*)(\s[^>]*)?>/g;
const MAX_DEPTH = 20;

// Finds the end of the matching close tag for an element opened at `openEnd`.
function closeOf(html, tag, openEnd) {
  const re = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, "g");
  re.lastIndex = openEnd;
  let depth = 1;
  let m;
  while ((m = re.exec(html))) {
    depth += m[1] ? -1 : 1;
    if (depth === 0) return { innerEnd: m.index, outerEnd: re.lastIndex };
  }
  return null;
}

function expand(html, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error("Recursive component templates detected");
  let out = "";
  let cursor = 0;
  OPEN.lastIndex = 0;
  let m;
  while ((m = OPEN.exec(html))) {
    const [open, tag] = m;
    if (m.index < cursor || !components[tag]) continue;
    const close = closeOf(html, tag, m.index + open.length);
    if (!close) throw new Error(`Unclosed <${tag}> in page or template`);
    out += html.slice(cursor, m.index) + open;
    out += `<template shadowrootmode="open">${styleBlock(tag)}${expand(components[tag].html, depth + 1)}</template>`;
    out += expand(html.slice(m.index + open.length, close.innerEnd), depth + 1);
    out += html.slice(close.innerEnd, close.outerEnd);
    cursor = close.outerEnd;
    OPEN.lastIndex = cursor;
  }
  return out + html.slice(cursor);
}

const rewriteLinks = (html) =>
  html
    .replace(/(href=["'])#\/([^"']*)/g, "$1/$2") // #/about/ -> /about/
    .replace(/((?:src|href)=["'])src\//g, "$1/src/"); // src/images/x -> /src/images/x

function document(route, body) {
  const title = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(body)?.[1].replace(/<[^>]+>/g, "").trim() || route;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
${sharedCss.map((css) => `<style>${css}</style>`).join("\n")}
</head>
<body>
${body}
</body>
</html>
`;
}

rmSync(outDir, { recursive: true, force: true });
for (const [route, path] of Object.entries(manifest.routes)) {
  if (!route.startsWith("/")) throw new Error(`Route ${route} must start with /`);
  const body = rewriteLinks(expand(read(path)));
  const dir = join(outDir, route);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), document(route, body));
  console.log(`${route} -> ${join("dist", route, "index.html")}`);
}
if (existsSync(join(root, "src/images"))) {
  cpSync(join(root, "src/images"), join(outDir, "src/images"), { recursive: true });
  console.log("src/images -> dist/src/images");
}
