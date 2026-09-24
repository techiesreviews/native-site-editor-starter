// Static export for the starter. Reads .astro-editor/native.json and
// .astro-editor/site.json and writes a standalone site to dist/ with no
// JavaScript: each custom element is expanded into declarative shadow DOM
// (<template shadowrootmode="open">) that links the shared stylesheets and
// inlines the component's own stylesheet, matching the order the editor's
// preview runtime uses. Hash routes become real paths, shared stylesheets and
// images get content-hashed filenames under /assets/ with long cache headers.
// Run with: node scripts/build.mjs   (SITE_URL overrides site.json's url)
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync, readdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { basename, dirname, extname, join, resolve } from "node:path";

const root = resolve(dirname(new URL(import.meta.url).pathname), "..");
const outDir = join(root, "dist");
const read = (path) => readFileSync(join(root, path), "utf8");
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex").slice(0, 8);
const escapeHtml = (text) =>
  String(text).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

const manifest = JSON.parse(read(".astro-editor/native.json"));
if (manifest.version !== 1) throw new Error("Unsupported manifest version");
if (!manifest.routes["/"]) throw new Error('Manifest must include the "/" route');

const site = JSON.parse(read(".astro-editor/site.json"));
const siteUrl = (process.env.SITE_URL || site.url || "").replace(/\/$/, "");
if (!siteUrl) throw new Error("Set site.json url or the SITE_URL environment variable");

rmSync(outDir, { recursive: true, force: true });
mkdirSync(join(outDir, "assets/images"), { recursive: true });

// Shared stylesheets: one hashed file each, linked in manifest order.
const sharedLinks = (manifest.styles || []).map((path) => {
  const css = read(path);
  const name = `${basename(path, ".css")}.${hash(css)}.css`;
  writeFileSync(join(outDir, "assets", name), css);
  return `<link rel="stylesheet" href="/assets/${name}">`;
});
const sharedLinkTags = sharedLinks.join("");

// Images: copied to hashed filenames; the map rewrites references in HTML.
const imageMap = new Map();
const imageSize = new Map();
const imagesDir = join(root, "src/images");
if (existsSync(imagesDir)) {
  for (const file of readdirSync(imagesDir)) {
    const source = `src/images/${file}`;
    const buffer = readFileSync(join(root, source));
    const ext = extname(file);
    const name = `${basename(file, ext)}.${hash(buffer)}${ext}`;
    writeFileSync(join(outDir, "assets/images", name), buffer);
    imageMap.set(source, `/assets/images/${name}`);
    const size = dimensions(buffer, ext);
    if (size) imageSize.set(source, size);
  }
}
const assetUrl = (source) => {
  if (!imageMap.has(source)) throw new Error(`Missing image ${source}`);
  return imageMap.get(source);
};

