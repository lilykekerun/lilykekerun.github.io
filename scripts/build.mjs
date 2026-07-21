import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import config from "../site.config.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const siteRoot = path.resolve(scriptDirectory, "..");
const ignoredDirectories = new Set(config.ignoredDirectories);

function toUrlPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function decodeHtml(value) {
  const named = {
    amp: "&",
    lt: "<",
    gt: ">",
    quot: '"',
    apos: "'",
    nbsp: " "
  };

  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity) => {
    if (entity[0] === "#") {
      const hexadecimal = entity[1]?.toLowerCase() === "x";
      const digits = entity.slice(hexadecimal ? 2 : 1);
      return String.fromCodePoint(Number.parseInt(digits, hexadecimal ? 16 : 10));
    }
    return named[entity.toLowerCase()] ?? match;
  });
}

function textContent(html) {
  return decodeHtml(html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim());
}

function readAttribute(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']*)["']`, "i"));
  return match?.[1] ?? null;
}

function discoverPages(directory = siteRoot) {
  const pages = [];

  function visit(currentDirectory) {
    const indexPath = path.join(currentDirectory, "index.html");
    if (fs.existsSync(indexPath)) {
      pages.push(readPage(indexPath));
    }

    const entries = fs.readdirSync(currentDirectory, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
      if (ignoredDirectories.has(entry.name) || entry.name.startsWith(".")) continue;
      visit(path.join(currentDirectory, entry.name));
    }
  }

  visit(directory);
  return pages;
}

function readPage(filePath) {
  const html = fs.readFileSync(filePath, "utf8");
  const directory = path.dirname(filePath);
  const relativeDirectory = toUrlPath(path.relative(siteRoot, directory));
  const bodyTag = html.match(/<body\b[^>]*>/i)?.[0];
  const headingMatch = html.match(/<h1\b[^>]*\bdata-page-title\b[^>]*>([\s\S]*?)<\/h1>/i);

  if (!bodyTag) throw new Error(`${relativeDirectory || "home"}: missing <body>.`);

  const type = readAttribute(bodyTag, "data-page-type");
  if (!new Set(["home", "folder", "post"]).has(type)) {
    throw new Error(`${relativeDirectory || "home"}: data-page-type must be home, folder, or post.`);
  }
  if (!headingMatch) {
    throw new Error(`${relativeDirectory || "home"}: missing <h1 data-page-title>.`);
  }

  const orderValue = readAttribute(bodyTag, "data-page-order");
  const order = orderValue === null ? Number.POSITIVE_INFINITY : Number(orderValue);
  const date = html.match(/<time\b[^>]*\bdatetime\s*=\s*["']([^"']+)["']/i)?.[1] ?? "";

  if (orderValue !== null && !Number.isFinite(order)) {
    throw new Error(`${relativeDirectory || "home"}: data-page-order must be a number.`);
  }

  return {
    filePath,
    html,
    directory,
    relativeDirectory,
    slug: relativeDirectory ? path.posix.basename(relativeDirectory) : "",
    parentDirectory: relativeDirectory ? normalizeParent(path.posix.dirname(relativeDirectory)) : null,
    type,
    title: textContent(headingMatch[1]),
    order,
    date
  };
}

function normalizeParent(value) {
  return value === "." ? "" : value;
}

function validateTree(pages) {
  const byDirectory = new Map();

  for (const page of pages) {
    if (byDirectory.has(page.relativeDirectory)) {
      throw new Error(`Duplicate page directory: ${page.relativeDirectory || "home"}.`);
    }
    byDirectory.set(page.relativeDirectory, page);
  }

  const home = byDirectory.get("");
  if (!home || home.type !== "home") {
    throw new Error('The root index.html must use data-page-type="home".');
  }

  for (const page of pages) {
    if (!page.relativeDirectory) continue;
    const parent = byDirectory.get(page.parentDirectory);
    if (!parent) {
      throw new Error(`${page.relativeDirectory}: parent index.html is missing.`);
    }
    if (parent.type === "post") {
      throw new Error(`${page.relativeDirectory}: a post cannot contain child pages.`);
    }
  }

  return byDirectory;
}

function childrenOf(page, pages) {
  return pages
    .filter((candidate) => candidate.parentDirectory === page.relativeDirectory)
    .sort((left, right) => {
      if (left.type === "post" && right.type === "post" && left.date !== right.date) {
        return right.date.localeCompare(left.date);
      }
      if (left.order !== right.order) return left.order - right.order;
      return left.slug.localeCompare(right.slug, "en", { numeric: true });
    });
}

function linkFrom(page, targetDirectory) {
  const start = page.relativeDirectory || ".";
  const target = targetDirectory ? `${targetDirectory}/index.html` : "index.html";
  return path.posix.relative(start, target) || "index.html";
}

function renderBreadcrumb(page, byDirectory) {
  if (page.type === "home") {
    return `<p class="breadcrumb">${escapeHtml(config.homeLabel)}</p>`;
  }

  const pieces = [
    `<a href="${escapeHtml(linkFrom(page, ""))}">${escapeHtml(config.homeLabel)}</a>`
  ];
  const segments = page.relativeDirectory.split("/");

  for (let index = 0; index < segments.length; index += 1) {
    const targetDirectory = segments.slice(0, index + 1).join("/");
    const label = segments[index];
    if (!byDirectory.has(targetDirectory)) {
      throw new Error(`${page.relativeDirectory}: breadcrumb target ${targetDirectory} is missing.`);
    }
    pieces.push(
      index === segments.length - 1
        ? escapeHtml(label)
        : `<a href="${escapeHtml(linkFrom(page, targetDirectory))}">${escapeHtml(label)}</a>`
    );
  }

  return `<p class="breadcrumb">${pieces.join(" / ")}</p>`;
}

function formatCount(folder, pages) {
  const children = childrenOf(folder, pages);
  const folders = children.filter((page) => page.type === "folder").length;
  const posts = children.filter((page) => page.type === "post").length;
  const parts = [];

  if (folders) parts.push(formatTypeCount(folders, "folder"));
  if (posts) parts.push(formatTypeCount(posts, "post"));
  return parts.length ? parts.join(" · ") : config.emptyLabel;
}

function formatTypeCount(count, type) {
  const labels = config.labels[type];
  const label = count === 1 ? labels[0] : labels[1];
  return `${String(count).padStart(2, "0")} ${label}`;
}

function formatDateTime(value) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::\d{2})?)?/);
  if (!match) return value;
  const date = `${match[1]}.${match[2]}.${match[3]}`;
  return match[4] ? `${date} ${match[4]}:${match[5]}` : date;
}

function renderFolderGrid(page, folders, pages) {
  const cards = folders.map((folder) => {
    const href = linkFrom(page, folder.relativeDirectory);
    return [
      `  <a class="folder-card" href="${escapeHtml(href)}">`,
      '    <span class="folder-mark" aria-hidden="true"></span>',
      '    <span class="folder-meta">',
      `      <span class="folder-name">${escapeHtml(folder.title)}</span>`,
      `      <span class="folder-count">${escapeHtml(formatCount(folder, pages))}</span>`,
      "    </span>",
      "  </a>"
    ].join("\n");
  });

  return [
    `<nav class="folder-grid" aria-label="${escapeHtml(page.title)} 子文件夹">`,
    cards.join("\n"),
    "</nav>"
  ].join("\n");
}

function renderPostList(page, posts) {
  const rows = posts.map((post) => {
    const href = linkFrom(page, post.relativeDirectory);
    const time = post.date
      ? `\n    <time class="post-date" datetime="${escapeHtml(post.date)}">${escapeHtml(formatDateTime(post.date))}</time>`
      : "";
    return [
      `  <a class="post-row" href="${escapeHtml(href)}">`,
      `    <span class="post-title">${escapeHtml(post.title)}</span>${time}`,
      "  </a>"
    ].join("\n");
  });

  return ["<div class=\"post-list\">", rows.join("\n"), "</div>"].join("\n");
}

function renderChildren(page, pages) {
  const children = childrenOf(page, pages);
  if (!children.length) return `<p class="empty-state">${escapeHtml(config.emptyLabel)}</p>`;

  const folders = children.filter((child) => child.type === "folder");
  const posts = children.filter((child) => child.type === "post");
  const sections = [];
  if (folders.length) sections.push(renderFolderGrid(page, folders, pages));
  if (posts.length) sections.push(renderPostList(page, posts));
  return sections.join("\n");
}

function replaceGeneratedBlock(html, name, content, page) {
  const expression = new RegExp(`([ \\t]*)<!-- AUTO:${name}:START -->[\\s\\S]*?<!-- AUTO:${name}:END -->`);
  const match = html.match(expression);
  if (!match) {
    throw new Error(`${page.relativeDirectory || "home"}: missing AUTO:${name} markers.`);
  }

  const indent = match[1];
  const indentedContent = content.split("\n").map((line) => `${indent}${line}`).join("\n");
  return html.replace(
    expression,
    `${indent}<!-- AUTO:${name}:START -->\n${indentedContent}\n${indent}<!-- AUTO:${name}:END -->`
  );
}

function updateSharedLinks(html, page) {
  const stylesheet = linkFrom(page, "assets").replace(/index\.html$/, "styles.css");
  const themeScript = linkFrom(page, "assets").replace(/index\.html$/, "theme.js");
  const home = linkFrom(page, "");

  return html
    .replace(/(<a\b[^>]*class="site-name"[^>]*href=")[^"]*(")/i, `$1${home}$2`)
    .replace(/href="[^"]*assets\/styles\.css"/i, `href="${stylesheet}"`)
    .replace(/src="[^"]*assets\/theme\.js"/i, `src="${themeScript}"`);
}

function updateBrowserTitle(html, page) {
  const title = page.type === "home"
    ? config.siteName
    : `${page.title}${config.titleSeparator}${config.siteName}`;
  return html.replace(/<title>[\s\S]*?<\/title>/i, `<title>${escapeHtml(title)}</title>`);
}

function updatePageMetadata(html, page) {
  let output = html;

  if (page.type === "folder") {
    const description = `${page.title}${config.titleSeparator}${config.siteName}`;
    output = output.replace(
      /(<meta\b[^>]*name="description"[^>]*content=")[^"]*("[^>]*>)/i,
      `$1${escapeHtml(description)}$2`
    );
  }

  if (page.type === "post" && page.date) {
    output = output.replace(
      /(<time\b[^>]*\bdatetime\s*=\s*["'][^"']+["'][^>]*>)[\s\S]*?<\/time>/i,
      `$1${escapeHtml(formatDateTime(page.date))}</time>`
    );
  }

  return output;
}

function buildPage(page, pages, byDirectory) {
  let output = page.html;
  output = replaceGeneratedBlock(output, "BREADCRUMB", renderBreadcrumb(page, byDirectory), page);

  if (page.type === "home" || page.type === "folder") {
    output = replaceGeneratedBlock(output, "CHILDREN", renderChildren(page, pages), page);
  }

  if (page.type === "post") {
    const parent = byDirectory.get(page.parentDirectory);
    const backlink = `<a href="${escapeHtml(linkFrom(page, parent.relativeDirectory))}">${escapeHtml(config.backPrefix + parent.title)}</a>`;
    output = replaceGeneratedBlock(output, "BACKLINK", backlink, page);
  }

  output = updateSharedLinks(output, page);
  output = updateBrowserTitle(output, page);
  output = updatePageMetadata(output, page);
  return output;
}

function main() {
  const pages = discoverPages();
  const byDirectory = validateTree(pages);
  let changed = 0;

  for (const page of pages) {
    const output = buildPage(page, pages, byDirectory);
    if (output !== page.html) {
      fs.writeFileSync(page.filePath, output, "utf8");
      changed += 1;
    }
  }

  console.log(`Built ${pages.length} pages; updated ${changed}.`);
}

try {
  main();
} catch (error) {
  console.error(`Build failed: ${error.message}`);
  process.exitCode = 1;
}