// Reads intrinsic pixel size from SVG, PNG, JPEG, GIF and WebP headers.
function dimensions(buffer, ext) {
  if (ext === ".svg") {
    const text = buffer.toString("utf8");
    const attr = (name) => /^\d+(\.\d+)?$/.test(m(text, name) || "") ? Math.round(Number(m(text, name))) : null;
    const w = attr("width"), h = attr("height");
    if (w && h) return { width: w, height: h };
    const viewBox = m(text, "viewBox");
    if (viewBox) {
      const [, , vw, vh] = viewBox.trim().split(/[\s,]+/).map(Number);
      if (vw && vh) return { width: Math.round(vw), height: Math.round(vh) };
    }
    return null;
  }
  if (ext === ".png" && buffer.readUInt32BE(12) === 0x49484452) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (ext === ".gif") return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
  if (ext === ".jpg" || ext === ".jpeg") {
    let offset = 2;
    while (offset < buffer.length) {
      if (buffer[offset] !== 0xff) return null;
      const marker = buffer[offset + 1];
      const length = buffer.readUInt16BE(offset + 2);
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
    return null;
  }
  if (ext === ".webp") {
    const chunk = buffer.toString("ascii", 12, 16);
    if (chunk === "VP8 ") return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
    if (chunk === "VP8L") {
      const bits = buffer.readUInt32LE(21);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    if (chunk === "VP8X") return { width: buffer.readUIntLE(24, 3) + 1, height: buffer.readUIntLE(27, 3) + 1 };
  }
  return null;
}
function m(text, name) {
  const match = new RegExp(`<svg[^>]*\\s${name}=["']([^"']+)["']`).exec(text);
  return match ? match[1] : null;
}

// Components, expanded recursively into declarative shadow DOM.
const components = {};
for (const [tag, path] of Object.entries(manifest.components || {})) {
  const cssPath = path.replace(/\.html$/, ".css");
  components[tag] = { html: read(path), css: existsSync(join(root, cssPath)) ? read(cssPath) : "" };
}
const styleBlock = (tag) => sharedLinkTags + (components[tag].css ? `<style>${components[tag].css}</style>` : "");

const OPEN = /<([a-z][a-z0-9]*-[a-z0-9-]*)(\s[^>]*)?>/g;
const MAX_DEPTH = 20;

function closeOf(html, tag, openEnd) {
  const re = new RegExp(`<(/?)${tag}(?=[\\s>/])[^>]*>`, "g");
  re.lastIndex = openEnd;
  let depth = 1;
  let match;
  while ((match = re.exec(html))) {
    depth += match[1] ? -1 : 1;
    if (depth === 0) return { innerEnd: match.index, outerEnd: re.lastIndex };
  }
  return null;
}

function expand(html, depth = 0) {
  if (depth > MAX_DEPTH) throw new Error("Recursive component templates detected");
  let out = "";
  let cursor = 0;
  const re = new RegExp(OPEN.source, "g");
  let match;
  while ((match = re.exec(html))) {
    const [open, tag] = match;
    if (match.index < cursor || !components[tag]) continue;
    const close = closeOf(html, tag, match.index + open.length);
    if (!close) throw new Error(`Unclosed <${tag}> in page or template`);
    out += html.slice(cursor, match.index) + open;
    out += `<template shadowrootmode="open">${styleBlock(tag)}${expand(components[tag].html, depth + 1)}</template>`;
    out += expand(html.slice(match.index + open.length, close.innerEnd), depth + 1);
    out += html.slice(close.innerEnd, close.outerEnd);
    cursor = close.outerEnd;
    re.lastIndex = cursor;
  }
  return out + html.slice(cursor);
}

// Page metadata: a leading comment of `key: value` lines the editor can own.
function pageMeta(html) {
  const meta = {};
  const match = /^\s*<!--([\s\S]*?)-->\s*/.exec(html);
  if (!match) return { meta, body: html };
  for (const line of match[1].split("\n")) {
    const kv = /^\s*([a-z-]+):\s*(.+?)\s*$/i.exec(line);
    if (kv) meta[kv[1].toLowerCase()] = kv[2];
  }
  return { meta, body: html.slice(match[0].length) };
}
const firstText = (html, tag) =>
  new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`).exec(html)?.[1].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();

const rewriteLinks = (html) =>
  html
    .replace(/(href=["'])#\/([^"']*)/g, "$1/$2")
    .replace(/((?:src|href)=["'])(src\/images\/[^"']+)/g, (_, prefix, source) => prefix + assetUrl(source));

// Marks the nav link for the current route.
const markCurrent = (html, route) =>
  html.replace(/<nav[\s\S]*?<\/nav>/g, (nav) =>
    nav.replace(/<a\b([^>]*)>/g, (tag, attrs) => {
      const href = /\shref=["']([^"']*)["']/.exec(attrs)?.[1];
      return href === route && !/aria-current=/.test(attrs) ? `<a${attrs} aria-current="page">` : tag;
    }),
  );

// Adds width/height from the file, and lazy loading below the first section.
function annotateImages(html) {
  const firstSectionEnd = html.indexOf("</section>");
  return html.replace(/<img\b([^>]*)>/g, (tag, attrs, offset) => {
    const src = /\ssrc=["']([^"']*)["']/.exec(attrs)?.[1];
    const source = [...imageMap].find(([, url]) => url === src)?.[0];
    let extra = "";
    const size = source && imageSize.get(source);
    if (size && !/\swidth=/.test(attrs)) extra += ` width="${size.width}"`;
    if (size && !/\sheight=/.test(attrs)) extra += ` height="${size.height}"`;
    if (firstSectionEnd !== -1 && offset > firstSectionEnd && !/\sloading=/.test(attrs)) extra += ` loading="lazy"`;
    return `<img${attrs}${extra}>`;
  });
}

function document(route, body, meta) {
  const pageTitle = meta.title || firstText(body, "h1") || site.name;
  const title = pageTitle === site.name ? site.name : `${pageTitle} · ${site.name}`;
  const description = meta.description || firstText(body, "p") || site.description || "";
  const canonical = siteUrl + route;
  const image = meta.image || site.image;
  const head = [
    `<meta charset="utf-8">`,
    `<meta name="viewport" content="width=device-width, initial-scale=1">`,
    `<title>${escapeHtml(title)}</title>`,
    `<meta name="description" content="${escapeHtml(description)}">`,
    `<link rel="canonical" href="${escapeHtml(canonical)}">`,
    site.themeColor && `<meta name="theme-color" content="${escapeHtml(site.themeColor)}">`,
    site.favicon && `<link rel="icon" href="${assetUrl(site.favicon)}" type="image/${extname(site.favicon) === ".svg" ? "svg+xml" : extname(site.favicon).slice(1)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="${escapeHtml(site.name)}">`,
    `<meta property="og:title" content="${escapeHtml(pageTitle)}">`,
    `<meta property="og:description" content="${escapeHtml(description)}">`,
    `<meta property="og:url" content="${escapeHtml(canonical)}">`,
    site.locale && `<meta property="og:locale" content="${escapeHtml(site.locale)}">`,
    image && `<meta property="og:image" content="${escapeHtml(siteUrl + assetUrl(image))}">`,
    `<meta name="twitter:card" content="${image ? "summary_large_image" : "summary"}">`,
    ...sharedLinks,
  ].filter(Boolean);
  return `<!doctype html>
<html lang="${escapeHtml((site.locale || "en").split("_")[0])}">
<head>
${head.join("\n")}
</head>
<body>
${body}
</body>
</html>
`;
}

for (const [route, path] of Object.entries(manifest.routes)) {
  if (!route.startsWith("/")) throw new Error(`Route ${route} must start with /`);
  const { meta, body: source } = pageMeta(read(path));
  const body = annotateImages(markCurrent(rewriteLinks(expand(source)), route));
  const dir = join(outDir, route);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), document(route, body, meta));
  console.log(`${route} -> ${join("dist", route, "index.html")}`);
}

// Cache policy for Cloudflare's static assets: hashed files are immutable,
// HTML is always revalidated.
writeFileSync(
  join(outDir, "_headers"),
  `/*
  Cache-Control: max-age=0, must-revalidate
/assets/*
  ! Cache-Control
  Cache-Control: public, max-age=31536000, immutable
`,
);
console.log(`assets -> ${[...imageMap.values()].length} images, ${sharedLinks.length} stylesheets, _headers`);
